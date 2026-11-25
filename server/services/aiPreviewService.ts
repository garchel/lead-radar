import type { StoredLead } from "../store/types";
import { chaveDeepSeek, getAiClient, modelosDeepSeek } from "./aiClient";
import { buildPreviewHtml, whatsappLink, writePreviewFiles, type PreviewResult } from "./previewService";
import { auditarPaginaMobile, auditoriaDisponivel, type MedidaViewport } from "./mobileAuditService";
import { repararPagina } from "./previewRepair";
import { perfilCombinaComNegocio } from "./brandResearchService";
import { julgarPaginaVisualmente, juizVisualAtivo, notaMinima } from "./previewVisionService";
import { aprimorarPagina } from "./previewEnhance";
import { avisoDePeso, empacotarJs, extrairBlocos, montarPagina } from "./previewBundleService";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

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
  /** Nota do juiz visual (0 a 10) quando ele rodou. */
  notaVisual?: number;
}

export interface FalhaGeracao {
  ok: false;
  motivo: string;
  erros: string[];
}


/** Cores da marca para o shader (3 no máximo; completa com neutros). */
function coresParaShader(lead: StoredLead): string[] {
  const marca: any = (lead as any).brandSnapshot || {};
  const cores = Array.isArray(marca.palette)
    ? marca.palette.map((p: any) => String(p?.hex || "")).filter((h: string) => /^#[0-9a-f]{6}$/i.test(h))
    : [];
  const base = cores.slice(0, 3);
  while (base.length < 3) base.push(["#101418", "#d9d2c5", "#6b4f2a"][base.length]);
  return base;
}

/** DDD por estado (tabela enxuta, cobre o país inteiro). */
const DDD_UF: Record<string, string> = {
  "11": "SP", "12": "SP", "13": "SP", "14": "SP", "15": "SP", "16": "SP", "17": "SP", "18": "SP", "19": "SP",
  "21": "RJ", "22": "RJ", "24": "RJ", "27": "ES", "28": "ES",
  "31": "MG", "32": "MG", "33": "MG", "34": "MG", "35": "MG", "37": "MG", "38": "MG",
  "41": "PR", "42": "PR", "43": "PR", "44": "PR", "45": "PR", "46": "PR",
  "47": "SC", "48": "SC", "49": "SC",
  "51": "RS", "53": "RS", "54": "RS", "55": "RS",
  "61": "DF", "62": "GO", "64": "GO", "63": "TO", "65": "MT", "66": "MT", "67": "MS",
  "68": "AC", "69": "RO", "71": "BA", "73": "BA", "74": "BA", "75": "BA", "77": "BA",
  "79": "SE", "81": "PE", "87": "PE", "82": "AL", "83": "PB", "84": "RN", "85": "CE", "88": "CE",
  "86": "PI", "89": "PI", "91": "PA", "93": "PA", "94": "PA", "92": "AM", "97": "AM",
  "95": "RR", "96": "AP", "98": "MA", "99": "MA",
};

/**
 * Telefone com DDD de outro estado numa página local parece template comprado.
 * Quando o DDD não bate com o estado do negócio, a página não mostra o número
 * (o botão de WhatsApp continua, que é o que importa).
 */
function telefoneCombinaComEstado(telefone: string, estado?: string): boolean {
  const uf = String(estado || "").toUpperCase().trim();
  if (!uf) return true;
  const digitos = String(telefone || "").replace(/\D/g, "");
  if (digitos.length < 10) return true;
  const semPais = digitos.startsWith("55") && digitos.length > 11 ? digitos.slice(2) : digitos;
  const ddd = semPais.slice(0, 2);
  const esperado = DDD_UF[ddd];
  return !esperado || esperado === uf;
}

/* ------------------------------------------------------------------ */
/*  Direção de arte: semente estável por lead                          */
/* ------------------------------------------------------------------ */

/**
 * Direção de arte em EIXOS, não em parágrafo de clima.
 *
 * "Editorial, muito espaço em branco, tipografia com personalidade" é adjetivo:
 * cada lead recebe a mesma interpretação e as páginas convergem. Aqui cada eixo
 * tem opções com instrução técnica (medida, comportamento, o que é proibido), e a
 * combinação é escolhida por hash do negócio — nome + cidade.
 *
 * 4 × 4 × 4 × 3 × 4 × 3 = 2.304 combinações. Duas empresas quase nunca coincidem,
 * e a mesma empresa sempre recebe a mesma direção.
 */
interface Opcao { nome: string; instrucao: string }

const EIXO_COMPOSICAO: Opcao[] = [
  { nome: "assimétrico", instrucao: "Hero em duas áreas desiguais (7/5 no desktop): título e CTA de um lado, painel de cor sólida do outro. No celular empilha, texto primeiro. Nada centralizado." },
  { nome: "tipográfico", instrucao: "Hero tipográfico puro: título ocupando 90% da largura em 2 ou 3 linhas, alinhado à esquerda, com respiro embaixo. Sem imagem, sem cartão, sem badge." },
  { nome: "faixa-cheia", instrucao: "Primeiro bloco em cor cheia de ponta a ponta, com o título dentro dele e o resto da página em fundo claro. Contraste de faixa, não de cartão." },
  { nome: "recorte", instrucao: "Composição com um recorte diagonal ou arco em SVG que atravessa a divisa entre dois blocos, amarrando hero e conteúdo. O recorte é estrutural, não enfeite." },
];

const EIXO_TIPOGRAFIA: Opcao[] = [
  { nome: "editorial", instrucao: "Display serifada de alto contraste no título (peso 500, não 700), corpo em sans humanista 16px. Título em caixa alta só na primeira palavra. Entrelinha do título 1,02." },
  { nome: "geométrica", instrucao: "Sans geométrica com peso 600 no título, entrelinha 1,1, letter-spacing -0,02em. Corpo na mesma família em 16px/1,6. Sem serifada em lugar nenhum." },
  { nome: "condensada", instrucao: "Família condensada ou com letter-spacing negativo no título, ocupando 4 linhas curtas (nunca uma linha longa). Corpo em sans neutra. Números grandes para nota e contagem." },
  { nome: "mista", instrucao: "Serifada só no título principal e nas citações; todo o resto em sans. O contraste entre as duas é o que dá caráter — use-o em no máximo 2 pontos da página." },
];

const EIXO_COR: Opcao[] = [
  { nome: "monocromático", instrucao: "Um tom só da paleta em três intensidades (fundo, texto, detalhe). A cor de destaque aparece em no máximo 3 elementos na página inteira." },
  { nome: "duotone", instrucao: "Dois tons da paleta em contraste direto: um domina fundos, o outro só texto e detalhe. Nunca os dois no mesmo bloco com o mesmo peso." },
  { nome: "neutro-acento", instrucao: "Fundo neutro (creme, areia, cinza claro), texto quase preto e a cor da marca reservada para o botão e um único detalhe gráfico por seção." },
  { nome: "escuro", instrucao: "Fundo escuro com texto claro, cor de destaque em elementos pequenos e precisos. Texto de apoio nunca em cinza translúcido: use cor sólida com contraste 4,5:1." },
];

const EIXO_MOVIMENTO: Opcao[] = [
  { nome: "seco", instrucao: "Revelação curta (0,35s, ease-out) subindo 12px, escalonada por bloco. Sem parallax, sem shader. O movimento serve à leitura, não chama atenção." },
  { nome: "fluido", instrucao: "Revelação de 0,7s com mola leve no título palavra por palavra, parallax de 12px na imagem e barra de progresso no topo. Nada além disso." },
  { nome: "ambiente", instrucao: "Fundo WebGL lento (shader com as cores da marca) atrás do hero, revelação discreta no resto. O fundo respira em 30-60s, nunca pisca." },
];

const EIXO_DETALHE: Opcao[] = [
  { nome: "fio-e-numero", instrucao: "Fios de 1px separando blocos e lista numerada 01-04 em corpo 12px, caixa alta, letter-spacing 0,12em. Nenhum card com sombra." },
  { nome: "grão", instrucao: "Textura de grão fina (SVG feTurbulence, opacidade 0,15) sobre a cor de fundo, e nenhuma borda em cartão. O grão é o único ornamento." },
  { nome: "forma-recortada", instrucao: "Uma forma orgânica em SVG (arco, meia-lua, recorte) repetida em escala diferente em 2 pontos da página, como assinatura visual do negócio." },
  { nome: "marca-dagua", instrucao: "O nome do negócio em tipografia enorme (clamp 80-160px) como marca d'água de baixo contraste atrás de um bloco, cortada pelas bordas. Só um ponto da página." },
];

const EIXO_DENSIDADE: Opcao[] = [
  { nome: "arejada", instrucao: "72px entre seções no desktop, 56px no celular, e no máximo 3 blocos de conteúdo por tela de celular." },
  { nome: "compacta", instrucao: "48px entre seções no desktop, 40px no celular, com fios separando tudo. Informação densa e escaneável, sem parecer apertada." },
  { nome: "editorial", instrucao: "Alterna blocos muito arejados (96px) com blocos densos de texto curto. O contraste de respiro é a composição." },
];

const EIXOS = [EIXO_COMPOSICAO, EIXO_TIPOGRAFIA, EIXO_COR, EIXO_MOVIMENTO, EIXO_DETALHE, EIXO_DENSIDADE];
const NOMES_EIXOS = ["Composição", "Tipografia", "Cor", "Movimento", "Detalhe autoral", "Densidade"];

export interface DirecaoDeArte {
  nome: string;
  brief: string;
  eixos: Array<{ eixo: string; opcao: string }>;
}

/** Parâmetros que valem para TODA página, independentes da direção. */
export const PARAMETROS_DE_QUALIDADE = [
  "Linha de texto entre 60 e 72 caracteres: acima disso o olho perde a linha.",
  "Escala tipográfica com razão de 1,25 entre níveis; no máximo 4 tamanhos visíveis.",
  "Contraste mínimo 4,5:1 no corpo e 3:1 em título grande. Nenhum texto em cinza translúcido.",
  "Uma cor de destaque por área visível: se o botão é de destaque, o título não é.",
  "Um único <h1>. Seções com <h2>. Nunca pular nível.",
  "Alvo de toque de 44x44px em todo link e botão.",
  "Nenhum bloco começa invisível: se houver animação, ela parte do estado visível.",
  "No máximo 2 famílias tipográficas e 1 peso extra.",
  "Nenhuma imagem de fora: arte é SVG, canvas ou tipografia.",
  "O primeiro bloco responde em 2 segundos: o que o negócio faz e onde fica.",
];

function direcaoPorSemente(lead: StoredLead): DirecaoDeArte {
  let h = 0;
  const base = `${lead.name}|${lead.city}|${lead.state}`;
  for (const ch of base) h = (h * 31 + ch.charCodeAt(0)) % 1_000_003;
  const escolhidas = EIXOS.map((opcoes, i) => {
    const indice = Math.floor(h / Math.pow(7, i)) % opcoes.length;
    return { eixo: NOMES_EIXOS[i], opcao: opcoes[indice].nome, instrucao: opcoes[indice].instrucao };
  });
  const nome = escolhidas.slice(0, 3).map((e) => e.opcao).join(" · ");
  const brief = escolhidas.map((e) => `${e.eixo}: ${e.instrucao}`).join("\n");
  return { nome, brief, eixos: escolhidas.map((e) => ({ eixo: e.eixo, opcao: e.opcao })) };
}

function semente(lead: StoredLead): number {
  const base = `${lead.id}|${lead.name}|${lead.city}`;
  let h = 0;
  for (let i = 0; i < base.length; i++) h = (h * 31 + base.charCodeAt(i)) >>> 0;
  return h;
}

export function direcaoDeArte(lead: StoredLead): DirecaoDeArte {
  return direcaoPorSemente(lead);
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
    // Número de outro DDD numa página local passa impressão de template.
    telefone: telefoneCombinaComEstado(lead.phone || "", lead.state) ? lead.phone || "" : "",
    whatsapp: whatsappLink((lead as any).dmPhone || lead.phone) || "",
    // Perfil só entra se combinar com o nome: snapshots antigos guardaram o @ de
    // outra clínica e a página saía com o Instagram errado.
    instagram: (() => {
      const perfil = marca?.profiles?.instagram || "";
      if (!perfil) return "";
      return perfilCombinaComNegocio(perfil, lead.name) ? perfil : "";
    })(),
    paleta: paleta.map((p) => ({ hex: p.hex, papel: p.role })),
    tom: marca.tone || [],
    tipografia: marca.typography || null,
  };
}

