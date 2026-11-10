#!/usr/bin/env node
/**
 * Página local de conexão WhatsApp (substituta do /manager da Evolution,
 * que o WhatsMiau não tem — é API pura, sem frontend).
 *
 * Roda um HTTP server em http://127.0.0.1:8899 que:
 *   - busca um QR NOVO a cada carregamento (nunca expirado na tela)
 *   - auto-atualiza a cada 15s
 *   - fica verde quando conectar
 *
 * Uso: node scripts/whatsmiau-connect-page.mjs
 */
import { createServer } from "node:http";

const WHATSMIAU = "http://127.0.0.1:8081";
const KEY = "leadradar-whatsmiau-key";
const PORT = 8899;

async function wm(path) {
  try {
    const r = await fetch(WHATSMIAU + path, {
      headers: { apikey: KEY },
      signal: AbortSignal.timeout(8000),
    });
    return await r.json();
  } catch {
    return {};
  }
}

const PAGE = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>LeadRadar — Conectar WhatsApp</title>
<style>
  body { font-family: system-ui, sans-serif; background:#0f172a; color:#e2e8f0;
         display:flex; flex-direction:column; align-items:center; justify-content:center;
         min-height:100vh; margin:0; padding:20px; }
  h1 { font-size:20px; margin:0 0 6px; }
  p.sub { color:#94a3b8; font-size:13px; margin:0 0 18px; }
  #qr { background:#fff; padding:14px; border-radius:14px; min-height:308px;
        display:flex; align-items:center; justify-content:center; }
  #qr img { display:block; width:280px; height:280px; image-rendering:pixelated; }
  .ph { color:#64748b; font-size:13px; text-align:center; padding:20px; }
  .status { margin-top:16px; font-size:13px; padding:8px 16px; border-radius:999px; }
  .waiting { background:#1e293b; color:#fbbf24; }
  .open { background:#064e3b; color:#6ee7b7; }
  .err { background:#450a0a; color:#fca5a5; }
  .steps { margin-top:22px; font-size:12px; color:#94a3b8; line-height:1.9; text-align:left;
           background:#1e293b; padding:14px 20px; border-radius:12px; max-width:380px; }
  .steps b { color:#e2e8f0; }
  button { margin-top:14px; background:#2563eb; color:#fff; border:0; padding:9px 18px;
           border-radius:9px; font-size:13px; cursor:pointer; }
  button:hover { background:#1d4ed8; }
</style>
</head>
<body>
<h1>Conectar WhatsApp ao LeadRadar</h1>
<p class="sub">O QR e buscado novo a cada atualizacao — nunca expira na tela.</p>
<div id="qr"><div class="ph">Carregando QR Code...</div></div>
<div id="status" class="status waiting">Aguardando leitura do QR Code...</div>
<button onclick="refresh()">Gerar QR novo agora</button>
<div class="steps">
  <b>No celular (WhatsApp Business +55 61 9379-7728):</b><br>
  1. Toque nos <b>tres pontinhos</b> no canto<br>
  2. <b>Aparelhos conectados</b><br>
  3. <b>Conectar um aparelho</b><br>
  4. Aponte a camera para o codigo acima<br><br>
  Quando conectar, esta pagina fica <b>verde</b>.
</div>
<script>
const qr = document.getElementById("qr");
const st = document.getElementById("status");
let done = false;

async function refresh() {
  if (done) return;
  try {
    const r = await fetch("/qr");
    const j = await r.json();
    if (j.state === "open") {
      qr.innerHTML = "<div class='ph' style='color:#6ee7b7'>WhatsApp conectado!</div>";
      st.textContent = "CONECTADO! Pode fechar esta aba.";
      st.className = "status open";
      document.querySelector("h1").textContent = "WhatsApp conectado!";
      done = true;
      return;
    }
    if (j.base64) {
      const src = j.base64.startsWith("data:") ? j.base64 : "data:image/png;base64," + j.base64;
      qr.innerHTML = '<img src="' + src + '" alt="QR Code">';
      st.textContent = "Aguardando leitura do QR Code...";
      st.className = "status waiting";
    } else {
      qr.innerHTML = "<div class='ph'>Sem QR no momento (" + (j.state || "?") + ")<br>Clique em 'Gerar QR novo agora'.</div>";
    }
  } catch (e) {
    st.textContent = "Erro ao falar com o servidor local.";
    st.className = "status err";
  }
}

refresh();
setInterval(refresh, 15000);
</script>
</body>
</html>`;

createServer(async (req, res) => {
  const url = req.url || "/";

  if (url === "/qr") {
    const st = await wm("/v1/instance/connectionState/leadradar");
    const state = st.instance?.state || st.state || "unknown";
    if (state === "open") {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ state: "open" }));
    }
    const c = await wm("/v1/instance/connect/leadradar");
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ state, base64: c.base64 || "" }));
  }

  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(PAGE);
}).listen(PORT, "127.0.0.1", () => {
  console.log(`Pagina de conexao: http://127.0.0.1:${PORT}`);
  console.log("Abra esse endereco no navegador para escanear o QR.");
});
