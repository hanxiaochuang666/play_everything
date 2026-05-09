import json
import os
import shutil
import asyncio
import re
from datetime import datetime
from pathlib import Path

import docker
from docker.errors import NotFound, APIError


SANDBOX_IMAGE = os.getenv("SANDBOX_IMAGE", "ai-sandbox:latest")
WORKSPACE_BASE = os.getenv("SANDBOX_WORKSPACE_DIR", "/tmp/sandbox-workspaces")
CPU_LIMIT = int(os.getenv("SANDBOX_CPU_LIMIT", "1"))
MEM_LIMIT = os.getenv("SANDBOX_MEMORY_LIMIT", "512m")
PIDS_LIMIT = int(os.getenv("SANDBOX_PIDS_LIMIT", "50"))
CMD_TIMEOUT = int(os.getenv("COMMAND_TIMEOUT_SECONDS", "30"))

FORBIDDEN_PATTERNS = [
    r"rm\s+-rf\s+/[^w]",
    r"mkfs\.",
    r"dd\s+if=",
    r">\s*/dev/sd",
    r"chmod\s+777\s+/",
    r"mount\s",
    r"umount\s",
    r"fdisk\s",
    r"shutdown\s",
    r"reboot\s",
    r"init\s+[0-6]",
]


class SandboxManager:
    def __init__(self):
        self.client = docker.from_env()
        Path(WORKSPACE_BASE).mkdir(parents=True, exist_ok=True)

    def check_command(self, command: str) -> bool:
        for pattern in FORBIDDEN_PATTERNS:
            if re.search(pattern, command, re.IGNORECASE):
                return False
        return True

    async def create(self, task_id: str) -> tuple[str, str]:
        container_name = f"sandbox-{task_id[:8]}"
        host_workspace = Path(WORKSPACE_BASE) / task_id
        host_workspace.mkdir(parents=True, exist_ok=True)

        def _run():
            try:
                old = self.client.containers.get(container_name)
                old.remove(force=True)
            except NotFound:
                pass

            container = self.client.containers.run(
                SANDBOX_IMAGE,
                name=container_name,
                detach=True,
                remove=False,
                cpu_count=CPU_LIMIT,
                mem_limit=MEM_LIMIT,
                pids_limit=PIDS_LIMIT,
                network_mode="none",
                volumes={str(host_workspace.absolute()): {"bind": "/workspace", "mode": "rw"}},
            )
            return container.id

        container_id = await asyncio.to_thread(_run)
        return container_id, str(host_workspace)

    async def execute(self, container_name: str, command: str) -> dict:
        if not self.check_command(command):
            return {"exit_code": -1, "stdout": "", "stderr": "[BLOCKED] 命令被安全策略拦截"}

        def _exec():
            try:
                container = self.client.containers.get(container_name)
                exec_result = container.exec_run(
                    command,
                    user="sandbox",
                    workdir="/workspace",
                )
                return {
                    "exit_code": exec_result.exit_code,
                    "stdout": exec_result.output.decode("utf-8", errors="replace")[:3000],
                    "stderr": "",
                }
            except APIError as e:
                return {"exit_code": -1, "stdout": "", "stderr": str(e)[:500]}

        try:
            return await asyncio.wait_for(asyncio.to_thread(_exec), timeout=CMD_TIMEOUT)
        except asyncio.TimeoutError:
            return {"exit_code": -1, "stdout": "", "stderr": "命令执行超时"}

    async def write_file(self, container_name: str, file_path: str, content: str) -> bool:
        container = self.client.containers.get(container_name)
        mounts = container.attrs.get("Mounts", [])
        host_workspace = None
        for m in mounts:
            if m.get("Destination") == "/workspace":
                host_workspace = m.get("Source")
                break

        if not host_workspace:
            return False

        full_path = Path(host_workspace) / file_path.lstrip("/workspace/").lstrip("/")
        full_path.parent.mkdir(parents=True, exist_ok=True)

        def _write():
            full_path.write_text(content, encoding="utf-8")

        await asyncio.to_thread(_write)
        return True

    async def read_file(self, container_name: str, file_path: str, offset: int = 0, limit: int = 2000) -> str:
        container = self.client.containers.get(container_name)
        mounts = container.attrs.get("Mounts", [])
        host_workspace = None
        for m in mounts:
            if m.get("Destination") == "/workspace":
                host_workspace = m.get("Source")
                break

        if not host_workspace:
            return "[ERROR] 找不到工作目录"

        full_path = Path(host_workspace) / file_path.lstrip("/workspace/").lstrip("/")

        def _read():
            if not full_path.exists():
                return f"[ERROR] 文件不存在: {file_path}"
            lines = full_path.read_text(encoding="utf-8", errors="replace").splitlines()
            selected = lines[offset:offset + limit]
            return "\n".join(selected)

        return await asyncio.to_thread(_read)

    async def list_files(self, container_name: str, path: str = "/workspace") -> list:
        container = self.client.containers.get(container_name)
        mounts = container.attrs.get("Mounts", [])
        host_workspace = None
        for m in mounts:
            if m.get("Destination") == "/workspace":
                host_workspace = m.get("Source")
                break

        if not host_workspace:
            return []

        search_path = Path(host_workspace)
        rel = path.lstrip("/workspace/").lstrip("/")
        if rel and rel != ".":
            search_path = search_path / rel

        def _list():
            if not search_path.exists():
                return []
            results = []
            for p in search_path.rglob("*"):
                rel_path = "/workspace/" + str(p.relative_to(Path(host_workspace))).replace("\\", "/")
                results.append({
                    "name": p.name,
                    "path": rel_path,
                    "is_dir": p.is_dir(),
                    "size": p.stat().st_size if p.is_file() else 0,
                })
            return sorted(results, key=lambda x: (not x["is_dir"], x["name"]))[:200]

        return await asyncio.to_thread(_list)

    async def destroy(self, container_name: str):
        def _destroy():
            try:
                container = self.client.containers.get(container_name)
                container.remove(force=True)
            except NotFound:
                pass

        await asyncio.to_thread(_destroy)

    async def copy_artifacts(self, task_id: str, container_name: str, artifacts_dir: str) -> list[dict]:
        container = self.client.containers.get(container_name)
        mounts = container.attrs.get("Mounts", [])
        host_workspace = None
        for m in mounts:
            if m.get("Destination") == "/workspace":
                host_workspace = m.get("Source")
                break

        if not host_workspace:
            return []

        dest = Path(artifacts_dir) / task_id
        dest.mkdir(parents=True, exist_ok=True)

        def _copy():
            results = []
            ws = Path(host_workspace)
            for f in ws.rglob("*"):
                if f.is_file() and not f.name.startswith("."):
                    rel = f.relative_to(ws)
                    target = dest / rel
                    target.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(f, target)
                    results.append({
                        "file_name": f.name,
                        "file_path": f"/workspace/{rel.as_posix()}",
                        "file_size": f.stat().st_size,
                    })
            return results

        return await asyncio.to_thread(_copy)
