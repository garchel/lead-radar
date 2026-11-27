import { describe, expect, it } from "vitest";
import { recordCommunication, upsertLead } from "../server/store/db";
import {
  contextoDaConversa,
  deveEntregarPagina,
  ehElogio,
  etapaDoFunil,
  pedidoDeLink,
} from "../server/services/conversationContextService";
import type { StoredLead } from "../server/store/types";

function makeLead(id: string, overrides: Partial<StoredLead> = {}): StoredLead {
  const now = new Date().toISOString();
  return {
    id,
    name: "Barbearia Teste",
    // telefone único por lead: o CRM deduplica por telefone e o lead novo herdaria
    // o id antigo, quebrando a FK do teste seguinte.
    phone: `55619${String(Date.now()).slice(-8)}${Math.floor(Math.random() * 90 + 10)}`,
    city: "Três Lagoas",
    websiteStatus: "none",
    savedAt: now,
    updatedAt: now,
    ...overrides,
  } as StoredLead;
}

/** Espera o suficiente para a ordem por created_at separar as mensagens. */
const espera = (ms = 5) => new Promise((r) => setTimeout(r, ms));

describe("memória da conversa", () => {
  describe("pedidoDeLink", () => {
    it("elogio não é pedido de link", () => {
      for (const t of ["Achei legal demais", "gostei muito", "ficou bom", "top 👏", "perfeito"]) {
        expect(pedidoDeLink(t), t).toBe(false);
      }
    });

    it("dúvida e objeção não são pedido de link", () => {
      for (const t of ["quanto custa?", "vou pensar", "já tenho site", "achei feio"]) {
        expect(pedidoDeLink(t), t).toBe(false);
      }
    });

    it("pedido explícito é pedido de link", () => {
      for (const t of [
        "manda de novo",
        "pode reenviar o link",
        "não achei o link",
        "não abriu aqui",
        "cadê o link?",
        "me manda o site outra vez",
      ]) {
        expect(pedidoDeLink(t), t).toBe(true);
      }
    });
  });

  describe("ehElogio", () => {
    it("reconhece elogio", () => {
      for (const t of ["Achei legal demais", "gostei", "ficou bonito", "amei", "tá top"]) {
        expect(ehElogio(t), t).toBe(true);
      }
    });
    it("não confunde crítica com elogio", () => {
      for (const t of ["achei feio", "não gostei", "ficou ruim"]) {
        expect(ehElogio(t), t).toBe(false);
      }
    });
  });

  describe("deveEntregarPagina", () => {
    const semEntrega = {
      paginaEntregue: false,
      paginaUrl: null,
      entregueEm: null,
      vezesEntregue: 0,
      respostasDoLead: 1,
      elogiouDepoisDeVer: false,
      aguardandoResposta: true,
      travadaPorAviso: false,
      fallbackFalou: false,
      silencioHoras: 0,
    };

    it("entrega na primeira vez", () => {
      expect(deveEntregarPagina(semEntrega, "pode mandar").entregar).toBe(true);
    });

    it("não reentrega depois de elogio (o caso real)", () => {
      const d = deveEntregarPagina({ ...semEntrega, paginaEntregue: true, vezesEntregue: 1, elogiouDepoisDeVer: true }, "Achei legal demais");
      expect(d.entregar).toBe(false);
      expect(d.motivo).toContain("não é pedido de link");
    });

    it("não reentrega em pergunta de preço", () => {
      expect(deveEntregarPagina({ ...semEntrega, paginaEntregue: true, vezesEntregue: 1 }, "quanto custa?").entregar).toBe(false);
    });

    it("reentrega quando o lead pede o link", () => {
      expect(deveEntregarPagina({ ...semEntrega, paginaEntregue: true, vezesEntregue: 1 }, "não achei o link").entregar).toBe(true);
    });
  });

  describe("contextoDaConversa", () => {
    it("reconstrói a conversa em ordem e marca página entregue com elogio", async () => {
      const id = `teste-ctx-${Date.now()}`;
      upsertLead(makeLead(id));

      recordCommunication({ leadId: id, channel: "whatsapp", direction: "outbound", status: "sent", message: "Oi, tudo bem? Aqui é a Clara.", hook: "sem_site" });
      await espera();
      recordCommunication({ leadId: id, channel: "whatsapp", direction: "inbound", status: "sent", message: "[RECEBIDA] Pode mandar sim" });
      await espera();
      recordCommunication({
        leadId: id,
        channel: "whatsapp",
        direction: "outbound",
        status: "sent",
        message: "Ficou pronto! Montei a página 👇\n\nhttps://exemplo.pages.dev/demo",
        hook: "pagina_unica",
      });
      await espera();
      recordCommunication({ leadId: id, channel: "whatsapp", direction: "inbound", status: "sent", message: "[RECEBIDA] Achei legal demais" });

      const ctx = contextoDaConversa(id);

      expect(ctx.turnos[0].de).toBe("clara");
      expect(ctx.turnos[ctx.turnos.length - 1].de).toBe("lead");
      expect(ctx.fatos.paginaEntregue).toBe(true);
      expect(ctx.fatos.paginaUrl).toBe("https://exemplo.pages.dev/demo");
      expect(ctx.fatos.vezesEntregue).toBe(1);
      expect(ctx.fatos.elogiouDepoisDeVer).toBe(true);
      expect(ctx.fatos.aguardandoResposta).toBe(true);
      expect(ctx.texto).toContain("Página JÁ entregue");
      expect(ctx.texto).toContain("ELOGIOU");
      expect(ctx.texto).not.toContain("[RECEBIDA]");
    });

    it("reenvio acidental não conta como resposta: a conversa segue devendo", async () => {
      const id = `teste-ctx-travada-${Date.now()}`;
      upsertLead(makeLead(id));

      recordCommunication({ leadId: id, channel: "whatsapp", direction: "outbound", status: "sent", message: "Oi, tudo bem?", hook: "sem_site" });
      await espera();
      recordCommunication({ leadId: id, channel: "whatsapp", direction: "inbound", status: "sent", message: "[RECEBIDA] Pode mandar sim" });
      await espera();
      recordCommunication({ leadId: id, channel: "whatsapp", direction: "outbound", status: "sent", message: "Ficou pronto 👇 https://exemplo.pages.dev/a", hook: "pagina_unica" });
      await espera();
      recordCommunication({ leadId: id, channel: "whatsapp", direction: "inbound", status: "sent", message: "[RECEBIDA] Achei legal demais" });
      await espera();
      recordCommunication({ leadId: id, channel: "whatsapp", direction: "outbound", status: "sent", message: "Perfeito! Dá um minutinho 💛", hook: "pagina_aviso" });
      await espera();
      recordCommunication({ leadId: id, channel: "whatsapp", direction: "outbound", status: "sent", message: "Ficou pronto 👇 https://exemplo.pages.dev/a", hook: "pagina_unica" });

      const ctx = contextoDaConversa(id);
      expect(ctx.fatos.vezesEntregue).toBe(2);
      expect(ctx.fatos.aguardandoResposta).toBe(true);
      expect(ctx.fatos.travadaPorAviso).toBe(true);
      expect(ctx.texto).toContain("AVISO AUTOMÁTICO");
    });

    it("resposta da rede de segurança não fecha o turno", async () => {
      const id = `teste-ctx-fallback-${Date.now()}`;
      upsertLead(makeLead(id));
      recordCommunication({ leadId: id, channel: "whatsapp", direction: "outbound", status: "sent", message: "Oi! Montei uma prévia.", hook: "sem_site" });
      await espera();
      recordCommunication({ leadId: id, channel: "whatsapp", direction: "inbound", status: "sent", message: "[RECEBIDA] Como funciona?" });
      await espera();
      recordCommunication({ leadId: id, channel: "whatsapp", direction: "outbound", status: "sent", message: "Funciona assim: monto a primeira tela...", hook: "fallback_ia" });

      const ctx = contextoDaConversa(id);
      expect(ctx.fatos.fallbackFalou).toBe(true);
      // o fallback não é fala da Clara: o turno continua aberto para ela
      expect(ctx.fatos.aguardandoResposta).toBe(true);
      expect(ctx.texto).toContain("rede de segurança");
    });

    it("sem histórico: página não entregue e nada de elogio", () => {
      const id = `teste-ctx-vazio-${Date.now()}`;
      upsertLead(makeLead(id));
      const ctx = contextoDaConversa(id);
      expect(ctx.fatos.paginaEntregue).toBe(false);
      expect(ctx.fatos.vezesEntregue).toBe(0);
      expect(ctx.fatos.elogiouDepoisDeVer).toBe(false);
      expect(ctx.texto).toContain("ainda NÃO foi entregue");
    });
  });

  describe("etapa do funil", () => {
    const base = {
      paginaEntregue: false,
      paginaUrl: null,
      entregueEm: null,
      vezesEntregue: 0,
      respostasDoLead: 0,
      elogiouDepoisDeVer: false,
      aguardandoResposta: true,
      travadaPorAviso: false,
      fallbackFalou: false,
      silencioHoras: null,
    };
    const turno = (de: "lead" | "clara", texto: string) => ({ de, texto, em: new Date().toISOString(), hook: null, intent: null });

    it("sem nada dito: etapa 1", () => {
      expect(etapaDoFunil([], base).numero).toBe(1);
    });

    it("página entregue já conta como dor entendida: etapa 2", () => {
      const e = etapaDoFunil([turno("clara", "Ficou pronto! olha a página")], { ...base, paginaEntregue: true, vezesEntregue: 1 });
      expect(e.numero).toBe(2);
      expect(e.nome).toContain("página");
    });

    it("seções apresentadas: etapa 3 (preço)", () => {
      const e = etapaDoFunil([turno("clara", "A página tem serviços, equipe e galeria dos cortes")], { ...base, paginaEntregue: true });
      expect(e.numero).toBe(3);
      expect(e.proximaAcao).toContain("899");
    });

    it("preço dado: etapa 4 (fechar)", () => {
      const e = etapaDoFunil([turno("clara", "O Essencial fica R$ 899 e o Profissional R$ 1.199")], { ...base, paginaEntregue: true });
      expect(e.numero).toBe(4);
    });

    it("aceite depois do preço: etapa 5 (produção)", () => {
      const e = etapaDoFunil(
        [turno("clara", "O Essencial fica R$ 899"), turno("lead", "fechado, pode fazer")],
        { ...base, paginaEntregue: true },
      );
      expect(e.numero).toBe(5);
    });

    it("nunca pula: preço dado sem seções não inventa etapa 5", () => {
      const e = etapaDoFunil([turno("clara", "fica R$ 899")], { ...base, paginaEntregue: true });
      expect(e.numero).toBe(4);
    });
  });
});
