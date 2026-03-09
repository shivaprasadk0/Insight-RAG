# api_server.py
"""
FastAPI route definitions ONLY.
"""

from __future__ import annotations

import os
import re
from pathlib import Path
from datetime import datetime, timezone
from typing import List, Optional, Dict

import uuid
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

import cosmos_utils
from dotenv import load_dotenv
from openai_calls import OpenAIManager
from sql_schema import get_schema_text_for_table

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
        "qa_table": os.getenv("DB_TABLE", "hotel_reservations"),
        "max_query_results": int(os.getenv("MAX_QUERY_RESULTS", "10")),
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

app = FastAPI(title="SQL Chatbot API", version="4.0.0-sql")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(cosmos_utils.BackendDBUnavailableError)
async def db_unavailable_exception_handler(_request, exc: cosmos_utils.BackendDBUnavailableError):
    return JSONResponse(
        status_code=503,
        content={
            "detail": (
                "Database is unavailable. Set valid DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME "
                "in .env and ensure MySQL is running."
            ),
            "error": str(exc),
        },
    )


class Message(BaseModel):
    role: str
    content: str


class QueryRequest(BaseModel):
    history: List[Message]
    query: str
    session_id: Optional[str] = None
    user_id: Optional[str] = "anonymous"
    chat_id: Optional[str] = None


class Source(BaseModel):
    id: str
    pdf: str
    section: str
    page: Optional[int] = None
    type: str
    score: Optional[float] = None
    page_image_url: Optional[str] = None


class QueryResponse(BaseModel):
    answer: str
    sources: List[Source]
    message_id: Optional[str] = None


class TitleRequest(BaseModel):
    question: str
    response: str


class LoginRequest(BaseModel):
    username: str
    password: str


class CreateChatRequest(BaseModel):
    userId: str
    title: str


class RenameChatRequest(BaseModel):
    userId: str
    title: str


class TogglePinRequest(BaseModel):
    userId: str
    isPinned: bool


class ToggleArchiveRequest(BaseModel):
    userId: str
    isArchived: bool


class RatingRequest(BaseModel):
    messageId: str
    userId: str
    rating: int
    comment: Optional[str] = None


class SearchHistoryRequest(BaseModel):
    user_id: Optional[str] = None
    search_text: Optional[str] = None
    limit: Optional[int] = 20


def _make_token(user_id: str) -> str:
    import base64

    payload = f"{user_id}:{datetime.now(timezone.utc).isoformat()}"
    return base64.urlsafe_b64encode(payload.encode()).decode()


_BLOCKED_SQL_PATTERN = re.compile(
    r"\b(insert|update|delete|drop|alter|truncate|create|replace|grant|revoke|call|execute)\b",
    re.IGNORECASE,
)


_GREETING_PATTERN = re.compile(
    r"^\s*(hi|hii+|hiii+|hello|hey|good morning|good afternoon|good evening)\b",
    re.IGNORECASE,
)

_UNSAFE_OR_OUT_OF_SCOPE_PATTERN = re.compile(
    r"\b(bomb|weapon|explosive|hack|hacking|malware|attack|terror)\b",
    re.IGNORECASE,
)

_DESTRUCTIVE_DATA_REQUEST_PATTERN = re.compile(
    r"\b(delete|remove|truncate|drop|erase|wipe|clear)\b.*\b(row|rows|record|records|data|table|db|database)\b|\b(row|rows|record|records|data|table|db|database)\b.*\b(delete|remove|truncate|drop|erase|wipe|clear)\b",
    re.IGNORECASE,
)


def _extract_first_select(sql: str) -> str:
    """
    Recover first SELECT statement from model output that may include extra text.
    """
    text = (sql or "").strip()
    if text.startswith("```"):
        text = text.replace("```sql", "").replace("```", "").strip()

    # Find the first SELECT and trim trailing prose.
    m = re.search(r"\bselect\b", text, re.IGNORECASE)
    if not m:
        return ""
    candidate = text[m.start():].strip()

    # Keep only first SQL statement if multiple lines/prose follow.
    semi = candidate.find(";")
    if semi != -1:
        candidate = candidate[:semi]

    return candidate.strip()


