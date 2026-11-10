import fs from "node:fs";
import path from "node:path";
import { GoogleGenAI } from "@google/genai";
import { getGeminiModel } from "../config";
import { getLeadById, getProjectsByLead, setLeadClientProfile } from "../store/db";
import type { ClientProfile, StoredLead } from "../store/types";
import { searchSerpApiWeb, type SerpApiWebResult } from "./serpApi";
import { researchLeadBrand } from "./brandResearchService";

/* ------------------------------------------------------------------ */
/*  Ficha do cliente (fatos + marca)                                    */
/*                                                                     */
/*  Nasce no momento do INTERESSE: o lead respondeu que quer ver uma    */
/*  prévia. É o que transforma a primeira versão do site em algo        */
/*  específico do negócio — endereço, conselho de classe (CRM/CRO),     */
/*  anos de experiência, tratamentos, convênios, provas sociais — além  */
/*  da identidade visual que já existia (`brandSnapshot`).              */
/*                                                                     */
/*  Fontes, em ordem de confiança:                                      */
/*   1. cadastro do lead (Google Maps / SerpAPI)                        */
/*   2. site do próprio cliente (home + sobre/equipe/tratamentos)       */
/*   3. resultados do Google, incluindo o snippet da bio do Instagram   */
/*      (NÃO abrimos o Instagram: bloqueia scraping e é contra os ToS)   */
/*   4. snapshot de marca (paleta, tom, logo) já usado no prompt do site */ 
/*                                                                     */
/*  Regra de ouro do prompt: nada de inventar. O que não aparecer nas   */
/*  fontes vai para `gaps` e vira pergunta para o cliente.               */
/* ------------------------------------------------------------------ */

const PROFILE_VERSION = 1;

const DATA_DIR = process.env.LEADRADAR_DATA_DIR || path.join(process.cwd(), "data");
const PROFILES_DIR = path.join(DATA_DIR, "clientes");

const GEMINI_TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS || 60000);
const PAGE_TIMEOUT_MS = Number(process.env.CLIENT_PROFILE_PAGE_TIMEOUT_MS || 12000);
const MAX_PAGE_CHARS = 6000;

const HEALTH_CATEGORY_RE =
  /dentist|odonto|m[eé]dic|clinica|clínica|sa[uú]de|fisioterap|psic[oó]log|nutric|fonoaudi|veterin|farmac|est[eé]tica cl/i;

const SUBPAGE_RE = /(sobre|quem-somos|quem_somos|sobre-nos|equipe|time|tratamento|servico|servi[cç]o|especialidade|procedimento)/i;

export interface ClientProfileOptions {
  /** Refaz a ficha mesmo que já exista uma salva. */
  force?: boolean;
  /** Máximo de buscas SerpAPI (default 3, máx 4). */
  maxSearches?: number;
  /** Roda também a pesquisa de identidade visual quando ainda não existe (default true). */
  includeBrand?: boolean;
}

export interface ClientProfileResult {
  lead: StoredLead;
  profile: ClientProfile;
  markdownPath: string;
  /** true quando devolvemos a ficha já salva (sem gastar cota). */
  cached: boolean;
  searchesUsed: number;
}

/* ------------------------------------------------------------------ */
/*  Utilidades                                                         */
/* ------------------------------------------------------------------ */

