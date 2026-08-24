import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveWhatsappProvider } from "../server/services/contactService";
import { getSetting, setSetting } from "../server/store/db";

function cleanEnvs() {
  delete process.env.WHATSAPP_PROVIDER;
  delete process.env.EVOLUTION_API_URL;
  delete process.env.META_WHATSAPP_TOKEN;
  delete process.env.META_PHONE_NUMBER_ID;
  delete process.env.WHATSAPP_API_URL;
}

describe("resolveWhatsappProvider", () => {
  beforeEach(() => {
    cleanEnvs();
    setSetting("whatsapp_provider", ""); // reseta escolha da UI
  });

  afterEach(() => {
    setSetting("whatsapp_provider", "");
  });

  it("retorna null sem nenhum backend configurado", () => {
    const r = resolveWhatsappProvider();
    expect(r.provider).toBeNull();
  });

  it("auto resolve na ordem evolution → meta → legacy", () => {
    process.env.EVOLUTION_API_URL = "http://localhost:8080";
    process.env.META_WHATSAPP_TOKEN = "tok";
    process.env.META_PHONE_NUMBER_ID = "123";
    process.env.WHATSAPP_API_URL = "https://legado.exemplo";
    expect(resolveWhatsappProvider().provider).toBe("evolution");

    delete process.env.EVOLUTION_API_URL;
    expect(resolveWhatsappProvider().provider).toBe("meta");

    delete process.env.META_WHATSAPP_TOKEN;
    delete process.env.WHATSAPP_API_URL;
    expect(resolveWhatsappProvider().provider).toBeNull(); // meta exige token+phoneId e sem fallback

    process.env.META_WHATSAPP_TOKEN = "tok";
    delete process.env.META_PHONE_NUMBER_ID;
    process.env.WHATSAPP_API_URL = "https://legado.exemplo";
    expect(resolveWhatsappProvider().provider).toBe("legacy");
  });

  it("escolha manual via env força o backend", () => {
    process.env.EVOLUTION_API_URL = "http://localhost:8080";
    process.env.META_WHATSAPP_TOKEN = "tok";
    process.env.META_PHONE_NUMBER_ID = "123";
    process.env.WHATSAPP_PROVIDER = "meta";
    expect(resolveWhatsappProvider().provider).toBe("meta");
  });

  it("escolha manual sem credenciais falha com motivo claro", () => {
    process.env.EVOLUTION_API_URL = "http://localhost:8080";
    process.env.WHATSAPP_PROVIDER = "meta";
    const r = resolveWhatsappProvider();
    expect(r.provider).toBeNull();
    expect(r.reason).toContain("META_WHATSAPP_TOKEN");
  });

  it("escolha persistida na UI tem precedência sobre o env", () => {
    process.env.EVOLUTION_API_URL = "http://localhost:8080";
    process.env.META_WHATSAPP_TOKEN = "tok";
    process.env.META_PHONE_NUMBER_ID = "123";
    setSetting("whatsapp_provider", "meta");
    expect(resolveWhatsappProvider().provider).toBe("meta");
    expect(getSetting("whatsapp_provider")).toBe("meta");
  });
});
