import type { BusinessLead } from '../types';

/**
 * Extrai valores monetários de um texto livre ("R$ 1.800 - R$ 3.500 / projeto").
 * Usa a média da faixa quando há mais de um número.
 *
 * Cuidado com o escape: a regex precisa ser /\d[\d.]*\/g — escrita com barra
 * dupla ela casa a letra "d" literal e o potencial do funil vira R$ 0 (bug real
 * que ficou invisível porque a soma era só um número no topo da tela).
 */
export function parseMoneyAverage(value?: string | null): number | null {
  if (!value) return null;
  const numbers = String(value).match(/\d[\d.]*/g) || [];
  const values = numbers
    .map((item) => Number(item.replace(/\./g, '')))
    .filter((item) => Number.isFinite(item) && item > 0);
  if (values.length === 0) return null;
  return values.reduce((sum, item) => sum + item, 0) / values.length;
}

/** Potencial do funil: soma da média de cada faixa estimada. */
export function computePipelineValue(leads: BusinessLead[]): number {
  return leads.reduce((acc, lead) => acc + (parseMoneyAverage(lead.estimatedValue) ?? 0), 0);
}
