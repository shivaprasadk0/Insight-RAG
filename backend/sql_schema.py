"""
Schema helpers for Text-to-SQL flow.
"""

from __future__ import annotations

from typing import Dict, List

import cosmos_utils


def format_schema_text(columns: List[Dict]) -> str:
    if not columns:
        return "No columns found."
    lines = []
    for c in columns:
        lines.append(
            f"- {c.get('COLUMN_NAME')} ({c.get('DATA_TYPE')}), "
            f"nullable={c.get('IS_NULLABLE')}, key={c.get('COLUMN_KEY')}"
        )
    return "\n".join(lines)


async def get_schema_text_for_table(table_name: str) -> str:
    columns = await cosmos_utils.get_table_schema(table_name)
    return format_schema_text(columns)
