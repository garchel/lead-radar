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
import { spawn } from "node:child_process";
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
export async function publishPreviews(dir: string, timeoutMs = 90_000): Promise<PagesPublishResult> {
  const cfg = pagesConfig();
  if (!cfg) return { ok: false, url: null, error: "Cloudflare Pages não configurado (token, conta ou projeto)." };
  if (publicando) return publicando;

  publicando = new Promise<PagesPublishResult>((resolve) => {
    let saida = "";
    let encerrado = false;
    const fim = (resultado: PagesPublishResult) => {
      if (encerrado) return;
      encerrado = true;
      publicando = null;
      resolve(resultado);
    };

    const filho = spawn(
      "npx",
      [
        "-y",
        "wrangler@latest",
        "pages",
        "deploy",
        dir,
        `--project-name=${cfg.project}`,
        "--branch=main",
        "--commit-dirty=true",
      ],
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
      ultimoErro = "o deploy passou de 90s e foi interrompido";
      fim({ ok: false, url: null, error: ultimoErro });
    }, timeoutMs).unref?.();
  });

  return publicando;
}
