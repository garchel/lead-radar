/**
 * Relatório mensal do cliente.
 *
 * É o que transforma "eu fiz seu site" em "eu cuido da sua presença". Sem isso o
 * cliente paga uma vez e some — e a recorrência (mantendo o site e o bot) não tem
 * argumento nenhum.
 *
 * Regra de honestidade: só entra número que a gente mede de verdade. Hoje isso é
 * conversa de WhatsApp (mensagens recebidas, respondidas, tempo de resposta) e o
 * estado da página. Visitas e cliques exigem analytics no site publicado: quando
 * o cliente autorizar, entram aqui com a fonte declarada.
 */
import PDFDocument from "pdfkit";
import sharp from "sharp";
import type { Project, StoredLead } from "../store/types";
import { getCommunicationsByLead, getProjectsByLead, type Communication } from "../store/db";
import { previewPalette, readableOn } from "./previewTemplate";
import { wordmarkSvg } from "./logoSvg";
import { formatDateBr } from "./dateFormat";

export interface MonthlyNumbers {
  periodLabel: string;
  recebidas: number;
  enviadas: number;
  respondidas: number;
  /** Mediana do tempo entre a mensagem do cliente e a nossa resposta (minutos). */
  tempoRespostaMin: number | null;
  diasComConversa: number;
  rating: number | null;
  reviewsCount: number | null;
  projeto: { nome: string; etapa: string; noAr: boolean; entregueEm?: string } | null;
}

function inicioDoMes(referencia: Date): Date {
  return new Date(referencia.getFullYear(), referencia.getMonth(), 1, 0, 0, 0, 0);
}

function mediana(valores: number[]): number | null {
  if (!valores.length) return null;
  const ordenado = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ordenado.length / 2);
  return ordenado.length % 2 ? ordenado[meio] : Math.round((ordenado[meio - 1] + ordenado[meio]) / 2);
}

export function monthlyNumbers(lead: StoredLead, referencia: Date = new Date()): MonthlyNumbers {
  const inicio = inicioDoMes(referencia);
  const fim = new Date(referencia.getFullYear(), referencia.getMonth() + 1, 1);
  const comunicacoes: Communication[] = getCommunicationsByLead(lead.id).filter((c) => {
    const quando = new Date(c.sentAt || c.createdAt || 0);
    return quando >= inicio && quando < fim;
  });

  const recebidas = comunicacoes.filter((c) => c.direction === "inbound");
  const enviadas = comunicacoes.filter((c) => c.direction === "outbound" && c.status !== "failed");
  const respondidas = recebidas.filter((entrada) => {
    const horaEntrada = new Date(entrada.sentAt || entrada.createdAt || 0).getTime();
    return enviadas.some((saida) => new Date(saida.sentAt || saida.createdAt || 0).getTime() >= horaEntrada);
  });

  const intervalos: number[] = [];
  for (const entrada of respondidas) {
    const horaEntrada = new Date(entrada.sentAt || entrada.createdAt || 0).getTime();
    const primeiraResposta = enviadas
      .map((s) => new Date(s.sentAt || s.createdAt || 0).getTime())
      .filter((t) => t >= horaEntrada)
      .sort((a, b) => a - b)[0];
    if (primeiraResposta) intervalos.push(Math.round((primeiraResposta - horaEntrada) / 60000));
  }

  const dias = new Set(
    comunicacoes.map((c) => new Date(c.sentAt || c.createdAt || 0).toISOString().slice(0, 10))
  );

  const projeto = getProjectsByLead(lead.id).find((p) => !p.archived) || null;

  return {
    periodLabel: referencia.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }),
    recebidas: recebidas.length,
    enviadas: enviadas.length,
    respondidas: respondidas.length,
    tempoRespostaMin: mediana(intervalos),
    diasComConversa: dias.size,
    rating: typeof lead.rating === "number" ? lead.rating : null,
    reviewsCount: lead.reviewsCount ?? null,
    projeto: projeto
      ? {
          nome: projeto.name,
          etapa: projeto.stage,
          noAr: Boolean(projeto.deployUrl),
          entregueEm: projeto.completedAt,
        }
      : null,
  };
}

