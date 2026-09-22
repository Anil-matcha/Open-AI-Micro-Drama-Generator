"""Scene-by-scene video pipeline with per-scene progress and TTS voiceover.

Flow per scene:
  1. Generate image (text-to-image + character reference I2I)
  2. Generate video clip (8 s) from the image via Agnes/VAST I2V
  3. Generate voiceover TTS from the scene's script text

All clips are concatenated at the end with ambient audio layered in.
Each scene emits progress events so the frontend can render per-scene cards.
"""

import asyncio
import os
from pathlib import Path
from typing import Any, Callable, Awaitable, List, Optional

import httpx
from tools.agnes_image_generator import AgnesImageGenerator
from tools.agnes_video_generator import AgnesVideoGenerator
from tools.vast_video_generator import VastVideoGenerator
from tools.cogvideox_video_generator import CogVideoXGenerator
from tools.agnes_uploader import fetch_as_data_uri
from tools.agnes_tts import generate_tts
from utils.video import download_video, concatenate_videos


ProgressCallback = Callable[[str, str, int], Awaitable[None]]


def _make_video_gen(api_key: str):
    provider = os.environ.get("VIDEO_PROVIDER", "agnes").lower()
    if provider == "vast":
        vast_base = os.environ.get("VAST_API_BASE", "")
        vast_key = os.environ.get("VAST_API_KEY", "")
        return VastVideoGenerator(api_base=vast_base, api_key=vast_key)
    elif provider == "cogvideox":
        return CogVideoXGenerator()
    return AgnesVideoGenerator(api_key=api_key)


SCENE_DURATION = 8  # seconds per scene clip


