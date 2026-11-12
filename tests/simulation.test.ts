import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "../server/store/schema";
import { getLeadById, getProjectsByLead, upsertLead } from "../server/store/db";
import {
  FIRST_PROJECT_STAGE,
  SIMULATION_LEAD_ID,
  pickSimulationCandidates,
  resetSimulationCard,
} from "../server/services/simulationService";

function criarLeadPaulo() {
  const agora = new Date().toISOString();
  upsertLead(
    {
      id: SIMULATION_LEAD_ID,
      name: "Paulo Victor | Landing Pages",
      phone: "5561995254732",
      city: "Brasília",
      state: "DF",
      pipelineStatus: "negociating" as any,
      lastContactAt: agora,
      contactAttempts: 3,
      savedAt: agora,
    },
    { skipDedup: true }
  );
}

beforeEach(() => {
  const db = getDb();
  db.exec("DELETE FROM projects WHERE lead_id = 'pv-landing-1'");
  db.exec("DELETE FROM leads WHERE id = 'pv-landing-1'");
  criarLeadPaulo();
});

describe("reset do card de simulação", () => {
  it("volta o CRM para a primeira etapa e limpa os contadores de contato", () => {
    const card = resetSimulationCard("Barbearia Navalha de Ouro");
    const lead = getLeadById(SIMULATION_LEAD_ID)!;

    expect(card.leadName).toBe("Barbearia Navalha de Ouro");
    expect(lead.name).toBe("Barbearia Navalha de Ouro");
    expect(lead.pipelineStatus).toBe("prospect");
    expect(lead.lastContactAt).toBeUndefined();
    expect(lead.contactAttempts).toBe(0);
    expect(card.pipelineStatus).toBe("prospect");
  });

  it("cria o projeto na primeira etapa com o nome da empresa", () => {
    const card = resetSimulationCard("Clínica Sorriso");
    expect(card.projectStage).toBe(FIRST_PROJECT_STAGE);
    expect(card.projectName).toBe("Clínica Sorriso — Landing Page");
    expect(card.projectStatus).toBe("em_andamento");

    const projetos = getProjectsByLead(SIMULATION_LEAD_ID);
    expect(projetos.length).toBe(1);
    expect(projetos[0].stage).toBe(FIRST_PROJECT_STAGE);
  });

  it("reaproveita o projeto existente em vez de duplicar, e volta para o início", () => {
    resetSimulationCard("Primeira Empresa");
    const projetos = getProjectsByLead(SIMULATION_LEAD_ID);
    const id = projetos[0].id;

    // simula o projeto avançado
    getDb()
      .prepare("UPDATE projects SET stage = 'desenvolvimento', deploy_url = 'https://x.test' WHERE id = ?")
      .run(id);

    const card = resetSimulationCard("Segunda Empresa");
    expect(card.projectId).toBe(id);
    expect(card.projectName).toBe("Segunda Empresa — Landing Page");
    expect(getProjectsByLead(SIMULATION_LEAD_ID).length).toBe(1);

    const depois = getProjectsByLead(SIMULATION_LEAD_ID)[0];
    expect(depois.stage).toBe(FIRST_PROJECT_STAGE);
    expect(depois.deployUrl).toBeUndefined();
  });

  it("limpa os assets antigos e apaga a prévia da simulação anterior", async () => {
    const { previewsDir } = await import("../server/services/previewService");
    const fs = await import("node:fs");
    const path = await import("node:path");

    getDb()
      .prepare("UPDATE leads SET brand_snapshot_json = ?, client_profile_json = ?, site_audit_json = ? WHERE id = ?")
      .run(JSON.stringify({ version: 1 }), JSON.stringify({ name: "antiga" }), JSON.stringify({ score: 1 }), SIMULATION_LEAD_ID);

    const dir = previewsDir();
    fs.mkdirSync(dir, { recursive: true });
    const arquivo = path.join(dir, `${SIMULATION_LEAD_ID}.html`);
    fs.writeFileSync(arquivo, "<html>empresa antiga</html>", "utf8");

    resetSimulationCard("Empresa Nova");
    const lead = getLeadById(SIMULATION_LEAD_ID)!;
    expect(lead.brandSnapshot).toBeUndefined();
    expect(lead.clientProfile).toBeUndefined();
    expect(lead.siteAudit).toBeUndefined();
    expect(fs.existsSync(arquivo)).toBe(false);
  });

  it("nome vazio cai no rótulo padrão em vez de criar card sem nome", () => {
    const card = resetSimulationCard("   ");
    expect(card.leadName).toBe("Simulação");
  });
});

describe("escolha do lead simulado", () => {
  it("não devolve lead sem site ausente, nota baixa ou marcado como teste", () => {
    const agora = new Date().toISOString();
    const inserir = (id: string, extra: Record<string, any>) => {
      getDb()
        .prepare(
          `INSERT OR REPLACE INTO leads (id, name, phone, normalized_phone, website_status, rating, reviews_count,
             pipeline_status, do_not_contact, is_test, opportunity_score, saved_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
        )
        .run(
          id,
          extra.name || id,
          "5561999998888",
          "5561999998888",
          extra.website_status ?? "none",
          extra.rating ?? 4.9,
          extra.reviews_count ?? 200,
          "prospect",
          extra.do_not_contact ?? 0,
          extra.is_test ?? 0,
          extra.score ?? 90,
          agora,
          agora
        );
    };

    inserir("bom", { score: 95 });
    inserir("tem_site", { website_status: "has_website" });
    inserir("nota_baixa", { rating: 3.9 });
    inserir("poucas_avaliacoes", { reviews_count: 10 });
    inserir("teste", { is_test: 1 });
    inserir("optout", { do_not_contact: 1 });

    const ids = pickSimulationCandidates(10).map((l) => l.id);
    expect(ids).toContain("bom");
    expect(ids).not.toContain("tem_site");
    expect(ids).not.toContain("nota_baixa");
    expect(ids).not.toContain("poucas_avaliacoes");
    expect(ids).not.toContain("teste");
    expect(ids).not.toContain("optout");
    expect(ids).not.toContain(SIMULATION_LEAD_ID);
  });
});
