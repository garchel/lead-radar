import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { upsertLead, upsertProject } from "../server/store/db";
import { createProject } from "../server/projects/service";
import { listProjectAssets, resolveProjectAssetFile, resolveSiteDir } from "../server/projects/assets";
import type { StoredLead } from "../server/store/types";

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "leadradar-assets-"));
const originalSitesRoot = process.env.LEADRADAR_SITES_ROOT;

const lead: StoredLead = {
  id: "assets-lead-1",
  name: "Clínica Sorriso",
  category: "Dentista",
  city: "São Paulo",
  state: "SP",
  phone: "5511999999999",
  websiteStatus: "none",
  pipelineStatus: "em_desenvolvimento",
  brandSnapshot: {
    version: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    source: "serpapi",
    query: "Clínica Sorriso",
    profiles: { instagram: "https://instagram.com/clinica.sorriso" },
    palette: [{ hex: "#0F4C81", name: "Azul", role: "primary" }],
    tone: ["acolhedor"],
    imagery: [],
    summary: "Identidade clara.",
    confidence: 0.8,
  },
};

beforeAll(() => {
  process.env.LEADRADAR_SITES_ROOT = tmpRoot;
  const assetsDir = path.join(tmpRoot, "dentista", "clinica-teste", "assets");
  fs.mkdirSync(assetsDir, { recursive: true });
  fs.writeFileSync(path.join(assetsDir, "hero.jpg"), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  fs.writeFileSync(path.join(assetsDir, "hero-loop.mp4"), Buffer.alloc(64));
  fs.writeFileSync(path.join(tmpRoot, "dentista", "clinica-teste", "index.html"), "<html></html>");
  fs.writeFileSync(path.join(assetsDir, "ignorar.exe"), Buffer.alloc(8));
});

afterEach(() => {
  process.env.LEADRADAR_SITES_ROOT = tmpRoot;
});

afterAll(() => {
  if (originalSitesRoot === undefined) delete process.env.LEADRADAR_SITES_ROOT;
  else process.env.LEADRADAR_SITES_ROOT = originalSitesRoot;
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

function makeProject(sitePath = "sites/dentista/clinica-teste") {
  upsertLead(lead, { skipDedup: true });
  const project = createProject({ leadId: lead.id, name: "LP Clínica Sorriso" });
  upsertProject({
    ...project,
    sitePath,
    previewUrl: "https://preview.example.com",
    githubRepoUrl: "https://github.com/acme/lead-radar",
  });
  return project.id;
}

describe("assets do projeto", () => {
  it("lista arquivos da pasta da LP com tipo, tamanho e URL", () => {
    const projectId = makeProject();

    const result = listProjectAssets(projectId);

    expect(result.siteExists).toBe(true);
    expect(result.sitePath).toBe("sites/dentista/clinica-teste");
    expect(result.brand?.palette[0].hex).toBe("#0F4C81");
    expect(result.links.previewUrl).toBe("https://preview.example.com");

    const names = result.files.map((file) => file.path);
    expect(names).toContain("assets/hero.jpg");
    expect(names).toContain("assets/hero-loop.mp4");
    expect(names).not.toContain("assets/ignorar.exe");
    expect(names).not.toContain("index.html");

    const hero = result.files.find((file) => file.path === "assets/hero.jpg")!;
    expect(hero.type).toBe("image");
    expect(hero.mime).toBe("image/jpeg");
    expect(hero.size).toBe(4);
    expect(hero.url).toBe(`/api/projects/${projectId}/asset?path=assets%2Fhero.jpg`);

    const video = result.files.find((file) => file.path === "assets/hero-loop.mp4")!;
    expect(video.type).toBe("video");
  });

  it("resolve o arquivo para envio pela API", () => {
    const projectId = makeProject();

    const file = resolveProjectAssetFile(projectId, "assets/hero.jpg");

    expect(file.mime).toBe("image/jpeg");
    expect(file.name).toBe("hero.jpg");
    expect(fs.existsSync(file.absolutePath)).toBe(true);
  });

  it("bloqueia path traversal e arquivos fora da pasta do site", () => {
    const projectId = makeProject();

    expect(() => resolveProjectAssetFile(projectId, "../../package.json")).toThrow(/inválido/i);
    expect(() => resolveProjectAssetFile(projectId, "assets/../index.html")).toThrow(/inválido/i);
    expect(() => resolveProjectAssetFile(projectId, "index.html")).toThrow(/não suportado/i);
    expect(() => resolveProjectAssetFile(projectId, "assets/ignorar.exe")).toThrow(/não suportado/i);
  });

  it("rejeita sitePath fora de sites/ e retorna pasta inexistente sem erro", () => {
    expect(resolveSiteDir("../fora")).toBeNull();
    expect(resolveSiteDir("sites/../fora")).toBeNull();
    expect(resolveSiteDir("")).toBeNull();

    const projectId = makeProject("sites/dentista/nao-existe");

    const result = listProjectAssets(projectId);
    expect(result.siteExists).toBe(false);
    expect(result.files).toEqual([]);
  });
});
