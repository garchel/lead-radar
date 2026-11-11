import { getSetting, setSetting } from "../store/db";
import {
  ensureCitiesLoaded,
  countFailedCommunications,
  getBusinessCategories,
  getLeadById,
  getLeads,
  markCitySearched,
  pickNextCities,
  upsertLead,
} from "../store/db";
import { StoredLead } from "../store/types";
import { buildStableLeadId } from "./leadIdentity";
import { searchBusinesses } from "./prospectingService";
import { getSerpApiUsage } from "./serpApi";
import { canRunSearch, getBudgetPlan, registerSearch } from "./quotaBudgetService";
import { dispatchLeadContact } from "./interactionService";
import { passesQualityGate, isReachableOnWhatsApp, classifyPhone } from "./leadQuality";
import { validateLeadsWhatsApp } from "./whatsappValidationService";

/**
 * Coleta automática de leads com cota controlada.
 *
 * Fluxo:
 *   1. O app abre e "arma" o autopilot (POST /api/autopilot/arm) por N horas.
 *   2. A cada minuto o servidor chama `autopilotTick()`. Se a janela está aberta,
 *      o orçamento do dia ainda tem espaço e o intervalo já passou, ele roda UMA
 *      busca (1 cidade da rotação × 1 categoria) — nunca uma rajada.
 *   3. Os leads encontrados entram no banco (só quem NÃO tem site próprio).
 *   4. Quando `autoProspect` está ligado, a cada tick ele também manda UM D0 para
 *      o melhor lead parado no pipeline `prospect`, respeitando o teto diário de
 *      contatos novos e a humanização do WhatsApp (janela, digitação, pausa).
 */

const SETTINGS_KEY = "autopilot_settings";
const STATE_KEY = "autopilot_state";
const ARM_HOURS = 8;

export interface AutopilotSettings {
  /** Liga/desliga a coleta automática. */
  enabled: boolean;
  /** Depois de coletar, manda D0 para os melhores leads. */
  autoProspect: boolean;
  /** Score mínimo (opportunityScore combinado) para valer um D0. */
  minScore: number;
  /** Teto de contatos NOVOS por dia feitos pelo autopilot. */
  dailyNewCap: number;
  /** Filtros da rotação de cidades. */
  minPopulation: number;
  maxPopulation: number;
  uf: string | null;
  /** Não salva lead que já tem site próprio. */
  skipWithWebsite: boolean;
  /** Nota mínima no Google para entrar no banco (default 4,0). */
  minRating: number;
  /** Barra negócio sem nenhuma avaliação (costuma estar inativo). */
  requireAnyReview: boolean;
  /** Exige número validado no WhatsApp antes do D0 (default false: celular basta). */
  requireWhatsApp: boolean;
}

export interface AutopilotState {
  armedUntil: string | null;
  armedBy: string | null;
  lastTickAt: string | null;
  lastRunAt: string | null;
  lastError: string | null;
  lastSummary: string | null;
  dayKey: string;
  collectedToday: number;
  searchedToday: number;
  prospectedToday: number;
}

const DEFAULT_SETTINGS: AutopilotSettings = {
  enabled: true,
  autoProspect: true,
  minScore: 60,
  dailyNewCap: 10,
  minPopulation: 30000,
  maxPopulation: 200000,
  uf: null,
  skipWithWebsite: true,
  minRating: 4,
  requireAnyReview: true,
  requireWhatsApp: false,
};

function localDayKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function getAutopilotSettings(): AutopilotSettings {
  try {
    const raw = getSetting(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<AutopilotSettings>;
    return {
      enabled: parsed.enabled ?? DEFAULT_SETTINGS.enabled,
      autoProspect: parsed.autoProspect ?? DEFAULT_SETTINGS.autoProspect,
      minScore: Math.max(0, Math.min(100, Number(parsed.minScore ?? DEFAULT_SETTINGS.minScore))),
      dailyNewCap: Math.max(0, Math.min(30, Number(parsed.dailyNewCap ?? DEFAULT_SETTINGS.dailyNewCap))),
      minPopulation: Math.max(0, Number(parsed.minPopulation ?? DEFAULT_SETTINGS.minPopulation)),
      maxPopulation: Math.max(0, Number(parsed.maxPopulation ?? DEFAULT_SETTINGS.maxPopulation)),
      uf: parsed.uf ? String(parsed.uf).toUpperCase().slice(0, 2) : null,
      skipWithWebsite: parsed.skipWithWebsite ?? DEFAULT_SETTINGS.skipWithWebsite,
      minRating: Math.max(0, Math.min(5, Number(parsed.minRating ?? DEFAULT_SETTINGS.minRating))),
      requireAnyReview: parsed.requireAnyReview ?? DEFAULT_SETTINGS.requireAnyReview,
      requireWhatsApp: parsed.requireWhatsApp ?? DEFAULT_SETTINGS.requireWhatsApp,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveAutopilotSettings(patch: Partial<AutopilotSettings>): AutopilotSettings {
  const current = getAutopilotSettings();
  const next: AutopilotSettings = { ...current, ...patch };
  if (next.maxPopulation <= next.minPopulation) {
    throw new Error("Faixa populacional inválida: o máximo precisa ser maior que o mínimo.");
  }
  if (next.uf && !/^[A-Za-z]{2}$/.test(next.uf)) {
    throw new Error("UF inválida: use duas letras (ex.: GO).");
  }
  setSetting(SETTINGS_KEY, JSON.stringify(next));
  return next;
}

function emptyState(dayKey: string): AutopilotState {
  return {
    armedUntil: null,
    armedBy: null,
    lastTickAt: null,
    lastRunAt: null,
    lastError: null,
    lastSummary: null,
    dayKey,
    collectedToday: 0,
    searchedToday: 0,
    prospectedToday: 0,
  };
}

export function getAutopilotState(now = new Date()): AutopilotState {
  const dayKey = localDayKey(now);
  let parsed: Partial<AutopilotState> | null = null;
  try {
    const raw = getSetting(STATE_KEY);
    if (raw) parsed = JSON.parse(raw) as Partial<AutopilotState>;
  } catch {
    parsed = null;
  }
  const base = emptyState(dayKey);
  if (!parsed) return base;
  const sameDay = parsed.dayKey === dayKey;
  return {
    ...base,
    ...parsed,
    dayKey,
    collectedToday: sameDay ? Number(parsed.collectedToday) || 0 : 0,
    searchedToday: sameDay ? Number(parsed.searchedToday) || 0 : 0,
    prospectedToday: sameDay ? Number(parsed.prospectedToday) || 0 : 0,
  };
}

function saveAutopilotState(state: AutopilotState): void {
  setSetting(STATE_KEY, JSON.stringify(state));
}

/** O app abriu: fica armado por ARM_HOURS para continuar coletando em segundo plano. */
export function armAutopilot(source = "app"): AutopilotState {
  const now = new Date();
  const state = getAutopilotState(now);
  const next: AutopilotState = {
    ...state,
    armedUntil: new Date(now.getTime() + ARM_HOURS * 3600000).toISOString(),
    armedBy: source,
  };
  saveAutopilotState(next);
  return next;
}

/** Zera contadores do dia (botão "zerar dia" e testes). Mantém o armamento. */
export function resetAutopilotDay(now = new Date()): AutopilotState {
  const state = getAutopilotState(now);
  const next: AutopilotState = {
    ...emptyState(localDayKey(now)),
    armedUntil: state.armedUntil,
    armedBy: state.armedBy,
  };
  saveAutopilotState(next);
  return next;
}

export function disarmAutopilot(): AutopilotState {
  const state = getAutopilotState();
  const next: AutopilotState = { ...state, armedUntil: null, armedBy: null };
  saveAutopilotState(next);
  return next;
}

export function isArmed(now = new Date()): boolean {
  const armedUntil = getAutopilotState(now).armedUntil;
  if (!armedUntil) return false;
  const ts = new Date(armedUntil).getTime();
  return Number.isFinite(ts) && ts > now.getTime();
}

type SearchOutcome = {
  city: string;
  uf: string;
  category: string;
  found: number;
  saved: number;
  /** Quantos foram barrados pelo portão de qualidade. */
  rejected: number;
  consumedQuota: boolean;
};

/** Executa UMA busca (cidade da rotação × categoria) e salva os leads úteis. */
async function runOneSearch(
  settings: AutopilotSettings,
  rotationOffset: number
): Promise<SearchOutcome> {
  ensureCitiesLoaded();
  const cities = pickNextCities(1, {
    uf: settings.uf || undefined,
    minPopulation: settings.minPopulation,
    maxPopulation: settings.maxPopulation,
  });
  if (cities.length === 0) {
    throw new Error(
      "Rotação de cidades não devolveu nenhuma cidade com os filtros atuais (população/UF). Ajuste os filtros."
    );
  }
  const city = cities[0];

  const categories = getBusinessCategories({ activeOnly: true })
    .slice()
    .sort((a, b) => b.propensity - a.propensity);
  if (categories.length === 0) {
    throw new Error("Nenhuma categoria ativa cadastrada — a busca não pode rodar.");
  }
  const category = categories[rotationOffset % categories.length];

  const usageBefore = getSerpApiUsage().usedThisMonth;
  const result = await searchBusinesses({
    location: city.name,
    state: city.uf,
    category: category.name,
    filterNoWebsiteOnly: false,
    provider: "serpapi",
  });
  const usageAfter = getSerpApiUsage().usedThisMonth;
  const consumedQuota = usageAfter > usageBefore;

  let saved = 0;
  let rejeitados = 0;
  const novosIds: string[] = [];
  for (const biz of result.businesses as any[]) {
    // Portão de entrada: só rejeita com EVIDÊNCIA (site próprio, zero avaliação,
    // nota abaixo do mínimo). Dado ausente passa — no Maps isso é comum.
    const gate = passesQualityGate(biz, {
      skipWithWebsite: settings.skipWithWebsite,
      minRating: settings.minRating,
      requireAnyReview: settings.requireAnyReview,
    });
    if (!gate.ok) {
      rejeitados += 1;
      continue;
    }
    const lead: StoredLead = {
      id: buildStableLeadId(biz),
      name: biz.name,
      category: biz.category,
      address: biz.address,
      neighborhood: biz.neighborhood,
      city: biz.city,
      state: biz.state,
      phone: biz.phone,
      rating: biz.rating,
      reviewsCount: biz.reviewsCount,
      websiteStatus: biz.websiteStatus,
      googlePlaceId: biz.googlePlaceId,
      websiteUrl: biz.websiteUrl,
      instagramHandle: biz.instagramHandle,
      lat: biz.lat,
      lng: biz.lng,
      opportunityScore: biz.opportunityScore,
      opportunityLevel: biz.opportunityLevel,
      estimatedValue: biz.estimatedValue,
      keyInsights: biz.keyInsights,
      pipelineStatus: "prospect",
      savedAt: new Date().toISOString(),
      searchCategory: category.name,
    };
    upsertLead(lead, { preserveInteraction: true });
    novosIds.push(lead.id);
    saved += 1;
  }

  // Valida no WhatsApp o que acabou de entrar (consulta de existência, sem
  // enviar nada e sem gastar cota). Falha de gateway não derruba o pulso.
  if (novosIds.length > 0) {
    try {
      await validateLeadsWhatsApp(novosIds, { limit: 40 });
    } catch {
      /* validação é acessório: o pulso segue */
    }
  }
  markCitySearched(city.ibgeCode);

  return {
    city: city.name,
    uf: city.uf,
    category: category.name,
    found: result.businesses.length,
    saved,
    rejected: rejeitados,
    consumedQuota,
  };
}

/**
 * Nome do NEGÓCIO, não de pessoa: o Google Maps devolve tudo em CAIXA ALTA
 * ("VAMOS SORRIR - NOSSA SRA DO SOCORRO"). Saudar pelo primeiro token gerava
 * "Oi, VAMOS!" / "Oi, Clínica!" — por isso aqui só normalizamos a caixa e
 * cortamos nomes absurdamente longos.
 */
export function displayBusinessName(name: string, maxLength = 48): string {
  const small = new Set(["de", "da", "do", "das", "dos", "e", "em", "no", "na", "nos", "nas"]);
  const cleaned = String(name || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "a empresa";
  const titled = cleaned
    .toLowerCase()
    .split(" ")
    .map((word, index) => {
      if (index > 0 && small.has(word)) return word;
      // preserva palavras curtas em caixa normal ("Barbearia do Zé", "Zé & Cia")
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
  return titled.length > maxLength ? `${titled.slice(0, maxLength).trim()}…` : titled;
}

/** Mensagem de D0: usa o pitch da análise quando existe; senão monta um curto. */
export function buildProspectMessage(lead: StoredLead): string {
  const pitch = String(lead.analysis?.customPitchWhatsApp || "").trim();
  if (pitch) return pitch;
  const biz = displayBusinessName(lead.name);
  const social = lead.rating
    ? `Vi a ${biz} com ${String(lead.rating).replace(".", ",")}★ no Google`
    : `Achei a ${biz} no Google Maps`;
  const gap =
    lead.websiteStatus === "none"
      ? "e reparei que ainda não tem um site próprio"
      : "e vi que a presença de vocês está só em rede social/marketplace";
  return `Olá! Aqui é da Vértice Páginas Web. ${social} ${gap} — dá pra resolver com uma página simples, com botão direto pro WhatsApp. Quer que eu te mostre como ficaria?`;
}

function countNewContactsToday(now = new Date()): number {
  try {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return getLeads().filter((lead) => {
      if (!lead.lastContactAt) return false;
      return new Date(lead.lastContactAt).getTime() >= start.getTime();
    }).length;
  } catch {
    return 0;
  }
}

export interface ProspectOutcome {
  attempted: boolean;
  leadId?: string;
  leadName?: string;
  sent?: boolean;
  reason?: string;
}

/** Manda UM D0 para o melhor lead parado em `prospect` (se as travas permitirem). */
export async function prospectBestLead(
  settings: AutopilotSettings,
  state: AutopilotState,
  now = new Date()
): Promise<ProspectOutcome> {
  if (!settings.autoProspect) return { attempted: false, reason: "prospecção automática desligada" };
  if (state.prospectedToday >= settings.dailyNewCap) {
    return { attempted: false, reason: `teto de ${settings.dailyNewCap} contatos novos/dia atingido` };
  }
  if (countNewContactsToday(now) >= 30) {
    return { attempted: false, reason: "teto global de 30 contatos novos/dia atingido" };
  }

  const candidates = getLeads()
    .filter((lead) => {
      if (lead.pipelineStatus !== "prospect") return false;
      if (lead.doNotContact) return false;
      if (lead.lastContactAt) return false;
      if ((lead.contactAttempts || 0) !== 0) return false;
      if (!lead.phone) return false;
      if ((lead.opportunityScore || 0) < settings.minScore) return false;
      if (settings.skipWithWebsite && lead.websiteStatus === "has_website") return false;

      // Não gastar D0 em número que não existe no WhatsApp: fixo não aborda,
      // número marcado como "no" nunca, e quem já falhou 2 vezes sai da fila.
      const reachable = isReachableOnWhatsApp(lead, { requireValidated: settings.requireWhatsApp });
      if (!reachable.ok) return false;
      if (countFailedCommunications(lead.id) >= 2) return false;

      return true;
    })
    .sort((a, b) => (b.opportunityScore || 0) - (a.opportunityScore || 0));

  const lead = candidates[0];
  if (!lead) return { attempted: false, reason: "nenhum lead novo acima do score mínimo" };

  const message = buildProspectMessage(lead);
  const result = await dispatchLeadContact(lead, { channel: "whatsapp", message });
  const sent = result.status === "sent";
  return {
    attempted: true,
    leadId: lead.id,
    leadName: lead.name,
    sent,
    reason: sent ? undefined : result.detail,
  };
}

export interface TickResult {
  ran: boolean;
  reason?: string;
  search?: SearchOutcome;
  prospect?: ProspectOutcome;
  summary?: string;
}

/**
 * Um "pulso" do autopilot. Chamado a cada minuto pelo servidor.
 * Faz no máximo 1 busca + 1 D0 por pulso, então nunca vira rajada.
 */
export async function autopilotTick(now = new Date(), opts?: { force?: boolean }): Promise<TickResult> {
  const settings = getAutopilotSettings();
  const state = getAutopilotState(now);
  state.lastTickAt = now.toISOString();

  if (!settings.enabled) {
    saveAutopilotState(state);
    return { ran: false, reason: "autopilot desligado" };
  }
  if (!isArmed(now)) {
    saveAutopilotState(state);
    return { ran: false, reason: "app não armou o autopilot (abra o app para armar)" };
  }

  const gate = canRunSearch(now, { force: opts?.force });
  if (!gate.allowed) {
    // mesmo sem busca, ainda pode ter D0 pendente para mandar
    const prospect = await prospectBestLead(settings, state, now);
    if (prospect.attempted) {
      if (prospect.sent) {
        state.prospectedToday += 1;
        // só registra no resumo quando saiu de verdade — senão o log do servidor
        // repetiria "D0 bloqueado" a cada minuto
        state.lastSummary = `D0 enviado para ${prospect.leadName}`;
        saveAutopilotState(state);
        return { ran: true, reason: gate.reason, prospect, summary: state.lastSummary };
      }
      saveAutopilotState(state);
      return { ran: true, reason: prospect.reason || gate.reason, prospect };
    }
    saveAutopilotState(state);
    return { ran: false, reason: gate.reason };
  }

  let search: SearchOutcome;
  try {
    search = await runOneSearch(settings, state.searchedToday);
    state.lastError = null;
  } catch (err: any) {
    state.lastError = err?.message || "falha na busca";
    saveAutopilotState(state);
    return { ran: false, reason: state.lastError };
  }

  registerSearch(search.consumedQuota, now);
  state.searchedToday += 1;
  state.collectedToday += search.saved;
  state.lastRunAt = now.toISOString();

  const prospect = await prospectBestLead(settings, state, now);
  if (prospect.sent) state.prospectedToday += 1;

  state.lastSummary = `${search.city}/${search.uf} · ${search.category}: ${search.saved} salvo(s)${
    search.rejected > 0 ? ` (${search.rejected} fora do padrão)` : ""
  }${
    prospect.sent ? ` · D0 → ${prospect.leadName}` : ""
  }`;
  saveAutopilotState(state);

  return {
    ran: true,
    search,
    prospect,
    summary: state.lastSummary,
    reason: gate.plan ? undefined : undefined,
  };
}

export function getAutopilotStatus(now = new Date()) {
  const settings = getAutopilotSettings();
  const state = getAutopilotState(now);
  const plan = getBudgetPlan(now);
  return {
    settings,
    state,
    armed: isArmed(now),
    budget: plan,
    candidatesReady: (() => {
      try {
        return getLeads().filter(
          (lead) =>
            lead.pipelineStatus === "prospect" &&
            !lead.doNotContact &&
            !lead.lastContactAt &&
            Boolean(lead.phone) &&
            (lead.opportunityScore || 0) >= settings.minScore &&
            (!settings.skipWithWebsite || lead.websiteStatus !== "has_website")
        ).length;
      } catch {
        return 0;
      }
    })(),
  };
}

/** Usado por testes e pelo botão "buscar agora" da UI. */
export async function runAutopilotNow(now = new Date()) {
  const settings = getAutopilotSettings();
  const state = getAutopilotState(now);
  const gate = canRunSearch(now, { force: true });
  if (!gate.allowed) return { ran: false, reason: gate.reason };
  const search = await runOneSearch(settings, state.searchedToday);
  registerSearch(search.consumedQuota, now);
  const next = getAutopilotState(now);
  next.searchedToday += 1;
  next.collectedToday += search.saved;
  next.lastRunAt = now.toISOString();
  next.lastSummary = `${search.city}/${search.uf} · ${search.category}: ${search.saved} lead(s) salvo(s)`;
  saveAutopilotState(next);
  return { ran: true, search, summary: next.lastSummary };
}

/** Reexportado para a UI mostrar quem foi o último lead prospectado. */
export function getLastProspectLead(): StoredLead | null {
  const state = getAutopilotState();
  if (!state.lastSummary) return null;
  const match = /D0 → (.+)$/.exec(state.lastSummary);
  if (!match) return null;
  const lead = getLeads().find((item) => item.name === match[1]);
  return lead ? getLeadById(lead.id) || null : null;
}
