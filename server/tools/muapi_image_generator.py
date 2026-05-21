import asyncio
import os
from typing import Optional

import httpx


MUAPI_BASE = "https://api.muapi.ai/api/v1"
POLL_INTERVAL = 3  # seconds


class MuAPIImageGenerator:
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.environ["MUAPI_KEY"]
        self.headers = {"x-api-key": self.api_key, "Content-Type": "application/json"}

    async def generate_image(
        self, prompt: str, width: int = 1024, height: int = 1024
    ) -> str:
        """Generate an image from a text prompt. Returns URL of generated image."""
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                f"{MUAPI_BASE}/flux-dev-image",
                headers=self.headers,
                json={"prompt": prompt, "width": width, "height": height},
            )
            resp.raise_for_status()
            data = resp.json()

        request_id = data.get("request_id") or data.get("id")
        if not request_id:
            raise ValueError(f"No request_id in response: {data}")

        result = await self._poll_until_done(request_id, timeout=300)
        outputs = result.get("outputs", [])
        if not outputs:
            raise ValueError(f"No outputs in result: {result}")

        output = outputs[0]
        if isinstance(output, dict):
            return output.get("url") or output.get("image_url") or str(output)
        return str(output)

    async def generate_image_with_reference(
        self,
        prompt: str,
        reference_url: str,
        aspect_ratio: str = "16:9",
    ) -> str:
        """Generate an image using a reference image for character consistency. Returns URL."""
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                f"{MUAPI_BASE}/flux-kontext-dev-i2i",
                headers=self.headers,
                json={
                    "prompt": prompt,
                    "images_list": [reference_url],
                    "aspect_ratio": aspect_ratio,
                },
            )
            resp.raise_for_status()
            data = resp.json()

        request_id = data.get("request_id") or data.get("id")
        if not request_id:
            raise ValueError(f"No request_id in response: {data}")

        result = await self._poll_until_done(request_id, timeout=300)
        outputs = result.get("outputs", [])
        if not outputs:
            raise ValueError(f"No outputs in result: {result}")

        output = outputs[0]
        if isinstance(output, dict):
            return output.get("url") or output.get("image_url") or str(output)
        return str(output)

    async def _poll_until_done(self, request_id: str, timeout: int = 300) -> dict:
        """Poll MuAPI until the job completes or timeout is reached."""
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
                    return data
                elif status == "failed":
                    raise RuntimeError(
                        f"MuAPI image job {request_id} failed: {data.get('error', 'unknown error')}"
                    )
                elif status == "cancelled":
                    raise RuntimeError(f"MuAPI image job {request_id} was cancelled")
                # queued / pending / processing — keep polling

        raise TimeoutError(
            f"MuAPI image job {request_id} did not complete within {timeout}s"
        )