function promptDeSistema(lead: StoredLead): string {
  const direcao = direcaoDeArte(lead);
  return `Você é diretor de arte e desenvolvedor front-end. Cria a página web de um negócio real, do zero, para ser enviada ao dono como prévia gratuita.

DIREÇÃO DE ARTE DESTA PÁGINA (gerada para este negócio — siga os seis eixos, não invente outros):
${direcao.brief}

PARÂMETROS DE QUALIDADE (valem para toda página e o portão confere):
${PARAMETROS_DE_QUALIDADE.map((p) => `- ${p}`).join("\n")}

REGRAS DURAS (violar invalida a entrega):
1. FORMATO DA ENTREGA: exatamente três blocos de código, nesta ordem, cada um com sua cerca:
\`\`\`html
(marcação do <body>: header, seções, footer, sem <html>, <head>, <style> ou <script>)
\`\`\`
\`\`\`css
(o CSS inteiro)
\`\`\`
\`\`\`js
(um módulo ES; pode importar bibliotecas)
\`\`\`

1b. BIBLIOTECAS DISPONÍVEIS (já instaladas, empacotadas junto com a página, sem CDN):
   - motion: import { animate, scroll, inView, stagger, spring, transform } from "motion". Anima e amarra valor ao progresso da rolagem. scroll() liga um valor à rolagem; inView() dispara quando o elemento entra na tela; animate() aceita keyframes em array; stagger() escalona vários elementos.
   - three: import * as THREE from "three". WebGL de verdade: cena, câmera, malha, material, luz, shader, pós-processamento simples.
   Use com critério: three custa cerca de 580 KB empacotado; motion, cerca de 70 KB. Página acima de 900 KB é reprovada. Se a ideia não precisa de 3D, resolva em CSS/SVG com motion.

1c. O JavaScript precisa rodar SEM erro na primeira execução. Não invente função que não existe, não use API de React, não importe nada além das bibliotecas acima. Prefira motion a escrever animação na mão.

2. Nenhuma imagem externa. Não use <img src="http..."> nem background-image com URL remota. Arte é SVG, canvas/WebGL, gradiente, forma e tipografia.
3. Fontes: no máximo duas, via Google Fonts (<link> permitido apenas para fonte), mais uma de sistema para o corpo se quiser.

3b. O CONTEÚDO NUNCA DEPENDE DO JAVASCRIPT PARA EXISTIR. Nada de "opacity:0" no CSS esperando a animação revelar: se o JS falhar, o texto tem que estar visível. Anime SEMPRE a partir do estado visível (o JS esconde e revela em milissegundos, o CSS não esconde nada).
4. Mobile-first de verdade: a página tem que ficar impecável em 360px de largura. Teste mentalmente cada bloco nessa largura.
4b. Mas NÃO é uma página de celular: no computador ela ocupa a tela. O container é fluido e chega a 1120px em telas largas (nunca limite a menos de 900px) e, a partir de @media (min-width: 900px), a composição muda: hero em duas colunas, lista de serviços em grade, seções com largura total. Página com coluna estreita e sobra de espaço branco nas laterais é proibida.
5. WhatsApp: EXATAMENTE DOIS acessos na página inteira, com o MESMO rótulo curto (ex: "Falar no WhatsApp") — um no hero e um no fim. Rótulos diferentes para a mesma ação passam impressão de página montada às pressas.
5b. Nada de botão flutuando em cima de ilustração ou de imagem: o botão fica no fluxo, com respiro antes e depois.
6. No celular os botões ficam empilhados e com largura total; nunca lado a lado abaixo de 480px. Área de toque mínima de 44px de altura.
7. Contraste AA em TODO texto, inclusive microtexto: se o fundo é escuro, o texto pequeno tem que ser claro de verdade (nada de cinza ou bege com opacidade baixa). Dá para conferir mentalmente: se parece apagado, está errado.
8. Reserva 96px de padding no fim da página para o botão fixo não cobrir conteúdo.
8b. Números de celular: corpo de texto 15 a 17px; rótulos em caixa alta no mínimo 12px; e TODO link ou botão precisa de área de toque de 44x44px (aumente o padding, não o texto). Link de telefone e de Instagram contam.
9. Use SOMENTE os fatos fornecidos. Proibido inventar preço, anos de experiência, prêmio, convênio, endereço, horário ou qualquer número. Se um dado não existe, escreva a seção sem ele.
10. Proibido "R$", nome de plano, emoji no texto da página, "lorem ipsum", placeholder entre colchetes e frases genéricas de agência ("soluções inovadoras", "transformamos sonhos").
11. NÃO REPITA informação: o nome do negócio aparece no máximo duas vezes na página inteira (cabeçalho e título); nota e número de avaliações aparecem UMA vez, num bloco só; a cidade aparece no máximo duas vezes.
12. Concordância e português corretos ("avaliações" no plural quando o número é maior que 1). Nada de linha órfã com uma palavra sozinha no fim do parágrafo.
13. A página precisa parecer feita para ESTE negócio: o texto fala da categoria e da cidade dele, a paleta vem da marca dele, e existe pelo menos UM elemento gráfico autoral em SVG (forma, recorte, marca d'água tipográfica) que não se repetiria em outra empresa.
13b. NADA DE ILUSTRAÇÃO. Proibido desenhar casas, prédios, pessoas, plantas, sol, objetos ou qualquer cena figurativa — inclusive em SVG. Clip-art destrói a percepção de qualidade.

13c. No lugar de ilustração, marque ONDE A FOTO VAI ENTRAR. Cada espaço de imagem é um bloco assim:
  <figure class="media-slot" data-slot="hero" aria-label="Espaço reservado para foto do projeto">
    ... (fundo em tom suave da paleta, proporção fixa via aspect-ratio, um ícone de imagem simples e discreto em SVG, e uma legenda curta em texto pequeno)
  </figure>
  Regras do espaço reservado: proporção definida (16/9, 4/3 ou 3/4), canto suave, fundo levemente tingido com a cor da marca, legenda curta do tipo "Espaço para foto do projeto" ou "Foto do espaço", e um ícone de moldura/imagem desenhado com 2 ou 3 traços. Ele precisa parecer intencional e elegante, nunca um retângulo cinza de erro.
13d. Use 1 ou 2 espaços reservados, NUNCA como o primeiro bloco depois do título. O hero é tipográfico; o espaço de imagem entra depois de uma seção de conteúdo (serviços, prova social) ou antes do CTA final, e ocupa no máximo 40% da altura da tela.
13c. Cor de destaque nunca em texto pequeno sobre fundo claro: use a cor da marca em fundo escuro ou em elementos grandes.
14. Página enxuta: até 18 KB e no máximo 2.800px de altura no celular. Corte enfeite que não ajuda a ler nem a decidir: cada bloco precisa justificar o espaço que ocupa.
15. NADA de conteúdo escondido esperando JavaScript. Se usar animação, ela precisa partir de um estado visível (@keyframes com animation-fill-mode), nunca deixar elemento em opacity:0 — sem JS a página tem que aparecer inteira.
16. Se numerar itens, a numeração começa em 01 e é sequencial.

ANTÍTESE DO GENÉRICO (evite o visual de página feita por IA):
- nada de gradiente roxo/azul;
- nada de três cartões idênticos com ícone redondo e sombra;
- nada de título centralizado seguido de subtítulo cinza e dois botões;
- nada de emoji como ícone de seção;
- a tipografia do título deve ter personalidade e tamanho grande.

8b. O <h1> diz O QUE É e ONDE: precisa conter o tipo de negócio (barbearia,
   clínica, arquiteto, restaurante…) ou a cidade. Frase poética é subtítulo, nunca
   título principal. "Corte feito com calma" não serve como h1; "Barbearia no Centro
   de Linhares" serve, com a frase poética logo abaixo.
8c. Sem foto do cliente, a página tem que parecer pronta. Se precisar de um espaço
   para a foto que ele vai mandar, ele é DISCRETO: uma faixa fina (máximo 180px de
   altura) com ícone e a frase "Foto do espaço" ou "Foto do trabalho" — nunca um
   retângulo grande, nunca na primeira dobra, nunca o elemento mais visível.
   O resto do visual se resolve com cor, padrão em CSS/SVG e tipografia.
8d. Proibido enfileirar três cards idênticos numerados 01/02/03. Serviços podem ser
   lista com fio entre itens, tabela de duas colunas ou blocos de tamanhos diferentes.
8e. O subtítulo do hero não repete o título com outras palavras: ele acrescenta
   informação (o que acontece no atendimento, o diferencial, o tempo médio).

9. ESCALA FIXA (não invente tamanhos soltos; use esta escada):
   - título principal: clamp(30px, 7vw, 56px), entrelinha 1,05, espaçamento entre letras -0,02em
   - título de seção: clamp(22px, 4vw, 34px), entrelinha 1,15
   - subtítulo de apoio: 17px, entrelinha 1,5
   - corpo: 16px, entrelinha 1,6
   - rótulo caixa-alta: 12px, letter-spacing 0,12em, peso 600
   - Nada abaixo de 13px. Nada de 6 tamanhos diferentes de título.
10. RITMO VERTICAL: seções com padding de 56px em cima e embaixo no celular (72px no
   desktop). Espaço entre título e texto: 16px. Entre texto e botão: 24px. Os
   intervalos vêm da mesma escada — 8, 16, 24, 32, 48, 56, 72 —, não de valores
   aleatórios como 13px ou 37px.
11. CONTRASTE: texto de corpo precisa de 4,5:1 com o fundo; título grande, 3:1. Se a
   paleta é clara, escureça o texto em vez de confiar em cinza médio sobre creme.

ESTRUTURA MÍNIMA (pode reorganizar e nomear como quiser, mas o conteúdo precisa existir):
hero com nome e uma frase concreta · serviços ou o que o negócio faz · prova social usando nota e número de avaliações reais · onde fica e como falar · chamada final para o WhatsApp.

SAÍDA: apenas o HTML, sem cercas de código, sem comentário antes ou depois, sem explicação.`;
}

