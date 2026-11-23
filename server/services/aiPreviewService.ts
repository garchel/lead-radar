import type { StoredLead } from "../store/types";
import { chaveDeepSeek, getAiClient, modelosDeepSeek } from "./aiClient";
import { buildPreviewHtml, whatsappLink, writePreviewFiles, type PreviewResult } from "./previewService";
import { auditarPaginaMobile, auditoriaDisponivel, type MedidaViewport } from "./mobileAuditService";

/**
 * Gerador de página única por lead.
 *
 * Diferente de `previewTemplate` (um layout preenchido), aqui o modelo escreve a
 * página inteira: estrutura, tipografia, composição e movimento. O portão de
 * qualidade abaixo existe porque página gerada que chega quebrada no WhatsApp do
 * dono custa mais caro que um template honesto.
 */

const TAMANHO_MIN = 4_000;
const TAMANHO_MAX = 160_000;

export interface PaginaGerada {
  html: string;
  /** Como o modelo descreveu a direção de arte (vai para o log e para o painel). */
  conceito: string;
  modelo: string;
  tentativas: number;
  /** Erros do portão que foram corrigidos na segunda tentativa. */
  avisos: string[];
  /** Medidas de celular quando a auditoria rodou (360 e 390px). */
  medidas?: MedidaViewport[];
}

export interface FalhaGeracao {
  ok: false;
  motivo: string;
  erros: string[];
}

/* ------------------------------------------------------------------ */
/*  Direção de arte: semente estável por lead                          */
/* ------------------------------------------------------------------ */

const DIRECOES = [
  {
    nome: "editorial",
    brief:
      "Editorial de revista: título grande ocupando a largura, muito espaço em branco, tipografia com personalidade (serifada ou display), fio fino separando seções, uma faixa de cor cheia em um ponto só. Nada de card com sombra.",
  },
  {
    nome: "contraste",
    brief:
      "Bloco escuro dominante com tipografia clara e grande, cor de destaque em detalhes pequenos e precisos. Assimetria: conteúdo puxado para um lado, respiro no outro. Sensação de marca premium, sem luxo exagerado.",
  },
  {
    nome: "gesto",
    brief:
      "Composição com um elemento gráfico forte feito em SVG ou CSS (arco, recorte, linha que atravessa a página, forma orgânica) que amarra a identidade. Tipografia sans com bastante peso no título e texto curto.",
  },
  {
    nome: "calmo",
    brief:
      "Fundo em tom suave derivado da paleta, cartões sem borda dura, tipografia humanista, muito respiro vertical. Transmite cuidado e tranquilidade — combina com saúde, beleza e serviços pessoais.",
  },
  {
    nome: "direto",
    brief:
      "Estilo utilitário bem resolvido: hierarquia clara, blocos bem separados, informação escaneável, botão de WhatsApp sempre visível. Nada de enfeite que atrapalhe a leitura no celular.",
  },
  {
    nome: "textura",
    brief:
      "Textura sutil (grão, linhas finas, padrão geométrico discreto em SVG) sobre cor sólida, tipografia condensada no título, seções com numeração. Dá caráter sem depender de foto.",
  },
];

function semente(lead: StoredLead): number {
  const base = `${lead.id}|${lead.name}|${lead.city}`;
  let h = 0;
  for (let i = 0; i < base.length; i++) h = (h * 31 + base.charCodeAt(i)) >>> 0;
  return h;
}

export function direcaoDeArte(lead: StoredLead) {
  return DIRECOES[semente(lead) % DIRECOES.length];
}

/* ------------------------------------------------------------------ */
/*  Fatos reais: o modelo não pode inventar nada fora daqui            */
/* ------------------------------------------------------------------ */

