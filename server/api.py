import asyncio
import json
import os
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from pipelines.idea2video import Idea2VideoPipeline
from pipelines.script2video import Script2VideoPipeline
from pipelines.scene2video import Scene2VideoPipeline
from agents.character_extractor import CharacterExtractor


# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------
app = FastAPI(title="MicroDrama AI API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ensure outputs directory exists on startup
OUTPUTS_DIR = Path("outputs")
OUTPUTS_DIR.mkdir(exist_ok=True)

# ── Job history persistence (survives server restart) ───────────────────────
HISTORY_FILE = Path("jobs_history.json")


def _load_jobs_history() -> Dict[str, Dict]:
    """Load job metadata from disk. Restores completed/failed jobs, not running ones."""
    if not HISTORY_FILE.exists():
        return {}
    try:
        data = json.loads(HISTORY_FILE.read_text())
        # Only restore non-running jobs (running jobs need their in-memory queue)
        return {jid: info for jid, info in data.items() if info.get("status") != "running"}
    except Exception:
        return {}


def _save_jobs_history(history: Dict[str, Dict]) -> None:
    """Persist job metadata to disk (thread-safe write)."""
    try:
        HISTORY_FILE.write_text(json.dumps(history, ensure_ascii=False, indent=2))
    except Exception:
        pass


# Build initial history from disk
_jobs_history: Dict[str, Dict] = _load_jobs_history()

app.mount("/outputs", StaticFiles(directory="outputs"), name="outputs")


# ---------------------------------------------------------------------------
# In-memory job store
# ---------------------------------------------------------------------------
# job structure:
# {
#   "status": "running" | "completed" | "failed",
#   "events": [...],           # list of JSON-serialisable dicts
#   "video_url": str | None,
#   "error": str | None,
#   "queue": asyncio.Queue,    # fed by pipeline, consumed by SSE
# }
jobs: Dict[str, Dict[str, Any]] = {}

# The Agnes free-tier video queue (and 429 rate limit) breaks when several
# jobs generate videos at the same time, so pipeline runs are serialized
# through this semaphore. Later jobs wait in the queue (a "queue" progress
# event tells the UI it's waiting).
MAX_CONCURRENT_JOBS = int(os.environ.get("MAX_CONCURRENT_JOBS", "1"))
_pipeline_slots = asyncio.Semaphore(MAX_CONCURRENT_JOBS)


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------
class GenerateRequest(BaseModel):
    idea: str
    user_requirement: str = ""
    style: str = "Cinematic"
    mode: str = "idea2video"  # "idea2video" or "script2video"
    script: str = ""          # used when mode == "script2video"


class GenerateResponse(BaseModel):
    job_id: str


class JobResult(BaseModel):
    job_id: str
    status: str
    video_url: str | None = None
    error: str | None = None


class SceneScript(BaseModel):
    scene_number: int
    title: str
    visual_desc: str   # image generation prompt
    motion_desc: str   # camera movement / action for video prompt
    audio_desc: str    # sound effects / dialogue
    script: str = ""   # full screenplay text (optional)


class ScriptVariant(BaseModel):
    variant_id: str
    title: str
    logline: str
    scenes: List[SceneScript]


class GenerateScriptsRequest(BaseModel):
    idea: str
    user_requirement: str = ""
    style: str = "Cinematic"
    character_a_name: str = "Nhân vật A"
    character_a_images: List[str] = []   # pre-loaded reference URLs
    character_b_name: str = "Nhân vật B"
    character_b_images: List[str] = []


class GenerateSceneVideoRequest(BaseModel):
    variant: ScriptVariant
    character_a_name: str = "Nhân vật A"
    character_a_images: List[str] = []
    character_b_name: str = "Nhân vật B"
    character_b_images: List[str] = []
    style: str = "Cinematic"


# ---------------------------------------------------------------------------
# Background pipeline runner
# ---------------------------------------------------------------------------
async def run_pipeline(job_id: str, req: GenerateRequest) -> None:
    job = jobs[job_id]
    queue: asyncio.Queue = job["queue"]

    async def progress_callback(stage: str, message: str, progress: int) -> None:
        event = {
            "type": "progress",
            "stage": stage,
            "message": message,
            "progress": progress,
        }
        job["events"].append(event)
        await queue.put(event)

    # Serialize pipeline runs across the Agnes free-tier video queue. With
    # MAX_CONCURRENT_JOBS == 1 (default) later jobs hold on the semaphore and
    # report "waiting in the pipeline queue" instead of hammering Agnes.
    try:
        async with _pipeline_slots:
            if MAX_CONCURRENT_JOBS == 1:
                await progress_callback(
                    "queue", "Đang chờ trong hàng đợi quy trình...", 0
                )

            if req.mode == "script2video":
                # Script2Video: user provides a single scene script
                pipeline = Script2VideoPipeline()
                character_extractor = CharacterExtractor()

                await progress_callback(
                    "characters", "Extracting characters...", 10
                )
                characters = await character_extractor.extract_characters(
                    req.script or req.idea
                )

                output_dir = str(OUTPUTS_DIR / job_id / "scene_00")
                video_path = await pipeline.run(
                    script=req.script or req.idea,
                    characters=characters,
                    user_requirement=req.user_requirement,
                    style=req.style,
                    working_dir=output_dir,
                    progress_callback=progress_callback,
                    scene_idx=0,
                    base_progress=15,
                    progress_range=80,
                )
            else:
                # Idea2Video: full agentic pipeline
                pipeline = Idea2VideoPipeline()
                video_path = await pipeline.run(
                    idea=req.idea,
                    user_requirement=req.user_requirement,
                    style=req.style,
                    job_id=job_id,
                    progress_callback=progress_callback,
                )

            # Convert local path to URL
            rel_path = Path(video_path).relative_to(Path("."))
            video_url = f"/{rel_path}"

            job["status"] = "completed"
            job["video_url"] = video_url
            job["completed_at"] = int(asyncio.get_event_loop().time() * 1000)

            # Update history
            if job_id in _jobs_history:
                _jobs_history[job_id]["status"] = "completed"
                _jobs_history[job_id]["video_url"] = video_url
                _jobs_history[job_id]["completed_at"] = job["completed_at"]
                _jobs_history[job_id]["events_count"] = len(job["events"])
                _save_jobs_history(_jobs_history)

            complete_event = {
                "type": "complete",
                "video_url": video_url,
                "progress": 100,
            }
            job["events"].append(complete_event)
            await queue.put(complete_event)

    except Exception as exc:
        error_msg = str(exc)
        job["status"] = "failed"
        job["error"] = error_msg
        job["completed_at"] = int(asyncio.get_event_loop().time() * 1000)

        # Update history
        if job_id in _jobs_history:
            _jobs_history[job_id]["status"] = "failed"
            _jobs_history[job_id]["error"] = error_msg
            _jobs_history[job_id]["completed_at"] = job["completed_at"]
            _jobs_history[job_id]["events_count"] = len(job["events"])
            _save_jobs_history(_jobs_history)

        error_event = {
            "type": "error",
            "message": error_msg,
            "progress": -1,
        }
        job["events"].append(error_event)
        await queue.put(error_event)

    finally:
        # Signal SSE consumers that the stream is done
        await queue.put(None)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "microdrama-api"}


