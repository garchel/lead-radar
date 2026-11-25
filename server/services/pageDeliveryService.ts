import { getCommunicationsByLead, getLeadById } from "../store/db";
import { sendOwnerAlert } from "./ownerAlertService";
import { eventHub } from "../events/eventHub";
import { dispatchLeadReply } from "./interactionService";
import { gerarPaginaUnica } from "./aiPreviewService";
import { pagesConfigured, publishPreviews } from "./pagesService";
import { confirmarUrlNoAr, previewExists, previewSlug, previewsDir, resolvePreviewUrl } from "./previewService";
import { whatsAppify } from "./messageStyle";
import { getDb } from "../store/schema";
import { comoChamar } from "./messageStyle";

/**
 * Entrega da página única no momento do interesse.
 *
 * O D0 não promete prévia pronta: quem recebe o link é quem respondeu. Aqui a
 * página é escrita na hora, publicada e só então o link sai — link que não abre
 * queima o lead mais rápido que mensagem nenhuma.
 */

export interface EntregaPagina {
  ok: boolean;
  motivo?: string;
  url?: string | null;
  origem?: "ia" | "template";
  comunicacao?: string | null;
}

/* ------------------------------------------------------------------ */
/*  Entrega pendente: quando o app não consegue enviar                 */
/* ------------------------------------------------------------------ */

/**
 * O app é o dono da entrega porque é o único que sabe o estado: página gerada,
 * publicada, 200 confirmado e última mensagem da conversa. Quando algum desses
 * passos falha, a entrega NÃO vira mensagem do agente por conta própria — vira
 * um registro aqui, e o agente só age sobre o que está nesta lista.
 */
export interface EntregaPendente {
  leadId: string;
  nome: string;
  url: string | null;
  motivo: string;
  criadoEm: string;
  resolvidoEm?: string | null;
}

