"""
MySQL utility layer.

Kept as `cosmos_utils.py` to preserve existing imports in the API code.
"""

from __future__ import annotations

import asyncio
import json
import os
import threading
import uuid
from datetime import datetime, timezone
from typing import Optional

import bcrypt
import pymysql

_BOOTSTRAP_LOCK = threading.Lock()
_BOOTSTRAP_DONE = False
_BOOTSTRAP_ERROR: Optional[Exception] = None


class BackendDBUnavailableError(RuntimeError):
    """Raised when MySQL is unavailable or authentication fails."""


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _to_iso(dt: Optional[datetime]) -> Optional[str]:
    if dt is None:
        return None
    return dt.isoformat()


def _db_config(include_db: bool = True) -> dict:
    cfg = {
        "host": os.getenv("DB_HOST", "localhost"),
        "port": int(os.getenv("DB_PORT", "3306")),
        "user": os.getenv("DB_USER", "root"),
        "password": os.getenv("DB_PASSWORD", ""),
        "charset": "utf8mb4",
        "cursorclass": pymysql.cursors.DictCursor,
        "autocommit": True,
    }
    if include_db:
        cfg["database"] = os.getenv("DB_NAME", "hotel_db")
    return cfg


def _bootstrap_database_and_tables() -> None:
    db_name = os.getenv("DB_NAME", "hotel_db")
    conn = pymysql.connect(**_db_config(include_db=False))
    try:
        with conn.cursor() as cur:
            cur.execute(f"CREATE DATABASE IF NOT EXISTS `{db_name}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
    finally:
        conn.close()

    conn = pymysql.connect(**_db_config(include_db=True))
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS users (
                    userId VARCHAR(64) PRIMARY KEY,
                    username VARCHAR(255) NOT NULL UNIQUE,
                    passwordHash VARCHAR(255) NOT NULL,
                    createdAt DATETIME(6) NOT NULL
                )
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS chats (
                    chatId VARCHAR(64) PRIMARY KEY,
                    userId VARCHAR(64) NOT NULL,
                    title VARCHAR(512) NOT NULL,
                    isPinned BOOLEAN NOT NULL DEFAULT FALSE,
                    isArchived BOOLEAN NOT NULL DEFAULT FALSE,
                    createdAt DATETIME(6) NOT NULL,
                    lastMessageAt DATETIME(6) NOT NULL,
                    messageCount INT NOT NULL DEFAULT 0,
                    INDEX idx_chats_user_last (userId, lastMessageAt)
                )
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS messages (
                    messageId VARCHAR(64) PRIMARY KEY,
                    chatId VARCHAR(64) NOT NULL,
                    userId VARCHAR(64) NOT NULL,
                    role VARCHAR(32) NOT NULL,
                    content LONGTEXT NOT NULL,
                    sources JSON NULL,
                    createdAt DATETIME(6) NOT NULL,
                    rating INT NULL,
                    feedback JSON NULL,
                    INDEX idx_messages_chat_created (chatId, createdAt),
                    INDEX idx_messages_user (userId)
                )
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS logs (
                    id BIGINT AUTO_INCREMENT PRIMARY KEY,
                    userId VARCHAR(64) NULL,
                    chatId VARCHAR(64) NULL,
                    eventType VARCHAR(128) NOT NULL,
                    details JSON NULL,
                    createdAt DATETIME(6) NOT NULL,
                    INDEX idx_logs_user (userId),
                    INDEX idx_logs_chat (chatId)
                )
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS legacy_sessions (
                    session_id VARCHAR(128) PRIMARY KEY,
                    user_id VARCHAR(64) NOT NULL,
                    title VARCHAR(512) NOT NULL,
                    messages JSON NOT NULL,
                    created_at DATETIME(6) NOT NULL,
                    updated_at DATETIME(6) NOT NULL,
                    INDEX idx_legacy_sessions_updated (updated_at)
                )
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS legacy_logs (
                    session_id VARCHAR(128) PRIMARY KEY,
                    user_id VARCHAR(64) NOT NULL,
                    logs JSON NOT NULL,
                    created_at DATETIME(6) NOT NULL,
                    updated_at DATETIME(6) NOT NULL
                )
                """
            )
    finally:
        conn.close()


def _ensure_bootstrapped() -> None:
    global _BOOTSTRAP_DONE, _BOOTSTRAP_ERROR
    if _BOOTSTRAP_DONE:
        return
    if _BOOTSTRAP_ERROR is not None:
        raise BackendDBUnavailableError(f"MySQL unavailable: {_BOOTSTRAP_ERROR}") from _BOOTSTRAP_ERROR
    with _BOOTSTRAP_LOCK:
        if _BOOTSTRAP_DONE:
            return
        if _BOOTSTRAP_ERROR is not None:
            raise BackendDBUnavailableError(f"MySQL unavailable: {_BOOTSTRAP_ERROR}") from _BOOTSTRAP_ERROR
        try:
            _bootstrap_database_and_tables()
            _BOOTSTRAP_DONE = True
        except Exception as exc:
            _BOOTSTRAP_ERROR = exc
            raise BackendDBUnavailableError(f"MySQL unavailable: {exc}") from exc


def get_db(_mongo_uri: str, _db_name: str):
    # Avoid hard-failing app startup when DB is not reachable.
    return {"db_name": os.getenv("DB_NAME", "hotel_db")}


def get_collection(_db, name: str):
    return name


async def _run_fetchone(query: str, params: tuple = ()) -> Optional[dict]:
    def _work():
        _ensure_bootstrapped()
        conn = pymysql.connect(**_db_config(include_db=True))
        try:
            with conn.cursor() as cur:
                cur.execute(query, params)
                return cur.fetchone()
        finally:
            conn.close()

    return await asyncio.to_thread(_work)


async def _run_fetchall(query: str, params: tuple = ()) -> list[dict]:
    def _work():
        _ensure_bootstrapped()
        conn = pymysql.connect(**_db_config(include_db=True))
        try:
            with conn.cursor() as cur:
                cur.execute(query, params)
                return cur.fetchall()
        finally:
            conn.close()

    return await asyncio.to_thread(_work)


async def _run_execute(query: str, params: tuple = ()) -> int:
    def _work():
        _ensure_bootstrapped()
        conn = pymysql.connect(**_db_config(include_db=True))
        try:
            with conn.cursor() as cur:
                rows = cur.execute(query, params)
                return rows
        finally:
            conn.close()

    return await asyncio.to_thread(_work)


async def log_event(
    _logs_col,
    event_type: str,
    user_id: Optional[str] = None,
    chat_id: Optional[str] = None,
    details: Optional[dict] = None,
) -> None:
    try:
        await _run_execute(
            """
            INSERT INTO logs (userId, chatId, eventType, details, createdAt)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (user_id, chat_id, event_type, json.dumps(details or {}), _now()),
        )
    except Exception as exc:
        print(f"[mysql_utils] log_event silenced error: {exc}")