/** Slug estável para nome de arquivo: "Clínica Sorriso" → "clinica-sorriso". */
export function slugifyClient(name: string, city?: string): string {
  const base = `${name || "cliente"}${city ? ` ${city}` : ""}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return (base || "cliente").slice(0, 70);
}

function clean(value: unknown, maxLength = 300): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed || trimmed.length > maxLength) return undefined;
  return trimmed;
}

function cleanList(raw: unknown, maxItems = 12, maxLength = 90): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const value = clean(item, maxLength);
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= maxItems) break;
  }
  return out;
}

function decodeEntities(html: string): string {
  return html
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

/** HTML → texto legível (sem script/style/tags). */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchPageText(url: string): Promise<{ url: string; html: string } | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "LeadRadarBot/1.0 (+contato@leadradar.app)" },
      signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
      redirect: "follow",
    });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") || "";
    if (!/text\/html|text\/plain/i.test(type)) return null;
    const html = await res.text();
    return { url, html: html.slice(0, 400_000) };
  } catch {
    return null;
  }
}

/** Links internos que costumam conter a história da empresa. */
function findSubpageLinks(html: string, baseUrl: string): string[] {
  const found = new Set<string>();
  let origin = "";
  try {
    origin = new URL(baseUrl).origin;
  } catch {
    return [];
  }
  for (const match of html.matchAll(/href=["']([^"'#]+)["']/gi)) {
    const href = match[1];
    if (!SUBPAGE_RE.test(href)) continue;
    try {
      const abs = new URL(href, baseUrl);
      if (abs.origin !== origin) continue;
      found.add(abs.toString());
    } catch {
      /* href inválido — ignora */
    }
    if (found.size >= 3) break;
  }
  return [...found];
}

/** Erros em que vale a pena tentar o próximo modelo / tentar de novo depois. */
function isRetryableGeminiError(message: string): boolean {
  return /demorou demais|Cota do Gemini|indisponível|UNAVAILABLE|high demand|overloaded|503|500|502|INTERNAL/i.test(
    message
  );
}

function geminiErrorMessage(err: any): string {
  const raw = String(err?.message || err || "");
  if (/aborted|timeout|timed out/i.test(raw)) return "A análise demorou demais (timeout do Gemini).";
  if (/quota|429|RESOURCE_EXHAUSTED/i.test(raw)) return "Cota do Gemini esgotada no momento.";
  if (/API key|PERMISSION_DENIED|401|403/i.test(raw)) return "Chave do Gemini inválida ou sem permissão.";
  if (/503|UNAVAILABLE|high demand|overloaded/i.test(raw)) {
    return "Gemini indisponível no momento (sobrecarga do lado do Google) — tente de novo em alguns minutos.";
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.error?.message) return String(parsed.error.message).slice(0, 200);
  } catch {
    /* mensagem não é JSON */
  }
  return raw.slice(0, 200) || "Falha ao analisar as fontes com a IA.";
}

const STOPWORDS = new Set(["para", "com", "dos", "das", "de", "da", "do", "em", "ltda", "eireli", "me", "epp"]);

function normalizeForMatch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/**
 * O Google ignora aspas com frequência: buscando `"Transportadora X" site:instagram.com`
 * ele devolve Goiás Esporte Clube. Jogar isso no prompt contamina a ficha, então
 * só passam resultados que citam o negócio (prefixo de 6 letras de cada palavra do nome).
 */
export function isRelevantSearchResult(result: { title?: string; link?: string; snippet?: string }, name: string): boolean {
  const tokens = normalizeForMatch(name)
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 4 && !STOPWORDS.has(word));
  if (tokens.length === 0) return true;

  const haystack = normalizeForMatch(`${result.title || ""} ${result.snippet || ""} ${result.link || ""}`);
  const prefixes = Array.from(new Set(tokens.map((token) => token.slice(0, 6))));
  const hits = prefixes.filter((prefix) => haystack.includes(prefix)).length;

  return hits >= Math.max(1, Math.ceil(prefixes.length / 2));
}

function buildQueries(lead: StoredLead): string[] {
  const city = [lead.city, lead.state].filter(Boolean).join(" ");
  const name = lead.name?.trim();
  const queries: string[] = [];
  if (!name) return queries;
  queries.push(`"${name}" ${city}`.trim());
  queries.push(`"${name}" site:instagram.com`.trim());
  if (lead.category && HEALTH_CATEGORY_RE.test(lead.category)) {
    queries.push(`"${name}" ${city} (CRM OR CRO OR CREFITO OR CRBM)`.trim());
  }
  return queries;
}

/* ------------------------------------------------------------------ */
/*  Extração com IA                                                    */
/* ------------------------------------------------------------------ */

const SYSTEM_RULES = `Você monta a FICHA DE UM CLIENTE para a primeira versão do site dele.

REGRAS ABSOLUTAS
- Use SOMENTE as informações presentes nas FONTES abaixo (resultados de busca e texto do site).
- NUNCA invente número de conselho (CRM/CRO/CREFITO), nome de responsável, anos de experiência, convênio ou tratamento.
- Se a informação não estiver explícita nas fontes, omita o campo e liste o que faltou em "gaps".
- Não copie frases de marketing inteiras; resuma.
- Português do Brasil, direto, sem adjetivos vazios.`;

function buildPrompt(lead: StoredLead, corpus: string): string {
  return `${SYSTEM_RULES}

DADOS DO CADASTRO (fonte: Google Maps/SerpAPI)
${JSON.stringify(
  {
    nome: lead.name,
    categoria: lead.category,
    endereco: lead.address,
    bairro: lead.neighborhood,
    cidade: lead.city,
    estado: lead.state,
    telefone: lead.phone,
    site: lead.websiteUrl,
    instagram: lead.instagramHandle,
    notaGoogle: lead.rating,
    avaliacoes: lead.reviewsCount,
  },
  null,
  2
)}

FONTES (texto coletado)
${corpus}

Responda APENAS com JSON neste formato (omita o que não existir):
{
  "identity": { "name": "", "category": "", "address": "", "city": "", "state": "", "phone": "", "instagram": "", "website": "" },
  "professional": { "name": "", "council": "CRM|CRO|CREFITO|CRBM|CREF|CRN", "number": "", "state": "UF", "source": "onde apareceu" },
  "experience": { "since": "2012", "years": 14, "education": [""], "certifications": [""] },
  "services": [""],
  "hours": "seg–sex 8h–18h",
  "insurancePlans": [""],
  "differentials": [""],
  "socialProof": { "rating": 4.9, "reviewsCount": 231, "quotes": [""] },
  "summary": "1 parágrafo de 2-4 linhas descrevendo o negócio com o que foi confirmado",
  "gaps": ["informação importante que não apareceu nas fontes"],
  "confidence": 0.0
}`;
}

interface RawExtraction {
  identity?: Record<string, unknown>;
  professional?: Record<string, unknown>;
  experience?: Record<string, unknown>;
  services?: unknown;
  hours?: unknown;
  insurancePlans?: unknown;
  differentials?: unknown;
  socialProof?: Record<string, unknown>;
  summary?: unknown;
  gaps?: unknown;
  confidence?: unknown;
}

function parseJsonLoose(text: string): any {
  const trimmed = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

async function extractWithGemini(lead: StoredLead, corpus: string): Promise<{ raw: RawExtraction; model: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY não configurada — a ficha do cliente precisa do Gemini.");

  const ai = new GoogleGenAI({ apiKey });
  const primary = getGeminiModel();
  // Mesmo padrão da pesquisa visual: um modelo mais leve como reserva quando o
  // principal está sobrecarregado (503) ou lento.
  const fallbacks = (process.env.GEMINI_PROFILE_FALLBACK_MODEL || process.env.GEMINI_VISION_FALLBACK_MODEL || "gemini-3.1-flash-lite")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const models = Array.from(new Set([primary, ...fallbacks]));

  let lastError = "Falha ao analisar as fontes com a IA.";
  for (const model of models) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text: buildPrompt(lead, corpus) }] }],
        config: {
          responseMimeType: "application/json",
          temperature: 0.2,
          abortSignal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
        },
      });
      const text = response.text?.trim();
      if (!text) throw new Error("A IA não retornou a ficha do cliente.");
      const parsed = parseJsonLoose(text);
      if (!parsed || typeof parsed !== "object") throw new Error("A IA retornou um JSON inválido para a ficha.");
      return { raw: parsed as RawExtraction, model };
    } catch (err: any) {
      lastError = geminiErrorMessage(err);
      console.warn(`[ficha] Gemini ${model} falhou: ${lastError}`);
      // Sobrecarga/timeout/cota: vale tentar o próximo modelo antes de desistir.
      if (isRetryableGeminiError(lastError)) continue;
      throw new Error(lastError);
    }
  }
  throw new Error(lastError);
}

/* ------------------------------------------------------------------ */
/*  Montagem da ficha                                                  */
/* ------------------------------------------------------------------ */

function isHealthCategory(category?: string): boolean {
  return Boolean(category && HEALTH_CATEGORY_RE.test(category));
}

function buildProfile(input: {
  lead: StoredLead;
  raw: RawExtraction | null;
  sources: ClientProfile["sources"];
  brand?: ClientProfile["brand"];
}): ClientProfile {
  const { lead, raw } = input;
  const identityRaw = raw?.identity || {};
  const professionalRaw = raw?.professional || {};
  const experienceRaw = raw?.experience || {};
  const socialRaw = raw?.socialProof || {};

  const professional = (() => {
    const number = clean(professionalRaw.number, 30);
    const council = clean(professionalRaw.council, 20);
    const name = clean(professionalRaw.name, 120);
    if (!number && !council && !name) return undefined;
    return {
      name,
      council: council?.toUpperCase(),
      number,
      state: clean(professionalRaw.state, 4)?.toUpperCase(),
      source: clean(professionalRaw.source, 160),
    };
  })();

  const experience = (() => {
    const since = clean(experienceRaw.since, 12);
    const yearsRaw = Number(experienceRaw.years);
    const years = Number.isFinite(yearsRaw) && yearsRaw > 0 && yearsRaw < 120 ? Math.round(yearsRaw) : undefined;
    const education = cleanList(experienceRaw.education, 8, 140);
    const certifications = cleanList(experienceRaw.certifications, 8, 140);
    if (!since && !years && education.length === 0 && certifications.length === 0) return undefined;
    return { since, years, education, certifications };
  })();

  const socialProof = (() => {
    const ratingRaw = Number(socialRaw.rating ?? lead.rating);
    const reviewsRaw = Number(socialRaw.reviewsCount ?? lead.reviewsCount);
    const rating = Number.isFinite(ratingRaw) && ratingRaw > 0 && ratingRaw <= 5 ? ratingRaw : undefined;
    const reviewsCount = Number.isFinite(reviewsRaw) && reviewsRaw >= 0 ? Math.round(reviewsRaw) : undefined;
    const quotes = cleanList(socialRaw.quotes, 3, 220);
    if (rating === undefined && reviewsCount === undefined && quotes.length === 0) return undefined;
    return { rating, reviewsCount, quotes };
  })();

  const profile: ClientProfile = {
    version: PROFILE_VERSION,
    createdAt: new Date().toISOString(),
    leadId: lead.id,
    identity: {
      name: clean(identityRaw.name, 160) || lead.name,
      category: clean(identityRaw.category, 80) || lead.category,
      address: clean(identityRaw.address, 200) || lead.address,
      city: clean(identityRaw.city, 80) || lead.city,
      state: clean(identityRaw.state, 4)?.toUpperCase() || lead.state,
      phone: clean(identityRaw.phone, 40) || lead.phone,
      instagram: clean(identityRaw.instagram, 120) || lead.instagramHandle,
      website: clean(identityRaw.website, 200) || lead.websiteUrl,
    },
    professional,
    experience,
    services: cleanList(raw?.services, 14, 90),
    hours: clean(raw?.hours, 120),
    insurancePlans: cleanList(raw?.insurancePlans, 10, 60),
    differentials: cleanList(raw?.differentials, 8, 160),
    socialProof,
    brand: input.brand,
    summary: clean(raw?.summary, 700) || "",
    gaps: cleanList(raw?.gaps, 8, 160),
    sources: input.sources,
    confidence: 0,
  };

  // Gaps que a gente sabe preencher sozinho (mais útil que "não achei nada").
  const gaps = new Set(profile.gaps.map((gap) => gap.replace(/\.$/, "")));
  if (isHealthCategory(lead.category) && !profile.professional?.number) {
    gaps.add("Número do conselho (CRM/CRO/CREFITO) não aparece nas fontes públicas — confirmar com o cliente");
  }
  if (!profile.experience?.years && !profile.experience?.since) {
    gaps.add("Tempo de experiência não informado publicamente — confirmar com o cliente");
  }
  if (profile.services.length === 0) {
    gaps.add("Lista de serviços/tratamentos não encontrada — confirmar com o cliente");
  }
  if (!profile.summary) {
    profile.summary = [lead.name, lead.category, [lead.city, lead.state].filter(Boolean).join("/")]
      .filter(Boolean)
      .join(" — ");
  }
  profile.gaps = [...gaps].slice(0, 10);

  // Confiança = cobertura dos blocos que realmente importam para o site.
  // Ficha com identidade mas sem história/serviços não pode se dizer confiável.
  let coverage = 0.2;
  if (profile.identity.address) coverage += 0.15;
  if (profile.services.length > 0) coverage += 0.15;
  if (profile.experience?.years || profile.experience?.since) coverage += 0.15;
  if (profile.professional?.number) coverage += 0.15;
  if (profile.socialProof) coverage += 0.1;
  if (profile.brand) coverage += 0.05;
  const relevantSources = input.sources.filter((source) => source.kind !== "cadastro").length;
  if (relevantSources >= 3) coverage += 0.05;

  const modelConfidence = Number(raw?.confidence);
  const confidence =
    Number.isFinite(modelConfidence) && modelConfidence > 0 && modelConfidence <= 1
      ? coverage * 0.75 + modelConfidence * 0.25
      : coverage;
  profile.confidence = Math.round(Math.min(0.95, Math.max(0.1, confidence)) * 100) / 100;

  return profile;
}

/* ------------------------------------------------------------------ */
/*  Markdown                                                           */
/* ------------------------------------------------------------------ */

function dash(value?: string | number): string {
  if (value === undefined || value === null || value === "") return "_não encontrado_";
  return String(value);
}

/** Renderiza a ficha em Markdown (usada na primeira versão do site e no chat). */
export function renderClientProfileMarkdown(profile: ClientProfile): string {
  const p = profile;
  const lines: string[] = [];
  const sem = (text: string) => text.replace(/\|/g, "\\|");

  lines.push(`# ${p.identity.name} — ficha do cliente`, "");
  lines.push(
    `> Gerada automaticamente em ${new Date(p.createdAt).toLocaleString("pt-BR")} a partir de fontes públicas. ` +
      `Confiança: **${Math.round(p.confidence * 100)}%**.`,
    `> Uso: primeira versão da landing page. Campos \`não encontrado\` devem ser confirmados com o cliente.`,
    ""
  );

  lines.push("## Identificação", "", "| Campo | Valor |", "|---|---|");
  lines.push(`| Nome | ${sem(dash(p.identity.name))} |`);
  lines.push(`| Categoria | ${sem(dash(p.identity.category))} |`);
  lines.push(`| Endereço | ${sem(dash(p.identity.address))} |`);
  lines.push(`| Cidade/UF | ${sem(dash([p.identity.city, p.identity.state].filter(Boolean).join("/")))} |`);
  lines.push(`| Telefone | ${sem(dash(p.identity.phone))} |`);
  lines.push(`| Instagram | ${sem(dash(p.identity.instagram))} |`);
  lines.push(`| Site | ${sem(dash(p.identity.website))} |`);
  lines.push("");

  lines.push("## Responsável técnico (conselho de classe)", "");
  if (p.professional?.number || p.professional?.council || p.professional?.name) {
    const council = [p.professional.council, p.professional.number, p.professional.state].filter(Boolean).join(" ");
    lines.push(`- **${dash(council)}**${p.professional.name ? ` — ${p.professional.name}` : ""}`);
    if (p.professional.source) lines.push(`- Fonte: ${p.professional.source}`);
  } else {
    lines.push("- _não encontrado_");
  }
  lines.push("");

  lines.push("## Experiência", "");
  if (p.experience) {
    if (p.experience.since || p.experience.years) {
      const parts = [p.experience.since ? `desde ${p.experience.since}` : "", p.experience.years ? `${p.experience.years} anos` : ""]
        .filter(Boolean)
        .join(" · ");
      lines.push(`- Tempo de atuação: ${parts}`);
    }
    if (p.experience.education?.length) lines.push(`- Formação: ${p.experience.education.join("; ")}`);
    if (p.experience.certifications?.length) lines.push(`- Certificações: ${p.experience.certifications.join("; ")}`);
  } else {
    lines.push("- _não encontrado_");
  }
  lines.push("");

  lines.push("## Serviços e tratamentos", "");
  const services = p.services ?? [];
  lines.push(services.length ? services.map((service) => `- ${service}`).join("\n") : "- _não encontrado_", "");

  lines.push("## Atendimento", "");
  lines.push(`- Horário: ${dash(p.hours)}`);
  const insurances = p.insurancePlans ?? [];
  lines.push(`- Convênios: ${insurances.length ? insurances.join(", ") : "_não encontrado_"}`, "");

  lines.push("## Diferenciais", "");
  const differentials = p.differentials ?? [];
  lines.push(differentials.length ? differentials.map((item) => `- ${item}`).join("\n") : "- _não encontrado_", "");

  lines.push("## Provas sociais", "");
  if (p.socialProof) {
    const google = [p.socialProof.rating ? `${p.socialProof.rating}★` : "", p.socialProof.reviewsCount ? `${p.socialProof.reviewsCount} avaliações` : ""]
      .filter(Boolean)
      .join(" · ");
    if (google) lines.push(`- Google: ${google}`);
    for (const quote of p.socialProof.quotes || []) lines.push(`- "${quote}"`);
  } else {
    lines.push("- _não encontrado_");
  }
  lines.push("");

  lines.push("## Identidade visual (para o design)", "");
  if (p.brand) {
    if (p.brand.palette.length) {
      lines.push(
        `- Paleta: ${p.brand.palette
          .map((color) => `${color.hex}${color.role ? ` (${color.role})` : ""}${color.name ? ` ${color.name}` : ""}`)
          .join(", ")}`
      );
    }
    if (p.brand.tone.length) lines.push(`- Tom: ${p.brand.tone.join(", ")}`);
    const typo = [p.brand.typography?.display, p.brand.typography?.body].filter(Boolean).join(" / ");
    if (typo) lines.push(`- Tipografia: ${typo}`);
    if (p.brand.logo) lines.push(`- Logo: ${p.brand.logo.description || "identificado nas imagens"}${p.brand.logo.url ? ` (${p.brand.logo.url})` : ""}`);
    if (p.brand.summary) lines.push(`- Resumo visual: ${p.brand.summary}`);
  } else {
    lines.push("- _não encontrado_");
  }
  lines.push("");

  lines.push("## Resumo para a primeira versão", "", p.summary || "_não encontrado_", "");

  lines.push("## Lacunas — confirmar com o cliente", "");
  const gaps = p.gaps ?? [];
  lines.push(gaps.length ? gaps.map((gap) => `- ${gap}`).join("\n") : "- nada pendente", "");

  lines.push("## Fontes consultadas", "");
  const sources = p.sources ?? [];
  lines.push(
    sources.length
      ? sources.map((source) => `- \`${source.kind}\` ${source.url}${source.title ? ` — ${source.title}` : ""}`).join("\n")
      : "- apenas cadastro do CRM"
  );
  lines.push("");

  return lines.join("\n");
}