def _build_fallback_sql(user_query: str, qa_table: str) -> str:
    q = (user_query or "").strip().lower()
    if _GREETING_PATTERN.search(q):
        return "SELECT 'Hello! Ask me a question about your database table.' AS message LIMIT 1"

    # Count fallback only for explicit table-wide count asks.
    if (
        "how many rows in the table" in q
        or "row count of table" in q
        or "total rows in table" in q
        or "total rows in dataset" in q
        or "count all rows" in q
    ):
        return f"SELECT COUNT(*) AS total_rows FROM {qa_table}"

    return "SELECT 'I could not generate SQL for that request. Please rephrase your database question.' AS message LIMIT 1"


def _is_greeting(text: str) -> bool:
    return bool(_GREETING_PATTERN.search((text or "").strip()))


def _is_out_of_scope(text: str) -> bool:
    q = (text or "").strip().lower()
    if not q:
        return True
    # Block clearly unsafe requests only.
    if _UNSAFE_OR_OUT_OF_SCOPE_PATTERN.search(q):
        return True
    return False


def _looks_like_database_query(text: str) -> bool:
    q = (text or "").strip().lower()
    if not q:
        return False
    if "how many" in q:
        return True
    db_terms = [
        "database",
        "db",
        "row",
        "rows",
        "record",
        "records",
        "count",
        "average",
        "avg",
        "sum",
        "total",
        "table",
        "column",
        "sql",
        "hotel",
        "room",
        "rooms",
        "meal plan",
        "meal",
        "booking",
        "status",
        "market segment",
        "cancellation",
        "month",
        "dataset",
    ]
    return any(term in q for term in db_terms)


def _looks_like_database_followup(text: str, history: List[Dict]) -> bool:
    q = (text or "").strip().lower()
    if not q:
        return False

    if q in {"based on our db", "from our db", "from database", "from our table", "based on database"}:
        return True

    followup_cues = [
        "based on our db",
        "from our db",
        "from database",
        "from our table",
        "what ae they",
        "wt are they",
        "what are th",
        "wt are the rooms",
        "what are they",
        "which ones",
        "show them",
        "list them",
        "what are those",
        "their names",
        "give names",
        "what are these",
    ]
    if not any(c in q for c in followup_cues):
        if re.search(r"\b(what|wt)\s+(are|ae|r)?\s*(they|those|them)\b", q):
            return True
        # Handle short pronoun-based follow-ups like "what are they?"
        tokens = q.replace("?", " ").split()
        pronouns = {"they", "them", "those", "these", "it"}
        if not (len(tokens) <= 6 and any(t in pronouns for t in tokens)):
            return False

    recent = history[-6:] if history else []
    for msg in reversed(recent):
        content = str(msg.get("content", "")).lower()
        if any(
            t in content
            for t in [
                "number_of_",
                "total_rows",
                "matching results",
                "sql",
                "table",
                "database",
                "db",
                "booking",
                "room",
                "| --- |",
            ]
        ):
            return True
    return False


def _is_destructive_data_request(text: str) -> bool:
    return bool(_DESTRUCTIVE_DATA_REQUEST_PATTERN.search((text or "").strip().lower()))


def _followup_sql_from_history(query: str, history: List[Dict], qa_table: str, max_rows: int) -> Optional[str]:
    q = (query or "").strip().lower()
    if not q:
        return None

    pronoun_followup = (
        re.search(r"\b(what|wt)\s+(are|ae|r)?\s*(they|those|them)\b", q) is not None
        or q in {"what ae they", "what are they", "wt are they", "which ones", "show them", "list them"}
    )
    if not pronoun_followup:
        return None

    recent = history[-8:] if history else []
    recent_text = " ".join(str(msg.get("content", "")).lower() for msg in recent)
    if any(token in recent_text for token in ["total_rooms", "room", "rooms", "room_type"]):
        return (
            f"SELECT DISTINCT room_type_reserved AS room_type "
            f"FROM {qa_table} "
            f"ORDER BY room_type_reserved "
            f"LIMIT {int(max_rows)}"
        )
    return None


