import { getDb, importFromJson } from './schema';
import { eventHub } from '../events/eventHub';
import { StoredLead, LandingPage, Schedule, LeadInteraction, InteractionOutcome, Project, PipelineStatus, City, BusinessCategory } from './types';
import { getLeadIdentityCandidates, normalizeText, normalizePhone } from '../services/leadIdentity';
import type { Job } from '../jobs/queueManager';
import path from 'path';
import fs from 'fs';

/* ------------------------------------------------------------------ */
/*  Auto‑migrate from legacy JSON on first load                        */
/* ------------------------------------------------------------------ */
const DATA_DIR = process.env.LEADRADAR_DATA_DIR || path.join(process.cwd(), 'data');
const JSON_PATH = path.join(DATA_DIR, 'db.json');
// Skip legacy JSON auto-migration when running with an isolated test DB,
// so tests never touch / rename the user's real data/db.json.
const TEST_DB_ISOLATED = Boolean(process.env.LEADRADAR_DB_PATH);
if (!TEST_DB_ISOLATED && fs.existsSync(JSON_PATH)) {
  const imported = importFromJson(JSON_PATH);
  if (imported > 0) {
    console.log(`Migração automática: ${imported} registros importados para SQLite.`);
    fs.renameSync(JSON_PATH, JSON_PATH + '.backup');
  }
}

/* ------------------------------------------------------------------ */
/*  Internal helpers — row <-> object mapping                          */
/* ------------------------------------------------------------------ */
function rowToLead(row: any): StoredLead {
  return {
    id: row.id, name: row.name,
    category: row.category || undefined,
    address: row.address || undefined,
    neighborhood: row.neighborhood || undefined,
    city: row.city || undefined,
    state: row.state || undefined,
    phone: row.phone || undefined,
    email: row.email || undefined,
    cnpj: row.cnpj || undefined,
    googlePlaceId: row.google_place_id || undefined,
    rating: row.rating ?? undefined,
    reviewsCount: row.reviews_count ?? undefined,
    websiteStatus: row.website_status || undefined,
    websiteUrl: row.website_url || undefined,
    instagramHandle: row.instagram_handle || undefined,
    lat: row.lat ?? undefined, lng: row.lng ?? undefined,
    opportunityScore: row.opportunity_score ?? undefined,
    opportunityLevel: row.opportunity_level || undefined,
    estimatedValue: row.estimated_value || undefined,
    keyInsights: row.key_insights ? JSON.parse(row.key_insights) : undefined,
    pipelineStatus: row.pipeline_status || 'prospect',
    notes: row.notes || undefined,
    analysis: row.analysis ? JSON.parse(row.analysis) : undefined,
    normalizedName: row.normalized_name || undefined,
    normalizedCity: row.normalized_city || undefined,
    normalizedPhone: row.normalized_phone || undefined,
    lastContactAt: row.last_contact_at || undefined,
    lastResponseAt: row.last_response_at || undefined,
    lastContactOutcome: row.last_contact_outcome || undefined,
    nextContactAt: row.next_contact_at || undefined,
    contactAttempts: row.contact_attempts ?? 0,
    doNotContact: Boolean(row.do_not_contact),
    savedAt: row.saved_at || undefined,
    updatedAt: row.updated_at || undefined,
  };
}

function leadToRow(lead: StoredLead): any {
  return {
    id: lead.id, name: lead.name,
    category: lead.category || null,
    address: lead.address || null,
    neighborhood: lead.neighborhood || null,
    city: lead.city || null, state: lead.state || null,
    phone: lead.phone || null, email: lead.email || null, cnpj: lead.cnpj || null,
    google_place_id: lead.googlePlaceId || null,
    rating: lead.rating ?? null,
    reviews_count: lead.reviewsCount ?? null,
    website_status: lead.websiteStatus || null,
    website_url: lead.websiteUrl || null,
    instagram_handle: lead.instagramHandle || null,
    lat: lead.lat ?? null, lng: lead.lng ?? null,
    opportunity_score: lead.opportunityScore ?? null,
    opportunity_level: lead.opportunityLevel || null,
    estimated_value: lead.estimatedValue || null,
    key_insights: lead.keyInsights ? JSON.stringify(lead.keyInsights) : null,
    pipeline_status: lead.pipelineStatus || 'prospect',
    notes: lead.notes || null,
    analysis: lead.analysis ? JSON.stringify(lead.analysis) : null,
    normalized_name: lead.normalizedName || normalizeText(lead.name) || null,
    normalized_city: lead.normalizedCity || normalizeText(lead.city) || null,
    normalized_phone: lead.normalizedPhone || normalizePhone(lead.phone) || null,
    last_contact_at: lead.lastContactAt || null,
    last_response_at: lead.lastResponseAt || null,
    last_contact_outcome: lead.lastContactOutcome || null,
    next_contact_at: lead.nextContactAt || null,
    contact_attempts: lead.contactAttempts ?? 0,
    do_not_contact: lead.doNotContact ? 1 : 0,
    saved_at: lead.savedAt || null,
    updated_at: lead.updatedAt || null,
  };
}

