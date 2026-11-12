/**
 * Agente comercial de IA: escreve a abordagem, a conversa e os follow-ups.
 *
 * Arquitetura: DOSSIÊ (código) → MODELO (texto) → PORTÃO (QA) → humanização
 *
 * - O dossiê vem de `briefingService` (fatos reais, nunca do modelo).
 * - O modelo só tem uma tarefa: transformar o dossiê em UMA mensagem curta.
 * - O portão de QA rejeita preço inventado, link, textão, emoji, "prezado" e
 *   saudação repetida — e manda o modelo reescrever uma vez.
 * - Se ainda assim falhar (ou a IA estiver fora), cai no texto determinístico:
 *   o agente NUNCA deixa de responder por causa da IA.
 */

import { GoogleGenAI } from "@google/genai";
import { getGeminiModel } from "../config";
import { getCommunicationsByLead, getSetting } from "../store/db";
import type { StoredLead } from "../store/types";
import { buildLeadBriefing, type LeadBriefing } from "./briefingService";
import { WHATSAPP_STYLE_RULES, whatsAppify } from "./messageStyle";
import {
  allowedPrices,
  cheapestPackage,
  deliveryLabel,
  formatBRL,
  getCommercialPolicy,
} from "./commercialPolicy";
import { dispatchLeadContact, dispatchLeadReply, type ContactDispatchResult } from "./interactionService";

const GEMINI_TIMEOUT_MS = Number(process.env.GEMINI_AGENT_TIMEOUT_MS || 30000);

/**
 * `automation_agent_enabled` controla QUEM responde o WhatsApp — com o bot
 * Clara no comando, o auto-atendimento do app fica desligado. Não é um
 * interruptor da IA: a composição sempre tenta a IA e cai no texto
 * determinístico se ela falhar.
 */
export function agentEnabled(): boolean {
  try {
    return getSetting("automation_agent_enabled") !== "false";
  } catch {
    return true;
  }
}

export type ComposedSource = "ia" | "template";

export interface ComposedMessage {
  message: string;
  source: ComposedSource;
  /** Gancho comercial (métrica). */
  hook: string;
  /** Por que esse texto — auditoria, não vai para o cliente. */
  rationale?: string;
  /** O que o QA reprovou na 1ª tentativa (vazio = passou de primeira). */
  issues?: string[];
}

export interface AgentContext {
  lead: StoredLead;
  briefing: LeadBriefing;
}

/* ------------------------------------------------------------------ */
/*  Chamada ao modelo (com reserva, como manda o padrão do repo)       */
/* ------------------------------------------------------------------ */

function modelList(): string[] {
  const primary = getGeminiModel();
  const fallbacks = (
    process.env.GEMINI_AGENT_FALLBACK_MODEL ||
    process.env.GEMINI_PROFILE_FALLBACK_MODEL ||
    process.env.GEMINI_VISION_FALLBACK_MODEL ||
    "gemini-3.1-flash-lite"
  )
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return Array.from(new Set([primary, ...fallbacks]));
}

function isCapacityError(message: string): boolean {
  return /aborted|timeout|timed out|UNAVAILABLE|high demand|overloaded|503|500|502|429|quota/i.test(message);
}

/**
 * Uma chamada de texto ao Gemini. Devolve `null` quando não há chave, quando
 * todos os modelos estão sobrecarregados ou quando o texto volta vazio.
 * Erro definitivo (chave inválida, prompt bloqueado) também degrada para null:
 * o chamador tem fallback e o agente não pode morrer por causa da IA.
 */
