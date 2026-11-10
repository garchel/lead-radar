#!/usr/bin/env node
/**
 * Salva o QR atual (qr-whatsmiau.json) como qrcode-whatsmiau.png.
 * Uso: node scripts/save-qr.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";

const jsonPath = new URL("../qr-whatsmiau.json", import.meta.url);
const pngPath = new URL("../qrcode-whatsmiau.png", import.meta.url);

const data = JSON.parse(readFileSync(jsonPath, "utf8"));
let b64 = data.base64 || "";
if (!b64) {
  console.error("SEM base64 na resposta:", JSON.stringify(data).slice(0, 200));
  process.exit(1);
}
if (b64.includes(",")) b64 = b64.split(",")[1];
const png = Buffer.from(b64, "base64");
writeFileSync(pngPath, png);
console.log("OK", png.length, "bytes");
