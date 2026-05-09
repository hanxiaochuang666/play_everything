import json
import asyncio
import os
from datetime import datetime

from app.services.sandbox import SandboxManager
from app.services.llm_client import chat_completion
from app.services.sse_manager import sse_manager
from app.tools import get_tools_for_openai, get_tools_description

AGENT_MAX_STEPS = int(os.getenv("AGENT_MAX_STEPS", "30"))
AGENT_TIMEOUT = int(os.getenv("AGENT_TIMEOUT_SECONDS", "600"))
ARTIFACTS_DIR = os.getenv("ARTIFACTS_DIR", "./data/artifacts")


SYSTEM_PROMPT = """你是一个高级软件工程师，在Docker沙箱中工作。
工作目录: /workspace

规则:
1. 接收任务后先规划，把复杂任务拆成小步骤
2. 每写一个文件就测试验证，不要一口气写完所有再测
3. 遇到错误时: 读取错误日志 -> 分析原因 -> 修复 -> 重试(最多3次)
4. 文件路径统一用 /workspace/ 开头
5. 完成任务后必须调用 task_complete 工具，总结完成的工作并列出所有产出文件
6. 写文件前先确认目录结构合理
7. 命令执行前检查依赖是否已安装
8. 你必须使用工具来执行操作，不要只输出代码文本

可用工具:
""" + get_tools_description() + """

工具调用示例:
- 创建文件: write_file(path="/workspace/hello.py", content="print('hello')")
- 执行命令: execute_command(command="python /workspace/hello.py")
- 读取文件: read_file(path="/workspace/hello.py")
- 列出文件: list_files(path="/workspace")
- 完成任务: task_complete(summary="任务完成描述")
"""


async def _emit(task_id: str, event_type: str, data: dict):
    await sse_manager.broadcast(task_id, {
        "event": event_type,
        "data": json.dumps(data, ensure_ascii=False),
    })


async def _save_artifacts_to_db(task_id: str, artifacts_base_dir: str, db_session_factory):
    from app.models.artifact import Artifact
    from pathlib import Path

    artifacts_dir = Path(artifacts_base_dir) / task_id
    if not artifacts_dir.exists():
        return []

    async with db_session_factory() as db:
        ids = []
        for f in artifacts_dir.rglob("*"):
            if f.is_file() and not f.name.startswith("."):
                rel = f.relative_to(artifacts_dir)
                art = Artifact(
                    task_id=task_id,
                    file_name=f.name,
                    file_path=f"/workspace/{rel.as_posix()}",
                    file_size=f.stat().st_size,
                )
                db.add(art)
                await db.flush()
                ids.append({"id": art.id, "file_name": f.name, "file_path": f"/workspace/{rel.as_posix()}", "file_size": f.stat().st_size})
        await db.commit()
        return ids


async def run_agent(task, db_session_factory):
    sandbox = SandboxManager()
    sandbox_id = None
    task_id = task.id

    try:
        await _emit(task_id, "status", {"status": "creating_sandbox", "message": "正在创建沙箱环境..."})

        sandbox_id, workspace_path = await sandbox.create(task_id)
        task.sandbox_id = sandbox_id
        task.workspace_path = workspace_path

        await _emit(task_id, "status", {"status": "planning", "message": "正在分析任务..."})
        task.status = "planning"

        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": task.instruction},
        ]

        tools = get_tools_for_openai()
        step = 0

        while step < AGENT_MAX_STEPS:
            try:
                response = await asyncio.wait_for(
                    chat_completion(messages, tools=tools),
                    timeout=120,
                )
            except asyncio.TimeoutError:
                task.status = "failed"
                task.error_message = "LLM响应超时"
                await _emit(task_id, "error", {"status": "failed", "error": "LLM响应超时"})
                return

            choice = response.choices[0]
            assistant_msg = choice.message

            if choice.finish_reason == "stop" and not assistant_msg.tool_calls:
                msg = assistant_msg.content or ""
                task.result_summary = msg[:500]
                task.status = "completed"
                task.completed_at = datetime.utcnow()

                await _emit(task_id, "status", {"status": "copying_artifacts", "message": "正在提取产物文件..."})

                await sandbox.copy_artifacts(task_id, sandbox_id, ARTIFACTS_DIR)
                artifacts_data = await _save_artifacts_to_db(task_id, ARTIFACTS_DIR, db_session_factory)
                await _emit(task_id, "complete", {"status": "completed", "summary": msg[:500], "artifacts": artifacts_data})
                return

            if assistant_msg.tool_calls:
                if task.status != "executing":
                    task.status = "executing"

                messages.append(assistant_msg.model_dump())

                for tc in assistant_msg.tool_calls:
                    func_name = tc.function.name
                    func_args = json.loads(tc.function.arguments)

                    tool_input = json.dumps(func_args, ensure_ascii=False)
                    await _emit(task_id, "log", {"seq": step, "type": "tool_call", "content": {"tool": func_name, "input": tool_input[:500]}})

                    if func_name == "task_complete":
                        task.result_summary = func_args.get("summary", "")[:500]
                        task.status = "completed"
                        task.completed_at = datetime.utcnow()

                        await _emit(task_id, "status", {"status": "copying_artifacts", "message": "正在提取产物文件..."})

                        await sandbox.copy_artifacts(task_id, sandbox_id, ARTIFACTS_DIR)
                        artifacts_data = await _save_artifacts_to_db(task_id, ARTIFACTS_DIR, db_session_factory)
                        await _emit(task_id, "complete", {"status": "completed", "summary": func_args.get("summary", ""), "artifacts": artifacts_data})
                        return

                    result = await _execute_tool(sandbox, sandbox_id, func_name, func_args)
                    result_str = json.dumps(result, ensure_ascii=False)[:1000]

                    await _emit(task_id, "log", {"seq": step, "type": "tool_result", "content": {"tool": func_name, "output": result_str[:500]}})

                    messages.append({"role": "tool", "tool_call_id": tc.id, "content": result_str})
                    step += 1

        task.status = "failed"
        task.error_message = f"超过最大步骤数 {AGENT_MAX_STEPS}"
        await _emit(task_id, "error", {"status": "failed", "error": task.error_message})

    except Exception as e:
        task.status = "failed"
        task.error_message = str(e)[:500]
        await _emit(task_id, "error", {"status": "failed", "error": str(e)[:500]})

    finally:
        if sandbox_id:
            try:
                await sandbox.destroy(sandbox_id)
            except Exception:
                pass


async def _execute_tool(sandbox: SandboxManager, sandbox_id: str, tool_name: str, args: dict):
    if tool_name == "execute_command":
        return await sandbox.execute(sandbox_id, args.get("command", ""))
    elif tool_name == "write_file":
        ok = await sandbox.write_file(sandbox_id, args.get("path", ""), args.get("content", ""))
        return {"success": ok, "message": "文件已写入" if ok else "写入失败"}
    elif tool_name == "read_file":
        content = await sandbox.read_file(sandbox_id, args.get("path", ""), args.get("offset", 0), args.get("limit", 2000))
        return {"content": content[:2000]}
    elif tool_name == "list_files":
        files = await sandbox.list_files(sandbox_id, args.get("path", "/workspace"))
        return {"files": files[:100]}
    elif tool_name == "web_search":
        return {"error": "Web搜索在MVP阶段未启用，请使用其他方式获取信息"}
    else:
        return {"error": f"未知工具: {tool_name}"}