def _local_chat_fallback(query: str) -> str:
    q = (query or "").strip().lower()
    if not q:
        return "I am here. Ask me a question and I will help."
    if _is_greeting(q):
        return "Hello. I am online and ready to help."
    if "how are you" in q:
        return "I am running fine. Ask me anything about your data or chats."
    return "The chat model is temporarily unavailable. Please try again in a bit."


def _rows_to_markdown_table(rows: list[dict], max_rows: int = 10) -> str:
    if not rows:
        return ""
    cols = list(rows[0].keys())
    header = "| " + " | ".join(cols) + " |"
    sep = "| " + " | ".join(["---"] * len(cols)) + " |"
    body_lines = []
    for r in rows[:max_rows]:
        body_lines.append("| " + " | ".join(str(r.get(c, "")) for c in cols) + " |")
    return "\n".join([header, sep] + body_lines)


def _humanize_column_name(name: str) -> str:
    text = (name or "").strip().replace("_", " ")
    text = re.sub(r"\s+", " ", text)
    return text.lower()


def _deterministic_answer(query: str, rows: list[dict]) -> str:
    q = (query or "").strip().lower()

    if not rows:
        # More natural fallback for questions outside table scope.
        if any(x in q for x in ["who is", "pm", "project manager", "manager name", "person"]):
            return (
                "That is a good question. I do not have that specific detail right now, "
                "but I am happy to help with anything else."
            )
        return (
            "Thanks for your question. I could not find a clear match at the moment, "
            "but if you rephrase it, I will do my best to help."
        )

    # Single scalar result
    if len(rows) == 1 and len(rows[0].keys()) == 1:
        only_col = next(iter(rows[0].keys()))
        if only_col.lower() == "message":
            return str(rows[0][only_col])
        label = _humanize_column_name(only_col)
        return f"The {label} is {rows[0][only_col]}."

    # Small resultset: show concise table
    if len(rows) <= 10:
        table = _rows_to_markdown_table(rows, max_rows=10)
        return f"Here are the matching results for '{query}':\n\n{table}"

    # Larger resultset summary
    table = _rows_to_markdown_table(rows, max_rows=10)
    return (
        f"I found {len(rows)} matching rows. Showing the first 10:\n\n"
        f"{table}"
    )


