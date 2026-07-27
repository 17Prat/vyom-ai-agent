# FLUX & MIDJOURNEY IMAGE PROMPT GENERATOR SKILL

## Objective
Convert raw marketing post concepts into ultra-high-quality, highly detailed image generation prompts specifically tailored for FLUX.1 / Midjourney v6 / DALL-E 3 models.

## Prompt Engineering Rules

### 1. Structure Formula
`[Subject] + [Environment/Background] + [Lighting & Color Palette] + [Style/Medium] + [Camera/Composition] + [Quality Modifiers]`

### 2. Cultural & Visual Element Guidelines
- **Diwali**: Glowing brass Diya lamps, vibrant rangoli patterns, bokeh fairy lights, warm golden/amber palette, celebratory atmosphere.
- **Holi**: Organic vibrant gulal powders exploding in slow motion, festive crowd, bright sunny lighting, cinematic particle effect.
- **Independence Day / Corporate**: Modern Indian cityscape, aesthetic tricolor accents (saffron, white, green), clean minimalistic workspace design.
- **New Year / Sales**: Neon light typography, sleek metallic textures, dark premium backdrop, 3D render style.

### 3. Aesthetics & Quality Rules
- **Avoid Text in Images**: Never include complex sentence text in image prompts (Image models mess up spelling). Focus purely on visual elements.
- **Style Modifiers to Include**: "Photorealistic 8k, Octane render 3D, dramatic volumetric lighting, cinematic depth of field, minimalist graphic layout, highly detailed texture, 1:1 aspect ratio".

## Output JSON Schema Requirement
When generating image instructions for the orchestrator, ALWAYS output the visual prompt in this exact key:
`"image_prompt": "A modern futuristic 3D workspace with vibrant traditional Diya lamps, warm festive amber lighting, sleek laptop with neon glow, photorealistic 8k, Octane render, cinematic depth of field, 1:1 aspect ratio"`
