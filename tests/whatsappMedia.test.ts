import { beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { getDb } from "../server/store/schema";
import { upsertLead, getLeadById } from "../server/store/db";
import {
  aplicarFotoPendente,
  escolherSlotPorTexto,
  fotoPendente,
  registrarFotoPendente,
} from "../server/services/whatsappMediaIntake";
import { previewsDir, previewSlug } from "../server/services/previewService";

/**
 * Foto pelo WhatsApp: a conversa é humana ("é a fachada"), o HTML é técnico
 * (data-slot="hero"). Estes testes cobrem a tradução e o caminho completo —
 * guardar a foto, aplicar no slot e gravar a autorização.
 */

function criarPaginaComSlots(leadId: string, slots: string[]): string {
  const lead = getLeadById(leadId)!;
  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width"></head>
<body><h1>${lead.name}</h1>
${slots
  .map(
    (s) =>
      `<figure class="media-slot" data-slot="${s}"><svg></svg><figcaption>Foto do projeto</figcaption></figure>`,
  )
  .join("\n")}
</body></html>`;
  const dir = previewsDir();
  fs.mkdirSync(dir, { recursive: true });
  const arquivo = path.join(dir, `${previewSlug(lead)}.html`);
  fs.writeFileSync(arquivo, html, "utf8");
  return arquivo;
}

let fotoJpeg: Buffer;

beforeAll(async () => {
  fotoJpeg = await sharp({
    create: { width: 900, height: 600, channels: 3, background: { r: 40, g: 60, b: 90 } },
  })
    .jpeg()
    .toBuffer();
});

describe("escolher slot pelo que o lead escreveu", () => {
  it("fachada vai para hero", () => {
    expect(escolherSlotPorTexto("pode usar, é a fachada", ["hero", "portfolio"])).toBe("hero");
  });

  it("projeto vai para portfolio", () => {
    expect(escolherSlotPorTexto("essas são de um projeto meu", ["hero", "portfolio"])).toBe("portfolio");
  });

  it("equipe e logo também são reconhecidos", () => {
    expect(escolherSlotPorTexto("essa é da equipe", ["equipe", "hero"])).toBe("equipe");
    expect(escolherSlotPorTexto("manda o logo de vocês", ["hero", "logo"])).toBe("logo");
  });

  it("página com um slot só não exige adivinhar", () => {
    expect(escolherSlotPorTexto("pode", ["hero"])).toBe("hero");
  });

  it("sem pista e com vários slots, devolve null (a Clara pergunta)", () => {
    expect(escolherSlotPorTexto("ok", ["hero", "portfolio"])).toBeNull();
  });

  it("não confunde 'topo' com 'portfólio'", () => {
    expect(escolherSlotPorTexto("é a foto do topo", ["portfolio", "hero"])).toBe("hero");
  });
});

describe("foto recebida e aplicada", () => {
  it("guarda a foto pendente e aplica no slot, registrando a autorização", async () => {
    const now = new Date().toISOString();
    const lead = upsertLead({
      id: "lead_teste_foto",
      name: "Estúdio Aurora",
      phone: "+55 61 90000-0001",
      pipelineStatus: "contacted",
      savedAt: now,
      updatedAt: now,
    } as any);
    criarPaginaComSlots(lead.id, ["hero"]);

    const registro = registrarFotoPendente(lead.id, fotoJpeg, { mimetype: "image/jpeg", caption: "" });
    expect(registro.ok).toBe(true);
    expect(registro.slots).toEqual(["hero"]);
    expect(fotoPendente(lead.id).existe).toBe(true);

    const aplicada = await aplicarFotoPendente(lead.id, { slot: "hero", pushName: "Aurora", texto: "pode usar, é a fachada" });
    expect(aplicada.ok).toBe(true);
    expect(aplicada.url).toMatch(/^\/assets\//);

    const html = fs.readFileSync(path.join(previewsDir(), `${previewSlug(getLeadById(lead.id)!)}.html`), "utf8");
    expect(html).toContain("<img");
    expect(html).toContain(aplicada.url!);
    expect(html).toContain('data-filled="true"');

    // sem foto pendente depois de aplicar
    expect(fotoPendente(lead.id).existe).toBe(false);

    const consentimento = getDb()
      .prepare("SELECT slot, origem, autorizado_por, canal, texto FROM media_consents WHERE lead_id = ?")
      .get(lead.id) as any;
    expect(consentimento).toMatchObject({
      slot: "hero",
      origem: "cliente",
      autorizado_por: "Aurora",
      canal: "whatsapp",
      texto: "pode usar, é a fachada",
    });
  });

  it("aplicar sem foto pendente falha com motivo legível", async () => {
    const now = new Date().toISOString();
    const lead = upsertLead({
      id: "lead_teste_sem_foto",
      name: "Sem Foto",
      phone: "+55 61 90000-0002",
      pipelineStatus: "contacted",
      savedAt: now,
      updatedAt: now,
    } as any);
    criarPaginaComSlots(lead.id, ["hero"]);
    const r = await aplicarFotoPendente(lead.id, { slot: "hero" });
    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(/não há foto pendente/i);
  });

  it("slot inexistente é recusado, listando os válidos", async () => {
    const now = new Date().toISOString();
    const lead = upsertLead({
      id: "lead_teste_slot_errado",
      name: "Slot Errado",
      phone: "+55 61 90000-0003",
      pipelineStatus: "contacted",
      savedAt: now,
      updatedAt: now,
    } as any);
    criarPaginaComSlots(lead.id, ["hero"]);
    registrarFotoPendente(lead.id, fotoJpeg, { mimetype: "image/jpeg" });
    const r = await aplicarFotoPendente(lead.id, { slot: "portfolio" });
    expect(r.ok).toBe(false);
    expect(String(r.motivo)).toMatch(/não existe nesta página/i);
  });
});
