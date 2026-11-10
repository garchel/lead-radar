import { GoogleGenAI } from "@google/genai";
import { getGeminiModel } from "../config";
import { getLeadById, setLeadBrandSnapshot } from "../store/db";
import { BrandColor, BrandColorRole, BrandSnapshot, StoredLead } from "../store/types";
import { searchSerpApiImages, searchSerpApiWeb, SerpApiImage } from "./serpApi";

/* ------------------------------------------------------------------ */
/*  Pesquisa de identidade visual do lead                              */
/*                                                                     */
/*  Usa SerpAPI (Google Imagens + resultados orgânicos) para localizar */
/*  imagens e perfis públicos e o Gemini (vision) para extrair paleta, */
/*  tom, tipografia, logo e referências. Guardamos apenas dados        */
/*  derivados + URLs de origem — nunca redistribuímos as imagens.      */
/* ------------------------------------------------------------------ */

const BRAND_SNAPSHOT_VERSION = 1;

export interface BrandResearchOptions {
  /** Máximo de imagens enviadas para a IA (default 6). */
  maxImages?: number;
  /** Máximo de buscas SerpAPI na execução (default 2). */
  maxSearches?: number;
  /** Procura perfis no Google quando não aparecem nas imagens (default true). */
  includeProfiles?: boolean;
  /** Refaz a pesquisa mesmo que já exista um snapshot. */
  force?: boolean;
}

export interface BrandResearchResult {
  lead: StoredLead;
  snapshot: BrandSnapshot;
  /** true quando devolvemos o snapshot já salvo (sem gastar cota). */
  cached: boolean;
  searchesUsed: number;
  imagesAnalyzed: number;
}