def _rule_based_sql(query: str, qa_table: str, max_rows: int) -> Optional[str]:
    q = (query or "").strip().lower()

    top_match = re.search(r"\btop\s+(\d+)\b", q)
    top_n = int(top_match.group(1)) if top_match else min(max_rows, 10)
    top_n = max(1, min(top_n, 100))

    if "market segment" in q and ("booking count" in q or "count" in q or "bookings" in q):
        return (
            f"SELECT market_segment_type, COUNT(*) AS booking_count "
            f"FROM {qa_table} "
            f"GROUP BY market_segment_type "
            f"ORDER BY booking_count DESC "
            f"LIMIT {top_n}"
        )

    if ("how many" in q or "count" in q) and "booking" in q and "cancel" in q:
        return f"SELECT COUNT(*) AS canceled_bookings FROM {qa_table} WHERE booking_status = 'Canceled'"

    if any(token in q for token in ["average booking", "avg booking", "avarage booking"]) and any(
        token in q for token in ["per day", "a day", "day"]
    ):
        return (
            f"SELECT ROUND(COUNT(*) / NULLIF(COUNT(DISTINCT CONCAT(arrival_year, '-', arrival_month, '-', arrival_date)), 0), 2) "
            f"AS average_bookings_per_day "
            f"FROM {qa_table}"
        )

    if ("how many" in q or "count" in q) and ("booking" in q or "rows" in q or "records" in q):
        return f"SELECT COUNT(*) AS total_rows FROM {qa_table}"

    room_count_intent = (
        ("how many" in q or "count" in q or "many room" in q or "many rooms" in q)
        and "room" in q
    ) or ("rooms available" in q or "room available" in q)

    if room_count_intent and (
        "not row" in q
        or "not rows" in q
        or "room type" in q
        or "present" in q
        or "total" in q
        or "available" in q
        or "rooms" in q
    ):
        return f"SELECT COUNT(DISTINCT room_type_reserved) AS total_rooms FROM {qa_table}"

    if "not row" in q and "room" in q:
        return f"SELECT COUNT(DISTINCT room_type_reserved) AS total_rooms FROM {qa_table}"

    if (
        "room" in q
        and any(token in q for token in ["what are", "wt are", "list", "types", "which rooms"])
        and "how many" not in q
    ):
        return (
            f"SELECT DISTINCT room_type_reserved AS room_type "
            f"FROM {qa_table} "
            f"ORDER BY room_type_reserved "
            f"LIMIT {int(max_rows)}"
        )

    if "meal" in q and "plan" in q and any(token in q for token in ["most", "common", "popular", "select", "selct", "selcte", "selected"]):
        mentioned_plan = re.search(r"meal\s*plan\s*(\d+)", q)
        if mentioned_plan and "after" in q:
            plan_value = f"Meal Plan {mentioned_plan.group(1)}"
            return (
                f"SELECT type_of_meal_plan, COUNT(*) AS selection_count "
                f"FROM {qa_table} "
                f"WHERE type_of_meal_plan <> '{plan_value}' "
                f"GROUP BY type_of_meal_plan "
                f"ORDER BY selection_count DESC "
                "LIMIT 1"
            )
        return (
            f"SELECT type_of_meal_plan, COUNT(*) AS selection_count "
            f"FROM {qa_table} "
            f"GROUP BY type_of_meal_plan "
            f"ORDER BY selection_count DESC "
            "LIMIT 1"
        )

    if ("average room price" in q) or ("avg price" in q) or ("average price" in q):
        return f"SELECT ROUND(AVG(avg_price_per_room), 2) AS average_room_price FROM {qa_table}"

    if "repeated guest" in q:
        return f"SELECT COUNT(*) AS repeated_guests FROM {qa_table} WHERE repeated_guest = 1"

    if "cancellation rate by month" in q or ("cancellation" in q and "month" in q and "rate" in q):
        return (
            f"SELECT arrival_month, "
            f"ROUND(100.0 * SUM(CASE WHEN booking_status = 'Canceled' THEN 1 ELSE 0 END) / COUNT(*), 2) "
            f"AS cancellation_rate_percent "
            f"FROM {qa_table} "
            f"GROUP BY arrival_month "
            f"ORDER BY arrival_month"
        )

    return None


def _sanitize_generated_sql(sql: str, max_rows: int, qa_table: str) -> str:
    sql = _extract_first_select(sql) or sql.strip().strip("`")
    sql = sql.rstrip(";").strip()
    if not sql.lower().startswith("select"):
        raise ValueError("Generated SQL is not a SELECT query.")
    if _BLOCKED_SQL_PATTERN.search(sql):
        raise ValueError("Generated SQL contains blocked statements.")
    lowered = sql.lower()
    if " from " in lowered and qa_table.lower() not in lowered:
        raise ValueError(f"Generated SQL must query only table '{qa_table}'.")
    # Enforce max row safety if LIMIT not present
    if " limit " not in lowered:
        sql = f"{sql} LIMIT {int(max_rows)}"
    return sql


@app.get("/")
def health_check():
    return {"status": "healthy", "version": "4.0.0-sql"}


