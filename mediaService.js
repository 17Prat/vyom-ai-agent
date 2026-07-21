import Replicate from 'replicate';

const replicate = process.env.REPLICATE_API_TOKEN
    ? new Replicate({ auth: process.env.REPLICATE_API_TOKEN })
    : null;

export async function generatePosterImage(prompt) {
    if (!replicate) {
        console.warn("Replicate Token not found, skipping image generation.");
        return null;
    }

    try {
        const output = await replicate.run(
            "black-forest-labs/flux-schnell",
            {
                input: {
                    prompt: prompt,
                    go_fast: true,
                    num_outputs: 1,
                    aspect_ratio: "1:1", // Instagram Square Post
                    output_format: "webp"
                }
            }
        );
        return output[0]; // Returns Image URL
    } catch (err) {
        console.error("Image Gen Error:", err.message);
        return null;
    }
}