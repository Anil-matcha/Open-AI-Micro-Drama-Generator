import json
import os
from typing import List

from interfaces.character import CharacterInScene
from tools.muapi_llm import MuAPILLM


class CharacterExtractor:
    def __init__(self):
        self.llm = MuAPILLM()

    async def extract_characters(self, script: str) -> List[CharacterInScene]:
        """Extracts characters with visual descriptions from a script."""
        system_prompt = (
            "You are a casting director and character designer. "
            "Your task is to extract all visible characters from a script and provide detailed visual descriptions. "
            "Focus on characteristics that remain consistent (static) and scene-specific details (dynamic). "
            "Respond ONLY with valid JSON — no markdown, no explanation, just JSON."
        )
        prompt = f"""Extract all characters from this script and provide visual descriptions for AI image generation.

Script:
{script}

Return a JSON object with this exact structure:
{{
  "characters": [
    {{
      "idx": 0,
      "name": "Character Name",
      "static_features": "Detailed physical description that never changes: age, gender, ethnicity, hair color/style, eye color, build, distinctive facial features",
      "dynamic_features": "What they are wearing in this scene and any accessories or props they carry",
      "is_visible": true
    }},
    ...
  ]
}}

Rules:
- Only include characters who are visually present in the scene (not just mentioned)
- static_features must be detailed enough for a portrait artist to draw consistently
- dynamic_features should describe their exact outfit and accessories in this scene
- If no specific appearance is mentioned, invent plausible consistent details
- Keep is_visible as true for all characters you include"""

        raw = await self.llm.complete(prompt, system_prompt=system_prompt, timeout=120)
        raw = raw.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        data = json.loads(raw)

        characters = []
        for char_data in data.get("characters", []):
            characters.append(CharacterInScene(**char_data))
        return characters
