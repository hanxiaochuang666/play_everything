import json
import asyncio
import os
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from app.config import get_session
from app.models.task import Task
from app.models.task_log import TaskLog
from app.models.artifact import Artifact
from app.services.agent_engine import run_agent
from app.services.sse_manager import sse_manager


router = APIRouter(prefix="/api/tasks", tags=["tasks"])


class TaskCreate(BaseModel):
    instruction: str
    user_id: str = "default"


class TaskOut(BaseModel):
    id: str
    title: str | None
    instruction: str
    status: str
    step_current: int
    step_total: int
    result_summary: str | None
    error_message: str | None
    created_at: datetime | None
    completed_at: datetime | None


def _extract_title(instruction: str) -> str:
    words = instruction.strip().replace("\n", " ")
    return words[:40] + ("..." if len(words) > 40 else "")


@router.post("", response_model=TaskOut)
async def create_task(data: TaskCreate, background_tasks: BackgroundTasks, db: AsyncSession = Depends(get_session)):
    task = Task(
        user_id=data.user_id,
        instruction=data.instruction,
        title=_extract_title(data.instruction),
        status="pending",
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)

    background_tasks.add_task(_execute_task_bg, task.id, data.instruction)

    return TaskOut(
        id=task.id,
        title=task.title,
        instruction=task.instruction,
        status=task.status,
        step_current=task.step_current,
        step_total=task.step_total,
        result_summary=task.result_summary,
        error_message=task.error_message,
        created_at=task.created_at,
        completed_at=task.completed_at,
    )


@router.get("", response_model=list[TaskOut])
async def list_tasks(db: AsyncSession = Depends(get_session)):
    from sqlalchemy import select, desc
    result = await db.execute(select(Task).order_by(desc(Task.created_at)).limit(50))
    tasks = result.scalars().all()
    return [
        TaskOut(
            id=t.id,
            title=t.title,
            instruction=t.instruction,
            status=t.status,
            step_current=t.step_current,
            step_total=t.step_total,
            result_summary=t.result_summary,
            error_message=t.error_message,
            created_at=t.created_at,
            completed_at=t.completed_at,
        )
        for t in tasks
    ]


@router.get("/{task_id}", response_model=TaskOut)
async def get_task(task_id: str, db: AsyncSession = Depends(get_session)):
    from sqlalchemy import select
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    return TaskOut(
        id=task.id,
        title=task.title,
        instruction=task.instruction,
        status=task.status,
        step_current=task.step_current,
        step_total=task.step_total,
        result_summary=task.result_summary,
        error_message=task.error_message,
        created_at=task.created_at,
        completed_at=task.completed_at,
    )


@router.post("/{task_id}/cancel")
async def cancel_task(task_id: str, db: AsyncSession = Depends(get_session)):
    from sqlalchemy import select
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    if task.status in ("completed", "failed", "cancelled"):
        return {"ok": False, "message": f"任务已结束: {task.status}"}
    task.status = "cancelled"
    await db.commit()
    await sse_manager.broadcast(task_id, {
        "event": "error",
        "data": json.dumps({"status": "cancelled", "error": "用户取消任务"}),
    })
    return {"ok": True}


@router.get("/{task_id}/artifacts")
async def list_artifacts(task_id: str, db: AsyncSession = Depends(get_session)):
    from sqlalchemy import select
    result = await db.execute(select(Artifact).where(Artifact.task_id == task_id))
    artifacts = result.scalars().all()
    return [{"id": a.id, "file_name": a.file_name, "file_path": a.file_path, "file_size": a.file_size} for a in artifacts]


async def _execute_task_bg(task_id: str, instruction: str):
    from app.config import async_session, engine
    from sqlalchemy.ext.asyncio import AsyncSession

    async with async_session() as db:
        from sqlalchemy import select
        result = await db.execute(select(Task).where(Task.id == task_id))
        task = result.scalar_one_or_none()
        if not task:
            return

        event_queue = sse_manager.subscribe(task_id)

        try:
            await run_agent(task, event_queue, async_session)
        except Exception as e:
            task.status = "failed"
            task.error_message = str(e)[:500]

        await db.commit()
        sse_manager.unsubscribe(task_id, event_queue)
