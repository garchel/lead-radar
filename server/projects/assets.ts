import fs from "fs";
import path from "path";
import { getLeadById, getProjectById } from "../store/db";
import { BrandSnapshot, Project } from "../store/types";

/* ------------------------------------------------------------------ */
/*  Assets do projeto                                                  */
/*                                                                     */
/*  Reúne, em um só lugar, o que foi IDENTIFICADO (identidade visual   */
/*  do lead: logo, paleta, referências) e o que foi ADICIONADO à LP    */
/*  (arquivos em `sites/<nicho>/<slug>/`). A UI usa isso para mostrar  */
/*  prévias sem precisar abrir o repositório.                          */
/* ------------------------------------------------------------------ */

export type ProjectAssetType = "image" | "video" | "document" | "other";

export interface ProjectAssetFile {
  /** Nome do arquivo (ex.: hero-poster.jpg). */
  name: string;
  /** Caminho relativo à pasta do site, em formato POSIX. */
  path: string;
  /** URL servida pela API para abrir/baixar o arquivo. */
  url: string;
  size: number;
  type: ProjectAssetType;
  mime: string;
  updatedAt: string;
}

export interface ProjectAssetsResult {
  projectId: string;
  sitePath: string;
  /** Pasta do site existe no disco? */
  siteExists: boolean;
  files: ProjectAssetFile[];
  brand?: BrandSnapshot;
  links: {
    wireframeUrl?: string;
    previewUrl?: string;
    deployUrl?: string;
    githubRepoUrl?: string;
  };
}

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".avif", ".ico"]);
const VIDEO_EXTENSIONS = new Set([".mp4", ".webm", ".mov", ".m4v", ".ogv"]);
const DOCUMENT_EXTENSIONS = new Set([".pdf", ".md", ".txt", ".json"]);

const MIME_BY_EXTENSION: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".m4v": "video/x-m4v",
  ".ogv": "video/ogg",
  ".pdf": "application/pdf",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

const MAX_FILES = 200;
const MAX_DEPTH = 4;
const SKIP_DIRECTORIES = new Set(["node_modules", ".git", ".next", "dist", "build", ".cache"]);

function sitesRoot(): string {
  const override = process.env.LEADRADAR_SITES_ROOT;
  return override ? path.resolve(override) : path.join(process.cwd(), "sites");
}

function normalizeSitePath(sitePath: string): string {
  return sitePath.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");
}

/**
 * Converte o `sitePath` do projeto (ex.: `sites/dentista/clinica`) no
 * diretório absoluto no disco. Bloqueia caminhos fora de `sites/`.
 */
export function resolveSiteDir(sitePath?: string): string | null {
  if (!sitePath) return null;
  const normalized = normalizeSitePath(sitePath);
  if (!normalized.startsWith("sites/")) return null;
  const relative = normalized.slice("sites/".length);
  if (!relative) return null;
  if (relative.split("/").some((segment) => !segment || segment === "." || segment === "..")) return null;

  const root = sitesRoot();
  const dir = path.resolve(root, relative);
  if (dir !== root && !dir.startsWith(root + path.sep)) return null;
  return dir;
}

function classifyExtension(ext: string): ProjectAssetType {
  if (IMAGE_EXTENSIONS.has(ext)) return "image";
  if (VIDEO_EXTENSIONS.has(ext)) return "video";
  if (DOCUMENT_EXTENSIONS.has(ext)) return "document";
  return "other";
}

function mimeForExtension(ext: string): string {
  return MIME_BY_EXTENSION[ext] || "application/octet-stream";
}

function isAssetExtension(ext: string): boolean {
  return ext in MIME_BY_EXTENSION;
}

