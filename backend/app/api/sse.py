import json
import asyncio
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from app.services.sse_manager import sse_manager

router = APIRouter(prefix="/api/tasks", tags=["sse"])


@router.get("/{task_id}/stream")
async def task_stream(task_id: str, request: Request):
    queue = sse_manager.subscribe(task_id)

    async def event_generator():
        try:
            while True:
                if await request.is_disconnected():
                    break

                try:
                    event = await asyncio.wait_for(queue.get(), timeout=30)
                    evt_type = event.get("event", "message")
                    evt_data = event.get("data", "")
                    yield f"event: {evt_type}\ndata: {evt_data}\n\n"

                    if evt_type in ("complete", "error"):
                        break
                except asyncio.TimeoutError:
                    yield ": ping\n\n"
        finally:
            sse_manager.unsubscribe(task_id, queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
