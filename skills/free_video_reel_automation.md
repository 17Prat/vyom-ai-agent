# 🎬 FREE VIDEO & REEL AUTOMATION SKILL

## Objective
Generate high-retention short-video scripts (Instagram Reels / YouTube Shorts) combined with free visual poster assets. No paid video generation API keys required.

---

## 1. Automated Video Pipeline Strategy
Since heavy 3D AI video generators (like Runway/Luma) require paid credits or enterprise APIs, this skill enforces a **"Smart Content Hybrid Model"**:
1. **Script Structure**: Generates a 30-second scene-by-scene script table (Time, Visual, Voiceover, Overlay Text).
2. **Visual Asset Generation**: Automatically generates a high-definition 8k aesthetic graphic using free open-source endpoints (Pollinations/FLUX) to serve as the background or thumbnail.
3. **Editing Hand-off**: The user or an automated background worker can combine the script + image instantly in free mobile tools (CapCut/Canva).

---

## 2. Video Script Framework (15-30 Seconds)
Every generated reel script must follow this strict matrix:

| Time | Visual / Camera Angle | Voiceover / Audio Script | On-Screen Text / Overlay |
|---|---|---|---|
| **00:00 - 00:03** | Dynamic zoom-in, fast-paced | High-urgency hook question | Bold Hook Text |
| **00:03 - 00:15** | Relatable product/festival B-roll | Story or problem description | Subtle subtitles |
| **00:15 - 00:25** | Core solution / festival offer reveal | Clear marketing message | Key offer highlight |
| **00:25 - 00:30** | Brand logo / final frame | Final CTA ("Tap link below") | "Link in Bio" |

---

## 3. Output Format Requirements
When a video or reel is requested:
1. You MUST generate the complete scene-by-scene script table using the Video Script Framework.
2. You MUST call the `generate_free_video_asset` tool with an enhanced descriptive prompt to generate the 9:16 visual background asset.
3. In your final output, you MUST present the generated script table and the direct image asset URL returned by `generate_free_video_asset`.
