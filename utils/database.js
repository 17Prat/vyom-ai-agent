import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'brahmand.db');
const db = new Database(dbPath);

// Initialize SQLite Database & Tables
export function initDatabase() {
    db.prepare(`
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `).run();
    console.log("💾 SQLite Database & 'messages' table initialized successfully.");
}

// Save a chat message to persistent database
export function saveMessage(sessionId, role, content) {
    const insert = db.prepare(`
        INSERT INTO messages (session_id, role, content)
        VALUES (?, ?, ?)
    `);
    insert.run(sessionId, role, content);
}

// Retrieve message history formatted for AI completion context
export function getSessionHistory(sessionId, limit = 10) {
    const select = db.prepare(`
        SELECT role, content FROM messages
        WHERE session_id = ?
        ORDER BY id DESC
        LIMIT ?
    `);
    const rows = select.all(sessionId, limit);
    // Reverse to get chronological order (oldest to newest)
    return rows.reverse();
}

// Initialize database immediately upon importing this utility module
initDatabase();
