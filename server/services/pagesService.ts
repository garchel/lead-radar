/**
 * Publicação das prévias no Cloudflare Pages.
 *
 * Por que existe: o túnel (cloudflared) dá um endereço público, mas a URL muda a
 * cada reinício e cai quando o app fecha — o cliente que abrir depois vê erro. No
 * Pages a prévia é arquivo estático servido pela CDN: link estável, abre com o PC
 * desligado, sem custo de tráfego no plano Free.
 *
 * Limites do plano Free que importam aqui (docs, set/2026):
 * - 500 deploys/mês por conta → publicamos 1 deploy por prévia gerada;
 * - 20.000 arquivos por projeto, 25 MiB por arquivo → prévia tem ~4 KB;
 * - requisições e banda ilimitadas;
 * - HTML é servido em URL limpa (`/<slug>`), sem `.html`.
 */
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export interface PagesConfig {
  accountId: string;
  token: string;
  project: string;
  /** Subdomínio real do projeto (`<projeto>.pages.dev` ou com sufixo do Cloudflare). */
  subdomain: string | null;
}

export interface PagesPublishResult {
  ok: boolean;
  url: string | null;
  deploymentId?: string;
  error?: string;
  /** Nada mudou desde o último deploy bem-sucedido: não gastou deploy. */
  skipped?: boolean;
}

let subdominioCache: string | null = null;
let publicando: Promise<PagesPublishResult> | null = null;
let ultimoErro: string | null = null;

export function pagesConfig(): PagesConfig | null {
  const accountId = (process.env.CLOUDFLARE_ACCOUNT_ID || "").trim();
  const token = (process.env.CLOUDFLARE_API_TOKEN || "").trim();
  const project = (process.env.CF_PAGES_PROJECT || "").trim();
  if (!accountId || !token || !project) return null;
  return { accountId, token, project, subdomain: subdominioCache };
}

export function pagesConfigured(): boolean {
  return pagesConfig() !== null;
}

/** Base pública do Pages, depois de descobrir o subdomínio real do projeto. */
export async function pagesBaseUrl(): Promise<string | null> {
  if (!pagesConfigured()) return null;
  if (subdominioCache) return `https://${subdominioCache}`;

  const cfg = pagesConfig()!;
  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${cfg.accountId}/pages/projects/${cfg.project}`,
      { headers: { Authorization: `Bearer ${cfg.token}` } }
    );
    const dados: any = await res.json();
    if (!dados?.success) {
      ultimoErro = dados?.errors?.[0]?.message || "não consegui ler o projeto no Cloudflare";
      return null;
    }
    const sub = dados.result?.subdomain || dados.result?.domains?.[0] || null;
    subdominioCache = sub;
    return sub ? `https://${sub}` : null;
  } catch (error: any) {
    ultimoErro = error?.message || String(error);
    return null;
  }
}

/** URL pública limpa de um slug (Pages serve `/<slug>` para `<slug>.html`). */
export async function pagesPreviewUrl(slug: string): Promise<string | null> {
  const base = await pagesBaseUrl();
  return base ? `${base}/${slug}` : null;
}

/** Base já descoberta (síncrona): o resolvedor de URL não pode esperar rede. */
export function pagesCachedBase(): string | null {
  return subdominioCache ? `https://${subdominioCache}` : null;
}

export function pagesStatus(): { configured: boolean; project: string | null; baseUrl: string | null; error?: string } {
  const cfg = pagesConfig();
  return {
    configured: Boolean(cfg),
    project: cfg?.project || null,
    baseUrl: subdominioCache ? `https://${subdominioCache}` : null,
    error: ultimoErro || undefined,
  };
}

/**
 * Publica o diretório de prévias no Pages (produção do projeto).
 *
 * Usa o wrangler porque o upload direto pela API exige montar o fluxo de
 * multipart em três etapas; o CLI já faz isso e é o caminho documentado.
 */
/**
 * Regras de cache do projeto publicado.
 *
 * Sem isso o Cloudflare serve a prévia ANTIGA depois de uma correção — aconteceu
 * ao trocar a tipografia: a página nova tinha Playfair, o link entregava a versão
 * com fonte do sistema. HTML revalida sempre; arquivo com hash no nome pode ficar
 * em cache para sempre.
 */
export function ensureCacheHeaders(dir: string): void {
  const arquivo = path.join(dir, "_headers");
  const conteudo = `/*
  Cache-Control: public, max-age=0, must-revalidate
  X-Robots-Tag: noindex, nofollow

/assets/*
  Cache-Control: public, max-age=31536000, immutable
`;
  try {
    fs.mkdirSync(dir, { recursive: true });
    const atual = fs.existsSync(arquivo) ? fs.readFileSync(arquivo, "utf8") : "";
    if (atual !== conteudo) fs.writeFileSync(arquivo, conteudo, "utf8");
  } catch (erro: any) {
    console.warn(`[pages] não consegui escrever _headers: ${erro?.message || erro}`);
  }
}