function writeProfileFiles(lead: StoredLead, profile: ClientProfile): { markdownPath: string; siteCopy?: string } {
  const slug = slugifyClient(lead.name, lead.city);
  fs.mkdirSync(PROFILES_DIR, { recursive: true });
  const markdownPath = path.join(PROFILES_DIR, `${slug}.md`);
  const markdown = renderClientProfileMarkdown(profile);
  fs.writeFileSync(markdownPath, markdown, "utf8");

  // Se já existe projeto de LP com pasta no repo, a ficha vai junto do material do site.
  let siteCopy: string | undefined;
  try {
    const project = getProjectsByLead(lead.id).find((item) => item.sitePath);
    if (project?.sitePath) {
      const targetDir = path.join(process.cwd(), project.sitePath);
      fs.mkdirSync(targetDir, { recursive: true });
      const target = path.join(targetDir, "CLIENTE.md");
      fs.writeFileSync(target, markdown, "utf8");
      siteCopy = path.join(project.sitePath, "CLIENTE.md");
    }
  } catch {
    /* cópia para o site é conveniência; a ficha já está salva em data/clientes */
  }

  return { markdownPath, siteCopy };
}

/* ------------------------------------------------------------------ */
/*  Orquestração                                                       */
/* ------------------------------------------------------------------ */

