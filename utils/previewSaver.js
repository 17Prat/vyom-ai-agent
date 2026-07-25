import fs from 'fs';
import path from 'path';

// Extracts html code blocks and saves them under public/previews/{sessionId}/index.html
export function saveWebsitePreview(sessionId, aiResponseText) {
    if (!sessionId) return null;

    try {
        // Regex to match html markdown blocks: ```html ... ```
        const htmlRegex = /```html([\s\S]*?)```/i;
        const match = aiResponseText.match(htmlRegex);

        if (match && match[1]) {
            const htmlContent = match[1].trim();

            const previewDir = path.join(process.cwd(), 'public', 'previews', sessionId);
            
            // Ensure directory exists
            if (!fs.existsSync(previewDir)) {
                fs.mkdirSync(previewDir, { recursive: true });
            }

            const filePath = path.join(previewDir, 'index.html');
            fs.writeFileSync(filePath, htmlContent, 'utf-8');

            console.log(`💾 Live Preview saved successfully at: ${filePath}`);

            // Return the local preview URL
            const PORT = process.env.PORT || 3000;
            return `http://127.0.0.1:${PORT}/previews/${sessionId}/index.html`;
        }
    } catch (err) {
        console.error("Error saving website preview:", err.message);
    }

    return null;
}
