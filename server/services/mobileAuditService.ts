import { spawn } from "node:child_process";
import fs from "node:fs";
import { previewsDir } from "./previewService";
import os from "node:os";
import path from "node:path";

/**
 * Auditoria de responsividade da prévia.
 *
 * Abre a página num Chrome headless, em larguras de celular de verdade, e mede o
 * que costuma quebrar: transbordo horizontal, alvo de toque pequeno demais, texto
 * ilegível e rodapé fixo comendo a tela. Devolve a lista de problemas com números,
 * para o gerador corrigir na tentativa seguinte.
 *
 * Sem Chrome na máquina a auditoria é pulada (não bloqueia a entrega) — mas o
 * motivo fica no log, nunca escondido.
 */

export interface MedidaViewport {
  largura: number;
  scrollWidth: number;
  alturaPagina: number;
  overflow: number;
  /** Quebra a página no celular: reprova. */
  criticos: string[];
  /** Polimento (alvo de toque 40px, fonte 11-13px): vira dica, não reprova. */
  avisos: string[];
  /** Quadros por segundo durante 1,2s de rolagem real. */
  fps?: number;
  /** Bytes de JavaScript embutido na página. */
  jsBytes?: number;
  /** Requisições externas (script, fonte, imagem): quanto mais, pior no 4G. */
  externos?: number;
}

export interface AuditoriaMobile {
  ok: boolean;
  pulada?: boolean;
  motivoPulada?: string;
  medidas: MedidaViewport[];
  criticos: string[];
  avisos: string[];
}

const LARGURAS = [360, 390];

