import PDFDocument from "pdfkit";
import { Project } from "../store/types";
import { getLeadById } from "../store/db";

/**
 * Termo de aprovação do wireframe.
 *
 * Gerado sob demanda quando o cliente dá o OK no wireframe (link de
 * visualização da etapa `wireframe` do Kanban). Serve como snapshot/registro
 * do que foi aprovado: URL do wireframe, checklist da etapa, e referências
 * ao copy + design que o compõem. Segue o mesmo padrão do PDF de briefing
 * (server/briefing/pdf.ts): gerado na hora, sem persistência em banco.
 */
export async function generateWireframeApprovalPdf(project: Project): Promise<Buffer> {
  const lead = getLeadById(project.leadId);
  const businessName = lead?.name ?? project.name;
  const date = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const wfUrl = project.wireframeUrl?.trim() || "(URL do wireframe não registrada)";
  const tasks = (project.tasks ?? []).filter((t) => t.stage === "wireframe");
  const done = tasks.filter((t) => t.done).length;
  const hasCopy = Boolean(project.copy?.trim());
  const hasDesign = Boolean(project.designNotes?.trim());

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 56 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(19).text("Termo de aprovação — Wireframe", { underline: true });
    doc.moveDown(0.6);
    doc.fontSize(11).fillColor("#444");
    doc.text(`Projeto: ${project.name}`);
    doc.text(`Cliente: ${businessName}`);
    doc.text(`Etapa atual: ${project.stage}`);
    doc.text(`Data da aprovação: ${date}`);
    doc.moveDown(0.8);
    doc.fillColor("#000").fontSize(13).text("Wireframe aprovado");
    doc.fontSize(11).fillColor("#444");
    doc.text(`URL: ${wfUrl}`);
    doc.text(`Checklist da etapa wireframe: ${done}/${tasks.length} itens concluídos`);
    for (const t of tasks) {
      doc.text(`  [${t.done ? "x" : " "}] ${t.title}`);
    }
    doc.moveDown(0.8);
    doc.fillColor("#000").fontSize(13).text("Base aprovada junto");
    doc.fontSize(11).fillColor("#444");
    doc.text(`Copy da página: ${hasCopy ? "presente no projeto" : "não registrada"}`);
    doc.text(`Notas de design: ${hasDesign ? "presentes no projeto" : "não registradas"}`);
    doc.moveDown(1.2);
    doc.fillColor("#000").fontSize(11).text("Ajustes posteriores a esta aprovação voltam para a etapa wireframe, não direto para o código.");
    doc.moveDown(2);
    doc.fillColor("#444").fontSize(11).text("Assinatura do cliente: ________________________________________");
    doc.moveDown(1);
    doc.text("Assinatura Lead Radar: ________________________________________");

    doc.end();
  });
}
