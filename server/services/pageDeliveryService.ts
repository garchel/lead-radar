import { getLeadById } from "../store/db";
import { eventHub } from "../events/eventHub";
import { dispatchLeadReply } from "./interactionService";
import { gerarPaginaUnica } from "./aiPreviewService";
import { pagesConfigured, publishPreviews } from "./pagesService";
import { confirmarUrlNoAr, previewExists, previewsDir, resolvePreviewUrl } from "./previewService";
import { whatsAppify } from "./messageStyle";

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

export function mensagemDaPagina(nome: string, url: string): string {
  const primeiro = String(nome || "").split(/\s+/)[0] || "";
  const abertura = primeiro ? `Prontinho, ${primeiro}!` : "Prontinho!";
  return whatsAppify(
    [
      `${abertura} Montei a página de vocês 👇`,
      url,
      "Deixei o botão de WhatsApp no topo, pra quem abrir falar direto com vocês. O que você achou?",
    ].join("\n\n"),
  );
}

export async function entregarPaginaDoLead(leadId: string): Promise<EntregaPagina> {
  const lead = getLeadById(leadId);
  if (!lead) return { ok: false, motivo: "lead não encontrado" };
  if (lead.doNotContact) return { ok: false, motivo: "lead pediu para não ser contatado" };

  // Página já entregue não é reescrita: cada geração custa chamada de IA e o
  // dono já viu aquela.
  if (previewExists(lead)) return { ok: false, motivo: "página já existe" };

  const gerada = await gerarPaginaUnica(lead);
  const url = resolvePreviewUrl(gerada.preview.slug);

  if (pagesConfigured()) {
    const publicado = await publishPreviews(previewsDir());
    if (!publicado.ok) {
      console.warn(`[pagina] publicação falhou: ${publicado.error || "sem detalhe"}`);
    }
  }

  if (!url) {
    return { ok: false, motivo: "sem base pública: o link não abriria", origem: gerada.origem };
  }

  // Link que responde 404 no primeiro clique é pior que link nenhum.
  if (!(await confirmarUrlNoAr(url))) {
    return { ok: false, motivo: "o link ainda não responde depois da publicação", url, origem: gerada.origem };
  }

  const envio = await dispatchLeadReply(lead, {
    channel: "whatsapp",
    message: mensagemDaPagina(lead.name, url),
    hook: "pagina_unica",
    // A última mensagem costuma ser nossa (o agente já respondeu o interesse).
    // Esta é a continuação prometida, então passa pela trava de propósito.
    force: true,
  });

  eventHub.emit("pagina_pronta", {
    leadId: lead.id,
    name: lead.name,
    url,
    origem: gerada.origem,
    conceito: gerada.conceito || null,
    modelo: gerada.modelo || null,
    enviada: envio.status === "sent",
  });

  if (envio.status !== "sent") {
    return { ok: false, motivo: `mensagem não enviada: ${envio.detail || envio.status}`, url, origem: gerada.origem };
  }

  return { ok: true, url, origem: gerada.origem, comunicacao: envio.communicationId || null };
}
