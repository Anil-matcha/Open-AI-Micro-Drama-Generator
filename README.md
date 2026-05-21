# ViGen — Agentic AI Video Generation

ViGen is a multi-agent video generation web app. You provide an idea or script; a coordinated pipeline of AI agents writes the story, designs the storyboard, generates frames, and produces a complete cinematic video — automatically, powered entirely by [MuAPI](https://muapi.ai).

---

## Architecture

```
Idea / Script
     │
     ▼
┌─────────────────────────────────────────────────────────┐
│                    FastAPI Server                        │
│                                                         │
│  ┌─────────────────┐     ┌──────────────────────────┐   │
│  │ Screenwriter    │ ──► │ Scene scripts (2-4)      │   │
│  │ (Claude)        │     └──────────────────────────┘   │
│  └─────────────────┘                  │                 │
│                                       ▼                 │
│  ┌─────────────────┐     ┌──────────────────────────┐   │
│  │ CharacterExtra- │ ──► │ Character descriptions   │   │
│  │ ctor (Claude)   │     └──────────────────────────┘   │
│  └─────────────────┘                  │                 │
│                                       ▼                 │
│  ┌─────────────────┐     ┌──────────────────────────┐   │
│  │ Storyboard      │ ──► │ Shots (3-5 per scene)    │   │
│  │ Artist (Claude) │     └──────────────────────────┘   │
│  └─────────────────┘                  │                 │
│                                       ▼                 │
│  ┌────────────────────────────────────────────────────┐ │
│  │ MuAPI Tools                                        │ │
│  │  • Portrait Generator (flux-dev T2I)               │ │
│  │  • Frame Generator (flux-kontext I2I or T2I)       │ │
│  │  • Video Generator (kling-v2.1 I2V)                │ │
│  └────────────────────────────────────────────────────┘ │
│                                       │                 │
│  ┌─────────────────┐                  ▼                 │
│  │ Concatenator    │ ◄── Clips per shot / scene        │
│  │ (moviepy)       │                                    │
│  └─────────────────┘                  │                 │
│                                       ▼                 │
│                              final_video.mp4            │
└─────────────────────────────────────────────────────────┘
```

### Pipeline stages

| Stage | Agent/Tool | What it does |
|-------|-----------|--------------|
| Story | Screenwriter (Claude) | Expands idea into a story outline |
| Characters | Character Extractor (Claude) | Pulls characters + visual descriptions |
| Scene scripts | Screenwriter (Claude) | Writes 2-4 individual scene scripts |
| Portraits | MuAPI flux-dev T2I | Reference portrait image per character |
| Storyboard | Storyboard Artist (Claude) | 3-5 shots per scene with visual/motion/audio |
| Frames | MuAPI flux-kontext I2I / flux-dev T2I | First frame per shot (with character consistency) |
| Video clips | MuAPI kling-v2.1 I2V | 5-second video per shot |
| Concat | moviepy | All clips joined into final video |

---

## Project structure

```
GPT-Actions/
├── server/
│   ├── api.py                    # FastAPI app (SSE progress, job tracking)
│   ├── requirements.txt
│   ├── .env.example
│   ├── agents/
│   │   ├── screenwriter.py       # develop_story, write_script_based_on_story
│   │   ├── character_extractor.py
│   │   └── storyboard_artist.py
│   ├── interfaces/
│   │   ├── character.py          # CharacterInScene pydantic model
│   │   └── shot.py               # ShotBriefDescription, ShotDescription
│   ├── tools/
│   │   ├── muapi_image_generator.py  # T2I + I2I via MuAPI
│   │   ├── muapi_video_generator.py  # I2V via MuAPI
│   │   └── muapi_uploader.py         # upload_file helper
│   ├── pipelines/
│   │   ├── idea2video.py         # Full end-to-end pipeline
│   │   └── script2video.py       # Scene-level pipeline
│   └── utils/
│       └── video.py              # moviepy concatenation
└── client/
    ├── app/
    │   ├── layout.js
    │   ├── page.js               # Landing + form
    │   └── generate/[jobId]/
    │       └── page.js           # Progress + result
    └── components/
        ├── IdeaForm.js           # Input form
        ├── PipelineProgress.js   # SSE-driven progress UI
        └── VideoResult.js        # Video player + download
```

---

## Setup

### Environment variables

Copy `.env.example` and fill in your keys:

```bash
cd server
cp .env.example .env
```

Required variables:
- `MUAPI_KEY` — your [MuAPI](https://muapi.ai) API key (used for all LLM, image, and video generation)

### Server

```bash
cd server
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn api:app --reload --port 8000
```

### Client

```bash
cd client
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Usage

1. Open the app in your browser.
2. Enter an idea (e.g. "A time-traveller arrives in Renaissance Florence").
3. Choose visual style (Cinematic, Anime, Fantasy, etc.).
4. Click **Generate Video**.
5. Watch the pipeline progress in real-time via the animated stage timeline.
6. Download or view your final video when it completes.

### Modes

- **Idea to Video** — Full agentic pipeline: the AI develops story, characters, scenes, storyboard, and video from scratch.
- **Script to Video** — Provide your own scene script; the pipeline handles storyboard, frames, and video generation.

---

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/generate` | Start a generation job |
| GET | `/api/status/{job_id}` | SSE stream of progress events |
| GET | `/api/result/{job_id}` | Get final job result |
| GET | `/api/health` | Health check |

### SSE event format

```json
{"type": "progress", "stage": "screenwriter", "message": "Developing story...", "progress": 10}
{"type": "complete", "video_url": "/outputs/job_id/final_video.mp4", "progress": 100}
{"type": "error", "message": "...", "progress": -1}
```