function assetUrl(projectId: string, relativePath: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/asset?path=${encodeURIComponent(relativePath)}`;
}

function collectFiles(
  dir: string,
  siteDir: string,
  projectId: string,
  depth: number,
  out: ProjectAssetFile[]
): void {
  if (out.length >= MAX_FILES || depth > MAX_DEPTH) return;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (out.length >= MAX_FILES) return;
    if (entry.name.startsWith(".")) continue;

    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRECTORIES.has(entry.name.toLowerCase())) continue;
      collectFiles(absolute, siteDir, projectId, depth + 1, out);
      continue;
    }
    if (!entry.isFile()) continue;

    const ext = path.extname(entry.name).toLowerCase();
    if (!isAssetExtension(ext)) continue;

    let stat: fs.Stats;
    try {
      stat = fs.statSync(absolute);
    } catch {
      continue;
    }

    const relativePath = path.relative(siteDir, absolute).split(path.sep).join("/");
    out.push({
      name: entry.name,
      path: relativePath,
      url: assetUrl(projectId, relativePath),
      size: stat.size,
      type: classifyExtension(ext),
      mime: mimeForExtension(ext),
      updatedAt: stat.mtime.toISOString(),
    });
  }
}

/** Lista os assets identificados (marca do lead) e adicionados (arquivos da LP). */
export function listProjectAssets(projectId: string): ProjectAssetsResult {
  const project = getProjectById(projectId);
  if (!project) throw new Error("Projeto não encontrado.");

  const sitePath = project.sitePath || "";
  const siteDir = resolveSiteDir(sitePath);
  const siteExists = Boolean(siteDir && fs.existsSync(siteDir));

  const files: ProjectAssetFile[] = [];
  if (siteDir && siteExists) collectFiles(siteDir, siteDir, project.id, 0, files);
  files.sort((a, b) => a.path.localeCompare(b.path, "pt-BR"));

  const brand = project.leadId ? getLeadById(project.leadId)?.brandSnapshot : undefined;

  return {
    projectId: project.id,
    sitePath,
    siteExists,
    files,
    brand,
    links: {
      wireframeUrl: project.wireframeUrl,
      previewUrl: project.previewUrl,
      deployUrl: project.deployUrl,
      githubRepoUrl: project.githubRepoUrl,
    },
  };
}

/**
 * Resolve o arquivo pedido pela UI, garantindo que ele está dentro da pasta
 * do site do projeto (defesa contra path traversal).
 */
export function resolveProjectAssetFile(
  projectId: string,
  relativePath: string
): { absolutePath: string; mime: string; name: string } {
  const project = getProjectById(projectId);
  if (!project) throw new Error("Projeto não encontrado.");

  const siteDir = resolveSiteDir(project.sitePath);
  if (!siteDir) throw new Error("Projeto sem pasta de site válida.");

  const normalized = String(relativePath || "").replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized.split("/").some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error("Caminho de asset inválido.");
  }

  const absolutePath = path.resolve(siteDir, normalized);
  if (!absolutePath.startsWith(siteDir + path.sep)) {
    throw new Error("Caminho de asset inválido.");
  }
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    throw new Error("Asset não encontrado.");
  }

  const ext = path.extname(absolutePath).toLowerCase();
  if (!isAssetExtension(ext)) throw new Error("Tipo de arquivo não suportado.");

  return { absolutePath, mime: mimeForExtension(ext), name: path.basename(absolutePath) };
}

/** Resumo para o prompt do agente (evita listar dezenas de arquivos). */
export function summarizeProjectAssets(project: Project, maxFiles = 12): string {
  try {
    const assets = listProjectAssets(project.id);
    const parts: string[] = [];
    if (assets.brand) {
      const palette = assets.brand.palette.map((color) => color.hex).join(", ");
      if (palette) parts.push(`paleta identificada: ${palette}`);
      if (assets.brand.logo) parts.push("logo identificado");
    }
    if (assets.files.length) {
      const names = assets.files.slice(0, maxFiles).map((file) => file.path).join(", ");
      parts.push(`${assets.files.length} arquivo(s) na pasta do site: ${names}`);
    }
    return parts.join(" · ");
  } catch {
    return "";
  }
}
