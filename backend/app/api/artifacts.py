import os
from pathlib import Path
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.config import get_session

router = APIRouter(prefix="/api/artifacts", tags=["artifacts"])

ARTIFACTS_DIR = os.getenv("ARTIFACTS_DIR", "./data/artifacts")


@router.get("/{artifact_id}/download")
async def download_artifact(artifact_id: str):
    from sqlalchemy import select
    from app.models.artifact import Artifact
    from app.config import async_session

    async with async_session() as db:
        result = await db.execute(select(Artifact).where(Artifact.id == artifact_id))
        artifact = result.scalar_one_or_none()
        if not artifact:
            raise HTTPException(status_code=404, detail="文件不存在")

        file_path = artifact.file_path
        task_id = artifact.task_id
        rel = file_path.lstrip("/workspace/").lstrip("/")
        local_path = Path(ARTIFACTS_DIR) / task_id / rel

        if not local_path.exists():
            raise HTTPException(status_code=404, detail="文件已被清理")

        return FileResponse(
            path=str(local_path),
            filename=artifact.file_name,
            media_type=artifact.mime_type or "application/octet-stream",
        )