/** Em execução agora — evita duas fichas simultâneas para o mesmo lead. */
const inFlight = new Set<string>();

export function isClientProfileBuilding(leadId: string): boolean {
  return inFlight.has(leadId);
}

export async function buildClientProfile(
  leadId: string,
  options: ClientProfileOptions = {}
): Promise<ClientProfileResult> {
  const lead = getLeadById(leadId);
  if (!lead) throw new Error(`Lead "${leadId}" não encontrado.`);

  if (lead.clientProfile && options.force !== true) {
    const markdownPath = lead.clientProfile.files?.markdown
      ? path.join(process.cwd(), lead.clientProfile.files.markdown)
      : path.join(PROFILES_DIR, `${slugifyClient(lead.name, lead.city)}.md`);
    return { lead, profile: lead.clientProfile, markdownPath, cached: true, searchesUsed: 0 };
  }

  if (inFlight.has(leadId)) {
    throw new Error(`A ficha de "${lead.name}" já está sendo montada agora.`);
  }
  inFlight.add(leadId);

  try {
    const maxSearches = Math.max(1, Math.min(Math.floor(options.maxSearches ?? 3), 4));
    const queries = buildQueries(lead).slice(0, maxSearches);
    const sources: ClientProfile["sources"] = [];
    const corpusParts: string[] = [];
    let searchesUsed = 0;

    // 1) site do cliente (a fonte mais confiável de CRM/experiência/tratamentos)
    if (lead.websiteUrl) {
      const page = await fetchPageText(lead.websiteUrl);
      if (page) {
        const text = htmlToText(page.html);
        if (text) {
          sources.push({ url: page.url, kind: "site", title: lead.name });
          corpusParts.push(`### SITE (${page.url})\n${text.slice(0, MAX_PAGE_CHARS)}`);
          for (const sub of findSubpageLinks(page.html, page.url).slice(0, 2)) {
            const subPage = await fetchPageText(sub);
            if (!subPage) continue;
            const subText = htmlToText(subPage.html);
            if (!subText) continue;
            sources.push({ url: subPage.url, kind: "site" });
            corpusParts.push(`### SITE (${subPage.url})\n${subText.slice(0, MAX_PAGE_CHARS)}`);
          }
        }
      }
    }

    // 2) Google / Instagram (snippet da bio) — respeitando a cota do SerpAPI
    for (const query of queries) {
      try {
        const found: SerpApiWebResult[] = await searchSerpApiWeb({ query, limit: 8 });
        searchesUsed += 1;
        const results = found.filter((result) => isRelevantSearchResult(result, lead.name));
        if (results.length === 0) continue;
        const block = results
          .map((result, index) => {
            const kind: ClientProfile["sources"][number]["kind"] = /instagram\.com/i.test(result.link) ? "instagram" : "google";
            sources.push({ url: result.link, kind, title: result.title });
            return `[${index + 1}] ${result.title}\nURL: ${result.link}\nTrecho: ${result.snippet || "(sem trecho)"}`;
          })
          .join("\n\n");
        corpusParts.push(`### BUSCA: ${query}\n${block}`);
      } catch {
        /* quota/erro em uma busca não invalida a ficha */
      }
    }

    const corpus = corpusParts.join("\n\n").slice(0, 12_000);

    // 3) identidade visual (reaproveita o snapshot já salvo)
    let brand = lead.brandSnapshot;
    if (!brand && options.includeBrand !== false) {
      try {
        brand = (await researchLeadBrand(lead.id)).snapshot;
      } catch {
        /* sem marca, a ficha ainda vale */
      }
    }

    // 4) extração com IA (só quando há algo além do cadastro)
    let raw: RawExtraction | null = null;
    if (corpus.trim()) {
      const extraction = await extractWithGemini(lead, corpus);
      raw = extraction.raw;
    }

    const profile = buildProfile({ lead, raw, sources, brand });
    const files = writeProfileFiles(lead, profile);
    profile.files = {
      markdown: path.relative(process.cwd(), files.markdownPath).split(path.sep).join("/"),
      siteCopy: files.siteCopy,
    };

    setLeadClientProfile(lead.id, profile);
    const updated = getLeadById(lead.id)!;
    return { lead: updated, profile, markdownPath: files.markdownPath, cached: false, searchesUsed };
  } finally {
    inFlight.delete(leadId);
  }
}