@app.get("/api/jobs")
async def list_jobs():
    """Return job history: all completed/failed jobs + currently running jobs."""
    result = []
    # Add in-memory running jobs
    for jid, job in jobs.items():
        if job["status"] == "running":
            result.append({
                "job_id": jid,
                "status": "running",
                "video_url": None,
                "error": None,
                "created_at": None,
                "completed_at": None,
                "events_count": len(job.get("events", [])),
            })
    # Add historical jobs from disk
    for jid, info in _jobs_history.items():
        already = any(j["job_id"] == jid for j in result)
        if not already:
            result.append(info)
    # Sort: running first, then by created_at desc
    result.sort(key=lambda x: (0 if x["status"] == "running" else 1, -(x.get("created_at") or 0)))
    return {"jobs": result}


# ---------------------------------------------------------------------------
# API Monitor endpoints
# ---------------------------------------------------------------------------
@app.get("/api/monitor")
async def monitor():
    """Test LLM / Image / Video APIs and return status for each."""
    import asyncio
    from tools.agnes_llm import AgnesLLM
    from tools.agnes_image_generator import AgnesImageGenerator
    from tools.agnes_video_generator import AgnesVideoGenerator

    results = {}

    async def test_llm():
        try:
            start = asyncio.get_event_loop().time()
            llm = AgnesLLM()
            text = await llm.complete("Reply with exactly: pong", timeout=30)
            elapsed = round(asyncio.get_event_loop().time() - start, 1)
            ok = "pong" in text.lower()
            return {
                "status": "ok" if ok else "degraded",
                "latency_ms": int(elapsed * 1000),
                "response_preview": text[:120],
                "error": None,
            }
        except Exception as e:
            return {"status": "error", "latency_ms": 0, "response_preview": "", "error": str(e)[:300]}

    async def test_image():
        try:
            start = asyncio.get_event_loop().time()
            gen = AgnesImageGenerator()
            url = await gen.generate_image("a red apple on white background", "1:1")
            elapsed = round(asyncio.get_event_loop().time() - start, 1)
            return {
                "status": "ok",
                "latency_ms": int(elapsed * 1000),
                "response_preview": url[:150],
                "error": None,
            }
        except Exception as e:
            return {"status": "error", "latency_ms": 0, "response_preview": "", "error": str(e)[:300]}

    async def test_video():
        """Test whichever video backend is configured:
        - If VIDEO_PROVIDER=vast and VAST_API_BASE is reachable, test VAST
        - Otherwise test Agnes (just submit, don't poll — queue can take minutes)
        Returns status: ok | queue_full | unreachable | error
        """
        provider = os.environ.get("VIDEO_PROVIDER", "agnes").lower()
        vast_base = os.environ.get("VAST_API_BASE", "")
        cogvideox_base = os.environ.get("COGVIDEOX_URL", "http://localhost:18766")

        if provider == "vast" and vast_base:
            return await _test_vast_video(vast_base)
        elif provider == "cogvideox":
            return await _test_cogvideox_video(cogvideox_base)
        else:
            # Test Agnes: submit only, report status (queue_full is expected on free tier)
            return await _test_agnes_video()


    async def _test_agnes_video() -> dict:
        """Submit a video task to Agnes and report what we get back."""
        try:
            import httpx
            gen = AgnesVideoGenerator()
            payload = {
                "model": os.environ.get("KLING_MODEL", "agnes-video-2.5-flash"),
                "prompt": "a gentle pan over calm ocean waves at sunset",
                "seconds": "4",
                "size": os.environ.get("AGNES_VIDEO_SIZE", "720P"),
                "aspect_ratio": "16:9",
                "mode": "keyframe",
                "first_frame": "https://picsum.photos/seed/monitorvid/640/360",
            }
            start = asyncio.get_event_loop().time()
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(
                    f"{os.environ.get('AGNES_BASE_URL', 'https://apihub.agnes-ai.com/v1')}/videos",
                    headers=gen.headers,
                    json=payload,
                )
            elapsed = round(asyncio.get_event_loop().time() - start, 1)

            if resp.status_code in (429, 503):
                return {
                    "status": "queue_full",
                    "latency_ms": int(elapsed * 1000),
                    "response_preview": f"HTTP {resp.status_code} — free tier queue full",
                    "error": None,
                }
            resp.raise_for_status()
            data = resp.json()
            vid = AgnesVideoGenerator._extract_video_id(data)
            return {
                "status": "ok",
                "latency_ms": int(elapsed * 1000),
                "response_preview": f"video_id={vid}" if vid else str(data)[:150],
                "error": None,
            }
        except httpx.ConnectError:
            return {"status": "error", "latency_ms": 0, "response_preview": "", "error": "Cannot connect to Agnes API"}
        except Exception as e:
            return {"status": "error", "latency_ms": 0, "response_preview": "", "error": str(e)[:300]}


    async def _test_vast_video(vast_base: str) -> dict:
        """Submit a video task to VAST and poll until completed or timeout."""
        try:
            import httpx
            from tools.vast_video_generator import VastVideoGenerator, VAST_API_BASE
            vast_key = os.environ.get("VAST_API_KEY", "demo-key")
            gen = VastVideoGenerator(api_key=vast_key)
            start = asyncio.get_event_loop().time()

            # Quick connectivity check first (2s timeout)
            try:
                async with httpx.AsyncClient(timeout=2) as probe:
                    resp = await probe.get(f"{vast_base}/health", follow_redirects=False)
            except (httpx.ConnectError, httpx.ConnectTimeout, httpx.ReadTimeout):
                return {
                    "status": "error",
                    "latency_ms": 0,
                    "response_preview": "",
                    "error": f"VAST gateway không reachable tại {vast_base}",
                }

            # Submit a test job (no polling — VAST takes minutes)
            payload = {
                "prompt": "a gentle pan over calm ocean waves at sunset",
                "image_url": "https://picsum.photos/seed/monitorvid/640/360",
                "duration": 4,
                "aspect_ratio": "16:9",
            }
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.post(
                    f"{vast_base}/api/generate",
                    headers=gen.headers,
                    json=payload,
                )
            elapsed = round(asyncio.get_event_loop().time() - start, 1)

            if resp.status_code == 200:
                data = resp.json()
                job_id = data.get("job_id", "")
                return {
                    "status": "ok",
                    "latency_ms": int(elapsed * 1000),
                    "response_preview": f"job_id={job_id} — đã submit thành công",
                    "error": None,
                }
            elif resp.status_code in (429, 503):
                return {
                    "status": "queue_full",
                    "latency_ms": int(elapsed * 1000),
                    "response_preview": f"HTTP {resp.status_code} — gateway bận",
                    "error": None,
                }
            else:
                resp.raise_for_status()
                return {
                    "status": "error",
                    "latency_ms": int(elapsed * 1000),
                    "response_preview": str(resp.text)[:200],
                    "error": f"HTTP {resp.status_code}",
                }
        except httpx.ConnectError as e:
            return {"status": "error", "latency_ms": 0, "response_preview": "", "error": f"Không kết nối được VAST gateway: {e}"}
        except Exception as e:
            return {"status": "error", "latency_ms": 0, "response_preview": "", "error": str(e)[:300]}

    async def _test_cogvideox_video(cogvideox_base: str) -> dict:
        """Test CogVideoX-2b by hitting the health endpoint."""
        try:
            import httpx
            start = asyncio.get_event_loop().time()
            async with httpx.AsyncClient(timeout=5) as client:
                resp = await client.get(f"{cogvideox_base}/health")
            elapsed = round(asyncio.get_event_loop().time() - start, 1)
            if resp.status_code == 200:
                data = resp.json()
                vram = data.get("vram_miB", 0)
                return {
                    "status": "ok",
                    "latency_ms": int(elapsed * 1000),
                    "response_preview": f"CogVideoX-2b ready · VRAM {vram} MiB",
                    "error": None,
                }
            else:
                return {
                    "status": "error",
                    "latency_ms": int(elapsed * 1000),
                    "response_preview": f"HTTP {resp.status_code}",
                    "error": str(resp.text)[:200],
                }
        except httpx.ConnectError:
            return {
                "status": "error",
                "latency_ms": 0,
                "response_preview": "",
                "error": f"Không kết nối được CogVideoX tại {cogvideox_base} — kiểm tra tunnel hoặc COGVIDEOX_URL",
            }
        except Exception as e:
            return {"status": "error", "latency_ms": 0, "response_preview": "", "error": str(e)[:300]}

    # Run all three tests concurrently
    llm_result, image_result, video_result = await asyncio.gather(
        test_llm(), test_image(), test_video()
    )

    results["llm"] = llm_result
    results["image"] = image_result
    results["video"] = video_result

    overall = "ok" if all(r["status"] != "error" for r in results.values()) else "degraded"
    return {"overall": overall, "apis": results}


