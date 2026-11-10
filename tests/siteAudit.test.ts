import { afterAll, describe, expect, it } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import {
  analyzeSiteHtml,
  auditWebsite,
  normalizeSiteUrl,
  primaryAuditHook,
} from "../server/services/siteAuditService";

const GOOD_HTML = `<!doctype html>
<html><head>
<title>Clínica Sorriso — Dentista em Goiânia</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="Implantes e clareamento em Goiânia.">
<meta property="og:image" content="/og.png">
</head>
<body>
<h1>Clínica Sorriso</h1>
<a href="https://wa.me/5561999999999">Falar no WhatsApp</a>
<img src="a.jpg" alt="fachada"><img src="b.jpg" alt="sala"><img src="c.jpg" alt="equipe">
<p>© 2026 Clínica Sorriso</p>
</body></html>`;

function analyze(html: string, overrides: Partial<Parameters<typeof analyzeSiteHtml>[0]> = {}) {
  return analyzeSiteHtml({
    url: "https://clinica.com.br",
    html,
    https: true,
    httpStatus: 200,
    responseTimeMs: 900,
    sizeKb: 180,
    currentYear: 2026,
    ...overrides,
  });
}

const codes = (result: { issues: Array<{ code: string }> }) => result.issues.map((item) => item.code);

describe("normalizeSiteUrl", () => {
  it("completa o esquema quando o lead só tem o domínio", () => {
    expect(normalizeSiteUrl("clinica.com.br")).toBe("https://clinica.com.br/");
    expect(normalizeSiteUrl("http://clinica.com.br/site")).toBe("http://clinica.com.br/site");
  });

  it("descarta redes sociais e agregadores de link", () => {
    expect(normalizeSiteUrl("https://instagram.com/clinica")).toBeNull();
    expect(normalizeSiteUrl("instagram.com/clinica")).toBeNull();
    expect(normalizeSiteUrl("https://linktr.ee/clinica")).toBeNull();
  });

  it("rejeita vazio e endereço sem domínio", () => {
    expect(normalizeSiteUrl("")).toBeNull();
    expect(normalizeSiteUrl("   ")).toBeNull();
    expect(normalizeSiteUrl("localhost")).toBeNull();
  });
});

