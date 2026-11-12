/**
 * Onboarding do cliente e marcos do projeto.
 *
 * Dois buracos do fluxo, resolvidos juntos porque usam os mesmos dados:
 *
 * 1. **Onboarding**: o cliente fecha e esfria porque não sabe o que mandar. Ele
 *    recebe uma lista curta (logo, fotos, textos, horário, domínio) e o painel
 *    mostra o que já chegou — o que falta vira lembrete, não cobrança vaga.
 *
 * 2. **Marcos**: mudar de etapa no kanban tem que virar mensagem para quem pagou.
 *    Silêncio de dias é o que gera "e o meu site?". A mensagem é gravada em
 *    `project_milestones` para não repetir o mesmo aviso.
 */
import { getDb } from "../store/schema";
import type { Project, StoredLead } from "../store/types";
import { getLeadById } from "../store/db";
import { dispatchLeadReply } from "./interactionService";

/* ------------------------------------------------------------------ */
/* onboarding                                                          */
/* ------------------------------------------------------------------ */

export type OnboardingKey = "logo" | "fotos" | "textos" | "horario" | "endereco" | "dominio";

export interface OnboardingItem {
  key: OnboardingKey;
  label: string;
  status: "ok" | "falta";
  /** O que pedir quando falta, em linguagem de conversa. */
  pedido: string;
}

export interface OnboardingState {
  items: OnboardingItem[];
  prontos: number;
  total: number;
  percentual: number;
  /** Mensagem pronta para pedir o que falta. */
  mensagem: string;
}

export function buildOnboarding(lead: StoredLead, projeto?: Project): OnboardingState {
  const imagens = (lead.brandSnapshot?.imagery || []).map((i) => String(i.url || "")).filter(Boolean);
  const logoConfiavel = Boolean(lead.brandSnapshot?.logo?.url) && Number(lead.brandSnapshot?.logo?.confidence ?? 0) >= 0.55;
  const servicos = (lead.clientProfile?.services || []).filter(Boolean);
  const horario = Boolean((lead.clientProfile?.hours || "").trim());
  const endereco = Boolean((lead.address || "").trim()) || Boolean(lead.city);

  const items: OnboardingItem[] = [
    {
      key: "logo",
      label: "Logo (arquivo)",
      status: logoConfiavel || Boolean(projeto?.sitePath) ? "ok" : "falta",
      pedido: "o arquivo da sua logo (PNG, JPG ou o vetor, se tiver)",
    },
    {
      key: "fotos",
      label: "Fotos do negócio (3 ou mais)",
      status: imagens.length >= 3 ? "ok" : "falta",
      pedido: `3 fotos que você gostaria de ver na página (fachada, ambiente, você trabalhando)${imagens.length ? ` — já tenho ${imagens.length}` : ""}`,
    },
    {
      key: "textos",
      label: "Serviços e textos",
      status: servicos.length >= 2 ? "ok" : "falta",
      pedido: "a lista dos seus serviços principais, do jeito que você chama cada um",
    },
    {
      key: "horario",
      label: "Horário de atendimento",
      status: horario ? "ok" : "falta",
      pedido: "os dias e horários que você atende",
    },
    {
      key: "endereco",
      label: "Endereço completo",
      status: endereco ? "ok" : "falta",
      pedido: "o endereço completo com número (e ponto de referência, se ajudar)",
    },
    {
      key: "dominio",
      label: "Domínio (endereço do site)",
      status: projeto?.deployUrl ? "ok" : "falta",
      pedido: "se você já tem um endereço comprado (ex.: seunome.com.br), me diga qual; se não, eu te oriento a registrar",
    },
  ];

  const faltando = items.filter((i) => i.status === "falta");
  const prontos = items.length - faltando.length;
  const mensagem = faltando.length
    ? [
        `Para começar a sua página, preciso de ${faltando.length} coisa${faltando.length > 1 ? "s" : ""} 👇`,
        "",
        ...faltando.map((i) => `• ${i.pedido}`),
        "",
        "Pode mandar por aqui mesmo, no seu tempo. Com isso eu já começo.",
      ].join("\n")
    : "Já tenho tudo que preciso para montar a sua página. Começando agora 👍";

  return {
    items,
    prontos,
    total: items.length,
    percentual: Math.round((prontos / items.length) * 100),
    mensagem,
  };
}