function promptDeUsuario(lead: StoredLead): string {
  return `DADOS REAIS DO NEGÓCIO (única fonte de verdade):
${JSON.stringify(fatos(lead), null, 2)}

Escreva a página agora, nos três blocos (html, css, js). Nada antes, nada depois.`;
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
    // Nota grande + estrelas + "nota 5" repetem o MESMO dado três vezes.
    const vezesNota = (texto.match(new RegExp(nota.replace(",", "[.,]"), "g")) || []).length;
    if (vezesNota > 2) avisos.push(`repete a nota ${vezesNota} vezes (mostre uma vez só)`);
  }

  // Erro de grafia em palavra do próprio negócio ("barberia" no lugar de "barbearia")
  // saiu numa página publicada e destrói a credibilidade na hora.
  // Um h1 puramente poético ("Corte feito com calma") não diz o que o negócio faz
  // nem onde fica — péssimo para quem chega de fora e para o Google.
  const h1Bruto = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const h1Texto = normalizarTexto(String(h1Bruto?.[1] || "").replace(/<[^>]+>/g, " "));
  if (h1Texto) {
    const pistas = [lead.city, lead.state, (lead as any).searchCategory, lead.category, lead.name]
      .filter(Boolean)
      .join(" ");
    const palavras = normalizarTexto(pistas)
      .split(/[^a-z0-9]+/)
      .filter((p) => p.length >= 4);
    const dizOQueE = palavras.some((p) => h1Texto.includes(p));
    if (!dizOQueE) criticos.push("o <h1> não diz o que o negócio faz nem onde fica");
  }

  const errosDeGrafia = grafiasErradas(texto);
  if (errosDeGrafia.length) criticos.push(`palavra escrita errada: ${errosDeGrafia.join(", ")}`);

  const linksWhats = (bruto.match(/wa\.me\//g) || []).length;
  if (linksWhats === 0) criticos.push("nenhum link de WhatsApp");
  if (linksWhats > 2) avisos.push(`tem ${linksWhats} links de WhatsApp (o ideal é 2)`);

  // Espaço reservado deixou de ser obrigatório: moldura vazia na primeira dobra
  // derrubava a nota visual de toda página sem foto. Quando o cliente manda a
  // imagem, o serviço de mídia insere a figura na seção certa.

  // Conteúdo escondido por opacidade some quando o JS não roda (aconteceu: o item
  // 01 da lista nunca aparecia e a página ia para o cliente com a numeração torta).
  if (/opacity\s*:\s*0(?![.\d])/i.test(semKeyframes(bruto))) {
    criticos.push("esconde conteúdo com opacity:0 (some sem JS)");
  }

  return { criticos, avisos };
}

/**
 * Grafia errada da própria categoria ("barberia" no lugar de "barbearia") já foi
 * publicada e destrói a credibilidade na hora. Lista curta e explícita de erros
 * conhecidos — heurística de distância de edição marcava plural e feminino como
 * erro ("barbearias" x "barbearia"), então foi descartada.
 */
function normalizarTexto(v: string): string {
  return String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

const GRAFIAS_ERRADAS: Record<string, string> = {
  barberia: "barbearia",
  barberaria: "barbearia",
  barbeariia: "barbearia",
  odontológia: "odontologia",
  odondologia: "odontologia",
  estettic: "estética",
  estetíca: "estética",
  fisioterapiaa: "fisioterapia",
};

function grafiasErradas(texto: string): string[] {
  const alvo = String(texto || "").toLowerCase();
  return Object.entries(GRAFIAS_ERRADAS)
    .filter(([errada]) => new RegExp(`\\b${errada}\\b`, "i").test(alvo))
    .map(([errada, certa]) => `${errada} (deveria ser ${certa})`);
}

function limparCercas(texto: string): string {
  return String(texto || "")
    .replace(/^\s*```(?:html)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();
}

function conceitoDe(html: string): string {
  const limpa = (v: string) => String(v || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const titulo = limpa(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
  const h1 = limpa(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || "");
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
  const avisos: string[] = [];
  const tentativas = Math.max(1, Number(process.env.PREVIEW_AI_ATTEMPTS || 4));

  // Toda tentativa aprovada no portão técnico vira candidata. Quem escolhe é a
  // nota do juiz visual — antes, a primeira que passava nos testes era publicada,
  // mesmo quando era feia.
  interface Candidata {
    html: string;
    criticos: string[];
    medidas?: MedidaViewport[];
    modelo: string;
    tentativa: number;
    notaVisual: number;
    dicas: string[];
  }
  const candidatas: Candidata[] = [];

  for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
    const correcao =
      tentativa === 1
        ? ""
        : `\n\nA tentativa anterior foi reprovada por: ${errosAnteriores.join("; ")}. Corrija exatamente isso e entregue a página completa de novo.`;

    for (const modelo of modelos) {
      try {
        const resposta = await ai.models.generateContent({
          model: modelo,
          contents: [{ role: "user", parts: [{ text: promptDeUsuario(lead) + correcao }] }],
          config: {
            systemInstruction: promptDeSistema(lead),
            temperature: 0.9,
            maxOutputTokens: 24000,
            reasoningEffort: "none",
            abortSignal: AbortSignal.timeout(timeoutMs),
          },
        });

        // Reparo determinístico ANTES de julgar: alvo de toque, fonte miúda,
        // transbordo e rodapé atrás da barra fixa têm conserto em CSS. Antes, cada
        // detalhe desses custava uma geração inteira e, na segunda, o template.
        // O modelo entrega três blocos (marcação, CSS, JS). O JS pode importar
        // `motion` e `three`: o esbuild resolve e empacota tudo num arquivo só,
        // sem CDN e sem requisição externa.
        const textoResposta = String(resposta.text || "");
        const blocos = extrairBlocos(textoResposta);
        const errosDeBuild: string[] = [];
        const dicasEstaticasExtra: string[] = [];
        const correcoes: string[] = [];

        let html: string;
        let jsEmpacotado = "";
        if (blocos && blocos.markup) {
          const empacotado = await empacotarJs(blocos.js);
          if (!empacotado.ok) {
            errosDeBuild.push(empacotado.erro || "o JavaScript não compila");
          } else {
            jsEmpacotado = empacotado.js;
            if (empacotado.bytes > 0) {
              correcoes.push(`bibliotecas empacotadas (${Math.round(empacotado.bytes / 1024)} KB)`);
              const avisoPeso = avisoDePeso(empacotado.bytes);
              if (avisoPeso) errosDeBuild.push(avisoPeso);
            }
          }
          html = montarPagina(lead, { markup: blocos.markup, css: blocos.css, js: "" }, "");
          if (!blocos.js.trim()) {
            // Sem bloco JS a página sai estática: avisa o modelo na próxima
            // tentativa em vez de aceitar calado.
            console.warn("[previa-ia] resposta sem bloco js — página sai sem movimento");
          }
          console.log(
            `[previa-ia] blocos: markup ${blocos.markup.length}b, css ${blocos.css.length}b, js ${blocos.js.length}b`,
          );
          if (!blocos.js.trim()) {
            dicasEstaticasExtra.push("faltou o bloco js: entregue marcação, css e js separados, com movimento usando motion");
          }
        } else {
          html = limparCercas(textoResposta);
        }

        // O reparador mexe em CSS e marcação: roda antes de colar o bundle,
        // senão ele "conserta" texto dentro do JavaScript minificado.
        const reparo = repararPagina(html, errosAnteriores);
        html = reparo.html;
        correcoes.push(...reparo.reparos.map((r) => `${r.problema} → ${r.correcao}`));

        // O portão vê a página ANTES do bundle: dentro do JavaScript minificado
        // existem "NaN", "5.0" e "opacity:0" legítimos, e eles já reprovaram
        // página boa (nota repetida 51 vezes era o bundle, não o conteúdo).
        const veredito = validarPagina(html, lead);
        const criticos = [...veredito.criticos, ...errosDeBuild];
        const dicasEstaticas = [...veredito.avisos];

        if (jsEmpacotado) {
          html = html.replace(/<\/body>/i, `<script>${jsEmpacotado}</script>\n</body>`);
        }

        const fase = Number(process.env.PREVIEW_ENHANCE_PHASE ?? 0) as 1 | 2 | 3 | 0;
        if (!criticos.length && fase > 0 && !/fx-canvas/.test(html)) {
          const aprimorada = aprimorarPagina(html, { fase: fase as 1 | 2 | 3, cores: coresParaShader(lead) });
          if (aprimorada.features.length) {
            html = aprimorada.html;
            correcoes.push(`movimento → ${aprimorada.features.join(", ")}`);
          }
        }

        // O print precisa sair da MESMA execução do Chrome que mede a página.
        const printPath = juizVisualAtivo()
          ? path.join(os.tmpdir(), `previa-juiz-${Date.now()}-${tentativa}.png`)
          : undefined;

        let medidas: MedidaViewport[] | undefined;
        let dicasMobile: string[] = [];
        if (!criticos.length && auditoriaDisponivel()) {
          const auditoria = await auditarPaginaMobile(html, printPath ? { print: printPath } : {});
          medidas = auditoria.medidas;
          if (auditoria.pulada) {
            console.warn(`[previa-ia] auditoria pulada: ${auditoria.motivoPulada}`);
          }

          if (!auditoria.ok) {
            // Segunda chance no reparo, agora com os problemas MEDIDOS.
            const segundo = repararPagina(html, auditoria.criticos);
            if (segundo.reparos.length) {
              const reauditoria = await auditarPaginaMobile(segundo.html, printPath ? { print: printPath } : {});
              if (reauditoria.ok) {
                html = segundo.html;
                medidas = reauditoria.medidas;
                correcoes.push(...segundo.reparos.map((r) => `${r.problema} → ${r.correcao}`));
                dicasMobile = reauditoria.avisos;
              } else {
                criticos.push(...reauditoria.criticos);
              }
            } else {
              criticos.push(...auditoria.criticos);
            }
          } else {
            dicasMobile = auditoria.avisos;
          }
          if (dicasMobile.length) console.log(`[previa-ia] polimento mobile: ${dicasMobile.join("; ")}`);
        }

        const dicas = [...dicasEstaticas, ...dicasEstaticasExtra, ...dicasMobile];
        const modeloUsado = (resposta as any).modelVersion || modelo;

        if (criticos.length) {
          candidatas.push({ html, criticos, medidas, modelo: modeloUsado, tentativa, notaVisual: 0, dicas: [] });
          errosAnteriores = [...criticos, ...dicas];
          console.warn(`[previa-ia] ${modelo} reprovado (tentativa ${tentativa}): ${errosAnteriores.join("; ")}`);
          continue;
        }

        // Passou no portão técnico. Agora o olho: hierarquia, contraste, densidade.
        let notaVisual = 10;
        let problemasVisuais: string[] = [];
        if (printPath) {
          const juizo = await julgarPaginaVisualmente(printPath, {
            nome: lead.name,
            segmento: (lead as any).searchCategory || lead.category,
            cidade: [lead.city, lead.state].filter(Boolean).join("/"),
          });
          if (juizo) {
            notaVisual = juizo.nota;
            problemasVisuais = juizo.problemas;
          }
          try { fs.unlinkSync(printPath); } catch { /* já foi */ }
        }

        candidatas.push({
          html,
          criticos: [],
          medidas,
          modelo: modeloUsado,
          tentativa,
          notaVisual,
          dicas: [...correcoes, ...dicas],
        });

        if (correcoes.length) console.log(`[previa-ia] reparos aplicados: ${correcoes.join(" | ")}`);

        const minimo = notaMinima();
        if (notaVisual >= minimo) {
          return {
            ok: true,
            pagina: {
              html,
              conceito: conceitoDe(html) || "",
              modelo: modeloUsado,
              tentativas: tentativa,
              avisos: [...avisos, ...dicas, ...correcoes],
              medidas,
              notaVisual,
            },
          };
        }

        console.warn(`[previa-ia] nota visual ${notaVisual} abaixo de ${minimo} (tentativa ${tentativa})`);
        errosAnteriores = problemasVisuais.length
          ? problemasVisuais.map((p) => `juiz visual: ${p}`)
          : [`o juiz visual deu nota ${notaVisual} (mínimo ${minimo}): melhore hierarquia, respiro e acabamento`];
        if (dicas.length) errosAnteriores.push(...dicas.slice(0, 2));
      } catch (err: any) {
        const msg = String(err?.message || err);
        errosAnteriores = [`falha na chamada: ${msg.slice(0, 160)}`];
        console.warn(`[previa-ia] ${modelo} falhou: ${msg.slice(0, 160)}`);
      }
    }
    if (errosAnteriores.length) avisos.push(...errosAnteriores);
  }

  // Nada atingiu a nota mínima: entrega a melhor candidata (limpa primeiro, depois
  // a de maior nota) e diz o que ficou pendente.
  if (candidatas.length) {
    const limpas = candidatas.filter((c) => !c.criticos.length);
    const escolhida = limpas.length
      ? limpas.reduce((a, b) => (b.notaVisual > a.notaVisual ? b : a))
      : candidatas.reduce((a, b) => (b.criticos.length < a.criticos.length ? b : a));
    console.warn(
      `[previa-ia] nenhuma tentativa atingiu a nota mínima; usando a de nota ${escolhida.notaVisual} (${escolhida.criticos.length} pendência(s))`,
    );
    return {
      ok: true,
      pagina: {
        html: escolhida.html,
        conceito: conceitoDe(escolhida.html),
        modelo: escolhida.modelo,
        tentativas: escolhida.tentativa,
        avisos: [
          ...avisos,
          ...(escolhida.notaVisual < notaMinima() ? [`juiz visual: nota ${escolhida.notaVisual} (mínimo ${notaMinima()})`] : []),
          ...escolhida.criticos.map((c) => `pendente: ${c}`),
          ...escolhida.dicas,
        ],
        medidas: escolhida.medidas,
        notaVisual: escolhida.notaVisual,
      },
    };
  }

  return { ok: false, motivo: "nenhuma tentativa produziu uma página utilizável", erros: errosAnteriores };
}

/* ------------------------------------------------------------------ */
/*  Geração + gravação + publicação                                    */
/* ------------------------------------------------------------------ */

export interface ResultadoPaginaUnica {
  preview: PreviewResult;
  /** Sempre "ia": a página é sempre escrita para o lead. */
  origem: "ia";
  modelo?: string;
  conceito?: string;
  tentativas?: number;
  medidas?: MedidaViewport[];
  /** Nota do juiz visual (0 a 10), quando ele rodou. */
  notaVisual?: number;
  motivoFallback?: string;
}

/**
 * Escreve a página do lead.
 *
 * A página agora SEMPRE vem da IA: quando nenhuma tentativa passa limpa, usamos a
 * melhor delas (já consertada pelo reparador). O template sobrou só para o caso
 * extremo de nenhuma chamada ter devolvido HTML — quando não há página nenhuma,
 * um template honesto é melhor que link morto.
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
      notaVisual: gerada.pagina.notaVisual,
    };
  }
  // Sem template de reserva: página que não foi escrita para ESTE negócio não vai
  // para o cliente. Quem decide o que fazer é quem chamou (registra pendência e
  // avisa o dono no WhatsApp), em vez de publicar um site genérico no nome dele.
  const falha: FalhaGeracao = gerada as FalhaGeracao;
  console.warn(`[previa-ia] geração falhou: ${falha.motivo} ${falha.erros.join("; ")}`);
  throw new Error(`não foi possível gerar a página: ${falha.motivo}${falha.erros.length ? ` (${falha.erros.slice(0, 2).join("; ")})` : ""}`);
}