async def get_user_by_username(_users_col, username: str) -> Optional[dict]:
    return await _run_fetchone(
        "SELECT userId, username, passwordHash, createdAt FROM users WHERE username = %s",
        (username,),
    )


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except Exception:
        return False


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt(12)).decode()


async def create_user(_users_col, username: str, plain_password: str) -> dict:
    user_id = f"user_{uuid.uuid4().hex[:8]}"
    now = _now()
    password_hash = hash_password(plain_password)
    await _run_execute(
        """
        INSERT INTO users (userId, username, passwordHash, createdAt)
        VALUES (%s, %s, %s, %s)
        """,
        (user_id, username, password_hash, now),
    )
    return {
        "userId": user_id,
        "username": username,
        "passwordHash": password_hash,
        "createdAt": now,
    }


async def list_chats_for_user(_chats_col, user_id: str) -> list[dict]:
    rows = await _run_fetchall(
        """
        SELECT chatId, title, isPinned, isArchived, lastMessageAt, createdAt, messageCount
        FROM chats
        WHERE userId = %s
        ORDER BY lastMessageAt DESC
        LIMIT 50
        """,
        (user_id,),
    )
    for r in rows:
        r["isPinned"] = bool(r.get("isPinned"))
        r["isArchived"] = bool(r.get("isArchived"))
        r["lastMessageAt"] = _to_iso(r.get("lastMessageAt"))
        r["createdAt"] = _to_iso(r.get("createdAt"))
    return rows


async def get_chat(_chats_col, chat_id: str, user_id: str) -> Optional[dict]:
    row = await _run_fetchone(
        """
        SELECT chatId, userId, title, isPinned, isArchived, createdAt, lastMessageAt, messageCount
        FROM chats
        WHERE chatId = %s AND userId = %s
        """,
        (chat_id, user_id),
    )
    if row:
        row["isPinned"] = bool(row.get("isPinned"))
        row["isArchived"] = bool(row.get("isArchived"))
        row["createdAt"] = _to_iso(row.get("createdAt"))
        row["lastMessageAt"] = _to_iso(row.get("lastMessageAt"))
    return row


async def create_chat(_chats_col, user_id: str, title: str) -> dict:
    if len(title.strip()) < 5:
        raise ValueError("Chat title must be at least 5 characters long.")
    chat_id = f"chat_{uuid.uuid4().hex[:8]}"
    now = _now()
    await _run_execute(
        """
        INSERT INTO chats (chatId, userId, title, isPinned, isArchived, createdAt, lastMessageAt, messageCount)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """,
        (chat_id, user_id, title.strip(), False, False, now, now, 0),
    )
    return {
        "chatId": chat_id,
        "userId": user_id,
        "title": title.strip(),
        "isPinned": False,
        "isArchived": False,
        "createdAt": _to_iso(now),
        "lastMessageAt": _to_iso(now),
        "messageCount": 0,
    }