/** Envia o pedido de material (uma mensagem, pelo portão de sempre). */
export async function sendOnboardingRequest(leadId: string, projectId?: string): Promise<{ sent: boolean; detail?: string; mensagem: string }> {
  const lead = getLeadById(leadId);
  if (!lead) throw new Error("Lead não encontrado.");
  const projeto = projectId ? getProjectSafe(projectId) : undefined;
  const estado = buildOnboarding(lead, projeto);
  if (estado.percentual === 100) return { sent: false, detail: "Nada faltando: não há o que pedir.", mensagem: estado.mensagem };

  const resultado = await dispatchLeadReply(lead, { message: estado.mensagem, purpose: "reply" });
  return { sent: resultado.status === "sent", detail: resultado.detail, mensagem: estado.mensagem };
}

function getProjectSafe(id: string): Project | undefined {
  try {
    return getDb().prepare("SELECT * FROM projects WHERE id = ?").get(id) as unknown as Project | undefined;
  } catch {
    return undefined;
  }
}

/* ------------------------------------------------------------------ */
/* marcos                                                              */
/* ------------------------------------------------------------------ */

const MARCOS: Record<string, string | null> = {
  briefing: null, // ainda estamos começando: mensagem seria vazia
  copywriting: "Já comecei a escrever os textos da sua página. Assim que estiverem prontos eu te mostro para aprovar.",
  design: "Os textos estão aprovados e agora estou montando o visual da página com as cores e as fotos que combinamos.",
  wireframe: "A estrutura da página está pronta: cada seção no lugar. Falta aplicar o visual final.",
  desenvolvimento: "A página já está de pé e eu estou ajustando os detalhes de celular e velocidade.",
  revisao: "Sua página está pronta para a última conferência. Vou te mandar o link para você ver antes de publicar.",
  deploy: "Sua página está no ar 🚀 Vou te mandar o link final e o que você precisa para atualizar no futuro.",
};

let tabelaPronta = false;

function ensureMilestoneTable(): void {
  if (tabelaPronta) return;
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS project_milestones (
      project_id TEXT NOT NULL,
      stage TEXT NOT NULL,
      sent_at TEXT NOT NULL,
      PRIMARY KEY (project_id, stage)
    );
  `);
  tabelaPronta = true;
}

export interface MilestoneResult {
  sent: boolean;
  stage: string;
  detail?: string;
}

/**
 * Avisa o cliente que a etapa mudou. Idempotente por (projeto, etapa) — mudar de
 * etapa duas vezes não gera duas mensagens.
 */
export async function notifyProjectMilestone(project: Project, stage: string): Promise<MilestoneResult> {
  const texto = MARCOS[stage];
  if (!texto) return { sent: false, stage, detail: "Etapa sem mensagem própria." };

  ensureMilestoneTable();
  const db = getDb();
  const jaEnviado = db.prepare("SELECT 1 FROM project_milestones WHERE project_id = ? AND stage = ?").get(project.id, stage);
  if (jaEnviado) return { sent: false, stage, detail: "Marco já avisado antes." };

  const lead = project.leadId ? getLeadById(project.leadId) : undefined;
  if (!lead?.phone) return { sent: false, stage, detail: "Projeto sem lead com telefone." };

  const resultado = await dispatchLeadReply(lead, { message: texto, purpose: "reply" });
  if (resultado.status === "sent") {
    db.prepare("INSERT OR REPLACE INTO project_milestones (project_id, stage, sent_at) VALUES (?, ?, ?)").run(
      project.id,
      stage,
      new Date().toISOString()
    );
  }
  return { sent: resultado.status === "sent", stage, detail: resultado.detail };
}
