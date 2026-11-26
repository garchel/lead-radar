import { describe, it, expect } from "vitest";
import { montarCatalogoDeNichos } from "../server/services/nichoCatalogoService";

describe("catálogo de nichos (tela /nichos)", () => {
  const cat = montarCatalogoDeNichos();

  it("lê os 10 nichos catalogados", () => {
    expect(cat.ok).toBe(true);
    expect(cat.nichos).toHaveLength(10);
    expect(cat.nichos.map((n) => n.id)).toContain("odontologia");
    expect(cat.nichos.map((n) => n.id)).toContain("advocacia");
  });

  it("traz as três camadas em cada nicho", () => {
    for (const n of cat.nichos) {
      expect(n.estrutura.base.length + n.estrutura.diferenciador.length).toBeGreaterThan(0);
      expect(n.campeao?.nome).toBeTruthy();
      expect(n.tipografia?.h1Mediana).toBeGreaterThan(20);
      expect(n.listaNegra.length).toBeGreaterThan(0);
      expect(n.bloco).toMatch(/POOL MEDIDO DO NICHO/);
    }
  });

  it("não inventa número: barbearia traz a razão medida no arquivo", () => {
    const barbearia = cat.nichos.find((n) => n.id === "barbearia")!;
    expect(barbearia.tipografia!.razao).toBeCloseTo(3.47, 1);
    expect(barbearia.tipografia!.h1Mediana).toBeCloseTo(55.5, 0);
    expect(barbearia.tipografia!.semH1?.pct).toBe(24);
  });

  it("voz lista enquadramentos com pergunta e prova", () => {
    const barbearia = cat.nichos.find((n) => n.id === "barbearia")!;
    expect(barbearia.voz!.enquadramentos.length).toBeGreaterThan(3);
    const lugar = barbearia.voz!.enquadramentos.find((e) => e.id === "lugar")!;
    expect(lugar.ocorrencias).toBe(15);
    expect(lugar.pergunta).toMatch(/onde/i);
    expect(lugar.prova.length).toBeGreaterThan(0);
  });

  it("devolve cobertura de leads do banco sem quebrar com base vazia", () => {
    expect(cat.cobertura.nichos).toBe(10);
    expect(cat.cobertura.leadsNoPool).toBeGreaterThanOrEqual(0);
    expect(cat.cobertura.leadsTotal).toBeGreaterThanOrEqual(cat.cobertura.leadsNoPool);
  });
});