async def rename_chat(_chats_col, chat_id: str, user_id: str, new_title: str) -> Optional[dict]:
    if len(new_title.strip()) < 5:
        raise ValueError("Chat title must be at least 5 characters long.")
    updated = await _run_execute(
        "UPDATE chats SET title = %s WHERE chatId = %s AND userId = %s",
        (new_title.strip(), chat_id, user_id),
    )
    if updated == 0:
        return None
    return await get_chat(_chats_col, chat_id, user_id)


async def toggle_pin_chat(_chats_col, chat_id: str, user_id: str, is_pinned: bool) -> Optional[dict]:
    updated = await _run_execute(
        "UPDATE chats SET isPinned = %s WHERE chatId = %s AND userId = %s",
        (is_pinned, chat_id, user_id),
    )
    if updated == 0:
        return None
    return await get_chat(_chats_col, chat_id, user_id)


async def toggle_archive_chat(_chats_col, chat_id: str, user_id: str, is_archived: bool) -> Optional[dict]:
    updated = await _run_execute(
        "UPDATE chats SET isArchived = %s WHERE chatId = %s AND userId = %s",
        (is_archived, chat_id, user_id),
    )
    if updated == 0:
        return None
    return await get_chat(_chats_col, chat_id, user_id)


async def delete_chat(_chats_col, chat_id: str, user_id: str) -> bool:
    deleted = await _run_execute(
        "DELETE FROM chats WHERE chatId = %s AND userId = %s",
        (chat_id, user_id),
    )
    if deleted:
        await _run_execute(
            "DELETE FROM messages WHERE chatId = %s AND userId = %s",
            (chat_id, user_id),
        )
    return deleted > 0


async def delete_all_chats_for_user(_chats_col, _messages_col, user_id: str) -> int:
    # Remove messages first, then chats to keep data consistent.
    await _run_execute(
        "DELETE FROM messages WHERE userId = %s",
        (user_id,),
    )
    deleted = await _run_execute(
        "DELETE FROM chats WHERE userId = %s",
        (user_id,),
    )
    return int(deleted or 0)


async def list_messages_for_chat(_messages_col, chat_id: str, user_id: str) -> list[dict]:
    rows = await _run_fetchall(
        """
        SELECT messageId, chatId, userId, role, content, sources, createdAt, rating, feedback
        FROM messages
        WHERE chatId = %s AND userId = %s
        ORDER BY createdAt ASC
        """,
        (chat_id, user_id),
    )
    for r in rows:
        r["sources"] = json.loads(r["sources"]) if r.get("sources") else []
        r["feedback"] = json.loads(r["feedback"]) if r.get("feedback") else None
        r["createdAt"] = _to_iso(r.get("createdAt"))
    return rows


async def insert_message(
    _messages_col,
    _chats_col,
    chat_id: str,
    user_id: str,
    role: str,
    content: str,
    sources: Optional[list] = None,
) -> dict:
    msg_id = f"msg_{uuid.uuid4().hex[:10]}"
    now = _now()
    await _run_execute(
        """
        INSERT INTO messages (messageId, chatId, userId, role, content, sources, createdAt, rating, feedback)
        VALUES (%s, %s, %s, %s, %s, %s, %s, NULL, NULL)
        """,
        (msg_id, chat_id, user_id, role, content, json.dumps(sources or []), now),
    )
    await _run_execute(
        """
        UPDATE chats
        SET lastMessageAt = %s, messageCount = messageCount + 1
        WHERE chatId = %s AND userId = %s
        """,
        (now, chat_id, user_id),
    )
    return {
        "messageId": msg_id,
        "chatId": chat_id,
        "userId": user_id,
        "role": role,
        "content": content,
        "sources": sources or [],
        "createdAt": _to_iso(now),
        "rating": None,
        "feedback": None,
    }


async def update_message_rating(
    _messages_col,
    message_id: str,
    user_id: str,
    rating: int,
    comment: Optional[str] = None,
) -> Optional[dict]:
    feedback = {"createdAt": _to_iso(_now())}
    if comment is not None:
        feedback["comment"] = comment

    updated = await _run_execute(
        """
        UPDATE messages
        SET rating = %s, feedback = %s
        WHERE messageId = %s AND userId = %s
        """,
        (rating, json.dumps(feedback), message_id, user_id),
    )
    if updated == 0:
        return None
    row = await _run_fetchone(
        """
        SELECT messageId, chatId, userId, role, content, sources, createdAt, rating, feedback
        FROM messages
        WHERE messageId = %s AND userId = %s
        """,
        (message_id, user_id),
    )
    if not row:
        return None
    row["sources"] = json.loads(row["sources"]) if row.get("sources") else []
    row["feedback"] = json.loads(row["feedback"]) if row.get("feedback") else None
    row["createdAt"] = _to_iso(row.get("createdAt"))
    return row


