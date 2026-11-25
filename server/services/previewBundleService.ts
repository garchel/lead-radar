import * as esbuild from "esbuild";
import type { StoredLead } from "../store/types";

/**
 * Montagem da página com bibliotecas de verdade.
 *
 * O modelo não entrega mais "um HTML com CSS": ele entrega três blocos —
 * marcação, estilo e código — e o código pode importar bibliotecas instaladas no
 * projeto (`motion`, `three`). Aqui os imports são resolvidos e empacotados num
 * arquivo único, embutido na página. Nenhuma requisição externa, nenhum CDN.
 *
 * Não existe template de página: estrutura, texto, tipografia e movimento são
 * escritos pelo modelo. O que é fixo é só a ferramenta de empacotamento.
 */

export interface BlocosPagina {
  markup: string;
  css: string;
  js: string;
}

/** Bibliotecas disponíveis para o modelo importar. */
export const BIBLIOTECAS = ["motion", "three"] as const;

const LIMITE_JS = 900_000;
const ALERTA_JS = 450_000;

function pegarBloco(texto: string, linguagens: string[]): string {
  for (const lang of linguagens) {
    const re = new RegExp("```" + lang + "\\s*\\n([\\s\\S]*?)```", "i");
    const m = texto.match(re);
    if (m) return m[1].trim();
  }
  return "";
}

/**
 * Lê a resposta do modelo. Aceita o formato de três blocos; se vier um HTML
 * inteiro (formato antigo), devolve só a marcação e deixa css/js vazios.
 */
export function extrairBlocos(texto: string): BlocosPagina | null {
  const markup = pegarBloco(texto, ["html", "markup"]);
  const css = pegarBloco(texto, ["css"]);
  const js = pegarBloco(texto, ["js", "javascript", "ts"]);
  if (markup) return { markup, css, js };

  // Formato antigo: documento completo com <style> e talvez <script>.
  const doc = texto.match(/<!doctype html[\s\S]*<\/html>/i);
  if (!doc) return null;
  const corpo = doc[0];
  const estilo = (corpo.match(/<style[^>]*>([\s\S]*?)<\/style>/i) || [])[1] || "";
  const script = (corpo.match(/<script[^>]*>([\s\S]*?)<\/script>/i) || [])[1] || "";
  const semEstilo = corpo
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  const miolo = semEstilo.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return { markup: (miolo ? miolo[1] : semEstilo).trim(), css: estilo, js: script };
}

export interface ResultadoEmpacotamento {
  ok: boolean;
  js: string;
  bytes: number;
  erro?: string;
}

/** Resolve os imports e devolve um único arquivo executável no navegador. */
export async function empacotarJs(codigo: string): Promise<ResultadoEmpacotamento> {
  const fonte = String(codigo || "").trim();
  if (!fonte) return { ok: true, js: "", bytes: 0 };

  try {
    const saida = await esbuild.build({
      stdin: { contents: fonte, resolveDir: process.cwd(), loader: "js" },
      bundle: true,
      minify: true,
      format: "iife",
      target: "es2020",
      platform: "browser",
      legalComments: "none",
      write: false,
      logLevel: "silent",
    });
    const js = saida.outputFiles[0]?.text || "";
    const bytes = Buffer.byteLength(js, "utf8");
    if (bytes > LIMITE_JS) {
      return { ok: false, js: "", bytes, erro: `o JavaScript empacotado ficou com ${Math.round(bytes / 1024)} KB (limite 900 KB): use menos bibliotecas ou menos código` };
    }
    return { ok: true, js, bytes };
  } catch (erro: any) {
    // Erro do esbuild é o mesmo que o navegador daria: serve de feedback direto.
    const detalhe = String(erro?.message || erro)
      .split("\n")
      .filter((l) => l.trim())
      .slice(0, 6)
      .join(" | ");
    return { ok: false, js: "", bytes: 0, erro: `o JavaScript não compila: ${detalhe.slice(0, 400)}` };
  }
}

export function avisoDePeso(bytes: number): string | null {
  if (bytes > ALERTA_JS) {
    return `${Math.round(bytes / 1024)} KB de JavaScript: pesado para 4G (acima de 450 KB)`;
  }
  return null;
}

function escaparTitulo(valor: string): string {
  return String(valor || "Página").replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c] as string));
}

/**
 * Junta os três blocos num documento único. A marcação já vem com <header>,
 * <section>, <footer>: nada de layout imposto aqui.
 */
export function montarPagina(
  lead: StoredLead,
  blocos: BlocosPagina,
  jsEmpacotado: string,
  meta: { titulo?: string; descricao?: string } = {},
): string {
  const titulo = escaparTitulo(meta.titulo || `${lead.name}${lead.city ? ` — ${lead.city}` : ""}`);
  const descricao = escaparTitulo(meta.descricao || "").slice(0, 180);
  const partes = [
    "<!doctype html>",
    '<html lang="pt-BR">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${titulo}</title>`,
    descricao ? `<meta name="description" content="${descricao}">` : "",
    "<style>" + blocos.css + "</style>",
    "</head>",
    "<body>",
    blocos.markup,
    jsEmpacotado ? "<script>" + jsEmpacotado + "</script>" : "",
    "</body>",
    "</html>",
  ];
  return partes.filter(Boolean).join("\n");
}
