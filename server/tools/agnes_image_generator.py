"""Agnes image generator — text-to-image and image-to-image.

Drop-in replacement for MuAPIImageGenerator.
- generate_image(prompt, aspect_ratio) -> URL
- generate_image_with_reference(prompt, reference_url, aspect_ratio) -> URL
"""

import os
from typing import Optional

import httpx

AGNES_BASE = os.environ.get("AGNES_BASE_URL", "https://apihub.agnes-ai.com/v1")
DEFAULT_IMAGE_MODEL = os.environ.get("AGNES_IMAGE_MODEL", "agnes-image-2.5-flash")


def _ratio_to_size(aspect_ratio: str) -> str:
    """Agnes accepts ratio strings like 16:9, 9:16, 1:1, 2:3, 3:4."""
    r = (aspect_ratio or "1:1").upper().replace("X", ":")
    if r not in ("1:1", "3:4", "4:3", "16:9", "9:16", "2:3", "3:2", "21:9"):
        r = "1:1"
    return r


class AgnesImageGenerator:
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.environ.get("AGNES_API_KEY", "")
        if not self.api_key:
            raise RuntimeError("AGNES_API_KEY not set. Put it in server/.env.")
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    async def generate_image(self, prompt: str, aspect_ratio: str = "1:1") -> str:
        """Generate a character portrait. Returns a URL of the generated image."""
        return await self._run(prompt=prompt, ratio=aspect_ratio)

    async def generate_image_with_reference(
        self,
        prompt: str,
        reference_url: str,
        aspect_ratio: str = "16:9",
    ) -> str:
        """Generate a scene frame using a character reference image."""
        return await self._run(prompt=prompt, ratio=aspect_ratio, image=reference_url)

    async def _run(self, prompt: str, ratio: str, image: Optional[str] = None) -> str:
        payload = {
            "model": os.environ.get("PORTRAIT_MODEL", DEFAULT_IMAGE_MODEL),
            "prompt": prompt,
            "size": os.environ.get("AGNES_IMAGE_SIZE", "2K"),
            "ratio": _ratio_to_size(ratio),
            "n": 1,
        }
        if image:
            # Agnes image-to-image takes a public URL or base64 data URI
            payload["image"] = [image] if isinstance(image, str) else image

        async with httpx.AsyncClient(timeout=300) as client:
            resp = await client.post(
                f"{AGNES_BASE}/images/generations",
                headers=self.headers,
                json=payload,
            )
            resp.raise_for_status()
            data = resp.json()

        item = data.get("data")
        if isinstance(item, list):
            item = item[0] if item else None
        url = (item or {}).get("url") or (item or {}).get("b64_json")
        if not url:
            raise ValueError(f"Agnes did not return an image: {str(data)[:300]}")
        return url
