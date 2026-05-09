import os
from openai import AsyncOpenAI

api_key = os.getenv("MINIMAX_API_KEY", "")
base_url = os.getenv("MINIMAX_BASE_URL", "https://api.minimax.chat/v1")
model = os.getenv("MINIMAX_MODEL", "MiniMax-M1")

client = AsyncOpenAI(api_key=api_key, base_url=base_url)


async def chat_completion(messages: list, tools: list | None = None, max_tokens: int = 4096):
    kwargs = {
        "model": model,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": 0.3,
    }
    if tools:
        kwargs["tools"] = tools
        kwargs["tool_choice"] = "auto"
    return await client.chat.completions.create(**kwargs)
