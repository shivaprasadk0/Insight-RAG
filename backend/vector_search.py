# vector_search.py
"""
Backward-compatible SQL tool.

This project moved from vector RAG to Text-to-SQL.
The filename is intentionally preserved to avoid breaking old imports.
"""

from __future__ import annotations

from typing import Dict, List, Optional

import cosmos_utils
from openai_calls import OpenAIManager
from sql_schema import get_schema_text_for_table


class VectorSearchTool:
    """
    Legacy adapter for callers that still import `VectorSearchTool`.
    Internally executes SQL generation + SQL execution instead of vector search.
    """

    def __init__(
        self,
        openai_mgr: OpenAIManager,
        qa_table: str,
        max_rows: int = 10,
    ):
        self.openai_mgr = openai_mgr
        self.qa_table = qa_table
        self.max_rows = int(max_rows)

    @staticmethod
    def _sanitize_generated_sql(sql: str, max_rows: int, qa_table: str) -> str:
        import re

        blocked_sql_pattern = re.compile(
            r"\b(insert|update|delete|drop|alter|truncate|create|replace|grant|revoke|call|execute)\b",
            re.IGNORECASE,
        )
        sql = sql.strip().strip("`")
        if sql.startswith("```"):
            sql = sql.replace("```sql", "").replace("```", "").strip()
        sql = sql.rstrip(";").strip()
        if not sql.lower().startswith("select"):
            raise ValueError("Generated SQL is not a SELECT query.")
        if blocked_sql_pattern.search(sql):
            raise ValueError("Generated SQL contains blocked statements.")
        lowered = sql.lower()
        if " from " in lowered and qa_table.lower() not in lowered:
            raise ValueError(f"Generated SQL must query only table '{qa_table}'.")
        if " limit " not in lowered:
            sql = f"{sql} LIMIT {int(max_rows)}"
        return sql

    async def query_as_tool(
        self,
        question: str,
        history: Optional[List[Dict]] = None,
        top_k: int = 5,  # Kept for signature compatibility.
    ) -> Dict:
        del top_k
        safe_history = history or []
        schema_text = await get_schema_text_for_table(self.qa_table)
        if schema_text == "No columns found.":
            raise ValueError(f"Table '{self.qa_table}' not found or has no visible columns.")

        rewritten_intent = await self.openai_mgr.rephrase_query(question, safe_history)
        generated_sql = await self.openai_mgr.generate_sql(
            question=rewritten_intent,
            schema_text=schema_text,
            history=safe_history,
            table_name=self.qa_table,
            max_rows=self.max_rows,
        )
        safe_sql = self._sanitize_generated_sql(
            generated_sql,
            max_rows=self.max_rows,
            qa_table=self.qa_table,
        )
        rows = await cosmos_utils.execute_select_sql(safe_sql)
        return {
            "chunks": rows,
            "context": safe_sql,
            "sources": [],
            "sql_query": safe_sql,
        }

    async def search(self, query: str, top_k: int = 30) -> List[Dict]:
        result = await self.query_as_tool(query, history=[], top_k=top_k)
        return result["chunks"]

    async def rerank_chunks(self, query: str, chunks: List[Dict], top_n: int = 15) -> List[Dict]:
        del query
        return chunks[:top_n]

    def build_context(self, chunks: List[Dict]):
        return ("SQL rows returned", [])
