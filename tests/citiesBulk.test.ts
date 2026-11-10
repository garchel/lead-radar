import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { app } from "../server";
import { getDb } from "../server/store/schema";
import { ensureCitiesLoaded } from "../server/store/db";

/**
 * Ação em lote na Fila de Cidades: desabilitar 100 cidades não pode custar
 * 100 cliques nem 100 requisições.
 */

let server: any;
let baseUrl = "";

function firstCodes(n: number): string[] {
  ensureCitiesLoaded();
  const rows = getDb()
    .prepare("SELECT ibge_code FROM cities ORDER BY ibge_code LIMIT ?")
    .all(n) as any[];
  return rows.map((r) => r.ibge_code);
}

describe("PATCH /api/cities (lote)", () => {
  beforeEach(async () => {
    server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it("desativa várias cidades de uma vez", async () => {
    const codes = firstCodes(3);
    expect(codes).toHaveLength(3);

    const res = await fetch(`${baseUrl}/api/cities`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codes, enabled: false }),
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.updated).toBe(3);

    const rows = getDb()
      .prepare(`SELECT enabled FROM cities WHERE ibge_code IN (${codes.map(() => "?").join(",")})`)
      .all(...codes) as any[];
    expect(rows.every((r) => r.enabled === 0)).toBe(true);

    // volta ao estado original para não contaminar outros testes
    await fetch(`${baseUrl}/api/cities`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codes, enabled: true }),
    });
  });

  it("informa códigos inexistentes sem falhar o lote inteiro", async () => {
    const [code] = firstCodes(1);
    const res = await fetch(`${baseUrl}/api/cities`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codes: [code, "9999999"], enabled: true }),
    });
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.updated).toBe(1);
    expect(data.missing).toContain("9999999");
  });

  it("valida entrada", async () => {
    const semCodes = await fetch(`${baseUrl}/api/cities`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: true }),
    });
    expect(semCodes.status).toBe(400);

    const semEnabled = await fetch(`${baseUrl}/api/cities`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codes: firstCodes(1) }),
    });
    expect(semEnabled.status).toBe(400);
  });
});
