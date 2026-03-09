# openai_calls.py
import json
from typing import Dict, List, Optional

from openai import AsyncOpenAI
from prompts import (
    GUARDRAIL_SYSTEM_PROMPT,
    RAG_SYSTEM_PROMPT,
    REPHRASE_PROMPT,
    SQL_ANSWER_SYSTEM_PROMPT,
    SQL_GENERATION_SYSTEM_PROMPT,
    TITLE_SYSTEM_PROMPT,
)


class OpenAIManager:
    def __init__(
        self,
        base_url: str,
        key: str,
        model: str,
        api_version: Optional[str] = None,
    ):
        client_kwargs = {
            "api_key": key,
            "base_url": base_url,
        }
        if api_version:
            client_kwargs["default_query"] = {"api-version": api_version}

        self.client = AsyncOpenAI(**client_kwargs)
        self.model = model

    async def _call_llm(
        self,
        messages: List[Dict],
        json_mode: bool = False,
        temperature: float = 0.0,
    ) -> str:
        """Helper to make async OpenAI-compatible calls."""
        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=temperature,
                response_format={"type": "json_object"} if json_mode else None,
            )
        except Exception:
            # Gemini preview names can expire; retry with stable alias.
            if self.model.startswith("gemini-") and "preview" in self.model:
                response = await self.client.chat.completions.create(
                    model="gemini-2.5-flash",
                    messages=messages,
                    temperature=temperature,
                    response_format={"type": "json_object"} if json_mode else None,
                )
            else:
                raise
        return response.choices[0].message.content.strip()

    async def guardrail_and_route(self, query: str, history: List[Dict]) -> Dict:
        """Determine if query is HR-related or general greeting."""
        messages = [{"role": "system", "content": GUARDRAIL_SYSTEM_PROMPT}]
        for msg in history[-2:]:
            messages.append({"role": msg["role"], "content": msg["content"]})
        messages.append({"role": "user", "content": query})

        try:
            res = await self._call_llm(messages, json_mode=True)
            print(res)
            return json.loads(res)
        except Exception:
            return {"category": "RESEARCH_NEEDED", "response": ""}

    async def rephrase_query(self, query: str, history: List[Dict]) -> str:
        """Rephrase user query into an explicit analytics intent."""
        messages = [{"role": "system", "content": REPHRASE_PROMPT}]
        for msg in history[-3:]:
            messages.append({"role": msg["role"], "content": msg["content"]})
        messages.append({"role": "user", "content": query})

        return await self._call_llm(messages)

    async def generate_sql(
        self,
        question: str,
        schema_text: str,
        history: List[Dict],
        table_name: str,
        max_rows: int = 10,
    ) -> str:
        """Generate one safe SELECT SQL query from question + schema."""
        messages: List[Dict] = [
            {"role": "system", "content": SQL_GENERATION_SYSTEM_PROMPT},
        ]
        for msg in history[-4:]:
            messages.append({"role": msg["role"], "content": msg["content"]})
        messages.append(
            {
                "role": "user",
                "content": (
                    f"Table name: {table_name}\n"
                    f"Max rows: {int(max_rows)}\n"
                    "Schema:\n"
                    f"{schema_text}\n\n"
                    "Question:\n"
                    f"{question}\n\n"
                    "Return only SQL."
                ),
            }
        )
        return await self._call_llm(messages, temperature=0.0)

    async def summarize_sql_result(self, question: str, sql_query: str, rows_json: str) -> str:
        """Turn SQL results into a concise natural-language answer."""
        messages = [
            {"role": "system", "content": SQL_ANSWER_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": (
                    f"User question:\n{question}\n\n"
                    f"SQL executed:\n{sql_query}\n\n"
                    f"Rows JSON:\n{rows_json}\n\n"
                    "Answer:"
                ),
            },
        ]
        return await self._call_llm(messages, temperature=0.0)

    async def ask_rag(self, query: str, context: str, history: List[Dict]) -> str:
        """Generate answer using retrieved context."""
        prompt = f"""Use the following HR policy context to answer the user's question.

            QUESTION: {query}

            CONTEXT:
            {context}
            RESPONSE:"""

        messages = [{"role": "system", "content": RAG_SYSTEM_PROMPT}]
        for msg in history[-4:]:
            messages.append({"role": msg["role"], "content": msg["content"]})
        messages.append({"role": "user", "content": prompt})

        return await self._call_llm(messages, temperature=0.0)

    async def generate_chat_title(self, question: str, response: str) -> str:
        """Generate a short title for the chat session."""
        messages = [
            {"role": "system", "content": TITLE_SYSTEM_PROMPT},
            {"role": "user", "content": f"Q: {question}\nA: {response}"},
        ]
        title = await self._call_llm(messages, temperature=0.0)
        return title.strip('"').strip("'")

    async def chat_reply(self, query: str, history: List[Dict]) -> str:
        """General conversational reply for non-SQL queries."""
        messages: List[Dict] = [
            {
                "role": "system",
                "content": (
                    "You are a helpful, natural conversational assistant. "
                    "Reply in a friendly and concise style. "
                    "Do not use rigid templates. "
                    "If the user asks for unknown facts, say what you know and ask a short follow-up."
                ),
            }
        ]
        for msg in history[-6:]:
            messages.append({"role": msg["role"], "content": msg["content"]})
        messages.append({"role": "user", "content": query})
        return await self._call_llm(messages, temperature=0.6)
