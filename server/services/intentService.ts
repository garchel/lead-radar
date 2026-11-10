import { GoogleGenAI } from "@google/genai";
import { getGeminiModel } from "../config";
import { getSetting } from "../store/db";

/* ------------------------------------------------------------------ */
/*  Classificação de intenção da resposta do lead (híbrida)            */
/*                                                                     */
/*  Antes era só regex: "pode mandar", "manda sim", "claro, pode       */
/*  enviar" caíam em `outro` e o lead morria no pipeline (sem mover    */
/*  etapa, sem follow-up, sem ficha).                                   */
/*                                                                     */
/*  Agora:                                                             */
/*   1. REGEX primeiro — rápido, determinístico, sem custo. Cobre       */
/*      recusa, preço e os pedidos explícitos de prévia.                */
/*   2. IA (Gemini) só quando o regex devolve `outro` — decide frases   */
/*      curtas/ambíguas ("sim", "claro", "beleza, manda").               */
/*   3. RECUSA e OPT-OUT nunca dependem da IA: descadastro é LGPD e,    */
/*      no webhook, `detectOptOut()` (regex) roda sempre primeiro.      */
/* ------------------------------------------------------------------ */

export type IntentName = "interesse" | "preco" | "recusa" | "ocupado" | "outro";

export type IntentStatus = "negotiating" | "declined" | "contacted";

export interface IntentDecision {
  intent: IntentName;
  status?: IntentStatus;
  /** De onde veio a decisão. */
  source: "regex" | "ia" | "none";
  /** 0–1. */
  confidence: number;
  /** Explicação curta (IA) ou padrão que casou (regex). */
  reason?: string;
}

interface IntentRule {
  intent: IntentName;
  status?: IntentStatus;
  confidence: number;
  patterns: RegExp[];
}

/**
 * Ordem importa: `recusa` antes de `interesse` ("não tenho interesse" contém
 * "tenho interesse") e `preco` antes de `interesse` ("quanto custa a prévia?").
 */
const RULES: IntentRule[] = [
  {
    intent: "recusa",
    status: "declined",
    confidence: 0.95,
    patterns: [
      /n[aã]o tenho interesse/i,
      /sem interesse/i,
      /n[aã]o (quero|preciso)\b/i,
      /n[aã]o tenho (interesse|necessidade)/i,
      /desculp[ae],? mas n[aã]o/i,
      /(n[aã]o )?(me )?(manda|mande|envia|envie) mais/i,
      /para de (me )?(mandar|enviar)/i,
      /(me )?(tira|tire|remove|remova) (da lista|do contato)/i,
      /remover (meu|o) (n[uú]mero|contato|telefone)/i,
      /n[aã]o (é|e) do meu interesse/i,
      /j[aá] (tenho|temos) (site|p[aá]gina|quem cuida)/i,
    ],
  },
  {
    intent: "preco",
    status: "negotiating",
    confidence: 0.9,
    patterns: [
      /quanto (custa|sai|fica|[eé])/i,
      /qual (é |e )?o (valor|pre[çc]o|custo)/i,
      /\bpre[çc]o\b/i,
      /or[çc]amento/i,
      /investimento/i,
      /quais (s[aã]o )?as (condi[çc][õo]es|formas de pagamento)/i,
    ],
  },
  {
    intent: "interesse",
    status: "negotiating",
    confidence: 0.9,
    patterns: [
      /(pode|podem|poderia) (me )?(mandar|mande|enviar|envie|mostrar|mostre)/i,
      /\b(manda|mande|envia|envie|mostra|mostre)\b[^.!?]*\b(pr[eé]via|exemplo|modelo|site|p[aá]gina|layout|foto|fotos)\b/i,
      /\b(quero|queria|gostaria) (de )?(ver|receber|conhecer|saber mais|saber do|entender)/i,
      /\bme (manda|mande|envia|envie|mostra|mostre)\b/i,
      /\b(tenho|temos|tô|to|estou) (com )?interesse\b/i,
      /\bme interessa\b/i,
      /\bcomo (funciona|seria|fica)\b/i,
      /\b(mais informa[çc][õo]es|quero saber mais)\b/i,
      /\b(vamos|bora) (fechar|conversar|negociar|marcar)\b/i,
      /\b(aceito|aceitamos) (a )?(pr[eé]via|proposta)/i,
      /\bmanda (a[ií]|sim)\b/i,
      /\b(sim|isso|exato)\b[,\s]+(quero|pode|manda|envia)/i,
      /\bquero (sim|isso)\b/i,
    ],
  },
  {
    intent: "ocupado",
    confidence: 0.7,
    patterns: [
      /agora n[aã]o/i,
      /(depois|mais tarde) (eu )?(vejo|te falo|te chamo|retorno|olho)/i,
      /estou ocupad/i,
      /sem tempo/i,
      /retorno (depois|mais tarde)/i,
      /me chama (depois|semana que vem|m[eê]s que vem)/i,
    ],
  },
];

/** Limite mínimo de confiança para aceitar a decisão da IA. */
export const AI_MIN_CONFIDENCE = Number(process.env.WHATSAPP_INTENT_AI_MIN_CONFIDENCE || 0.6);

const GEMINI_TIMEOUT_MS = Number(process.env.WHATSAPP_INTENT_AI_TIMEOUT_MS || 20000);