@app.post("/auth/login")
async def login(request: LoginRequest):
    await cosmos_utils.log_event(
        logs_col,
        event_type="login_attempt",
        details={"username": request.username},
    )

    user = await cosmos_utils.get_user_by_username(users_col, request.username)

    if not user:
        await cosmos_utils.log_event(
            logs_col,
            event_type="login_failed",
            details={"username": request.username, "reason": "user_not_found"},
        )
        raise HTTPException(status_code=401, detail="Invalid username or password")

    if not cosmos_utils.verify_password(request.password, user["passwordHash"]):
        await cosmos_utils.log_event(
            logs_col,
            event_type="login_failed",
            user_id=user["userId"],
            details={"reason": "wrong_password"},
        )
        raise HTTPException(status_code=401, detail="Invalid username or password")

    token = _make_token(user["userId"])
    await cosmos_utils.log_event(
        logs_col,
        event_type="login_success",
        user_id=user["userId"],
        details={"username": request.username},
    )

    return {
        "success": True,
        "userId": user["userId"],
        "username": user["username"],
        "token": token,
    }


@app.post("/make_query", response_model=QueryResponse)
async def make_query(request: QueryRequest):
    session_id = request.session_id or str(uuid.uuid4())
    user_id = request.user_id or "anonymous"
    chat_id = request.chat_id
    query = request.query
    history = [m.model_dump() for m in request.history]

    start_time = datetime.now(timezone.utc)

    try:
        print(f"[make_query] query='{query}' user={user_id}")

        await cosmos_utils.log_event_legacy(
            legacy_logs_col,
            session_id,
            user_id,
            {
                "event": "query_received",
                "query": query,
                "history_length": len(history),
            },
        )

        qa_table = CONFIG["mysql"]["qa_table"]
        max_rows = CONFIG["mysql"]["max_query_results"]

        if _is_out_of_scope(query):
            answer = (
                "I am sorry, but I cannot help with that request. "
                "If you want, I can still help with other questions in a safe and useful way."
            )
            msg_id = None
            if chat_id and user_id != "anonymous":
                await cosmos_utils.insert_message(messages_col, chats_col, chat_id, user_id, "user", query)
                assistant_doc = await cosmos_utils.insert_message(
                    messages_col, chats_col, chat_id, user_id, "assistant", answer, sources=[]
                )
                msg_id = assistant_doc["messageId"]
            return QueryResponse(answer=answer, sources=[], message_id=msg_id)

        if _is_destructive_data_request(query):
            answer = (
                "I can only run read-only SELECT queries in this chat. "
                "I cannot delete rows or modify tables."
            )
            msg_id = None
            if chat_id and user_id != "anonymous":
                await cosmos_utils.insert_message(messages_col, chats_col, chat_id, user_id, "user", query)
                assistant_doc = await cosmos_utils.insert_message(
                    messages_col, chats_col, chat_id, user_id, "assistant", answer, sources=[]
                )
                msg_id = assistant_doc["messageId"]
            return QueryResponse(answer=answer, sources=[], message_id=msg_id)

        # Route greetings and general chat directly to LLM so replies stay natural.
        if _is_greeting(query) or (
            not _looks_like_database_query(query)
            and not _looks_like_database_followup(query, history)
        ):
            try:
                answer = await openai_mgr.chat_reply(query, history)
            except Exception as exc:
                err = str(exc).lower()
                if "429" in err or "quota" in err or "rate limit" in err:
                    answer = _local_chat_fallback(query)
                else:
                    answer = (
                        "I could not reach the chat model right now. "
                        "Please verify OPENAI_API_KEY, OPENAI_BASE_URL, and OPENAI_MODEL."
                    )

            msg_id = None
            if chat_id and user_id != "anonymous":
                await cosmos_utils.insert_message(messages_col, chats_col, chat_id, user_id, "user", query)
                assistant_doc = await cosmos_utils.insert_message(
                    messages_col, chats_col, chat_id, user_id, "assistant", answer, sources=[]
                )
                msg_id = assistant_doc["messageId"]
            return QueryResponse(answer=answer, sources=[], message_id=msg_id)

        schema_text = await get_schema_text_for_table(qa_table)
        if schema_text == "No columns found.":
            raise ValueError(f"Table '{qa_table}' not found or has no visible columns.")

        # Prefer deterministic SQL templates for common analytics queries.
        rule_sql = _followup_sql_from_history(query, history, qa_table, max_rows=max_rows)
        if not rule_sql:
            rule_sql = _rule_based_sql(query, qa_table, max_rows=max_rows)
        if rule_sql:
            safe_sql = _sanitize_generated_sql(rule_sql, max_rows=max_rows, qa_table=qa_table)
        else:
            print("[make_query] generating SQL from user question...")
            generated_sql = await openai_mgr.generate_sql(
                question=query,
                schema_text=schema_text,
                history=history,
                table_name=qa_table,
                max_rows=max_rows,
            )
            try:
                safe_sql = _sanitize_generated_sql(generated_sql, max_rows=max_rows, qa_table=qa_table)
            except ValueError:
                # Model occasionally returns plain text. Use deterministic safe fallback SQL.
                fallback_sql = _build_fallback_sql(query, qa_table)
                safe_sql = _sanitize_generated_sql(fallback_sql, max_rows=max_rows, qa_table=qa_table)
        print(f"[make_query] SQL: {safe_sql}")

        rows = await cosmos_utils.execute_select_sql(safe_sql)
        print(f"[make_query] SQL rows fetched: {len(rows)}")

        answer = _deterministic_answer(query, rows)
        sources = []

        msg_id = None

        if chat_id and user_id != "anonymous":
            print(f"[make_query] persisting chat for chat_id={chat_id}")

            await cosmos_utils.insert_message(
                messages_col,
                chats_col,
                chat_id,
                user_id,
                "user",
                query,
            )

            assistant_doc = await cosmos_utils.insert_message(
                messages_col,
                chats_col,
                chat_id,
                user_id,
                "assistant",
                answer,
                sources=[],
            )

            msg_id = assistant_doc["messageId"]

            await cosmos_utils.log_event(
                logs_col,
                event_type="message_created",
                user_id=user_id,
                chat_id=chat_id,
                details={
                    "messageId": msg_id,
                    "role": "assistant",
                },
            )

        print("[make_query] final logging...")
        await cosmos_utils.log_event_legacy(
            legacy_logs_col,
            session_id,
            user_id,
                {
                    "event": "query_completed",
                    "sql_query": safe_sql,
                    "result_count": len(rows),
                    "response_time_ms": (
                        datetime.now(timezone.utc) - start_time
                    ).total_seconds()
                * 1000,
                "exit_reason": "success",
            },
        )

        return QueryResponse(
            answer=answer,
            sources=sources,
            message_id=msg_id,
        )

    except Exception as exc:
        import traceback

        print(f"[make_query] CRITICAL ERROR: {exc}")
        traceback.print_exc()

        await cosmos_utils.log_event_legacy(
            legacy_logs_col,
            session_id,
            user_id,
            {
                "event": "query_error",
                "error": str(exc),
            },
        )

        answer = (
            "Sorry, I could not complete that request right now. "
            "Please try rephrasing the question in a simple way."
        )
        return QueryResponse(answer=answer, sources=[], message_id=None)


