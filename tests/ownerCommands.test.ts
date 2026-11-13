import { describe, expect, it } from "vitest";
import {
  conversasDeHoje,
  conversasParadas,
  foraDaJanela,
  handleOwnerCommand,
  isOwnerCommand,
  isOwnerPhone,
  ownerPhones,
} from "../server/services/ownerCommandService";
import { setSetting } from "../server/store/db";
import type { StoredLead } from "../server/store/types";

const leadDono = { id: "lead-dono", name: "Paulo", phone: "5561999998888", pipelineStatus: "new" } as unknown as StoredLead;

describe("comando do dono pelo WhatsApp", () => {
  it("só reconhece comando com prefixo (senão é conversa de lead)", () => {
    expect(isOwnerCommand("/hoje")).toBe(true);
    expect(isOwnerCommand("  /fora ")).toBe(true);
    expect(isOwnerCommand("hoje")).toBe(false);
    expect(isOwnerCommand("oi, tudo bem?")).toBe(false);
  });

  it("reconhece o número do dono com e sem o nono dígito", () => {
    setSetting("owner_alert_phone", "5561999998888");
    const donos = ownerPhones();
    expect(donos.length).toBeGreaterThan(0);
    const numero = donos[0];
    expect(isOwnerPhone(`+${numero}`)).toBe(true);
    // mesmo número sem o nono dígito (cadastro antigo de 12 dígitos)
    const semNove = `${numero.slice(0, 4)}${numero.slice(5)}`;
    expect(isOwnerPhone(semNove)).toBe(true);
    expect(isOwnerPhone("5511999990000")).toBe(false);
  });

  it("/ajuda lista os comandos", async () => {
    const r = await handleOwnerCommand(leadDono, "/ajuda", { enviar: false });
    expect(r.handled).toBe(true);
    for (const comando of ["/hoje", "/pendentes", "/fora", "/lead", "/status", "/pausar"]) {
      expect(r.reply).toContain(comando);
    }
  });

  it("/hoje responde número de conversas e não inventa quando não há", async () => {
    const r = await handleOwnerCommand(leadDono, "/hoje", { enviar: false });
    expect(r.handled).toBe(true);
    expect(r.reply).toMatch(/Hoje:|não chegou nenhuma mensagem/);
  });

  it("/status mostra o estado real da automação", async () => {
    const r = await handleOwnerCommand(leadDono, "/status", { enviar: false });
    expect(r.reply).toMatch(/Agente: (ligado|pausado)/);
    expect(r.reply).toContain("7h às 20h");
  });

  it("comando desconhecido não quebra e devolve a ajuda", async () => {
    const r = await handleOwnerCommand(leadDono, "/inventado", { enviar: false });
    expect(r.handled).toBe(true);
    expect(r.reply).toContain("Não conheço");
  });

  it("texto normal não é tratado como comando", async () => {
    const r = await handleOwnerCommand(leadDono, "quanto custa?", { enviar: false });
    expect(r.handled).toBe(false);
  });

  it("consultas devolvem listas (nunca undefined)", () => {
    expect(Array.isArray(conversasParadas(5, 5))).toBe(true);
    expect(Array.isArray(foraDaJanela(24))).toBe(true);
    const hoje = conversasDeHoje();
    expect(typeof hoje.recebidas).toBe("number");
    expect(Array.isArray(hoje.pendentes)).toBe(true);
  });
});
