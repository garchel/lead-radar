/**
 * Proposta em PDF.
 *
 * A conversa no WhatsApp vende; o PDF fecha. Até aqui o fechamento era um texto
 * com valor e prazo, que o cliente não consegue mostrar para sócio, cônjuge ou
 * contador — e proposta que não circula morre. Este documento existe para ser
 * encaminhado: prévia, escopo, prazo, valor e validade em duas páginas.
 *
 * Regras: valor e prazo vêm da política comercial (fonte única, nada digitado à
 * mão aqui); nada de promessa que não esteja no escopo; sem CNPJ, sem dado de
 * ficha do cliente.
 */
import PDFDocument from "pdfkit";
import sharp from "sharp";
import type { StoredLead } from "../store/types";
import { getCommercialPolicy, formatBRL, type CommercialPackage } from "./commercialPolicy";
import { previewPalette, readableOn } from "./previewTemplate";
import { wordmarkSvg } from "./logoSvg";
import { formatDateBr } from "./dateFormat";

export interface ProposalOptions {
  /** Pacote proposto (id). Default: o de maior escopo entre os ativos. */
  packageId?: string;
  /** Link público da prévia, quando existir. */
  previewUrl?: string | null;
  now?: Date;
}

const INK = "#141414";
const BODY = "#3f4147";
const MUTE = "#6b6f76";
const LINE = "#e7e5e1";
const WASH = "#faf8f5";

function escolherPacote(pacotes: CommercialPackage[], id?: string): CommercialPackage {
  if (id) {
    const achado = pacotes.find((p) => p.id === id || p.name.toLowerCase() === id.toLowerCase());
    if (achado) return achado;
  }
  // propõe o mais completo (ancora o valor) e oferece o mais simples como opção;
  // rebaixar é fácil, subir depois é difícil
  return [...pacotes].sort((a, b) => b.price - a.price)[0];
}

/** +5561995254732 → +55 (61) 99525-4732 */
export function prettyPhone(phone?: string): string {
  const digitos = String(phone || "").replace(/\D/g, "");
  if (digitos.length < 10) return String(phone || "");
  const semPais = digitos.startsWith("55") ? digitos.slice(2) : digitos;
  const ddd = semPais.slice(0, 2);
  const numero = semPais.slice(2);
  const meio = numero.length > 8 ? numero.slice(0, 5) : numero.slice(0, 4);
  const fim = numero.slice(meio.length);
  return `+55 (${ddd}) ${meio}-${fim}`;
}

export function proposalFileName(lead: StoredLead): string {
  const nome = String(lead.name || "cliente")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return `Proposta-${nome || "cliente"}.pdf`;
}

async function logoPng(lead: StoredLead, accent: string): Promise<Buffer | null> {
  try {
    const svg = wordmarkSvg(String(lead.name || "").split(" — ")[0], lead.searchCategory || lead.category || "", {
      accent,
      onAccent: readableOn(accent),
      ink: INK,
    });
    return await sharp(Buffer.from(svg, "utf8"), { density: 220 }).png().toBuffer();
  } catch {
    return null;
  }
}

