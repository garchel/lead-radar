import { describe, expect, it } from "vitest";
import { ESSENCIAL, PROFISSIONAL, DEFAULT_POLICY, mergePolicy } from "../server/services/commercialPolicy";
import { brl, planoDePagamento } from "../server/services/paymentPlan";
import { contratoDeUmaPagina, resumoDoContrato } from "../server/services/contractService";

const policy = DEFAULT_POLICY;

function contrato(pacote = ESSENCIAL, p = policy) {
  return contratoDeUmaPagina({
    contratante: "Dicore Barbearia",
    contratada: p.companyName,
    pacote,
    policy: p,
    leadId: "pv-landing-1",
    data: new Date("2026-11-27T12:00:00-03:00"),
  });
}

describe("entrada fixa", () => {
  it("usa R$ 150 em vez de percentual", () => {
    const p = planoDePagamento(policy, ESSENCIAL);
    expect(p.parcelas[0].valor).toBe(150);
    expect(p.parcelas[1].valor).toBe(749);
    expect(p.parcelas[0].valor + p.parcelas[1].valor).toBeCloseTo(899, 2);
  });

  it("nunca deixa a entrada passar de metade do pacote", () => {
    const alta = mergePolicy(policy, { entradaFixa: 900 });
    const p = planoDePagamento(alta, ESSENCIAL);
    expect(p.parcelas[0].valor).toBeLessThanOrEqual(899 / 2);
  });

  it("entrada zero volta para o percentual", () => {
    const semFixa = mergePolicy(policy, { entradaFixa: 0, paymentSplit: { entrada: 30, entrega: 70 } });
    const p = planoDePagamento(semFixa, ESSENCIAL);
    expect(p.parcelas[0].valor).toBeCloseTo(269.7, 2);
  });

  it("o saldo vence antes do domínio, não depois", () => {
    const p = planoDePagamento(policy, PROFISSIONAL);
    expect(p.parcelas[1].rotulo).toMatch(/antes/i);
  });
});

describe("contrato de uma página", () => {
  it("traz as partes, o preço e as duas parcelas", () => {
    const c = contrato(PROFISSIONAL);
    expect(c).toContain("Dicore Barbearia");
    expect(c).toContain("Vértice Páginas Web");
    expect(c).toContain(brl(1199));
    expect(c).toContain(brl(150));
  });

  it("NUNCA tira o direito de arrependimento (art. 51, I do CDC)", () => {
    const c = contrato().toLowerCase();
    expect(c).not.toMatch(/n[ãa]o h[áa] devolu|sem direito a devolu|renuncia ao direito de arrependimento/);
    expect(c).toMatch(/7 dias corridos/);
  });

  it("condiciona a cessão dos direitos ao fim da garantia e à quitação", () => {
    const c = contrato();
    expect(c).toMatch(/cess[ãa]o dos direitos/i);
    expect(c).toMatch(/prazo de garantia/i);
    expect(c).toMatch(/quita[çc][ãa]o integral/i);
  });

  it("avisa que cópia por IA antes da cessão é uso não autorizado", () => {
    const c = contrato();
    expect(c).toMatch(/intelig[êe]ncia artificial/i);
    expect(c).toMatch(/Lei 9\.610/);
  });

  it("não promete posição no Google", () => {
    const c = contrato().toLowerCase();
    expect(c).toMatch(/sem prometer coloca[çc][ãa]o/);
    expect(c).not.toMatch(/primeiro lugar|topo do google|garantimos posi/);
  });

  it("o Anexo I usa as seções contratadas, não uma lista fixa", () => {
    const c = contratoDeUmaPagina({
      contratante: "Studio Bella",
      contratada: "Vértice Páginas Web",
      pacote: PROFISSIONAL,
      policy,
      nicho: "estética",
      secoes: ["procedimentos", "antes e depois", "equipe", "agendamento", "depoimentos"],
      leadId: "lead-1",
      data: new Date("2026-11-27T12:00:00-03:00"),
    });
    expect(c).toContain("antes e depois");
    expect(c).toContain("procedimentos");
    expect(c).toContain("estética");
    // não pode manter itens do escopo padrão que não foram contratados
    expect(c).not.toContain("Perguntas frequentes");
  });

  it("sem seções informadas, cai no escopo do pacote", () => {
    const c = contrato(PROFISSIONAL);
    expect(c).toMatch(/Anexo I/);
    expect(c.length).toBeGreaterThan(500);
  });

  it("fala de nota fiscal e LGPD", () => {
    const c = contrato();
    expect(c).toMatch(/nota fiscal/i);
    expect(c).toMatch(/LGPD|13\.709/);
  });

  it("o resumo de WhatsApp cabe em poucas linhas", () => {
    const r = resumoDoContrato(policy, ESSENCIAL, "pv-landing-1");
    expect(r.split("\n").filter(Boolean).length).toBeLessThanOrEqual(8);
    expect(r).toContain(brl(150));
  });
});