interface DownloadedImage {
  image: SerpApiImage;
  mimeType: string;
  data: string;
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function normalizeHex(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  const short = /^#?([0-9a-f]{3})$/i.exec(value);
  if (short) {
    const [r, g, b] = short[1].split("");
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  const full = /^#?([0-9a-f]{6})$/i.exec(value);
  return full ? `#${full[1]}`.toUpperCase() : null;
}

const COLOR_ROLES: BrandColorRole[] = ["primary", "secondary", "accent", "background", "text"];

function normalizePalette(raw: unknown): BrandColor[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const palette: BrandColor[] = [];
  for (const item of raw) {
    const hex = normalizeHex((item as any)?.hex);
    if (!hex || seen.has(hex)) continue;
    seen.add(hex);
    const role = COLOR_ROLES.includes((item as any)?.role) ? ((item as any).role as BrandColorRole) : undefined;
    const name = typeof (item as any)?.name === "string" ? (item as any).name.trim().slice(0, 40) : undefined;
    palette.push({ hex, name: name || undefined, role });
    if (palette.length >= 5) break;
  }
  return palette;
}

function normalizeStringList(raw: unknown, maxItems: number, maxLength = 60): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item) => typeof item === "string")
    .map((item) => item.trim().slice(0, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

function extractProfileUrl(link: string | undefined, network: "instagram" | "facebook"): string | undefined {
  if (!link) return undefined;
  const host = network === "instagram" ? "instagram\\.com" : "facebook\\.com";
  const match = new RegExp(`https?://(?:www\\.|m\\.)?${host}/([^/?#\\s]+)`, "i").exec(link);
  if (!match) return undefined;
  const handle = match[1].replace(/\/+$/, "");
  const blocked = [
    "p", "reel", "reels", "explore", "stories", "share", "sharer",
    // Páginas agregadoras do Instagram que não são o perfil do negócio.
    "popular", "accounts", "directory", "about", "legal", "developer", "business", "help",
    // Rotas do Facebook que não são a página do negócio.
    "watch", "groups", "events", "photo", "photos", "video", "videos", "login",
    "privacy", "permalink.php", "profile.php", "pages",
  ];
  if (!handle || blocked.includes(handle.toLowerCase())) {
    return undefined;
  }
  return network === "instagram"
    ? `https://instagram.com/${handle}`
    : `https://facebook.com/${handle}`;
}

/** Aceita "@conta", "conta" ou uma URL completa e devolve a URL do perfil. */
export function normalizeInstagramProfile(raw?: string): string | undefined {
  if (!raw) return undefined;
  const value = raw.trim();
  if (!value) return undefined;
  const fromUrl = extractProfileUrl(value, "instagram");
  if (fromUrl) return fromUrl;
  if (/^https?:\/\//i.test(value)) return undefined;
  const handle = value.replace(/^@/, "").replace(/\/+$/, "");
  return handle ? `https://instagram.com/${handle}` : undefined;
}

/** Mantém apenas imagens com URL https e evita repetições. */
function uniqueImages(images: SerpApiImage[], max: number): SerpApiImage[] {
  const seen = new Set<string>();
  const result: SerpApiImage[] = [];
  for (const image of images) {
    const key = image.imageUrl.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(image);
    if (result.length >= max) break;
  }
  return result;
}

/* ------------------------------------------------------------------ */
/*  Relevância das imagens (evita usar fotos de outra empresa)         */
/* ------------------------------------------------------------------ */

/** Palavras que não ajudam a identificar a marca (categoria/ruído). */
const GENERIC_NAME_TOKENS = new Set([
  "de", "da", "do", "das", "dos", "e", "em", "ltda", "me", "epp", "sa",
  "loja", "lojas", "servico", "servicos", "comercio", "empresa", "grupo",
  "centro", "clinica", "transportadora", "material", "materiais", "casa",
  "oficial", "brasil", "goias", "goias",
]);

function normalizeForMatch(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function distinctiveNameTokens(lead: StoredLead): string[] {
  return normalizeForMatch(lead.name)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3 && !GENERIC_NAME_TOKENS.has(token));
}

/**
 * Mantém imagens cujo título/URL de origem contém os tokens distintivos do
 * nome do negócio. Sem isso, uma busca por "Achei Ferragens" pode trazer o
 * logo de "Real Ferragens" e a IA acaba assumindo a marca errada.
 */
function filterRelevantImages(images: SerpApiImage[], lead: StoredLead): SerpApiImage[] {
  const tokens = distinctiveNameTokens(lead);
  if (!tokens.length) return images;

  const required = Math.min(2, tokens.length);
  const relevant = images.filter((image) => {
    const haystack = normalizeForMatch(
      [image.title, image.sourceUrl, image.imageUrl].filter(Boolean).join(" ")
    );
    return tokens.filter((token) => haystack.includes(token)).length >= required;
  });

  return relevant;
}

/** Bloqueia esquemas estranhos e hosts internos (defesa contra SSRF). */
function isSafeRemoteUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!/^https?:$/.test(parsed.protocol)) return false;
    const host = parsed.hostname.toLowerCase();
    if (!host || host === "localhost" || host.endsWith(".local")) return false;
    if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host)) return false;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;
    return true;
  } catch {
    return false;
  }
}

async function downloadImage(url: string): Promise<{ mimeType: string; data: string } | null> {
  if (!isSafeRemoteUrl(url)) return null;
  const maxBytes = Number(process.env.BRAND_RESEARCH_MAX_IMAGE_BYTES || 4_000_000);
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(Number(process.env.BRAND_RESEARCH_IMAGE_TIMEOUT_MS || 8000)),
      headers: {
        // Alguns CDNs recusam requisições sem User-Agent.
        "User-Agent": "Mozilla/5.0 (compatible; LeadRadarBrandResearch/1.0)",
        Accept: "image/*",
      },
    });
    if (!res.ok) return null;
    const rawType = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!rawType.startsWith("image/")) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    if (!buffer.length || buffer.length > maxBytes) return null;
    const mimeType = rawType === "image/jpg" ? "image/jpeg" : rawType;
    return { mimeType, data: buffer.toString("base64") };
  } catch {
    return null;
  }
}

