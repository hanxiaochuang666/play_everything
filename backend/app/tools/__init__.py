import json
import os

TOOLS_REGISTRY: dict[str, dict] = {}


def register_tool(name: str, description: str, parameters: dict):
    TOOLS_REGISTRY[name] = {
        "type": "function",
        "function": {
            "name": name,
            "description": description,
            "parameters": parameters,
        }
    }


def get_tools_for_openai() -> list[dict]:
    return list(TOOLS_REGISTRY.values())


def get_tools_description() -> str:
    lines = []
    for name, tool in TOOLS_REGISTRY.items():
        desc = tool["function"]["description"]
        params = tool["function"]["parameters"]
        required = params.get("required", [])
        properties = params.get("properties", {})
        param_strs = []
        for pname, pinfo in properties.items():
            req = " *必需" if pname in required else ""
            param_strs.append(f"  {pname}: {pinfo.get('description', '')}{req}")
        lines.append(f"- {name}: {desc}\n" + "\n".join(param_strs))
    return "\n\n".join(lines)