@app.post("/api/generate", response_model=GenerateResponse)
async def generate(req: GenerateRequest, background_tasks: BackgroundTasks):
    job_id = str(uuid.uuid4())
    jobs[job_id] = {
        "status": "running",
        "events": [],
        "video_url": None,
        "error": None,
        "queue": asyncio.Queue(),
        "created_at": int(asyncio.get_event_loop().time() * 1000),
    }
    _jobs_history[job_id] = {
        "job_id": job_id,
        "status": "running",
        "video_url": None,
        "error": None,
        "created_at": int(asyncio.get_event_loop().time() * 1000),
        "completed_at": None,
        "events_count": 0,
        "title": req.idea[:50] if req.idea else "",
    }
    _save_jobs_history(_jobs_history)
    background_tasks.add_task(run_pipeline, job_id, req)
    return GenerateResponse(job_id=job_id)


@app.get("/api/status/{job_id}")
async def status_stream(job_id: str):
    """SSE endpoint — streams progress events until job completes or fails."""
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")

    job = jobs[job_id]

    async def event_generator():
        # Replay already-emitted events first (in case client reconnects)
        for event in job["events"]:
            yield f"data: {json.dumps(event)}\n\n"

        # If job is already done, we've replayed everything — finish
        if job["status"] in ("completed", "failed"):
            return

        # Otherwise stream live events from queue
        queue: asyncio.Queue = job["queue"]
        while True:
            event = await queue.get()
            if event is None:
                # Sentinel — pipeline finished
                break
            yield f"data: {json.dumps(event)}\n\n"
            if event.get("type") in ("complete", "error"):
                break

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/api/result/{job_id}", response_model=JobResult)
async def get_result(job_id: str):
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")

    job = jobs[job_id]
    return JobResult(
        job_id=job_id,
        status=job["status"],
        video_url=job.get("video_url"),
        error=job.get("error"),
    )


