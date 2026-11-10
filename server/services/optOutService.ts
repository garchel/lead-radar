/**
 * Detecção de pedido de descadastro (LGPD).
 *
 * Roda sempre, independente dos toggles de automação: se a pessoa pediu para
 * parar, o `doNotContact` precisa ser gravado mesmo com classificação
 * automática desligada.
 */

const OPT_OUT_PATTERNS: RegExp[] = [
  /\bpare\b/i,
  /\bparar\b/i,
  /descadastr/i,
  /sair da lista/i,
  /remover (meu|o) (n[uú]mero|contato|telefone)/i,
  /apagar (meu|o) (n[uú]mero|contato|telefone)/i,
  /n[aã]o quero (mais )?(receber|ser contatad[oa]|contato|mensagens?)/i,
  /n[aã]o me (chame|chama|contate|contacte|mande|manda|envie|envia)\b/i,
  /me (tira|tire|remove|remova) (da lista|do grupo|desse grupo)/i,
  /n[aã]o tenho interesse/i,
  /desculp[ae],? mas n[aã]o/i,
];

export function detectOptOut(text: string): boolean {
  const normalized = (text || "").trim();
  if (!normalized) return false;
  return OPT_OUT_PATTERNS.some((pattern) => pattern.test(normalized));
}
