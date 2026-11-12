/**
 * Cópia local das imagens coletadas do negócio.
 *
 * Dois motivos, ambos já vistos em prévia real:
 * 1. CDN de rede social (Instagram/Facebook) bloqueia hotlink: a imagem chega
 *    quebrada e o hero fica com um retângulo vazio.
 * 2. O original pode sair do ar entre a coleta e o clique do cliente — a prévia
 *    ficaria sem foto justamente na hora de vender.
 *
 * Aqui a imagem é baixada uma vez, salva em `previews/assets/<hash>.<ext>` e a URL
 * do snapshot é trocada por um caminho relativo. O Pages publica a pasta inteira,
 * então o link funciona igual no servidor local e na CDN.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { BrandSnapshot } from "../store/types";
import { previewsDir } from "./previewService";

const MAX_BYTES = 4 * 1024 * 1024; // foto de fachada em resolução alta ainda cabe
const TIMEOUT_MS = 9_000;

/** cache por URL dentro do processo: a mesma imagem não é baixada duas vezes */
const baixadas = new Map<string, string | null>();

function extDe(contentType: string, url: string): string {
  if (/png/i.test(contentType)) return "png";
  if (/webp/i.test(contentType)) return "webp";
  if (/gif/i.test(contentType)) return "gif";
  if (/svg/i.test(contentType)) return "svg";
  if (/jpe?g/i.test(contentType)) return "jpg";
  const doUrl = /\.(jpe?g|png|webp|gif|svg)(?:\?|$)/i.exec(url);
  return doUrl ? doUrl[1].toLowerCase().replace("jpeg", "jpg") : "jpg";
}

export function assetsDir(): string {
  return path.join(previewsDir(), "assets");
}

async function baixar(url: string): Promise<string | null> {
  if (baixadas.has(url)) return baixadas.get(url)!;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "user-agent": "Mozilla/5.0 (compatible; LeadRadarPreview/1.0)", accept: "image/*" },
    });
    clearTimeout(timer);
    if (!res.ok) {
      baixadas.set(url, null);
      return null;
    }
    const tipo = res.headers.get("content-type") || "";
    if (!/^image\//i.test(tipo)) {
      baixadas.set(url, null);
      return null;
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    if (!buffer.length || buffer.length > MAX_BYTES) {
      baixadas.set(url, null);
      return null;
    }
    const dir = assetsDir();
    fs.mkdirSync(dir, { recursive: true });
    const ext = extDe(tipo, url);
    const nome = `${crypto.createHash("sha1").update(url).digest("hex").slice(0, 16)}.${ext}`;
    fs.writeFileSync(path.join(dir, nome), buffer);
    const relativo = `assets/${nome}`;
    baixadas.set(url, relativo);
    return relativo;
  } catch {
    baixadas.set(url, null);
    return null;
  }
}

/**
 * Devolve um snapshot com as URLs trocadas pelas cópias locais.
 *
 * Imagem que não baixou sai da lista: melhor uma seção a menos do que um
 * retângulo quebrado na cara do cliente.
 */
export async function cacheSnapshotImages(snapshot?: BrandSnapshot): Promise<BrandSnapshot | undefined> {
  if (!snapshot) return snapshot;

  const imagery: BrandSnapshot["imagery"] = [];
  for (const img of snapshot.imagery || []) {
    const url = String(img.url || "");
    if (!/^https?:\/\//i.test(url)) {
      imagery.push(img);
      continue;
    }
    const local = await baixar(url);
    if (local) imagery.push({ ...img, url: local });
  }

  let logo = snapshot.logo;
  if (logo?.url && /^https?:\/\//i.test(logo.url)) {
    const local = await baixar(logo.url);
    logo = local ? { ...logo, url: local } : { ...logo, url: undefined };
  }

  return { ...snapshot, imagery, logo };
}