function buildVisionPrompt(lead: StoredLead, images: DownloadedImage[]): string {
  const context = [
    `Negócio: ${lead.name}`,
    lead.category ? `Categoria: ${lead.category}` : null,
    lead.city ? `Cidade: ${lead.city}${lead.state ? `/${lead.state}` : ""}` : null,
    lead.instagramHandle ? `Instagram informado no cadastro: ${lead.instagramHandle}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const imageList = images
    .map((item, index) => {
      const origin = item.image.sourceUrl ? ` — origem: ${item.image.sourceUrl}` : "";
      const title = item.image.title ? ` — título: ${item.image.title}` : "";
      return `Imagem ${index}:${title}${origin}`;
    })
    .join("\n");

  return `Você é um diretor de arte especializado em landing pages para negócios locais.

Analise as imagens públicas abaixo, coletadas por busca no Google, e extraia a identidade visual que este negócio JÁ usa (ou que o público dele claramente responde bem).

${context}

Imagens:
${imageList}

Regras:
- Baseie-se SOMENTE no que aparece nas imagens. Não invente cores, fontes ou logos.
- Ignore imagens que claramente não sejam do negócio (pessoas aleatórias, produtos de outras marcas, memes).
- Se NENHUMA imagem parecer ser do negócio, devolva "palette": [], "tone": [], "confidence": 0 e explique em "notes".
- Cores sempre em hexadecimal #RRGGBB. No máximo 5, da mais dominante para a menos dominante.
- "tone": 3 a 6 adjetivos curtos em português (ex.: rústico, acolhedor, minimalista, vibrante).
- "logo": apenas se houver um logo legível. "imageIndex" é o índice da imagem (começa em 0). Se não houver logo claro, omita o campo.
- "imagery": até 4 imagens que sirvam de referência de estilo (fotos, texturas, composições), com o índice e uma descrição curta.
- "summary": 1 parágrafo curto e acionável para quem vai desenhar a landing page.
- "confidence": 0 a 1, o quanto você confia que essa identidade é realmente do negócio.
- "notes": limitações (imagens ruins, perfil privado, marca ambígua). Pode ser vazio.

Responda SOMENTE com JSON válido neste formato:
{
  "palette": [{"hex": "#RRGGBB", "name": "nome da cor", "role": "primary|secondary|accent|background|text"}],
  "tone": ["adjetivo"],
  "typography": {"display": "estilo ou fonte provável", "body": "estilo ou fonte provável", "notes": "observações"},
  "logo": {"imageIndex": 0, "description": "descrição do logo", "confidence": 0.0},
  "imagery": [{"imageIndex": 0, "description": "o que a imagem mostra"}],
  "summary": "resumo acionável",
  "confidence": 0.0,
  "notes": ""
}`;
}

function normalizeSnapshot(
  raw: any,
  lead: StoredLead,
  images: DownloadedImage[],
  query: string,
  profiles: { instagram?: string; facebook?: string }
): BrandSnapshot {
  const palette = normalizePalette(raw?.palette);
  const tone = normalizeStringList(raw?.tone, 6, 40);
  const summary =
    typeof raw?.summary === "string" && raw.summary.trim()
      ? raw.summary.trim().slice(0, 1200)
      : `${lead.name}${lead.category ? ` (${lead.category})` : ""} — identidade visual captada em imagens públicas.`;

  const imageAt = (index: unknown): SerpApiImage | undefined => {
    const i = typeof index === "number" ? index : Number(index);
    return Number.isInteger(i) && i >= 0 && i < images.length ? images[i].image : undefined;
  };

  const logoImage = imageAt(raw?.logo?.imageIndex);
  const logo = logoImage
    ? {
        url: logoImage.imageUrl,
        description:
          typeof raw?.logo?.description === "string" ? raw.logo.description.trim().slice(0, 300) : undefined,
        confidence: clamp(raw?.logo?.confidence, 0, 1, 0.5),
      }
    : undefined;

  const imagery: BrandSnapshot["imagery"] = [];
  if (Array.isArray(raw?.imagery)) {
    for (const item of raw.imagery.slice(0, 4)) {
      const image = imageAt((item as any)?.imageIndex);
      if (!image) continue;
      imagery.push({
        url: image.imageUrl,
        description:
          typeof (item as any)?.description === "string" ? (item as any).description.trim().slice(0, 300) : undefined,
      });
    }
  }

  const typography =
    raw?.typography && typeof raw.typography === "object"
      ? {
          display: typeof raw.typography.display === "string" ? raw.typography.display.trim().slice(0, 80) : undefined,
          body: typeof raw.typography.body === "string" ? raw.typography.body.trim().slice(0, 80) : undefined,
          notes: typeof raw.typography.notes === "string" ? raw.typography.notes.trim().slice(0, 300) : undefined,
        }
      : undefined;

  const notes: string[] = [];
  if (typeof raw?.notes === "string" && raw.notes.trim()) notes.push(raw.notes.trim().slice(0, 500));
  if (palette.length === 0) notes.push("A IA não identificou cores confiáveis nas imagens.");
  if (!logo) notes.push("Nenhum logo legível foi identificado.");

  const confidence = clamp(raw?.confidence, 0, 1, palette.length ? 0.5 : 0.2);

  // Confiança muito baixa = as imagens provavelmente não são do negócio.
  // Não devolvemos uma paleta/logo enganosos: é melhor assumir que não achamos.
  if (confidence < 0.25) {
    const reason =
      typeof raw?.notes === "string" && raw.notes.trim()
        ? raw.notes.trim().slice(0, 500)
        : "As imagens encontradas não parecem ser do negócio.";
    return {
      version: BRAND_SNAPSHOT_VERSION,
      createdAt: new Date().toISOString(),
      source: "serpapi",
      query,
      profiles,
      palette: [],
      tone: [],
      typography: undefined,
      logo: undefined,
      imagery: [],
      summary: `Não foi possível confirmar a identidade visual de ${lead.name} em imagens públicas. ${reason} Recomenda-se criar uma identidade nova a partir do briefing.`,
      confidence,
      notes: `Pesquisa sem resultado confiável. ${reason}`.trim(),
    };
  }

  return {
    version: BRAND_SNAPSHOT_VERSION,
    createdAt: new Date().toISOString(),
    source: "serpapi",
    query,
    profiles,
    palette,
    tone,
    typography,
    logo,
    imagery,
    summary,
    confidence,
    notes: notes.length ? notes.join(" ") : undefined,
  };
}

function buildSearchQuery(lead: StoredLead): string {
  const name = String(lead.name || "").trim();
  // Aspas aumentam muito a precisão no Google Imagens (evita fotos de outras
  // empresas com nome parecido). Se o nome já tiver aspas, não duplica.
  const quotedName = name && !name.includes('"') ? `"${name}"` : name;
  return [quotedName, lead.category, lead.city, lead.state]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Extrai a mensagem real do erro do SDK (que às vezes vem como JSON em string). */
function geminiErrorMessage(err: any): string {
  const raw = String(err?.message || err || "");
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.error?.message) return String(parsed.error.message);
  } catch {
    /* mensagem já é texto */
  }
  return raw.slice(0, 300);
}

function isTransientGeminiError(message: string): boolean {
  return /503|UNAVAILABLE|high demand|overloaded|429|RESOURCE_EXHAUSTED|try again later/i.test(message);
}

/**
 * Cota do Gemini é por modelo no free tier. Estourar a cota do modelo
 * principal ainda permite tentar outro modelo — por isso tratamos como
 * "tentar o próximo" e só desistimos quando todos falham.
 */
function isGeminiQuotaError(message: string): boolean {
  return /quota|rate limit|exceeded your current quota|per day limit/i.test(message);
}

/**
 * Chama o Gemini vision com fallback de modelo para 503/429 (alta demanda).
 * Erros permanentes e timeouts sobem com mensagem amigável.
 */
async function generateVision(ai: GoogleGenAI, parts: any[]): Promise<string> {
  const primary = getGeminiModel();
  const fallbacks = (process.env.GEMINI_VISION_FALLBACK_MODEL || "gemini-3.1-flash-lite")
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean);
  const models = Array.from(new Set([primary, ...fallbacks]));

  let lastMessage = "";
  for (const model of models) {
    const isPrimary = model === primary;
    const timeoutMs = isPrimary
      ? Number(process.env.GEMINI_VISION_TIMEOUT_MS || 30000)
      : Number(process.env.GEMINI_VISION_FALLBACK_TIMEOUT_MS || 30000);
    try {
      const response = await ai.models.generateContent({
        model,
        contents: [{ role: "user", parts }],
        config: {
          responseMimeType: "application/json",
          abortSignal: AbortSignal.timeout(timeoutMs),
        },
      });
      const text = response.text?.trim();
      if (!text) throw new Error("A IA não retornou uma análise de identidade visual válida.");
      return text;
    } catch (err: any) {
      lastMessage = geminiErrorMessage(err);
      // Timeout do modelo: vale tentar o próximo (mais leve) uma vez.
      if (/aborted|timeout|timed out|ETIMEDOUT|UND_ERR_CONNECT_TIMEOUT/i.test(lastMessage)) continue;
      // Cota é por modelo no free tier: outro modelo pode ter cota livre.
      if (isGeminiQuotaError(lastMessage)) continue;
      // Erro permanente (ex.: chave inválida) não melhora com fallback.
      if (!isTransientGeminiError(lastMessage)) break;
    }
  }

  if (isGeminiQuotaError(lastMessage)) {
    throw new Error(
      "A cota gratuita do Gemini acabou para hoje (limite por modelo). Tente novamente mais tarde ou configure outro GEMINI_VISION_FALLBACK_MODEL."
    );
  }
  if (isTransientGeminiError(lastMessage)) {
    throw new Error("O Gemini está com alta demanda no momento. Tente novamente em alguns minutos.");
  }
  if (/aborted|timeout|timed out|ETIMEDOUT|UND_ERR_CONNECT_TIMEOUT/i.test(lastMessage)) {
    throw new Error(
      "A análise visual demorou mais que o esperado (Gemini). Tente novamente em alguns minutos ou reduza o número de imagens."
    );
  }
  throw new Error(`Falha na análise visual com Gemini: ${lastMessage || "erro desconhecido"}`);
}

/**
 * Pesquisa a identidade visual de um lead e persiste o snapshot no cadastro.
 * Nunca roda automaticamente: é disparada pela UI ou pela tool MCP.
 */
export async function researchLeadBrand(
  leadId: string,
  options: BrandResearchOptions = {}
): Promise<BrandResearchResult> {
  const lead = getLeadById(leadId);
  if (!lead) throw new Error("Lead não encontrado.");

  if (lead.brandSnapshot && options.force !== true) {
    return {
      lead,
      snapshot: lead.brandSnapshot,
      cached: true,
      searchesUsed: 0,
      imagesAnalyzed: 0,
    };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY não configurada — a análise visual precisa do Gemini.");

  const maxImages = Math.max(1, Math.min(Math.floor(options.maxImages ?? 6), 10));
  const maxSearches = Math.max(1, Math.min(Math.floor(options.maxSearches ?? 2), 3));
  const query = buildSearchQuery(lead);
  if (!query) throw new Error("Lead sem nome/cidade suficientes para pesquisar a identidade visual.");

  let searchesUsed = 0;

  // 1) Imagens públicas do negócio.
  let images = await searchSerpApiImages({ query, limit: maxImages * 3 });
  searchesUsed += 1;

  // Fallback: algumas cidades retornam pouca coisa com a query completa.
  if (images.length < 2 && searchesUsed < maxSearches) {
    const fallback = await searchSerpApiImages({ query: `${lead.name} logo`, limit: maxImages * 2 });
    searchesUsed += 1;
    images = uniqueImages([...images, ...fallback], maxImages * 3);
  }

  // Descarta fotos de outras empresas: sem isso a IA pode assumir a marca errada.
  images = filterRelevantImages(images, lead);
  if (images.length === 0) {
    throw new Error(
      `Não encontramos imagens públicas que correspondam a "${lead.name}". Confira o nome/cidade do lead ou tente novamente mais tarde.`
    );
  }

  // 2) Perfis públicos: primeiro pelas páginas de origem das imagens.
  let instagram = normalizeInstagramProfile(lead.instagramHandle);
  let facebook: string | undefined;
  for (const image of images) {
    instagram = instagram || extractProfileUrl(image.sourceUrl, "instagram");
    facebook = facebook || extractProfileUrl(image.sourceUrl, "facebook");
  }

  if (!instagram && !facebook && options.includeProfiles !== false && searchesUsed < maxSearches) {
    const profiles = await searchSerpApiWeb({
      query: `"${lead.name}" ${lead.city || ""} (site:instagram.com OR site:facebook.com)`.trim(),
      limit: 10,
    });
    searchesUsed += 1;
    for (const result of profiles) {
      instagram = instagram || extractProfileUrl(result.link, "instagram");
      facebook = facebook || extractProfileUrl(result.link, "facebook");
    }
  }

  // 3) Baixa as imagens (preferindo miniaturas, menores e mais estáveis).
  const selected = uniqueImages(images, maxImages);
  if (selected.length === 0) {
    throw new Error(
      "Não encontramos imagens públicas do negócio. Confira se o nome/cidade estão corretos ou tente novamente mais tarde."
    );
  }

  const downloads = await Promise.all(
    selected.map(async (image) => {
      const download = await downloadImage(image.thumbnailUrl || image.imageUrl);
      return download ? ({ image, ...download } as DownloadedImage) : null;
    })
  );
  const downloaded = downloads.filter((item): item is DownloadedImage => Boolean(item));

  if (downloaded.length === 0) {
    throw new Error(
      "As imagens foram encontradas, mas não puderam ser baixadas (bloqueio do site de origem). Tente novamente em alguns minutos."
    );
  }

  // 4) Gemini vision → JSON estrito.
  const ai = new GoogleGenAI({ apiKey });
  const parts: any[] = [{ text: buildVisionPrompt(lead, downloaded) }];
  downloaded.forEach((item, index) => {
    parts.push({ text: `Imagem ${index}: ${item.image.title || "(sem título)"}` });
    parts.push({ inlineData: { mimeType: item.mimeType, data: item.data } });
  });

  const text = await generateVision(ai, parts);

  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("A IA retornou uma resposta inválida para a identidade visual. Tente novamente.");
  }

  const snapshot = normalizeSnapshot(parsed, lead, downloaded, query, {
    instagram,
    facebook,
  });

  setLeadBrandSnapshot(lead.id, snapshot);

  return {
    lead: getLeadById(lead.id)!,
    snapshot,
    cached: false,
    searchesUsed,
    imagesAnalyzed: downloaded.length,
  };
}

/** Texto pronto para entrar no prompt de design/dev kit. */
export function formatBrandSnapshotForPrompt(snapshot?: BrandSnapshot): string {
  if (!snapshot) return "";
  const lines: string[] = ["Identidade visual do lead (captada em perfis/imagens públicas):"];

  if (snapshot.palette.length) {
    const palette = snapshot.palette
      .map((color) => `${color.hex}${color.role ? ` (${color.role})` : ""}${color.name ? ` ${color.name}` : ""}`)
      .join(", ");
    lines.push(`- Paleta: ${palette}`);
  }
  if (snapshot.tone.length) lines.push(`- Tom visual: ${snapshot.tone.join(", ")}`);
  if (snapshot.typography) {
    const typo = [snapshot.typography.display, snapshot.typography.body].filter(Boolean).join(" / ");
    if (typo) lines.push(`- Tipografia observada: ${typo}`);
    if (snapshot.typography.notes) lines.push(`- Notas de tipografia: ${snapshot.typography.notes}`);
  }
  if (snapshot.logo) {
    lines.push(
      `- Logo: ${snapshot.logo.description || "identificado nas imagens"}${snapshot.logo.url ? ` (${snapshot.logo.url})` : ""}`
    );
  }
  if (snapshot.profiles.instagram || snapshot.profiles.facebook) {
    lines.push(
      `- Perfis: ${[snapshot.profiles.instagram, snapshot.profiles.facebook].filter(Boolean).join(" | ")}`
    );
  }
  lines.push(`- Resumo: ${snapshot.summary}`);
  if (snapshot.notes) lines.push(`- Observações: ${snapshot.notes}`);
  lines.push(
    "Use essa identidade como ponto de partida (cores, tom e referências), sem copiar textos ou imagens de terceiros."
  );

  return lines.join("\n");
}
