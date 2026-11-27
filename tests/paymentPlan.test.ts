import { describe, expect, it } from "vitest";
import { DEFAULT_POLICY, ESSENCIAL, PROFISSIONAL, mergePolicy } from "../server/services/commercialPolicy";
import {
  brl,
  cartaoDeCobranca,
  chavePixPara,
  planoDePagamento,
} from "../server/services/paymentPlan";

const policy = DEFAULT_POLICY;

describe("plano de pagamento", () => {
  it("30/70 fecha exatamente o valor do pacote", () => {
    const p = planoDePagamento(policy, ESSENCIAL);
    expect(p.total).toBe(899);
    expect(p.parcelas[0].pct).toBe(30);
    expect(p.parcelas[1].pct).toBe(70);
    expect(p.parcelas[0].valor + p.parcelas[1].valor).toBeCloseTo(899, 2);
  });

  it("o segundo pagamento está preso à publicação no domínio, não à entrega da página", () => {
    const p = planoDePagamento(policy, PROFISSIONAL);
    expect(p.parcelas[1].rotulo).toMatch(/domínio/i);
    expect(p.parcelas[1].marco).toMatch(/no ar|publicado/i);
    // a página entregue não dá alavanca: não pode ser o marco
    expect(p.parcelas[1].rotulo).not.toMatch(/entrega da p[áa]gina/i);
  });

  it("explica o domínio para quem não sabe o que é", () => {
    const p = planoDePagamento(policy, PROFISSIONAL);
    // rótulo tem que fazer sentido para leigo: "site pronto no ar", não só o jargão
    expect(p.parcelas[1].rotulo).toMatch(/site.*pronto|pronto.*site/i);
    expect(p.parcelas[1].rotulo).toMatch(/\(o domínio\)/i);
  });

  it("nunca deixa a entrada em 0% nem em 100%", () => {
    const zero = mergePolicy(DEFAULT_POLICY, { paymentSplit: { entrada: 0, entrega: 100 } });
    expect(planoDePagamento(zero, ESSENCIAL).parcelas[0].pct).toBe(30);
    const cem = mergePolicy(DEFAULT_POLICY, { paymentSplit: { entrada: 100, entrega: 0 } });
    expect(planoDePagamento(cem, ESSENCIAL).parcelas[0].pct).toBe(30);
  });

  it("formata real com vírgula e milhar", () => {
    expect(brl(899)).toBe("R$ 899,00");
    expect(brl(1199)).toBe("R$ 1.199,00");
    expect(brl(269.7)).toBe("R$ 269,70");
  });
});

describe("chave Pix", () => {
  it("lead real NUNCA recebe a chave de teste", () => {
    const { chave, teste } = chavePixPara(policy, "lead-dicore");
    expect(chave).toBeNull();
    expect(teste).toBe(false);
  });

  it("lead de simulação recebe a chave de teste", () => {
    const { chave, teste } = chavePixPara(policy, "pv-landing-1");
    expect(teste).toBe(true);
    expect(chave).toBeTruthy();
  });

  it("chave real desliga o modo teste em qualquer lead", () => {
    const comReal = mergePolicy(DEFAULT_POLICY, { pixKey: "vertice@verticepaginas.com.br" });
    const { chave, teste } = chavePixPara(comReal, "lead-dicore");
    expect(chave).toBe("vertice@verticepaginas.com.br");
    expect(teste).toBe(false);
  });
});

describe("cartão de cobrança", () => {
  it("mostra pacote, valor e as duas parcelas", () => {
    const texto = cartaoDeCobranca(policy, PROFISSIONAL, { leadId: "pv-landing-1" });
    expect(texto).toContain("*PROFISSIONAL* | *R$ 1.199,00*");
    expect(texto).toContain("30%");
    expect(texto).toContain("70%");
    expect(texto).toContain("domínio");
  });

  it("sem chave real, manda o cliente aguardar o Paulo em vez de inventar chave", () => {
    const texto = cartaoDeCobranca(policy, ESSENCIAL, { leadId: "lead-dicore" });
    expect(texto).toMatch(/Paulo te manda a chave/i);
    expect(texto).not.toMatch(/@exemplo\.com/);
  });

  it("com chave de teste, avisa que é teste", () => {
    const texto = cartaoDeCobranca(policy, ESSENCIAL, { leadId: "pv-landing-1" });
    expect(texto).toMatch(/chave de teste/i);
  });

  it("não promete devolução do sinal: fala em valor abatido", () => {
    const texto = cartaoDeCobranca(policy, ESSENCIAL, { leadId: "pv-landing-1" }).toLowerCase();
    expect(texto).not.toMatch(/n[ãa]o reembols|sem devolu|sinal perdido/);
  });
});
