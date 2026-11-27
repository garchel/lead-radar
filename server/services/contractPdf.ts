import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderizarHtml } from "./contractHtml";
import { documentoDoContrato, type DadosDoContrato } from "./contractService";

/**
 * Contrato em PDF, gerado no próprio servidor.
 *
 * O Assinafy aceita PDF, DOC, DOCX e ODT — não HTML. Então o caminho é: blocos do
 * contrato → HTML → Chrome headless → PDF. É o mesmo mecanismo que gerou
 * docs/contrato-vertice.pdf, agora dentro do app para não depender de passo manual.
 */

const CAMINHOS_CHROME = [
  process.env.CHROME_PATH || "",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/c/Program Files/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
];

export function acharChrome(): string | null {
  for (const caminho of CAMINHOS_CHROME) {
    if (caminho && existsSync(caminho)) return caminho;
  }
  return null;
}

export interface OpcoesPdf {
  marca?: string;
  titulo?: string;
  /** Injetado nos testes para não abrir navegador. */
  executar?: typeof execFileSync;
  chromePath?: string;
}

export function gerarPdfDoContrato(dados: DadosDoContrato, opts: OpcoesPdf = {}): Buffer {
  const html = renderizarHtml(documentoDoContrato(dados), { marca: opts.marca, titulo: opts.titulo });
  const chrome = opts.chromePath || acharChrome();
  if (!chrome) {
    throw new Error("Chrome não encontrado para gerar o PDF do contrato (defina CHROME_PATH).");
  }

  const pasta = mkdtempSync(join(tmpdir(), "contrato-"));
  const origem = join(pasta, "contrato.html");
  const destino = join(pasta, "contrato.pdf");
  try {
    writeFileSync(origem, html, "utf-8");
    const executar = opts.executar || execFileSync;
    executar(
      chrome,
      [
        "--headless",
        "--disable-gpu",
        "--no-sandbox",
        "--no-pdf-header-footer",
        `--print-to-pdf=${destino}`,
        `file:///${origem.replace(/\\/g, "/")}`,
      ],
      { stdio: "ignore", timeout: 90_000 },
    );
    if (!existsSync(destino)) throw new Error("Chrome não gerou o PDF do contrato.");
    return readFileSync(destino);
  } finally {
    try {
      rmSync(pasta, { recursive: true, force: true });
    } catch {
      /* pasta temporária: se não sair agora, sai na limpeza do sistema */
    }
  }
}