@app.post("/create_chat_title")
async def create_chat_title_endpoint(request: TitleRequest):
    title = await openai_mgr.generate_chat_title(request.question, request.response)
    return {"title": title}


@app.get("/chats/{user_id}")
async def get_chats(user_id: str):
    all_chats = await cosmos_utils.list_chats_for_user(chats_col, user_id)

    await cosmos_utils.log_event(
        logs_col,
        event_type="chat_list_loaded",
        user_id=user_id,
        details={"count": len(all_chats)},
    )

    pinned = [c for c in all_chats if c.get("isPinned") and not c.get("isArchived")]
    normal = [c for c in all_chats if not c.get("isPinned") and not c.get("isArchived")]
    archived = [c for c in all_chats if c.get("isArchived")]

    return {"pinned": pinned, "normal": normal, "archived": archived, "all": all_chats}


@app.post("/chats")
async def create_chat(request: CreateChatRequest):
    try:
        chat = await cosmos_utils.create_chat(chats_col, request.userId, request.title)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    await cosmos_utils.log_event(
        logs_col,
        event_type="chat_created",
        user_id=request.userId,
        chat_id=chat["chatId"],
        details={"title": chat["title"]},
    )
    return chat


@app.get("/chats/{user_id}/{chat_id}/messages")
async def get_messages(user_id: str, chat_id: str):
    msgs = await cosmos_utils.list_messages_for_chat(messages_col, chat_id, user_id)

    await cosmos_utils.log_event(
        logs_col,
        event_type="chat_opened",
        user_id=user_id,
        chat_id=chat_id,
        details={"message_count": len(msgs)},
    )
    return {"messages": msgs}


