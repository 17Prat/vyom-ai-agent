import Database from 'better-sqlite3';
import path from 'path';

class OutreachDatabase {
  constructor() {
    const dbPath = path.join(process.cwd(), 'brahmand_outreach.db');
    this.db = new Database(dbPath);
    this.initTables();
    this.initIndexes();
  }

  initTables() {
    // Contacts Table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS contacts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        platform TEXT NOT NULL,
        platform_id TEXT NOT NULL,
        username TEXT,
        name TEXT,
        phone TEXT,
        email TEXT,
        bio TEXT,
        profile_url TEXT,
        status TEXT DEFAULT 'NEW',
        consent TEXT DEFAULT 'PENDING',
        opt_out_reason TEXT,
        opt_out_at DATETIME,
        tags TEXT,
        notes TEXT,
        score INTEGER DEFAULT 0,
        last_contact_at DATETIME,
        message_count INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(platform, platform_id)
      )
    `);

    // Conversations Table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        contact_id INTEGER NOT NULL,
        platform TEXT NOT NULL,
        current_stage TEXT DEFAULT 'INTRO',
        messages TEXT,
        summary TEXT,
        sentiment TEXT DEFAULT 'NEUTRAL',
        last_message_at DATETIME,
        last_reply_at DATETIME,
        message_count INTEGER DEFAULT 0,
        needs_human_handoff INTEGER DEFAULT 0,
        human_handoff_reason TEXT,
        is_active INTEGER DEFAULT 1,
        completed_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (contact_id) REFERENCES contacts(id)
      )
    `);

    // Campaigns Table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS campaigns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        platform TEXT NOT NULL,
        status TEXT DEFAULT 'DRAFT',
        target_audience TEXT,
        messaging_template TEXT,
        max_messages INTEGER DEFAULT 5,
        delay_between_messages INTEGER DEFAULT 3600000,
        schedule TEXT,
        daily_limit INTEGER DEFAULT 100,
        hourly_limit INTEGER DEFAULT 20,
        stats TEXT,
        created_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Message Logs Table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS message_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        campaign_id INTEGER,
        contact_id INTEGER NOT NULL,
        platform TEXT NOT NULL,
        direction TEXT NOT NULL,
        content TEXT,
        content_hash TEXT,
        message_id TEXT,
        status TEXT DEFAULT 'PENDING',
        error_code TEXT,
        error_message TEXT,
        retry_count INTEGER DEFAULT 0,
        metadata TEXT,
        sent_at DATETIME,
        delivered_at DATETIME,
        read_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (contact_id) REFERENCES contacts(id),
        FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
      )
    `);

    // Blacklist Table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS blacklist (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        platform TEXT NOT NULL,
        platform_id TEXT NOT NULL,
        reason TEXT,
        added_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(platform, platform_id)
      )
    `);

    // Daily Limits Table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS daily_limits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        platform TEXT NOT NULL,
        date DATE NOT NULL,
        count INTEGER DEFAULT 0,
        UNIQUE(platform, date)
      )
    `);
  }

  initIndexes() {
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_contacts_platform_id ON contacts(platform, platform_id)',
      'CREATE INDEX IF NOT EXISTS idx_contacts_status ON contacts(status)',
      'CREATE INDEX IF NOT EXISTS idx_contacts_consent ON contacts(consent)',
      'CREATE INDEX IF NOT EXISTS idx_conversations_contact ON conversations(contact_id)',
      'CREATE INDEX IF NOT EXISTS idx_message_logs_contact ON message_logs(contact_id)',
      'CREATE INDEX IF NOT EXISTS idx_message_logs_hash ON message_logs(content_hash)',
      'CREATE INDEX IF NOT EXISTS idx_blacklist_lookup ON blacklist(platform, platform_id)',
      'CREATE INDEX IF NOT EXISTS idx_daily_limits_lookup ON daily_limits(platform, date)'
    ];

    for (const index of indexes) {
      try {
        this.db.exec(index);
      } catch (error) {}
    }
  }

  // ============= CONTACT METHODS =============
  
  createContact(contactData) {
    const sql = `
      INSERT INTO contacts 
      (platform, platform_id, username, name, phone, email, bio, profile_url, status, consent, tags, notes, score)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    const stmt = this.db.prepare(sql);
    try {
      const result = stmt.run(
        contactData.platform,
        contactData.platformId,
        contactData.username || null,
        contactData.name || null,
        contactData.phone || null,
        contactData.email || null,
        contactData.bio || null,
        contactData.profileUrl || null,
        contactData.status || 'NEW',
        contactData.consent || 'PENDING',
        contactData.tags ? JSON.stringify(contactData.tags) : null,
        contactData.notes || null,
        contactData.score || 0
      );
      return this.getContactById(result.lastInsertRowid);
    } catch (error) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return this.getContactByPlatformId(contactData.platform, contactData.platformId);
      }
      throw error;
    }
  }

  getContactById(id) {
    const sql = `SELECT * FROM contacts WHERE id = ?`;
    const stmt = this.db.prepare(sql);
    const result = stmt.get(id);
    return result ? this.hydrateContact(result) : null;
  }

  getContactByPlatformId(platform, platformId) {
    const sql = `SELECT * FROM contacts WHERE platform = ? AND platform_id = ?`;
    const stmt = this.db.prepare(sql);
    const result = stmt.get(platform, platformId);
    return result ? this.hydrateContact(result) : null;
  }

  getContactByUsername(platform, username) {
    const sql = `SELECT * FROM contacts WHERE platform = ? AND username = ?`;
    const stmt = this.db.prepare(sql);
    const result = stmt.get(platform, username);
    return result ? this.hydrateContact(result) : null;
  }

  updateContact(id, data) {
    const sets = [];
    const values = [];
    
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        sets.push(`${key} = ?`);
        if (key === 'tags' && Array.isArray(value)) {
          values.push(JSON.stringify(value));
        } else {
          values.push(value);
        }
      }
    }
    
    values.push(id);
    const sql = `
      UPDATE contacts 
      SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;
    
    const stmt = this.db.prepare(sql);
    stmt.run(...values);
    return this.getContactById(id);
  }

  incrementMessageCount(id) {
    const sql = `
      UPDATE contacts 
      SET message_count = message_count + 1, 
          last_contact_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;
    
    const stmt = this.db.prepare(sql);
    stmt.run(id);
    return this.getContactById(id);
  }

  // ============= BLACKLIST METHODS =============
  
  isBlacklisted(platform, platformId) {
    const sql = `SELECT 1 FROM blacklist WHERE platform = ? AND platform_id = ?`;
    const stmt = this.db.prepare(sql);
    const result = stmt.get(platform, platformId);
    return !!result;
  }

  addToBlacklist(platform, platformId, reason = null, addedBy = null) {
    const sql = `
      INSERT OR IGNORE INTO blacklist (platform, platform_id, reason, added_by)
      VALUES (?, ?, ?, ?)
    `;
    const stmt = this.db.prepare(sql);
    stmt.run(platform, platformId, reason, addedBy);
    
    const contact = this.getContactByPlatformId(platform, platformId);
    if (contact) {
      this.updateContact(contact.id, { 
        status: 'BLACKLISTED',
        consent: 'DENIED'
      });
    }
  }

  // ============= DAILY LIMIT METHODS =============
  
  getDailyCount(platform) {
    const today = new Date().toISOString().split('T')[0];
    const sql = `SELECT count FROM daily_limits WHERE platform = ? AND date = ?`;
    const stmt = this.db.prepare(sql);
    const result = stmt.get(platform, today);
    return result ? result.count : 0;
  }

  incrementDailyCount(platform) {
    const today = new Date().toISOString().split('T')[0];
    this.db.prepare(`
      INSERT INTO daily_limits (platform, date, count)
      VALUES (?, ?, 1)
      ON CONFLICT(platform, date) 
      DO UPDATE SET count = count + 1
    `).run(platform, today);
  }

  isDailyLimitReached(platform, limit) {
    return this.getDailyCount(platform) >= limit;
  }

  // ============= CONVERSATION METHODS =============
  
  createConversation(contactId, platform) {
    const sql = `
      INSERT INTO conversations (contact_id, platform, current_stage, messages, is_active)
      VALUES (?, ?, ?, ?, ?)
    `;
    const stmt = this.db.prepare(sql);
    const result = stmt.run(contactId, platform, 'INTRO', JSON.stringify([]), 1);
    return this.getConversationById(result.lastInsertRowid);
  }

  getConversationById(id) {
    const sql = `SELECT * FROM conversations WHERE id = ?`;
    const stmt = this.db.prepare(sql);
    const result = stmt.get(id);
    return result ? this.hydrateConversation(result) : null;
  }

  getConversationByContact(contactId, platform) {
    const sql = `
      SELECT * FROM conversations 
      WHERE contact_id = ? AND platform = ? AND is_active = 1
      ORDER BY created_at DESC LIMIT 1
    `;
    const stmt = this.db.prepare(sql);
    const result = stmt.get(contactId, platform);
    return result ? this.hydrateConversation(result) : null;
  }

  addMessageToConversation(conversationId, direction, content, messageId = null) {
    const conversation = this.getConversationById(conversationId);
    if (!conversation) return null;

    const messages = JSON.parse(conversation.messages || '[]');
    messages.push({
      direction,
      content,
      messageId,
      timestamp: new Date().toISOString()
    });

    const sql = `
      UPDATE conversations 
      SET messages = ?, 
          message_count = message_count + 1,
          last_message_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;
    this.db.prepare(sql).run(JSON.stringify(messages), conversationId);
    
    if (direction === 'INCOMING') {
      this.db.prepare(`
        UPDATE conversations 
        SET last_reply_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `).run(conversationId);
    }
    return this.getConversationById(conversationId);
  }

  // ============= MESSAGE LOG METHODS =============
  
  logMessage(logData) {
    const sql = `
      INSERT INTO message_logs 
      (campaign_id, contact_id, platform, direction, content, content_hash, 
       message_id, status, metadata, sent_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    const stmt = this.db.prepare(sql);
    const result = stmt.run(
      logData.campaignId || null,
      logData.contactId,
      logData.platform,
      logData.direction,
      logData.content,
      logData.contentHash || this.hashContent(logData.content),
      logData.messageId || null,
      logData.status || 'PENDING',
      logData.metadata ? JSON.stringify(logData.metadata) : null,
      logData.sentAt || new Date().toISOString()
    );
    return this.getMessageLogById(result.lastInsertRowid);
  }

  getMessageLogById(id) {
    const sql = `SELECT * FROM message_logs WHERE id = ?`;
    return this.db.prepare(sql).get(id);
  }

  hasBeenContacted(platform, platformId, hours = 24) {
    const sql = `
      SELECT 1 FROM message_logs 
      WHERE platform = ? AND contact_id IN (
        SELECT id FROM contacts WHERE platform = ? AND platform_id = ?
      )
      AND created_at >= datetime('now', '-' || ? || ' hours')
      LIMIT 1
    `;
    return !!this.db.prepare(sql).get(platform, platform, platformId, hours);
  }

  // ============= UTILITIES =============
  
  hashContent(content) {
    let hash = 0;
    if (!content || content.length === 0) return '0';
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }

  hydrateContact(data) {
    if (data && data.tags && typeof data.tags === 'string') {
      data.tags = JSON.parse(data.tags);
    }
    return data;
  }

  hydrateConversation(data) {
    if (data && data.messages && typeof data.messages === 'string') {
      data.messages = JSON.parse(data.messages);
    }
    return data;
  }

  close() {
    this.db.close();
  }
}