/**
 * Versão compacta da ficha para entrar no prompt de geração do site.
 * Só fatos confirmados; as lacunas viram instrução explícita de "não invente".
 */
export function formatClientProfileForPrompt(profile?: ClientProfile): string {
  if (!profile) return "";
  const lines: string[] = ["Ficha do cliente (fatos coletados de fontes públicas — use como CONTEÚDO do site):"];

  const i = profile.identity;
  const address = [i.address, i.city, i.state].filter(Boolean).join(" · ");
  if (address) lines.push(`- Endereço: ${address}`);
  if (i.phone) lines.push(`- Telefone/WhatsApp: ${i.phone}`);
  if (i.instagram) lines.push(`- Instagram: ${i.instagram}`);

  const prof = profile.professional;
  if (prof && (prof.number || prof.name)) {
    const council = [prof.council, prof.number, prof.state].filter(Boolean).join(" ");
    lines.push(`- Responsável técnico: ${[prof.name, council].filter(Boolean).join(" — ")}`);
  }

  const exp = profile.experience;
  if (exp) {
    const parts: string[] = [];
    if (exp.since) parts.push(`desde ${exp.since}`);
    if (exp.years) parts.push(`${exp.years} anos de atuação`);
    if (parts.length) lines.push(`- Experiência: ${parts.join(" · ")}`);
    if (exp.education.length) lines.push(`- Formação: ${exp.education.join("; ")}`);
    if (exp.certifications.length) lines.push(`- Certificações: ${exp.certifications.join("; ")}`);
  }

  if (profile.services?.length) lines.push(`- Serviços/tratamentos: ${profile.services.join("; ")}`);
  if (profile.hours) lines.push(`- Horário de atendimento: ${profile.hours}`);
  if (profile.insurancePlans?.length) lines.push(`- Convênios: ${profile.insurancePlans.join(", ")}`);
  if (profile.differentials?.length) lines.push(`- Diferenciais: ${profile.differentials.join("; ")}`);

  const social = profile.socialProof;
  if (social) {
    const parts: string[] = [];
    if (social.rating) parts.push(`${social.rating}★`);
    if (social.reviewsCount) parts.push(`${social.reviewsCount} avaliações`);
    if (parts.length) lines.push(`- Prova social Google: ${parts.join(" · ")}`);
    for (const quote of social.quotes || []) lines.push(`- Depoimento citável: "${quote}"`);
  }

  if (profile.gaps?.length) {
    lines.push(`- NÃO publique nem invente (a confirmar com o cliente): ${profile.gaps.join("; ")}`);
  }

  return lines.join("\n");
}

/** Ficha já salva em Markdown (ou null quando o lead ainda não tem ficha). */
export function getClientProfileMarkdown(leadId: string): { profile: ClientProfile; markdown: string } | null {
  const lead = getLeadById(leadId);
  if (!lead?.clientProfile) return null;
  return { profile: lead.clientProfile, markdown: renderClientProfileMarkdown(lead.clientProfile) };
}
