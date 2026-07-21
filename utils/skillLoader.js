import fs from 'fs';
import path from 'path';

export function loadAllSkills() {
    const skillsDir = path.join(process.cwd(), 'skills');
    let combinedSkills = '';

    if (fs.existsSync(skillsDir)) {
        const files = fs.readdirSync(skillsDir);
        files.forEach((file) => {
            if (file.endsWith('.md')) {
                const filePath = path.join(skillsDir, file);
                const content = fs.readFileSync(filePath, 'utf-8');
                combinedSkills += `\n\n=== SKILL / BUSINESS RULE: ${file} ===\n${content}`;
            }
        });
    }

    return combinedSkills;
}
