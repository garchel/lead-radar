import type { Bloco } from "./contractService";

/**
 * Renderizador HTML do contrato — A4, tipografia de documento.
 *
 * O texto vive em `contractService` (blocos); aqui só se desenha. Assim o contrato que
 * a Clara manda no WhatsApp e o PDF que o Paulo imprime saem do MESMO conteúdo: não
 * existe a versão "de impressão" que esqueceu uma cláusula.
 */

function esc(v: string): string {
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Marca negrito em **texto** e escapa o resto. */
function inline(v: string): string {
  const partes = String(v).split(/\*\*(.+?)\*\*/g);
  return partes
    .map((p, i) => (i % 2 === 1 ? `<strong>${esc(p)}</strong>` : esc(p)))
    .join("");
}

export function renderizarHtml(blocos: Bloco[], opts: { marca?: string; titulo?: string } = {}): string {
  const marca = opts.marca || "Vértice Páginas Web";
  const corpo: string[] = [];

  for (const b of blocos) {
    if (b.tipo === "titulo") {
      corpo.push(`<h2>${inline(b.texto)}</h2>`);
    } else if (b.tipo === "subtitulo") {
      corpo.push(`<h3>${inline(b.texto)}</h3>`);
    } else if (b.tipo === "paragrafo") {
      corpo.push(`<p>${inline(b.texto)}</p>`);
    } else if (b.tipo === "lista") {
      corpo.push(`<ul>${b.itens.map((i) => `<li>${inline(i)}</li>`).join("")}</ul>`);
    } else if (b.tipo === "tabela") {
      const cab = b.cabecalho.map((c) => `<th>${inline(c)}</th>`).join("");
      const linhas = b.linhas
        .map((l) => `<tr>${l.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`)
        .join("");
      corpo.push(`<table><thead><tr>${cab}</tr></thead><tbody>${linhas}</tbody></table>`);
    }
  }

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>${esc(opts.titulo || "Contrato")}</title>
<style>
  @page { size: A4; margin: 18mm 18mm 16mm 20mm; }
  * { box-sizing: border-box; }
  body { font-family: Georgia, "Times New Roman", serif; font-size: 10.2pt; line-height: 1.45; color: #16181d; margin: 0; padding: 0; }
  header.doc { border-bottom: 2px solid #16181d; padding-bottom: 9px; margin-bottom: 16px; }
  .marca { font-family: "Segoe UI", Arial, sans-serif; font-size: 9pt; letter-spacing: .16em; text-transform: uppercase; color: #5b6270; }
  header.doc h1 { font-size: 15pt; margin: 5px 0 2px; }
  header.doc .sub { font-family: "Segoe UI", Arial, sans-serif; font-size: 9pt; color: #5b6270; }
  h2 { font-family: "Segoe UI", Arial, sans-serif; font-size: 10pt; text-transform: uppercase; letter-spacing: .08em;
       margin: 15px 0 6px; padding-bottom: 3px; border-bottom: 1px solid #d6d9df; page-break-after: avoid; }
  h3 { font-family: "Segoe UI", Arial, sans-serif; font-size: 9.4pt; margin: 12px 0 4px; page-break-after: avoid; }
  p { margin: 0 0 7px; text-align: justify; }
  ul { margin: 0 0 9px; padding-left: 18px; }
  li { margin-bottom: 3px; text-align: justify; }
  table { width: 100%; border-collapse: collapse; font-family: "Segoe UI", Arial, sans-serif; font-size: 9pt; margin: 7px 0 10px; page-break-inside: avoid; }
  th, td { border: 1px solid #cfd3da; padding: 5px 8px; text-align: left; vertical-align: top; }
  th { background: #eef0f3; font-weight: 600; }
  tbody tr td:first-child { width: 30%; color: #40454f; }
</style>
</head>
<body>
<header class="doc">
  <div class="marca">${esc(marca)}</div>
  <h1>${esc(opts.titulo || "Contrato de criação e publicação de site")}</h1>
  <div class="sub">Documento gerado automaticamente · revise antes de enviar</div>
</header>
${corpo.join("\n")}
</body>
</html>`;
}
