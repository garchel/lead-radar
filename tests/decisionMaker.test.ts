import { describe, expect, it } from "vitest";
import { getDb } from "../server/store/schema";
import { upsertLead, getLeadById } from "../server/store/db";
import { classifyByRules } from "../server/services/intentService";
import { buildProspectMessage } from "../server/services/autoProspectingService";
import { salvarDecisor, telefoneDeEnvio, conversaComDecisor } from "../server/services/decisionMakerService";

/**
 * Porteiro do WhatsApp: o número que o Google mostra de uma empresa cai na
 * recepção. Quem responde é funcionário, e a conversa precisa chegar em quem
 * decide sem perder o número do negócio.
 */

function criarLead(id: string, phone: string, extra: Record<string, unknown> = {}) {
  return upsertLead({
    id,
    // nome único por lead: o upsert deduplica por nome+cidade e devolveria o
    // primeiro registro, escondendo o id que o teste quer inspecionar.
    name: `Barbearia ${id} LC`,
    category: "Barbearia",
    city: "Três Lagoas",
    state: "MS",
    phone,
    websiteStatus: "none",
    rating: 5,
    reviewsCount: 1274,
    pipelineStatus: "contacted",
    ...extra,
  } as any);
}

describe("intenção: funcionário indica o dono", () => {
  const frases = [
    "Não sou o dono, fala com a Maria",
    "aqui é a secretária, quem cuida disso é o gerente",
    "te passo o contato do responsável",
    "o dono é o João, chama ele",
  ];

  it.each(frases)("classifica como indicação: %s", (frase) => {
    expect(classifyByRules(frase).intent).toBe("indicacao");
  });

  it("não atropela quem quer a prévia de verdade", () => {
    expect(classifyByRules("quero sim, manda a prévia").intent).toBe("interesse");
  });

  it("indicação mantém a conversa em negociando", () => {
    expect(classifyByRules("não sou o dono, fala com a Maria").status).toBe("negotiating");
  });
});

describe("dono/responsável salvo no lead", () => {
  it("guarda o contato e passa a enviar para ele", () => {
    criarLead("lead-teste-dm-1", "+55 67 99999-0000");
    const r = salvarDecisor("lead-teste-dm-1", { name: "Maria Souza", phone: "67 98888-1111", source: "funcionario" });
    expect(r.ok).toBe(true);

    const lead = getLeadById("lead-teste-dm-1")!;
    expect(lead.dmName).toBe("Maria Souza");
    expect(lead.dmPhone).toBe("5567988881111");
    // o número da empresa continua no cadastro
    expect(lead.phone).toBe("+55 67 99999-0000");
    expect(telefoneDeEnvio(lead)).toBe("5567988881111");
    expect(conversaComDecisor(lead)).toBe(true);
  });

  it("recusa telefone inválido", () => {
    criarLead("lead-teste-dm-2", "+55 67 91111-0002");
    expect(salvarDecisor("lead-teste-dm-2", { phone: "1234" }).ok).toBe(false);
  });

  it("recusa o próprio número da empresa como se fosse o dono", () => {
    criarLead("lead-teste-dm-3", "+55 67 91111-0003");
    expect(salvarDecisor("lead-teste-dm-3", { phone: "67 91111-0003" }).ok).toBe(false);
  });

  it("guarda quem passou o contato", () => {
    criarLead("lead-teste-dm-4", "+55 67 91111-0004");
    salvarDecisor("lead-teste-dm-4", { phone: "67 98888-2222", referredBy: "Ana da recepção" });
    expect(getLeadById("lead-teste-dm-4")!.notes).toMatch(/indicado por Ana da recepção/i);
  });
});

describe("primeiro contato com portaria", () => {
  it("dá ao funcionário a saída para passar o contato de quem decide", () => {
    criarLead("lead-teste-dm-5", "+55 67 99999-7777");
    try { getDb().prepare("DELETE FROM preview_slugs WHERE lead_id = ?").run("lead-teste-dm-5"); } catch { /* tabela criada sob demanda */ }

    const msg = buildProspectMessage(getLeadById("lead-teste-dm-5")!);
    expect(msg).toMatch(/n[ãa]o for voc[êe]/i);
    // nota final em itálico, com a pergunta de fechamento antes dela
    expect(msg).toMatch(/_Se n[ãa]o for voc[êe][^_]*_/);
    expect(msg).toMatch(/Posso te mandar o link/i);
  });

  it("quando já fala com o dono, abre dizendo quem passou o contato", () => {
    criarLead("lead-teste-dm-6", "+55 67 99999-6666");
    try { getDb().prepare("DELETE FROM preview_slugs WHERE lead_id = ?").run("lead-teste-dm-6"); } catch { /* idem */ }
    salvarDecisor("lead-teste-dm-6", { name: "João Pereira", phone: "67 98888-3333", referredBy: "Ana da recepção" });

    const msg = buildProspectMessage(getLeadById("lead-teste-dm-6")!, { previewPronta: true });
    expect(msg).toMatch(/passou/i);
    expect(msg).toMatch(/Ana da recepção/i);
    expect(msg).toMatch(/João/);
    // não repete o "achei vocês no Google", que faria o dono não saber de onde veio
    expect(msg).not.toMatch(/Achei .* no Google/i);
  });
});
