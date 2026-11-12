/**
 * Paleta como primeiro contato visual.
 *
 * Mandar a prévia pronta de uma vez é apostar tudo numa cartada: se o lead não
 * gostar do rumo, o trabalho foi para o lixo e ele esfria. A paleta é um
 * compromisso pequeno — o lead aprova a direção (ou corrige) enquanto a página é
 * montada. Também cria a percepção de trabalho em andamento, que é o que a
 * mensagem diz.
 *
 * O WhatsApp não recebe imagem por este gateway (só texto), então a paleta vai em
 * forma de quadradinhos + nome em português + hex. É legível, não depende de API
 * nova e o lead pode responder "gostei" ou "não gosto desse amarelo".
 */
import type { StoredLead } from "../store/types";
import { dispatchLeadReply } from "./interactionService";
import { getLeadById } from "../store/db";

export interface PaletteEntry {
  hex: string;
  /** Nome em português, para o lead entender sem saber o que é hexadecimal. */
  name: string;
  /** Quadrado colorido do WhatsApp mais próximo. */
  swatch: string;
}

function rgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function hsv(hex: string): { h: number; s: number; v: number } | null {
  const c = rgb(hex);
  if (!c) return null;
  const [r, g, b] = c.map((x) => x / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

/**
 * Nome da cor em português. Ordem importa: primeiro os neutros (quase todo site
 * tem branco/preto), depois as famílias de matiz.
 */
export function colorName(hex: string): string {
  const c = hsv(hex);
  if (!c) return "cor";
  const { h, s, v } = c;

  if (v > 0.96 && s < 0.06) return "branco";
  if (v > 0.9 && s < 0.12) return "off-white";
  if (v < 0.12) return "preto";
  if (s < 0.12) return v > 0.6 ? "cinza claro" : v > 0.3 ? "cinza" : "grafite";

  // dourado = amarelo puxado para areia (saturação baixa); amarelo puro é vivo
  if (h >= 30 && h < 60 && s < 0.45 && v > 0.7) return "dourado";
  if (h >= 35 && h < 60) return "amarelo";
  if (h >= 20 && h < 40 && v <= 0.6) return "marrom";
  if ((h >= 0 && h < 20) || h >= 350) return v < 0.5 ? "vinho" : "vermelho";
  if (h >= 330 && h < 350) return "rosa";
  if (h >= 280 && h < 330) return "roxo";
  if (h >= 250 && h < 280) return "azul-escuro";
  if (h >= 200 && h < 250) return "azul";
  if (h >= 170 && h < 200) return "azul-petróleo";
  if (h >= 120 && h < 170) return "verde";
  if (h >= 80 && h < 120) return "verde-oliva";
  if (h >= 45 && h < 80) return "verde-limão";
  return "terracota";
}

/** Quadrado do WhatsApp mais próximo da matiz. */
export function swatchFor(hex: string): string {
  const c = hsv(hex);
  if (!c) return "⬜";
  const { h, s, v } = c;
  if (s < 0.14) return v > 0.7 ? "⚪" : v > 0.32 ? "⬜" : "⚫";
  if (h >= 20 && h < 55) return "🟡";
  if (h >= 55 && h < 90) return "🟢";
  if (h >= 90 && h < 165) return "🟢";
  if (h >= 165 && h < 215) return "🔵";
  if (h >= 215 && h < 265) return "🔵";
  if (h >= 265 && h < 330) return "🟣";
  return "🔴";
}

/** Paleta do lead, sem repetir a mesma cor e com no máximo 4 entradas. */
export function paletteForLead(lead: StoredLead): PaletteEntry[] {
  const cores = (lead.brandSnapshot?.palette || [])
    .map((c) => String(c.hex || ""))
    .filter((h) => /^#[0-9a-f]{6}$/i.test(h));
  const unicas = [...new Set(cores.map((h) => h.toUpperCase()))].slice(0, 4);
  return unicas.map((hex) => ({ hex, name: colorName(hex), swatch: swatchFor(hex) }));
}

/**
 * Mensagem da paleta.
 *
 * Estilo da casa: blocos curtos, sem travessão, no máximo 3 emoji, nenhum preço e
 * nenhum pacote. Termina com pergunta aberta para o lead responder e a conversa
 * seguir.
 */
export function paletteMessageText(lead: StoredLead, entries: PaletteEntry[]): string {
  const nome = String(lead.name || "").split(" — ")[0];
  const linhas = entries.map((c) => `${c.swatch} ${c.name.charAt(0).toUpperCase()}${c.name.slice(1)} (${c.hex})`);

  return [
    `Ainda estamos trabalhando na prévia, mas já posso te mostrar a paleta que escolhi para a ${nome} 👇`,
    "",
    linhas.join("\n"),
    "",
    "Peguei as cores que aparecem na sua marca e no seu material.",
    "O que acha?",
  ]
    .join("\n")
    .trim();
}

export interface PaletteSendResult {
  sent: boolean;
  text: string;
  colors: PaletteEntry[];
  communicationId?: string;
  detail?: string;
}

/**
 * Envia a paleta pelo WhatsApp. Não faz nada (e diz por quê) quando o negócio
 * ainda não tem identidade coletada: inventar cor é pior que esperar.
 */
export function buildPalettePreview(leadId: string): PaletteSendResult {
  const lead = getLeadById(leadId);
  if (!lead) throw new Error("Lead não encontrado.");
  const colors = paletteForLead(lead);
  if (!colors.length) {
    return { sent: false, text: "", colors: [], detail: "Sem identidade visual coletada: nada de paleta para mostrar." };
  }
  return { sent: false, text: paletteMessageText(lead, colors), colors };
}

/**
 * Envia a paleta pelo WhatsApp.
 *
 * `forcar` existe porque a mensagem da paleta costuma ser a continuação de uma
 * promessa nossa ("vou te mostrar") e o anti-duplicidade a bloquearia como se
 * fosse abordagem nova. O caminho normal é a Clara incluir o texto na resposta
 * dela (uma mensagem só); o envio direto fica para uso manual.
 */
export async function sendPalettePreview(
  leadId: string,
  options: { forcar?: boolean } = {}
): Promise<PaletteSendResult> {
  const lead = getLeadById(leadId);
  if (!lead) throw new Error("Lead não encontrado.");
  if (!lead.phone) throw new Error("Lead sem telefone: não há como enviar a paleta.");

  const montada = buildPalettePreview(leadId);
  if (!montada.colors.length) return montada;

  const { text, colors } = montada;
  const result = await dispatchLeadReply(lead, {
    message: text,
    purpose: "reply",
    ignoreCooldown: Boolean(options.forcar),
  });

  return {
    sent: result.status === "sent",
    text,
    colors,
    communicationId: result.communicationId,
    detail: result.detail,
  };
}