@app.patch("/chats/{user_id}/{chat_id}/rename")
async def rename_chat(user_id: str, chat_id: str, request: RenameChatRequest):
    try:
        updated = await cosmos_utils.rename_chat(chats_col, chat_id, user_id, request.title)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    if not updated:
        raise HTTPException(status_code=404, detail="Chat not found")

    await cosmos_utils.log_event(
        logs_col,
        event_type="chat_renamed",
        user_id=user_id,
        chat_id=chat_id,
        details={"newTitle": request.title},
    )
    return updated


@app.patch("/chats/{user_id}/{chat_id}/pin")
async def pin_chat(user_id: str, chat_id: str, request: TogglePinRequest):
    updated = await cosmos_utils.toggle_pin_chat(chats_col, chat_id, user_id, request.isPinned)
    if not updated:
        raise HTTPException(status_code=404, detail="Chat not found")
    return updated


@app.patch("/chats/{user_id}/{chat_id}/archive")
async def archive_chat(user_id: str, chat_id: str, request: ToggleArchiveRequest):
    updated = await cosmos_utils.toggle_archive_chat(chats_col, chat_id, user_id, request.isArchived)
    if not updated:
        raise HTTPException(status_code=404, detail="Chat not found")
    return updated


@app.delete("/chats/{user_id}/{chat_id}")
async def delete_chat_endpoint(user_id: str, chat_id: str):
    deleted = await cosmos_utils.delete_chat(chats_col, chat_id, user_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Chat not found")
    return {"deleted": True}


@app.delete("/chats/{user_id}")
async def delete_all_chats_endpoint(user_id: str):
    deleted_count = await cosmos_utils.delete_all_chats_for_user(chats_col, messages_col, user_id)
    await cosmos_utils.log_event(
        logs_col,
        event_type="all_chats_deleted",
        user_id=user_id,
        details={"deletedChats": deleted_count},
    )
    return {"deleted": True, "deletedChats": deleted_count}


@app.post("/messages/rate")
async def rate_message(request: RatingRequest):
    updated = await cosmos_utils.update_message_rating(
        messages_col,
        request.messageId,
        request.userId,
        request.rating,
        request.comment,
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Message not found or access denied")

    await cosmos_utils.log_event(
        logs_col,
        event_type="rating_updated",
        user_id=request.userId,
        details={"messageId": request.messageId, "rating": request.rating},
    )
    return {"success": True, "messageId": request.messageId, "rating": request.rating}


@app.post("/save_session")
async def save_session(session: Dict):
    try:
        await cosmos_utils.save_legacy_session(sessions_col, session)
        return {"status": "saved"}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/list_sessions")
async def list_sessions():
    try:
        sessions = await cosmos_utils.load_legacy_sessions(sessions_col)
        return {"sessions": sessions}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.delete("/delete_session/{session_id}")
async def delete_session(session_id: str):
    try:
        deleted = await cosmos_utils.delete_legacy_session(sessions_col, session_id)
        return {"deleted": bool(deleted)}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/search_sessions")
async def search_sessions(request: SearchHistoryRequest):
    try:
        results = await cosmos_utils.search_chat_history(
            chats_col,
            messages_col,
            user_id=request.user_id,
            search_text=request.search_text,
            limit=request.limit or 20,
        )
        return {"sessions": results}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/get_reference_image")
async def get_reference_image(
    page_image_url: str = Query(..., description="Direct URL of the reference page/image"),
):
    return {"url": page_image_url}