export async function generateProposalPdf(lead: StoredLead, options: ProposalOptions = {}): Promise<Buffer> {
  const policy = getCommercialPolicy();
  const pacote = escolherPacote(policy.packages, options.packageId);
  const outro = policy.packages.find((p) => p.id !== pacote.id);
  const agora = options.now || new Date();
  const validade = new Date(agora.getTime() + 7 * 24 * 60 * 60 * 1000);

  const cor = previewPalette(
    (lead.brandSnapshot?.palette || []).map((c) => String(c.hex || "")).find((h) => /^#[0-9a-f]{6}$/i.test(h))
  );
  const accent = cor.accent;
  const nome = String(lead.name || "").split(" — ")[0];
  const local = [lead.city, lead.state].filter(Boolean).join("/");
  const logo = await logoPng(lead, accent);

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 48, bottom: 48, left: 48, right: 48 },
      info: {
        Title: `Proposta — ${nome}`,
        Author: "Vértice Páginas Web",
        Subject: "Proposta de site profissional",
      },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const L = 48;
    const R = doc.page.width - 48;
    const largura = R - L;
    const debug = process.env.PDF_DEBUG === "1";
    const marca = (onde: string) => {
      if (debug) console.log(`[pdf] ${onde}: y=${Math.round(doc.y)} paginas=${doc.bufferedPageRange().count}`);
    };

    /* ---------------------------------------------------------------- */
    /* capa                                                             */
    /* ---------------------------------------------------------------- */
    doc.rect(0, 0, doc.page.width, 7).fill(accent);

    let y = 54;
    if (logo) {
      doc.image(logo, L, y, { width: 250 });
      y += 76;
    } else {
      doc.fillColor(INK).fontSize(20).font("Helvetica-Bold").text(nome, L, y);
      y += 34;
    }

    doc
      .fillColor(MUTE)
      .fontSize(9)
      .font("Helvetica")
      .text(
        [lead.searchCategory || lead.category || "", local, formatDateBr(agora)].filter(Boolean).join("   ·   "),
        L,
        y
      );
    y += 22;

    doc.moveTo(L, y).lineTo(R, y).strokeColor(LINE).lineWidth(1).stroke();
    y += 26;

    doc.fillColor(INK).fontSize(23).font("Helvetica-Bold").text("Proposta de site profissional", L, y, { width: largura });
    y = doc.y + 6;
    doc
      .fillColor(BODY)
      .fontSize(11)
      .font("Helvetica")
      .text(
        "Uma página para transformar quem procura você no Google em conversa no WhatsApp. Escopo, prazo e valor abaixo, sem letra miúda.",
        L,
        y,
        { width: largura, lineGap: 3 }
      );
    y = doc.y + 18;

    // bloco da prévia
    doc.roundedRect(L, y, largura, 54, 10).fill(WASH).stroke(LINE);
    doc
      .fillColor(accent)
      .fontSize(8.5)
      .font("Helvetica-Bold")
      .text("PRÉVIA PRONTA", L + 16, y + 13, { characterSpacing: 1.2 });
    doc
      .fillColor(INK)
      .fontSize(11)
      .font("Helvetica-Bold")
      .fillColor(INK)
      .fontSize(10.5)
      .font("Helvetica-Bold")
      .text(options.previewUrl ? "Sua página já existe, para você ver antes de pagar" : "A primeira versão é montada antes de qualquer pagamento", L + 16, y + 24, {
        width: largura - 32,
      });
    doc
      .fillColor(accent)
      .fontSize(10)
      .font("Helvetica-Bold")
      .text(
        options.previewUrl || "Você vê a página, pede ajuste e só depois decide contratar.",
        L + 16,
        y + 38,
        { width: largura - 32 }
      );
    y += 66;

    /* ---------------------------------------------------------------- */
    /* escopo                                                           */
    /* ---------------------------------------------------------------- */
    marca("escopo");
    doc.fillColor(accent).fontSize(9).font("Helvetica-Bold").text("O QUE ESTÁ INCLUÍDO", L, y, { characterSpacing: 1.2 });
    y = doc.y + 4;
    doc.fillColor(INK).fontSize(15).font("Helvetica-Bold").text(`Pacote ${pacote.name}`, L, y);
    y = doc.y + 2;
    doc.fillColor(MUTE).fontSize(9.5).font("Helvetica").text(pacote.bestFor, L, y, { width: largura });
    y = doc.y + 10;

    const coluna = largura / 2 - 8;
    const itens = pacote.benefits.slice(0, 10);
    const metade = Math.ceil(itens.length / 2);
    let yEsq = y;
    let yDir = y;
    itens.forEach((item, i) => {
      const esq = i < metade;
      const x = esq ? L : L + coluna + 16;
      const yy = esq ? yEsq : yDir;
      doc.circle(x + 2.5, yy + 4, 2).fill(accent);
      doc.fillColor(BODY).fontSize(9.2).font("Helvetica").text(item.charAt(0).toUpperCase() + item.slice(1), x + 11, yy, {
        width: coluna - 12,
        lineGap: 0.5,
      });
      if (esq) yEsq = doc.y + 3;
      else yDir = doc.y + 3;
    });
    y = Math.max(yEsq, yDir) + 12;

    /* ---------------------------------------------------------------- */
    /* investimento                                                     */
    /* ---------------------------------------------------------------- */
    marca("investimento");
    doc.moveTo(L, y).lineTo(R, y).strokeColor(LINE).lineWidth(1).stroke();
    y += 18;

    doc.fillColor(accent).fontSize(9).font("Helvetica-Bold").text("INVESTIMENTO", L, y, { characterSpacing: 1.2 });
    y = doc.y + 2;
    doc.fillColor(INK).fontSize(30).font("Helvetica-Bold").text(formatBRL(pacote.price), L, y);
    const larguraPreco = doc.widthOfString(formatBRL(pacote.price));
    doc
      .fillColor(MUTE)
      .fontSize(9.5)
      .font("Helvetica")
      .text("pagamento único  ·  sem mensalidade", L + larguraPreco + 12, y + 14);
    y = doc.y + 8;

    doc
      .fillColor(BODY)
      .fontSize(10)
      .font("Helvetica")
      .text(
        `Prazo de entrega: ${policy.deliveryDays[0]} a ${policy.deliveryDays[1]} dias úteis depois de receber seus textos, fotos e logo. ${pacote.revisions} rodada${
          pacote.revisions > 1 ? "s" : ""
        } de ajuste inclusa${pacote.revisions > 1 ? "s" : ""}.`,
        L,
        y,
        { width: largura, lineGap: 3 }
      );
    y = doc.y + 8;

    if (outro) {
      doc
        .fillColor(MUTE)
        .fontSize(9.5)
        .font("Helvetica-Oblique")
        .text(`Também existe o pacote ${outro.name} por ${formatBRL(outro.price)}: ${outro.summary}.`, L, y, { width: largura });
      y = doc.y + 4;
    }

    /* ---------------------------------------------------------------- */
    /* fechamento da página 1: próximos passos, validade e contato       */
    /* ---------------------------------------------------------------- */
    y += 12;
    doc.fillColor(accent).fontSize(9).font("Helvetica-Bold").text("COMO SEGUIR", L, y, { characterSpacing: 1.2 });
    y = doc.y + 8;

    const passos: Array<[string, string]> = [
      ["Você aprova", "Responde no WhatsApp dizendo que quer seguir."],
      ["A gente monta", `${policy.deliveryDays[0]} a ${policy.deliveryDays[1]} dias úteis após o material.`],
      ["Entra no ar", "Link final publicado, seu, sem mensalidade."],
    ];
    const larguraPasso = (largura - 16) / 3;
    passos.forEach(([titulo, texto], i) => {
      const x = L + i * (larguraPasso + 8);
      doc.roundedRect(x, y, larguraPasso, 58, 8).stroke(LINE);
      doc.fillColor(INK).fontSize(10).font("Helvetica-Bold").text(`${i + 1}. ${titulo}`, x + 10, y + 10, { width: larguraPasso - 20 });
      doc.fillColor(MUTE).fontSize(8.5).font("Helvetica").text(texto, x + 10, y + 26, { width: larguraPasso - 20, lineGap: 1 });
    });
    y += 72;

    // CTA: botão desenhado (o PDF é lido no celular e impresso; texto solto some)
    const larguraCta = 250;
    doc.roundedRect(L, y, larguraCta, 40, 20).fill(accent);
    doc
      .fillColor(readableOn(accent))
      .fontSize(11.5)
      .font("Helvetica-Bold")
      .text("Quero aprovar a proposta", L + 18, y + 13, { width: larguraCta - 36, align: "center", lineBreak: false });
    if (lead.phone) {
      doc.link(L, y, larguraCta, 40, `https://wa.me/${String(lead.phone).replace(/\D/g, "")}`);
    }
    doc
      .fillColor(MUTE)
      .fontSize(9.5)
      .font("Helvetica")
      .text("Responder no WhatsApp já vale como aprovação.", L + larguraCta + 14, y + 15, { width: largura - larguraCta - 14 });
    y += 56;

    // contato e validade também na página 1: muita gente imprime só esta
    doc.moveTo(L, y).lineTo(R, y).strokeColor(LINE).lineWidth(1).stroke();
    y += 12;
    doc.fillColor(INK).fontSize(10).font("Helvetica-Bold").text(`Proposta válida até ${formatDateBr(validade)}`, L, y, { width: largura / 2 });
    doc
      .fillColor(MUTE)
      .fontSize(9.5)
      .font("Helvetica")
      .text(
        [lead.phone ? `WhatsApp ${prettyPhone(lead.phone)}` : "", "Clara · Vértice Páginas Web"].filter(Boolean).join("   ·   "),
        L + largura / 2,
        y,
        { width: largura / 2, align: "right" }
      );

    /* ---------------------------------------------------------------- */
    /* página 2 — identidade, cronograma, condições                      */
    /* ---------------------------------------------------------------- */
    marca("addPage");
    doc.addPage();
    let y2 = 54;
    doc.rect(0, 0, doc.page.width, 7).fill(accent);

    doc.fillColor(accent).fontSize(9).font("Helvetica-Bold").text("DIREÇÃO VISUAL", L, y2, { characterSpacing: 1.2 });
    y2 = doc.y + 6;
    doc.fillColor(INK).fontSize(15).font("Helvetica-Bold").text("As cores da sua marca", L, y2);
    y2 = doc.y + 12;

    const cores = (lead.brandSnapshot?.palette || []).map((c) => String(c.hex || "")).filter((h) => /^#[0-9a-f]{6}$/i.test(h)).slice(0, 4);
    const larguraCor = (largura - (cores.length - 1) * 10) / Math.max(cores.length, 1);
    cores.forEach((hex, i) => {
      const x = L + i * (larguraCor + 10);
      doc.roundedRect(x, y2, larguraCor, 54, 8).fill(hex).stroke(LINE);
      doc.fillColor(readableOn(hex)).fontSize(8).font("Helvetica-Bold").text(hex.toUpperCase(), x + 10, y2 + 36);
    });
    y2 += cores.length ? 74 : 8;

    doc.fillColor(accent).fontSize(9).font("Helvetica-Bold").text("COMO FUNCIONA", L, y2, { characterSpacing: 1.2 });
    y2 = doc.y + 6;
    doc.fillColor(INK).fontSize(15).font("Helvetica-Bold").text("Etapas até sua página no ar", L, y2);
    y2 = doc.y + 10;

    const etapas = [
      ["1. Material", "Você envia textos, fotos e logo (ou a gente ajusta o que já temos)."],
      ["2. Montagem", "Página escrita e montada com a sua identidade visual."],
      ["3. Sua revisão", "Você vê o link, pede ajustes e aprova o texto final."],
      ["4. Publicação", "Sai do ar a versão de teste e entra no endereço combinado."],
      ["5. Entrega", "Link final, arquivos da marca e orientação de uso."],
    ];
    for (const [titulo, texto] of etapas) {
      doc.fillColor(INK).fontSize(10.5).font("Helvetica-Bold").text(titulo, L, y2);
      doc.fillColor(BODY).fontSize(9.5).font("Helvetica").text(texto, L + 92, y2, { width: largura - 92, lineGap: 2 });
      y2 = Math.max(doc.y, y2 + 16) + 8;
    }

    y2 += 6;
    doc.moveTo(L, y2).lineTo(R, y2).strokeColor(LINE).lineWidth(1).stroke();
    y2 += 16;

    doc.fillColor(accent).fontSize(9).font("Helvetica-Bold").text("CONDIÇÕES", L, y2, { characterSpacing: 1.2 });
    y2 = doc.y + 6;
    const condicoes = [
      "A prévia é gratuita e não gera nenhum compromisso.",
      `Proposta válida até ${formatDateBr(validade)}.`,
      policy.payment.length ? `Formas de pagamento: ${policy.payment.join(" · ")}.` : "Forma de pagamento combinada na contratação.",
      "Não há cobrança de mensalidade: o site é seu.",
    ];
    for (const linha of condicoes) {
      doc.circle(L + 2.5, y2 + 5, 2).fill(accent);
      doc.fillColor(BODY).fontSize(9.5).font("Helvetica").text(linha, L + 12, y2, { width: largura - 12, lineGap: 2 });
      y2 = doc.y + 5;
    }

    /* rodapé — precisa caber acima da margem inferior, senão o pdfkit cria página nova */
    const yFooter = doc.page.height - 88;
    doc.moveTo(L, yFooter).lineTo(R, yFooter).strokeColor(LINE).lineWidth(1).stroke();
    doc
      .fillColor(INK)
      .fontSize(10)
      .font("Helvetica-Bold")
      .text("Vértice Páginas Web", L, yFooter + 10);
    doc
      .fillColor(MUTE)
      .fontSize(9)
      .font("Helvetica")
      .text(
        ["Clara, atendimento pelo WhatsApp", lead.phone ? String(lead.phone) : ""].filter(Boolean).join("   ·   "),
        L,
        yFooter + 24
      );
    doc
      .fillColor(MUTE)
      .fontSize(8.5)
      .font("Helvetica")
      .text(`Documento gerado em ${formatDateBr(agora)}`, R - 180, yFooter + 24, { width: 180, align: "right" });

    doc.end();
  });
}
