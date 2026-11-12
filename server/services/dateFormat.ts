/**
 * Data no formato brasileiro (12/11/2026).
 *
 * Existe para não repetir `toLocaleDateString("pt-BR")` em cada documento — e
 * porque o resultado precisa ser o mesmo em PDF, prévia e mensagem, inclusive
 * quando o processo roda com locale diferente do sistema.
 */
export function formatDateBr(value: Date | string | number = new Date()): string {
  const data = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(data.getTime())) return "";
  const dia = String(data.getDate()).padStart(2, "0");
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  return `${dia}/${mes}/${data.getFullYear()}`;
}
