/**
 * Simulação A/B do pool de nicho na geração de página.
 *
 * Gera a MESMA página duas vezes para o mesmo lead — uma sem o bloco do pool
 * medido e outra com ele — e grava os dois HTMLs lado a lado. Tudo o mais fica
 * igual: mesmo modelo, mesmas tentativas, mesmo portão, mesmo juiz.
 *
 * Uso: npx tsx tools/simular-pool.ts <leadId>
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { getLeadById } from "../server/store/db";
import { gerarPaginaDoLead } from "../server/services/aiPreviewService";
import { blocoDoPool, nichoCatalogado } from "../server/services/nichoPoolService";

const leadId = process.argv[2];
if (!leadId) {
  console.error("uso: npx tsx tools/simular-pool.ts <leadId>");
  process.exit(1);
}

const lead = getLeadById(leadId);
if (!lead) {
  console.error(`lead ${leadId} não encontrado`);
  process.exit(1);
}

const nicho = nichoCatalogado(lead.name, lead.category);
const bloco = nicho ? blocoDoPool(lead.name, lead.category) : "";
const saida = path.join(process.env.LOCALAPPDATA || ".", "hermes", "cache", "scratch", "sim-pool");
fs.mkdirSync(saida, { recursive: true });

console.log(`lead: ${lead.name} (${lead.id}) · categoria ${lead.category ?? "—"}`);
console.log(`nicho catalogado: ${nicho ?? "NENHUM — o pool não entra nesta comparação"}`);
console.log(`bloco do pool: ${bloco.length} chars`);
if (nicho) {
  console.log("--- bloco injetado ---");
  console.log(bloco);
  console.log("----------------------");
}

const versoes: Array<{ rotulo: string; pool: boolean }> = [
  { rotulo: "sem-pool", pool: false },
  { rotulo: "com-pool", pool: true },
];

const resumo: Array<Record<string, unknown>> = [];

for (const v of versoes) {
  const inicio = Date.now();
  console.log(`\n=== gerando ${v.rotulo} ===`);
  const r = await gerarPaginaDoLead(lead, { pool: v.pool, timeoutMs: 180000 });
  const segundos = Math.round((Date.now() - inicio) / 1000);
  if (r.ok !== true) {
    console.log(`FALHOU (${segundos}s): ${r.motivo} ${r.erros.join("; ")}`);
    resumo.push({ versao: v.rotulo, ok: false, motivo: r.motivo, erros: r.erros, segundos });
    continue;
  }
  const arquivo = path.join(saida, `${leadId}-${v.rotulo}.html`);
  fs.writeFileSync(arquivo, r.pagina.html, "utf8");
  const info = {
    versao: v.rotulo,
    ok: true,
    arquivo,
    segundos,
    modelo: r.pagina.modelo,
    tentativas: r.pagina.tentativas,
    notaVisual: r.pagina.notaVisual,
    conceito: r.pagina.conceito,
    medidas: r.pagina.medidas,
    bytes: r.pagina.html.length,
  };
  console.log(JSON.stringify({ ...info, arquivo: path.basename(arquivo) }, null, 1));
  resumo.push(info);
}

const json = path.join(saida, `${leadId}-resumo.json`);
fs.writeFileSync(json, JSON.stringify({ lead: { id: lead.id, name: lead.name, category: lead.category }, nicho, bloco, resumo }, null, 2), "utf8");
console.log(`\nresumo: ${json}`);
