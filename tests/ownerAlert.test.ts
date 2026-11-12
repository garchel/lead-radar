import { beforeEach, describe, expect, it } from "vitest";
import {
  ALERT_COOLDOWN_MINUTES,
  ALERT_DAILY_CAP,
  ensureAlertTable,
  formatOwnerAlert,
  maskPhone,
  ownerAlertPhone,
  sendOwnerAlert,
  setOwnerAlertPhone,
  shouldSkipAlert,
} from "../server/services/ownerAlertService";
import { getDb } from "../server/store/schema";
import { setSetting } from "../server/store/db";

beforeEach(() => {
  ensureAlertTable();
  getDb().exec("DELETE FROM owner_alerts");
  setSetting("owner_alert_enabled", "true");
  setSetting("owner_alert_phone", "5561999998888");
});

describe("número do aviso", () => {
  it("normaliza para dígitos", () => {
    setOwnerAlertPhone("+55 (61) 99999-8888");
    expect(ownerAlertPhone()).toBe("5561999998888");
  });

  it("recusa número curto demais", () => {
    setOwnerAlertPhone("1234");
    expect(ownerAlertPhone()).toBeNull();
  });

  it("mascara sem expor o número inteiro", () => {
    const mascarado = maskPhone("5561999998888");
    expect(mascarado).toContain("*****");
    expect(mascarado).toContain("8888");
    expect(mascarado).not.toContain("9999988");
  });
});

describe("texto do aviso", () => {
  it("diz quem ficou sem resposta e por quê", () => {
    const texto = formatOwnerAlert({
      kind: "ia_falhou",
      detail: "IA indisponível",
      leadName: "Barbearia Navalha",
      leadPhone: "5561999990000",
    });
    expect(texto).toContain("*Barbearia Navalha*");
    expect(texto).toContain("a IA não conseguiu escrever a resposta");
    expect(texto).toContain("Assume quando puder");
  });

  it("não usa travessão e é curto", () => {
    const texto = formatOwnerAlert({ kind: "envio_falhou", detail: "gateway HTTP 500", leadName: "X" });
    expect(texto).not.toMatch(/[\u2014\u2013]/);
    expect(texto.length).toBeLessThan(400);
  });

  it("corta detalhe gigante", () => {
    const texto = formatOwnerAlert({ kind: "clara_falhou", detail: "erro ".repeat(200) });
    expect(texto.length).toBeLessThan(450);
  });
});

describe("antispam do aviso", () => {
  const agora = new Date("2026-11-12T15:00:00.000Z");

  it("não repete o mesmo lead dentro do cooldown", () => {
    const historico = [
      { kind: "ia_falhou", leadId: "lead_1", sentAt: "2026-11-12T14:50:00.000Z", status: "sent" },
    ];
    const r = shouldSkipAlert(historico, { kind: "ia_falhou", detail: "x", leadId: "lead_1" }, agora);
    expect(r.skip).toBe(true);
    expect(r.reason).toBe("cooldown");
  });

  it("passa do cooldown e avisa de novo", () => {
    const historico = [
      { kind: "ia_falhou", leadId: "lead_1", sentAt: "2026-11-12T14:30:00.000Z", status: "sent" },
    ];
    const r = shouldSkipAlert(historico, { kind: "ia_falhou", detail: "x", leadId: "lead_1" }, agora);
    expect(r.skip).toBe(false);
  });

  it("outro lead avisa na hora", () => {
    const historico = [
      { kind: "ia_falhou", leadId: "lead_1", sentAt: "2026-11-12T14:59:00.000Z", status: "sent" },
    ];
    expect(shouldSkipAlert(historico, { kind: "ia_falhou", detail: "x", leadId: "lead_2" }, agora).skip).toBe(false);
  });

  it("falha de envio anterior não conta como aviso enviado", () => {
    const historico = [
      { kind: "ia_falhou", leadId: "lead_1", sentAt: "2026-11-12T14:59:00.000Z", status: "failed" },
    ];
    expect(shouldSkipAlert(historico, { kind: "ia_falhou", detail: "x", leadId: "lead_1" }, agora).skip).toBe(false);
  });

  it("respeita o teto diário", () => {
    const historico = Array.from({ length: ALERT_DAILY_CAP }, (_, i) => ({
      kind: "ia_falhou",
      leadId: `lead_${i}`,
      sentAt: `2026-11-12T1${Math.floor(i / 10)}:00:00.000Z`,
      status: "sent",
    }));
    const r = shouldSkipAlert(historico, { kind: "ia_falhou", detail: "x", leadId: "lead_novo" }, agora);
    expect(r.skip).toBe(true);
    expect(r.reason).toBe("teto_diario");
  });
});

describe("envio do aviso", () => {
  it("registra a tentativa mesmo sem gateway configurado", async () => {
    const r = await sendOwnerAlert({ kind: "teste", detail: "sem gateway no teste" });
    expect(r.sent).toBe(false);
    const linhas = getDb().prepare("SELECT status FROM owner_alerts").all() as any[];
    expect(linhas.length).toBe(1);
    expect(linhas[0].status).toBe("failed");
  });

  it("não envia quando está desligado no painel", async () => {
    setSetting("owner_alert_enabled", "false");
    const r = await sendOwnerAlert({ kind: "teste", detail: "x" });
    expect(r.sent).toBe(false);
    expect(r.detail).toContain("desligado");
    expect((getDb().prepare("SELECT COUNT(*) c FROM owner_alerts").get() as any).c).toBe(0);
  });

  it("não envia sem número configurado", async () => {
    setSetting("owner_alert_phone", "");
    const r = await sendOwnerAlert({ kind: "teste", detail: "x" });
    expect(r.sent).toBe(false);
    expect(r.detail).toContain("não configurado");
  });

  it("suprime repetição do mesmo lead", async () => {
    getDb()
      .prepare(
        "INSERT INTO owner_alerts (id, kind, detail, lead_id, lead_name, phone, status, sent_at) VALUES (?,?,?,?,?,?,?,?)"
      )
      .run("a1", "ia_falhou", "x", "lead_9", "Lead 9", "5561999998888", "sent", new Date().toISOString());
    const r = await sendOwnerAlert({ kind: "ia_falhou", detail: "de novo", leadId: "lead_9" });
    expect(r.sent).toBe(false);
    expect(r.deduped).toBe(true);
  });
});