function rowToLp(row: any): LandingPage {
  return {
    id: row.id, leadId: row.lead_id, businessName: row.business_name,
    slug: row.slug, stage: row.stage, status: row.status,
    html: row.html || undefined, url: row.url || undefined,
    concept: row.concept ? JSON.parse(row.concept) : undefined,
    jobId: row.job_id || undefined,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

function lpToRow(lp: LandingPage): any {
  return {
    id: lp.id, lead_id: lp.leadId, business_name: lp.businessName,
    slug: lp.slug, stage: lp.stage, status: lp.status,
    html: lp.html || null, url: lp.url || null,
    concept: lp.concept ? JSON.stringify(lp.concept) : null,
    job_id: lp.jobId || null,
    created_at: lp.createdAt, updated_at: lp.updatedAt,
  };
}

function rowToJob(row: any): Job {
  return {
    id: row.id, type: row.type, title: row.title,
    status: row.status, progress: row.progress,
    payload: row.payload ? JSON.parse(row.payload) : {},
    result: row.result ? JSON.parse(row.result) : undefined,
    error: row.error || undefined,
    logs: row.logs ? JSON.parse(row.logs) : [],
    createdAt: row.created_at,
    startedAt: row.started_at || undefined,
    completedAt: row.completed_at || undefined,
  };
}

function jobToRow(job: Job): any {
  return {
    id: job.id, type: job.type, title: job.title,
    status: job.status, progress: job.progress,
    payload: JSON.stringify(job.payload || {}),
    result: JSON.stringify(job.result ?? null),
    error: job.error || null,
    logs: JSON.stringify(job.logs || []),
    created_at: job.createdAt,
    started_at: job.startedAt || null,
    completed_at: job.completedAt || null,
  };
}
/* ------------------------------------------------------------------ */
/*  Leads                                                               */
/* ------------------------------------------------------------------ */
export function getLeads(): StoredLead[] {
  const rows = getDb().prepare('SELECT * FROM leads ORDER BY updated_at DESC').all();
  return rows.map(rowToLead);
}

export function getLeadById(id: string): StoredLead | undefined {
  const row = getDb().prepare('SELECT * FROM leads WHERE id = ?').get(id) as any;
  return row ? rowToLead(row) : undefined;
}

function mergeDiscoveredLead(existing: StoredLead, incoming: StoredLead): StoredLead {
  const protectedFields = new Set([
    "id", "pipelineStatus", "savedAt", "updatedAt", "lastContactAt", "lastResponseAt",
    "lastContactOutcome", "nextContactAt", "contactAttempts", "doNotContact", "notes", "analysis",
  ]);
  const merged = { ...existing } as StoredLead;
  for (const [key, value] of Object.entries(incoming)) {
    if (!protectedFields.has(key) && value !== undefined && value !== null && value !== "") {
      (merged as any)[key] = value;
    }
  }
  return merged;
}

/**
 * Resultado da busca por duplicidade.
 * - `strong`: CNPJ, Google Place ID, telefone normalizado ou domínio do site.
 *   Indicam com alta confiança que é a mesma empresa → pode mesclar sem pedir confirmação.
 * - `weak`: nome + cidade + estado. É apenas um candidato a duplicidade → exige
 *   confirmação humana antes de mesclar (duas empresas distintas podem ter o mesmo nome na mesma cidade).
 */
export interface DuplicateMatch {
  lead: StoredLead;
  matchType: "strong" | "weak";
}

export function findDuplicateMatch(lead: StoredLead): DuplicateMatch | undefined {
  const db = getDb();
  const candidates = getLeadIdentityCandidates(lead);

  for (const candidate of candidates.filter((item) => item.strength === "strong")) {
    const row = db.prepare(
      "SELECT lead_id FROM lead_identities WHERE identity_type = ? AND identity_value = ?"
    ).get(candidate.type, candidate.value) as { lead_id?: string } | undefined;
    if (row?.lead_id) {
      const existing = getLeadById(row.lead_id);
      if (existing) return { lead: existing, matchType: "strong" };
    }
  }

  // Legacy rows may not have identity records yet. Compare their normalized
  // identities once before inserting a new candidate, then backfill records.
  const legacyLeads = getLeads();
  for (const candidate of candidates.filter((item) => item.strength === "strong")) {
    const legacyMatch = legacyLeads.find((existing) =>
      getLeadIdentityCandidates(existing).some((item) => item.type === candidate.type && item.value === candidate.value)
    );
    if (legacyMatch) return { lead: legacyMatch, matchType: "strong" };
  }

  const normalizedName = normalizeText(lead.name);
  const normalizedCity = normalizeText(lead.city);
  const normalizedState = normalizeText(lead.state);
  if (normalizedName && normalizedCity && normalizedState) {
    const row = db.prepare(`
      SELECT * FROM leads
      WHERE normalized_name = ? AND normalized_city = ? AND lower(COALESCE(state, '')) = ?
      ORDER BY updated_at DESC
      LIMIT 1
    `).get(normalizedName, normalizedCity, normalizedState) as any;
    if (row) return { lead: rowToLead(row), matchType: "weak" };

    const legacyMatch = legacyLeads.find((existing) =>
      normalizeText(existing.name) === normalizedName &&
      normalizeText(existing.city) === normalizedCity &&
      normalizeText(existing.state) === normalizedState
    );
    if (legacyMatch) return { lead: legacyMatch, matchType: "weak" };
  }

  for (const candidate of candidates.filter((item) => item.strength === "weak")) {
    const row = db.prepare(
      "SELECT lead_id FROM lead_identities WHERE identity_type = ? AND identity_value = ?"
    ).get(candidate.type, candidate.value) as { lead_id?: string } | undefined;
    if (row?.lead_id) {
      const existing = getLeadById(row.lead_id);
      if (existing) return { lead: existing, matchType: "weak" };
    }
  }
  return undefined;
}

export function findDuplicateLead(lead: StoredLead): StoredLead | undefined {
  return findDuplicateMatch(lead)?.lead;
}

function syncLeadIdentities(lead: StoredLead) {
  const now = new Date().toISOString();
  const insert = getDb().prepare(`
    INSERT OR IGNORE INTO lead_identities (id, lead_id, identity_type, identity_value, created_at)
    VALUES (@id, @leadId, @identityType, @identityValue, @createdAt)
  `);
  for (const candidate of getLeadIdentityCandidates(lead)) {
    insert.run({
      id: `identity_${lead.id}_${candidate.type}_${Math.random().toString(36).slice(2, 8)}`,
      leadId: lead.id,
      identityType: candidate.type,
      identityValue: candidate.value,
      createdAt: now,
    });
  }
}

export function upsertLead(
  lead: StoredLead,
  options: { preserveInteraction?: boolean; skipDedup?: boolean } = {}
): StoredLead {
  const db = getDb();
  const now = new Date().toISOString();
  const existingById = db.prepare('SELECT * FROM leads WHERE id = ?').get(lead.id) as any;
  let canonical = lead;

  if (!existingById && !options.skipDedup) {
    const duplicate = findDuplicateLead(lead);
    if (duplicate) canonical = mergeDiscoveredLead(duplicate, lead);
  } else if (existingById && options.preserveInteraction) {
    canonical = mergeDiscoveredLead(rowToLead(existingById), lead);
  }

  canonical.savedAt = canonical.savedAt || now;
  canonical.updatedAt = now;
  const data = { ...leadToRow(canonical), updated_at: now };

  if (existingById || canonical.id !== lead.id) {
    const id = existingById ? lead.id : canonical.id;
    data.id = id;
    db.prepare(`UPDATE leads SET ${Object.keys(data).map((key) => `${key} = @${key}`).join(', ')} WHERE id = @id`).run(data);
  } else {
    db.prepare(`INSERT INTO leads (
      id, name, category, address, neighborhood, city, state, phone, email, cnpj, google_place_id,
      rating, reviews_count, website_status, website_url, instagram_handle, lat, lng,
      opportunity_score, opportunity_level, estimated_value, key_insights, pipeline_status, notes,
      analysis, normalized_name, normalized_city, normalized_phone, last_contact_at, last_response_at,
      last_contact_outcome, next_contact_at, contact_attempts, do_not_contact, saved_at, updated_at
    ) VALUES (
      @id, @name, @category, @address, @neighborhood, @city, @state, @phone, @email, @cnpj, @google_place_id,
      @rating, @reviews_count, @website_status, @website_url, @instagram_handle, @lat, @lng,
      @opportunity_score, @opportunity_level, @estimated_value, @key_insights, @pipeline_status, @notes,
      @analysis, @normalized_name, @normalized_city, @normalized_phone, @last_contact_at, @last_response_at,
      @last_contact_outcome, @next_contact_at, @contact_attempts, @do_not_contact, @saved_at, @updated_at
    )`).run(data);
  }

  syncLeadIdentities(canonical);
  eventHub.emit('leads', { id: canonical.id });
  return getLeadById(canonical.id)!;
}

export function deleteLead(id: string) {
  getDb().prepare('DELETE FROM leads WHERE id = ?').run(id);
  eventHub.emit('leads', { id });
}

export function getPipelineSummary() {
  const row = getDb()
    .prepare(`SELECT COUNT(*) AS total,
        SUM(CASE WHEN pipeline_status = 'prospect' THEN 1 ELSE 0 END) AS prospect,
        SUM(CASE WHEN pipeline_status = 'contacted' THEN 1 ELSE 0 END) AS contacted,
        SUM(CASE WHEN pipeline_status = 'negotiating' THEN 1 ELSE 0 END) AS negotiating,
        SUM(CASE WHEN pipeline_status = 'em_desenvolvimento' THEN 1 ELSE 0 END) AS em_desenvolvimento,
        SUM(CASE WHEN pipeline_status = 'closed' THEN 1 ELSE 0 END) AS closed,
        SUM(CASE WHEN pipeline_status = 'declined' THEN 1 ELSE 0 END) AS declined
      FROM leads`)
    .get() as any;

  return {
    totalLeads: row.total,
    byStatus: {
      prospect: row.prospect || 0,
      contacted: row.contacted || 0,
      negotiating: row.negotiating || 0,
      em_desenvolvimento: row.em_desenvolvimento || 0,
      closed: row.closed || 0,
      declined: row.declined || 0,
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Projetos (acompanhamento do desenvolvimento)                       */
/* ------------------------------------------------------------------ */
function parseBriefingJson(value: string | null): Project['briefing'] {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return undefined;
    return parsed as Project['briefing'];
  } catch {
    return undefined;
  }
}

function parseTasksJson(value: string | null): Project['tasks'] {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return undefined;
    return parsed as Project['tasks'];
  } catch {
    return undefined;
  }
}

function rowToProject(row: any): Project {
  return {
    id: row.id,
    leadId: row.lead_id,
    name: row.name,
    type: row.type || "landing_page",
    typeformToken: row.typeform_token || undefined,
    stage: row.stage,
    status: row.status,
    priority: row.priority,
    brief: row.brief || undefined,
    briefing: parseBriefingJson(row.briefing_json),
    tasks: parseTasksJson(row.tasks_json),
    copy: row.copy || undefined,
    designNotes: row.design_notes || undefined,
    devNotes: row.dev_notes || undefined,
    reviewNotes: row.review_notes || undefined,
    deployUrl: row.deploy_url || undefined,
    dueDate: row.due_date || undefined,
    completedAt: row.completed_at || undefined,
    archived: Boolean(row.archived),
    archivedAt: row.archived_at || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    leadName: row.lead_name || undefined,
    leadCity: row.lead_city || undefined,
    leadCategory: row.lead_category || undefined,
  };
}

const PROJECT_COLUMNS =
  'p.id, p.lead_id, p.name, p.type, p.typeform_token, p.stage, p.status, p.priority, p.brief, p.briefing_json, p.tasks_json, p.copy, p.design_notes, p.dev_notes, ' +
  'p.review_notes, p.deploy_url, p.due_date, p.completed_at, p.archived, p.archived_at, p.created_at, p.updated_at, ' +
  'l.name AS lead_name, l.city AS lead_city, l.category AS lead_category';

const PROJECT_SELECT = `SELECT ${PROJECT_COLUMNS} FROM projects p LEFT JOIN leads l ON l.id = p.lead_id`;

export function getProjects(): Project[] {
  const rows = getDb().prepare(`${PROJECT_SELECT} ORDER BY p.created_at DESC`).all() as any[];
  return rows.map(rowToProject);
}

export function getProjectById(id: string): Project | undefined {
  const row = getDb().prepare(`${PROJECT_SELECT} WHERE p.id = ?`).get(id) as any;
  return row ? rowToProject(row) : undefined;
}

export function getProjectsByLead(leadId: string): Project[] {
  const rows = getDb().prepare(`${PROJECT_SELECT} WHERE p.lead_id = ? ORDER BY p.created_at DESC`).all(leadId) as any[];
  return rows.map(rowToProject);
}

export function getProjectByTypeformToken(token: string): Project | undefined {
  const row = getDb().prepare(`${PROJECT_SELECT} WHERE p.typeform_token = ? LIMIT 1`).get(token) as any;
  return row ? rowToProject(row) : undefined;
}

export function upsertProject(project: Project) {
  const data = {
    id: project.id,
    lead_id: project.leadId,
    name: project.name,
    type: project.type || "landing_page",
    typeform_token: project.typeformToken ?? null,
    stage: project.stage,
    status: project.status,
    priority: project.priority,
    brief: project.brief ?? null,
    briefing_json: project.briefing && project.briefing.length > 0 ? JSON.stringify(project.briefing) : null,
    tasks_json: project.tasks && project.tasks.length > 0 ? JSON.stringify(project.tasks) : null,
    copy: project.copy ?? null,
    design_notes: project.designNotes ?? null,
    dev_notes: project.devNotes ?? null,
    review_notes: project.reviewNotes ?? null,
    deploy_url: project.deployUrl ?? null,
    due_date: project.dueDate ?? null,
    completed_at: project.completedAt ?? null,
    archived: project.archived ? 1 : 0,
    archived_at: project.archivedAt ?? null,
    created_at: project.createdAt,
    updated_at: project.updatedAt,
  };

  const existing = getDb().prepare('SELECT id FROM projects WHERE id = ?').get(project.id) as any;
  if (existing) {
    const sets = Object.keys(data).map((k) => `${k} = @${k}`).join(', ');
    getDb().prepare(`UPDATE projects SET ${sets} WHERE id = @id`).run(data);
  } else {
    getDb()
      .prepare(
        `INSERT INTO projects (id, lead_id, name, type, typeform_token, stage, status, priority, brief, briefing_json, tasks_json, copy, design_notes, dev_notes, review_notes, deploy_url, due_date, completed_at, archived, archived_at, created_at, updated_at)
         VALUES (@id, @lead_id, @name, @type, @typeform_token, @stage, @status, @priority, @brief, @briefing_json, @tasks_json, @copy, @design_notes, @dev_notes, @review_notes, @deploy_url, @due_date, @completed_at, @archived, @archived_at, @created_at, @updated_at)`
      )
      .run(data);
  }

  eventHub.emit('projects', { id: project.id });
  return getProjectById(project.id)!;
}

export function deleteProject(id: string) {
  getDb().prepare('DELETE FROM projects WHERE id = ?').run(id);
  eventHub.emit('projects', { id });
}

export function updateLeadPipelineStatus(id: string, status: PipelineStatus): StoredLead | undefined {
  const existing = getLeadById(id);
  if (!existing) return undefined;
  const now = new Date().toISOString();
  getDb()
    .prepare("UPDATE leads SET pipeline_status = ?, updated_at = ? WHERE id = ?")
    .run(status, now, id);
  eventHub.emit("leads", { id });
  return getLeadById(id)!;
}
/* ------------------------------------------------------------------ */
/*  Jobs                                                                */
/* ------------------------------------------------------------------ */
export function getAllJobs(): Job[] {
  const rows = getDb().prepare('SELECT * FROM jobs ORDER BY created_at DESC').all();
  return rows.map(rowToJob);
}

export function getJobById(id: string): Job | undefined {
  const row = getDb().prepare('SELECT * FROM jobs WHERE id = ?').get(id) as any;
  return row ? rowToJob(row) : undefined;
}

export function upsertJob(job: Job) {
  const existing = getDb().prepare('SELECT id FROM jobs WHERE id = ?').get(job.id) as any;
  const data = jobToRow(job);

  if (existing) {
    const sets = Object.keys(data).map((k) => `${k} = @${k}`).join(', ');
    getDb().prepare(`UPDATE jobs SET ${sets} WHERE id = @id`).run(data);
  } else {
    getDb()
      .prepare(`INSERT INTO jobs (id, type, title, status, progress, payload, result, error, logs, created_at, started_at, completed_at)
        VALUES (@id, @type, @title, @status, @progress, @payload, @result, @error, @logs, @created_at, @started_at, @completed_at)`)
      .run(data);
  }

  eventHub.emit('jobs', { id: job.id, status: job.status });
}

export function replaceJobs(jobs: Job[]) {
  const db = getDb();
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM jobs').run();
    const insert = db.prepare(
      `INSERT INTO jobs (id, type, title, status, progress, payload, result, error, logs, created_at, started_at, completed_at)
      VALUES (@id, @type, @title, @status, @progress, @payload, @result, @error, @logs, @created_at, @started_at, @completed_at)`
    );
    for (const job of jobs) insert.run(jobToRow(job));
  });
  tx();
  eventHub.emit('jobs');
}

export function removeFinishedJobs(): number {
  const result = getDb()
    .prepare("DELETE FROM jobs WHERE status IN ('completed', 'failed', 'cancelled')")
    .run();
  eventHub.emit('jobs');
  return result.changes;
}

/* ------------------------------------------------------------------ */
/*  Landing Pages                                                       */
/* ------------------------------------------------------------------ */
export function getLandingPages(): LandingPage[] {
  const rows = getDb().prepare('SELECT * FROM landing_pages ORDER BY updated_at DESC').all();
  return rows.map(rowToLp);
}

export function getLandingPageById(id: string): LandingPage | undefined {
  const row = getDb().prepare('SELECT * FROM landing_pages WHERE id = ?').get(id) as any;
  return row ? rowToLp(row) : undefined;
}

export function upsertLandingPage(lp: LandingPage): LandingPage {
  const now = new Date().toISOString();
  lp.updatedAt = now;
  const existing = getDb().prepare('SELECT id FROM landing_pages WHERE id = ?').get(lp.id) as any;
  const data = { ...lpToRow(lp), updated_at: now };

  if (existing) {
    const sets = Object.keys(data).map((k) => `${k} = @${k}`).join(', ');
    getDb().prepare(`UPDATE landing_pages SET ${sets} WHERE id = @id`).run(data);
  } else {
    lp.createdAt = lp.createdAt || now;
    getDb()
      .prepare(`INSERT INTO landing_pages (id, lead_id, business_name, slug, stage, status, html, url, concept, job_id, created_at, updated_at)
        VALUES (@id, @lead_id, @business_name, @slug, @stage, @status, @html, @url, @concept, @job_id, @created_at, @updated_at)`)
      .run(lpToRow(lp));
  }

  eventHub.emit('landing_pages', { id: lp.id, status: lp.status });
  return lp;
}

/* ------------------------------------------------------------------ */
/*  Query helpers (enrichment)                                         */
/* ------------------------------------------------------------------ */
export function searchLeadsByCity(city: string): StoredLead[] {
  const rows = getDb()
    .prepare('SELECT * FROM leads WHERE city LIKE ? ORDER BY opportunity_score DESC')
    .all(`%${city}%`);
  return rows.map(rowToLead);
}

export function updateLeadEnrichment(
  leadId: string,
  data: Partial<Pick<StoredLead, 'email' | 'cnpj' | 'instagramHandle' | 'websiteUrl' | 'phone'>>
) {
  const sets: string[] = [];
  const params: any = { id: leadId };

  if (data.email !== undefined) { sets.push('email = @email'); params.email = data.email; }
  if (data.cnpj !== undefined) { sets.push('cnpj = @cnpj'); params.cnpj = data.cnpj; }
  if (data.instagramHandle !== undefined) { sets.push('instagram_handle = @instagramHandle'); params.instagramHandle = data.instagramHandle; }
  if (data.websiteUrl !== undefined) { sets.push('website_url = @websiteUrl'); params.websiteUrl = data.websiteUrl; }
  if (data.phone !== undefined) { sets.push('phone = @phone'); params.phone = data.phone; }

  if (sets.length === 0) return;
  sets.push('updated_at = @updated_at');
  params.updated_at = new Date().toISOString();

  getDb().prepare(`UPDATE leads SET ${sets.join(', ')} WHERE id = @id`).run(params);
  eventHub.emit('leads', { id: leadId });
}

export function updateLeadAnalysis(leadId: string, analysis: any) {
  getDb()
    .prepare('UPDATE leads SET analysis = @analysis, updated_at = @updated_at WHERE id = @id')
    .run({ id: leadId, analysis: JSON.stringify(analysis), updated_at: new Date().toISOString() });
  eventHub.emit('leads', { id: leadId });
}

/* ------------------------------------------------------------------ */
/*  Communications (contact dispatch log)                              */
/* ------------------------------------------------------------------ */
export interface Communication {
  id: string;
  leadId: string;
  channel: string;
  direction: string;
  status: 'pending' | 'sent' | 'failed';
  subject?: string;
  toAddress?: string;
  message?: string;
  sentAt?: string;
  createdAt: string;
}

export function recordCommunication(input: {
  leadId: string;
  channel: string;
  direction?: string;
  status?: Communication['status'];
  subject?: string;
  toAddress?: string;
  message: string;
  sentAt?: string;
}): string {
  const id = `comm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();
  getDb()
    .prepare(`INSERT INTO communications
      (id, lead_id, channel, direction, status, subject, to_address, message, sent_at, created_at)
      VALUES (@id, @leadId, @channel, @direction, @status, @subject, @toAddress, @message, @sentAt, @createdAt)`)
    .run({
      id,
      leadId: input.leadId,
      channel: input.channel,
      direction: input.direction || 'outbound',
      status: input.status || 'pending',
      subject: input.subject || null,
      toAddress: input.toAddress || null,
      message: input.message,
      sentAt: input.sentAt || (input.status === 'sent' ? now : null),
      createdAt: now,
    });
  eventHub.emit('communications', { id, leadId: input.leadId });
  return id;
}

export function getCommunications(): Communication[] {
  const rows = getDb().prepare('SELECT * FROM communications ORDER BY created_at DESC').all() as any[];
  return rows.map((row) => ({
    id: row.id,
    leadId: row.lead_id,
    channel: row.channel,
    direction: row.direction,
    status: row.status,
    subject: row.subject || undefined,
    toAddress: row.to_address || undefined,
    message: row.message || undefined,
    sentAt: row.sent_at || undefined,
    createdAt: row.created_at,
  }));
}

export function getCommunicationsByLead(leadId: string): Communication[] {
  const rows = getDb().prepare('SELECT * FROM communications WHERE lead_id = ? ORDER BY created_at DESC').all(leadId) as any[];
  return rows.map((row) => ({
    id: row.id,
    leadId: row.lead_id,
    channel: row.channel,
    direction: row.direction,
    status: row.status,
    subject: row.subject || undefined,
    toAddress: row.to_address || undefined,
    message: row.message || undefined,
    sentAt: row.sent_at || undefined,
    createdAt: row.created_at,
  }));
}

/* ------------------------------------------------------------------ */
/*  Sales interactions and follow-up history                           */
/* ------------------------------------------------------------------ */
function rowToInteraction(row: any): LeadInteraction {
  return {
    id: row.id,
    leadId: row.lead_id,
    type: row.type,
    channel: row.channel || undefined,
    deliveryStatus: row.delivery_status,
    outcome: row.outcome,
    message: row.message || undefined,
    occurredAt: row.occurred_at,
    respondedAt: row.responded_at || undefined,
    nextContactAt: row.next_contact_at || undefined,
    notes: row.notes || undefined,
    communicationId: row.communication_id || undefined,
    createdAt: row.created_at,
  };
}

export function createInteraction(input: Omit<LeadInteraction, "id" | "createdAt"> & { id?: string }): LeadInteraction {
  const interaction: LeadInteraction = {
    ...input,
    id: input.id || `int_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  };
  getDb().prepare(`
    INSERT INTO interactions (
      id, lead_id, type, channel, delivery_status, outcome, message, occurred_at,
      responded_at, next_contact_at, notes, communication_id, created_at
    ) VALUES (
      @id, @leadId, @type, @channel, @deliveryStatus, @outcome, @message, @occurredAt,
      @respondedAt, @nextContactAt, @notes, @communicationId, @createdAt
    )
  `).run({
    ...interaction,
    channel: interaction.channel || null,
    message: interaction.message || null,
    respondedAt: interaction.respondedAt || null,
    nextContactAt: interaction.nextContactAt || null,
    notes: interaction.notes || null,
    communicationId: interaction.communicationId || null,
  });
  eventHub.emit('interactions', { id: interaction.id, leadId: interaction.leadId });
  return interaction;
}

