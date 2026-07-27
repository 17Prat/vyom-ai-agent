# gpt-image
Agent runbook for Image generation/editing. Use the prompt library + packaged CLI.

## Operating Loop
1. **Classify Request**: Identify asset type, exact text, aspect ratio, references, safety constraints, and quality.
2. **Refine with Craft**: Create dense visual prompts including lighting, artistic style, aspect ratio (1k, 1024x1024, square, portrait, landscape), and detail level.
3. **Execute**: Generate high quality visual outputs using visual generation pipeline.
4. **Report**: Return output response with prompt parameters, size, quality, and refinement options.

## Quality & Size Policy
- **Square / Social**: 1k / 1024x1024
- **Poster / Mobile**: Portrait
- **Landscape / Hero Banner**: Landscape

## Output Format
When an image is requested, return:
- Detailed refined prompt
- Size & Quality specifications
- Visual image asset
