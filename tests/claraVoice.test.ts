import { describe, expect, it } from "vitest";
import { conferirEstilo } from "../server/services/messageStyle";

/**
 * A voz da Clara virou contrato verificável. O endpoint de envio devolve os
 * desvios para ela corrigir no turno seguinte, sem o servidor reescrever o texto.
 */

const APROVADA = `Oi, tudo bem? 👋 Aqui é a Clara, da Vértice.

Vi a Rede Amor À Vida Cachoeirinha no Google e notei que vocês ainda não têm um site por lá.

Como vocês já têm uma reputação ótima, montei uma prévia gratuita de como ficaria uma página profissional pra vocês (com botão direto pro WhatsApp).

Posso te mandar o link pra você dar uma olhada sem compromisso? (Se não for você que resolve isso por aí, me avisa com quem eu falo!)`;

describe("conferirEstilo", () => {
  it("aprova a mensagem aprovada pelo Paulo", () => {
    expect(conferirEstilo(APROVADA)).toEqual([]);
  });

  it("reclama de dois emojis na mesma mensagem", () => {
    const avisos = conferirEstilo("Oi! 👋 Já montei a prévia 👇");
    expect(avisos.some((a) => a.regra === "um emoji por mensagem")).toBe(true);
  });

  it("reclama de emoji de anúncio", () => {
    const avisos = conferirEstilo("Oi! 🚀 Já montei a prévia, quer ver?");
    expect(avisos.some((a) => a.regra === "emoji de anúncio")).toBe(true);
  });

  it("reclama de emoji fora da lista curada", () => {
    const avisos = conferirEstilo("Oi! 🐴 Já montei a prévia, quer ver?");
    expect(avisos.some((a) => a.regra === "emoji fora da lista")).toBe(true);
  });

  it("aceita 👇 em quem aponta o link e 😊 em quem fecha com calor", () => {
    expect(conferirEstilo("Perfeito! Segue a prévia 👇\n\nhttps://exemplo.com\n\nDeixei o botão de WhatsApp no topo. O que você achou?")).toEqual([]);
    expect(conferirEstilo("Fico à disposição. Qualquer dúvida me chama 😊")).toEqual([]);
  });

  it("reclama de travessão", () => {
    const avisos = conferirEstilo("Oi! A prévia está pronta — quer ver?");
    expect(avisos.some((a) => a.regra === "sem travessão")).toBe(true);
  });

  it("aceita os 4 blocos do formato aprovado e reclama acima disso", () => {
    expect(conferirEstilo("um\n\ndois\n\ntrês\n\nquatro?").some((a) => a.regra.startsWith("até"))).toBe(false);
    const avisos = conferirEstilo("um\n\ndois\n\ntrês\n\nquatro\n\ncinco?");
    expect(avisos.some((a) => a.regra === "até 4 parágrafos")).toBe(true);
  });

  it("reclama de enchimento", () => {
    const avisos = conferirEstilo("A prévia é grátis, sem custo nenhum. Quer ver?");
    expect(avisos.some((a) => a.regra === "sem enchimento")).toBe(true);
  });

  it("reclama de 'cliente' quando o nicho pede outra palavra", () => {
    const avisos = conferirEstilo("Seu cliente vai adorar. Quer ver?", { palavraPessoa: "pessoa" });
    expect(avisos.some((a) => a.regra === "vocabulário do nicho")).toBe(true);
  });

  it("reclama quando a mensagem não termina com pergunta", () => {
    const avisos = conferirEstilo("Segue o link da prévia. Qualquer coisa me chama.");
    expect(avisos.some((a) => a.regra === "terminar com pergunta")).toBe(true);
  });
});
