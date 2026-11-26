/**
 * Passa as capturas da amostra de referência pela MESMA rubrica que julga as
 * prévias geradas. Separa "está em lista de design" de "é bom de verdade".
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { getAiClient, modelosDeepSeek } from "../server/services/aiClient";
import { RUBRICA, extrairVeredito } from "../server/services/previewVisionService";

async function pontuar(png: string, contexto: string): Promise<{ nota: number; problemas: string[] } | null> {
  const ai = getAiClient();
  const dados = fs.readFileSync(png).toString("base64");
  const r = await (ai as any).models.generateContent({
    model: modelosDeepSeek()[0],
    contents: [{ role: "user", parts: [{ text: `${RUBRICA}\n\nPágina avaliada: ${contexto}` }, { inlineData: { mimeType: "image/png", data: dados } }] }],
  });
  const texto = String(r?.text ?? "");
  const veredito = extrairVeredito(texto);
  if (!veredito) console.log("   sem veredito:", texto.slice(0, 120));
  return veredito;
}

async function main() {
  const capturas = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
  const baseDir = path.dirname(path.resolve(process.argv[2]));
  const saida = process.argv[3] || "notas-referencia.json";
  const notas: any[] = [];
  for (const c of capturas) {
    if (!c.png) continue;
    c.png = path.join(baseDir, path.basename(c.png));
    const host = new URL(c.url).hostname.replace(/^www\./, "");
    let nota = null;
    try {
      nota = await pontuar(c.png, `${host} · clínica odontológica`);
    } catch (e: any) {
      console.log(`   erro em ${host}: ${e?.message || e}`);
    }
    notas.push({ url: c.url, nota: nota?.nota ?? null, problemas: nota?.problemas ?? [] });
    console.log(`${nota ? nota.nota : "-"}  ${host}`);
    fs.writeFileSync(saida, JSON.stringify(notas, null, 1));
  }
  const validas = notas.filter((n) => typeof n.nota === "number");
  if (validas.length) {
    const ord = validas.map((n) => n.nota).sort((a, b) => b - a);
    console.log(`\n${validas.length} avaliadas · maior ${ord[0]} · mediana ${ord[Math.floor(ord.length / 2)]} · menor ${ord[ord.length - 1]}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