async def _generate_scripts(req: GenerateScriptsRequest) -> List[ScriptVariant]:
    """Use the Screenwriter agent to produce 2-4 script variants, each with 4-5 scenes."""
    from agents.screenwriter import Screenwriter

    screenwriter = Screenwriter()

    char_a_intro = f"{req.character_a_name}: " + (
        "Character reference images provided" if req.character_a_images else "No reference"
    )
    char_b_intro = f"{req.character_b_name}: " + (
        "Character reference images provided" if req.character_b_images else "No reference"
    )

    system_prompt = (
        "You are a professional screenwriter and director. "
        "You will create multiple creative variants of a short film script. "
        "Each variant must have exactly 4-5 scenes. "
        "For each scene, provide: title, visual_desc (image prompt), motion_desc (camera/action), "
        "audio_desc (sound/dialogue), and full screenplay script text. "
        "Respond ONLY with valid JSON — no markdown, no explanation."
    )

    prompt = f"""Create 3 different script variants for a short micro-drama based on this idea.

Idea: {req.idea}
Style: {req.style}
Additional requirements: {req.user_requirement or "None"}
Characters: {char_a_intro}, {char_b_intro}

Return a JSON object with this exact structure:
{{
  "variants": [
    {{
      "variant_id": "A",
      "title": "Short compelling title",
      "logline": "One-sentence summary of the variant's twist",
      "scenes": [
        {{
          "scene_number": 1,
          "title": "Scene title",
          "visual_desc": "Detailed visual description for image generation — setting, lighting, character appearance, mood",
          "motion_desc": "Camera movement and character motion description for video generation",
          "audio_desc": "Sound effects, ambient noise, and any dialogue",
          "script": "Full screenplay scene text with action lines and dialogue"
        }}
      ]
    }}
  ]
}}

Rules:
- Create exactly 3 variants (variant_id: A, B, C) with distinct creative directions
- Each variant must have exactly 4-5 scenes
- Scenes should flow as a complete story arc (setup → confrontation → resolution)
- visual_desc should be detailed enough for AI image generation
- motion_desc should describe camera movement and character actions
- audio_desc should include ambient sounds, effects, and dialogue
- Make each variant feel different in tone or approach"""

    raw = await screenwriter.llm.complete(
        prompt, system_prompt=system_prompt, timeout=300
    )
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.lower().startswith("json"):
            raw = raw[4:]

    # Tolerant JSON parse
    data = None
    for attempt in (raw, screenwriter._repair_json(raw)):
        try:
            data = json.loads(attempt)
            break
        except json.JSONDecodeError:
            continue

    if data is None:
        raise RuntimeError("Screenwriter returned unparseable JSON for script variants")

    variants_data = data.get("variants", [])
    if not variants_data:
        raise RuntimeError("Screenwriter returned no variants")

    variants = []
    for v in variants_data[:4]:  # cap at 4
        scenes = []
        for s in v.get("scenes", [])[:5]:  # cap at 5 scenes
            scenes.append(SceneScript(**s))
        variants.append(ScriptVariant(
            variant_id=v.get("variant_id", ""),
            title=v.get("title", ""),
            logline=v.get("logline", ""),
            scenes=scenes,
        ))
    return variants


