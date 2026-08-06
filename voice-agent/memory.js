import Database from 'better-sqlite3';
import { config } from './config.js';

let db = null;
try {
    db = new Database(config.DB_PATH);
    db.exec(`
        CREATE TABLE IF NOT EXISTS voice_profiles (
            phone TEXT PRIMARY KEY,
            name TEXT,
            interest_level TEXT,
            app_installed INTEGER DEFAULT 0,
            favorite_deity TEXT,
            last_called DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS voice_calls (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            phone TEXT,
            duration_seconds INTEGER,
            summary TEXT,
            transcript TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);
} catch (e) {
    console.warn("⚠️ SQLite database not available. Using in-memory fallback.", e.message);
}

export function fetchUserProfile(phone) {
    if (!db) return { phone, name: "Pratham", interest_level: "High", app_installed: 0 };
    try {
        const stmt = db.prepare('SELECT * FROM voice_profiles WHERE phone = ?');
        const row = stmt.get(phone);
        return row || { phone, name: "User", interest_level: "Unknown", app_installed: 0 };
    } catch (err) {
        return { phone, name: "User" };
    }
}

export function saveUserProfile(phone, profile) {
    if (!db) return;
    try {
        const stmt = db.prepare(`
            INSERT INTO voice_profiles (phone, name, interest_level, app_installed, favorite_deity, last_called)
            VALUES (@phone, @name, @interest_level, @app_installed, @favorite_deity, CURRENT_TIMESTAMP)
            ON CONFLICT(phone) DO UPDATE SET
                name = excluded.name,
                interest_level = excluded.interest_level,
                app_installed = excluded.app_installed,
                favorite_deity = excluded.favorite_deity,
                last_called = CURRENT_TIMESTAMP
        `);
        stmt.run({
            phone,
            name: profile.name || 'User',
            interest_level: profile.interest_level || 'Unknown',
            app_installed: profile.app_installed ? 1 : 0,
            favorite_deity: profile.favorite_deity || ''
        });
    } catch (err) {
        console.error("❌ Failed to save user profile:", err.message);
    }
}

export function logVoiceCall(phone, duration, summary, transcript) {
    if (!db) return;
    try {
        const stmt = db.prepare(`
            INSERT INTO voice_calls (phone, duration_seconds, summary, transcript)
            VALUES (?, ?, ?, ?)
        `);
        stmt.run(phone, duration, summary, transcript);
    } catch (err) {
        console.error("❌ Failed to log call:", err.message);
    }
}
