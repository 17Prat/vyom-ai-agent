import fs from 'fs';
import path from 'path';

export function listSkills() {
    const skillsDir = path.join(process.cwd(), 'skills');
    if (fs.existsSync(skillsDir)) {
        const files = fs.readdirSync(skillsDir);
        return files.filter(file => file.endsWith('.md')).join(', ');
    }
    return 'No skills found.';
}

export function readSkill(skillName) {
    const skillsDir = path.join(process.cwd(), 'skills');
    const filePath = path.join(skillsDir, skillName.endsWith('.md') ? skillName : `${skillName}.md`);

    if (fs.existsSync(filePath)) {
        return fs.readFileSync(filePath, 'utf-8');
    }
    return `Skill ${skillName} not found. Available skills: ${listSkills()}`;
}

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