async function generateText(prompt: string, opts: { temperature?: number } = {}): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const ai = new GoogleGenAI({ apiKey });
  for (const model of modelList()) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: {
          temperature: opts.temperature ?? 0.7,
          maxOutputTokens: 400,
          abortSignal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
        },
      });
      const raw = response.text?.trim();
      if (raw) return raw;
    } catch (err: any) {
      const message = String(err?.message || err || "");
      if (isCapacityError(message)) continue;
      console.warn(`[agent] IA falhou (${model}): ${message.slice(0, 160)}`);
      return null;
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*  Portão de qualidade do texto                                       */
/* ------------------------------------------------------------------ */

const BANNED_OPENERS = /^(prezad[oa]|estimad[oa]|caro\b|cordialmente|atenciosamente)/i;
const BANNED_WORDS = /(prezad[oa]|estimad[oa]|cordialmente|atenciosamente|assistente virtual|chatbot|\bbot\b|\bIA\b)/i;
const URL_PATTERN = /(https?:\/\/|www\.|\.com\b|\.com\.br)/i;
/**
 * Emoji de verdade (blocos 1F000–1FAFF). NÃO usar faixas largas tipo
 * U+2600–27BF: "★" mora lá e é parte legítima do gancho ("5★ no Google").
 */
const EMOJI = /[\u{1F000}-\u{1FAFF}]/u;
/**
 * Quantificador que o agente NÃO pode provar. "Muitos clientes desistem" é
 * afirmação sobre o negócio do lead que nenhum dado nosso sustenta — e é o
 * tipo de frase que queima a conversa quando o dono pergunta "quantos?".
 */
const UNPROVABLE = /\b(muitos|muitas|v[aá]rios|v[aá]rias|a maioria|grande parte|quase todos|quase todas|70%|80%|90%)\b/i;
const GREETING = /^(ol[áa]|oi|opa|bom dia|boa tarde|boa noite)\b/i;

export interface TextCheck {
  ok: boolean;
  issues: string[];
}

/** Remove acentos para comparar padrões com `\b` (que só entende ASCII). */
function deaccent(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function startsWithGreeting(text: string): boolean {
  return GREETING.test(deaccent(text));
}

/**
 * Extrai os valores em reais citados no texto — tanto `R$ 900` quanto
 * `900 reais` (o modelo escreve das duas formas; validar só `R$` deixaria
 * passar "2.500 reais" inventado).
 */
export function extractPrices(text: string): number[] {
  const found: number[] = [];
  const patterns = [
    /R\$\s*([\d.]+)(?:,(\d{2}))?/gi,
    /(?:^|[^\d])([\d]{1,3}(?:\.[\d]{3})+|[\d]{2,6})(?:,(\d{2}))?\s*(?:reais|real)\b/gi,
  ];
  for (const regex of patterns) {
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const value = Number(match[1].replace(/\./g, ""));
      if (Number.isFinite(value) && value > 0) found.push(value);
    }
  }
  return found;
}

/** Padroniza o valor citado para `R$ 900` (o modelo às vezes escreve "900 reais"). */
export function normalizePriceFormat(text: string, allowedPriceList: number[]): string {
  return text.replace(/([^\d]?)([\d]{1,3}(?:\.[\d]{3})+|[\d]{2,6})\s*(?:reais|real)\b/gi, (full, lead, raw) => {
    const value = Number(String(raw).replace(/\./g, ""));
    if (!allowedPriceList.includes(value)) return full;
    return `${lead}R$ ${raw}`;
  });
}

function normalizeSpaces(text: string): string {
  return text
    .replace(/\*\*/g, "")
    .replace(/^["'`“”]+|["'`“”]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Valida a mensagem ANTES de ela virar WhatsApp.
 * `previous` é o histórico: serve para proibir saudação repetida (o lead não
 * pode receber "Oi, tudo bem?" três vezes na mesma conversa).
 */
export function checkAgentText(
  raw: string,
  input: {
    kind: "approach" | "reply";
    allowedPriceList: number[];
    previousOutbound?: string[];
  }
): TextCheck {
  const issues: string[] = [];
  const text = normalizeSpaces(raw);
  const maxLength = input.kind === "approach" ? 420 : 360;
  const previous = input.previousOutbound || [];

  if (!text) issues.push("mensagem vazia");
  if (text.length > maxLength) issues.push(`texto longo (${text.length}/${maxLength} caracteres)`);
  if (BANNED_OPENERS.test(text)) issues.push("abertura formal (prezado/estimado)");
  if (BANNED_WORDS.test(text)) issues.push("palavra proibida (formalidade ou dizer que é bot/IA)");
  if (URL_PATTERN.test(text)) issues.push("link no corpo da mensagem");
  if (EMOJI.test(text)) issues.push("emoji");
  if (UNPROVABLE.test(text)) issues.push("quantificador não comprovável (muitos/vários/a maioria)");

  for (const value of extractPrices(text)) {
    if (!input.allowedPriceList.includes(value)) issues.push(`preço não autorizado (R$ ${value})`);
  }
  if (input.kind === "approach" && !text.includes("?")) issues.push("sem pergunta (o toque precisa terminar com pergunta)");

  const greetings = previous.filter((p) => startsWithGreeting(normalizeSpaces(p))).length;
  if (greetings > 0 && startsWithGreeting(text)) {
    issues.push("saudação repetida (já cumprimentamos nesta conversa)");
  }
  // Nunca repetir a mensagem anterior palavra por palavra.
  const normalizedPrevious = previous.map((p) => normalizeSpaces(p).toLowerCase());
  if (normalizedPrevious.includes(text.toLowerCase())) issues.push("mensagem idêntica à anterior");

  return { ok: issues.length === 0, issues };
}

/* ------------------------------------------------------------------ */
/*  Prompts                                                            */
/* ------------------------------------------------------------------ */

const VOICE_RULES = `## COMO ESCREVER
- Português do Brasil, tom de gente conversando no WhatsApp. Sem "prezado", sem markdown com #, sem link.
- 2 a 5 linhas curtas, uma ideia por linha (saudação / prova / proposta / pergunta). Nunca um bloco único corrido.
- NUNCA use travessão (—) nem meia-risca (–). É a marca mais óbvia de texto de IA: use vírgula ou ponto.
- Negrito do WhatsApp (*assim*) em no máximo 2 trechos-chave e no máximo 3 emojis (👋 ⭐ 📦 🚀).
- Uma única pergunta, curta, que se responde em 5 segundos ("posso te mandar?", "faz sentido?").
- Fale do negócio DELE primeiro; a empresa aparece no máximo uma vez.
- Escreva como se estivesse digitando no celular: frases curtas, sem parágrafo, sem bullet.
- Nunca invente fato, número, prêmio, cliente ou prazo que não esteja no dossiê.
- Nunca diga que é IA, bot, assistente virtual ou automação. Você é um funcionário da empresa.
- Se o dossiê não tiver o dado que ele pediu, diga que confirma e faça uma pergunta — não chute.
- Nunca use quantificador que você não pode provar: "muitos clientes", "vários", "a maioria", "80%". Se não está no dossiê, não existe.
- Valor sempre no formato "R$ 900", nunca "900 reais".`;

function approachPrompt(ctx: AgentContext): string {
  const { briefing } = ctx;
  return `Você é um vendedor experiente de páginas web para pequenos negócios, escrevendo UMA mensagem de WhatsApp.

${briefing.prompt}

${VOICE_RULES}

${WHATSAPP_STYLE_RULES}

## TAREFA
Escreva o toque descrito em "Objetivo deste toque".
- Use UM fato verificado e UMA consequência concreta. Não empilhe argumentos.
- Termine com uma pergunta de baixo esforço que ofereça a PRÉVIA da primeira tela (é gratuita). Nunca ofereça "proposta", "orçamento" ou "reunião" no primeiro contato.
- Preço e pacote NÃO entram neste toque. Nem cite os nomes dos pacotes: a conversa é sobre a página dele.

Responda APENAS com a mensagem, sem aspas e sem explicação.`;
}

function replyPrompt(ctx: AgentContext, inbound: string): string {
  const { briefing } = ctx;
  return `Você é um vendedor experiente de páginas web para pequenos negócios, respondendo no WhatsApp.

${briefing.prompt}

## O QUE ELE ACABOU DE ESCREVER
"${inbound}"

${VOICE_RULES}

${WHATSAPP_STYLE_RULES}

## TAREFA
Responda o que ele perguntou, respeitando esta ESCADA (não pule etapa):
1. Pediu a prévia/demonstração: confirme que vai montar e faça UMA pergunta objetiva (o que destacar, ou se tem logo/fotos).
2. Se a prévia JÁ foi enviada e ele reagiu bem: pergunte se ele quer conhecer os pacotes (sem citar valor ainda). Só depois dessa resposta sim é que preço entra.
3. Perguntou preço ou pediu os pacotes: aí sim apresente os pacotes em linhas separadas (nome, valor fechado e o que inclui), em negrito no nome e no valor. Nunca invente desconto nem valor fora da política.
4. Se pediu para depois: concorde, pergunte a melhor semana/dia e não insista.
5. Se recusou: agradeça em uma linha e encerre. Não tente reverter.
6. Se foi vago ("oi", "manda"): confirme e faça uma pergunta de qualificação.
NUNCA ofereça pacote nem cite preço no primeiro contato: primeiro a prévia gratuita, depois o convite, depois o preço.
Nunca repita a saudação se o histórico já tem uma.

Responda APENAS com a mensagem, sem aspas e sem explicação.`;
}

function cadencePrompt(ctx: AgentContext, angle: "prova" | "prazo"): string {
  const { briefing } = ctx;
  const task =
    angle === "prova"
      ? `Este é o SEGUNDO toque (ele não respondeu). Traga algo concreto: a prévia gratuita da primeira tela, já que você viu o negócio dele no Google. Nada de "passando para saber se viu".`
      : `Este é o TERCEIRO e ÚLTIMO toque. Faça uma pergunta de saída honesta: reconheça que talvez não seja prioridade agora e pergunte se pode encerrar o contato. Zero pressão, zero prazo inventado, zero escassez.`;
  return `Você é um vendedor experiente de páginas web para pequenos negócios, no WhatsApp.

${briefing.prompt}

${VOICE_RULES}

${WHATSAPP_STYLE_RULES}

## TAREFA
${task}
Não repita o que já foi dito no histórico.

Responda APENAS com a mensagem, sem aspas e sem explicação.`;
}

/* ------------------------------------------------------------------ */
/*  Fallback determinístico (sem IA)                                   */
/* ------------------------------------------------------------------ */

/**
 * Texto de emergência. Segue a MESMA estrutura do prompt (fato + perda +
 * pergunta) para o lead não perceber que a IA caiu. Usa só dado do briefing.
 */
export function fallbackApproachMessage(briefing: LeadBriefing, angle: "abertura" | "prova" | "prazo" = "abertura"): string {
  const name = briefing.displayName;
  const fact = briefing.facts[0] || `Achei a ${name} no Google`;
  const loss = briefing.losses[0] || "quem procura no Google não encontra vocês";

  if (angle === "prova") {
    return whatsAppify(
      [
        `Oi, ${name}! Montei uma prévia de como ficaria a primeira tela da página de vocês 👀`,
        "",
        "Já vem com botão de WhatsApp e formulário de orçamento.",
        "",
        "É *grátis*, sem custo nenhum. Posso mandar aqui?",
      ].join("\n")
    );
  }
  if (angle === "prazo") {
    return whatsAppify(
      [
        `Oi, ${name}. Imagino que site não seja prioridade agora.`,
        "",
        "Quer que eu encerre o contato por aqui? Se um dia fizer sentido, é só me chamar.",
      ].join("\n")
    );
  }
  return whatsAppify(
    [
      `Oi! Vi a ${name} no Google 👋`,
      "",
      `${fact.replace(/\.$/, "")}, e ${loss}.`,
      "",
      "A gente monta uma página simples com botão direto pro WhatsApp. A *prévia é grátis*, sem custo nenhum.",
      "",
      "Posso te mandar?",
    ].join("\n")
  );
}

export function fallbackReplyMessage(briefing: LeadBriefing, inbound: string): string {
  const policy = briefing.policy;
  const cheapest = cheapestPackage(policy);
  const text = inbound.toLowerCase();

  if (/quanto|pre[çc]o|valor|custa|or[çc]amento/.test(text)) {
    return `Fica a partir de ${formatBRL(cheapest.price)} (${cheapest.name}: ${cheapest.summary}). A prévia da primeira tela é gratuita, sem compromisso — quer que eu monte a sua?`;
  }
  if (/n[aã]o (tenho|quero)|sem interesse|para de/.test(text)) {
    return "Sem problema, obrigado pelo retorno. Não envio mais mensagens.";
  }
  if (/depois|semana|amanh[ãa]|mais tarde/.test(text)) {
    return "Combinado. Qual dia da semana fica melhor pra eu te chamar?";
  }
  return `Perfeito. Pra eu montar a prévia: o que você quer que apareça primeiro na página? E entrega em ${deliveryLabel(policy)} depois do ok.`;
}

/* ------------------------------------------------------------------ */
/*  Composição                                                         */
/* ------------------------------------------------------------------ */

interface ComposeResultOptions {
  kind: "approach" | "reply";
  angle?: "abertura" | "prova" | "prazo";
  inbound?: string;
}

function previousOutboundTexts(briefing: LeadBriefing): string[] {
  return briefing.history.filter((h) => h.direction === "outbound").map((h) => h.text);
}

/**
 * Pede o texto à IA, valida, e se reprovar tenta UMA vez com a correção
 * explícita. Devolve `null` quando a IA não entrega algo aceitável — e os
 * motivos da reprovação, que ficam registrados para auditoria.
 */
async function composeWithGuardrails(
  ctx: AgentContext,
  opts: ComposeResultOptions
): Promise<{ composed: ComposedMessage | null; issues: string[] }> {
  const { briefing } = ctx;
  const basePrompt =
    opts.kind === "reply"
      ? replyPrompt(ctx, String(opts.inbound || ""))
      : opts.angle === "abertura"
        ? approachPrompt(ctx)
        : cadencePrompt(ctx, opts.angle === "prova" ? "prova" : "prazo");

  const allowed = allowedPrices(briefing.policy);
  const previous = previousOutboundTexts(briefing);
  let issues: string[] = [];

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const hint =
      attempt === 0
        ? ""
        : `\n\n## CORRIJA ANTES DE RESPONDER\nA tentativa anterior foi reprovada por: ${issues.join("; ")}. Reescreva respeitando essas regras.`;
    const raw = await generateText(`${basePrompt}${hint}`);
    if (!raw) return { composed: null, issues: ["IA indisponível"] };

    const text = normalizePriceFormat(normalizeSpaces(raw), allowed);
    const check = checkAgentText(text, { kind: opts.kind, allowedPriceList: allowed, previousOutbound: previous });
    if (check.ok) {
      return {
        composed: {
          message: text,
          source: "ia",
          hook: hookFor(briefing, opts),
          issues: attempt > 0 ? issues : undefined,
          rationale: `objetivo=${briefing.objective}`,
        },
        issues,
      };
    }
    issues = check.issues;
  }

  return { composed: null, issues };
}

function hookFor(briefing: LeadBriefing, opts: ComposeResultOptions): string {
  if (opts.kind === "reply") return "conversa";
  if (opts.angle === "prova") return "preview";
  if (opts.angle === "prazo") return "exit_question";
  const status = briefing.facts.join(" ").toLowerCase();
  if (status.includes("marketplace")) return "marketplace";
  if (status.includes("rede social")) return "social_only";
  return "sem_site";
}

/* ------------------------------------------------------------------ */
/*  API pública usada pelo autopilot, pela cadência e pelo webhook     */
/* ------------------------------------------------------------------ */

/** Mensagem de primeiro contato (D0). */
export async function composeApproachMessage(lead: StoredLead, angle: "abertura" | "prova" | "prazo" = "abertura"): Promise<ComposedMessage> {
  const briefing = buildLeadBriefing(lead, getCommercialPolicy());
  const { composed, issues } = await composeWithGuardrails({ lead, briefing }, { kind: "approach", angle });
  if (composed) return composed;
  if (issues.length) console.warn(`[agent] IA reprovada (${angle}) para ${lead.name}: ${issues.join("; ")}`);
  return {
    message: fallbackApproachMessage(briefing, angle),
    source: "template",
    hook: hookFor(briefing, { kind: "approach", angle }),
    issues,
  };
}

/** Mensagem de follow-up da cadência (D+3 = prova, D+7 = saída). */
export async function composeCadenceMessage(lead: StoredLead, angle: "prova" | "prazo"): Promise<ComposedMessage> {
  return composeApproachMessage(lead, angle);
}

/** Resposta a uma mensagem recebida. */
export async function composeReplyMessage(lead: StoredLead, inbound: string): Promise<ComposedMessage> {
  const briefing = buildLeadBriefing(lead, getCommercialPolicy());
  const { composed, issues } = await composeWithGuardrails({ lead, briefing }, { kind: "reply", inbound });
  if (composed) return composed;
  if (issues.length) console.warn(`[agent] IA reprovada (resposta) para ${lead.name}: ${issues.join("; ")}`);
  return {
    message: fallbackReplyMessage(briefing, inbound),
    source: "template",
    hook: "conversa",
    issues,
  };
}

/** Aborda o lead: compõe e envia pelo mesmo caminho de todo envio. */
export async function approachLead(lead: StoredLead): Promise<ComposedMessage & { dispatch: ContactDispatchResult }> {
  const composed = await composeApproachMessage(lead, "abertura");
  const dispatch = await dispatchLeadContact(lead, {
    channel: "whatsapp",
    message: composed.message,
    hook: composed.hook,
  });
  return { ...composed, dispatch };
}

/**
 * Responde o lead. Recusa/opt-out NÃO passam por aqui: quem recusa nunca mais
 * recebe mensagem (LGPD) — a única exceção é o agradecimento em uma linha,
 * decidido no webhook.
 */
export async function answerLead(lead: StoredLead, inbound: string): Promise<ComposedMessage & { dispatch: ContactDispatchResult | null }> {
  if (lead.doNotContact) {
    return {
      message: "",
      source: "template",
      hook: "conversa",
      dispatch: null,
    };
  }

  // Só responde conversa ABERTA (a última mensagem é dele). Sem esta guarda,
  // `dispatchLeadReply` cai em `dispatchLeadContact` e vira um novo contato —
  // o lead receberia uma abordagem no meio de uma resposta.
  const latest = getCommunicationsByLead(lead.id)[0];
  if (!latest || latest.direction !== "inbound") {
    return { message: "", source: "template", hook: "conversa", dispatch: null };
  }

  const composed = await composeReplyMessage(lead, inbound);
  const dispatch = await dispatchLeadReply(lead, { channel: "whatsapp", message: composed.message });
  return { ...composed, dispatch };
}