function fatos(lead: StoredLead) {
  const marca: any = (lead as any).brandSnapshot || {};
  const paleta: Array<{ hex: string; role: string }> = Array.isArray(marca.palette) ? marca.palette : [];
  return {
    nome: lead.name,
    categoria: (lead as any).searchCategory || lead.category || "",
    cidade: lead.city,
    estado: lead.state,
    bairro: (lead as any).neighborhood || "",
    endereco: lead.address || "",
    nota: lead.rating ?? null,
    avaliacoes: lead.reviewsCount ?? null,
    telefone: lead.phone || "",
    whatsapp: whatsappLink((lead as any).dmPhone || lead.phone) || "",
    instagram: marca?.profiles?.instagram || "",
    paleta: paleta.map((p) => ({ hex: p.hex, papel: p.role })),
    tom: marca.tone || [],
    tipografia: marca.typography || null,
  };
}

function promptDeSistema(lead: StoredLead): string {
  const direcao = direcaoDeArte(lead);
  return `Você é diretor de arte e desenvolvedor front-end. Cria a página web de um negócio real, do zero, para ser enviada ao dono como prévia gratuita.

DIREÇÃO DE ARTE DESTA PÁGINA: ${direcao.nome.toUpperCase()}
${direcao.brief}

REGRAS DURAS (violar invalida a entrega):
1. Um único arquivo HTML completo, começando em <!doctype html>, com CSS embutido em <style>. JavaScript é permitido se servir à página, sempre embutido.
2. Nenhuma imagem externa. Não use <img src="http..."> nem background-image com URL remota. Use SVG, gradientes, formas e tipografia para criar o visual.
3. Fontes: no máximo duas, via Google Fonts (<link>), mais uma de sistema para o corpo se quiser.
4. Mobile-first de verdade: a página tem que ficar impecável em 360px de largura. Teste mentalmente cada bloco nessa largura.
5. WhatsApp: no máximo DOIS acessos na página inteira — um botão principal dentro do hero e um botão fixo no rodapé (só em telas pequenas). Nada de terceiro botão no topo competindo com o nome.
6. No celular os botões ficam empilhados e com largura total; nunca lado a lado abaixo de 480px. Área de toque mínima de 44px de altura.
7. Contraste AA em TODO texto, inclusive microtexto: se o fundo é escuro, o texto pequeno tem que ser claro de verdade (nada de cinza ou bege com opacidade baixa). Dá para conferir mentalmente: se parece apagado, está errado.
8. Reserva 96px de padding no fim da página para o botão fixo não cobrir conteúdo.
8b. Números de celular: corpo de texto 15 a 17px; rótulos em caixa alta no mínimo 12px; e TODO link ou botão precisa de área de toque de 44x44px (aumente o padding, não o texto). Link de telefone e de Instagram contam.
9. Use SOMENTE os fatos fornecidos. Proibido inventar preço, anos de experiência, prêmio, convênio, endereço, horário ou qualquer número. Se um dado não existe, escreva a seção sem ele.
10. Proibido "R$", nome de plano, emoji no texto da página, "lorem ipsum", placeholder entre colchetes e frases genéricas de agência ("soluções inovadoras", "transformamos sonhos").
11. NÃO REPITA informação: o nome do negócio aparece no máximo duas vezes na página inteira (cabeçalho e título); nota e número de avaliações aparecem UMA vez, num bloco só; a cidade aparece no máximo duas vezes.
12. Concordância e português corretos ("avaliações" no plural quando o número é maior que 1). Nada de linha órfã com uma palavra sozinha no fim do parágrafo.
13. A página precisa parecer feita para ESTE negócio: o texto fala da categoria e da cidade dele, a paleta vem da marca dele, e existe pelo menos UM elemento gráfico autoral em SVG (forma, recorte, marca d'água tipográfica) que não se repetiria em outra empresa.
14. Página enxuta: até 18 KB. Corte enfeite que não ajuda a ler nem a decidir.
15. NADA de conteúdo escondido esperando JavaScript. Se usar animação, ela precisa partir de um estado visível (@keyframes com animation-fill-mode), nunca deixar elemento em opacity:0 — sem JS a página tem que aparecer inteira.
16. Se numerar itens, a numeração começa em 01 e é sequencial.

ANTÍTESE DO GENÉRICO (evite o visual de página feita por IA):
- nada de gradiente roxo/azul;
- nada de três cartões idênticos com ícone redondo e sombra;
- nada de título centralizado seguido de subtítulo cinza e dois botões;
- nada de emoji como ícone de seção;
- a tipografia do título deve ter personalidade e tamanho grande.

ESTRUTURA MÍNIMA (pode reorganizar e nomear como quiser, mas o conteúdo precisa existir):
hero com nome e uma frase concreta · serviços ou o que o negócio faz · prova social usando nota e número de avaliações reais · onde fica e como falar · chamada final para o WhatsApp.

SAÍDA: apenas o HTML, sem cercas de código, sem comentário antes ou depois, sem explicação.`;
}

