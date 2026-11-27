import crypto from "node:crypto";

/**
 * Leitura de assinatura digital em PDF, sem dependência externa.
 *
 * O que dá para afirmar com o próprio arquivo:
 *  1. **Existe assinatura?** Um PDF assinado tem `/Type /Sig` com `/ByteRange` e
 *     `/Contents`. Sem isso, o documento voltou "assinado" só no nome.
 *  2. **O arquivo foi alterado depois de assinar?** É o teste que importa. A assinatura
 *     cobre dois trechos (antes e depois do campo de assinatura) e o `/Contents` guarda
 *     o hash desses trechos. Se alguém muda uma vírgula no contrato, o hash não fecha.
 *  3. **É o MESMO contrato que enviamos?** Comparando o hash do trecho original com o
 *     que ficou registrado na geração.
 *
 * O que NÃO dá para afirmar aqui: se o certificado é confiável e se a conta gov.br é
 * legítima. Isso é validação de cadeia ICP-Brasil — se faz no VALIDAR (validar.iti.gov.br)
 * ou no validador da plataforma. O relatório precisa dizer isso, não fingir que sabe.
 */

export interface AssinaturaPdf {
  indice: number;
  subFiltro: string;
  /** Nome que aparece no certificado, quando foi possível ler. */
  assinante: string | null;
  /** O /ByteRange cobre o arquivo inteiro (menos o campo de assinatura)? */
  cobreArquivoInteiro: boolean;
  /** O que foi assinado bate com o que está no arquivo? */
  integro: boolean;
  /** Trecho assinado (em bytes) — é ele que identifica o documento original. */
  trechoAssinado: Buffer;
}

export interface VereditoAssinatura {
  temAssinatura: boolean;
  quantidade: number;
  /** Todas as assinaturas fecham: arquivo não foi mexido depois de assinar. */
  integro: boolean;
  /** O conteúdo assinado é o contrato que registramos. */
  mesmaVersao: boolean | null;
  assinantes: string[];
  /** O que o arquivo assina, em hash — serve de protocolo. */
  hashDocumento: string | null;
  /**
   * O PDF parece digitalização (imagem, sem camada de texto). Serve para explicar por
   * que não há assinatura digital: assinatura de caneta não deixa rastro verificável.
   */
  provavelEscaneado: boolean;
  problemas: string[];
  observacao: string;
}

function lerTexto(buf: Buffer, ini: number, fim: number): string {
  return buf.subarray(ini, Math.min(fim, buf.length)).toString("latin1");
}

/** Nome legível do certificado: procura CN/O dentro do DER da assinatura. */
function nomeDoCertificado(contents: Buffer): string | null {
  // O DER guarda os atributos como UTF8String/PrintableString; ler o texto puro acha
  // o CN na maioria dos certificados brasileiros (e-CPF, gov.br, ICP-Brasil).
  const texto = contents.toString("latin1");
  const cn = texto.match(/CN=([^\u0000-\u001f,]{2,80})/);
  if (cn) return cn[1].trim();
  const nome = texto.match(/([A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]+(?:\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóôãõç]+){1,5})/);
  return nome ? nome[1].trim() : null;
}

/** Extrai as assinaturas do PDF e verifica a integridade de cada uma. */
export function assinaturasDoPdf(pdf: Buffer): AssinaturaPdf[] {
  const texto = pdf.toString("latin1");
  const saida: AssinaturaPdf[] = [];

  const re = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g;
  let m: RegExpExecArray | null;
  let indice = 0;
  while ((m = re.exec(texto)) !== null) {
    indice += 1;
    const a = Number(m[1]);
    const b = Number(m[2]);
    const c = Number(m[3]);
    const d = Number(m[4]);
    // O /Contents vem DEPOIS do /ByteRange no dicionário da assinatura: procurar
    // para trás não acha nada e o conteúdo da assinatura fica vazio.
    let inicioContents = texto.indexOf("/Contents", m.index);
    if (inicioContents < 0) inicioContents = texto.lastIndexOf("/Contents", m.index);
    const subFiltro = (() => {
      const trecho = texto.slice(Math.max(0, m.index - 400), m.index);
      const sf = trecho.match(/\/SubFilter\s*\/([A-Za-z0-9._-]+)/);
      return sf ? sf[1] : "desconhecido";
    })();

    // bytes assinados: [a, a+b) + [c, c+d)
    const antes = pdf.subarray(a, Math.min(a + b, pdf.length));
    const depois = pdf.subarray(c, Math.min(c + d, pdf.length));
    const trechoAssinado = Buffer.concat([antes, depois]);
    // Sobra depois do trecho assinado só é aceitável se for espaço/quebra de linha —
    // byte de conteúdo depois da assinatura é conteúdo NÃO assinado.
    const sobra = pdf.subarray(Math.min(c + d, pdf.length));
    const sobraInofensiva = sobra.every((byte) => byte === 0x0a || byte === 0x0d || byte === 0x20 || byte === 0x09);
    const cobreArquivoInteiro = a === 0 && c + d <= pdf.length && sobraInofensiva;

    let contents = Buffer.alloc(0);
    if (inicioContents >= 0) {
      const abre = texto.indexOf("<", inicioContents);
      const fecha = texto.indexOf(">", abre);
      if (abre >= 0 && fecha > abre) {
        const hex = texto.slice(abre + 1, fecha).replace(/[^0-9a-fA-F]/g, "");
        if (hex.length > 40) contents = Buffer.from(hex, "hex");
      }
    }

    // Integridade: o /Contents guarda o hash do trecho assinado. Sem parser de CMS
    // completo, checamos o que é verificável: o hash do conteúdo assinado precisa
    // aparecer dentro do /Contents (SHA-1/SHA-256 do digest).
    const sha1 = crypto.createHash("sha1").update(trechoAssinado).digest();
    const sha256 = crypto.createHash("sha256").update(trechoAssinado).digest();
    const digestOk = contents.length > 0 && (contents.includes(sha1) || contents.includes(sha256));
    // Bytes acrescentados depois da assinatura não estão cobertos: o arquivo passou a
    // ter conteúdo não assinado, mesmo que o trecho antigo continue fechando.
    const integro = digestOk && cobreArquivoInteiro;

    saida.push({
      indice,
      subFiltro,
      assinante: contents.length ? nomeDoCertificado(contents) : null,
      cobreArquivoInteiro,
      integro,
      trechoAssinado,
    });
  }

  return saida;
}

