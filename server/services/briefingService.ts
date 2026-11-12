/**
 * Briefing por lead: o dossiê que o agente de IA recebe ANTES de falar.
 *
 * Existe porque o agente respondia "no escuro": piloto automático com nome,
 * cidade e categoria não sustenta conversa comercial. Aqui os fatos são
 * separados em três caixas, e o prompt só pode usar as duas primeiras:
 *
 *   1. FATOS VERIFICADOS  — nota, nº de avaliações, categoria buscada, presença
 *   2. O QUE ELE PERDE    — a consequência concreta da lacuna (o gancho)
 *   3. NÃO CITE           — ficha/marca de baixa confiança, dado pessoal, ticket interno
 *
 * Tudo é gerado por código, a partir do SQLite. O modelo nunca "lembra" nada:
 * ele recebe este texto e escreve a mensagem.
 */

import { getCommunicationsByLead } from "../store/db";
import type { Communication } from "../store/db";
import type { StoredLead } from "../store/types";
import { effectiveWebsiteStatus, presenceLabel } from "./presenceService";
import {
  deliveryLabel,
  formatBRL,
  formatPackagesShort,
  formatPolicyForPrompt,
  cheapestPackage,
  getCommercialPolicy,
  type CommercialPolicy,
} from "./commercialPolicy";

export type BriefingObjective =
  | "primeiro_contato"
  | "responder"
  | "segundo_toque"
  | "terceiro_toque"
  | "reengajar";

export interface BriefingHistoryItem {
  direction: "inbound" | "outbound";
  at: string;
  text: string;
  intent?: string | null;
}

export interface LeadBriefing {
  leadId: string;
  displayName: string;
  category: string;
  searchCategory?: string;
  location: string;
  score: number;
  /** Sinais de dor verificáveis — a matéria-prima do gancho. */
  facts: string[];
  /** O que a falta de site custa na prática. */
  losses: string[];
  /** O que o agente NÃO pode citar. */
  forbidden: string[];
  history: BriefingHistoryItem[];
  objective: BriefingObjective;
  objectiveText: string;
  /** O que ainda falta saber para avançar (vira pergunta na conversa). */
  missingInfo: string[];
  attempts: number;
  pipeline: string;
  policy: CommercialPolicy;
  /** Bloco pronto para o prompt. */
  prompt: string;
}

const SOCIAL_LABEL: Record<string, string> = {
  none: "sem site próprio",
  social_only: "só rede social (Instagram/Facebook)",
  marketplace_only: "só marketplace",
  has_website: "já tem site próprio",
};

/** Nome apresentável (o Google devolve CAIXA ALTA). */
export function prettyName(raw?: string, maxLength = 60): string {
  const cleaned = String(raw || "").replace(/\s+/g, " ").trim();
  if (!cleaned) return "a empresa";
  const small = new Set(["de", "da", "do", "das", "dos", "e", "em", "no", "na", "nos", "nas"]);
  // Nomes de negócio começam com símbolo ("+Sorriso", "&Cia", "💪 Academia"):
  // capitalizar `word[0]` não faz nada nesses casos, então achamos a 1ª LETRA.
  const upperFirstLetter = (word: string): string => {
    const index = word.search(/[a-zà-ú]/i);
    if (index === -1) return word;
    return word.slice(0, index) + word.charAt(index).toUpperCase() + word.slice(index + 1);
  };
  const titled = cleaned
    .toLowerCase()
    .split(" ")
    .map((word, index) => (index > 0 && small.has(word) ? word : upperFirstLetter(word)))
    .join(" ");
  return titled.length > maxLength ? `${titled.slice(0, maxLength).trim()}…` : titled;
}

function formatRating(rating?: number): string {
  if (typeof rating !== "number" || !Number.isFinite(rating)) return "";
  return String(rating).replace(".", ",");
}

function objectiveFor(lead: StoredLead, latest?: Communication): { objective: BriefingObjective; text: string } {
  if (latest && latest.direction === "inbound") {
    return {
      objective: "responder",
      text: "Ele acabou de falar: responda o que ELE perguntou, em 1 a 3 frases, e termine com uma pergunta curta.",
    };
  }
  const attempts = lead.contactAttempts ?? 0;
  if (attempts === 0) {
    return {
      objective: "primeiro_contato",
      text: "Primeiro contato. Objetivo: conseguir um 'pode mandar'. Não é vender, é abrir a conversa.",
    };
  }
  if (attempts === 1) {
    return {
      objective: "segundo_toque",
      text: "Segundo toque (ele não respondeu). Objetivo: a prévia gratuita da primeira tela — algo concreto, não 'passando para saber'.",
    };
  }
  if (attempts === 2) {
    return {
      objective: "terceiro_toque",
      text: "Terceiro e último toque. Objetivo: pergunta de saída honesta ('fecho seu contato por aqui?'). Nada de pressão nem prazo inventado.",
    };
  }
  return {
    objective: "reengajar",
    text: "Recontato autorizado. Releia o histórico antes de escrever: ele já viu três mensagens.",
  };
}

