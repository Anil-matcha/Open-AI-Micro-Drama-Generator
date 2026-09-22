import json
import os
from typing import Optional

import httpx

AGNES_BASE = os.environ.get("AGNES_BASE_URL", "https://apihub.agnes-ai.com/v1")
DEFAULT_MODEL = os.environ.get("AGNES_MODEL", "agnes-3.0-flash")


def _sanitize_json(text: str) -> str:
    """Strip common model artefacts around JSON payloads."""
    text = text.strip()
    if text.startswith("```"):
        parts = text.split("```")
        text = parts[1]
        if text.lower().startswith("json"):
            text = text[4:]
    return text.strip()


class AgnesLLM:
    """Calls Agnes chat completions (OpenAI-compatible) and returns the text.

    Drop-in replacement for MuAPILLM with the same complete() signature so
    agents don't change.
    """

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.environ.get("AGNES_API_KEY", "")
        if not self.api_key:
            raise RuntimeError(
                "AGNES_API_KEY not set. Put it in server/.env "
                "(or ~/.config/agnes/token)."
            )
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    async def complete(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        timeout: int = 180,
        fallback: Optional[str] = None,
    ) -> str:
        """Return the assistant text; fall back when the output is empty."""
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        model = os.environ.get("LLM_MODEL", DEFAULT_MODEL)

        # The Agnes OpenAI-compatible API may not support 'json_object',
        # so we request JSON in the prompt and sanitise on the way out.
        payload = {
            "model": model,
            "messages": messages,
            "stream": False,
        }

        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(
                f"{AGNES_BASE}/chat/completions",
                headers=self.headers,
                json=payload,
            )
            resp.raise_for_status()
            data = resp.json()

        try:
            text = data["choices"][0]["message"]["content"]
        except (KeyError, IndexError):
            if fallback is not None:
                print(f"[AgnesLLM] missing content in completion — using fallback.")
                return fallback
            raise RuntimeError(f"Agnes LLM returned no content: {str(data)[:300]}")

        text = text.strip()
        if not text and fallback is not None:
            return fallback
        return text

    async def complete_json(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        timeout: int = 180,
        fallback: Optional[str] = None,
    ) -> dict:
        """Run complete() and parse the result as JSON (sanitised)."""
        raw = await self.complete(prompt, system_prompt, timeout, fallback)
        raw = _sanitize_json(raw)
        return json.loads(raw)
