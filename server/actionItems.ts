import { getProjects, getDueFollowUps } from "./store/db";
import { listOutbox, type OutboxItem } from "./services/outboxService";

/* ------------------------------------------------------------------ */
/*  Próximas ações                                                     */
/*                                                                     */
/*  Agrega num único endpoint o que precisa de atenção do utilizador:  */
/*   - projetos com código entregue aguardando revisão;                */
/*   - projetos com prazo vencido;                                     */
/*   - recontatos devidos (mesma fonte do FollowUpQueue no CRM);       */
/*   - outbox: envios falhados (7d) e sem ACK há +24h.                 */
/* ------------------------------------------------------------------ */

export type ActionItemKind =
  | "code_review"
  | "project_overdue"
  | "follow_ups_due"
  | "outbox_failed"
  | "outbox_unconfirmed";

export interface ActionItem {
  id: string;
  kind: ActionItemKind;
  severity: "high" | "medium";
  title: string;
  detail: string;
  count: number;
  /** Aba para onde a ação navega (id do activeTab no frontend). */
  tab: "projects" | "crm" | "growth";
  /** Quando definido, a navegação abre o modal deste projeto. */
  projectId?: string;
}

export interface ActionItemsResult {
  success: true;
  items: ActionItem[];
  total: number;
  generatedAt: string;
  /** Detalhe das mensagens do outbox (máx. 5 cada) para a UI expandir. */
  outbox: { failed: OutboxItem[]; unconfirmed: OutboxItem[] };
}

function summarizeNames(names: string[], max = 3): string {
  if (names.length === 0) return "";
  const head = names.slice(0, max).join(", ");
  return names.length > max ? `${head}…` : head;
}

export function buildActionItems(now = new Date()): ActionItemsResult {
  const items: ActionItem[] = [];
  const projects = getProjects();

  // 1) Projetos com código entregue aguardando revisão do utilizador.
  //    Projetos concluídos/arquivados saem da fila de revisão.
  const codeReview = projects.filter(
    (p) => p.devStatus === "codigo_entregue" && p.status !== "concluido" && !p.archived
  );
  if (codeReview.length > 0) {
    items.push({
      id: "code_review",
      kind: "code_review",
      severity: "high",
      title:
        codeReview.length === 1
          ? "1 projeto com código entregue"
          : `${codeReview.length} projetos com código entregue`,
      detail: summarizeNames(codeReview.map((p) => p.name)),
      count: codeReview.length,
      tab: "projects",
      projectId: codeReview[0].id,
    });
  }

  // 2) Projetos com prazo vencido e ainda não concluídos.
  const overdue = projects.filter((p) => {
    if (p.status === "concluido" || p.archived || !p.dueDate) return false;
    const due = new Date(`${p.dueDate.slice(0, 10)}T23:59:59`);
    return Number.isFinite(due.getTime()) && due < now;
  });
  if (overdue.length > 0) {
    items.push({
      id: "project_overdue",
      kind: "project_overdue",
      severity: "medium",
      title:
        overdue.length === 1
          ? "1 projeto com prazo vencido"
          : `${overdue.length} projetos com prazo vencido`,
      detail: summarizeNames(overdue.map((p) => p.name)),
      count: overdue.length,
      tab: "projects",
      projectId: overdue[0].id,
    });
  }

  // 3) Recontatos devidos (mesma fonte do FollowUpQueue).
  const dueFollowUps = getDueFollowUps(now.toISOString());
  if (dueFollowUps.length > 0) {
    items.push({
      id: "follow_ups_due",
      kind: "follow_ups_due",
      severity: "high",
      title:
        dueFollowUps.length === 1
          ? "1 recontato pendente"
          : `${dueFollowUps.length} recontatos pendentes`,
      detail: summarizeNames(dueFollowUps.map((f) => f.lead?.name || f.leadId)),
      count: dueFollowUps.length,
      tab: "crm",
    });
  }

  // 4) Outbox: falhados (7d) e enviados sem ACK há +24h.
  const outbox = listOutbox({ now });
  if (outbox.counts.failed > 0) {
    items.push({
      id: "outbox_failed",
      kind: "outbox_failed",
      severity: "high",
      title:
        outbox.counts.failed === 1
          ? "1 envio falhado"
          : `${outbox.counts.failed} envios falhados`,
      detail: summarizeNames(outbox.failed.map((f) => f.leadName)),
      count: outbox.counts.failed,
      tab: "growth",
    });
  }
  if (outbox.counts.unconfirmed > 0) {
    items.push({
      id: "outbox_unconfirmed",
      kind: "outbox_unconfirmed",
      severity: "medium",
      title:
        outbox.counts.unconfirmed === 1
          ? "1 enviado sem ACK há +24h"
          : `${outbox.counts.unconfirmed} enviados sem ACK há +24h`,
      detail: summarizeNames(outbox.unconfirmed.map((f) => f.leadName)),
      count: outbox.counts.unconfirmed,
      tab: "growth",
    });
  }

  // Severidade alta primeiro; empate preserva a ordem acima.
  items.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "high" ? -1 : 1));

  return {
    success: true,
    items,
    total: items.reduce((acc, item) => acc + item.count, 0),
    generatedAt: now.toISOString(),
    outbox: {
      failed: outbox.failed.slice(0, 5),
      unconfirmed: outbox.unconfirmed.slice(0, 5),
    },
  };
}