/** Fatos que o agente pode citar (e que ele pode verificar no Google). */
export function verifiedFacts(lead: StoredLead): string[] {
  const facts: string[] = [];
  const rating = formatRating(lead.rating);

  if (rating && lead.reviewsCount) {
    facts.push(`Nota ${rating}★ no Google com ${lead.reviewsCount} avaliações`);
  } else if (rating) {
    facts.push(`Nota ${rating}★ no Google`);
  } else if (lead.reviewsCount) {
    facts.push(`${lead.reviewsCount} avaliações no Google`);
  }

  const status = effectiveWebsiteStatus(lead);
  const platform = presenceLabel(lead.websiteUrl);
  if (status === "none") facts.push("Não tem site próprio (o Google mostra só o perfil do Maps)");
  else if (status === "social_only") facts.push(`Presença só em rede social${lead.instagramHandle ? ` (@${lead.instagramHandle})` : ""}`);
  else if (status === "marketplace_only") facts.push(`Presença só em marketplace${platform ? ` (${platform})` : ""}`);
  else if (status === "has_website") facts.push(`Site próprio: ${lead.websiteUrl || "existe, mas sem auditoria"}`);

  if (lead.neighborhood) facts.push(`Fica em ${lead.neighborhood}${lead.city ? `, ${lead.city}` : ""}`);
  const niche = lead.searchCategory || lead.category;
  if (niche) facts.push(`Ramo: ${niche}`);
  return facts;
}

/** A consequência de negócio — o que faz o dono responder. */
export function concreteLosses(lead: StoredLead): string[] {
  const status = effectiveWebsiteStatus(lead);
  const niche = (lead.searchCategory || lead.category || "serviço").toLowerCase();
  const where = lead.city ? `em ${lead.city}` : "na região";

  if (status === "has_website") {
    return ["Já tem site: o gancho é velocidade, celular e botão de WhatsApp — nunca 'você não tem site'."];
  }
  if (status === "social_only") {
    return [
      `Quem procura ${niche} ${where} no Google não encontra um endereço próprio, só um perfil`,
      "No Instagram o cliente vê o post, mas não vê preço, horário e nem como pedir orçamento num lugar só",
    ];
  }
  if (status === "marketplace_only") {
    return [
      "Vender só em marketplace significa pagar comissão e não aparecer como marca própria no Google",
      "O cliente do marketplace compara preço; o do site próprio escolhe você",
    ];
  }
  return [
    `Quem pesquisa ${niche} ${where} no Google encontra os concorrentes primeiro — ele aparece só como pino no mapa`,
    "Sem site, o cliente que achou no Google não tem para onde ir: ou liga (se estiver aberto) ou desiste",
    "As avaliações boas dele não aparecem em nenhum lugar que ele controle",
  ];
}

/** O que nunca pode ser citado: dado de baixa confiança, pessoal ou interno. */
export function forbiddenClaims(lead: StoredLead): string[] {
  const forbidden = [
    "Ticket/valor estimado do CRM (ex.: R$ 1.800–3.500). Só existe o preço da política comercial.",
    "CNPJ, endereço completo, sócios, CRM/CRO/CREFITO ou qualquer dado de ficha — parece vigilância.",
  ];
  const profile: any = lead.clientProfile;
  if (profile && typeof profile.confidence === "number" && profile.confidence < 0.5) {
    forbidden.push(`Ficha do cliente com confiança ${profile.confidence} — conteúdo não confiável, ignore.`);
  }
  const brand: any = lead.brandSnapshot;
  if (brand && typeof brand.confidence === "number" && brand.confidence < 0.5) {
    forbidden.push("Identidade visual captada com baixa confiança — não cite cores, slogan ou prêmios.");
  }
  if (!lead.phone) forbidden.push("Não há telefone: canal é e-mail, não WhatsApp.");
  return forbidden;
}

function historyOf(lead: StoredLead, limit = 8): BriefingHistoryItem[] {
  let comms: Communication[] = [];
  try {
    comms = getCommunicationsByLead(lead.id);
  } catch {
    return [];
  }
  return comms
    .filter((c) => c.status !== "failed")
    .slice(0, limit)
    .reverse()
    .map((c) => ({
      direction: c.direction === "inbound" ? ("inbound" as const) : ("outbound" as const),
      at: c.createdAt,
      text: String(c.message || "").replace(/^\[RECEBIDA\]\s*/, "").slice(0, 400),
      intent: c.intent ?? null,
    }));
}