function promptDeUsuario(lead: StoredLead): string {
  return `DADOS REAIS DO NEGÓCIO (única fonte de verdade):
${JSON.stringify(fatos(lead), null, 2)}

Escreva a página agora.`;
}

/* ------------------------------------------------------------------ */
/*  Portão de qualidade                                                */
/* ------------------------------------------------------------------ */

/** Remove blocos @keyframes: eles PODEM ter opacity:0, o resto da página não. */
function semKeyframes(html: string): string {
  let saida = "";
  let i = 0;
  while (i < html.length) {
    const inicio = html.indexOf("@keyframes", i);
    if (inicio === -1) {
      saida += html.slice(i);
      break;
    }
    saida += html.slice(i, inicio);
    let j = html.indexOf("{", inicio);
    if (j === -1) break;
    let nivel = 0;
    for (; j < html.length; j++) {
      if (html[j] === "{") nivel++;
      else if (html[j] === "}") {
        nivel--;
        if (nivel === 0) {
          j++;
          break;
        }
      }
    }
    i = j;
  }
  return saida;
}

export interface VereditoPagina {
  criticos: string[];
  avisos: string[];
}

/**
 * Portão estático. `criticos` quebram a página (não publica); `avisos` são
 * polimento — viram dica para a próxima tentativa, mas não derrubam uma página
 * boa. Reprovar por aviso foi o que fez uma geração inteira cair no template.
 */
