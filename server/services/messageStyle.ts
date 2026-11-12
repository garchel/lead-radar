/**
 * Estilo das mensagens de WhatsApp.
 *
 * Feedbacks do Paulo (nov/2026) que viraram regra:
 *   1. quebrar linha — mensagem em bloco único cansa a leitura;
 *   2. nunca usar travessão (— / –): é a marca mais óbvia de texto de IA;
 *   3. dizer desde o primeiro contato que a prévia é grátis;
 *   4. falar dos pacotes com o que cada um inclui;
 *   5. usar negrito (*assim*) e emoji com parcimônia.
 *
 * Tudo que sai para o lead passa por aqui, inclusive o pitch que a IA escreveu.
 */

import type { CommercialPolicy } from "./commercialPolicy";

const AI_DASHES = /[\u2014\u2013]/g; // — e –
const BOLD_MARK = "*";

/** Tira travessão: vira ponto quando inicia oração, vírgula no meio da frase. */
export function stripAiDashes(text: string): string {
  let out = String(text || "");
  // "… próprio — dá pra resolver"  →  "… próprio, dá pra resolver"
  out = out.replace(/\s*[\u2014\u2013]\s*(?=[a-záéíóúâêôãõç])/g, ", ");
  // "… próprio — Quer que eu…"     →  "… próprio. Quer que eu…"
  out = out.replace(/\s*[\u2014\u2013]\s*(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ])/g, ". ");
  // sobra de travessão solto
  out = out.replace(AI_DASHES, ", ");
  // limpeza do que a troca pode ter criado
  out = out.replace(/,\s*,/g, ",");
  out = out.replace(/\.\s*\./g, ".");
  out = out.replace(/,\s*\./g, ".");
  out = out.replace(/(^|[.!?]\s), /g, "$1");
  return out;
}

/** Negrito do WhatsApp em um trecho, sem duplicar asteriscos. */
export function bold(text: string): string {
  const clean = String(text || "").trim().replace(/^\*+|\*+$/g, "");
  return clean ? `${BOLD_MARK}${clean}${BOLD_MARK}` : "";
}

/** Negrita o nome do negócio dentro de um texto (uma vez). */
export function boldFirstOccurrence(text: string, term?: string): string {
  if (!term) return text;
  const index = text.indexOf(term);
  if (index < 0) return text;
  const before = text.slice(0, index);
  if (before.endsWith(BOLD_MARK)) return text; // já estava em negrito
  return `${before}${bold(term)}${text.slice(index + term.length)}`;
}

/**
 * Quebra um bloco único em linhas curtas (frases de até ~110 caracteres).
 * Texto que já tem quebra de linha é respeitado.
 */
export function toShortLines(text: string, maxPerLine = 110): string {
  const raw = String(text || "").trim();
  if (!raw) return "";
  if (raw.includes("\n")) return raw;

  const sentences = raw
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  const lines: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if (!current) {
      current = sentence;
    } else if (`${current} ${sentence}`.length <= maxPerLine) {
      current = `${current} ${sentence}`;
    } else {
      lines.push(current);
      current = sentence;
    }
  }
  if (current) lines.push(current);
  return lines.join("\n");
}

/** Pipeline único de estilo: sem travessão, em blocos legíveis. */
export function whatsAppify(text: string): string {
  const withoutDashes = stripAiDashes(text);
  // mensagem curta não precisa virar bloco; bloco longo sim (feedback do Paulo)
  const blocked = withoutDashes.length > 140 ? toShortLines(withoutDashes) : withoutDashes;
  return blocked
    .split("\n")
    .map((line) => line.replace(/[ \t]{2,}/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** "R$ 900" (pacote tem preço fechado, sem centavos). */
export function formatPrice(value: number): string {
  return `R$ ${Math.round(Number(value) || 0).toLocaleString("pt-BR")}`;
}

/**
 * Linhas com os pacotes: nome + preço em negrito e uma linha do que inclui.
 * Usa `summary`/`sections` da política comercial (fonte única de preço).
 */
export function packageLines(policy: CommercialPolicy, opts: { detailed?: boolean } = {}): string[] {
  const lines: string[] = [];
  for (const pack of policy.packages) {
    lines.push(`📦 ${bold(`${pack.name} · ${formatPrice(pack.price)}`)}`);
    const summary = String(pack.summary || "").trim();
    if (summary) {
      lines.push(summary.charAt(0).toUpperCase() + summary.slice(1) + ".");
    }
    if (opts.detailed && pack.sections.length > 0) {
      // detalhe curto: até 4 itens, sem repetir o "tudo do Essencial"
      const items = pack.sections
        .filter((item) => !/^tudo do/i.test(item))
        .slice(0, 4)
        .map((item) => `• ${item}`);
      if (items.length) lines.push(items.join("\n"));
      if (pack.revisions) {
        const n = pack.revisions;
        lines.push(`• ${n} ${n === 1 ? "rodada" : "rodadas"} de ajuste${n === 1 ? "" : "s"} incluída${n === 1 ? "" : "s"}`);
      }
    }
  }
  return lines;
}

/**
 * Regras de estilo prontas para entrar em prompt de IA.
 * Mesmo texto que o template usa, para o modelo não inventar outro formato.
 */
export const WHATSAPP_STYLE_RULES = [
  "## ESTILO DA MENSAGEM (obrigatório)",
  "- Quebre em 2 a 5 linhas curtas: uma ideia por linha (saudação / prova / proposta / pergunta).",
  "- NUNCA use travessão (—) nem meia-risca (–); é a marca mais óbvia de texto de IA. Use vírgula ou ponto.",
  "- Use negrito do WhatsApp (*assim*) em no máximo 2 trechos-chave (nome do negócio, preço ou prévia grátis).",
  "- Use no máximo 3 emojis, um por linha, e só onde ajudam (👋 ⭐ 📦 🚀). Nada de emoji em toda frase.",
  "- Quando falar da prévia, diga explicitamente que é grátis, sem custo nenhum.",
  "- Quando falar de pacote, diga o nome, o valor fechado e o que ele inclui (não só o preço).",
  "- Nada de bloco único corrido, de markdown com # ou de link.",
].join("\n");

/**
 * Convite para conhecer os pacotes, usado DEPOIS que a prévia foi enviada.
 * Preço só entra na conversa quando o lead aceita esse convite.
 */
export function packagesInviteLine(policy: CommercialPolicy): string {
  const nomes = policy.packages.map((pack) => pack.name);
  const lista =
    nomes.length <= 1 ? nomes[0] || "" : `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
  return `Se fizer sentido pra você, eu te mando os pacotes (${lista}) com o que cada um inclui. Quer ver?`;
}

/** Frase da prévia gratuita, sempre presente no primeiro contato. */
export function freePreviewLine(policy: CommercialPolicy): string {
  if (!policy.previewFree) return "";
  return `⭐ ${bold("A prévia é grátis")}, sem custo nenhum: eu monto a primeira tela e você vê como fica antes de decidir qualquer coisa.`;
}
