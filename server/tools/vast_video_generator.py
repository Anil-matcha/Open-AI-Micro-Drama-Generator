"""Vast.ai GPU video generator — drop-in replacement for AgnesVideoGenerator.

Talks to the self-hosted ComfyUI gateway on the Vast GPU instance:
    POST /api/generate  {prompt, image_url, duration} -> {job_id}
    GET  /api/status/{job_id}                          -> {status, video_url}

Selected via env VIDEO_PROVIDER=vast (api.py wires this in). The frame image
is passed to the gateway as a public URL; the gateway downloads it itself.
"""

import asyncio
import os
from typing import Optional

import httpx

VAST_API_BASE = os.environ.get("VAST_API_BASE", "http://115.73.210.129:28045")
VAST_API_KEY = os.environ.get("VAST_API_KEY", "demo-key")
POLL_INTERVAL = 5  # seconds
MAX_WAIT = 900  # seconds


class VastVideoGenerator:
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or VAST_API_KEY
        self.headers = {
            "X-API-Key": self.api_key,
            "Content-Type": "application/json",
        }

    async def generate_video_from_image(
        self,
        prompt: str,
        image_url: str,
        duration: int = 5,
        aspect_ratio: str = "16:9",
    ) -> str:
        """Generate a video clip from a first-frame image via the Vast gateway.

        Returns the public URL of the finished mp4. Falls back to T2V
        (no image) is NOT done here — callers expect I2V.
        """
        seconds = max(3, min(8, int(duration)))
        payload: dict = {
            "prompt": prompt,
            "duration": seconds,
        }
        if image_url.startswith("data:"):
            # data URI (e.g. base64 from Agnes uploader) -> send as image_b64
            header, _, b64 = image_url.partition(",")
            payload["image_b64"] = b64
        else:
            payload["image_url"] = image_url

        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(
                f"{VAST_API_BASE}/api/generate",
                headers=self.headers,
                json=payload,
            )
            # 401/429-like transient states: retry a few times
            retries = 0
            while resp.status_code in (429, 502, 503) and retries < 5:
                wait = 10 * (retries + 1)
                print(f"[VastVideo] {resp.status_code} on submit, retry in {wait}s")
                await asyncio.sleep(wait)
                resp = await client.post(
                    f"{VAST_API_BASE}/api/generate",
                    headers=self.headers,
                    json=payload,
                )
                retries += 1
            resp.raise_for_status()
            job_id = resp.json().get("job_id")
            if not job_id:
                raise ValueError(f"No job_id from Vast API: {resp.text[:300]}")

        print(f"[VastVideo] submitted job {job_id}, polling up to {MAX_WAIT}s ...")
        video_url = await self._poll(job_id)
        return video_url

    async def _poll(self, job_id: str) -> str:
        async with httpx.AsyncClient(timeout=60) as client:
            elapsed = 0
            while elapsed < MAX_WAIT:
                await asyncio.sleep(POLL_INTERVAL)
                elapsed += POLL_INTERVAL
                resp = await client.get(
                    f"{VAST_API_BASE}/api/status/{job_id}",
                    headers=self.headers,
                )
                resp.raise_for_status()
                data = resp.json()

                status = data.get("status")
                if status == "failed":
                    raise RuntimeError(
                        f"Vast job {job_id} failed: {data.get('error') or 'unknown'}"
                    )
                if status == "completed":
                    url = data.get("video_url")
                    if not url:
                        raise RuntimeError(
                            f"Vast job {job_id} completed without video_url"
                        )
                    return url
                # queued / rendering -> keep waiting

        raise TimeoutError(f"Vast job {job_id} timed out after {MAX_WAIT}s")
