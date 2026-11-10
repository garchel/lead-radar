#!/usr/bin/env node
/**
 * Regenera o QR Code do WhatsMiau em disco (chamado pelo cronjob).
 * - state=open  → conectado, não mexe no PNG (avisa).
 * - state=qr-code/closed → gera qrcode-whatsmiau.png via /instance/connect.
 * Saída: só imprime em mudança relevante (cron entrega no chat).
 */
import { writeFileSync } from "node:fs";

const BASE = "http://127.0.0.1:8081";
const KEY = "leadradar-whatsmiau-key";
const PNG = new URL("../qrcode-whatsmiau.png", import.meta.url);

async function j(path, opts = {}) {
  const r = await fetch(BASE + path, {
    ...opts,
    headers: { apikey: KEY, ...(opts.headers || {}) },
    signal: AbortSignal.timeout(8000),
  });
  return r.json().catch(() => ({}));
}

async function genQR() {
  const d = await j("/v1/instance/connect/leadradar");
  let b = d.base64 || "";
  if (!b) return false;
  if (b.includes(",")) b = b.split(",")[1];
  writeFileSync(PNG, Buffer.from(b, "base64"));
  return true;
}

const state = (await j("/v1/instance/connectionState/leadradar")).instance?.state || "unknown";

if (state === "open") {
  console.log("CONECTADO — WhatsApp online (state=open). Pode remover o cronjob.");
} else {
  const ok = await genQR();
  console.log(`state=${state} — QR ${ok ? "gerado" : "nao retornado"}.`);
}