const defaultDb = new OutreachDatabase();

export function hasBeenContacted(platform, platformId, hours = 24) {
  return defaultDb.hasBeenContacted(platform, platformId, hours);
}

export function isBlacklisted(platform, platformId) {
  return defaultDb.isBlacklisted(platform, platformId);
}

export function blacklistUser(platform, platformId, reason = null) {
  return defaultDb.addToBlacklist(platform, platformId, reason);
}

export function getDailyOutreachCount(platform) {
  return defaultDb.getDailyCount(platform);
}

export function logOutreach(platform, platformId, status, content = '') {
  let contact = defaultDb.getContactByPlatformId(platform, platformId);
  if (!contact) {
    contact = defaultDb.createContact({
      platform,
      platformId,
      username: platformId,
      status: 'ACTIVE'
    });
  }
  
  defaultDb.logMessage({
    contactId: contact.id,
    platform,
    direction: status === 'sent' || status === 'replied' ? 'OUTGOING' : 'INCOMING',
    content,
    status: status.toUpperCase()
  });

  if (status === 'sent' || status === 'replied') {
    defaultDb.incrementDailyCount(platform);
  }
}

export function recordResponse(platform, platformId, responseText) {
  let contact = defaultDb.getContactByPlatformId(platform, platformId);
  if (contact) {
    defaultDb.updateContact(contact.id, {
      status: 'REPLIED',
      last_contact_at: new Date().toISOString()
    });
    let conv = defaultDb.getConversationByContact(contact.id, platform);
    if (!conv) {
      conv = defaultDb.createConversation(contact.id, platform);
    }
    defaultDb.addMessageToConversation(conv.id, 'INCOMING', responseText);
  }
}

export default OutreachDatabase;
