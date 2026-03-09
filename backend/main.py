# main.py
"""
Application orchestration entry point.

Responsibilities
----------------
1. Load environment configuration.
2. Initialise all service clients (MySQL, OpenAI).
3. Wire services into the FastAPI app (api_server).
4. Start the Uvicorn ASGI server.
"""

import os
from pathlib import Path
import uvicorn
from dotenv import load_dotenv

from openai_calls import OpenAIManager
import cosmos_utils
import api_server

ROOT_ENV_PATH = Path(__file__).resolve().parents[1] / ".env"
if ROOT_ENV_PATH.exists():
    load_dotenv(ROOT_ENV_PATH)
else:
    load_dotenv(".env")


def _first_available(*keys: str, default: str = "") -> str:
    for key in keys:
        val = os.getenv(key)
        if val:
            return val
    return default


CONFIG = {
    "openai": {
        "base_url": os.getenv("OPENAI_BASE_URL") or os.getenv("HF_BASE_URL") or "https://generativelanguage.googleapis.com/v1beta/openai/",
        "key": _first_available("OPENAI_API_KEY", "CLOUD_API_KEY", "HF_API_KEY", "AZURE_OPENAI_KEY", default="local-dev-key"),
        "model": (
            os.getenv("OPENAI_MODEL")
            or os.getenv("HF_MODEL")
            or os.getenv("AZURE_OPENAI_MODEL_NAME")
            or "gemini-2.5-flash"
        ),
        "version": os.getenv("OPENAI_API_VERSION") or os.getenv("AZURE_OPENAI_API_VERSION"),
    },
    "mysql": {
        "host": os.getenv("DB_HOST", "localhost"),
        "port": os.getenv("DB_PORT", "3306"),
        "user": os.getenv("DB_USER", "root"),
        "password": os.getenv("DB_PASSWORD", ""),
        "database_name": os.getenv("DB_NAME", "hotel_db"),
        "sessions_table": os.getenv("DB_SESSIONS_TABLE", "legacy_sessions"),
        "legacy_logs_table": os.getenv("DB_LEGACY_LOGS_TABLE", "legacy_logs"),
        "users_table": os.getenv("DB_USERS_TABLE", "users"),
        "chats_table": os.getenv("DB_CHATS_TABLE", "chats"),
        "messages_table": os.getenv("DB_MESSAGES_TABLE", "messages"),
        "logs_table": os.getenv("DB_LOGS_TABLE", "logs"),
    },
}

openai_mgr = OpenAIManager(
    base_url=CONFIG["openai"]["base_url"],
    key=CONFIG["openai"]["key"],
    model=CONFIG["openai"]["model"],
    api_version=CONFIG["openai"]["version"],
)

db = cosmos_utils.get_db("", CONFIG["mysql"]["database_name"])
sessions_col = cosmos_utils.get_collection(db, CONFIG["mysql"]["sessions_table"])
legacy_logs_col = cosmos_utils.get_collection(db, CONFIG["mysql"]["legacy_logs_table"])
users_col = cosmos_utils.get_collection(db, CONFIG["mysql"]["users_table"])
chats_col = cosmos_utils.get_collection(db, CONFIG["mysql"]["chats_table"])
messages_col = cosmos_utils.get_collection(db, CONFIG["mysql"]["messages_table"])
logs_col = cosmos_utils.get_collection(db, CONFIG["mysql"]["logs_table"])

api_server.openai_mgr = openai_mgr

api_server.sessions_col = sessions_col
api_server.legacy_logs_col = legacy_logs_col
api_server.users_col = users_col
api_server.chats_col = chats_col
api_server.messages_col = messages_col
api_server.logs_col = logs_col

if __name__ == "__main__":
    print("=" * 60)
    print("  SQL QA API Server")
    print(f"  MySQL DB   : {CONFIG['mysql']['database_name']}")
    print(f"  QA Table   : {os.getenv('DB_TABLE', 'hotel_reservations')}")
    print(f"  OpenAI     : {CONFIG['openai']['model']}")
    if CONFIG["openai"]["key"] == "local-dev-key":
        print("  OpenAI Key : missing (using local-dev-key placeholder)")
    print("=" * 60)
    uvicorn.run(api_server.app, host="0.0.0.0", port=8000)