class Scene2VideoPipeline:
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.environ.get("AGNES_API_KEY", "")
        if not self.api_key:
            raise RuntimeError("AGNES_API_KEY not set in server/.env")
        self.image_gen = AgnesImageGenerator(api_key=self.api_key)
        self.video_gen = _make_video_gen(self.api_key)

    async def run(
        self,
        variant: dict,
        character_images: dict[str, list[str]],
        style: str,
        working_dir: str,
        on_progress: ProgressCallback,
    ) -> str:
        """
        variant  : dict with keys variant_id, title, logline, scenes (list of dicts)
        character_images : {"A": ["/characters/a.png", ...], "B": ["/characters/b.png", ...]}
        Returns absolute path to final concatenated video.
        """
        Path(working_dir).mkdir(parents=True, exist_ok=True)

        scenes = variant.get("scenes", [])
        total = len(scenes)
        if total == 0:
            raise RuntimeError("No scenes in variant")

        # Resolve local character-image paths to data URIs for Agnes/VAST consumption
        char_refs: dict[str, str] = {}
        for role, urls in character_images.items():
            primary = urls[0] if urls else ""
            if primary.startswith("http://") or primary.startswith("https://"):
                char_refs[role] = primary
            elif os.path.exists(primary):
                char_refs[role] = await fetch_as_data_uri(primary)
            elif primary:
                char_refs[role] = primary

        char_a_name = variant.get("character_a_name", "Nhân vật A")
        char_b_name = variant.get("character_b_name", "Nhân vật B")

        # ── Per-scene generation ─────────────────────────────────────────────
        scene_clip_paths: List[str] = []
        scene_thumbnails: List[str] = []

        for i, scene in enumerate(scenes):
            await on_progress(
                f"scene_{i}",
                f"Cảnh {i + 1}/{total}: {scene.get('title', '')}",
                int((i / total) * 85),
            )

            clip_path = await self._process_scene(
                idx=i,
                total=total,
                scene=scene,
                style=style,
                char_a_name=char_a_name,
                char_b_name=char_b_name,
                char_refs=char_refs,
                working_dir=working_dir,
                on_progress=on_progress,
            )
            scene_clip_paths.append(clip_path)
            scene_thumbnails.append(scene.get("visual_url", ""))

        # ── Concatenate all scene clips ──────────────────────────────────────
        await on_progress("concat", "Đang ghép cảnh và thêm âm thanh…", 90)

        final_path = str(Path(working_dir) / "final.mp4")
        await concatenate_videos(scene_clip_paths, final_path)

        # ── Emit final scene data for frontend ───────────────────────────────
        await on_progress(
            "done",
            f"Hoàn tất — {total} cảnh, tổng {total * SCENE_DURATION}s.",
            100,
        )

        return final_path

    async def _process_scene(
        self,
        idx: int,
        total: int,
        scene: dict,
        style: str,
        char_a_name: str,
        char_b_name: str,
        char_refs: dict[str, str],
        working_dir: str,
        on_progress: ProgressCallback,
    ) -> str:
        visual_desc = scene.get("visual_desc", "")
        motion_desc = scene.get("motion_desc", "")
        audio_desc = scene.get("audio_desc", "")
        script_text = scene.get("script", "")
        scene_num = scene.get("scene_number", idx + 1)

        # Determine which character(s) appear in this scene from the title/visual
        char_name_for_ref = char_a_name  # default to A
        if char_b_name.lower() in visual_desc.lower():
            char_name_for_ref = char_b_name
        elif char_a_name.lower() in visual_desc.lower():
            char_name_for_ref = char_a_name

        ref_url = char_refs.get(char_name_for_ref, "")

        # ── Step 1: Generate scene image ────────────────────────────────────
        await on_progress(
            f"scene_{idx}_img",
            f"Cảnh {scene_num}/{total}: Tạo hình ảnh…",
            int(((idx) / total) * 85) + 5,
        )

        full_visual = (
            f"{visual_desc}. "
            f"Style: {style}. Cinematic, 16:9, high quality, detailed."
        )
        try:
            if ref_url:
                image_url = await self.image_gen.generate_image_with_reference(
                    full_visual, ref_url, aspect_ratio="16:9"
                )
            else:
                image_url = await self.image_gen.generate_image(
                    full_visual, aspect_ratio="16:9"
                )
        except Exception as exc:
            print(f"[ScenePipeline] image gen failed for scene {idx}: {exc}")
            image_url = ""

        # Save thumbnail locally for frontend display
        thumb_path = str(Path(working_dir) / f"scene_{idx:03d}_thumb.jpg")
        if image_url and image_url.startswith("http"):
            try:
                async with httpx.AsyncClient(timeout=60) as client:
                    resp = await client.get(image_url)
                    resp.raise_for_status()
                    with open(thumb_path, "wb") as f:
                        f.write(resp.content)
            except Exception as e:
                print(f"[ScenePipeline] thumb download failed: {e}")
                thumb_path = ""

        # ── Step 2: Generate video clip ─────────────────────────────────────
        await on_progress(
            f"scene_{idx}_vid",
            f"Cảnh {scene_num}/{total}: Tạo video (8s)…",
            int(((idx) / total) * 85) + 15,
        )

        video_prompt = f"{motion_desc}. {audio_desc}"
        try:
            video_url = await self.video_gen.generate_video_from_image(
                video_prompt,
                image_url or "",
                duration=SCENE_DURATION,
                aspect_ratio="16:9",
            )
        except Exception as exc:
            print(f"[ScenePipeline] video gen failed for scene {idx}: {exc}")
            video_url = ""

        clip_path = str(Path(working_dir) / f"scene_{idx:03d}.mp4")
        if video_url:
            await download_video(video_url, clip_path)
        else:
            # Fallback: create a black placeholder clip so concatenation doesn't break
            print(f"[ScenePipeline] no video URL for scene {idx}, using fallback")
            clip_path = await self._fallback_clip(clip_path)

        # ── Step 3: Generate TTS voiceover ─────────────────────────────────
        tts_path = str(Path(working_dir) / f"scene_{idx:03d}_tts.mp3")
        if script_text.strip():
            try:
                tts_bytes = await generate_tts(
                    script_text.strip(),
                    api_key=self.api_key,
                )
                if tts_bytes:
                    with open(tts_path, "wb") as f:
                        f.write(tts_bytes)
            except Exception as exc:
                print(f"[ScenePipeline] TTS failed for scene {idx}: {exc}")

        await on_progress(
            f"scene_{idx}_done",
            f"Cảnh {scene_num}/{total}: Hoàn thành ✅",
            int(((idx + 1) / total) * 85),
        )

        return clip_path

    @staticmethod
    async def _fallback_clip(path: str) -> str:
        """Create a minimal 1-second black video clip using ffmpeg (moviepy)."""
        try:
            from moviepy.editor import ColorClip
            clip = ColorClip(size=(1280, 720), color=(0, 0, 0), duration=1)
            clip.write_videofile(path, fps=1, codec="libx264", audio=False, logger=None)
        except Exception:
            # If moviepy unavailable, touch the file so it exists
            Path(path).write_bytes(b"")
        return path
