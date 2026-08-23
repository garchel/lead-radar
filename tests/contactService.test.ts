import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  contactLead,
  sendEmail,
  sendWhatsApp,
} from "../server/services/contactService";
import { upsertLead } from "../server/store/db";
import type { StoredLead } from "../server/store/types";

const leadWithPhone: StoredLead = {
  id: "contact-1",
  name: "Empresa A",
  phone: "(11) 98765-4321",
  pipelineStatus: "prospect",
};
const leadWithEmail: StoredLead = {
  id: "contact-2",
  name: "Empresa B",
  email: "contato@empresa.com",
  pipelineStatus: "prospect",
};
const leadWithIA: StoredLead = {
  ...leadWithPhone,
  id: "contact-3",
  phone: "(11) 98765-4322",
  analysis: { customPitchWhatsApp: "PITCH-GERADO-PELA-IA" },
};

// O serviço de contato registra comunicações que possuem FK para `leads(id)`,
// então os leads precisam existir no banco antes do envio (assim como em produção).
beforeEach(() => {
  upsertLead(leadWithPhone);
  upsertLead(leadWithEmail);
  upsertLead(leadWithIA);
});

describe("sendWhatsApp", () => {
  beforeEach(() => {
    delete process.env.WHATSAPP_API_URL;
    delete process.env.WHATSAPP_API_TOKEN;
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("falha sem WHATSAPP_API_URL e não registra falso envio", async () => {
    const r = await sendWhatsApp(leadWithPhone, "Olá! Teste.");
    expect(r.channel).toBe("whatsapp");
    expect(r.status).toBe("failed");
    expect(r.detail).toContain("Nenhum backend WhatsApp configurado");
    expect(r.to).toBe("5511987654321");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("falha sem telefone e não chama a API", async () => {
    const r = await sendWhatsApp({ ...leadWithPhone, phone: "" }, "msg");
    expect(r.status).toBe("failed");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("faz POST real e retorna sent quando a API está configurada", async () => {
    process.env.WHATSAPP_API_URL = "https://api.exemplo/zapi";
    process.env.WHATSAPP_API_TOKEN = "tok";
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } })
    );

    const r = await sendWhatsApp(leadWithPhone, "Olá! Teste.");
    expect(r.status).toBe("sent");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].body).toBe(
      JSON.stringify({ token: "tok", to: "5511987654321", message: "Olá! Teste." })
    );
  });

  it("marca como failed quando a API retorna erro HTTP", async () => {
    process.env.WHATSAPP_API_URL = "https://api.exemplo/zapi";
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response("{}", { status: 500 })
    );
    const r = await sendWhatsApp(leadWithPhone, "msg");
    expect(r.status).toBe("failed");
  });
});

describe("sendEmail", () => {
  beforeEach(() => {
    delete process.env.SMTP_HOST;
  });

  it("falha sem SMTP_HOST e não registra falso envio", async () => {
    const r = await sendEmail(leadWithEmail, "Assunto", "Corpo da mensagem");
    expect(r.channel).toBe("email");
    expect(r.status).toBe("failed");
    expect(r.detail).toContain("nenhum e-mail foi enviado");
    expect(r.to).toBe("contato@empresa.com");
  });

  it("falha quando o lead não tem e-mail", async () => {
    const r = await sendEmail(leadWithPhone, "Assunto", "Corpo");
    expect(r.status).toBe("failed");
  });
});

describe("contactLead (seleção de canal e pitch)", () => {
  beforeEach(() => {
    delete process.env.WHATSAPP_API_URL;
    delete process.env.SMTP_HOST;
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("falha quando há telefone, mas não existe mensagem ou pitch persistido", async () => {
    await expect(contactLead(leadWithPhone)).rejects.toThrow("mensagem");
  });

  it("falha quando há e-mail, mas não existe mensagem ou pitch persistido", async () => {
    await expect(contactLead(leadWithEmail)).rejects.toThrow("mensagem");
  });

  it("usa o pitch gerado por IA do lead quando nenhuma mensagem é fornecida", async () => {
    process.env.WHATSAPP_API_URL = "https://api.exemplo/zapi";
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } })
    );
    await contactLead(leadWithIA);
    const sentBody = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].body;
    expect(sentBody).toContain("PITCH-GERADO-PELA-IA");
  });
});