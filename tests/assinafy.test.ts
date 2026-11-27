import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  baixarAssinado,
  configAssinafy,
  criarSignatario,
  pedirAssinatura,
  situacaoDoDocumento,
  subirDocumento,
} from "../server/services/assinafyService";

/**
 * O cliente do Assinafy é conferido contra o contrato que está no OpenAPI oficial
 * (api.assinafy.com.br/v1/docs/openapi.json): header X-Api-Key, multipart com campo
 * `file`, signatário com full_name/email/whatsapp_phone_number e assignment com
 * method + signers[].verification_method.
 *
 * Aqui não se testa o serviço deles — testa-se que mandamos o que o contrato exige.
 */

const ANTES = { ...process.env };

function resposta(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });
}

describe("cliente do Assinafy", () => {
  beforeEach(() => {
    process.env.ASSINAFY_API_KEY = "chave-de-teste";
    process.env.ASSINAFY_ACCOUNT_ID = "conta-123";
  });

  afterEach(() => {
    process.env = { ...ANTES };
    vi.restoreAllMocks();
  });

  it("sem chave, não finge que está configurado", () => {
    delete process.env.ASSINAFY_API_KEY;
    expect(configAssinafy()).toBeNull();
  });

  it("sobe o PDF como multipart com o campo 'file' e o header X-Api-Key", async () => {
    const espiao = vi.spyOn(globalThis, "fetch").mockResolvedValue(resposta({ data: { id: "doc-1" } }));
    const id = await subirDocumento(Buffer.from("%PDF-1.7 teste"), "contrato.pdf");

    expect(id).toBe("doc-1");
    const [url, init] = espiao.mock.calls[0];
    expect(String(url)).toBe("https://api.assinafy.com.br/v1/accounts/conta-123/documents");
    expect(init!.method).toBe("POST");
    expect((init!.headers as any)["X-Api-Key"]).toBe("chave-de-teste");
    const form = init!.body as FormData;
    expect(form.get("file")).toBeTruthy();
  });

  it("cria o signatário com nome, e-mail e WhatsApp", async () => {
    const espiao = vi.spyOn(globalThis, "fetch").mockResolvedValue(resposta({ data: { id: "sig-9" } }));
    const id = await criarSignatario({
      nome: "Dicore Barbearia",
      email: "dicore@exemplo.com",
      whatsapp: "+5561999990000",
    });

    expect(id).toBe("sig-9");
    const corpo = JSON.parse((espiao.mock.calls[0][1]!.body as string) || "{}");
    expect(corpo).toEqual({
      full_name: "Dicore Barbearia",
      email: "dicore@exemplo.com",
      whatsapp_phone_number: "+5561999990000",
    });
  });

  it("pede assinatura com method virtual e verificação por e-mail", async () => {
    const espiao = vi.spyOn(globalThis, "fetch").mockResolvedValue(resposta({ data: { id: "asg-1" } }));
    await pedirAssinatura("doc-1", "sig-9");

    const [url, init] = espiao.mock.calls[0];
    expect(String(url)).toBe("https://api.assinafy.com.br/v1/documents/doc-1/assignments");
    expect(JSON.parse(init!.body as string)).toEqual({
      method: "virtual",
      signers: [{ id: "sig-9", verification_method: "Email" }],
    });
  });

  it("reconhece documento assinado pelo status", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(resposta({ data: { id: "doc-1", status: "signed" } }));
    const s = await situacaoDoDocumento("doc-1");
    expect(s.assinado).toBe(true);

    vi.spyOn(globalThis, "fetch").mockResolvedValue(resposta({ data: { id: "doc-2", status: "pending" } }));
    expect((await situacaoDoDocumento("doc-2")).assinado).toBe(false);
  });

  it("erro da API não vira sucesso silencioso", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      resposta({ message: "Document already has an active assignment", details: { code: "CONFLICT" } }, 409),
    );
    await expect(pedirAssinatura("doc-1", "sig-9")).rejects.toThrow(/active assignment/);
  });

  it("baixa o PDF assinado em bytes", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(new Uint8Array([37, 80, 68, 70]), { status: 200 }));
    const pdf = await baixarAssinado("doc-1");
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
  });
});
