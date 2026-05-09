import asyncio
import json


class SSEManager:
    def __init__(self):
        self._queues: dict[str, list[asyncio.Queue]] = {}

    def subscribe(self, task_id: str) -> asyncio.Queue:
        q = asyncio.Queue()
        if task_id not in self._queues:
            self._queues[task_id] = []
        self._queues[task_id].append(q)
        return q

    def unsubscribe(self, task_id: str, queue: asyncio.Queue):
        if task_id in self._queues:
            self._queues[task_id] = [q for q in self._queues[task_id] if q is not queue]
            if not self._queues[task_id]:
                del self._queues[task_id]

    async def broadcast(self, task_id: str, event: dict):
        if task_id in self._queues:
            dead = []
            for q in self._queues[task_id]:
                try:
                    q.put_nowait(event)
                except asyncio.QueueFull:
                    dead.append(q)
            for q in dead:
                self._queues[task_id].remove(q)


sse_manager = SSEManager()