export function validarPagina(html: string, lead: StoredLead): VereditoPagina {
  const criticos: string[] = [];
  const avisos: string[] = [];
  const bruto = String(html || "");
  const minusculo = bruto.toLowerCase();

  if (bruto.length < TAMANHO_MIN) criticos.push(`página curta demais (${bruto.length} bytes)`);
  if (bruto.length > TAMANHO_MAX) avisos.push(`página grande (${bruto.length} bytes)`);
  if (!/^\s*<!doctype html/i.test(bruto)) criticos.push("não começa com <!doctype html>");
  if (!/<meta[^>]+name=["']viewport["']/i.test(bruto)) criticos.push("sem meta viewport (quebra no celular)");
  if (!/<style/i.test(bruto)) criticos.push("sem CSS embutido");

  const h1 = bruto.match(/<h1[^>]*>([\s\S]*?)<\/h1>/gi) || [];
  if (h1.length !== 1) criticos.push(`deve ter exatamente um <h1> (tem ${h1.length})`);

  const link = whatsappLink((lead as any).dmPhone || lead.phone);
  if (link && !bruto.includes(link)) criticos.push("não tem o botão de WhatsApp com o link do negócio");

  if (/<img[^>]+src=["']https?:/i.test(bruto)) criticos.push("usa imagem externa (proibido)");
  if (/background-image:\s*url\(\s*["']?https?:/i.test(bruto)) criticos.push("usa imagem de fundo externa (proibido)");
  if (/<script[^>]+src=["']https?:/i.test(bruto)) criticos.push("carrega script externo");
  if (/lorem ipsum/i.test(bruto)) criticos.push("contém lorem ipsum");
  if (/R\$\s*\d/.test(bruto)) criticos.push("cita preço (preço só na proposta)");
  // Só o HTML: dentro de <style> o fechamento de media query gera "}}" legítimo.
  const semEstilo = bruto.replace(/<style[\s\S]*?<\/style>/gi, " ");
  for (const token of ["{{", "undefined", "NaN"]) {
    if (semEstilo.includes(token)) criticos.push(`contém "${token}"`);
  }
  if (/\[[a-zà-ú ]{3,30}\]/i.test(bruto)) avisos.push("deixou placeholder entre colchetes");
  if (/solu[çc][õo]es inovadoras|transformamos sonhos|excelência em atendimento/i.test(minusculo)) {
    avisos.push("usa frase genérica de agência");
  }

  // Repetição e número de CTAs são questão de acabamento, não de funcionamento.
  const texto = bruto.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const nomeLimpo = String(lead.name || "").trim();
  if (nomeLimpo.length > 3) {
    const vezes = (texto.match(new RegExp(nomeLimpo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi")) || []).length;
    if (vezes > 4) avisos.push(`repete o nome ${vezes} vezes`);
  }
  const nota = lead.rating != null ? String(lead.rating).replace(".", ",") : "";
  if (nota) {
    const vezesNota = (texto.match(new RegExp(nota.replace(",", "[.,]"), "g")) || []).length;
    if (vezesNota > 3) avisos.push(`repete a nota ${vezesNota} vezes`);
  }

  const linksWhats = (bruto.match(/wa\.me\//g) || []).length;
  if (linksWhats === 0) criticos.push("nenhum link de WhatsApp");
  if (linksWhats > 2) avisos.push(`tem ${linksWhats} links de WhatsApp (o ideal é 2)`);

  // Conteúdo escondido por opacidade some quando o JS não roda (aconteceu: o item
  // 01 da lista nunca aparecia e a página ia para o cliente com a numeração torta).
  if (/opacity\s*:\s*0(?![.\d])/i.test(semKeyframes(bruto))) {
    criticos.push("esconde conteúdo com opacity:0 (some sem JS)");
  }

  return { criticos, avisos };
}

function limparCercas(texto: string): string {
  return String(texto || "")
    .replace(/^\s*```(?:html)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();
}

function conceitoDe(html: string): string {
  const titulo = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() || "";
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, "").trim() || "";
  return [titulo, h1].filter(Boolean).join(" · ").slice(0, 140);
}

/* ------------------------------------------------------------------ */
/*  Geração                                                            */
/* ------------------------------------------------------------------ */

export function iaDePaginaDisponivel(): boolean {
  return Boolean(chaveDeepSeek()) || Boolean(process.env.GEMINI_API_KEY);
}

/**
 * Gera a página. Devolve `{ ok: false }` quando o portão reprova duas vezes —
 * quem chamou decide cair no template fixo. Nunca devolve página suspeita.
 */
export async function gerarPaginaDoLead(lead: StoredLead, opts: { timeoutMs?: number } = {}): Promise<
  { ok: true; pagina: PaginaGerada } | FalhaGeracao
> {
  if (!iaDePaginaDisponivel()) return { ok: false, motivo: "sem chave de IA", erros: [] };

  const ai = getAiClient();
  const modelos = modelosDeepSeek().length ? modelosDeepSeek() : [process.env.GEMINI_MODEL || "gemini-flash-latest"];
  const timeoutMs = opts.timeoutMs ?? Number(process.env.PREVIEW_AI_TIMEOUT_MS || 90000);

  let errosAnteriores: string[] = [];
  let conceito = "";
  const avisos: string[] = [];

  for (let tentativa = 1; tentativa <= 2; tentativa++) {
    const correcao =
      tentativa === 1
        ? ""
        : `\n\nA tentativa anterior foi reprovada pelo portão de qualidade por: ${errosAnteriores.join("; ")}. Corrija exatamente isso e entregue a página completa de novo.`;

    for (const modelo of modelos) {
      try {
        const resposta = await ai.models.generateContent({
          model: modelo,
          contents: [{ role: "user", parts: [{ text: promptDeUsuario(lead) + correcao }] }],
          config: {
            systemInstruction: promptDeSistema(lead),
            temperature: 0.9,
            maxOutputTokens: 15000,
            reasoningEffort: "none",
            abortSignal: AbortSignal.timeout(timeoutMs),
          },
        });

        const html = limparCercas(resposta.text);
        const veredito = validarPagina(html, lead);
        const erros = [...veredito.criticos];
        const dicasEstaticas = [...veredito.avisos];

        // Portão estático passou: agora mede no navegador, do jeito que o lead vai
        // ver. Só publica página que se comporta em 360 e 390px de largura.
        let medidas: MedidaViewport[] | undefined;
        let dicasMobile: string[] = [];
        if (!erros.length && auditoriaDisponivel()) {
          const auditoria = await auditarPaginaMobile(html);
          medidas = auditoria.medidas;
          if (auditoria.pulada) {
            console.warn(`[previa-ia] auditoria pulada: ${auditoria.motivoPulada}`);
          }
          // Crítico quebra a página e reprova; o resto é polimento: vira dica na
          // próxima tentativa (sem reprovar, senão link de 40px derruba a página boa).
          if (!auditoria.ok) erros.push(...auditoria.criticos);
          dicasMobile = auditoria.avisos;
          if (dicasMobile.length) console.log(`[previa-ia] polimento mobile: ${dicasMobile.join("; ")}`);
        }

        if (!erros.length) {
          return {
            ok: true,
            pagina: {
              html,
              conceito: conceitoDe(html) || conceito,
              modelo: (resposta as any).modelVersion || modelo,
              tentativas: tentativa,
              avisos: [...avisos, ...dicasEstaticas, ...dicasMobile],
              medidas,
            },
          };
        }
        errosAnteriores = [...erros, ...dicasEstaticas, ...dicasMobile];
        console.warn(`[previa-ia] ${modelo} reprovado (tentativa ${tentativa}): ${errosAnteriores.join("; ")}`);
      } catch (err: any) {
        const msg = String(err?.message || err);
        errosAnteriores = [`falha na chamada: ${msg.slice(0, 160)}`];
        console.warn(`[previa-ia] ${modelo} falhou: ${msg.slice(0, 160)}`);
      }
    }
    avisos.push(...errosAnteriores);
  }

  return { ok: false, motivo: "portão reprovou a página nas duas tentativas", erros: errosAnteriores };
}

/* ------------------------------------------------------------------ */
/*  Geração + gravação + publicação                                    */
/* ------------------------------------------------------------------ */

export interface ResultadoPaginaUnica {
  preview: PreviewResult;
  /** "ia" quando a página veio do gerador; "template" quando caiu na reserva. */
  origem: "ia" | "template";
  modelo?: string;
  conceito?: string;
  tentativas?: number;
  medidas?: MedidaViewport[];
  motivoFallback?: string;
}

/**
 * Escreve a página do lead: IA quando passa no portão, template quando não.
 * Nunca lança por falha de IA — prévia é material de venda e precisa existir.
 */
export async function gerarPaginaUnica(
  lead: StoredLead,
  now = new Date(),
  opts: { timeoutMs?: number } = {},
): Promise<ResultadoPaginaUnica> {
  const gerada = await gerarPaginaDoLead(lead, opts);
  if (gerada.ok === true) {
    return {
      preview: writePreviewFiles(lead, gerada.pagina.html, now),
      origem: "ia",
      modelo: gerada.pagina.modelo,
      conceito: gerada.pagina.conceito,
      tentativas: gerada.pagina.tentativas,
      medidas: gerada.pagina.medidas,
    };
  }
  const falha: FalhaGeracao = gerada as FalhaGeracao;
  console.warn(`[previa-ia] caindo no template: ${falha.motivo} ${falha.erros.join("; ")}`);
  return {
    preview: writePreviewFiles(lead, buildPreviewHtml(lead, now), now),
    origem: "template",
    motivoFallback: `${falha.motivo}${falha.erros.length ? ` (${falha.erros.slice(0, 3).join("; ")})` : ""}`,
  };
}