function sha256(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

/**
 * Veredito para o painel.
 *
 * `hashOriginal` é o registro feito na geração do contrato: com ele dá para dizer se o
 * PDF assinado é o mesmo documento, e não uma versão parecida.
 */
/** Heurística: muitas imagens e nenhuma fonte = página fotografada/digitalizada. */
function pareceDigitalizacao(pdf: Buffer): boolean {
  const texto = pdf.toString("latin1");
  const imagens = (texto.match(/\/Subtype\s*\/Image/g) || []).length + (texto.match(/\/DCTDecode/g) || []).length;
  const fontes = (texto.match(/\/Type\s*\/Font/g) || []).length;
  return imagens > 0 && fontes === 0;
}

export function verificarAssinatura(pdf: Buffer, hashOriginal?: string | null): VereditoAssinatura {
  const assinaturas = assinaturasDoPdf(pdf);
  const problemas: string[] = [];
  const provavelEscaneado = pareceDigitalizacao(pdf);

  if (!assinaturas.length) {
    return {
      temAssinatura: false,
      quantidade: 0,
      integro: false,
      mesmaVersao: null,
      assinantes: [],
      hashDocumento: sha256(pdf),
      provavelEscaneado,
      problemas: provavelEscaneado
        ? [
            "O PDF parece uma digitalização (imagem, sem camada de texto): assinatura de caneta não é detectável por software.",
            "Assinatura à mão vale como prova, mas não prova que o arquivo não foi alterado depois. Guarde a foto do documento na mesa, o envelope e a mensagem em que ele confirma o envio.",
          ]
        : [
            "Nenhuma assinatura digital encontrada: o PDF voltou sem assinatura embutida.",
            "Se ele respondeu \"aceito\" no WhatsApp, isso vale como assinatura simples — mas então guarde a mensagem, não o PDF.",
            "Assinar no Adobe com assinatura desenhada também não conta: vira imagem dentro do PDF.",
          ],
      observacao: provavelEscaneado
        ? "Para ter rastro verificável, o caminho é o assinador gov.br (grátis) ou aceite por mensagem com data e telefone."
        : "Assinatura digital em PDF precisa ser gerada por um assinador (gov.br, plataforma ou certificado). Abrir, digitar o nome e salvar não assina.",
    };
  }

  const integro = assinaturas.every((a) => a.integro);
  const assinantes = assinaturas.map((a) => a.assinante).filter((n): n is string => Boolean(n));

  if (!integro) {
    problemas.push(
      "O arquivo foi alterado depois de assinado: o hash não fecha. Isso invalida a assinatura — peça outro, sem edições.",
    );
  }
  for (const a of assinaturas) {
    if (!a.cobreArquivoInteiro) {
      problemas.push(
        `Assinatura ${a.indice} não cobre o arquivo inteiro — normalmente é assinatura antiga com alteração posterior.`,
      );
    }
  }
  if (!assinantes.length) {
    problemas.push("Não foi possível ler o nome do certificado; confira no validador oficial.");
  }

  let mesmaVersao: boolean | null = null;
  if (hashOriginal) {
    mesmaVersao = assinaturas.some((a) => sha256(a.trechoAssinado) === hashOriginal || sha256(a.trechoAssinado).startsWith(hashOriginal));
    if (!mesmaVersao) {
      problemas.push(
        "O conteúdo assinado não corresponde ao contrato registrado: pode ser outra versão do documento.",
      );
    }
  }

  return {
    temAssinatura: true,
    quantidade: assinaturas.length,
    integro,
    mesmaVersao,
    assinantes,
    hashDocumento: sha256(assinaturas[0].trechoAssinado),
    provavelEscaneado,
    problemas,
    observacao:
      "Integridade verificada aqui. Para confirmar o certificado e a conta gov.br, valide o mesmo PDF em validar.iti.gov.br (gratuito e oficial).",
  };
}
