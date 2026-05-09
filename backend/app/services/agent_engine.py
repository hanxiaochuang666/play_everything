import json
import asyncio
import os
from datetime import datetime

from app.models.task_log import TaskLog
from app.services.sandbox import SandboxManager
from app.services.llm_client import chat_completion
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

可用工具:
""" + get_tools_description()


async def run_agent(task, event_queue: asyncio.Queue, db_session_factory):
    sandbox = SandboxManager()
    sandbox_id = None

    try:
        await event_queue.put({
            "event": "status",
            "data": json.dumps({"status": "creating_sandbox", "message": "正在创建沙箱环境..."}),
        })

        sandbox_id, workspace_path = await sandbox.create(task.id)
        task.sandbox_id = sandbox_id
        task.workspace_path = workspace_path

        await event_queue.put({
            "event": "status",
            "data": json.dumps({"status": "planning", "message": "正在分析任务..."}),
        })
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
                    timeout=60,
                )
            except asyncio.TimeoutError:
                await event_queue.put({
                    "event": "error",
                    "data": json.dumps({"error": "LLM响应超时"}),
                })
                task.status = "failed"
                task.error_message = "LLM响应超时"
                return

            choice = response.choices[0]

            if choice.finish_reason == "stop" and not choice.message.tool_calls:
                msg = choice.message.content or ""
                task.result_summary = msg[:500]
                task.status = "completed"
                task.completed_at = datetime.utcnow()

                await event_queue.put({
                    "event": "status",
                    "data": json.dumps({"status": "copying_artifacts", "message": "正在提取产物文件..."}),
                })

                artifacts_data = await sandbox.copy_artifacts(task.id, sandbox_id, ARTIFACTS_DIR)
                await event_queue.put({
                    "event": "complete",
                    "data": json.dumps({
                        "status": "completed",
                        "summary": msg[:500],
                        "artifacts": artifacts_data,
                    }),
                })
                return

            if choice.message.tool_calls:
                if task.status != "executing":
                    task.status = "executing"

                for tc in choice.message.tool_calls:
                    func_name = tc.function.name
                    func_args = json.loads(tc.function.arguments)

                    tool_input = json.dumps(func_args, ensure_ascii=False)
                    await event_queue.put({
                        "event": "log",
                        "data": json.dumps({
                            "seq": step,
                            "type": "tool_call",
                            "content": {"tool": func_name, "input": tool_input[:500]},
                        }),
                    })

                    if func_name == "task_complete":
                        task.result_summary = func_args.get("summary", "")[:500]
                        task.status = "completed"
                        task.completed_at = datetime.utcnow()

                        await event_queue.put({
                            "event": "status",
                            "data": json.dumps({"status": "copying_artifacts", "message": "正在提取产物文件..."}),
                        })

                        artifacts_data = await sandbox.copy_artifacts(task.id, sandbox_id, ARTIFACTS_DIR)
                        await event_queue.put({
                            "event": "complete",
                            "data": json.dumps({
                                "status": "completed",
                                "summary": func_args.get("summary", ""),
                                "artifacts": artifacts_data,
                            }),
                        })
                        return

                    result = await _execute_tool(sandbox, sandbox_id, func_name, func_args)
                    result_str = json.dumps(result, ensure_ascii=False)[:1000]

                    await event_queue.put({
                        "event": "log",
                        "data": json.dumps({
                            "seq": step,
                            "type": "tool_result",
                            "content": {"tool": func_name, "output": result_str[:500]},
                        }),
                    })

                    messages.append({
                        "role": "assistant",
                        "content": None,
                        "tool_calls": [tc.model_dump()],
                    })
                    messages.append({
                        "role": "tool",
                        "tool_call_id": tc.id,
                        "content": result_str,
                    })

                    step += 1

        task.status = "failed"
        task.error_message = f"超过最大步骤数 {AGENT_MAX_STEPS}"
        await event_queue.put({
            "event": "error",
            "data": json.dumps({"status": "failed", "error": task.error_message}),
        })

    except Exception as e:
        task.status = "failed"
        task.error_message = str(e)[:500]
        await event_queue.put({
            "event": "error",
            "data": json.dumps({"status": "failed", "error": str(e)[:500]}),
        })

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
        content = await sandbox.read_file(
            sandbox_id,
            args.get("path", ""),
            args.get("offset", 0),
            args.get("limit", 2000),
        )
        return {"content": content[:2000]}
    elif tool_name == "list_files":
        files = await sandbox.list_files(sandbox_id, args.get("path", "/workspace"))
        return {"files": files[:100]}
    elif tool_name == "web_search":
        return {"error": "Web搜索在MVP阶段未启用，请使用其他方式获取信息"}
    else:
        return {"error": f"未知工具: {tool_name}"}
