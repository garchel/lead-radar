/**
 * Aplica o prompt versionado (server/prompts/clara.md) no job da Clara.
 *
 * O prompt da Clara vive fora do repositório, no jobs.json do gateway Hermes. Isso
 * fazia cada ajuste de tom se perder: não havia histórico, não dava para revisar e
 * ninguém sabia qual versão estava no ar. Aqui o repositório é a fonte e este script
 * leva para o gateway, guardando backup.
 *
 * Uso:
 *   npx tsx tools/aplicar-prompt-clara.ts            # aplica
 *   npx tsx tools/aplicar-prompt-clara.ts --dry-run  # só mostra o diff de tamanho
 *
 * ATENÇÃO: o gateway mantém o job em memória. Depois de aplicar é preciso reiniciar
 * o app (ou o gateway) — pause/resume não recarrega o prompt.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const JOBS = path.join(os.homedir(), "AppData", "Local", "hermes", "cron", "jobs.json");
const PROMPT = path.resolve("server", "prompts", "clara.md");

function main() {
  const seco = process.argv.includes("--dry-run");
  if (!fs.existsSync(PROMPT)) throw new Error(`prompt não encontrado: ${PROMPT}`);
  const novo = fs.readFileSync(PROMPT, "utf8");

  const bruto = JSON.parse(fs.readFileSync(JOBS, "utf8"));
  const lista: any[] = Array.isArray(bruto) ? bruto : bruto.jobs || [];
  const clara = lista.find((j) => String(j?.name || "").includes("responder lead"));
  if (!clara) throw new Error("job 'WhatsApp: responder lead' não encontrado no jobs.json");

  const antes = String(clara.prompt || "").length;
  console.log(`antes: ${antes} chars · depois: ${novo.length} chars`);
  if (seco) return;

  const backup = `${JOBS}.bak-clara-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  fs.copyFileSync(JOBS, backup);
  clara.prompt = novo;
  fs.writeFileSync(JOBS, JSON.stringify(bruto, null, 2), "utf8");
  console.log(`aplicado. backup em ${backup}`);
  console.log("reinicie o gateway/app para o job recarregar o prompt (pause/resume não recarrega).");
}

main();
