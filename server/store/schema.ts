import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DATA_DIR = process.env.LEADRADAR_DATA_DIR || path.join(process.cwd(), 'data');
const DB_PATH = process.env.LEADRADAR_DB_PATH || path.join(DATA_DIR, 'leadradar.db');

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  migrateSchema(_db);
  return _db;
}

function migrateSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS leads (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      category      TEXT,
      address       TEXT,
      neighborhood  TEXT,
      city          TEXT,
      state         TEXT,
      phone         TEXT,
      email         TEXT,
      cnpj          TEXT,
      google_place_id TEXT,
      rating        REAL,
      reviews_count INTEGER DEFAULT 0,
      website_status TEXT DEFAULT 'none',
      website_url   TEXT,
      instagram_handle TEXT,
      lat           REAL,
      lng           REAL,
      opportunity_score INTEGER DEFAULT 0,
      opportunity_level TEXT DEFAULT 'medium',
      estimated_value   TEXT,
      key_insights  TEXT,
      pipeline_status TEXT DEFAULT 'prospect',
      notes         TEXT,
      analysis      TEXT,
      normalized_name TEXT,
      normalized_city TEXT,
      normalized_phone TEXT,
      last_contact_at TEXT,
      last_response_at TEXT,
      last_contact_outcome TEXT,
      next_contact_at TEXT,
      contact_attempts INTEGER DEFAULT 0,
      do_not_contact INTEGER DEFAULT 0,
      saved_at      TEXT,
      updated_at    TEXT
    );

    CREATE TABLE IF NOT EXISTS landing_pages (
      id            TEXT PRIMARY KEY,
      lead_id       TEXT NOT NULL,
      business_name TEXT NOT NULL,
      slug          TEXT NOT NULL,
      stage         TEXT DEFAULT 'rascunho',
      status        TEXT DEFAULT 'aguardando_aprovacao',
      html          TEXT,
      url           TEXT,
      concept       TEXT,
      job_id        TEXT,
      created_at    TEXT,
      updated_at    TEXT,
      FOREIGN KEY (lead_id) REFERENCES leads(id)
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id            TEXT PRIMARY KEY,
      type          TEXT NOT NULL,
      title         TEXT NOT NULL,
      status        TEXT DEFAULT 'pending',
      progress      INTEGER DEFAULT 0,
      payload       TEXT,
      result        TEXT,
      error         TEXT,
      logs          TEXT,
      created_at    TEXT,
      started_at    TEXT,
      completed_at  TEXT
    );

    CREATE TABLE IF NOT EXISTS communications (
      id         TEXT PRIMARY KEY,
      lead_id    TEXT NOT NULL,
      channel    TEXT NOT NULL,
      direction  TEXT DEFAULT 'outbound',
      status     TEXT DEFAULT 'pending',
      subject    TEXT,
      to_address TEXT,
      message    TEXT,
      sent_at    TEXT,
      created_at TEXT,
      FOREIGN KEY (lead_id) REFERENCES leads(id)
    );

    CREATE TABLE IF NOT EXISTS lead_identities (
      id             TEXT PRIMARY KEY,
      lead_id        TEXT NOT NULL,
      identity_type  TEXT NOT NULL,
      identity_value TEXT NOT NULL,
      created_at     TEXT NOT NULL,
      FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
      UNIQUE(identity_type, identity_value)
    );

    CREATE TABLE IF NOT EXISTS interactions (
      id              TEXT PRIMARY KEY,
      lead_id         TEXT NOT NULL,
      type            TEXT NOT NULL,
      channel         TEXT,
      delivery_status TEXT NOT NULL,
      outcome         TEXT NOT NULL,
      message         TEXT,
      occurred_at     TEXT NOT NULL,
      responded_at    TEXT,
      next_contact_at TEXT,
      notes           TEXT,
      communication_id TEXT,
      created_at      TEXT NOT NULL,
      FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
      FOREIGN KEY (communication_id) REFERENCES communications(id)
    );

    CREATE TABLE IF NOT EXISTS schedules (
      id           TEXT PRIMARY KEY,
      name         TEXT NOT NULL,
      cron         TEXT NOT NULL,
      job_type     TEXT NOT NULL,
      payload      TEXT,
      enabled      INTEGER DEFAULT 1,
      last_run_at  TEXT,
      next_run_at  TEXT,
      created_at   TEXT,
      updated_at   TEXT
    );

    CREATE TABLE IF NOT EXISTS projects (
      id             TEXT PRIMARY KEY,
      lead_id        TEXT NOT NULL,
      name           TEXT NOT NULL,
      type           TEXT NOT NULL DEFAULT 'landing_page',
      typeform_token TEXT,
      tasks_json     TEXT,
      stage          TEXT NOT NULL DEFAULT 'briefing',
      status         TEXT NOT NULL DEFAULT 'em_andamento',
      priority       TEXT NOT NULL DEFAULT 'media',
      brief          TEXT,
      briefing_json  TEXT,
      copy           TEXT,
      design_notes   TEXT,
      dev_notes      TEXT,
      review_notes   TEXT,
      deploy_url     TEXT,
      due_date       TEXT,
      completed_at   TEXT,
      archived       INTEGER DEFAULT 0,
      archived_at    TEXT,
      created_at     TEXT,
      updated_at     TEXT,
      FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_leads_pipeline ON leads(pipeline_status);
    CREATE INDEX IF NOT EXISTS idx_leads_city ON leads(city);
    CREATE INDEX IF NOT EXISTS idx_landing_pages_lead ON landing_pages(lead_id);
    CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
    CREATE INDEX IF NOT EXISTS idx_jobs_type ON jobs(type);
    CREATE INDEX IF NOT EXISTS idx_communications_lead ON communications(lead_id);
    CREATE INDEX IF NOT EXISTS idx_identities_lead ON lead_identities(lead_id);
    CREATE INDEX IF NOT EXISTS idx_interactions_lead ON interactions(lead_id);
    CREATE INDEX IF NOT EXISTS idx_interactions_next_contact ON interactions(next_contact_at);
    CREATE INDEX IF NOT EXISTS idx_schedules_enabled ON schedules(enabled);
    CREATE INDEX IF NOT EXISTS idx_projects_lead ON projects(lead_id);
    CREATE INDEX IF NOT EXISTS idx_projects_stage ON projects(stage);

    CREATE TABLE IF NOT EXISTS serpapi_keys (
      id TEXT PRIMARY KEY,
      api_key TEXT NOT NULL,
      label TEXT,
      is_active INTEGER NOT NULL DEFAULT 0,
      month_key TEXT NOT NULL,
      used_this_month INTEGER NOT NULL DEFAULT 0,
      hour_window_start TEXT,
      used_this_hour INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      renewal_day INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_serpapi_keys_active ON serpapi_keys(is_active);

    CREATE TABLE IF NOT EXISTS serpapi_search_cache (
      query_hash TEXT PRIMARY KEY,
      location TEXT NOT NULL,
      state TEXT NOT NULL,
      category TEXT NOT NULL,
      filter_no_website_only INTEGER NOT NULL,
      query TEXT,
      provider TEXT NOT NULL,
      businesses_json TEXT NOT NULL,
      serpapi_raw TEXT,
      serpapi_meta TEXT,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_serpapi_cache_expires ON serpapi_search_cache(expires_at);
  `);

  // Additive migration for renewal_day (chaves criadas antes deste campo)
  try {
    const keyCols = db.prepare("PRAGMA table_info(serpapi_keys)").all() as any[];
    const hasRenewalDay = keyCols.some((c: any) => c.name === "renewal_day");
    if (!hasRenewalDay) {
      db.exec("ALTER TABLE serpapi_keys ADD COLUMN renewal_day INTEGER");
    }
    // backfill: define renewal_day como dia da criação para chaves existentes
    const rows = db.prepare("SELECT id, created_at, renewal_day FROM serpapi_keys").all() as any[];
    for (const r of rows) {
      if (r.renewal_day == null && r.created_at) {
        const d = new Date(r.created_at).getUTCDate();
        db.prepare("UPDATE serpapi_keys SET renewal_day = @d WHERE id = @id").run({ d, id: r.id });
      }
    }
  } catch {}

  // Additive migrations for databases created before the CRM interaction model.
  const leadCols = db.prepare("PRAGMA table_info(leads)").all() as any[];
  const existingColumns = new Set(leadCols.map((column: any) => column.name));
  const columnsToAdd: Record<string, string> = {
    analysis: "TEXT",
    google_place_id: "TEXT",
    normalized_name: "TEXT",
    normalized_city: "TEXT",
    normalized_phone: "TEXT",
    last_contact_at: "TEXT",
    last_response_at: "TEXT",
    last_contact_outcome: "TEXT",
    next_contact_at: "TEXT",
    contact_attempts: "INTEGER DEFAULT 0",
    do_not_contact: "INTEGER DEFAULT 0",
  };
  for (const [name, definition] of Object.entries(columnsToAdd)) {
    if (!existingColumns.has(name)) {
      db.exec(`ALTER TABLE leads ADD COLUMN ${name} ${definition}`);
    }
  }

  // Additive migrations for databases created before the archived project model.
  const projectCols = db.prepare("PRAGMA table_info(projects)").all() as any[];
  const existingProjectColumns = new Set(projectCols.map((column: any) => column.name));
  const projectColumnsToAdd: Record<string, string> = {
    archived: "INTEGER DEFAULT 0",
    archived_at: "TEXT",
    type: "TEXT NOT NULL DEFAULT 'landing_page'",
    briefing_json: "TEXT",
    typeform_token: "TEXT",
    tasks_json: "TEXT",
  };
  for (const [name, definition] of Object.entries(projectColumnsToAdd)) {
    if (!existingProjectColumns.has(name)) {
      db.exec(`ALTER TABLE projects ADD COLUMN ${name} ${definition}`);
    }
  }
}

export function closeDb() {
  if (_db) {
    _db.close();
    _db = null;
  }
}

export function importFromJson(jsonPath?: string) {
  const JSON_PATH = jsonPath || path.join(DATA_DIR, 'db.json');
  if (!fs.existsSync(JSON_PATH)) return 0;

  const raw = fs.readFileSync(JSON_PATH, 'utf-8');
  const data = JSON.parse(raw || '{}');
  const db = getDb();

  let count = 0;

  if (Array.isArray(data.leads)) {
    const insert = db.prepare(`
      INSERT OR REPLACE INTO leads
        (id, name, category, address, neighborhood, city, state, phone, email, cnpj,
         rating, reviews_count, website_status, website_url, instagram_handle,
         lat, lng, opportunity_score, opportunity_level, estimated_value, key_insights,
         pipeline_status, notes, saved_at, updated_at)
      VALUES
        (@id, @name, @category, @address, @neighborhood, @city, @state, @phone, @email, @cnpj,
         @rating, @reviewsCount, @websiteStatus, @websiteUrl, @instagramHandle,
         @lat, @lng, @opportunityScore, @opportunityLevel, @estimatedValue, @keyInsightsJson,
         @pipelineStatus, @notes, @savedAt, @updatedAt)
    `);
    for (const lead of data.leads) {
      insert.run({
        ...lead,
        keyInsightsJson: JSON.stringify(lead.keyInsights || []),
        reviewsCount: lead.reviewsCount ?? 0,
      });
      count++;
    }
  }

  if (Array.isArray(data.landingPages)) {
    const insert = db.prepare(`
      INSERT OR REPLACE INTO landing_pages
        (id, lead_id, business_name, slug, stage, status, html, url, concept, job_id, created_at, updated_at)
      VALUES
        (@id, @leadId, @businessName, @slug, @stage, @status, @html, @url, @conceptJson, @jobId, @createdAt, @updatedAt)
    `);
    for (const lp of data.landingPages) {
      insert.run({
        ...lp,
        leadId: lp.leadId,
        businessName: lp.businessName,
        conceptJson: JSON.stringify(lp.concept || {}),
        jobId: lp.jobId || null,
      });
      count++;
    }
  }

  if (Array.isArray(data.jobs)) {
    const insert = db.prepare(`
      INSERT OR REPLACE INTO jobs
        (id, type, title, status, progress, payload, result, error, logs, created_at, started_at, completed_at)
      VALUES
        (@id, @type, @title, @status, @progress, @payloadJson, @resultJson, @error, @logsJson, @createdAt, @startedAt, @completedAt)
    `);
    for (const job of data.jobs) {
      insert.run({
        ...job,
        payloadJson: JSON.stringify(job.payload || {}),
        resultJson: JSON.stringify(job.result || null),
        logsJson: JSON.stringify(job.logs || []),
        startedAt: job.startedAt || null,
        completedAt: job.completedAt || null,
        error: job.error || null,
      });
      count++;
    }
  }

  return count;
}

export default getDb;