import fs from "node:fs";
import path from "node:path";
import { getDb } from "../store/schema";
import { getLeadById } from "../store/db";
import { aplicarImagemNoSlot, slotsDaPagina } from "./mediaService";
import { gatewayRequest, getGatewayConfig } from "./whatsappGateway";

/**
 * Foto que chega pelo WhatsApp.
 *
 * O lead manda a imagem na conversa; a Clara não pode simplesmente usar — ela
 * pergunta para que serve e se pode usar. Quando ele responde, a foto entra no
 * slot correspondente e a página é republicada.
 *
 * Guardamos os bytes pendentes fora de `previews/` de propósito: aquela pasta
 * inteira vai para o Cloudflare no próximo deploy.
 */

export type TipoMidia = "imagem" | "documento";

export interface MidiaRecebida {
  tipo: TipoMidia;
  mimetype?: string;
  base64?: string;
  url?: string;
  fileName?: string;
  caption?: string;
}

export interface RegistroFoto {
  ok: boolean;
  motivo?: string;
  slots: string[];
  arquivo?: string;
}

function pastaPendentes(): string {
  const base = process.env.LEADRADAR_DATA_DIR || path.join(process.env.LOCALAPPDATA || process.cwd(), "leadradar-data");
  const dir = path.join(base, "media-pendente");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function arquivoPendente(leadId: string): string {
  return path.join(pastaPendentes(), `${leadId}.bin`);
}

/** O lead tem foto esperando ser usada? */
export function fotoPendente(leadId: string): { existe: boolean; mimetype?: string; caption?: string } {
  const arquivo = arquivoPendente(leadId);
  const meta = arquivoPendente(leadId) + ".json";
  if (!fs.existsSync(arquivo) || !fs.existsSync(meta)) return { existe: false };
  try {
    const dados = JSON.parse(fs.readFileSync(meta, "utf8"));
    return { existe: true, mimetype: dados.mimetype, caption: dados.caption };
  } catch {
    return { existe: true };
  }
}

/**
 * Baixa os bytes da mídia. O gateway é compatível com Evolution; tentamos o que
 * costuma vir no payload antes de chamar o endpoint de download.
 */
export async function baixarMidia(midia: MidiaRecebida): Promise<{ ok: boolean; bytes?: Buffer; motivo?: string }> {
  if (midia.base64) {
    try {
      return { ok: true, bytes: Buffer.from(midia.base64.replace(/^data:[^,]+,/, ""), "base64") };
    } catch (erro: any) {
      return { ok: false, motivo: `base64 inválido: ${erro?.message || erro}` };
    }
  }

  if (midia.url && /^https?:/i.test(midia.url)) {
    try {
      const res = await fetch(midia.url, { signal: AbortSignal.timeout(20000) });
      if (res.ok) return { ok: true, bytes: Buffer.from(await res.arrayBuffer()) };
    } catch {
      /* segue para o gateway */
    }
  }

  const cfg = getGatewayConfig();
  if (!cfg) return { ok: false, motivo: "sem base64/URL no payload e gateway não configurado" };

  // Evolution: POST /chat/getBase64FromMediaMessage/{instancia}
  try {
    const res: any = await gatewayRequest(`/chat/getBase64FromMediaMessage/${cfg.instance}`, {
      method: "POST",
      body: { message: { key: { id: (midia as any).messageId || "" }, message: { mimetype: midia.mimetype } }, convertToMp4: false },
    });
    const base64 = res?.base64 || res?.media || res?.data;
    if (base64) return { ok: true, bytes: Buffer.from(String(base64).replace(/^data:[^,]+,/, ""), "base64") };
  } catch (erro: any) {
    return { ok: false, motivo: `gateway não devolveu a mídia: ${erro?.message || erro}` };
  }

  return { ok: false, motivo: "nenhuma fonte devolveu os bytes da imagem" };
}

/** Guarda a foto como pendente e devolve os slots em que ela poderia entrar. */
export function registrarFotoPendente(leadId: string, bytes: Buffer, info: { mimetype?: string; caption?: string }): RegistroFoto {
  if (!getLeadById(leadId)) return { ok: false, motivo: "lead não encontrado", slots: [] };
  if (!bytes?.length) return { ok: false, motivo: "imagem vazia", slots: [] };

  fs.writeFileSync(arquivoPendente(leadId), bytes);
  fs.writeFileSync(
    arquivoPendente(leadId) + ".json",
    JSON.stringify({ mimetype: info.mimetype || "image/jpeg", caption: info.caption || "", salvoEm: new Date().toISOString() }),
    "utf8",
  );
  return { ok: true, slots: slotsDaPagina(leadId), arquivo: arquivoPendente(leadId) };
}

/**
 * Traduz o que o lead respondeu para o slot certo.
 * A conversa é humana ("é a fachada"), o HTML é técnico (`data-slot="hero"`).
 */
const APELOS: Array<{ re: RegExp; chaves: string[] }> = [
  { re: /fachada|entrada|vitrine|hero|capa|topo|principal/i, chaves: ["hero", "capa", "fachada"] },
  { re: /projeto|portf[óo]lio|obra|trabalho|antes e depois/i, chaves: ["portfolio", "projetos", "obra"] },
  { re: /equipe|time|profissional|doutor|dentista|m[ée]dic/i, chaves: ["equipe", "time", "profissional"] },
  { re: /logo|marca|identidade/i, chaves: ["logo", "marca"] },
  { re: /interior|ambiente|espa[çc]o|sala|consult[óo]rio|cl[íi]nica/i, chaves: ["espaco", "ambiente", "interior"] },
];

export function escolherSlotPorTexto(texto: string, slots: string[]): string | null {
  const alvo = String(texto || "").toLowerCase();
  const disponiveis = slots.map((s) => s.toLowerCase());

  for (const apelo of APELOS) {
    if (!apelo.re.test(alvo)) continue;
    for (const chave of apelo.chaves) {
      const achado = disponiveis.find((s) => s === chave) || disponiveis.find((s) => s.includes(chave));
      if (achado) return slots[disponiveis.indexOf(achado)];
    }
  }
  // Slot único na página: não precisa adivinhar nada.
  if (slots.length === 1) return slots[0];
  return null;
}

/** O lead autorizou (ou respondeu para que serve): aplica a foto guardada. */
export async function aplicarFotoPendente(
  leadId: string,
  entrada: { slot: string; pushName?: string; texto?: string },
): Promise<{ ok: boolean; motivo?: string; url?: string; publicUrl?: string | null }> {
  const arquivo = arquivoPendente(leadId);
  if (!fs.existsSync(arquivo)) return { ok: false, motivo: "não há foto pendente para este lead" };

  const bytes = fs.readFileSync(arquivo);
  const metaPath = arquivo + ".json";
  let mimetype = "image/jpeg";
  try {
    mimetype = JSON.parse(fs.readFileSync(metaPath, "utf8")).mimetype || mimetype;
  } catch {
    /* usa o padrão */
  }

  const resultado = await aplicarImagemNoSlot(leadId, {
    slot: entrada.slot,
    bytes,
    mime: mimetype,
    origem: "cliente",
    consentimento: {
      autorizadoPor: entrada.pushName,
      canal: "whatsapp",
      texto: entrada.texto,
    },
  });

  if (!resultado.ok) return { ok: false, motivo: resultado.motivo };

  // Consumida: sai do pendente para não ser reaplicada em outra foto por engano.
  try {
    fs.unlinkSync(arquivo);
    fs.unlinkSync(metaPath);
  } catch {
    /* ok */
  }

  return { ok: true, url: resultado.imagem?.url, publicUrl: resultado.publicUrl };
}

/** Quantas fotos já foram aplicadas por este lead. */
export function fotosAplicadas(leadId: string): number {
  try {
    const row = getDb().prepare("SELECT COUNT(*) as n FROM media_consents WHERE lead_id = ?").get(leadId) as any;
    return Number(row?.n || 0);
  } catch {
    return 0;
  }
}