function missingInfoFor(lead: StoredLead, history: BriefingHistoryItem[]): string[] {
  const asked = history.filter((h) => h.direction === "outbound").map((h) => h.text.toLowerCase()).join(" ");
  const missing: string[] = [];
  if (!/destacar|quer mostrar|principal/.test(asked)) missing.push("O que ele quer que apareça primeiro na página (serviço principal)");
  if (!/foto|logo|imagem/.test(asked)) missing.push("Se ele tem fotos/logo do negócio");
  if (!/horário|funciona/.test(asked)) missing.push("Horário de funcionamento");
  if (lead.pipelineStatus === "negotiating") missing.push("Quem decide e como prefere falar (WhatsApp, ligação, reunião)");
  return missing.slice(0, 3);
}

export function buildLeadBriefing(lead: StoredLead, policy: CommercialPolicy = getCommercialPolicy()): LeadBriefing {
  const history = historyOf(lead);
  const latest = history.length ? history[history.length - 1] : undefined;
  const { objective, text: objectiveText } = objectiveFor(lead, latest as any);
  const cheapest = cheapestPackage(policy);

  const location = [lead.neighborhood, lead.city, lead.state].filter(Boolean).join(", ") || "local não informado";

  const briefing: LeadBriefing = {
    leadId: lead.id,
    displayName: prettyName(lead.name),
    category: lead.searchCategory || lead.category || "negócio local",
    searchCategory: lead.searchCategory,
    location,
    score: lead.opportunityScore ?? 0,
    facts: verifiedFacts(lead),
    losses: concreteLosses(lead),
    forbidden: forbiddenClaims(lead),
    history,
    objective,
    objectiveText,
    missingInfo: missingInfoFor(lead, history),
    attempts: lead.contactAttempts ?? 0,
    pipeline: lead.pipelineStatus,
    policy,
    prompt: "",
  };
  briefing.prompt = formatBriefingForPrompt(briefing);
  return briefing;
}

/** Formato final que entra no prompt do modelo. */
export function formatBriefingForPrompt(briefing: LeadBriefing): string {
  const policy = briefing.policy;
  const cheapest = cheapestPackage(policy);
  const lines: string[] = [];

  lines.push("# DOSSIÊ DO LEAD");
  lines.push("");
  lines.push(`- Nome: ${briefing.displayName}`);
  lines.push(`- Ramo: ${briefing.category}`);
  lines.push(`- Onde: ${briefing.location}`);
  lines.push(`- Score interno: ${briefing.score}/100 (uso interno, NÃO cite)`);
  lines.push(`- Etapa no funil: ${briefing.pipeline} · toques já feitos: ${briefing.attempts}`);

  lines.push("");
  lines.push("## Fatos verificados (pode citar)");
  for (const f of briefing.facts) lines.push(`- ${f}`);

  lines.push("");
  lines.push("## O que a falta de site custa para ele (use UM destes, no máximo)");
  for (const l of briefing.losses) lines.push(`- ${l}`);

  if (briefing.forbidden.length) {
    lines.push("");
    lines.push("## NÃO CITE");
    for (const f of briefing.forbidden) lines.push(`- ${f}`);
  }

  if (briefing.history.length) {
    lines.push("");
    lines.push("## Histórico da conversa (mais antigo primeiro)");
    for (const h of briefing.history) {
      const who = h.direction === "inbound" ? "ELE" : "NÓS";
      lines.push(`- ${who}${h.intent ? ` (${h.intent})` : ""}: ${h.text}`);
    }
  } else {
    lines.push("");
    lines.push("## Histórico da conversa");
    lines.push("- Nenhuma mensagem trocada ainda. Este é o primeiro contato.");
  }

  lines.push("");
  lines.push("## Objetivo deste toque");
  lines.push(briefing.objectiveText);

  if (briefing.missingInfo.length) {
    lines.push("");
    lines.push("## O que ainda falta saber (no máximo UMA pergunta por mensagem)");
    for (const m of briefing.missingInfo) lines.push(`- ${m}`);
  }

  lines.push("");
  lines.push("## Oferta");
  lines.push(formatPolicyForPrompt(policy));
  lines.push("");
  lines.push(
    `Resumo para citar se ele pedir detalhe: ${formatPackagesShort(policy).join(" · ")} · entrega em ${deliveryLabel(policy)}${
      policy.previewFree ? " · prévia da primeira tela gratuita" : ""
    }.`
  );
  lines.push(`Valor mínimo autorizado: ${formatBRL(cheapest.price)} (${cheapest.name}).`);

  return lines.filter((l) => l !== undefined).join("\n");
}