async def save_legacy_session(_sessions_col, session: dict) -> bool:
    try:
        session_id = session.get("id")
        if not session_id:
            return False
        created_at = session.get("createdAt")
        if isinstance(created_at, str):
            try:
                created_at = datetime.fromisoformat(created_at)
            except Exception:
                created_at = _now()
        elif isinstance(created_at, (int, float)):
            created_at = datetime.fromtimestamp(created_at / 1000, tz=timezone.utc)
        else:
            created_at = _now()

        updated_at = _now()
        await _run_execute(
            """
            INSERT INTO legacy_sessions (session_id, user_id, title, messages, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                user_id = VALUES(user_id),
                title = VALUES(title),
                messages = VALUES(messages),
                updated_at = VALUES(updated_at)
            """,
            (
                session_id,
                session.get("user_id", "anonymous"),
                session.get("title", "New Chat"),
                json.dumps(session.get("messages", [])),
                created_at,
                updated_at,
            ),
        )
        return True
    except Exception as exc:
        print(f"[mysql_utils] save_legacy_session error: {exc}")
        return False


async def load_legacy_sessions(_sessions_col) -> list[dict]:
    rows = await _run_fetchall(
        """
        SELECT session_id, user_id, title, messages, created_at, updated_at
        FROM legacy_sessions
        ORDER BY updated_at DESC
        LIMIT 50
        """
    )
    return [
        {
            "id": r.get("session_id"),
            "title": r.get("title", "New Chat"),
            "messages": json.loads(r["messages"]) if r.get("messages") else [],
            "createdAt": _to_iso(r.get("created_at")),
            "updatedAt": _to_iso(r.get("updated_at")),
            "user_id": r.get("user_id", "anonymous"),
        }
        for r in rows
    ]


async def delete_legacy_session(_sessions_col, session_id: str) -> bool:
    deleted = await _run_execute(
        "DELETE FROM legacy_sessions WHERE session_id = %s",
        (session_id,),
    )
    return deleted > 0


async def log_event_legacy(_logs_col, session_id: str, user_id: str, log_data: dict) -> None:
    try:
        row = await _run_fetchone(
            "SELECT logs FROM legacy_logs WHERE session_id = %s",
            (session_id,),
        )
        logs = json.loads(row["logs"]) if row and row.get("logs") else []
        logs.append({"timestamp": _to_iso(_now()), **log_data})

        await _run_execute(
            """
            INSERT INTO legacy_logs (session_id, user_id, logs, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                user_id = VALUES(user_id),
                logs = VALUES(logs),
                updated_at = VALUES(updated_at)
            """,
            (session_id, user_id, json.dumps(logs), _now(), _now()),
        )
    except Exception as exc:
        print(f"[mysql_utils] log_event_legacy silenced error: {exc}")


async def search_chat_history(
    _chats_col,
    _messages_col,
    user_id: Optional[str] = None,
    search_text: Optional[str] = None,
    limit: int = 20,
) -> list[dict]:
    if not user_id:
        return []

    text = (search_text or "").strip()
    if not text:
        rows = await _run_fetchall(
            """
            SELECT chatId, title
            FROM chats
            WHERE userId = %s
            ORDER BY lastMessageAt DESC
            LIMIT %s
            """,
            (user_id, int(limit)),
        )
        return [{"session_id": r["chatId"], "title": r.get("title", "New Chat")} for r in rows]

    like = f"%{text}%"
    rows = await _run_fetchall(
        """
        SELECT DISTINCT c.chatId, c.title, c.lastMessageAt
        FROM chats c
        LEFT JOIN messages m
            ON m.chatId = c.chatId AND m.userId = c.userId
        WHERE c.userId = %s
          AND (c.title LIKE %s OR m.content LIKE %s)
        ORDER BY c.lastMessageAt DESC
        LIMIT %s
        """,
        (user_id, like, like, int(limit)),
    )
    return [{"session_id": r["chatId"], "title": r.get("title", "New Chat")} for r in rows]


async def get_table_schema(table_name: str) -> list[dict]:
    return await _run_fetchall(
        """
        SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_KEY
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = %s
        ORDER BY ORDINAL_POSITION
        """,
        (table_name,),
    )


async def execute_select_sql(sql_query: str) -> list[dict]:
    return await _run_fetchall(sql_query)
