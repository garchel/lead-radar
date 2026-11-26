import { describe, it, expect, beforeEach } from "vitest";
import {
  nichoCatalogado,
  perfilDoPool,
  blocoDoPool,
  _resetCache,
} from "../server/services/nichoPoolService";

beforeEach(() => _resetCache());

describe("mapeamento lead -> nicho catalogado", () => {
  const casos: Array<[string, string]> = [
    ["Óticas Popular", "otica"],
    ["Óptica Central", "otica"],
    ["Barbearia Dom Corte", "barbearia"],
    ["Clínica Odontológica Sorriso", "odontologia"],
    ["Studio Pilates Vida", "pilates"],
    ["Clínica de Fisioterapia Movimento", "fisioterapia"],
    ["Psicóloga Marina Almeida", "psicologia"],
    ["Oficina Mecânica do Zé", "oficina"],
    ["Clínica de Estética Bella", "estetica"],
    ["Clínica Veterinária 24h", "veterinaria"],
    ["Advocacia Previdenciária Silva", "advocacia"],
  ];

  it.each(casos)("reconhece %s como %s", (nome, esperado) => {
    expect(nichoCatalogado(nome)).toBe(esperado);
  });

  it("usa a categoria quando o nome não diz nada", () => {
    expect(nichoCatalogado("Bella", "Clínica de Estética")).toBe("estetica");
  });

  it("devolve null para nicho ainda não catalogado", () => {
    expect(nichoCatalogado("Restaurante Vovó Maria")).toBeNull();
    expect(nichoCatalogado("Pet Shop do Bigode")).toBe("veterinaria"); // pet shop entra em veterinária
    expect(nichoCatalogado("Supermercado Central")).toBeNull();
  });
});

describe("perfil do pool", () => {
  it("traz as três camadas de um nicho catalogado", () => {
    const p = perfilDoPool("Óticas Popular");
    expect(p).not.toBeNull();
    expect(p!.nicho).toBe("otica");
    expect(p!.campeao?.nome).toMatch(/preço/i);
    expect(p!.listaNegra.length).toBeGreaterThan(0);
    expect(p!.estruturaBase.length + p!.estruturaDiferenciador.length).toBeGreaterThan(0);
  });

  it("devolve null quando não há pool", () => {
    expect(perfilDoPool("Restaurante Vovó Maria")).toBeNull();
  });
});

describe("bloco para o prompt", () => {
  it("monta texto com campeão, prova e lista negra", () => {
    const bloco = blocoDoPool("Oficina Mecânica do Zé");
    expect(bloco).toMatch(/POOL MEDIDO DO NICHO \(oficina\)/);
    expect(bloco).toMatch(/enquadramento que funciona/);
    expect(bloco).toMatch(/PROIBIDO neste nicho/);
  });

  it("é vazio quando o nicho não tem pool, para o chamador só concatenar", () => {
    expect(blocoDoPool("Restaurante Vovó Maria")).toBe("");
  });

  it("respeita a tipografia medida quando existe", () => {
    const bloco = blocoDoPool("Clínica de Fisioterapia Movimento");
    expect(bloco).toMatch(/proporção tipográfica medida/);
  });
});