export function getInteractionById(id: string): LeadInteraction | undefined {
  const row = getDb().prepare('SELECT * FROM interactions WHERE id = ?').get(id) as any;
  return row ? rowToInteraction(row) : undefined;
}

export function getInteractionsByLead(leadId: string): LeadInteraction[] {
  const rows = getDb().prepare('SELECT * FROM interactions WHERE lead_id = ? ORDER BY occurred_at DESC').all(leadId) as any[];
  return rows.map(rowToInteraction);
}

export function getDueFollowUps(now = new Date().toISOString()): Array<LeadInteraction & { lead: StoredLead }> {
  const rows = getDb().prepare(`
    SELECT i.*
    FROM interactions i
    JOIN leads l ON l.id = i.lead_id
    WHERE i.next_contact_at IS NOT NULL
      AND i.next_contact_at <= ?
      AND l.do_not_contact = 0
      AND NOT EXISTS (
        SELECT 1 FROM interactions newer
        WHERE newer.lead_id = i.lead_id
          AND newer.occurred_at > i.occurred_at
      )
    ORDER BY i.next_contact_at ASC
  `).all(now) as any[];
  return rows.flatMap((row) => {
    const lead = getLeadById(row.lead_id);
    return lead ? [{ ...rowToInteraction(row), lead }] : [];
  });
}