describe("analyzeSiteHtml", () => {
  it("site saudável não gera dor comercial", () => {
    const result = analyze(GOOD_HTML);
    expect(result.issues).toHaveLength(0);
    expect(result.healthScore).toBe(100);
    expect(result.painScore).toBe(0);
    expect(result.headline).toContain("saudável");
  });

  it("site sem viewport vira dor de celular (o gancho principal)", () => {
    const result = analyze(GOOD_HTML.replace(/<meta name="viewport"[^>]*>/, ""));
    expect(codes(result)).toContain("no_viewport");
    expect(result.headline).toMatch(/celular/i);
    expect(result.bullets[0]).toMatch(/celular/i);
    expect(result.painScore).toBeGreaterThan(0);
  });

  it("detecta lentidão e página pesada", () => {
    const result = analyze(GOOD_HTML, { responseTimeMs: 7200, sizeKb: 5200 });
    expect(codes(result)).toEqual(expect.arrayContaining(["slow_response", "heavy_page"]));
    expect(result.headline).toContain("7,2s");
    const slow = result.issues.find((item) => item.code === "slow_response");
    expect(slow?.severity).toBe("critical");
  });

  it("HTTP sem cadeado é falha crítica", () => {
    const result = analyze(GOOD_HTML, { https: false });
    expect(codes(result)).toContain("no_https");
    expect(result.issues[0].severity).toBe("critical");
  });

  it("site sem botão de WhatsApp e sem formulário", () => {
    const result = analyze(GOOD_HTML.replace(/<a href="https:\/\/wa\.me[^>]*>[^<]*<\/a>/, ""));
    expect(codes(result)).toEqual(expect.arrayContaining(["no_whatsapp_cta", "no_contact_cta"]));
  });

  it("rodapé desatualizado revela site abandonado", () => {
    const result = analyze(GOOD_HTML.replace("© 2026", "© 2019"));
    expect(codes(result)).toContain("outdated_copyright");
    expect(result.issues.find((item) => item.code === "outdated_copyright")?.title).toContain("2019");
  });

  it("texto de exemplo no ar é falha crítica", () => {
    const result = analyze(GOOD_HTML.replace("Implantes e clareamento em Goiânia.", "Lorem ipsum dolor sit amet"));
    expect(codes(result)).toContain("placeholder_content");
    expect(result.headline).toMatch(/texto de exemplo/i);
  });

  it("detecta a plataforma do site", () => {
    const result = analyze(
      GOOD_HTML.replace("</head>", '<meta name="generator" content="WordPress 5.8"><link href="/wp-content/x.css"></head>')
    );
    expect(result.tech).toEqual(expect.arrayContaining(["wordpress", "wordpress-5.8"]));
    expect(codes(result)).toContain("old_platform");
  });

  it("título e descrição ausentes são apontados", () => {
    const result = analyze(
      GOOD_HTML.replace(/<title>[^<]*<\/title>/, "").replace(/<meta name="description"[^>]*>/, "")
    );
    expect(codes(result)).toEqual(expect.arrayContaining(["no_title", "no_description"]));
  });
});

describe("auditWebsite (rede real contra servidor local)", () => {
  const servers: http.Server[] = [];

  afterAll(async () => {
    await Promise.all(
      servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve())))
    );
  });

  function serve(status: number, body: string): Promise<string> {
    return new Promise((resolve) => {
      const server = http.createServer((_req, res) => {
        res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
        res.end(body);
      });
      servers.push(server);
      server.listen(0, "127.0.0.1", () => {
        const { port } = server.address() as AddressInfo;
        resolve(`http://127.0.0.1:${port}`);
      });
    });
  }

  it("audita um site no ar e enxerga o HTTP sem cadeado", async () => {
    const url = await serve(200, GOOD_HTML);
    const audit = await auditWebsite(url);
    expect(audit.reachable).toBe(true);
    expect(audit.httpStatus).toBe(200);
    expect(audit.https).toBe(false);
    expect(audit.issues.map((item) => item.code)).toContain("no_https");
    expect(audit.responseTimeMs).toBeGreaterThanOrEqual(0);
    expect(audit.url).toBe(`${url}/`);
  });

  it("site que responde erro é tratado como fora do ar", async () => {
    const url = await serve(500, "<h1>erro</h1>");
    const audit = await auditWebsite(url);
    expect(audit.reachable).toBe(false);
    expect(audit.issues[0].code).toBe("unreachable");
    expect(audit.painScore).toBe(100);
    expect(audit.headline).toMatch(/erro 500/i);
  });

  it("403 de anti-bot não acusa o site do cliente", async () => {
    const url = await serve(403, "<html>blocked</html>");
    const audit = await auditWebsite(url);
    expect(audit.reachable).toBe(true);
    expect(audit.httpStatus).toBe(403);
    expect(audit.issues.map((item) => item.code)).toContain("audit_blocked");
    expect(audit.issues.map((item) => item.code)).not.toContain("unreachable");
    expect(audit.painScore).toBeLessThan(100);
  });

  it("porta fechada vira 'site fora do ar' sem lançar exceção", async () => {
    const audit = await auditWebsite("http://127.0.0.1:1");
    expect(audit.reachable).toBe(false);
    expect(audit.issues[0].code).toBe("unreachable");
    expect(audit.healthScore).toBe(0);
  });

  it("URL inválida lança erro claro", async () => {
    await expect(auditWebsite("instagram.com/loja")).rejects.toThrow(/URL inválida/i);
  });
});

describe("primaryAuditHook", () => {
  it("usa o defeito mais grave como gancho", async () => {
    const audit = await auditWebsite("http://127.0.0.1:1");
    expect(primaryAuditHook(audit)).toBe("unreachable");
  });

  it("sem auditoria devolve marcador próprio", () => {
    expect(primaryAuditHook(undefined)).toBe("sem_auditoria");
  });
});
