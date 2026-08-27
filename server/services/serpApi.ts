import { getSerpApiConfig } from "../config";
import { getDb } from "../store/schema";
import crypto from "crypto";

// ------------------------------------------------------------------
// SerpAPI Google Maps — busca real sem alucinação
// Limites free: 250/mês, 50/hora. Apenas buscas bem-sucedidas contam;
// cache, erro e falha não contam. Reset mensal no ciclo de faturamento
// (aniversário da assinatura) e janela horária deslizante.
// ------------------------------------------------------------------

let lastSerpApiRaw: any = null;
let lastSerpApiMeta: { query: string; location: string; state: string; category: string; timestamp: string; url: string } | null = null;

export function getLastSerpApiRaw(): { raw: any; meta: any } {
  return { raw: lastSerpApiRaw, meta: lastSerpApiMeta };
}

function getCacheTtlHours(): number {
  const raw = Number(process.env.SERPAPI_CACHE_TTL_HOURS || 168);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 168;
}

export function hashSearchQuery(input: { location: string; state: string; category: string; filterNoWebsiteOnly: boolean; query?: string; provider: string }): string {
  const key = `${input.location.trim().toLowerCase()}|${input.state.trim().toUpperCase()}|${input.category.trim().toLowerCase()}|${input.filterNoWebsiteOnly ? "ouro" : "todos"}|${(input.query || "").trim().toLowerCase()}|${input.provider}`;
  return crypto.createHash("sha256").update(key).digest("hex").slice(0, 16);
}

export function getCachedSearch(hash: string): { businesses: any[]; raw: any; meta: any } | null {
  try {
    const db = getDb();
    const row = db.prepare("SELECT * FROM serpapi_search_cache WHERE query_hash = ?").get(hash) as any;
    if (!row) return null;
    if (new Date(row.expires_at).getTime() <= Date.now()) {
      db.prepare("DELETE FROM serpapi_search_cache WHERE query_hash = ?").run(hash);
      return null;
    }
    // atualiza last raw para o viewer
    try {
      lastSerpApiRaw = row.serpapi_raw ? JSON.parse(row.serpapi_raw) : null;
      lastSerpApiMeta = row.serpapi_meta ? JSON.parse(row.serpapi_meta) : null;
    } catch {}
    return {
      businesses: row.businesses_json ? JSON.parse(row.businesses_json) : [],
      raw: row.serpapi_raw ? JSON.parse(row.serpapi_raw) : null,
      meta: row.serpapi_meta ? JSON.parse(row.serpapi_meta) : null,
    };
  } catch {
    return null;
  }
}

