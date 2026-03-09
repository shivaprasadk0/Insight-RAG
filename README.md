# Insight_RAG Project Structure

## Layout

```
Insight_RAG/
  backend/          # FastAPI + SQL/RAG backend
  frontend/         # React/Vite frontend
  scripts/
    run_backend.cmd
    run_frontend.cmd
  run_backend.cmd   # wrapper
  run_frontend.cmd  # wrapper
```

## Run Commands

From `Insight_RAG`:

- Backend: `.\run_backend.cmd`
- Frontend: `.\run_frontend.cmd`

## Notes

- Backend script auto-detects Python at:
  - `.\venv\Scripts\python.exe` (project venv)
  - `..\venv\Scripts\python.exe` (parent-level fallback venv)
