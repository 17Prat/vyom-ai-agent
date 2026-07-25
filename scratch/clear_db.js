import Database from 'better-sqlite3';
const db = new Database('brahmand_memory.db');
try {
  db.prepare('DELETE FROM response_cache').run();
  db.prepare('DELETE FROM chat_history').run();
  console.log('Database cache and history successfully cleared!');
} catch (err) {
  console.error('Error clearing database:', err.message);
}
