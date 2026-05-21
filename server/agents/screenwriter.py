import json
import os
from typing import List

from tools.muapi_llm import MuAPILLM


class Screenwriter:
    def __init__(self):
        self.llm = MuAPILLM()

    async def develop_story(self, idea: str, user_requirement: str) -> str:
        """Takes an idea and develops a full story outline."""
        system_prompt = (
            "You are a professional screenwriter and story developer. "
            "Your task is to expand a brief idea into a compelling story outline. "
            "Include premise, protagonist, conflict, rising action, climax, and resolution. "
            "Keep it suitable for a short video (1-3 minutes). "
            "Write in clear prose, focusing on visual storytelling."
        )
        prompt = f"""Develop a story based on this idea:

Idea: {idea}

Additional requirements: {user_requirement if user_requirement else "None"}

Write a detailed story outline that can be translated into a short video. Include:
- Setting and atmosphere
- Main character(s) and their goal
- The conflict or journey
- Emotional arc
- Visual climax moment
- Resolution

Write the story outline as flowing prose."""

        return await self.llm.complete(prompt, system_prompt=system_prompt, timeout=120)

    async def write_script_based_on_story(self, story: str, user_requirement: str) -> List[str]:
        """Takes a story outline and writes scene scripts. Returns list of scene scripts."""
        system_prompt = (
            "You are a professional screenwriter. "
            "Your task is to break a story outline into individual scene scripts. "
            "Each scene should be self-contained, visually rich, and suitable for video generation. "
            "Write 2-4 scenes maximum. "
            "Respond ONLY with valid JSON — no markdown, no explanation, just JSON."
        )
        prompt = f"""Based on this story outline, write individual scene scripts for a short video.

Story Outline:
{story}

Additional requirements: {user_requirement if user_requirement else "None"}

Return a JSON object with this exact structure:
{{
  "scenes": [
    {{
      "scene_number": 1,
      "title": "Scene title",
      "script": "Full scene script with action lines, dialogue, and scene description. Should be 100-200 words per scene."
    }},
    ...
  ]
}}

Rules:
- Create 2-4 scenes that together tell the complete story
- Each scene script should be visually descriptive and filmable
- Include character actions, dialogue, and environmental details
- Scenes should flow naturally from one to the next"""

        raw = await self.llm.complete(prompt, system_prompt=system_prompt, timeout=120)
        raw = raw.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        data = json.loads(raw)
        return [scene["script"] for scene in data.get("scenes", [])]
