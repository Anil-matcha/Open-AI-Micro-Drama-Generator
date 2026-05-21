import asyncio
import os
from typing import Optional

import httpx


MUAPI_BASE = "https://api.muapi.ai/api/v1"
POLL_INTERVAL = 3


class MuAPILLM:
    """Calls MuAPI's claude-sonnet-4-6 LLM endpoint and polls for the text result."""

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.environ["MUAPI_KEY"]
        self.headers = {"x-api-key": self.api_key, "Content-Type": "application/json"}

    async def complete(self, prompt: str, system_prompt: Optional[str] = None, timeout: int = 120) -> str:
        """Submit an LLM completion request and return the response text."""
        payload: dict = {"prompt": prompt}
        if system_prompt:
            payload["system_prompt"] = system_prompt

        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                f"{MUAPI_BASE}/claude-sonnet-4-6",
                headers=self.headers,
                json=payload,
            )
            resp.raise_for_status()
            data = resp.json()

        request_id = data.get("request_id") or data.get("id")
        if not request_id:
            raise ValueError(f"No request_id in LLM response: {data}")

        return await self._poll_until_done(request_id, timeout=timeout)

    async def _poll_until_done(self, request_id: str, timeout: int = 120) -> str:
        elapsed = 0
        async with httpx.AsyncClient(timeout=30) as client:
            while elapsed < timeout:
                await asyncio.sleep(POLL_INTERVAL)
                elapsed += POLL_INTERVAL

                resp = await client.get(
                    f"{MUAPI_BASE}/predictions/{request_id}/result",
                    headers=self.headers,
                )
                resp.raise_for_status()
                data = resp.json()

                status = data.get("status", "")
                if status == "completed":
                    outputs = data.get("outputs", [])
                    if not outputs:
                        raise ValueError(f"No outputs in LLM result: {data}")
                    return str(outputs[0])
                elif status == "failed":
                    raise RuntimeError(f"MuAPI LLM job {request_id} failed: {data.get('error', 'unknown')}")
                elif status == "cancelled":
                    raise RuntimeError(f"MuAPI LLM job {request_id} was cancelled")

        raise TimeoutError(f"MuAPI LLM job {request_id} did not complete within {timeout}s")
