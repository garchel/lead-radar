import PDFDocument from "pdfkit";
import type { Project } from "../store/types";

/**
 * Gera um PDF do briefing de um projeto, para validação formal do cliente.
 * Usa fonte padrão do PDFKit (WinAnsi/Latin-1), que cobre acentos do português.
 */
export async function generateBriefingPdf(project: Project): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 56, bottom: 56, left: 56, right: 56 },
      info: {
        Title: `Briefing — ${project.name}`,
        Author: "LeadRadar AI",
        Subject: "Briefing de projeto para validação",
      },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const violet = "#4f46e5";
    const slate = "#334155";
    const muted = "#64748b";
    const light = "#e2e8f0";

    doc.rect(0, 0, doc.page.width, 8).fill(violet);

    doc.fillColor(violet).fontSize(20).font("Helvetica-Bold").text("Briefing de Projeto", { continued: false });
    doc.moveDown(0.2);
    doc.fillColor(slate).fontSize(13).font("Helvetica-Bold").text(project.name || "Projeto sem nome");
    doc.moveDown(0.1);
    doc.fillColor(muted).fontSize(9.5).font("Helvetica").text(
      [
        project.leadName ? `Empresa: ${project.leadName}` : "",
        project.leadCity ? `Cidade: ${project.leadCity}` : "",
        `Gerado em: ${new Date().toLocaleString("pt-BR")}`,
      ]
        .filter(Boolean)
        .join("   •   ")
    );
    doc.moveDown(0.4);
    doc.moveTo(56, doc.y).lineTo(doc.page.width - 56, doc.y).strokeColor(light).lineWidth(1).stroke();
    doc.moveDown(0.5);

    const fields = project.briefing || [];
    if (fields.length === 0) {
      doc.fillColor(muted).fontSize(11).text(
        "Nenhuma resposta de briefing importada ainda. As respostas do Typeform aparecem aqui assim que forem sincronizadas para este card."
      );
    } else {
      for (const field of fields) {
        doc.fillColor(violet).fontSize(10.5).font("Helvetica-Bold").text(field.fieldTitle);
        doc.moveDown(0.1);
        doc.fillColor(slate).fontSize(10).font("Helvetica").text(field.answer || "(sem resposta)", {
          lineGap: 2,
        });
        doc.moveDown(0.5);
        if (doc.y > doc.page.height - 120) {
          doc.addPage();
          doc.rect(0, 0, doc.page.width, 8).fill(violet);
        }
      }
    }

    doc.moveDown(0.5);
    doc.moveTo(56, doc.y).lineTo(doc.page.width - 56, doc.y).strokeColor(light).lineWidth(1).stroke();
    doc.moveDown(0.5);
    doc.fillColor(muted).fontSize(8.5).text(
      "LeadRadar AI — documento gerado automaticamente para validação do briefing com o cliente.",
      { align: "center" }
    );

    doc.end();
  });
}