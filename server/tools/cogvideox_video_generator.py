"""CogVideoX-2b video generator — self-hosted text-to-video on Vast.ai GPU instance.

Uses CPU offload for low VRAM (~8 GB peak on RTX 3090).
Text-to-video only (no image input). Returns MP4 URL.

Access via SSH tunnel:   localhost:18766  →  remote:8766
Or direct:              COGVIDEOX_URL=http://171.5.185.97:10100
"""

import asyncio
import os
from typing import Optional

import httpx

COGVIDEOX_BASE = os.environ.get(
    "COGVIDEOX_URL",
    "http://localhost:18766",  # SSH tunnel default
)


class CogVideoXGenerator:
    """Self-hosted CogVideoX-2b video generator."""

    def __init__(self, api_key: Optional[str] = None):
        self.base = COGVIDEOX_BASE.rstrip("/")
        self.headers = {"Content-Type": "application/json"}

    async def generate_video_from_image(
        self,
        prompt: str,
        image_url: str = "",
        duration: int = 5,
        aspect_ratio: str = "4:3",
    ) -> str:
        """Generate a video from a text prompt.

        CogVideoX is text-to-video only; image_url is ignored.
        Returns the public URL of the generated mp4.
        """
        width, height = self._aspect_to_size(aspect_ratio)
        # 49 frames ≈ 6 s at 8 fps; cap duration to ~6 s
        num_frames = min(max(int(duration * 8 / 6), 13), 49)
        num_steps = min(max(int(duration * 2), 10), 25)

        payload = {
            "prompt": prompt,
            "width": width,
            "height": height,
            "num_frames": num_frames,
            "num_inference_steps": num_steps,
            "guidance_scale": 6.0,
        }

        async with httpx.AsyncClient(timeout=600) as client:
            resp = await client.post(
                f"{self.base}/api/generate",
                headers=self.headers,
                json=payload,
            )
            resp.raise_for_status()
            data = resp.json()

        return self._extract_url(data)

    async def get_video(self, filename: str) -> bytes:
        """Download a generated video file by filename."""
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.get(f"{self.base}/output/{filename}")
            resp.raise_for_status()
            return resp.content

    def _extract_url(self, data: dict) -> str:
        filename = data.get("filename", "")
        return f"{self.base}/output/{filename}" if filename else data.get("video_url", "")

    @staticmethod
    def _aspect_to_size(ar: str) -> tuple[int, int]:
        mapping = {
            "16:9": (480, 270),
            "9:16": (270, 480),
            "4:3": (320, 240),
            "3:4": (240, 320),
            "1:1": (256, 256),
        }
        w, h = mapping.get(ar, (320, 240))
        # Round to multiples of 16 (model requirement)
        w = (w // 16) * 16
        h = (h // 16) * 16
        return w, h
