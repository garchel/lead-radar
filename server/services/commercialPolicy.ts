/**
 * Política comercial: a ÚNICA fonte de verdade sobre preço, prazo e escopo.
 *
 * Regra de ouro: o agente de IA nunca "sabe" um preço — ele recebe a política
 * pronta e é proibido de citar valor fora dela. Sem isso, o modelo inventa
 * "R$ 2.500" porque viu ticket estimado no banco, e o Paulo entrega por R$ 900.
 *
 * Editável em `app_settings` (chave `commercial_policy`, JSON parcial) sem
 * reiniciar o app e sem tocar em código.
 */

import { getSetting, setSetting } from "../store/db";

export interface CommercialPackage {
  id: string;
  name: string;
  /** Valor fechado em reais. Sempre um número: o bot não negocia faixa. */
  price: number;
  /** Uma linha que o agente pode usar na conversa. */
  summary: string;
  sections: string[];
  revisions: number;
  /** Quando faz sentido oferecer este pacote. */
  bestFor: string;
}

export interface CommercialPolicy {
  companyName: string;
  /** Como o agente se apresenta (funcionário, nunca IA). */
  agentRole: string;
  packages: CommercialPackage[];
  /** Prazo real de entrega, em dias úteis. */
  deliveryDays: [number, number];
  /** A prévia (primeira tela) é gratuita e não compromete? */
  previewFree: boolean;
  discountAllowed: boolean;
  /** Formas de pagamento que o agente pode citar (vazio = não falar de pagamento). */
  payment: string[];
  /** Regras extras livres que entram no prompt sem interpretação. */
  extraRules: string[];
}

/* ------------------------------------------------------------------ */
/*  Padrão (decidido com o Paulo em nov/2026)                          */
/* ------------------------------------------------------------------ */

export const ESSENCIAL: CommercialPackage = {
  id: "essencial",
  name: "Essencial",
  price: 900,
  summary: "uma página com até 5 seções, botão de WhatsApp e publicação",
  sections: [
    "seção inicial com a chamada principal",
    "sobre o profissional/empresa",
    "serviços principais",
    "localização e contato",
    "rodapé com informações",
    "responsivo (celular, tablet e computador)",
    "botão de WhatsApp",
    "ajustes básicos de SEO e publicação",
  ],
  revisions: 1,
  bestFor: "quem precisa existir no Google e receber contato pelo WhatsApp",
};

export const PROFISSIONAL: CommercialPackage = {
  id: "profissional",
  name: "Profissional",
  price: 1200,
  summary: "tudo do Essencial + diferenciais, depoimentos, FAQ e SEO local melhorado",
  sections: [
    "tudo do Essencial",
    "seção de diferenciais",
    "serviços detalhados",
    "depoimentos de clientes",
    "perguntas frequentes (FAQ)",
    "SEO local melhorado e otimização de velocidade",
  ],
  revisions: 2,
  bestFor: "quem já tem concorrência na mesma região e precisa se diferenciar",
};

export const DEFAULT_POLICY: CommercialPolicy = {
  companyName: "Vértice Páginas Web",
  agentRole: "funcionário da Vértice que atende pelo WhatsApp",
  packages: [ESSENCIAL, PROFISSIONAL],
  deliveryDays: [5, 7],
  previewFree: true,
  discountAllowed: false,
  payment: [],
  extraRules: [
    "Nunca diga que é IA, bot, assistente virtual ou automação.",
    "Nunca prometa prazo menor que o combinado, desconto ou brinde.",
    "Nunca cite CNPJ, CRM, CRO ou dado de ficha do cliente: parece vigilância.",
  ],
};

/* ------------------------------------------------------------------ */
/*  Leitura / gravação                                                 */
/* ------------------------------------------------------------------ */

const SETTING_KEY = "commercial_policy";

function mergePolicy(base: CommercialPolicy, patch: any): CommercialPolicy {
  if (!patch || typeof patch !== "object") return base;
  const merged: CommercialPolicy = {
    ...base,
    ...(typeof patch.companyName === "string" && patch.companyName.trim() ? { companyName: patch.companyName.trim() } : {}),
    ...(Array.isArray(patch.packages) && patch.packages.length ? { packages: normalizePackages(patch.packages) } : {}),
    ...(Array.isArray(patch.deliveryDays) && patch.deliveryDays.length === 2
      ? { deliveryDays: [Number(patch.deliveryDays[0]) || base.deliveryDays[0], Number(patch.deliveryDays[1]) || base.deliveryDays[1]] }
      : {}),
    ...(typeof patch.previewFree === "boolean" ? { previewFree: patch.previewFree } : {}),
    ...(typeof patch.discountAllowed === "boolean" ? { discountAllowed: patch.discountAllowed } : {}),
    ...(Array.isArray(patch.payment) ? { payment: patch.payment.map((p: unknown) => String(p)).filter(Boolean) } : {}),
    ...(Array.isArray(patch.extraRules) ? { extraRules: patch.extraRules.map((r: unknown) => String(r)).filter(Boolean) } : {}),
  };
  return merged;
}

