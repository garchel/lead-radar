import { ehLeadDeSimulacao } from "./simulationService";
import type { CommercialPackage, CommercialPolicy } from "./commercialPolicy";

/**
 * Cobrança em duas parcelas, cada uma presa a uma entrega VISÍVEL.
 *
 * O que a literatura sustenta:
 *  - Soman & Gourville (2001, JMR): separar pagamento de consumo enfraquece o vínculo
 *    de sunk cost. Parcela amarrada a DATA não segura ninguém; amarrada a ENTREGA
 *    ("entrou no ar", "domínio no seu nome") o cliente sabe exatamente o que comprou.
 *  - Gourville & Soman (1998, JCR): quanto maior a distância entre pagar e receber,
 *    menor o valor percebido. Por isso a entrada é pequena e o resto vem rápido.
 *  - Prelec & Loewenstein: cada pagamento é um episódio de dor. Duas transferências,
 *    não três — num ticket de R$ 899 três Pix burocráticos pesam mais que o valor.
 *  - CDC art. 49: compra fora do estabelecimento tem 7 dias de arrependimento com
 *    devolução. O texto fala em "valor abatido do total", nunca em "sinal sem devolução".
 */

export interface Parcela {
  rotulo: string;
  /** O que precisa ter acontecido para ela vencer. */
  marco: string;
  pct: number;
  valor: number;
}

export interface PlanoDePagamento {
  pacote: string;
  total: number;
  parcelas: Parcela[];
}

function centavos(v: number): number {
  return Math.round(v * 100);
}

/** De centavos para reais (só para exibir). */
function deCentavos(c: number): number {
  return c / 100;
}

export function brl(v: number): string {
  return `R$ ${deCentavos(centavos(v))
    .toFixed(2)
    .replace(".", ",")
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
}

/** Percentual de entrada, com validação para nunca virar 0% ou 100%. */
function percentualDeEntrada(policy: CommercialPolicy): number {
  const bruto = Number(policy.paymentSplit?.entrada ?? 30);
  if (!Number.isFinite(bruto) || bruto <= 0) return 30;
  if (bruto >= 100) return 30;
  return Math.round(bruto);
}

export function planoDePagamento(policy: CommercialPolicy, pacote: CommercialPackage): PlanoDePagamento {
  const entradaPct = percentualDeEntrada(policy);
  const entregaPct = 100 - entradaPct;
  const total = centavos(pacote.price);

  // A entrada arredonda para baixo em centavos inteiros; o resto fecha o total exato.
  const entrada = Math.floor((total * entradaPct) / 100);
  const restante = total - entrada;

  return {
    pacote: pacote.name,
    total: deCentavos(total),
    parcelas: [
      {
        rotulo: "na aprovação",
        marco: "para reservar a sua vaga na fila",
        pct: entradaPct,
        valor: deCentavos(entrada),
      },
      {
        rotulo: "na publicação no seu domínio",
        marco: "quando o site estiver no ar com o endereço no seu nome",
        pct: entregaPct,
        valor: deCentavos(restante),
      },
    ],
  };
}

/**
 * Chave Pix que pode ser mostrada para este lead.
 *
 * Lead de simulação pode receber a chave fictícia (é teste do dono). Lead real NUNCA:
 * uma chave inventada manda o dinheiro de um cliente verdadeiro para o nada, ou pior,
 * para a conta de um desconhecido. Sem chave real, o certo é não passar chave.
 */
export function chavePixPara(policy: CommercialPolicy, leadId?: string): { chave: string | null; teste: boolean } {
  if (leadId && ehLeadDeSimulacao(leadId)) {
    const teste = String(policy.pixKeyTeste || "").trim();
    if (teste) return { chave: teste, teste: true };
  }
  const real = String(policy.pixKey || "").trim();
  return { chave: real || null, teste: false };
}

export function cartaoDeCobranca(
  policy: CommercialPolicy,
  pacote: CommercialPackage,
  opts: { leadId?: string; fechamento?: string } = {},
): string {
  const plano = planoDePagamento(policy, pacote);
  const { chave, teste } = chavePixPara(policy, opts.leadId);
  const linhas: string[] = [];

  linhas.push(`*${pacote.name.toUpperCase()}* | *${brl(pacote.price)}*`);
  linhas.push("");
  linhas.push(`• *${plano.parcelas[0].pct}%* ${plano.parcelas[0].rotulo} — ${brl(plano.parcelas[0].valor)}`);
  linhas.push(`• *${plano.parcelas[1].pct}%* ${plano.parcelas[1].rotulo} — ${brl(plano.parcelas[1].valor)}`);
  linhas.push(`• o site entra no ar em ${policy.deliveryDays[0]} a ${policy.deliveryDays[1]} dias úteis`);
  linhas.push(`• ${pacote.revisions} rodada${pacote.revisions > 1 ? "s" : ""} de ajuste incluída${pacote.revisions > 1 ? "s" : ""}`);

  if (chave) {
    linhas.push("");
    linhas.push(`*Pix* (${policy.pixHolder})`);
    linhas.push(chave);
    if (teste) linhas.push("_chave de teste_");
    linhas.push("Depois de pagar, me manda o comprovante que eu já coloco você na fila.");
  } else {
    linhas.push("");
    linhas.push("O Paulo te manda a chave do Pix e aí a gente já agenda o início.");
  }

  if (opts.fechamento) {
    linhas.push("");
    linhas.push(opts.fechamento);
  }
  return linhas.join("\n");
}
