/**
 * Política de emoji da Clara.
 *
 * Emoji bom é emoji que faz um trabalho: apontar o link que vem abaixo, cumprimentar,
 * confirmar que algo foi feito. Emoji de enfeite (estrela, foguete, dinheiro) faz o
 * texto parecer anúncio, e é o primeiro sinal de mensagem automática.
 *
 * Regra prática: **um por mensagem**, escolhido pela função, nunca dois no mesmo
 * bloco e nunca em linha de valor.
 */

export type PapelEmoji = "saudacao" | "apontar" | "calor" | "confirmar" | "agradecer" | "feliz";

/** O que cada posição da mensagem pode usar. */
const POR_PAPEL: Record<PapelEmoji, string> = {
  saudacao: "👋",
  apontar: "👇",
  calor: "😊",
  confirmar: "✅",
  agradecer: "🙏",
  feliz: "😄",
};

/** Permitidos: todos fazem algo na frase. */
export const EMOJIS_PERMITIDOS = new Set(Object.values(POR_PAPEL));

/**
 * Proibidos: cara de anúncio. ⭐ 🚀 🔥 🚨 vendem urgência; 💰/🤑 falam de dinheiro
 * antes da hora; 📦 parece despacho, não conversa.
 */
export const EMOJIS_PROIBIDOS = new Set(["⭐", "🌟", "🚀", "🔥", "🚨", "📦", "💰", "🤑", "🎯", "💥", "‼️", "❗", "🛑"]);

const TODOS = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu;

export function contarEmojis(texto: string): string[] {
  return (String(texto || "").match(TODOS) || []).filter((e) => e !== "\uFE0F");
}

/** Emoji para a função pedida (ex.: `emoji("apontar")` → "👇"). */
export function emoji(papel: PapelEmoji): string {
  return POR_PAPEL[papel];
}

export interface EmojiAviso {
  regra: string;
  detalhe: string;
}

/**
 * Conferência: fora da lista, dois na mesma mensagem, dois no mesmo bloco.
 *
 * Não conta emoji dentro de link nem de código, porque ali ele não é enfeite.
 */
export function conferirEmojis(texto: string): EmojiAviso[] {
  const avisos: EmojiAviso[] = [];
  const msg = String(texto || "");
  const encontrados = contarEmojis(msg);

  const proibidos = encontrados.filter((e) => EMOJIS_PROIBIDOS.has(e));
  if (proibidos.length) {
    avisos.push({ regra: "emoji de anúncio", detalhe: `${[...new Set(proibidos)].join(" ")} não combina com o tom` });
  }

  const foraDaLista = encontrados.filter((e) => !EMOJIS_PERMITIDOS.has(e) && !EMOJIS_PROIBIDOS.has(e));
  if (foraDaLista.length) {
    avisos.push({
      regra: "emoji fora da lista",
      detalhe: `${[...new Set(foraDaLista)].join(" ")}; use ${[...EMOJIS_PERMITIDOS].join(" ")}`,
    });
  }

  // Mensagem longa (abordagem) comporta dois: um abre, outro fecha. Resposta curta
  // com dois já parece enfeite.
  const paragrafos = msg.split(/\n\s*\n/).filter((b) => b.trim()).length;
  const limite = paragrafos >= 3 ? 2 : 1;
  const permitidos = encontrados.filter((e) => EMOJIS_PERMITIDOS.has(e));
  if (permitidos.length > limite) {
    avisos.push({
      regra: "emoji demais",
      detalhe:
        limite === 1
          ? `achei ${permitidos.length}: ${permitidos.join(" ")}. Resposta curta usa um.`
          : `achei ${permitidos.length}: ${permitidos.join(" ")}. Mensagem longa usa dois, um abrindo e um fechando.`,
    });
  }

  for (const bloco of msg.split(/\n\s*\n/)) {
    const noBloco = contarEmojis(bloco).filter((e) => EMOJIS_PERMITIDOS.has(e));
    if (noBloco.length > 1) {
      avisos.push({ regra: "não empilhe emoji", detalhe: `${noBloco.join(" ")} no mesmo parágrafo` });
      break;
    }
  }

  return avisos;
}