@app.post("/api/generate-scripts")
async def generate_scripts(req: GenerateScriptsRequest):
    """Generate 2-4 script variants for the user to choose from."""
    try:
        variants = await _generate_scripts(req)
        return {"variants": [v.model_dump() for v in variants]}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


async def run_scene_pipeline(job_id: str, req: GenerateSceneVideoRequest) -> None:
    """Run the per-scene video pipeline and stream progress via SSE."""
    job = jobs[job_id]
    queue: asyncio.Queue = job["queue"]

    async def progress(stage: str, message: str, pct: int) -> None:
        event = {"type": "progress", "stage": stage, "message": message, "progress": pct}
        job["events"].append(event)
        await queue.put(event)

    # Build character-images map from the request
    char_images: dict[str, list[str]] = {
        req.character_a_name: req.character_a_images,
        req.character_b_name: req.character_b_images,
    }

    try:
        async with _pipeline_slots:
            if MAX_CONCURRENT_JOBS == 1:
                await progress("queue", "Đang chờ trong hàng đợi quy trình…", 0)

            pipeline = Scene2VideoPipeline(api_key=job.get("_api_key"))
            working_dir = str(OUTPUTS_DIR / job_id / "scenes")

            variant_dump = req.variant.model_dump()
            variant_dump["character_a_name"] = req.character_a_name
            variant_dump["character_b_name"] = req.character_b_name

            video_path = await pipeline.run(
                variant=variant_dump,
                character_images=char_images,
                style=req.style,
                working_dir=working_dir,
                on_progress=progress,
            )

            rel_path = Path(video_path).relative_to(Path("."))
            video_url = f"/{rel_path}"

            job["status"] = "completed"
            job["video_url"] = video_url
            job["completed_at"] = int(asyncio.get_event_loop().time() * 1000)

            # Update history
            if job_id in _jobs_history:
                _jobs_history[job_id]["status"] = "completed"
                _jobs_history[job_id]["video_url"] = video_url
                _jobs_history[job_id]["completed_at"] = job["completed_at"]
                _jobs_history[job_id]["events_count"] = len(job["events"])
                _save_jobs_history(_jobs_history)

            complete_event = {
                "type": "complete",
                "video_url": video_url,
                "progress": 100,
                "scenes": [
                    {
                        "scene_number": s.scene_number,
                        "title": s.title,
                        "visual_desc": s.visual_desc,
                        "motion_desc": s.motion_desc,
                        "audio_desc": s.audio_desc,
                        "script": s.script,
                    }
                    for s in req.variant.scenes
                ],
            }
            job["events"].append(complete_event)
            await queue.put(complete_event)

    except Exception as exc:
        error_msg = str(exc)
        job["status"] = "failed"
        job["error"] = error_msg
        job["completed_at"] = int(asyncio.get_event_loop().time() * 1000)

        # Update history
        if job_id in _jobs_history:
            _jobs_history[job_id]["status"] = "failed"
            _jobs_history[job_id]["error"] = error_msg
            _jobs_history[job_id]["completed_at"] = job["completed_at"]
            _jobs_history[job_id]["events_count"] = len(job["events"])
            _save_jobs_history(_jobs_history)

        error_event = {"type": "error", "message": error_msg, "progress": -1}
        job["events"].append(error_event)
        await queue.put(error_event)
    finally:
        await queue.put(None)


@app.post("/api/generate-scene-video", response_model=GenerateResponse)
async def generate_scene_video(req: GenerateSceneVideoRequest, background_tasks: BackgroundTasks):
    """Generate a full video scene-by-scene with per-scene progress (SSE)."""
    job_id = str(uuid.uuid4())
    jobs[job_id] = {
        "status": "running",
        "events": [],
        "video_url": None,
        "error": None,
        "queue": asyncio.Queue(),
        "_api_key": os.environ.get("AGNES_API_KEY", ""),
        "created_at": int(asyncio.get_event_loop().time() * 1000),
    }
    _jobs_history[job_id] = {
        "job_id": job_id,
        "status": "running",
        "video_url": None,
        "error": None,
        "created_at": int(asyncio.get_event_loop().time() * 1000),
        "completed_at": None,
        "events_count": 0,
        "title": req.variant.title if req.variant else "",
    }
    _save_jobs_history(_jobs_history)
    background_tasks.add_task(run_scene_pipeline, job_id, req)
    return GenerateResponse(job_id=job_id)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api:app", host="0.0.0.0", port=8000, reload=True)
