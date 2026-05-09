import os
import logging
from openai import AsyncOpenAI

logger = logging.getLogger(__name__)

api_key = os.getenv("MINIMAX_API_KEY", "")
base_url = os.getenv("MINIMAX_BASE_URL", "https://api.minimax.chat/v1")
model = os.getenv("MINIMAX_MODEL", "MiniMax-M2.5")

client = AsyncOpenAI(api_key=api_key, base_url=base_url)


async def chat_completion(messages: list, tools: list | None = None, max_tokens: int = 4096):
    if not api_key or api_key == "your-minimax-api-key":
        raise ValueError("MINIMAX_API_KEY 未配置，请在 .env 文件中填写你的 MiniMax API Key")

    kwargs = {
        "model": model,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": 0.3,
    }
    if tools:
        kwargs["tools"] = tools
        kwargs["tool_choice"] = "auto"

    try:
        return await client.chat.completions.create(**kwargs)
    except Exception as e:
        logger.error(f"[LLM] MiniMax API 调用失败: {e}")
        raise