/** Regex puro: devolve `outro` quando nenhuma regra casa (aí entra a IA). */
export function classifyByRules(text: string): IntentDecision {
  const value = String(text || "").trim();
  if (!value) return { intent: "outro", source: "none", confidence: 0 };

  for (const rule of RULES) {
    const match = rule.patterns.find((pattern) => pattern.test(value));
    if (match) {
      return {
        intent: rule.intent,
        status: rule.status,
        source: "regex",
        confidence: rule.confidence,
        reason: `padrão ${match}`,
      };
    }
  }
  return { intent: "outro", source: "none", confidence: 0 };
}

/** Ligado/desligado por setting (UI) — desligar deixa só o regex. */
export function isAiIntentEnabled(): boolean {
  try {
    return getSetting("automation_intent_ai") !== "false";
  } catch {
    return false;
  }
}

function buildPrompt(text: string, businessName?: string): string {
  return `Você classifica a RESPOSTA de um dono de pequeno negócio a uma abordagem
fria de WhatsApp que ofereceu uma prévia grátis do site/landing page dele.

${businessName ? `Negócio abordado: ${businessName}\n` : ""}Resposta recebida:
"""${text}"""

Classifique em UMA das intenções:
- "interesse": quer ver/receber a prévia, pediu para mandar, respondeu positivamente
- "preco": perguntou valor, prazo, condições ou orçamento
- "recusa": disse que não quer, não tem interesse, já tem site/quem cuida
- "ocupado": pediu para falar depois, sem dizer sim nem não
- "outro": saudação isolada, pergunta sem relação, mensagem incompreensível

REGRAS
- Na dúvida entre interesse e outro, prefira "outro" com confiança baixa.
- NUNCA classifique como "recusa" uma frase ambígua ou cordial.
- Use apenas o que está escrito; não deduza intenção comercial não declarada.

Responda APENAS JSON:
{"intent": "interesse|preco|recusa|ocupado|outro", "confidence": 0.0, "reason": "até 12 palavras"}`;
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

const VALID_INTENTS: IntentName[] = ["interesse", "preco", "recusa", "ocupado", "outro"];

const STATUS_BY_INTENT: Record<IntentName, IntentStatus | undefined> = {
  interesse: "negotiating",
  preco: "negotiating",
  recusa: "declined",
  ocupado: undefined,
  outro: undefined,
};

/**
 * Consulta a IA. Devolve `null` quando não há chave, quando o modelo está
 * indisponível ou quando a resposta não é JSON válido — o chamador degrada
 * para `outro` (nunca quebra o webhook).
 */
export async function classifyWithAI(input: { text: string; businessName?: string }): Promise<IntentDecision | null> {
  const text = String(input.text || "").trim();
  if (text.length < 2) return null;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const primary = getGeminiModel();
  const fallbacks = (process.env.GEMINI_PROFILE_FALLBACK_MODEL || process.env.GEMINI_VISION_FALLBACK_MODEL || "gemini-3.1-flash-lite")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const models = Array.from(new Set([primary, ...fallbacks]));

  const ai = new GoogleGenAI({ apiKey });

  for (const model of models) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text: buildPrompt(text.slice(0, 1200), input.businessName) }] }],
        config: {
          responseMimeType: "application/json",
          temperature: 0,
          abortSignal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
        },
      });
      const raw = response.text?.trim();
      if (!raw) continue;
      const parsed = parseJsonLoose(raw);
      if (!parsed) continue;

      const intent = String(parsed.intent || "").toLowerCase().trim() as IntentName;
      if (!VALID_INTENTS.includes(intent)) continue;
      const confidenceRaw = Number(parsed.confidence);
      const confidence = Number.isFinite(confidenceRaw)
        ? Math.min(1, Math.max(0, confidenceRaw > 1 ? confidenceRaw / 100 : confidenceRaw))
        : 0.5;

      return {
        intent,
        status: STATUS_BY_INTENT[intent],
        source: "ia",
        confidence: Math.round(confidence * 100) / 100,
        reason: typeof parsed.reason === "string" ? parsed.reason.slice(0, 120) : undefined,
      };
    } catch (err: any) {
      const message = String(err?.message || err || "");
      // Só insiste no próximo modelo em falha de capacidade; o resto é definitivo.
      if (/aborted|timeout|timed out|UNAVAILABLE|high demand|overloaded|503|500|502|429|quota/i.test(message)) continue;
      console.warn(`[intent] IA falhou (${model}): ${message.slice(0, 160)}`);
      return null;
    }
  }
  return null;
}

/**
 * Fluxo completo: regex → (se `outro` e IA habilitada) IA → decisão final.
 * A IA só pode *melhorar* o resultado: nunca sobrescreve uma regra e nunca
 * devolve `recusa` com confiança abaixo do limite.
 */
export async function classifyInbound(input: {
  text: string;
  businessName?: string;
  /** false = não chama IA (respeita o toggle de automação). */
  useAI?: boolean;
}): Promise<IntentDecision> {
  const byRules = classifyByRules(input.text);
  if (byRules.intent !== "outro") return byRules;

  if (input.useAI === false || !isAiIntentEnabled()) return byRules;

  const byAI = await classifyWithAI({ text: input.text, businessName: input.businessName });
  if (!byAI) return byRules;
  if (byAI.intent === "outro") return byRules;
  // Recusa/opt-out são decisões jurídicas (LGPD): só a regra pode tomá-las.
  if (byAI.intent === "recusa") {
    return { ...byRules, reason: `IA sugeriu recusa (${byAI.confidence}) — ignorado: descadastro só por regra` };
  }
  if (byAI.confidence < AI_MIN_CONFIDENCE) {
    return { ...byRules, reason: `IA sugeriu ${byAI.intent} com confiança ${byAI.confidence} (abaixo do limite)` };
  }
  return byAI;
}