function acharChrome(): string | null {
  const candidatos = [
    process.env.CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter(Boolean) as string[];
  return candidatos.find((c) => fs.existsSync(c)) || null;
}

export function auditoriaDisponivel(): boolean {
  return acharChrome() !== null;
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface LimitesDoPublico {
  corpo: number;
  alvo: number;
  contraste: number;
}

const LIMITES_PADRAO: LimitesDoPublico = { corpo: 17, alvo: 44, contraste: 4.5 };

/** Script que roda DENTRO da página e devolve as medidas em JSON. */
const medidorComLimites = (lim: LimitesDoPublico) => `(() => {
  const larg = window.innerWidth;
  const doc = document.documentElement;
  const criticos = [];
  const avisos = [];

  const overflow = Math.max(doc.scrollWidth, document.body.scrollWidth) - larg;
  if (overflow > 1) {
    const culpados = [...document.querySelectorAll('body *')]
      .filter((e) => {
        const r = e.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return false;
        const estilo = getComputedStyle(e);
        if (estilo.position === 'fixed') return false;
        if (estilo.overflow === 'hidden' && e.parentElement) {
          const pai = e.parentElement.getBoundingClientRect();
          return r.right > pai.right + 1;
        }
        return r.right > larg + 1;
      })
      .slice(0, 5)
      .map((e) => e.tagName.toLowerCase() + (e.className ? '.' + String(e.className).split(' ')[0] : ''));
    criticos.push('transbordo horizontal de ' + overflow + 'px' + (culpados.length ? ' (culpados: ' + culpados.join(', ') + ')' : ''));
  }

  const alvos = [...document.querySelectorAll('a, button, [role=button]')].filter((e) => {
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
  const amostraDe = (lista) => lista.slice(0, 3).map((e) => {
    const r = e.getBoundingClientRect();
    return (e.textContent || e.getAttribute('aria-label') || e.tagName).trim().slice(0, 24) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height);
  }).join(' | ');

  // Botão de verdade tem fundo ou borda. Link de texto no cabeçalho/rodapé não é
  // alvo de toque primário: 26px de altura ali é normal e já reprovou página boa.
  const ehBotao = (e) => {
    const s = getComputedStyle(e);
    const fundo = s.backgroundColor && s.backgroundColor !== 'rgba(0, 0, 0, 0)' && s.backgroundColor !== 'transparent';
    const borda = parseFloat(s.borderTopWidth || '0') > 0 || parseFloat(s.borderBottomWidth || '0') > 0;
    return Boolean(e.closest('button')) || e.getAttribute('role') === 'button' || fundo || borda;
  };
  const botoes = alvos.filter(ehBotao);
  const links = alvos.filter((e) => !ehBotao(e));

  const botoesMinusculos = botoes.filter((e) => {
    const r = e.getBoundingClientRect();
    return r.height < 32 || r.width < 32;
  });
  if (botoesMinusculos.length) {
    criticos.push(botoesMinusculos.length + ' botão(ões) abaixo de 32px de toque (' + amostraDe(botoesMinusculos) + ')');
  }
  const botoesApertados = botoes.filter((e) => {
    const r = e.getBoundingClientRect();
    return !botoesMinusculos.includes(e) && (r.height < ${lim.alvo} || r.width < ${lim.alvo});
  });
  if (botoesApertados.length) {
    avisos.push(botoesApertados.length + ' botão(ões) entre 32 e 44px (' + amostraDe(botoesApertados) + ')');
  }
  const linksApertados = links.filter((e) => {
    const r = e.getBoundingClientRect();
    return r.height < 24;
  });
  if (linksApertados.length) {
    avisos.push(linksApertados.length + ' link(s) de texto com menos de 24px de altura (' + amostraDe(linksApertados) + ')');
  }

  const textos = [...document.querySelectorAll('p, li, span, small, a, div')].filter((e) => {
    if (!e.textContent || !e.textContent.trim()) return false;
    if (e.children.length > 2) return false;
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
  const miudos = textos.filter((e) => parseFloat(getComputedStyle(e).fontSize) < 13);
  if (miudos.length > 5) {
    avisos.push(miudos.length + ' blocos de texto com fonte abaixo de 13px');
  }
  // 11px é apertado, mas rotulo de marca costuma viver aí e não quebra a página.
  const ilegiveis = textos.filter((e) => parseFloat(getComputedStyle(e).fontSize) < 9);
  if (ilegiveis.length) {
    criticos.push(ilegiveis.length + ' bloco(s) de texto com fonte abaixo de 9px');
  }

  // CORPO DE TEXTO: 12px é o que faz a página parecer barata. Um parágrafo
  // legível no celular tem 16-17px. Isto reprova, porque é o defeito que mais
  // aparece nas gerações e o que o dono percebe primeiro.
  const paragrafos = [...document.querySelectorAll('p')].filter((e) => (e.textContent || '').trim().length > 40);
  if (paragrafos.length) {
    const menor = Math.min(...paragrafos.map((e) => parseFloat(getComputedStyle(e).fontSize) || 16));
    if (menor < ${lim.corpo - 2}) {
      criticos.push('corpo de texto em ' + menor + 'px: para este público o tamanho é ${lim.corpo}px');
    } else if (menor < ${lim.corpo}) {
      avisos.push('corpo de texto em ' + menor + 'px (o ideal para este público é ${lim.corpo}px)');
    }
    const entrelinhas = paragrafos
      .map((e) => { const c = getComputedStyle(e); const f = parseFloat(c.fontSize); const l = parseFloat(c.lineHeight); return f ? l / f : NaN; })
      .filter((n) => !isNaN(n) && n > 0);
    if (entrelinhas.length) {
      const menorEntrelinha = Math.min(...entrelinhas);
      if (menorEntrelinha < 1.45) {
        avisos.push('entrelinha de ' + menorEntrelinha.toFixed(2) + ': abaixo de 1,5 o texto fica apertado');
      }
    }
  }

  // TÍTULOS DE SEÇÃO: todos no mesmo tamanho = página chapada, sem hierarquia.
  const titulosSecao = [...document.querySelectorAll('h2')]
    .map((e) => parseFloat(getComputedStyle(e).fontSize) || 0)
    .filter((n) => n > 0);
  if (titulosSecao.length >= 3) {
    const menorTitulo = Math.min(...titulosSecao);
    if (menorTitulo < 24) avisos.push('título de seção em ' + menorTitulo + 'px: abaixo de 24px não há contraste com o corpo');
    if (new Set(titulosSecao.map((n) => Math.round(n))).size === 1) {
      avisos.push('todos os ' + titulosSecao.length + ' títulos de seção no mesmo tamanho (' + Math.round(menorTitulo) + 'px): crie hierarquia');
    }
  }

  // HERÓI VAZIO: é a reclamação que mais se repete em toda prévia — bloco alto com
  // conteúdo espremido no topo. Mede quanto da altura do herói o conteúdo ocupa.
  const heroi = document.querySelector('section, header');
  if (heroi) {
    const alturaHeroi = heroi.offsetHeight;
    if (alturaHeroi > window.innerHeight * 0.55) {
      const filhos = [...heroi.children].filter((e) => !/fx-arte|fx-canvas|fx-marca/.test(e.className || ''));
      const conteudo = filhos.reduce((soma, e) => soma + e.offsetHeight, 0);
      // O respiro (padding) NÃO é vazio: desconta antes de medir, senão um herói
      // saudável de 72px em cima e 88px embaixo é reprovado por "82% de ocupação".
      const cs2 = getComputedStyle(heroi);
      const respiro = (parseFloat(cs2.paddingTop) || 0) + (parseFloat(cs2.paddingBottom) || 0);
      const util = Math.max(1, alturaHeroi - respiro);
      const ocupacao = Math.round((conteudo / util) * 100);
      if (ocupacao < 55) {
        avisos.push('herói com ' + ocupacao + '% de ocupação em ' + alturaHeroi + 'px: sobrou vazio — centralize o conteúdo ou reduza a altura');
      }
    }
  }

  // RITMO E FORMATO: se toda seção tem o mesmo respiro e o mesmo desenho
  // (título + parágrafo), a página vira uma lista e fica sem graça.
  const blocosSecao = [...document.querySelectorAll('section')].filter((e) => e.offsetHeight > 100);
  if (blocosSecao.length >= 3) {
    const respiros = blocosSecao.map((e) => Math.round(parseFloat(getComputedStyle(e).paddingTop) || 0));
    if (new Set(respiros).size === 1 && respiros[0] < 80) {
      avisos.push('as ' + blocosSecao.length + ' seções têm o mesmo respiro de ' + respiros[0] + 'px: varie entre 72px e 128px');
    }
    const formatos = new Set(blocosSecao.map((s) => {
      const marcas = [];
      if (s.querySelectorAll('li').length >= 3) marcas.push('lista');
      if (s.querySelector('blockquote')) marcas.push('citacao');
      if (s.querySelector('figure, img, svg')) marcas.push('figura');
      const bg = getComputedStyle(s).backgroundColor;
      marcas.push(bg && bg !== 'rgba(0, 0, 0, 0)' ? 'banda' : 'plana');
      const primeiro = s.firstElementChild;
      const disp = (getComputedStyle(s).display || '') + (primeiro ? getComputedStyle(primeiro).display : '');
      if (/grid|flex/.test(disp)) marcas.push('colunas');
      return marcas.join('+');
    }));
    if (formatos.size < 3 && blocosSecao.length >= 4) {
      avisos.push('só ' + formatos.size + ' formato(s) de seção na página inteira: alterne banda de cor cheia, lista, citação, figura e duas colunas');
    }
  }

  // Espaço reservado ocupando meia tela logo no topo deixa a página com cara de
  // wireframe vazio. É dica (não reprova), mas entra no retorno para o gerador.
  const slot = document.querySelector('[data-slot]');
  if (slot) {
    const r = slot.getBoundingClientRect();
    if (r.height > window.innerHeight * 0.45) {
      avisos.push('espaço de imagem com ' + Math.round((r.height / window.innerHeight) * 100) + '% da altura da tela (máximo 40%)');
    }
  }

  const altura = Math.max(doc.scrollHeight, document.body.scrollHeight);
  if (altura > 3400) {
    avisos.push('página muito longa no celular (' + altura + 'px): encurte espaçamento e blocos');
  }

  const fixos = [...document.querySelectorAll('body *')].filter((e) => getComputedStyle(e).position === 'fixed');
  for (const f of fixos) {
    const r = f.getBoundingClientRect();
    if (r.height > window.innerHeight * 0.25) {
      criticos.push('elemento fixo ocupando ' + Math.round((r.height / window.innerHeight) * 100) + '% da tela');
    }
  }

  // Contraste real (WCAG): cor do texto contra o primeiro fundo opaco acima dele.
  const paraRgb = (cor) => {
    const m = String(cor).match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(',').map((v) => parseFloat(v));
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const luminancia = (c) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const fundoDe = (e) => {
    let n = e;
    while (n && n !== document.documentElement) {
      const c = paraRgb(getComputedStyle(n).backgroundColor || '');
      if (c && c.a > 0.85) return c;
      n = n.parentElement;
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  };
  const razao = (a, b) => {
    const l1 = luminancia(a);
    const l2 = luminancia(b);
    const [x, y] = l1 > l2 ? [l1, l2] : [l2, l1];
    return (x + 0.05) / (y + 0.05);
  };
  const baixoContraste = [];
  for (const e of document.querySelectorAll('p, li, span, a, h1, h2, h3, h4, small, strong, em, button, figcaption')) {
    const temTexto = [...e.childNodes].some((n) => n.nodeType === 3 && (n.textContent || '').trim().length > 2);
    if (!temTexto) continue;
    const r = e.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const s = getComputedStyle(e);
    if (parseFloat(s.opacity) < 0.5) continue;
    const fg = paraRgb(s.color);
    if (!fg) continue;
    const bg = fundoDe(e);
    // Texto com alfa: mistura com o fundo antes de medir.
    const misturado = fg.a >= 1 ? fg : {
      r: fg.r * fg.a + bg.r * (1 - fg.a),
      g: fg.g * fg.a + bg.g * (1 - fg.a),
      b: fg.b * fg.a + bg.b * (1 - fg.a),
      a: 1,
    };
    const tamanho = parseFloat(s.fontSize) || 16;
    const negrito = (parseInt(s.fontWeight, 10) || 400) >= 700;
    const minimo = (tamanho >= 24 || (negrito && tamanho >= 19)) ? Math.min(3, ${lim.contraste}) : ${lim.contraste};
    const valor = razao(misturado, bg);
    if (valor < minimo) {
      baixoContraste.push({ texto: (e.textContent || '').trim().slice(0, 28), razao: Math.round(valor * 10) / 10, minimo });
    }
  }
  if (baixoContraste.length) {
    const descrever = (lista) => lista.slice(0, 3).map((c) => '"' + c.texto + '" ' + c.razao + ':1 (minimo ' + c.minimo + ':1)').join(' | ');
    const graves = baixoContraste.filter((c) => c.razao < 3);
    const medios = baixoContraste.filter((c) => c.razao >= 3);
    if (graves.length) criticos.push('texto quase invisivel: ' + descrever(graves));
    else if (medios.length) avisos.push('contraste abaixo do minimo: ' + descrever(medios));
  }

  return JSON.stringify({
    largura: larg,
    scrollWidth: Math.max(doc.scrollWidth, document.body.scrollWidth),
    alturaPagina: Math.max(doc.scrollHeight, document.body.scrollHeight),
    overflow: overflow > 1 ? overflow : 0,
    criticos,
    avisos,
  });
})()`;

/**
 * Desempenho medido de verdade: rola a página por 1,2s contando frames.
 * Print nenhum mostra engasgo — só a medição mostra.
 */
const MEDIDOR_PERF = `(async () => {
  const alvo = Math.max(1, document.body.scrollHeight - window.innerHeight);
  const inicio = performance.now();
  let frames = 0;
  await new Promise((resolve) => {
    const passo = () => {
      const p = Math.min(1, (performance.now() - inicio) / 1200);
      window.scrollTo(0, alvo * p);
      frames += 1;
      if (p < 1) requestAnimationFrame(passo);
      else resolve();
    };
    requestAnimationFrame(passo);
  });
  const duracao = (performance.now() - inicio) / 1000;
  window.scrollTo(0, 0);
  const jsBytes = [...document.scripts].reduce((soma, s) => soma + (s.src ? 0 : (s.textContent || "").length), 0);
  // Fonte do Google não conta: o prompt permite e a página não deixa de funcionar
  // sem ela (sempre há fallback de sistema). O que reprova é script/imagem externa.
  const externos = [...document.querySelectorAll("script[src], link[rel=stylesheet], img[src^='http']")]
    .filter((e) => !/fonts\.(googleapis|gstatic)\.com/.test(String(e.getAttribute("href") || e.getAttribute("src") || "")))
    .length;
  return JSON.stringify({ fps: Math.round(frames / duracao), duracao, jsBytes, externos });
})()`;

/** Botão fixo cobrindo texto é o defeito que mais faz a página parecer quebrada. */
const SOBREPOSICAO = `(() => {
  const fixos = [...document.querySelectorAll('body *')].filter((e) => getComputedStyle(e).position === 'fixed');
  if (!fixos.length) return JSON.stringify([]);
  const textos = [...document.querySelectorAll('p, li, h1, h2, h3, span, a')].filter((e) => {
    if (!e.textContent || !e.textContent.trim()) return false;
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.top < window.innerHeight && r.bottom > 0;
  });
  const achados = [];
  for (const f of fixos) {
    const a = f.getBoundingClientRect();
    for (const t of textos) {
      if (f.contains(t)) continue;
      const b = t.getBoundingClientRect();
      const sobreposta = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
                         Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
      if (sobreposta > b.width * b.height * 0.35) {
        achados.push((t.textContent || '').trim().slice(0, 40));
        break;
      }
    }
  }
  return JSON.stringify(achados);
})()`;

/** No desktop a página tem que usar a tela; 640px no meio de 1280 é página de celular. */
const MEDIDOR_DESKTOP = `(() => {
  const larg = window.innerWidth;
  const candidatos = [...document.querySelectorAll('body > *, main, .wrap, .container, .page, section')]
    .filter((e) => e.getBoundingClientRect().height > 80);
  // Ignora faixas full-bleed (fundo de seção ocupa 100% por definição) — o que
  // interessa é a largura do CONTENTOR de conteúdo.
  const larguras = candidatos
    .map((e) => Math.round(e.getBoundingClientRect().width))
    .filter((w) => w > 0 && w < larg * 0.97);
  const conteudo = larguras.length ? Math.max(...larguras) : larg;
  // Medidas de DESKTOP que faltavam: era aqui que a página parecia boa no print do
  // celular e ruim no monitor do dono — título de 120px em cinco linhas e corpo de 15px.
  const h1 = document.querySelector('h1');
  let tituloLinhas = 0;
  let tituloPx = 0;
  if (h1) {
    const cs = getComputedStyle(h1);
    tituloPx = Math.round(parseFloat(cs.fontSize) || 0);
    const lh = parseFloat(cs.lineHeight) || tituloPx * 1.1;
    tituloLinhas = Math.round(h1.getBoundingClientRect().height / lh);
  }
  const paragrafos = [...document.querySelectorAll('p')].filter((e) => (e.textContent || '').trim().length > 40);
  const corpoPx = paragrafos.length ? Math.min(...paragrafos.map((e) => Math.round(parseFloat(getComputedStyle(e).fontSize) || 0))) : 0;
  const transbordo = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - larg;
  // Medida de leitura: caracteres por linha no parágrafo mais comum.
  let medidaCh = 0;
  if (paragrafos.length) {
    const p = paragrafos[0];
    const fonte = parseFloat(getComputedStyle(p).fontSize) || 16;
    medidaCh = Math.round(p.getBoundingClientRect().width / (fonte * 0.5));
  }
  return JSON.stringify({ viewport: larg, conteudo, proporcao: Math.round((conteudo / larg) * 100), tituloLinhas, tituloPx, corpoPx, transbordo, medidaCh });
})()`;

async function medirDesktop(chrome: string, arquivoUrl: string, porta: number, larguraDesktop = 1280): Promise<{ viewport: number; conteudo: number; proporcao: number; tituloLinhas?: number; tituloPx?: number; corpoPx?: number; transbordo?: number; medidaCh?: number } | null> {
  const perfil = fs.mkdtempSync(path.join(os.tmpdir(), "audit-desk-"));
  const proc = spawn(chrome, [
    "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run",
    "--no-default-browser-check", "--disable-extensions", "--disable-background-networking",
    `--remote-debugging-port=${porta}`, `--user-data-dir=${perfil}`, "about:blank",
  ], { stdio: "ignore" });

  let ws: WebSocket | null = null;
  try {
    let alvo: string | null = null;
    for (let i = 0; i < 30 && !alvo; i++) {
      await dormir(200);
      try {
        const lista = await fetch(`http://127.0.0.1:${porta}/json/list`).then((r) => r.json());
        alvo = (lista as any[]).find((t) => t.type === "page")?.webSocketDebuggerUrl || null;
      } catch { /* subindo */ }
    }
    if (!alvo) return null;

    ws = new WebSocket(alvo);
    await new Promise<void>((ok, falha) => {
      ws!.onopen = () => ok();
      ws!.onerror = () => falha(new Error("websocket falhou"));
      setTimeout(() => falha(new Error("timeout websocket")), 8000);
    });

    let seq = 0;
    const pendentes = new Map<number, (m: any) => void>();
    ws.onmessage = (ev: MessageEvent) => {
      const msg = JSON.parse(String(ev.data));
      if (msg.id && pendentes.has(msg.id)) {
        pendentes.get(msg.id)!(msg);
        pendentes.delete(msg.id);
      }
    };
    const cdp = (method: string, params: Record<string, unknown> = {}) =>
      new Promise<any>((ok, falha) => {
        const id = ++seq;
        pendentes.set(id, (m) => (m.error ? falha(new Error(m.error.message)) : ok(m.result)));
        ws!.send(JSON.stringify({ id, method, params }));
        setTimeout(() => falha(new Error(`${method} sem resposta`)), 20000);
      });

    await cdp("Page.enable");
    await cdp("Runtime.enable");
    await cdp("Emulation.setDeviceMetricsOverride", { width: larguraDesktop, height: 900, deviceScaleFactor: 1, mobile: false });
    await cdp("Page.navigate", { url: arquivoUrl });
    await dormir(1500);
    const res = await cdp("Runtime.evaluate", { expression: MEDIDOR_DESKTOP, returnByValue: true });
    const valor = res?.result?.value;
    return valor ? JSON.parse(valor) : null;
  } catch (erro: any) {
    console.warn(`[auditoria] desktop: ${erro?.message || erro}`);
    return null;
  } finally {
    try { ws?.close(); } catch { /* ok */ }
    try { proc.kill(); } catch { /* ok */ }
    await dormir(300);
    try { fs.rmSync(perfil, { recursive: true, force: true }); } catch { /* travado */ }
  }
}

async function medirEm(
  chrome: string,
  arquivoUrl: string,
  largura: number,
  porta: number,
  pngPath?: string,
  limites: LimitesDoPublico = LIMITES_PADRAO,
): Promise<MedidaViewport | null> {
  const perfil = fs.mkdtempSync(path.join(os.tmpdir(), "audit-"));
  const proc = spawn(chrome, [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--enable-unsafe-swiftshader",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--disable-background-networking",
    `--remote-debugging-port=${porta}`,
    `--user-data-dir=${perfil}`,
    "about:blank",
  ], { stdio: "ignore" });

  let ws: WebSocket | null = null;
  try {
    let alvo: string | null = null;
    for (let i = 0; i < 30 && !alvo; i++) {
      await dormir(200);
      try {
        const lista = await fetch(`http://127.0.0.1:${porta}/json/list`).then((r) => r.json());
        alvo = (lista as any[]).find((t) => t.type === "page")?.webSocketDebuggerUrl || null;
      } catch { /* ainda subindo */ }
    }
    if (!alvo) return null;

    ws = new WebSocket(alvo);
    await new Promise<void>((ok, falha) => {
      ws!.onopen = () => ok();
      ws!.onerror = () => falha(new Error("websocket do Chrome falhou"));
      setTimeout(() => falha(new Error("timeout abrindo websocket")), 8000);
    });

    let perfDaPagina: { fps?: number; jsBytes?: number; externos?: number; software?: boolean } = {};
    let seq = 0;
    const pendentes = new Map<number, (m: any) => void>();
    const errosJs: string[] = [];
    ws.onmessage = (ev: MessageEvent) => {
      const msg = JSON.parse(String(ev.data));
      if (msg.id && pendentes.has(msg.id)) {
        pendentes.get(msg.id)!(msg);
        pendentes.delete(msg.id);
      }
    };
    const cdp = (method: string, params: Record<string, unknown> = {}) =>
      new Promise<any>((ok, falha) => {
        const id = ++seq;
        pendentes.set(id, (m) => (m.error ? falha(new Error(m.error.message)) : ok(m.result)));
        ws!.send(JSON.stringify({ id, method, params }));
        setTimeout(() => falha(new Error(`${method} sem resposta`)), 20000);
      });

    await cdp("Page.enable");
    await cdp("Runtime.enable");
    await cdp("Emulation.setDeviceMetricsOverride", {
      width: largura, height: 800, deviceScaleFactor: 2, mobile: true,
    });
    await cdp("Page.navigate", { url: arquivoUrl });
    await dormir(1800);

    // Desempenho primeiro: a medição precisa acontecer com a página "fria", antes
    // de qualquer rolagem da auditoria aquecer o cache de layout.
    try {
      const perf = await cdp("Runtime.evaluate", { expression: MEDIDOR_PERF, awaitPromise: true, returnByValue: true });
      const dados = perf?.result?.value ? JSON.parse(perf.result.value) : null;
      if (dados) {
        perfDaPagina = { fps: dados.fps, jsBytes: dados.jsBytes, externos: dados.externos, software: dados.software };
        await dormir(400);
      }
    } catch (erro: any) {
      console.warn(`[auditoria] desempenho não medido: ${erro?.message || erro}`);
    }

    // Rolagem em degraus antes de medir: com animação de revelação, o que está
    // abaixo da dobra só existe depois de aparecer. Medir sem rolar acusava
    // "conteúdo invisível" em página boa.
    try {
      await cdp("Runtime.evaluate", {
        expression:
          "(async()=>{const h=Math.max(1,document.body.scrollHeight-window.innerHeight);" +
          "for(let i=1;i<=6;i++){window.scrollTo(0,h*i/6);await new Promise(r=>setTimeout(r,130));}" +
          "window.scrollTo(0,0);await new Promise(r=>setTimeout(r,260));return 'ok';})()",
        awaitPromise: true,
        returnByValue: true,
      });
    } catch {
      /* sem revelação não faz falta */
    }

    const res = await cdp("Runtime.evaluate", { expression: medidorComLimites(limites), returnByValue: true });
    const valor = res?.result?.value;
    if (!valor) return null;
    const medida = JSON.parse(valor) as MedidaViewport;

    // Barra fixa cobrindo conteúdo NO MEIO da rolagem é comportamento esperado.
    // O defeito real é ela esconder o fim da página (padding-bottom insuficiente).
    await cdp("Runtime.evaluate", { expression: "window.scrollTo(0, document.body.scrollHeight)" });
    await dormir(600);
    const sobre = await cdp("Runtime.evaluate", { expression: SOBREPOSICAO, returnByValue: true });
    const achados = JSON.parse(sobre?.result?.value || "[]") as string[];
    if (achados.length) {
      // Rodapé atrás da barra é acabamento, não quebra: vira dica para a próxima
      // tentativa. Reprovar por isso derrubava uma página boa para o template.
      medida.avisos.push(
        `no fim da página a barra fixa cobre o conteúdo (${achados.slice(0, 2).join(" | ")}) — aumente o padding-bottom do body`,
      );
    }
    if (errosJs.length) {
      medida.criticos.push(`erro de JavaScript na página: ${errosJs.slice(0, 2).join(" | ")}`);
    }
    if (perfDaPagina.fps !== undefined) medida.fps = perfDaPagina.fps;
    if (perfDaPagina.jsBytes !== undefined) medida.jsBytes = perfDaPagina.jsBytes;
    if (perfDaPagina.externos !== undefined) medida.externos = perfDaPagina.externos;
    if (perfDaPagina.software !== undefined) (medida as any).software = perfDaPagina.software;

    // Print da primeira dobra: é o que o juiz visual precisa ver para julgar
    // hierarquia, contraste e densidade. Escala 1 para não estourar o tamanho.
    if (pngPath) {
      try {
        await cdp("Emulation.setDeviceMetricsOverride", {
          width: largura, height: 900, deviceScaleFactor: 1, mobile: true,
        });
        await cdp("Runtime.evaluate", { expression: "window.scrollTo(0, 0)" });
        await dormir(400);
        const alturaPrint = Math.min(medida.alturaPagina || 1600, 1900);
        const shot = await cdp("Page.captureScreenshot", {
          format: "png",
          captureBeyondViewport: true,
          clip: { x: 0, y: 0, width: largura, height: alturaPrint, scale: 1 },
        });
        if (shot?.data) fs.writeFileSync(pngPath, Buffer.from(shot.data, "base64"));
      } catch (erro: any) {
        console.warn(`[auditoria] print falhou: ${erro?.message || erro}`);
      }
    }
    return medida;
  } catch (erro: any) {
    console.warn(`[auditoria] largura ${largura}: ${erro?.message || erro}`);
    return null;
  } finally {
    try { ws?.close(); } catch { /* já fechado */ }
    try { proc.kill(); } catch { /* morto */ }
    await dormir(300);
    try { fs.rmSync(perfil, { recursive: true, force: true }); } catch { /* travado no Windows */ }
  }
}

/**
 * Roda a auditoria em cada largura. `html` é gravado num arquivo temporário para
 * que a página seja medida exatamente como vai ao ar (mesmo arquivo, mesma origem).
 */
export async function auditarPaginaMobile(
  html: string,
  opts: { larguras?: number[]; print?: string; limites?: Partial<LimitesDoPublico> } = {},
): Promise<AuditoriaMobile> {
  const limites: LimitesDoPublico = { ...LIMITES_PADRAO, ...(opts.limites || {}) };
  const chrome = acharChrome();
  if (!chrome) {
    return { ok: true, pulada: true, motivoPulada: "Chrome não encontrado na máquina", medidas: [], criticos: [], avisos: [] };
  }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "previa-audit-"));
  const arquivo = path.join(dir, "pagina.html");
  fs.writeFileSync(arquivo, html, "utf8");

  // Imagens locais (foto de banco, logo) precisam estar ao lado do HTML, senão a
  // captura mostra imagem quebrada e o juiz visual reprova a página por um defeito
  // que só existe no diretório temporário.
  try {
    const referencias = [...html.matchAll(/src=["'](?!https?:|data:|\/)([^"']+\.(?:jpg|jpeg|png|webp|svg))["']/gi)].map((m) => m[1]);
    for (const nome of new Set(referencias)) {
      const origem = path.join(previewsDir(), nome);
      if (fs.existsSync(origem)) fs.copyFileSync(origem, path.join(dir, path.basename(nome)));
    }
  } catch {
    /* sem assets, segue sem eles */
  }
  const arquivoUrl = "file:///" + arquivo.replace(/\\/g, "/");

  const larguras = opts.larguras?.length ? opts.larguras : LARGURAS;
  const medidas: MedidaViewport[] = [];
  const criticos: string[] = [];
  const avisos: string[] = [];

  // A medida de desktop precisa acontecer ANTES de apagar o arquivo temporário.
  let porta = 9400 + Math.floor(Math.random() * 300);
  try {
    for (const largura of larguras) {
      const medida = await medirEm(chrome, arquivoUrl, largura, porta, largura === 390 ? opts.print : undefined, limites);
      porta += 1;
      if (!medida) continue;
      medidas.push(medida);
      for (const p of medida.criticos || []) criticos.push(`${largura}px: ${p}`);
      for (const p of medida.avisos || []) avisos.push(`${largura}px: ${p}`);
    }

    // Portão de desempenho: página bonita que engasga no celular é pior que
    // página simples que rola liso. Abaixo de 40fps avisa; abaixo de 30 reprova.
    const referencia = medidas.find((m) => m.largura === 390) || medidas[0];
    // FPS NUNCA reprova. A auditoria roda em Chrome sem GPU (SwiftShader): numa
    // página sem WebGL não há como detectar o renderizador por software, e o número
    // sai pessimista — já reprovou página boa a 29fps. O dado vira dica e o número
    // que vale é o medido em GPU real.
    if (referencia?.fps !== undefined) {
      avisos.push(`${referencia.fps}fps na rolagem em renderização por software (referência, não reprova)`);
    }
    if (referencia?.jsBytes && referencia.jsBytes > 14_000) {
      avisos.push(`${Math.round(referencia.jsBytes / 1024)} KB de JavaScript embutido (orçamento: 14 KB)`);
    }
    if (referencia?.externos) {
      criticos.push(`${referencia.externos} requisição(ões) externa(s): a prévia não deve depender de rede`);
    }

    // FAIXA, não ponto: responsivo é passar em todas as larguras, não na tela de quem testou.
    const LARGURAS_FAIXA = [320, 414, 768, 1024, 1440, 1920, 2560];
    const faixa: string[] = [];
    for (let i = 0; i < LARGURAS_FAIXA.length; i++) {
      const w = LARGURAS_FAIXA[i];
      const m = await medirDesktop(chrome, arquivoUrl, porta + 20 + i, w);
      if (!m) continue;
      const problemas: string[] = [];
      if ((m.transbordo || 0) > 1) problemas.push(`transbordo ${m.transbordo}px`);
      if (w >= 900 && m.proporcao < 60) problemas.push(`conteúdo em ${m.proporcao}%`);
      if (w >= 900 && m.proporcao > 96) problemas.push(`conteúdo colado nas bordas (${m.proporcao}%)`);
      if (m.tituloLinhas && m.tituloLinhas > (w < 900 ? 4 : 3)) problemas.push(`título em ${m.tituloLinhas} linhas`);
      if (m.corpoPx && m.corpoPx < limites.corpo - 3) problemas.push(`corpo ${m.corpoPx}px`);
      if (m.medidaCh && w >= 768 && (m.medidaCh < 40 || m.medidaCh > 92)) problemas.push(`linha de ${m.medidaCh}ch`);
      faixa.push(`${w}px: ${problemas.length ? problemas.join(", ") : "ok"}`);
      for (const problema of problemas) {
        avisos.push(`em ${w}px — ${problema}`);
      }
    }
    if (faixa.length) console.log(`[auditoria] faixa de larguras: ${faixa.join(" | ")}`);

    if (medidas.length) {
      const desktop = await medirDesktop(chrome, arquivoUrl, porta + 10);
      if (desktop && desktop.tituloLinhas && desktop.tituloLinhas > 3) {
        avisos.push(`título com ${desktop.tituloLinhas} linhas no desktop (${desktop.tituloPx}px): encurte a frase ou reduza o tamanho`);
      }
      if (desktop?.corpoPx && desktop.corpoPx < limites.corpo - 2) {
        avisos.push(`corpo de texto em ${desktop.corpoPx}px no desktop: abaixo do perfil deste público (${limites.corpo}px)`);
      }
    }
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ok */ }
  }

  if (!medidas.length) {
    return { ok: true, pulada: true, motivoPulada: "o navegador não respondeu a tempo", medidas, criticos: [], avisos: [] };
  }

  return { ok: criticos.length === 0, medidas, criticos, avisos };
}
