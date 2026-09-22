"""Agnes / OpenAI-compatible TTS — generates voiceover from text.

Uses the OpenAI-compatible `/audio/speech` endpoint that Agnes and compatible
providers expose. Falls back gracefully when no key is configured.
"""

import os
from typing import Optional

import httpx

_DEFAULT_BASE = os.environ.get("AGNES_BASE_URL", "https://apihub.agnes-ai.com/v1")
_DEFAULT_MODEL = os.environ.get("AGNES_TTS_MODEL", "tts-1-hd")
_DEFAULT_VOICE = os.environ.get("AGNES_TTS_VOICE", "onyx")


async def generate_tts(
    text: str,
    api_key: Optional[str] = None,
    base_url: Optional[str] = None,
    model: Optional[str] = None,
    voice: Optional[str] = None,
) -> bytes:
    """Return raw MP3 bytes for the given text. Returns b'' when no key."""
    key = api_key or os.environ.get("AGNES_API_KEY", "")
    if not key:
        print("[TTS] No AGNES_API_KEY — skipping voiceover generation.")
        return b""

    base = base_url or _DEFAULT_BASE
    voice = voice or _DEFAULT_VOICE
    model = model or _DEFAULT_MODEL

    payload = {
        "model": model,
        "input": text,
        "voice": voice,
        "response_format": "mp3",
        "speed": 0.95,
    }

    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=60) as client:
        try:
            resp = await client.post(
                f"{base}/audio/speech",
                headers=headers,
                json=payload,
            )
            resp.raise_for_status()
            return resp.content
        except Exception as e:
            print(f"[TTS] Generation failed: {e}")
            return b""
