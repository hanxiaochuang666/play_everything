"""AI虚拟开发助理 - FastAPI 主入口"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import init_db
from app.api.tasks import router as tasks_router
from app.api.artifacts import router as artifacts_router
from app.api.sse import router as sse_router
from app.tools.register_tools import register_all_tools


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    register_all_tools()
    print("[INFO] 数据库已初始化，工具已注册")
    yield


app = FastAPI(
    title="AI虚拟开发助理",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(tasks_router)
app.include_router(artifacts_router)
app.include_router(sse_router)


@app.get("/health")
async def health():
    return {"status": "ok"}