export function setCachedSearch(
  hash: string,
  input: { location: string; state: string; category: string; filterNoWebsiteOnly: boolean; query?: string; provider: string },
  businesses: any[],
  raw: any,
  meta: any
): void {
  try {
    const db = getDb();
    const ttlHours = getCacheTtlHours();
    const expiresAt = new Date(Date.now() + ttlHours * 3600000).toISOString();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT OR REPLACE INTO serpapi_search_cache
        (query_hash, location, state, category, filter_no_website_only, query, provider, businesses_json, serpapi_raw, serpapi_meta, created_at, expires_at)
       VALUES (@hash, @location, @state, @category, @filter, @query, @provider, @businessesJson, @raw, @meta, @now, @expiresAt)`
    ).run({
      hash,
      location: input.location,
      state: input.state,
      category: input.category,
      filter: input.filterNoWebsiteOnly ? 1 : 0,
      query: input.query || null,
      provider: input.provider,
      businessesJson: JSON.stringify(businesses),
      raw: raw ? JSON.stringify(raw) : null,
      meta: meta ? JSON.stringify(meta) : null,
      now,
      expiresAt,
    });
  } catch {}
}

export interface SerpApiUsage {
  configured: boolean;
  searchesPerMonth: number;
  throughputPerHour: number;
  usedThisMonth: number;
  remainingThisMonth: number;
  usedThisHour: number;
  remainingThisHour: number;
  monthKey: string; // YYYY-MM
  hourWindowStart: string | null; // ISO
  nextMonthlyReset: string; // ISO — 1º dia do próximo mês UTC
  nextHourlyReset: string | null; // ISO
}

function monthKeyFor(date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
}

function getRenewalDay(row: any): number {
  if (row.renewal_day && row.renewal_day >= 1 && row.renewal_day <= 31) return row.renewal_day;
  try {
    return new Date(row.created_at).getUTCDate();
  } catch {
    return 1;
  }
}

function nextMonthlyResetISO(now = new Date()): string {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const next = new Date(Date.UTC(m === 11 ? y + 1 : y, m === 11 ? 0 : m + 1, 1, 0, 0, 0));
  return next.toISOString();
}

function nextMonthlyResetForRow(row: any, now = new Date()): string {
  const day = getRenewalDay(row);
  let y = now.getUTCFullYear();
  let m = now.getUTCMonth();
  const dim = daysInMonth(y, m);
  let candidate = new Date(Date.UTC(y, m, Math.min(day, dim), 0, 0, 0));
  if (candidate <= now) {
    if (m === 11) { y += 1; m = 0; } else m += 1;
    const dim2 = daysInMonth(y, m);
    candidate = new Date(Date.UTC(y, m, Math.min(day, dim2), 0, 0, 0));
  }
  return candidate.toISOString();
}

function periodKeyForRow(row: any, now = new Date()): string {
  const day = getRenewalDay(row);
  let y = now.getUTCFullYear();
  let m = now.getUTCMonth();
  const dim = daysInMonth(y, m);
  let candidate = new Date(Date.UTC(y, m, Math.min(day, dim), 0, 0, 0));
  if (candidate > now) {
    if (m === 0) { y -= 1; m = 11; } else m -= 1;
  }
  const d = Math.min(day, daysInMonth(y, m));
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export interface SerpApiKeyInfo {
  id: string;
  label: string | null;
  maskedKey: string;
  isActive: boolean;
  monthKey: string;
  renewalDay: number;
  usedThisMonth: number;
  remainingThisMonth: number;
  usedThisHour: number;
  remainingThisHour: number;
  hourWindowStart: string | null;
  nextMonthlyReset: string;
  nextHourlyReset: string | null;
  createdAt: string;
  updatedAt: string;
}

function maskKey(key: string): string {
  const k = key.trim();
  if (k.length <= 8) return "****";
  return `${k.slice(0, 6)}...${k.slice(-4)}`;
}

function refreshKeyRow(db: any, row: any): any {
  const periodKey = periodKeyForRow(row, new Date());
  // migra chaves antigas com month_key no formato YYYY-MM
  const needsReset = row.month_key !== periodKey;
  if (needsReset) {
    db.prepare("UPDATE serpapi_keys SET month_key = @monthKey, used_this_month = 0, updated_at = @now WHERE id = @id").run({
      monthKey: periodKey,
      now: new Date().toISOString(),
      id: row.id,
    });
    row = db.prepare("SELECT * FROM serpapi_keys WHERE id = @id").get({ id: row.id }) as any;
  }
  if (row.hour_window_start) {
    const start = new Date(row.hour_window_start).getTime();
    if (Date.now() - start >= 3600000) {
      db.prepare("UPDATE serpapi_keys SET hour_window_start = NULL, used_this_hour = 0, updated_at = @now WHERE id = @id").run({
        now: new Date().toISOString(),
        id: row.id,
      });
      row = db.prepare("SELECT * FROM serpapi_keys WHERE id = @id").get({ id: row.id }) as any;
    }
  }
  // garante que renewal_day está preenchido (backfill)
  if (row.renewal_day == null) {
    const d = getRenewalDay(row);
    db.prepare("UPDATE serpapi_keys SET renewal_day = @d, updated_at = @now WHERE id = @id").run({
      d,
      now: new Date().toISOString(),
      id: row.id,
    });
    row = db.prepare("SELECT * FROM serpapi_keys WHERE id = @id").get({ id: row.id }) as any;
  }
  return row;
}

function ensureUsageTable() {
  const db = getDb();
  // tabela legada singleton (mantida por compatibilidade, não recria se já removida)
  db.exec(`
    CREATE TABLE IF NOT EXISTS serpapi_usage (
      id TEXT PRIMARY KEY,
      month_key TEXT NOT NULL,
      used_this_month INTEGER NOT NULL DEFAULT 0,
      hour_window_start TEXT,
      used_this_hour INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );
  `);
  const row = db.prepare("SELECT id FROM serpapi_usage WHERE id = 'singleton'").get() as any;
  if (!row) {
    db.prepare(
      "INSERT INTO serpapi_usage (id, month_key, used_this_month, hour_window_start, used_this_hour, updated_at) VALUES ('singleton', @monthKey, 0, NULL, 0, @now)"
    ).run({ monthKey: monthKeyFor(), now: new Date().toISOString() });
  }
  // garante tabela de chaves múltiplas — schema idêntico a server/store/schema.ts
  db.exec(`
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
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_serpapi_keys_active ON serpapi_keys(is_active);`);
  // migra coluna renewal_day se tabela foi criada por versão antiga sem ela
  try {
    const cols = db.prepare("PRAGMA table_info(serpapi_keys)").all() as any[];
    if (!cols.some((c: any) => c.name === "renewal_day")) {
      db.exec("ALTER TABLE serpapi_keys ADD COLUMN renewal_day INTEGER");
    }
  } catch {}
}

function readUsageRow(): any {
  ensureUsageTable();
  const db = getDb();
  let row = db.prepare("SELECT * FROM serpapi_usage WHERE id = 'singleton'").get() as any;
  const currentKey = monthKeyFor();
  if (row.month_key !== currentKey) {
    db.prepare(
      "UPDATE serpapi_usage SET month_key = @monthKey, used_this_month = 0, updated_at = @now WHERE id = 'singleton'"
    ).run({ monthKey: currentKey, now: new Date().toISOString() });
    row = db.prepare("SELECT * FROM serpapi_usage WHERE id = 'singleton'").get() as any;
  }
  if (row.hour_window_start) {
    const start = new Date(row.hour_window_start).getTime();
    if (Date.now() - start >= 3600000) {
      db.prepare(
        "UPDATE serpapi_usage SET hour_window_start = NULL, used_this_hour = 0, updated_at = @now WHERE id = 'singleton'"
      ).run({ now: new Date().toISOString() });
      row = db.prepare("SELECT * FROM serpapi_usage WHERE id = 'singleton'").get() as any;
    }
  }
  return row;
}

function getActiveKeyRow(): any | null {
  ensureUsageTable();
  const db = getDb();
  const rows = db.prepare("SELECT * FROM serpapi_keys ORDER BY created_at ASC").all() as any[];
  if (rows.length === 0) return null;
  const active = rows.find((r: any) => r.is_active) || rows[0];
  return refreshKeyRow(db, active);
}

function toKeyInfo(row: any): SerpApiKeyInfo {
  const cfg = getSerpApiConfig();
  const hourStart = row.hour_window_start ? new Date(row.hour_window_start) : null;
  const nextHourlyReset = hourStart ? new Date(hourStart.getTime() + 3600000).toISOString() : null;
  return {
    id: row.id,
    label: row.label || null,
    maskedKey: maskKey(row.api_key),
    isActive: Boolean(row.is_active),
    monthKey: row.month_key,
    renewalDay: getRenewalDay(row),
    usedThisMonth: row.used_this_month,
    remainingThisMonth: Math.max(0, cfg.searchesPerMonth - row.used_this_month),
    usedThisHour: row.used_this_hour,
    remainingThisHour: Math.max(0, cfg.throughputPerHour - row.used_this_hour),
    hourWindowStart: row.hour_window_start,
    nextMonthlyReset: nextMonthlyResetForRow(row),
    nextHourlyReset,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listSerpApiKeys(): SerpApiKeyInfo[] {
  ensureUsageTable();
  const db = getDb();
  const rows = db.prepare("SELECT * FROM serpapi_keys ORDER BY created_at ASC").all() as any[];
  return rows.map((r: any) => toKeyInfo(refreshKeyRow(db, r)));
}

export function addSerpApiKey(apiKey: string, label?: string, renewalDay?: number | null, renewalDate?: string | null): SerpApiKeyInfo {
  const key = (apiKey || "").trim().replace(/^["']|["']$/g, "");
  if (!key || key.length < 10) throw new Error("API key SerpAPI inválida. Cole a chave completa de https://serpapi.com/manage-api-key");
  ensureUsageTable();
  const db = getDb();
  const existing = db.prepare("SELECT id FROM serpapi_keys WHERE api_key = ?").get(key) as any;
  if (existing) throw new Error("Essa chave SerpAPI já está cadastrada.");
  const now = new Date().toISOString();
  const id = `serpkey_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const hasActive = db.prepare("SELECT id FROM serpapi_keys WHERE is_active = 1").get() as any;
  const isActive = hasActive ? 0 : 1;
  // renewalDay: se vier renewalDate (YYYY-MM-DD) extrai o dia, senão usa renewalDay, senão dia da criação
  let rDay: number | null = null;
  if (renewalDate && typeof renewalDate === "string" && renewalDate.trim()) {
    const parsed = new Date(renewalDate.trim());
    if (!isNaN(parsed.getTime())) rDay = parsed.getUTCDate();
  }
  if (rDay == null && renewalDay != null && Number.isFinite(Number(renewalDay))) {
    const n = Math.floor(Number(renewalDay));
    if (n >= 1 && n <= 31) rDay = n;
  }
  if (rDay == null) rDay = new Date().getUTCDate();
  const periodKey = periodKeyForRow({ renewal_day: rDay, created_at: now }, new Date());
  db.prepare(
    "INSERT INTO serpapi_keys (id, api_key, label, is_active, month_key, used_this_month, hour_window_start, used_this_hour, created_at, updated_at, renewal_day) VALUES (@id, @apiKey, @label, @isActive, @monthKey, 0, NULL, 0, @now, @now, @renewalDay)"
  ).run({ id, apiKey: key, label: (label || "").trim() || null, isActive, monthKey: periodKey, renewalDay: rDay, now });
  const row = db.prepare("SELECT * FROM serpapi_keys WHERE id = @id").get({ id }) as any;
  return toKeyInfo(refreshKeyRow(db, row));
}

export function updateSerpApiKey(id: string, patch: { label?: string; renewalDay?: number | null; renewalDate?: string | null }): SerpApiKeyInfo {
  ensureUsageTable();
  const db = getDb();
  const row = db.prepare("SELECT * FROM serpapi_keys WHERE id = @id").get({ id }) as any;
  if (!row) throw new Error("Chave não encontrada.");
  const now = new Date().toISOString();
  const updates: string[] = [];
  const params: any = { id, now };
  if (patch.label !== undefined) {
    updates.push("label = @label");
    params.label = (patch.label || "").trim() || null;
  }
  let newRenewalDay: number | null = null;
  if (patch.renewalDate != null && typeof patch.renewalDate === "string" && patch.renewalDate.trim()) {
    const parsed = new Date(patch.renewalDate.trim());
    if (!isNaN(parsed.getTime())) newRenewalDay = parsed.getUTCDate();
    else throw new Error("Data de renovação inválida. Use YYYY-MM-DD.");
  } else if (patch.renewalDay != null) {
    const n = Math.floor(Number(patch.renewalDay));
    if (!Number.isFinite(n) || n < 1 || n > 31) throw new Error("renewalDay deve ser entre 1 e 31.");
    newRenewalDay = n;
  }
  if (newRenewalDay != null) {
    updates.push("renewal_day = @renewalDay");
    params.renewalDay = newRenewalDay;
    // recalcula period key; se mudou de período, zera uso mensal
    const tempRow = { ...row, renewal_day: newRenewalDay };
    const newPeriodKey = periodKeyForRow(tempRow, new Date());
    if (newPeriodKey !== row.month_key) {
      updates.push("month_key = @monthKey");
      params.monthKey = newPeriodKey;
      updates.push("used_this_month = 0");
      updates.push("hour_window_start = NULL");
      updates.push("used_this_hour = 0");
    }
  }
  if (updates.length > 0) {
    updates.push("updated_at = @now");
    db.prepare(`UPDATE serpapi_keys SET ${updates.join(", ")} WHERE id = @id`).run(params);
  }
  const updated = db.prepare("SELECT * FROM serpapi_keys WHERE id = @id").get({ id }) as any;
  return toKeyInfo(refreshKeyRow(db, updated));
}

export function deleteSerpApiKey(id: string): void {
  ensureUsageTable();
  const db = getDb();
  const row = db.prepare("SELECT * FROM serpapi_keys WHERE id = @id").get({ id }) as any;
  if (!row) throw new Error("Chave não encontrada.");
  const wasActive = Boolean(row.is_active);
  db.prepare("DELETE FROM serpapi_keys WHERE id = @id").run({ id });
  if (wasActive) {
    const next = db.prepare("SELECT id FROM serpapi_keys ORDER BY created_at ASC LIMIT 1").get() as any;
    if (next) db.prepare("UPDATE serpapi_keys SET is_active = 1, updated_at = @now WHERE id = @id").run({ id: next.id, now: new Date().toISOString() });
  }
}

export function activateSerpApiKey(id: string): SerpApiKeyInfo {
  ensureUsageTable();
  const db = getDb();
  const row = db.prepare("SELECT * FROM serpapi_keys WHERE id = @id").get({ id }) as any;
  if (!row) throw new Error("Chave não encontrada.");
  const now = new Date().toISOString();
  db.prepare("UPDATE serpapi_keys SET is_active = 0, updated_at = @now").run({ now });
  db.prepare("UPDATE serpapi_keys SET is_active = 1, updated_at = @now WHERE id = @id").run({ id, now });
  const updated = db.prepare("SELECT * FROM serpapi_keys WHERE id = @id").get({ id }) as any;
  return toKeyInfo(refreshKeyRow(db, updated));
}

export function getSerpApiUsage(): SerpApiUsage {
  const cfg = getSerpApiConfig();
  const active = getActiveKeyRow();
  if (active) {
    const info = toKeyInfo(active);
    return {
      configured: true,
      searchesPerMonth: cfg.searchesPerMonth,
      throughputPerHour: cfg.throughputPerHour,
      usedThisMonth: info.usedThisMonth,
      remainingThisMonth: info.remainingThisMonth,
      usedThisHour: info.usedThisHour,
      remainingThisHour: info.remainingThisHour,
      monthKey: info.monthKey,
      hourWindowStart: info.hourWindowStart,
      nextMonthlyReset: info.nextMonthlyReset,
      nextHourlyReset: info.nextHourlyReset,
    };
  }
  const row = readUsageRow();
  const hourStart = row.hour_window_start ? new Date(row.hour_window_start) : null;
  const nextHourlyReset = hourStart ? new Date(hourStart.getTime() + 3600000).toISOString() : null;
  return {
    configured: cfg.configured,
    searchesPerMonth: cfg.searchesPerMonth,
    throughputPerHour: cfg.throughputPerHour,
    usedThisMonth: row.used_this_month,
    remainingThisMonth: Math.max(0, cfg.searchesPerMonth - row.used_this_month),
    usedThisHour: row.used_this_hour,
    remainingThisHour: Math.max(0, cfg.throughputPerHour - row.used_this_hour),
    monthKey: row.month_key,
    hourWindowStart: row.hour_window_start,
    nextMonthlyReset: nextMonthlyResetISO(),
    nextHourlyReset,
  };
}

function canConsume(): { allowed: boolean; reason?: string } {
  const cfg = getSerpApiConfig();
  const active = getActiveKeyRow();
  const u = getSerpApiUsage();
  const hasAnyKey = Boolean(active) || cfg.configured;
  if (!hasAnyKey) return { allowed: false, reason: "Nenhuma chave SerpAPI cadastrada. Adicione uma chave em Gerenciar chaves ou defina SERPAPI_API_KEY no .env." };
  if (u.remainingThisMonth <= 0)
    return {
      allowed: false,
      reason: `Limite mensal da chave ativa atingido (${u.searchesPerMonth}/mês). Renova em ${new Date(u.nextMonthlyReset).toLocaleDateString("pt-BR")} (1º do próximo mês). Troque de chave ou aguarde.`,
    };
  if (u.remainingThisHour <= 0)
    return {
      allowed: false,
      reason: `Limite horário da chave ativa atingido (${u.throughputPerHour}/hora). Tente novamente após ${u.nextHourlyReset ? new Date(u.nextHourlyReset).toLocaleTimeString("pt-BR") : "1 hora"} ou troque de chave.`,
    };
  return { allowed: true };
}

function recordSuccess(): void {
  const active = getActiveKeyRow();
  if (active) {
    const db = getDb();
    const now = new Date().toISOString();
    const row = refreshKeyRow(db, active);
    const hourStart = row.hour_window_start || now;
    const nextHour = row.hour_window_start ? row.used_this_hour + 1 : 1;
    db.prepare(
      "UPDATE serpapi_keys SET used_this_month = used_this_month + 1, hour_window_start = @hourStart, used_this_hour = @nextHour, updated_at = @now WHERE id = @id"
    ).run({ hourStart, nextHour, now, id: row.id });
    return;
  }
  ensureUsageTable();
  const db = getDb();
  const now = new Date().toISOString();
  const row = readUsageRow();
  const hourStart = row.hour_window_start || now;
  const nextHour = row.hour_window_start ? row.used_this_hour + 1 : 1;
  db.prepare(
    "UPDATE serpapi_usage SET used_this_month = used_this_month + 1, hour_window_start = @hourStart, used_this_hour = @nextHour, updated_at = @now WHERE id = 'singleton'"
  ).run({ hourStart, nextHour, now });
}

// Não consome cota: cache, erro e falha não contam segundo o FAQ SerpAPI

export class SerpApiQuotaError extends Error {
  code = "SERP_QUOTA";
  constructor(message: string) {
    super(message);
    this.name = "SerpApiQuotaError";
  }
}

// Mapeia local_results do Google Maps para o formato BusinessLead validado
function mapSerpPlaceToBusiness(place: any, fallbackCategory: string, fallbackCity: string, fallbackState: string, idx: number): any {
  const title: string = (place.title || place.name || "").trim();
  if (!title) return null;
  const address: string = (place.address || place.formatted_address || "").trim() || `${fallbackCity} - ${fallbackState}`;
  const city: string = (place.city || fallbackCity || "").trim() || fallbackCity;
  const state: string = (place.state || fallbackState || "").trim().toUpperCase() || fallbackState;
  const phone: string = (place.phone || place.phone_number || "").trim();
  const rating: number | undefined = typeof place.rating === "number" ? place.rating : undefined;
  const reviewsCount: number | undefined = typeof place.reviews === "number" ? place.reviews : undefined;
  const website: string | undefined = (place.website || place.link || place.url || "").trim() || undefined;
  const websiteStatus: "none" | "social_only" | "has_website" = website ? "has_website" : "none";
  const lat: number | undefined = place.gps_coordinates?.latitude ?? place.latitude;
  const lng: number | undefined = place.gps_coordinates?.longitude ?? place.longitude;
  const googlePlaceId: string | undefined = place.place_id || place.place_id_search || undefined;

  // heurística de oportunidade: sem site + boa nota = alto
  let opportunityScore = 65;
  if (websiteStatus === "none") opportunityScore += 20;
  if (rating && rating >= 4.5) opportunityScore += 10;
  if (reviewsCount && reviewsCount >= 50) opportunityScore += 5;
  opportunityScore = Math.min(95, opportunityScore);
  const opportunityLevel: "high" | "medium" | "low" = opportunityScore > 80 ? "high" : opportunityScore >= 60 ? "medium" : "low";

  return {
    id: `serp-${place.place_id || place.data_id || `biz-${idx}-${Date.now()}`}`,
    name: title,
    category: (place.type || place.category || fallbackCategory || "").trim() || fallbackCategory,
    address,
    neighborhood: (place.neighborhood || "").trim() || undefined,
    city,
    state,
    phone: phone || undefined,
    rating,
    reviewsCount,
    websiteStatus,
    websiteUrl: website,
    googlePlaceId,
    instagramHandle: undefined,
    lat,
    lng,
    opportunityScore,
    opportunityLevel,
    estimatedValue: "R$ 1.800 - R$ 3.500",
    keyInsights: [
      websiteStatus === "none" ? "Sem site próprio — perde buscas no Google" : "Presença digital pode ser melhorada com landing page dedicada",
      rating ? `Boa reputação (${rating}★) — prova social forte para conversão` : "Reputação a construir com página profissional",
      "Landing page com WhatsApp direto aumenta captação local",
    ],
  };
}

function getEffectiveApiKey(): string | null {
  const active = getActiveKeyRow();
  if (active) return active.api_key as string;
  const cfg = getSerpApiConfig();
  return cfg.apiKey || null;
}

function findAvailableKeyExcluding(activeId: string | null): any | null {
  ensureUsageTable();
  const db = getDb();
  const rows = db.prepare("SELECT * FROM serpapi_keys ORDER BY created_at ASC").all() as any[];
  const cfg = getSerpApiConfig();
  for (const r of rows) {
    if (activeId && r.id === activeId) continue;
    const refreshed = refreshKeyRow(db, r);
    const remainingMonth = Math.max(0, cfg.searchesPerMonth - refreshed.used_this_month);
    const hasHourWindow = Boolean(refreshed.hour_window_start);
    const usedHour = refreshed.used_this_hour;
    const remainingHour = Math.max(0, cfg.throughputPerHour - usedHour);
    const hourOk = !refreshed.hour_window_start || Date.now() - new Date(refreshed.hour_window_start).getTime() >= 3600000 || remainingHour > 0;
    if (remainingMonth > 0 && hourOk) return refreshed;
  }
  return null;
}

let lastWasCached = false;
export function wasLastSearchCached(): boolean {
  return lastWasCached;
}

export async function searchSerpApiMaps(input: {
  location: string;
  state: string;
  category: string;
  query?: string;
  filterNoWebsiteOnly?: boolean;
}, _retried = false): Promise<any[]> {
  // cache check (7 dias, não consome cota)
  const cacheHash = hashSearchQuery({
    location: input.location,
    state: input.state,
    category: input.category,
    filterNoWebsiteOnly: Boolean(input.filterNoWebsiteOnly),
    query: input.query,
    provider: "serpapi",
  });
  const cached = getCachedSearch(cacheHash);
  if (cached) {
    // Re-busca inteligente: se a última busca REAL desta cidade é antiga
    // (config RESEARCH_STALE_DAYS, default 60), ignora o cache para permitir
    // descobrir empresas novas — a cidade já rotacionou de volta na fila.
    const staleDays = Number(process.env.RESEARCH_STALE_DAYS || 60);
    const metaTs = cached.meta?.timestamp ? new Date(cached.meta.timestamp).getTime() : Date.now();
    const ageDays = (Date.now() - metaTs) / 86400000;
    if (!Number.isFinite(staleDays) || staleDays <= 0 || ageDays < staleDays) {
      lastWasCached = true;
      return cached.businesses;
    }
    // cache obsoleto → remove e busca fresco (consome cota, é a intenção)
    try {
      const { getDb } = await import("../store/schema");
      getDb().prepare("DELETE FROM serpapi_search_cache WHERE query_hash = ?").run(cacheHash);
    } catch {
      /* best-effort */
    }
  }
  lastWasCached = false;

  const cfg = getSerpApiConfig();
  let effectiveKey = getEffectiveApiKey();
  if (!effectiveKey) throw new SerpApiQuotaError("Nenhuma chave SerpAPI cadastrada. Adicione uma chave em Gerenciar chaves ou defina SERPAPI_API_KEY no .env.");

  let guard = canConsume();
  if (!guard.allowed) {
    // tenta rotação automática para outra chave com cota
    const active = getActiveKeyRow();
    const next = findAvailableKeyExcluding(active?.id || null);
    if (next) {
      activateSerpApiKey(next.id);
      effectiveKey = getEffectiveApiKey();
      guard = canConsume();
      if (!guard.allowed) throw new SerpApiQuotaError(guard.reason!);
    } else {
      throw new SerpApiQuotaError(guard.reason!);
    }
  }

  const isTodas = input.category === "Todas as Categorias";
  const q = isTodas ? `empresas em ${input.location}` : `${input.category} em ${input.location}`;
  const params = new URLSearchParams({
    engine: "google_maps",
    type: "search",
    q,
    api_key: effectiveKey!,
    hl: "pt",
    gl: "br",
  });
  // query extra do usuário
  if (input.query?.trim()) params.set("q", `${q} ${input.query.trim()}`);

  const url = `https://serpapi.com/search?${params.toString()}`;

  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(Number(process.env.SERPAPI_TIMEOUT_MS || 20000)) });
  } catch (err: any) {
    throw new Error(`Falha de rede ao consultar SerpAPI: ${err?.message || err}`);
  }

  // SerpAPI retorna 200 mesmo com erro lógico em JSON {error: "..."}
  const data: any = await res.json().catch(() => ({}));
  lastSerpApiRaw = data;
  lastSerpApiMeta = {
    query: q,
    location: input.location,
    state: input.state,
    category: input.category,
    timestamp: new Date().toISOString(),
    url: url.replace(effectiveKey!, `${effectiveKey!.slice(0, 6)}...${effectiveKey!.slice(-4)}`),
  };

  if (!res.ok) {
    const msg: string = data?.error || `HTTP ${res.status}`;
    if (res.status === 429 || /quota|rate limit|throughput/i.test(msg)) {
      if (!_retried) {
        const active = getActiveKeyRow();
        const next = findAvailableKeyExcluding(active?.id || null);
        if (next) {
          activateSerpApiKey(next.id);
          return await searchSerpApiMaps(input, true);
        }
      }
      throw new SerpApiQuotaError(`SerpAPI cota excedida (${msg}). Limite: ${cfg.searchesPerMonth}/mês, ${cfg.throughputPerHour}/hora. Renova mensal no 1º do próximo mês e horário em 1h. Troque de chave em Gerenciar chaves.`);
    }
    throw new Error(`SerpAPI erro (${res.status}): ${msg}`);
  }
  if (data?.error) {
    if (/quota|rate limit|throughput|exceeded/i.test(data.error)) {
      if (!_retried) {
        const active = getActiveKeyRow();
        const next = findAvailableKeyExcluding(active?.id || null);
        if (next) {
          activateSerpApiKey(next.id);
          return await searchSerpApiMaps(input, true);
        }
      }
      throw new SerpApiQuotaError(`SerpAPI cota excedida: ${data.error}. Troque de chave em Gerenciar chaves.`);
    }
    throw new Error(`SerpAPI erro: ${data.error}`);
  }

  const places: any[] = data.local_results || data.place_results || [];
  if (!Array.isArray(places) || places.length === 0) {
    recordSuccess();
    setCachedSearch(
      cacheHash,
      { location: input.location, state: input.state, category: input.category, filterNoWebsiteOnly: Boolean(input.filterNoWebsiteOnly), query: input.query, provider: "serpapi" },
      [],
      data,
      lastSerpApiMeta
    );
    return [];
  }

  const mapped = places
    .map((p, i) => mapSerpPlaceToBusiness(p, input.category, input.location, input.state, i))
    .filter(Boolean);

  recordSuccess();
  setCachedSearch(
    cacheHash,
    { location: input.location, state: input.state, category: input.category, filterNoWebsiteOnly: Boolean(input.filterNoWebsiteOnly), query: input.query, provider: "serpapi" },
    mapped,
    data,
    lastSerpApiMeta
  );
  return mapped;
}