const ETAPAS: Record<string, string> = {
  briefing: "Coleta de material",
  copywriting: "Textos",
  design: "Design",
  wireframe: "Estrutura",
  desenvolvimento: "Desenvolvimento",
  revisao: "Revisão",
  deploy: "Publicado",
};

export async function generateMonthlyReportPdf(lead: StoredLead, referencia: Date = new Date()): Promise<Buffer> {
  const numeros = monthlyNumbers(lead, referencia);
  const cor = previewPalette(
    (lead.brandSnapshot?.palette || []).map((c) => String(c.hex || "")).find((h) => /^#[0-9a-f]{6}$/i.test(h))
  );
  const accent = cor.accent;
  const nome = String(lead.name || "").split(" — ")[0];

  let logo: Buffer | null = null;
  try {
    logo = await sharp(
      Buffer.from(
        wordmarkSvg(nome, lead.searchCategory || lead.category || "", { accent, onAccent: readableOn(accent), ink: "#141414" }),
        "utf8"
      ),
      { density: 220 }
    )
      .png()
      .toBuffer();
  } catch {
    logo = null;
  }

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margins: { top: 48, bottom: 48, left: 48, right: 48 } });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const L = 48;
    const R = doc.page.width - 48;
    const largura = R - L;

    doc.rect(0, 0, doc.page.width, 7).fill(accent);
    let y = 54;
    if (logo) {
      doc.image(logo, L, y, { width: 220 });
      y += 68;
    } else {
      doc.fillColor("#141414").fontSize(18).font("Helvetica-Bold").text(nome, L, y);
      y += 30;
    }

    doc.fillColor("#6b6f76").fontSize(9).font("Helvetica").text(`Relatório de ${numeros.periodLabel}`, L, y);
    y += 22;
    doc.moveTo(L, y).lineTo(R, y).strokeColor("#e7e5e1").lineWidth(1).stroke();
    y += 24;

    doc.fillColor("#141414").fontSize(18).font("Helvetica-Bold").text("Como foi o seu mês", L, y, { width: largura });
    y = doc.y + 16;

    // cartões de número
    const cartoes: Array<[string, string, string]> = [
      ["Conversas recebidas", String(numeros.recebidas), "mensagens que chegaram no WhatsApp"],
      ["Respondidas", String(numeros.respondidas), numeros.recebidas ? `${Math.round((numeros.respondidas / numeros.recebidas) * 100)}% do total` : "sem mensagens no período"],
      [
        "Tempo de resposta",
        numeros.tempoRespostaMin === null ? "—" : `${numeros.tempoRespostaMin} min`,
        "mediana entre a mensagem e a resposta",
      ],
    ];
    const larguraCartao = (largura - 20) / 3;
    cartoes.forEach(([titulo, valor, nota], i) => {
      const x = L + i * (larguraCartao + 10);
      doc.roundedRect(x, y, larguraCartao, 76, 10).fill("#faf8f5").stroke("#e7e5e1");
      doc.fillColor("#6b6f76").fontSize(7.5).font("Helvetica-Bold").text(titulo.toUpperCase(), x + 12, y + 12, { width: larguraCartao - 24, characterSpacing: 0.6 });
      doc.fillColor("#141414").fontSize(20).font("Helvetica-Bold").text(valor, x + 12, y + 26);
      doc.fillColor("#6b6f76").fontSize(7.5).font("Helvetica").text(nota, x + 12, y + 54, { width: larguraCartao - 24 });
    });
    y += 96;

    // situação do site
    doc.fillColor(accent).fontSize(9).font("Helvetica-Bold").text("SEU SITE", L, y, { characterSpacing: 1.2 });
    y = doc.y + 6;
    if (numeros.projeto) {
      doc.fillColor("#141414").fontSize(12).font("Helvetica-Bold").text(numeros.projeto.nome, L, y);
      y = doc.y + 2;
      doc
        .fillColor("#3f4147")
        .fontSize(10)
        .font("Helvetica")
        .text(
          numeros.projeto.noAr
            ? `No ar${numeros.projeto.entregueEm ? ` desde ${formatDateBr(numeros.projeto.entregueEm)}` : ""}. Etapa atual: ${ETAPAS[numeros.projeto.etapa] || numeros.projeto.etapa}.`
            : `Em andamento. Etapa atual: ${ETAPAS[numeros.projeto.etapa] || numeros.projeto.etapa}.`,
          L,
          y,
          { width: largura }
        );
      y = doc.y + 10;
    } else {
      doc.fillColor("#3f4147").fontSize(10).font("Helvetica").text("Nenhum projeto ativo no período.", L, y);
      y = doc.y + 10;
    }

    if (numeros.rating) {
      doc
        .fillColor("#3f4147")
        .fontSize(10)
        .font("Helvetica")
        .text(
          `Sua nota no Google está em ${String(numeros.rating).replace(".", ",")}${numeros.reviewsCount ? ` com ${numeros.reviewsCount} avaliações` : ""}.`,
          L,
          y,
          { width: largura }
        );
      y = doc.y + 10;
    }

    y += 8;
    doc.moveTo(L, y).lineTo(R, y).strokeColor("#e7e5e1").lineWidth(1).stroke();
    y += 18;

    doc.fillColor(accent).fontSize(9).font("Helvetica-Bold").text("O QUE DÁ PARA MELHORAR", L, y, { characterSpacing: 1.2 });
    y = doc.y + 8;
    const sugestoes: string[] = [];
    if (numeros.recebidas && numeros.tempoRespostaMin !== null && numeros.tempoRespostaMin > 60) {
      sugestoes.push("Boa parte das mensagens ficou mais de uma hora sem resposta. Um atendimento automático no WhatsApp responde na hora e passa o recado para você.");
    }
    if (numeros.recebidas === 0) {
      sugestoes.push("Nenhuma mensagem chegou pelo site neste mês. Vale conferir se o botão de WhatsApp está no lugar certo e se a página aparece na busca pelo seu nome.");
    }
    if (!numeros.rating) {
      sugestoes.push("Você ainda não tem avaliações no Google. Pedir avaliação a quem já foi atendido é o caminho mais barato para aparecer melhor na busca.");
    }
    sugestoes.push("Manutenção mensal: textos atualizados, ajustes de foto e acompanhamento do que as pessoas procuram no site.");
    sugestoes.forEach((linha) => {
      doc.circle(L + 2.5, y + 4, 2).fill(accent);
      doc.fillColor("#3f4147").fontSize(9).font("Helvetica").text(linha, L + 12, y, { width: largura - 12, lineGap: 1 });
      y = doc.y + 5;
    });

    const yFooter = doc.page.height - 92;
    doc.moveTo(L, yFooter).lineTo(R, yFooter).strokeColor("#e7e5e1").lineWidth(1).stroke();
    doc.fillColor("#141414").fontSize(9.5).font("Helvetica-Bold").text("Vértice Páginas Web", L, yFooter + 9);
    doc
      .fillColor("#6b6f76")
      .fontSize(8.5)
      .font("Helvetica")
      .text(
        `Números medidos nas conversas de WhatsApp do período, de ${formatDateBr(inicioDoMes(referencia))} a ${formatDateBr(new Date(referencia.getFullYear(), referencia.getMonth() + 1, 0))}.`,
        L,
        yFooter + 22,
        { width: largura - 10 }
      );

    doc.end();
  });
}

export function monthlyReportFileName(lead: StoredLead, referencia: Date = new Date()): string {
  const nome = String(lead.name || "cliente")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const mes = `${referencia.getFullYear()}-${String(referencia.getMonth() + 1).padStart(2, "0")}`;
  return `Relatorio-${nome}-${mes}.pdf`;
}
