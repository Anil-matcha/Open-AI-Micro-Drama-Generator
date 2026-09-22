
import base64
import os
import tempfile
from pathlib import Path
from typing import Optional

import httpx


def _to_data_uri(path: str) -> str:
    """Read a local image file and return a base64 data URI."""
    with open(path, "rb") as f:
        b64 = base64.b64encode(f.read()).decode("utf-8")
    ext = Path(path).suffix.lower().replace(".", "")
    ext = ext if ext in ("png", "jpg", "jpeg", "webp") else "png"
    return f"data:image/{ext};base64,{b64}"


async def fetch_as_data_uri(url: str) -> str:
    """Download a remote image and return it as a base64 data URI.

    Falls back to returning the original URL unchanged when it is already a
    data URI or the fetch fails, so callers can still use it.
    """
    if not url:
        return url
    if url.startswith("data:"):
        return url

    try:
        async with httpx.AsyncClient(timeout=60, follow_redirects=True) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            content = resp.content
            ct = resp.headers.get("content-type", "image/png").split(";")[0]
        mime = ct if ct.startswith("image/") else "image/png"
        b64 = base64.b64encode(content).decode("utf-8")
        return f"data:{mime};base64,{b64}"
    except Exception as e:
        print(f"[AgnesUploader] could not fetch {url} ({e}); passing through.")
        return url


async def upload_image_from_url(url: str, api_key: Optional[str] = None) -> str:
    """Return an image reference usable by the Agnes API.

    Agnes image/video endpoints accept public URLs or base64 data URIs.
    Instead of re-uploading (MuAPI pattern), we convert local and served
    images to data URIs so Agnes can always read them.
    """
    if not url:
        return url
    if url.startswith("data:"):
        return url
    if os.path.exists(url):
        return _to_data_uri(url)
    return await fetch_as_data_uri(url)