function normalizePackages(list: any[]): CommercialPackage[] {
  const cleaned = list
    .map((item, index) => {
      const price = Math.round(Number(item?.price));
      if (!Number.isFinite(price) || price <= 0) return null;
      return {
        id: String(item?.id || `pacote-${index + 1}`).trim(),
        name: String(item?.name || `Pacote ${index + 1}`).trim(),
        price,
        summary: String(item?.summary || "").trim(),
        sections: Array.isArray(item?.sections) ? item.sections.map((s: unknown) => String(s)) : [],
        revisions: Number(item?.revisions) || 0,
        bestFor: String(item?.bestFor || "").trim(),
      } as CommercialPackage;
    })
    .filter((p): p is CommercialPackage => p !== null);
  return cleaned.length ? cleaned.sort((a, b) => a.price - b.price) : DEFAULT_POLICY.packages;
}

/** Política efetiva (default + overrides salvos em `app_settings`). */
export function getCommercialPolicy(): CommercialPolicy {
  let raw: string | null = null;
  try {
    raw = getSetting(SETTING_KEY);
  } catch {
    return DEFAULT_POLICY;
  }
  if (!raw) return DEFAULT_POLICY;
  try {
    return mergePolicy(DEFAULT_POLICY, JSON.parse(raw));
  } catch {
    return DEFAULT_POLICY;
  }
}

export function saveCommercialPolicy(patch: any): CommercialPolicy {
  const current = getCommercialPolicy();
  const next = mergePolicy(current, patch);
  setSetting(SETTING_KEY, JSON.stringify(next));
  return next;
}

/* ------------------------------------------------------------------ */
/*  Derivados usados pelo agente e pelo QA                             */
/* ------------------------------------------------------------------ */

/** O pacote mais barato — a âncora que o agente pode citar. */
export function cheapestPackage(policy: CommercialPolicy = getCommercialPolicy()): CommercialPackage {
  return policy.packages.reduce((min, p) => (p.price < min.price ? p : min), policy.packages[0]);
}

/** Valores em reais que o agente PODE citar. Qualquer outro é alucinação. */
export function allowedPrices(policy: CommercialPolicy = getCommercialPolicy()): number[] {
  return Array.from(new Set(policy.packages.map((p) => p.price))).sort((a, b) => a - b);
}

/** Faixa de prazo em texto ("5 a 7 dias úteis"). */
export function deliveryLabel(policy: CommercialPolicy = getCommercialPolicy()): string {
  const [min, max] = policy.deliveryDays;
  if (min === max) return `${min} dias úteis`;
  return `${min} a ${max} dias úteis`;
}

export function formatBRL(value: number): string {
  return `R$ ${value.toLocaleString("pt-BR")}`;
}

/** Bloco de contexto que entra no prompt (curto de propósito). */
export function formatPolicyForPrompt(policy: CommercialPolicy = getCommercialPolicy()): string {
  const cheapest = cheapestPackage(policy);
  const lines: string[] = [];

  lines.push(`Empresa: ${policy.companyName} (você é ${policy.agentRole}).`);
  lines.push("");
  lines.push("## PREÇO (única verdade — não invente outro número)");
  lines.push(`- A partir de ${formatBRL(cheapest.price)} (pacote ${cheapest.name}): ${cheapest.summary}.`);
  for (const p of policy.packages) {
    if (p.id === cheapest.id) continue;
    lines.push(`- ${p.name}: ${formatBRL(p.price)} — ${p.summary}. Indicado para ${p.bestFor}.`);
  }
  lines.push(
    policy.previewFree
      ? "- A prévia da primeira tela é GRATUITA e não gera compromisso. Sempre ofereça essa saída."
      : "- A prévia não é gratuita: não ofereça de graça."
  );
  lines.push(policy.discountAllowed ? "- Você pode conceder desconto se ele pedir." : "- Nunca dê desconto, nunca invente promoção.");
  lines.push(`- Prazo de entrega depois da aprovação: ${deliveryLabel(policy)}.`);
  if (policy.payment.length) lines.push(`- Pagamento: ${policy.payment.join("; ")}.`);
  else lines.push("- Não fale de formas de pagamento; se ele perguntar, diga que confirma com o responsável.");

  if (policy.extraRules.length) {
    lines.push("");
    lines.push("## PROIBIÇÕES");
    for (const rule of policy.extraRules) lines.push(`- ${rule}`);
  }

  return lines.join("\n");
}

/** Resumo de uma linha por pacote (para o dossiê). */
export function formatPackagesShort(policy: CommercialPolicy = getCommercialPolicy()): string[] {
  return policy.packages
    .slice()
    .sort((a, b) => a.price - b.price)
    .map((p) => `${p.name} ${formatBRL(p.price)} — ${p.summary} (${p.revisions} rodada${p.revisions === 1 ? "" : "s"} de ajuste)`);
}
