from app.tools import register_tool

def register_all_tools():
    register_tool(
        "execute_command",
        "在沙箱内执行shell命令，超时30秒。用于运行代码、安装依赖、测试等",
        {
            "type": "object",
            "properties": {
                "command": {"type": "string", "description": "要执行的shell命令"},
            },
            "required": ["command"],
        },
    )

    register_tool(
        "write_file",
        "在沙箱工作目录创建或覆盖文件。路径以 /workspace/ 开头",
        {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "文件完整路径，如 /workspace/src/main.py"},
                "content": {"type": "string", "description": "文件内容"},
            },
            "required": ["path", "content"],
        },
    )

    register_tool(
        "read_file",
        "读取沙箱文件内容。支持分页读取，用offset和limit控制范围",
        {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "文件完整路径"},
                "offset": {"type": "integer", "description": "起始行号，默认0"},
                "limit": {"type": "integer", "description": "读取行数，默认2000"},
            },
            "required": ["path"],
        },
    )

    register_tool(
        "list_files",
        "列出沙箱内目录结构",
        {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "目录路径，默认 /workspace"},
            },
            "required": [],
        },
    )

    register_tool(
        "web_search",
        "搜索网页获取信息（MVP阶段未启用）",
        {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "搜索关键词"},
            },
            "required": ["query"],
        },
    )

    register_tool(
        "task_complete",
        "标记任务完成。必须调用此工具来结束任务，列出所有产出文件",
        {
            "type": "object",
            "properties": {
                "summary": {"type": "string", "description": "任务完成总结"},
                "artifacts": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "产出文件列表",
                },
            },
            "required": ["summary"],
        },
    )
