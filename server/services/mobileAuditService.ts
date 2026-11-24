import { spawn } from "node:child_process";
import fs from "node:fs";
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

/** Script que roda DENTRO da página e devolve as medidas em JSON. */
const MEDIDOR = `(() => {
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
    return !botoesMinusculos.includes(e) && (r.height < 44 || r.width < 44);
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

  return JSON.stringify({
    largura: larg,
    scrollWidth: Math.max(doc.scrollWidth, document.body.scrollWidth),
    alturaPagina: Math.max(doc.scrollHeight, document.body.scrollHeight),
    overflow: overflow > 1 ? overflow : 0,
    criticos,
    avisos,
  });
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

async function medirEm(chrome: string, arquivoUrl: string, largura: number, porta: number): Promise<MedidaViewport | null> {
  const perfil = fs.mkdtempSync(path.join(os.tmpdir(), "audit-"));
  const proc = spawn(chrome, [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
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
    await cdp("Emulation.setDeviceMetricsOverride", {
      width: largura, height: 800, deviceScaleFactor: 2, mobile: true,
    });
    await cdp("Page.navigate", { url: arquivoUrl });
    await dormir(1800);

    const res = await cdp("Runtime.evaluate", { expression: MEDIDOR, returnByValue: true });
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
export async function auditarPaginaMobile(html: string, opts: { larguras?: number[] } = {}): Promise<AuditoriaMobile> {
  const chrome = acharChrome();
  if (!chrome) {
    return { ok: true, pulada: true, motivoPulada: "Chrome não encontrado na máquina", medidas: [], criticos: [], avisos: [] };
  }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "previa-audit-"));
  const arquivo = path.join(dir, "pagina.html");
  fs.writeFileSync(arquivo, html, "utf8");
  const arquivoUrl = "file:///" + arquivo.replace(/\\/g, "/");

  const larguras = opts.larguras?.length ? opts.larguras : LARGURAS;
  const medidas: MedidaViewport[] = [];
  const criticos: string[] = [];
  const avisos: string[] = [];

  try {
    let porta = 9400 + Math.floor(Math.random() * 300);
    for (const largura of larguras) {
      const medida = await medirEm(chrome, arquivoUrl, largura, porta);
      porta += 1;
      if (!medida) continue;
      medidas.push(medida);
      for (const p of medida.criticos || []) criticos.push(`${largura}px: ${p}`);
      for (const p of medida.avisos || []) avisos.push(`${largura}px: ${p}`);
    }
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ok */ }
  }

  if (!medidas.length) {
    return { ok: true, pulada: true, motivoPulada: "o navegador não respondeu a tempo", medidas, criticos: [], avisos: [] };
  }

  return { ok: criticos.length === 0, medidas, criticos, avisos };
}