function garantirTabela(): void {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS preview_deliveries (
      lead_id     TEXT PRIMARY KEY,
      nome        TEXT NOT NULL,
      url         TEXT,
      motivo      TEXT NOT NULL,
      created_at  TEXT NOT NULL,
      resolved_at TEXT
    );
  `);
}

export function registrarEntregaPendente(leadId: string, nome: string, url: string | null, motivo: string): void {
  garantirTabela();
  getDb()
    .prepare(
      `INSERT INTO preview_deliveries (lead_id, nome, url, motivo, created_at, resolved_at)
       VALUES (?, ?, ?, ?, ?, NULL)
       ON CONFLICT(lead_id) DO UPDATE SET nome = excluded.nome, url = excluded.url,
         motivo = excluded.motivo, created_at = excluded.created_at, resolved_at = NULL`,
    )
    .run(leadId, nome, url, motivo, new Date().toISOString());
}

export function resolverEntregaPendente(leadId: string): void {
  garantirTabela();
  getDb()
    .prepare("UPDATE preview_deliveries SET resolved_at = ? WHERE lead_id = ? AND resolved_at IS NULL")
    .run(new Date().toISOString(), leadId);
}

export function listarEntregasPendentes(): EntregaPendente[] {
  garantirTabela();
  const linhas = getDb()
    .prepare("SELECT lead_id, nome, url, motivo, created_at FROM preview_deliveries WHERE resolved_at IS NULL ORDER BY created_at ASC")
    .all() as any[];
  return linhas.map((l) => ({
    leadId: l.lead_id,
    nome: l.nome,
    url: l.url,
    motivo: l.motivo,
    criadoEm: l.created_at,
  }));
}

/** Semente estável: mesma empresa recebe sempre a mesma abertura. */
function semente(nome: string): number {
  let h = 0;
  for (const ch of String(nome || "")) h = (h * 31 + ch.charCodeAt(0)) % 100000;
  return h;
}

export function mensagemDaPagina(nome: string, url: string, dono?: string): string {
  // Nome próprio só quando existe decisor identificado. O primeiro nome da empresa
  // ("Mais Você Estética") virava "Mais, ficou pronto!" — falando com o dono por um
  // nome que não é dele.
  const pessoa = comoChamar({ name: nome, dmName: dono });
  const aberturas = pessoa
    ? [`Prontinho, ${pessoa}!`, `Saiu, ${pessoa}!`, `${pessoa}, ficou pronto!`]
    : ["Prontinho!", "Saiu!", "Ficou pronto!"];
  const fechamentos = [
    "Deixei o botão de WhatsApp no topo, pra quem abrir falar direto com vocês. O que você achou?",
    "O botão de WhatsApp fica no topo, pra quem abrir já falar com vocês. Me diz o que você mudaria.",
    "Tem botão de WhatsApp no topo pra facilitar. Dá uma olhada e me conta o que achou?",
  ];
  const s = semente(nome);
  return whatsAppify(
    [
      `${aberturas[s % aberturas.length]} Montei a página de vocês 👇`,
      url,
      fechamentos[Math.floor(s / 7) % fechamentos.length],
    ].join("\n\n"),
  );
}

/**
 * Entrega em andamento por lead. A geração leva minutos; sem esta reserva, dois
 * gatilhos (webhook + retry) escrevem a mesma página duas vezes e mandam dois links.
 */
const entregando = new Set<string>();

/** Espera no máximo `ms` e devolve o fallback — nada de espera infinita na entrega. */
async function comTeto<T>(promessa: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const teto = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
    if (typeof timer.unref === "function") timer.unref();
  });
  try {
    return await Promise.race([promessa, teto]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Aviso curto que toma o turno: sem ele, o agente responde antes da página ficar pronta. */
export function mensagemDeEspera(): string {
  return whatsAppify("Perfeito! Dá um minutinho que eu já te mando o link 👇");
}

export async function entregarPaginaDoLead(
  leadId: string,
  opts: { aviso?: boolean } = {},
): Promise<EntregaPagina> {
  if (entregando.has(leadId)) return { ok: false, motivo: "já existe uma entrega em andamento para este lead" };
  entregando.add(leadId);
  try {
    return await entregarInterno(leadId, opts);
  } finally {
    entregando.delete(leadId);
  }
}

async function entregarInterno(leadId: string, opts: { aviso?: boolean }): Promise<EntregaPagina> {
  const lead = getLeadById(leadId);
  if (!lead) return { ok: false, motivo: "lead não encontrado" };
  if (lead.doNotContact) {
    registrarEntregaPendente(leadId, lead.name, null, "a empresa pediu para não ser contatada");
    return { ok: false, motivo: "lead pediu para não ser contatado" };
  }

  // Toma o turno ANTES de gerar. A geração leva minutos e, nesse intervalo, o
  // agente do WhatsApp respondia primeiro — a entrega então batia na trava de duas
  // seguidas e a página ficava pendente. O aviso resolve a posse da conversa.
  if (opts.aviso !== false) {
    const historico = getCommunicationsByLead(lead.id);
    if (historico[0]?.direction === "inbound") {
      const aviso = await dispatchLeadReply(lead, {
        channel: "whatsapp",
        message: mensagemDeEspera(),
        hook: "pagina_aviso",
      });
      console.log(`[pagina] aviso de espera: ${aviso.status}${aviso.detail ? ` (${aviso.detail})` : ""}`);
    }
  }

  // Toda entrega é página nova. Reaproveitar página antiga entregava ao cliente
  // um site escrito antes de a conversa existir — e travava melhoria.
  const origem = "ia" as const;
  let url: string | null = null;
  try {
    const gerada = await gerarPaginaUnica(lead);
    url = resolvePreviewUrl(gerada.preview.slug);
  } catch (erro: any) {
    // Sem template de reserva: se a página não saiu, o cliente não recebe nada e
    // o Paulo é avisado no WhatsApp para decidir (nova tentativa, ajuste, manual).
    const motivo = String(erro?.message || erro).slice(0, 300);
    console.warn(`[pagina] geração falhou para ${lead.name}: ${motivo}`);
    registrarEntregaPendente(leadId, lead.name, null, `geração falhou: ${motivo}`);
    await sendOwnerAlert({
      kind: "ia_falhou",
      detail: `A prévia de ${lead.name} não foi gerada e NADA foi enviado ao cliente. Motivo: ${motivo}`,
      leadId,
      leadName: lead.name,
      leadPhone: lead.phone,
    } as any).catch(() => undefined);
    return { ok: false, motivo: `geração falhou: ${motivo}`, origem };
  }

  // Publicação tem teto próprio. Sem isto, um deploy que entra em retentativa trava
  // a entrega em silêncio: o link nunca sai, nada entra na fila de pendências e o
  // agente do WhatsApp preenche o vácuo com o texto errado (aconteceu).
  if (pagesConfigured()) {
    const inicio = Date.now();
    const publicado = await comTeto(
      publishPreviews(previewsDir()),
      180_000,
      { ok: false, url: null, error: "publicação não terminou em 180s" } as any,
    );
    if (!publicado.ok) {
      console.warn(`[pagina] publicação falhou em ${Math.round((Date.now() - inicio) / 1000)}s: ${publicado.error || "sem detalhe"}`);
    } else {
      console.log(`[pagina] publicação ok em ${Math.round((Date.now() - inicio) / 1000)}s${(publicado as any).skipped ? " (sem mudanças)" : ""}`);
    }
  }

  if (!url) {
    registrarEntregaPendente(leadId, lead.name, null, "sem base pública: o link não abriria");
    return { ok: false, motivo: "sem base pública: o link não abriria", origem };
  }

  // Link que responde 404 no primeiro clique é pior que link nenhum.
  if (!(await confirmarUrlNoAr(url))) {
    registrarEntregaPendente(leadId, lead.name, url, "o link não respondeu 200 depois da publicação");
    return { ok: false, motivo: "o link ainda não responde depois da publicação", url, origem };
  }

  // App é o dono da entrega: passa pela trava de duas seguidas como qualquer
  // resposta. Se outra coisa respondeu no meio do caminho, a entrega fica
  // pendente — e é a ÚNICA situação em que o agente pode mandar o link.
  // Continuação do aviso que o próprio app mandou há segundos: é a promessa sendo
  // cumprida, não uma segunda resposta independente. Só o app gera e entrega esta
  // página (a reserva acima garante isso), então o `force` aqui não abre corrida.
  const envio = await dispatchLeadReply(lead, {
    channel: "whatsapp",
    message: mensagemDaPagina(lead.name, url, (lead as any).dmName),
    hook: "pagina_unica",
    force: true,
  });

  eventHub.emit("pagina_pronta", {
    leadId: lead.id,
    name: lead.name,
    url,
    origem,
    conceito: null,
    modelo: null,
    enviada: envio.status === "sent",
  });

  if (envio.status !== "sent") {
    const motivo = envio.blocked
      ? `entrega bloqueada: ${envio.detail || "última mensagem da conversa é nossa"}`
      : `mensagem não enviada: ${envio.detail || envio.status}`;
    console.warn(`[pagina] ${motivo}`);
    registrarEntregaPendente(leadId, lead.name, url, motivo);
    return { ok: false, motivo, url, origem };
  }

  resolverEntregaPendente(leadId);
  return { ok: true, url, origem, comunicacao: envio.communicationId || null };
}
