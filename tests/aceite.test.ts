import { beforeEach, describe, expect, it } from "vitest";
import { ESSENCIAL, PROFISSIONAL, DEFAULT_POLICY } from "../server/services/commercialPolicy";
import {
  aceitesDoLead,
  comprovanteDeAceite,
  deveOferecerAssinaturaExterna,
  garantirTabelaDeAceites,
  tentativasDoAceite,
  conferirFrase,
  fraseDeAceite,
  normalizarFala,
  registrarAceite,
} from "../server/services/aceiteService";
import { getDb } from "../server/store/schema";

/**
 * Aceite por WhatsApp = assinatura eletrônica simples (Lei 14.063/2020). O que dá valor
 * é o conjunto: telefone, data/hora, texto exato e contrato enviado. Um "ok" solto não
 * prova com o que a pessoa concordou — por isso a frase é fixa e conferida.
 */

const POLICY = DEFAULT_POLICY;
const LEAD = "pv-landing-1";

describe("frase de aceite", () => {
  it("nomeia empresa, pacote e valor", () => {
    const f = fraseDeAceite(POLICY, PROFISSIONAL);
    expect(f.frase).toContain("ACEITO O CONTRATO");
    expect(f.frase).toContain("PROFISSIONAL");
    expect(f.frase).toContain("1.199,00");
    expect(f.valor).toBe(1199);
  });

  it("muda com o pacote", () => {
    expect(fraseDeAceite(POLICY, ESSENCIAL).frase).toContain("ESSENCIAL");
  });
});

describe("conferência da frase", () => {
  const frase = fraseDeAceite(POLICY, PROFISSIONAL).frase;

  it("aceita a frase exata", () => {
    expect(conferirFrase(frase, POLICY, PROFISSIONAL).confere).toBe(true);
  });

  it("aceita com acento trocado, caixa e pontuação diferente", () => {
    const variante = "aceito o contrato da vertice paginas web pacote profissional 1.199,00";
    expect(conferirFrase(variante, POLICY, PROFISSIONAL).confere).toBe(true);
  });

  it("aceita áudio transcrito com valor por extenso", () => {
    const dito = "aceito o contrato da Vértice pacote profissional, mil cento e noventa e nove reais";
    expect(conferirFrase(dito, POLICY, PROFISSIONAL).confere).toBe(true);
  });

  it("recusa 'ok', 'beleza' e emoji", () => {
    for (const v of ["ok", "beleza", "👍", "pode ser", "fechado"]) {
      const r = conferirFrase(v, POLICY, PROFISSIONAL);
      expect(r.confere).toBe(false);
      expect(r.faltando.length).toBeGreaterThan(0);
    }
  });

  it("recusa aceite sem o pacote ou sem o valor", () => {
    const semValor = "aceito o contrato da Vértice pacote profissional";
    expect(conferirFrase(semValor, POLICY, PROFISSIONAL).faltando.join(" ")).toMatch(/valor/);

    const semPacote = "aceito o contrato da Vértice 1.199";
    expect(conferirFrase(semPacote, POLICY, PROFISSIONAL).faltando.join(" ")).toMatch(/pacote/);
  });

  it("recusa o pacote errado (aceitou o barato, contratou o caro)", () => {
    const fraseErrada = fraseDeAceite(POLICY, ESSENCIAL).frase;
    expect(conferirFrase(fraseErrada, POLICY, PROFISSIONAL).confere).toBe(false);
  });
});

describe("registro do aceite", () => {
  beforeEach(() => {
    garantirTabelaDeAceites();
    getDb().prepare("DELETE FROM contract_acceptances WHERE lead_id = ?").run(LEAD);
  });

  it("grava telefone, data, canal e o texto respondido", () => {
    const r = registrarAceite({
      leadId: LEAD,
      policy: POLICY,
      pacote: PROFISSIONAL,
      mensagem: fraseDeAceite(POLICY, PROFISSIONAL).frase,
      telefone: "+55 61 99999-0000",
      canal: "texto",
      hashContrato: "abc123",
    });
    expect(r.registrado).toBe(true);
    const [salvo] = aceitesDoLead(LEAD);
    expect(salvo.telefone).toBe("+55 61 99999-0000");
    expect(salvo.canal).toBe("texto");
    expect(salvo.hashContrato).toBe("abc123");
    expect(salvo.aceitoEm).toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it("não grava quando a frase não confere", () => {
    const r = registrarAceite({ leadId: LEAD, policy: POLICY, pacote: ESSENCIAL, mensagem: "ok" });
    expect(r.registrado).toBe(false);
    expect(aceitesDoLead(LEAD)).toHaveLength(0);
  });

  it("marca o áudio como áudio", () => {
    const r = registrarAceite({
      leadId: LEAD,
      policy: POLICY,
      pacote: ESSENCIAL,
      mensagem: "aceito o contrato da Vértice pacote essencial oitocentos e noventa e nove",
      canal: "audio",
    });
    expect(r.registrado).toBe(true);
    expect(aceitesDoLead(LEAD)[0].canal).toBe("audio");
  });

  it("o comprovante traz telefone, hora, frase e resposta", () => {
    const r = registrarAceite({
      leadId: LEAD,
      policy: POLICY,
      pacote: ESSENCIAL,
      mensagem: fraseDeAceite(POLICY, ESSENCIAL).frase,
      telefone: "+55 61 98888-7777",
    });
    const c = r.comprovante || comprovanteDeAceite(r.registro!, POLICY);
    expect(c).toContain("COMPROVANTE DE ACEITE");
    expect(c).toContain("+55 61 98888-7777");
    expect(c).toContain("14.063/2020");
    expect(c).toContain("2.200-2/2001");
  });
});

describe("é difícil? oferece assinatura externa", () => {
  const LEAD2 = "lead-tentativas";
  const frase = fraseDeAceite(POLICY, ESSENCIAL).frase;
  const errar = () => registrarAceite({ leadId: LEAD2, policy: POLICY, pacote: ESSENCIAL, mensagem: "ok" });

  beforeEach(() => {
    // zera o contador do lead de teste
    registrarAceite({ leadId: LEAD2, policy: POLICY, pacote: ESSENCIAL, mensagem: frase });
  });

  it("primeiro erro: só repete a frase, sem oferecer nada", () => {
    const r = errar();
    expect(r.registrado).toBe(false);
    expect(r.erros).toBe(1);
    expect(r.oferecerAssinaturaExterna).toBe(false);
  });

  it("segundo erro: passa a oferecer assinatura fora do WhatsApp", () => {
    errar();
    const r = errar();
    expect(r.erros).toBe(2);
    expect(r.oferecerAssinaturaExterna).toBe(true);
    expect(deveOferecerAssinaturaExterna(LEAD2)).toBe(true);
  });

  it("acertar zera a contagem", () => {
    errar();
    errar();
    const ok = registrarAceite({ leadId: LEAD2, policy: POLICY, pacote: ESSENCIAL, mensagem: frase });
    expect(ok.registrado).toBe(true);
    expect(tentativasDoAceite(LEAD2).erros).toBe(0);
  });
});

describe("normalização", () => {
  it("remove acento, caixa, pontuação e espaço duplo", () => {
    expect(normalizarFala("  ACEITO  —  o Contrato,  da Vértice!  ")).toBe("aceito o contrato da vertice");
  });
});
