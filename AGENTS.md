# AGENTS.md

## Project Overview

AI Virtual Studio — a 2D virtual office game with an AI agent that executes real tasks (write code, run commands, produce files) inside Docker sandboxes. Single-agent MVP; multi-agent planned later.

## Architecture

```
frontend/ (static HTML+JS, served by nginx:alpine)
  ↕ SSE + REST (proxied through nginx)
backend/ (Python FastAPI)
  ↕ Docker socket (creates sandbox containers per task)
sandbox/ (Docker image: python+node, per-task isolated containers)
```

- **Frontend**: No build step. Vanilla HTML+JS served directly by nginx via volume mount. Changes to `frontend/js/*.js` are live on browser refresh.
- **Backend**: FastAPI with in-memory SQLite (docker-compose overrides to `:memory:`). Uvicorn with `--reload`.
- **Sandbox**: Each task spawns a `ai-sandbox:latest` container with `/workspace` volume mount. Container destroyed after task completes.

## Key Commands

```bash
# Build sandbox image (must do before first run)
docker build --tag ai-sandbox:latest -f sandbox/Dockerfile sandbox

# Start all services
docker compose up -d

# Rebuild backend after code changes (must use --force-recreate to reload .env)
docker compose up -d --build --force-recreate backend

# Restart frontend (rarely needed — static files are volume-mounted)
docker compose restart frontend

# View backend logs
docker logs ai-studio-backend --tail 50

# Test backend health
curl http://localhost:8000/health
```

## Critical Gotchas

### `docker compose restart` does NOT reload `.env` changes
After editing `.env`, you MUST use `--force-recreate`:
```bash
docker compose up -d --force-recreate backend
```
Plain `docker compose restart backend` keeps old env vars cached in the container.

### SSE events use `sse_manager.broadcast()`, not direct queue writes
The agent engine must call `sse_manager.broadcast(task_id, event)` to send events. The SSE endpoint (`api/sse.py`) subscribes its own queue via `sse_manager.subscribe()`. Writing to a local `asyncio.Queue` will NOT reach the frontend — this was a previous bug.

### MiniMax API uses OpenAI-compatible endpoint
- Base URL: `https://api.minimax.chat/v1` (NOT `https://api.minimaxi.com/anthropic`)
- Model: `MiniMax-M2.5`
- SDK: `openai` Python package with custom `base_url`
- The Anthropic-compatible endpoint does NOT support standard `tool_use` — it returns XML tags instead of structured tool calls.

### SQLite in Docker
- docker-compose overrides `DATABASE_URL` to `sqlite+aiosqlite:///:memory:` — data lost on restart.
- File-based SQLite (`sqlite+aiosqlite:///./data/app.db`) fails inside the container due to volume mount permission issues on Windows. Use `:memory:` for now.

### Artifacts must be saved to DB before SSE complete event
`agent_engine.py` calls `_save_artifacts_to_db()` before emitting the `complete` event. The artifact records get their `id` from the DB flush, which the frontend needs for download URLs. If you skip this, `/api/artifacts/{id}/download` returns 404.

## Tech Stack

- Backend: Python 3.12, FastAPI, SQLAlchemy async, aiosqlite, openai SDK, docker-py
- Frontend: Vanilla HTML5 + JS, SSE (EventSource), TailwindCSS CDN
- LLM: MiniMax M2.5 via OpenAI-compatible API
- Sandbox: Docker containers (python:3.12-slim + nodejs + npm)

## File Map

| Path | Purpose |
|------|---------|
| `backend/app/services/agent_engine.py` | ReAct loop — orchestrates LLM calls, tool execution, SSE events |
| `backend/app/services/llm_client.py` | OpenAI SDK wrapper for MiniMax |
| `backend/app/services/sandbox.py` | Docker container lifecycle (create/exec/destroy) |
| `backend/app/services/sse_manager.py` | Pub/sub for SSE — broadcast to all subscribers |
| `backend/app/api/tasks.py` | Task CRUD + background execution |
| `backend/app/api/sse.py` | SSE streaming endpoint |
| `backend/app/api/artifacts.py` | File download |
| `backend/app/tools/register_tools.py` | Tool definitions (OpenAI function calling format) |
| `frontend/js/chat.js` | Main chat UI — sends tasks, renders SSE events |
| `frontend/js/sse.js` | EventSource wrapper with event type routing |

## Environment Variables

Copy `.env.example` to `.env` and set `MINIMAX_API_KEY`. Other vars have working defaults. See `.env.example` for full list.

## Ports

- Frontend: http://localhost:3000 (nginx)
- Backend API: http://localhost:8000 (direct access for debugging)