export function updateInteraction(id: string, patch: Partial<Pick<LeadInteraction, "deliveryStatus" | "outcome" | "respondedAt" | "nextContactAt" | "notes">>): LeadInteraction | undefined {
  const existing = getInteractionById(id);
  if (!existing) return undefined;
  const updated = { ...existing, ...patch };
  getDb().prepare(`
    UPDATE interactions SET
      delivery_status = @deliveryStatus,
      outcome = @outcome,
      responded_at = @respondedAt,
      next_contact_at = @nextContactAt,
      notes = @notes
    WHERE id = @id
  `).run({
    id,
    deliveryStatus: updated.deliveryStatus,
    outcome: updated.outcome,
    respondedAt: updated.respondedAt || null,
    nextContactAt: updated.nextContactAt || null,
    notes: updated.notes || null,
  });
  eventHub.emit('interactions', { id, leadId: updated.leadId });
  return getInteractionById(id);
}

/* ------------------------------------------------------------------ */
/*  Schedules (prospecção periódica)                                   */
/* ------------------------------------------------------------------ */

function rowToSchedule(row: any): Schedule {
  return {
    id: row.id,
    name: row.name,
    cron: row.cron,
    jobType: row.job_type,
    payload: row.payload ? JSON.parse(row.payload) : {},
    enabled: Boolean(row.enabled),
    lastRunAt: row.last_run_at || undefined,
    nextRunAt: row.next_run_at || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function scheduleToRow(s: Schedule): any {
  return {
    id: s.id,
    name: s.name,
    cron: s.cron,
    job_type: s.jobType,
    payload: JSON.stringify(s.payload || {}),
    enabled: s.enabled ? 1 : 0,
    last_run_at: s.lastRunAt || null,
    next_run_at: s.nextRunAt || null,
    created_at: s.createdAt,
    updated_at: s.updatedAt,
  };
}

export function getSchedules(): Schedule[] {
  const rows = getDb().prepare('SELECT * FROM schedules ORDER BY created_at DESC').all() as any[];
  return rows.map(rowToSchedule);
}

export function getScheduleById(id: string): Schedule | undefined {
  const row = getDb().prepare('SELECT * FROM schedules WHERE id = ?').get(id) as any;
  return row ? rowToSchedule(row) : undefined;
}

export function upsertSchedule(s: Schedule): Schedule {
  const now = new Date().toISOString();
  s.updatedAt = now;
  const existing = getDb().prepare('SELECT id FROM schedules WHERE id = ?').get(s.id) as any;
  const data = { ...scheduleToRow(s), updated_at: now };

  if (existing) {
    const cols = Object.keys(data).map((k) => `${k} = @${k}`).join(', ');
    getDb().prepare(`UPDATE schedules SET ${cols} WHERE id = @id`).run(data);
  } else {
    s.createdAt = s.createdAt || now;
    getDb()
      .prepare(`INSERT INTO schedules (id, name, cron, job_type, payload, enabled, last_run_at, next_run_at, created_at, updated_at)
        VALUES (@id, @name, @cron, @job_type, @payload, @enabled, @last_run_at, @next_run_at, @created_at, @updated_at)`)
      .run(scheduleToRow(s));
  }

  eventHub.emit('schedules', { id: s.id });
  return s;
}

export function deleteSchedule(id: string): boolean {
  const result = getDb().prepare('DELETE FROM schedules WHERE id = ?').run(id);
  eventHub.emit('schedules', { id });
  return result.changes > 0;
}

/**
 * Guardrail de autonomia: quantidade de Landing Pages criadas hoje.
 * Usado para impor o limite máximo de LPs/dia do agendamento autônomo.
 */
export function countLandingPagesCreatedToday(): number {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const row = getDb()
    .prepare('SELECT COUNT(*) AS c FROM landing_pages WHERE created_at >= ?')
    .get(startOfDay.toISOString()) as any;
  return row?.c || 0;
}

/* ------------------------------------------------------------------ */
/*  Cidades (base IBGE) — fila de rotação round-robin                  */
/* ------------------------------------------------------------------ */

function rowToCity(row: any): City {
  return {
    ibgeCode: row.ibge_code,
    name: row.name,
    uf: row.uf,
    latitude: row.latitude ?? undefined,
    longitude: row.longitude ?? undefined,
    population: row.population,
    pibPerCapita: row.pib_per_capita ?? 0,
    marketTier: (row.market_tier || 'C') as City['marketTier'],
    status: row.status,
    lastSearchedAt: row.last_searched_at || null,
    searchCount: row.search_count,
    enabled: Boolean(row.enabled),
  };
}

export function getCities(filter?: { uf?: string; minPopulation?: number; maxPopulation?: number; enabledOnly?: boolean; limit?: number }): City[] {
  const clauses: string[] = [];
  const params: any = {};
  if (filter?.enabledOnly) clauses.push('enabled = 1');
  if (filter?.uf) {
    clauses.push('uf = @uf');
    params.uf = filter.uf.toUpperCase();
  }
  if (filter?.minPopulation != null) {
    clauses.push('population >= @minPop');
    params.minPop = filter.minPopulation;
  }
  if (filter?.maxPopulation != null) {
    clauses.push('population <= @maxPop');
    params.maxPop = filter.maxPopulation;
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const limit = filter?.limit ? `LIMIT ${Math.floor(filter.limit)}` : '';
  const rows = getDb()
    .prepare(`SELECT * FROM cities ${where} ORDER BY uf, name ${limit}`)
    .all(params) as any[];
  return rows.map(rowToCity);
}

export function getCityByCode(ibgeCode: string): City | undefined {
  const row = getDb().prepare('SELECT * FROM cities WHERE ibge_code = ?').get(ibgeCode) as any;
  return row ? rowToCity(row) : undefined;
}

/**
 * Round-robin: pega as N cidades habilitadas há mais tempo sem buscar.
 * Cidades nunca buscadas (last_searched_at NULL) entram primeiro.
 */
export function pickNextCities(n: number, filter?: { uf?: string; minPopulation?: number; maxPopulation?: number }): City[] {
  const clauses = ['enabled = 1'];
  const params: any = {};
  if (filter?.uf) {
    clauses.push('uf = @uf');
    params.uf = filter.uf.toUpperCase();
  }
  if (filter?.minPopulation != null) {
    clauses.push('population >= @minPop');
    params.minPop = filter.minPopulation;
  }
  if (filter?.maxPopulation != null) {
    clauses.push('population <= @maxPop');
    params.maxPop = filter.maxPopulation;
  }
  const rows = getDb()
    .prepare(
      `SELECT * FROM cities WHERE ${clauses.join(' AND ')}
       ORDER BY last_searched_at IS NOT NULL, last_searched_at ASC, population DESC
       LIMIT @n`
    )
    .all({ ...params, n: Math.max(1, Math.floor(n)) }) as any[];
  return rows.map(rowToCity);
}

/** Marca que uma cidade acabou de entrar numa busca de prospecção. */
export function markCitySearched(ibgeCode: string): void {
  getDb()
    .prepare(
      `UPDATE cities
       SET last_searched_at = @now, search_count = search_count + 1, status = 'done'
       WHERE ibge_code = @code`
    )
    .run({ now: new Date().toISOString(), code: ibgeCode });
}

export function updateCity(ibgeCode: string, patch: { enabled?: boolean; status?: City['status'] }): City | undefined {
  const updates: string[] = [];
  const params: any = { code: ibgeCode };
  if (patch.enabled !== undefined) {
    updates.push('enabled = @enabled');
    params.enabled = patch.enabled ? 1 : 0;
  }
  if (patch.status !== undefined) {
    updates.push('status = @status');
    params.status = patch.status;
  }
  if (updates.length > 0) {
    getDb().prepare(`UPDATE cities SET ${updates.join(', ')} WHERE ibge_code = @code`).run(params);
  }
  return getCityByCode(ibgeCode);
}

/**
 * Importa a base IBGE (server/data/cities_ibge.csv) para a tabela cities.
 * Idempotente (INSERT OR IGNORE) — não reseta status/rotação já existentes.
 * Retorna o total de cidades na tabela após o import.
 */
export function importIbgeCities(csvPath?: string): number {
  const resolved = csvPath || path.join(process.cwd(), 'server', 'data', 'cities_ibge.csv');
  if (!fs.existsSync(resolved)) {
    throw new Error(`CSV do IBGE não encontrado em ${resolved}.`);
  }
  const db = getDb();
  const content = fs.readFileSync(resolved, 'utf-8');
  const lines = content.split(/\r?\n/).filter((l) => l.trim());
  const insert = db.prepare(
    `INSERT OR IGNORE INTO cities (ibge_code, name, uf, latitude, longitude, population, pib_per_capita)
     VALUES (@code, @name, @uf, @lat, @lng, @pop, @pib)`
  );
  const tx = db.transaction((rows: string[]) => {
    for (const line of rows) {
      const [code, name, uf, lat, lng, pop, pib] = line.split(',');
      if (!code || !name || !uf) continue;
      insert.run({
        code,
        name,
        uf,
        lat: lat ? Number(lat) : null,
        lng: lng ? Number(lng) : null,
        pop: Number(pop) || 0,
        pib: Number(pib) || 0,
      });
    }
  });
  tx(lines.slice(1)); // pula header
  const row = db.prepare('SELECT COUNT(*) AS c FROM cities').get() as any;
  return row?.c || 0;
}

/** Garante que a base IBGE está carregada (import único na primeira execução). */
export function ensureCitiesLoaded(): number {
  const db = getDb();
  const row = db.prepare('SELECT COUNT(*) AS c FROM cities').get() as any;
  if ((row?.c || 0) > 0) return row.c;
  try {
    const total = importIbgeCities();
    if (total > 0) recomputeMarketTiers();
    return total;
  } catch (err: any) {
    console.warn('Não foi possível carregar a base IBGE de cidades:', err?.message || err);
    return 0;
  }
}

/* ------------------------------------------------------------------ */
/*  Tier de mercado — capacidade de pagamento por município            */
/* ------------------------------------------------------------------ */

export type MarketTier = "A" | "B" | "C" | "D";

/**
 * Multiplicador de ticket por tier, derivado do PIB per capita do município.
 * A ≥ R$80k, B ≥ R$45k, C ≥ R$25k, D < R$25k.
 */
export const TIER_MULTIPLIERS: Record<MarketTier, number> = { A: 1.6, B: 1.3, C: 1.0, D: 0.8 };

export function tierFromPibPerCapita(pibPerCapita: number): MarketTier {
  if (pibPerCapita >= 80000) return "A";
  if (pibPerCapita >= 45000) return "B";
  if (pibPerCapita >= 25000) return "C";
  return "D";
}

export function ticketMultiplierForTier(tier: MarketTier): number {
  return TIER_MULTIPLIERS[tier] ?? 1.0;
}

/**
 * Recalcula o tier de todos os municípios a partir do PIB per capita.
 * Chamado após o import do CSV. Retorna contagem por tier.
 */
export function recomputeMarketTiers(): Record<MarketTier, number> {
  const db = getDb();
  db.exec(`
    UPDATE cities SET market_tier = CASE
      WHEN pib_per_capita >= 80000 THEN 'A'
      WHEN pib_per_capita >= 45000 THEN 'B'
      WHEN pib_per_capita >= 25000 THEN 'C'
      ELSE 'D'
    END
  `);
  const rows = db.prepare("SELECT market_tier AS t, COUNT(*) AS c FROM cities GROUP BY market_tier").all() as any[];
  const result: Record<MarketTier, number> = { A: 0, B: 0, C: 0, D: 0 };
  for (const r of rows) result[r.t as MarketTier] = r.c;
  return result;
}

/** Ticket sugerido para uma categoria numa cidade: base × multiplicador do tier. */
export function estimateTicket(baseTicket: number, tier: MarketTier): number {
  return Math.round((baseTicket * ticketMultiplierForTier(tier)) / 50) * 50; // arredonda a R$ 50
}

/* ------------------------------------------------------------------ */
/*  Categorias de negócio configuráveis                                */
/* ------------------------------------------------------------------ */

const CATEGORY_SEED: Array<{ name: string; propensity: number; baseTicket: number }> = [
  // Alta propensão: serviços locais que vivem de agendamento e busca no Google
  { name: "Clínica Odontológica", propensity: 95, baseTicket: 2800 },
  { name: "Estética & Saúde", propensity: 92, baseTicket: 2600 },
  { name: "Advocacia", propensity: 88, baseTicket: 3200 },
  { name: "Fisioterapia", propensity: 85, baseTicket: 2200 },
  { name: "Psicologia", propensity: 84, baseTicket: 1800 },
  { name: "Arquitetura & Engenharia", propensity: 82, baseTicket: 3500 },
  { name: "Nutrição", propensity: 80, baseTicket: 1800 },
  { name: "Pet Shop & Veterinária", propensity: 78, baseTicket: 2000 },
  { name: "Academia & Pilates", propensity: 76, baseTicket: 2200 },
  { name: "Ótica", propensity: 74, baseTicket: 2400 },
  // Média propensão
  { name: "Imobiliária", propensity: 65, baseTicket: 3000 },
  { name: "Salão de Beleza / Barbearia", propensity: 62, baseTicket: 1500 },
  { name: "Auto Center / Mecânica", propensity: 58, baseTicket: 1600 },
  { name: "Buffet & Eventos", propensity: 56, baseTicket: 2500 },
  { name: "Escola & Cursos", propensity: 55, baseTicket: 2600 },
  { name: "Restaurante", propensity: 50, baseTicket: 1400 },
  // Baixa propensão
  { name: "Mercado & Açougue", propensity: 30, baseTicket: 1200 },
  { name: "Combustíveis / Posto", propensity: 20, baseTicket: 2000 },
  { name: "Todas as Categorias", propensity: 50, baseTicket: 2000 },
];

/** Garante que as categorias padrão existem (seed idempotente). Retorna total ativo. */
export function ensureCategoriesSeeded(): number {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS business_categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      propensity INTEGER NOT NULL DEFAULT 50,
      baseTicket INTEGER NOT NULL DEFAULT 2000,
      is_active INTEGER NOT NULL DEFAULT 1
    );
  `);
  const insert = db.prepare(
    "INSERT OR IGNORE INTO business_categories (id, name, propensity, baseTicket, is_active) VALUES (@id, @name, @propensity, @baseTicket, 1)"
  );
  const tx = db.transaction(() => {
    CATEGORY_SEED.forEach((c, i) => {
      insert.run({ id: `cat_${i + 1}`, name: c.name, propensity: c.propensity, baseTicket: c.baseTicket });
    });
  });
  tx();
  const row = db.prepare("SELECT COUNT(*) AS c FROM business_categories WHERE is_active = 1").get() as any;
  return row?.c || 0;
}

function rowToCategory(row: any): BusinessCategory {
  return {
    id: row.id,
    name: row.name,
    propensity: row.propensity,
    baseTicket: row.baseTicket ?? row.base_ticket,
    isActive: Boolean(row.is_active),
  };
}

export function getBusinessCategories(opts?: { activeOnly?: boolean }): BusinessCategory[] {
  ensureCategoriesSeeded();
  const rows = getDb()
    .prepare(`SELECT * FROM business_categories ${opts?.activeOnly ? "WHERE is_active = 1" : ""} ORDER BY propensity DESC, name`)
    .all() as any[];
  return rows.map(rowToCategory);
}

export function upsertBusinessCategory(cat: { id?: string; name: string; propensity: number; baseTicket: number; isActive?: boolean }): BusinessCategory {
  ensureCategoriesSeeded();
  const db = getDb();
  const id = cat.id || `cat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  db.prepare(
    `INSERT INTO business_categories (id, name, propensity, baseTicket, is_active)
     VALUES (@id, @name, @propensity, @baseTicket, @isActive)
     ON CONFLICT(name) DO UPDATE SET propensity = @propensity, baseTicket = @baseTicket, is_active = @isActive`
  ).run({
    id,
    name: cat.name.trim(),
    propensity: Math.max(0, Math.min(100, Math.round(cat.propensity))),
    baseTicket: Math.max(0, Math.round(cat.baseTicket)),
    isActive: cat.isActive === false ? 0 : 1,
  });
  const row = db.prepare("SELECT * FROM business_categories WHERE name = @name").get({ name: cat.name.trim() }) as any;
  return rowToCategory(row);
}

/** Ticket estimado para uma categoria de negócio numa cidade específica. */
export function estimateTicketForCategory(categoryName: string, ibgeCode: string): { category: BusinessCategory | undefined; city: City | undefined; suggestedTicket: number } {
  const cat = getBusinessCategories().find((c) => c.name.toLowerCase() === categoryName.trim().toLowerCase());
  const city = getCityByCode(ibgeCode);
  if (!cat || !city) return { category: cat, city, suggestedTicket: 0 };
  return { category: cat, city, suggestedTicket: estimateTicket(cat.baseTicket, city.marketTier) };
}
