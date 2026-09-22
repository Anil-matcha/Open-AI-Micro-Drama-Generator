"""Agnes video generator — image-to-video (I2V).

Drop-in replacement for MuAPIVideoGenerator:
  generate_video_from_image(prompt, image_url, duration, aspect_ratio) -> URL

Agnes video is asynchronous: POST /videos -> video_id, then poll
GET /agnesapi?video_id=... until completed and read metadata.url.
"""

import asyncio
import os
from typing import Optional

import httpx

AGNES_BASE = os.environ.get("AGNES_BASE_URL", "https://apihub.agnes-ai.com/v1")
DEFAULT_VIDEO_MODEL = os.environ.get("AGNES_VIDEO_MODEL", "agnes-video-2.5-flash")
POLL_INTERVAL = 5  # seconds
MAX_WAIT = 900  # seconds


class AgnesVideoGenerator:
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.environ.get("AGNES_API_KEY", "")
        if not self.api_key:
            raise RuntimeError("AGNES_API_KEY not set. Put it in server/.env.")
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    async def generate_video_from_image(
        self,
        prompt: str,
        image_url: str,
        duration: int = 5,
        aspect_ratio: str = "16:9",
    ) -> str:
        """Generate a cinematic video clip from an image + motion prompt.

        Uses Agnes video model (first_frame keyframe mode). Returns the URL
        of the generated video.
        """
        seconds = max(4, min(12, int(duration)))
        payload = {
            "model": os.environ.get("KLING_MODEL", DEFAULT_VIDEO_MODEL),
            "prompt": prompt,
            "seconds": str(seconds),
            "size": os.environ.get("AGNES_VIDEO_SIZE", "720P"),
            "aspect_ratio": aspect_ratio or "16:9",
            "mode": "keyframe",
            "first_frame": image_url,
        }

        async with httpx.AsyncClient(timeout=120) as client:
            data = await self._submit_with_retry(client, payload)

        video_id = self._extract_video_id(data)
        if not video_id:
            raise ValueError(f"No video_id in Agnes response: {str(data)[:300]}")

        print(f"[AgnesVideo] submitted {video_id}, polling up to {MAX_WAIT}s ...")
        result_url = await self._poll(video_id, model_name=payload["model"])
        return result_url

    async def _submit_with_retry(self, client: httpx.AsyncClient, payload: dict,
                                 max_retries: int = 8) -> dict:
        """POST /videos with backoff on 429 (rate limit) and 503 (queue full).

        The free-tier video queue stays full for minutes when video tasks are
        still rendering, so back off harder and longer than the raw 429/503
        asks for — a submit that never gets through is worse than a slow one.
        """
        last = None
        for attempt in range(1, max_retries + 1):
            resp = await client.post(
                f"{AGNES_BASE}/videos",
                headers=self.headers,
                json=payload,
            )
            if resp.status_code in (429, 503):
                wait = min(15 * attempt, 90)
                body = resp.text[:200]
                print(f"[AgnesVideo] {resp.status_code} on submit "
                      f"(attempt {attempt}/{max_retries}), retry in {wait}s: {body}")
                await asyncio.sleep(wait)
                last = resp
                continue
            resp.raise_for_status()
            return resp.json()
        # Exhausted retries — raise the final HTTP error
        if last is not None:
            last.raise_for_status()
        raise RuntimeError("Agnes video submit failed after retries")

    @staticmethod
    def _extract_video_id(data: dict):
        if not isinstance(data, dict):
            return None
        for k in ("video_id", "task_id", "id"):
            v = data.get(k)
            if v:
                return str(v)
        return None

    async def _poll(self, video_id: str, model_name: str = None) -> str:
        params = {"video_id": video_id}
        if model_name:
            params["model_name"] = model_name

        elapsed = 0
        async with httpx.AsyncClient(timeout=60) as client:
            while elapsed < MAX_WAIT:
                await asyncio.sleep(POLL_INTERVAL)
                elapsed += POLL_INTERVAL
                resp = await client.get(
                    f"{AGNES_BASE}/agnesapi",
                    headers=self.headers,
                    params=params,
                )
                resp.raise_for_status()
                data = resp.json()

                status = str(data.get("status") or "unknown").lower()
                if status in ("failed", "error", "cancelled", "timeout"):
                    raise RuntimeError(
                        f"Agnes video task {video_id} failed: "
                        f"{data.get('error') or str(data)[:300]}"
                    )
                if status in ("completed", "succeeded", "success"):
                    url = self._extract_url(data)
                    if not url:
                        raise RuntimeError(
                            f"Agnes task {video_id} completed but no URL: {str(data)[:300]}"
                        )
                    return url

        raise TimeoutError(f"Agnes video task {video_id} timed out after {MAX_WAIT}s")

    @staticmethod
    def _extract_url(data: dict) -> str:
        meta = data.get("metadata") or {}
        if isinstance(meta, dict) and meta.get("url"):
            return meta["url"]
        if data.get("url"):
            return data["url"]
        results = data.get("results") or []
        if results and isinstance(results[0], dict):
            return results[0].get("url") or results[0].get("video_url") or ""
        return ""
