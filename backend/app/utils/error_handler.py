import asyncio

RETRYABLE_ERRORS = ["timeout", "rate_limit", "connection", "internal_error"]


async def with_retry(func, max_retries: int = 3, base_delay: float = 2.0):
    last_error = None
    for attempt in range(max_retries + 1):
        try:
            return await func()
        except Exception as e:
            last_error = e
            if attempt < max_retries:
                err_str = str(e).lower()
                is_retryable = any(key in err_str for key in RETRYABLE_ERRORS)
                if not is_retryable:
                    raise
                delay = base_delay ** attempt
                await asyncio.sleep(delay)
    raise last_error
