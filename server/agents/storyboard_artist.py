import json
import os
from typing import List

from interfaces.character import CharacterInScene
from interfaces.shot import ShotBriefDescription
from tools.muapi_llm import MuAPILLM


class StoryboardArtist:
    def __init__(self):
        self.llm = MuAPILLM()

    async def design_storyboard(
        self,
        script: str,
        characters: List[CharacterInScene],
        user_requirement: str,
    ) -> List[ShotBriefDescription]:
        """Breaks a scene script into shots with visual/motion descriptions."""
        system_prompt = (
            "You are a professional storyboard artist and cinematographer. "
            "Your task is to break a scene script into individual shots suitable for AI video generation. "
            "Each shot should have a clear visual description, camera movement, and audio description. "
            "Keep shots between 3-6 seconds each (they will be 5-second video clips). "
            "Respond ONLY with valid JSON — no markdown, no explanation, just JSON."
        )

        character_descriptions = "\n".join(
            [
                f"- {c.name}: {c.static_features}. Wearing: {c.dynamic_features}"
                for c in characters
                if c.is_visible
            ]
        )

        prompt = f"""Design a storyboard for this scene script by breaking it into individual shots.

Scene Script:
{script}

Characters in this scene:
{character_descriptions if character_descriptions else "No named characters"}

Style requirement: {user_requirement if user_requirement else "Cinematic, professional"}

Return a JSON object with this exact structure:
{{
  "shots": [
    {{
      "idx": 0,
      "visual_desc": "Detailed visual description of exactly what is seen in this shot — location, lighting, character positions, expressions, props. Write as a detailed prompt for an AI image generator. Include character names if they appear.",
      "motion_desc": "Camera movement and action: e.g., 'slow push in on character face as they turn to look at camera, shallow depth of field, golden hour lighting'",
      "audio_desc": "Sound design: ambient sounds, music mood, dialogue snippet if any, e.g., 'soft orchestral swell, distant city noise, character whispers: find it'"
    }},
    ...
  ]
}}

Rules:
- Create 3-5 shots per scene
- visual_desc should be rich enough for standalone image generation (100-150 words)
- motion_desc should be concise but specific (20-50 words) — this becomes the video prompt
- Each shot should advance the narrative
- Include establishing shot, action shots, and a closing shot"""

        raw = await self.llm.complete(prompt, system_prompt=system_prompt, timeout=120)
        raw = raw.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        data = json.loads(raw)

        shots = []
        for shot_data in data.get("shots", []):
            shots.append(ShotBriefDescription(**shot_data))
        return shots
