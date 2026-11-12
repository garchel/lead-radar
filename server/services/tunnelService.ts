/**
 * Túnel público para as prévias (cloudflared quick tunnel).
 *
 * O problema: a prévia é servida por este servidor, na rede local. O cliente do
 * outro lado da cidade não alcança `http://192.168.x.x:3000`. Sem link público, a
 * promessa "te mando a prévia" morre no meio.
 *
 * Solução sem conta e sem domínio: o `cloudflared` cria um endereço
 * `https://<aleatório>.trycloudflare.com` que aponta para cá. É efêmero (muda a
 * cada reinício), então serve para rodar e testar; para cliente fixo, o caminho é
 * túnel nomeado com domínio próprio ou uma VPS.
 *
 * Limites que precisam estar claros:
 * - o processo morre se o app fechar (a prévia cai junto);
 * - a URL muda a cada início;
 * - rede corporativa com bloqueio de túnel pode recusar.
 */
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export type TunnelProvider = "cloudflared";

export interface TunnelStatus {
  running: boolean;
  url: string | null;
  startedAt?: string;
  provider: TunnelProvider;
  /** De onde veio a URL, para o painel explicar ao operador. */
  source: "túnel" | "env" | "rede local" | "nenhuma";
  error?: string;
}

let processo: ChildProcessWithoutNullStreams | null = null;
let urlAtual: string | null = null;
let iniciadoEm: string | null = null;
let ultimoErro: string | null = null;
let iniciando: Promise<TunnelStatus> | null = null;

/** Caminhos onde o binário pode estar (env, pasta de tools do Hermes, PATH). */
export function cloudflaredPaths(): string[] {
  const candidatos: string[] = [];
  if (process.env.CLOUDFLARED_PATH) candidatos.push(process.env.CLOUDFLARED_PATH);
  const local = process.env.LOCALAPPDATA;
  if (local) candidatos.push(path.join(local, "hermes", "tools", "cloudflared", "cloudflared.exe"));
  candidatos.push("cloudflared");
  return candidatos;
}

export function cloudflaredAvailable(): boolean {
  return cloudflaredPaths().some((caminho) => {
    if (caminho === "cloudflared") return true; // resolvido pelo PATH no spawn
    try {
      return fs.existsSync(caminho);
    } catch {
      return false;
    }
  });
}

function binario(): string {
  for (const caminho of cloudflaredPaths()) {
    if (caminho === "cloudflared") continue;
    try {
      if (fs.existsSync(caminho)) return caminho;
    } catch {
      /* segue */
    }
  }
  return "cloudflared";
}

/** URL do túnel em memória (null quando não está no ar). */
export function currentTunnelUrl(): string | null {
  return processo && urlAtual ? urlAtual : null;
}

export function tunnelStatus(): TunnelStatus {
  const env = (process.env.PUBLIC_BASE_URL || "").trim().replace(/\/+$/, "");
  if (env) return { running: Boolean(processo), url: env, provider: "cloudflared", source: "env" };
  if (processo && urlAtual) {
    return { running: true, url: urlAtual, startedAt: iniciadoEm || undefined, provider: "cloudflared", source: "túnel" };
  }
  return { running: false, url: null, provider: "cloudflared", source: "nenhuma", error: ultimoErro || undefined };
}

/**
 * Sobe o túnel e devolve a URL pública.
 *
 * Idempotente: chamadas simultâneas compartilham a mesma promessa, e se já existe
 * túnel no ar devolve o atual sem abrir outro processo.
 */
export async function startTunnel(timeoutMs = 30_000): Promise<TunnelStatus> {
  if (processo && urlAtual) return tunnelStatus();
  if (iniciando) return iniciando;

  const porta = Number(process.env.PORT) || 3000;

  iniciando = new Promise<TunnelStatus>((resolve) => {
    let finalizado = false;
    const encerrar = (status: TunnelStatus) => {
      if (finalizado) return;
      finalizado = true;
      iniciando = null;
      resolve(status);
    };

    if (!cloudflaredAvailable()) {
      ultimoErro = "cloudflared não encontrado (instale o binário ou defina CLOUDFLARED_PATH).";
      encerrar({ running: false, url: null, provider: "cloudflared", source: "nenhuma", error: ultimoErro });
      return;
    }

    let filho: ChildProcessWithoutNullStreams;
    try {
      filho = spawn(binario(), ["tunnel", "--url", `http://127.0.0.1:${porta}`, "--no-autoupdate"], {
        windowsHide: true,
      });
    } catch (error: any) {
      ultimoErro = `não consegui iniciar o cloudflared: ${error?.message || error}`;
      encerrar({ running: false, url: null, provider: "cloudflared", source: "nenhuma", error: ultimoErro });
      return;
    }

    processo = filho;

    const ler = (chunk: Buffer) => {
      const texto = chunk.toString();
      const achado = texto.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
      if (achado && !urlAtual) {
        urlAtual = achado[0];
        iniciadoEm = new Date().toISOString();
        console.log(`[tunel] prévia pública em ${urlAtual}`);
        encerrar({ running: true, url: urlAtual, startedAt: iniciadoEm, provider: "cloudflared", source: "túnel" });
      }
      if (/ERR|error|failed/i.test(texto) && /cloudflared/i.test(texto)) ultimoErro = texto.trim().slice(0, 200);
    };

    filho.stdout.on("data", ler);
    filho.stderr.on("data", ler);

    filho.on("exit", (codigo) => {
      processo = null;
      urlAtual = null;
      iniciadoEm = null;
      if (codigo && codigo !== 0) ultimoErro = `cloudflared saiu com código ${codigo}`;
      console.warn(`[tunel] encerrado (código ${codigo})`);
    });

    setTimeout(() => {
      if (!urlAtual) {
        ultimoErro = ultimoErro || "o cloudflared não devolveu URL em 30s";
        encerrar({ running: false, url: null, provider: "cloudflared", source: "nenhuma", error: ultimoErro });
      }
    }, timeoutMs).unref?.();
  });

  return iniciando;
}

export function stopTunnel(): TunnelStatus {
  try {
    processo?.kill();
  } catch {
    /* best-effort */
  }
  processo = null;
  urlAtual = null;
  iniciadoEm = null;
  return tunnelStatus();
}
