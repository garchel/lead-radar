import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { assinaturasDoPdf, verificarAssinatura } from "../server/services/contractSignature";

/**
 * PDF assinado de mentira, montado à mão: o /Contents guarda o hash do trecho assinado
 * (antes + depois do campo), que é exatamente o que um assinador real faz. Serve para
 * provar o algoritmo sem depender de certificado.
 */
function pdfAssinado(opts: { assinante?: string; corromper?: boolean } = {}) {
  const assinante = opts.assinante || "PAULO HENRIQUE DA SILVA";
  const W = 20;   // largura fixa dos números do /ByteRange
  const HEX = 128; // tamanho do campo /Contents

  const cabeca = "%PDF-1.7\n1 0 obj\n<< /Type /Page /Contents 2 0 R >>\nendobj\n";
  const slots = "[" + Array(4).fill(" ".repeat(W)).join(" ") + "]";
  const meio =
    "<< /Type /Sig /Filter /Adobe.PPKLite /SubFilter /adbe.pkcs7.detached /ByteRange " +
    slots + " /Contents <" + "0".repeat(HEX) + "> >>";
  const fim = "\n%EOF\n";

  let doc = cabeca + meio + fim;
  const iAbre = doc.indexOf("/Contents <") + "/Contents <".length;
  const iFecha = doc.indexOf(">", iAbre);
  const b = iAbre;
  const c = iFecha + 1;
  const d = doc.length - c;
  const pad = (v: number) => String(v).padStart(W, " ");
  doc = doc.replace(slots, "[" + [0, b, c, d].map(pad).join(" ") + "]");

  const bytes = Buffer.from(doc, "latin1");
  const trecho = Buffer.concat([bytes.subarray(0, b), bytes.subarray(c)]);
  // Como num CMS real: o digest vai em BYTES crus e o nome em ASCII (DER guarda "CN=..." legível)
  const digestBytes = crypto.createHash("sha256").update(trecho).digest();
  const payload = Buffer.concat([digestBytes, Buffer.from("\nCN=" + assinante, "latin1")]);
  const conteudo = payload.toString("hex").slice(0, HEX).padEnd(HEX, "0");
  const final = doc.slice(0, iAbre) + conteudo + doc.slice(iFecha);

  // alteração depois da assinatura: acrescentar bytes muda o trecho coberto
  return Buffer.from(opts.corromper ? final + "comentario extra" : final, "latin1");
}

describe("assinatura de PDF", () => {
  it("reconhece assinatura válida e íntegra", () => {
    const pdf = pdfAssinado();
    const v = verificarAssinatura(pdf);
    expect(v.temAssinatura).toBe(true);
    expect(v.quantidade).toBe(1);
    expect(v.integro).toBe(true);
    expect(v.assinantes.join(" ")).toMatch(/PAULO/i);
  });

  it("sem assinatura, diz que não há assinatura embutida", () => {
    const pdf = Buffer.from("%PDF-1.7\n1 0 obj\n<< /Type /Page >>\nendobj\n%EOF\n", "latin1");
    const v = verificarAssinatura(pdf);
    expect(v.temAssinatura).toBe(false);
    expect(v.problemas[0]).toMatch(/sem assinatura/i);
    expect(v.observacao).toMatch(/n[ãa]o assina/i);
  });

  it("arquivo alterado depois de assinar é acusado", () => {
    const pdf = pdfAssinado({ corromper: true });
    const v = verificarAssinatura(pdf);
    // alterar dentro do trecho assinado muda o hash: a assinatura não fecha
    expect(v.integro).toBe(false);
    expect(v.problemas.join(" ")).toMatch(/alterado|hash/i);
  });

  it("o veredito sempre manda validar o certificado no ITI", () => {
    const v = verificarAssinatura(pdfAssinado());
    expect(v.observacao).toMatch(/validar\.iti\.gov\.br/);
  });

  it("extrai o hash do conteúdo assinado, que serve de protocolo", () => {
    const pdf = pdfAssinado();
    const [a] = assinaturasDoPdf(pdf);
    expect(a.trechoAssinado.length).toBeGreaterThan(0);
    const v = verificarAssinatura(pdf);
    expect(v.hashDocumento).toMatch(/^[0-9a-f]{64}$/);
  });
});
