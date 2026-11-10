#!/usr/bin/env node
/**
 * Loop de conexão WhatsApp via WhatsMiau.
 * - Regenera o QR a cada 15s no disco (qrcode-whatsmiau.png)
 * - Detecta quando conectar (state=open) e sai
 * Uso: node scripts/whatsmiau-qr-loop.mjs
 */
import { writeFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";

const BASE = "http://127.0.0.1:8081";
const KEY = "leadradar-whatsmiau-key";
const OUT_PNG = new URL("../qrcode-whatsmiau.png", import.meta.url);
const MAX = 240; // 240 x 15s = 60 min

async function getJSON(path, opts = {}) {
  const res = await fetch(BASE + path, {
    ...opts,
    headers: { apikey: KEY, ...(opts.headers || {}) },
  });
  return res.json().catch(() => ({}));
}

async function checkState() {
  const j = await getJSON("/v1/instance/connectionState/leadradar");
  return (j.instance && j.instance.state) || j.state || "unknown";
}

async function refreshQR() {
  try {
    const j = await getJSON("/v1/instance/connect/leadradar");
    let b64 = j.base64 || "";
    if (!b64) return false;
    if (b64.includes(",")) b64 = b64.split(",")[1];
    writeFileSync(OUT_PNG, Buffer.from(b64, "base64"));
    return true;
  } catch {
    return false;
  }
}

console.log("[qr-loop] iniciado — QR regenerado a cada 15s. Estado 'open' encerra.");

for (let i = 1; i <= MAX; i++) {
  let state = "unknown";
  try {
    state = await checkState();
  } catch (e) {
    console.log(`[qr-loop] ${i}) erro ao consultar estado: ${e.message}`);
  }

  if (state === "open") {
    console.log(`[qr-loop] CONECTADO (ciclo ${i}) — WhatsApp pronto!`);
    process.exit(0);
  }

  if (state === "qr-code") {
    const ok = await refreshQR();
    console.log(`[qr-loop] ${i}) state=qr-code — QR ${ok ? "atualizado" : "nao retornado"}`);
  } else if (state === "closed") {
    // "closed" não está exibindo QR: forçamos o connect para gerar um novo.
    const ok = await refreshQR();
    console.log(`[qr-loop] ${i}) state=closed — forçando connect, QR ${ok ? "gerado" : "nao retornado"}`);
  } else {
    console.log(`[qr-loop] ${i}) state=${state}`);
  }

  await delay(15000);
}

console.log("[qr-loop] tempo esgotado (60 min) sem conexao.");
process.exit(1);