/** Impressão digital da pasta publicada: nome, tamanho e mtime de cada arquivo. */
function fingerprint(dir: string): string {
  const partes: string[] = [];
  const anda = (atual: string, prefixo: string) => {
    for (const entrada of fs.readdirSync(atual, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const caminho = path.join(atual, entrada.name);
      if (entrada.isDirectory()) {
        anda(caminho, `${prefixo}${entrada.name}/`);
        continue;
      }
      const st = fs.statSync(caminho);
      partes.push(`${prefixo}${entrada.name}:${st.size}:${Math.round(st.mtimeMs)}`);
    }
  };
  try {
    anda(dir, "");
  } catch {
    return `erro-${Date.now()}`;
  }
  return crypto.createHash("sha1").update(partes.join("|")).digest("hex").slice(0, 16);
}

/**
 * Uma trava por máquina.
 *
 * O `publicando` só protege este processo; dois processos do app (ou uma chamada
 * manual enquanto a simulação publica) disputavam o mesmo projeto no Cloudflare e
 * o segundo levava "a deployment is already in progress". A trava é um arquivo no
 * diretório de dados, com validade curta para não travar para sempre se o processo
 * morrer no meio.
 */
const LOCK_TTL_MS = 3 * 60_000;

function lockPath(): string {
  const dataDir = process.env.LEADRADAR_DATA_DIR || path.join(process.cwd(), "data");
  return path.join(dataDir, ".pages-deploy.lock");
}

async function comTrava<T>(esperaMaxMs: number, tarefa: () => Promise<T>): Promise<T> {
  const arquivo = lockPath();
  const inicio = Date.now();
  try {
    fs.mkdirSync(path.dirname(arquivo), { recursive: true });
  } catch {
    /* best-effort */
  }

  for (;;) {
    try {
      fs.writeFileSync(arquivo, JSON.stringify({ pid: process.pid, em: Date.now() }), { flag: "wx" });
      break;
    } catch (erro: any) {
      if (erro?.code !== "EEXIST") break; // pasta sem permissão: segue sem trava
      let idade = 0;
      try {
        idade = Date.now() - fs.statSync(arquivo).mtimeMs;
      } catch {
        continue; // sumiu entre o stat e agora: tenta de novo
      }
      if (idade > LOCK_TTL_MS) {
        try {
          fs.unlinkSync(arquivo);
        } catch {
          /* outro processo limpou */
        }
        continue;
      }
      if (Date.now() - inicio > esperaMaxMs) {
        // esperou demais: publica assim mesmo, é melhor tentar do que não entregar
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }

  try {
    return await tarefa();
  } finally {
    try {
      const dono = JSON.parse(fs.readFileSync(arquivo, "utf8"));
      if (dono?.pid === process.pid) fs.unlinkSync(arquivo);
    } catch {
      /* já liberado */
    }
  }
}

/** Erro do Cloudflare quando outro deploy está em andamento (dá para tentar de novo). */
function ehDeployConcorrente(saida: string): boolean {
  return /already in progress|another deployment|concurrent|currently deploying|deployment is being|429/i.test(saida);
}

/** wrangler local (se instalado) evita baixar o CLI a cada deploy e a versão variar. */
function comandoWrangler(): { bin: string; prefixo: string[] } {
  const local = path.join(process.cwd(), "node_modules", ".bin", process.platform === "win32" ? "wrangler.cmd" : "wrangler");
  if (fs.existsSync(local)) return { bin: local, prefixo: [] };
  return { bin: "npx", prefixo: ["-y", "wrangler@4"] };
}


/** Primeira página HTML publicável do diretório (para conferir se subiu de verdade). */
function primeiraPagina(dir: string): string | null {
  try {
    const arquivo = fs.readdirSync(dir).filter((f) => f.endsWith(".html")).sort()[0];
    return arquivo || null;
  } catch {
    return null;
  }
}

/** Confere de verdade se a página responde conteúdo no ar (ignora cache). */
async function conferirNoAr(url: string): Promise<boolean> {
  try {
    const alvo = `${url}?verificacao=${Date.now()}`;
    const resposta = await fetch(alvo, { headers: { "Cache-Control": "no-cache" }, signal: AbortSignal.timeout(20_000) });
    if (!resposta.ok) return false;
    const texto = await resposta.text();
    return texto.length > 500;
  } catch {
    return false;
  }
}

function rodarWrangler(dir: string, cfg: { project: string; token: string; accountId: string }, timeoutMs: number): Promise<PagesPublishResult> {
  return new Promise<PagesPublishResult>((resolve) => {
    let saida = "";
    let encerrado = false;
    const fim = (resultado: PagesPublishResult) => {
      if (encerrado) return;
      encerrado = true;
      resolve(resultado);
    };

    const { bin, prefixo } = comandoWrangler();
    const filho = spawn(
      bin,
      [...prefixo, "pages", "deploy", dir, `--project-name=${cfg.project}`, "--branch=main", "--commit-dirty=true"],
      {
        shell: true,
        env: { ...process.env, CLOUDFLARE_API_TOKEN: cfg.token, CLOUDFLARE_ACCOUNT_ID: cfg.accountId },
        windowsHide: true,
      }
    );

    filho.stdout.on("data", (b: Buffer) => {
      saida += b.toString();
    });
    filho.stderr.on("data", (b: Buffer) => {
      saida += b.toString();
    });
    filho.on("error", (e: any) => {
      ultimoErro = e?.message || String(e);
      fim({ ok: false, url: null, error: ultimoErro || undefined });
    });
    filho.on("exit", (codigo) => {
      const sub = saida.match(/https:\/\/[a-z0-9-]+\.pages\.dev/i);
      // o subdomínio do projeto (sem o hash do deployment) é o que fica estável
      const raiz = saida.match(/([a-z0-9-]+)\.pages\.dev/i);
      if (raiz && !subdominioCache && !/^[0-9a-f]{8}$/i.test(raiz[1])) subdominioCache = `${raiz[1]}.pages.dev`;

      if (codigo === 0) {
        ultimoErro = null;
        // quando nada mudou o wrangler não imprime a URL; a base do projeto serve
        fim({ ok: true, url: sub ? sub[0] : subdominioCache ? `https://${subdominioCache}` : null });
      } else {
        ultimoErro = `wrangler saiu com código ${codigo}: ${saida.slice(-300)}`;
        fim({ ok: false, url: null, error: ultimoErro });
      }
    });

    setTimeout(() => {
      try {
        filho.kill();
      } catch {
        /* best-effort */
      }
      ultimoErro = `o deploy passou de ${Math.round(timeoutMs / 1000)}s e foi interrompido`;
      fim({ ok: false, url: null, error: ultimoErro });
    }, timeoutMs).unref?.();
  });
}

let ultimoDeploy: { hash: string; url: string | null } | null = null;

export async function publishPreviews(
  dir: string,
  opts: { timeoutMs?: number; force?: boolean } = {}
): Promise<PagesPublishResult> {
  // 90s não bastava: sem wrangler local o npx baixa o pacote antes de subir, e o
  // deploy era morto no meio — o projeto ficava sem deployment válido e as prévias
  // respondiam 404 (aconteceu nesta sessão). 240s dá folga para o download frio.
  const timeoutMs = opts.timeoutMs ?? 240_000;
  const cfg = pagesConfig();
  if (!cfg) return { ok: false, url: null, error: "Cloudflare Pages não configurado (token, conta ou projeto)." };
  ensureCacheHeaders(dir);

  // Nada mudou desde o último deploy: não gasta um deploy (e não disputa com outro).
  const hash = fingerprint(dir);
  if (!opts.force && ultimoDeploy?.hash === hash) {
    return { ok: true, url: ultimoDeploy.url, skipped: true };
  }

  if (publicando) return publicando;

  publicando = (async () => {
    try {
      return await comTrava(timeoutMs, async () => {
        let resultado = await rodarWrangler(dir, cfg, timeoutMs);
        // Deploy concorrente é transitório: espera o outro assentar e tenta de novo.
        const esperas = [10_000, 20_000, 30_000];
        for (let tentativa = 0; !resultado.ok && tentativa < esperas.length; tentativa += 1) {
          if (!ehDeployConcorrente(resultado.error || "")) break;
          await new Promise((resolve) => setTimeout(resolve, esperas[tentativa]));
          resultado = await rodarWrangler(dir, cfg, timeoutMs);
        }
        if (resultado.ok) {
          // Deploy "ok" que deixa produção em 404 já aconteceu: o wrangler sobe,
          // o processo morre no meio e o CF fica servindo um deployment vazio. O
          // sintoma é site inteiro em 404 e a resposta dizendo sucesso. Aqui a
          // gente confere na URL pública e, se estiver quebrado, refaz o deploy.
          const alvo = primeiraPagina(dir);
          if (alvo) {
            const noAr = await conferirNoAr(`${resultado.url || ""}/${alvo}`);
            if (!noAr) {
              console.warn(`[pages] deploy voltou ok mas ${alvo} não está no ar: refazendo`);
              const segunda = await rodarWrangler(dir, cfg, timeoutMs);
              const okFinal = segunda.ok && (await conferirNoAr(`${segunda.url || ""}/${alvo}`));
              if (!okFinal) {
                return { ok: false, url: null, error: "deploy publicado mas a página não responde no ar (verificado na URL pública)" };
              }
              ultimoDeploy = { hash, url: segunda.url };
              return segunda;
            }
          }
          ultimoDeploy = { hash, url: resultado.url };
        }
        return resultado;
      });
    } finally {
      publicando = null;
    }
  })();

  return publicando;
}
