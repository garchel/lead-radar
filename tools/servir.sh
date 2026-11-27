#!/usr/bin/env bash
# Sobe o servidor destacado do shell que chamou.
#
# Motivo: quando o processo é iniciado preso ao terminal do agente, matá-lo no deploy
# faz o wrapper sair com 127 e gera um aviso de "processo falhou" a cada publicação.
# Destacando com nohup + disown, o wrapper termina com 0 e o servidor segue sozinho.
set -euo pipefail
cd "$(dirname "$0")/.."

LOG="${LOCALAPPDATA:-/tmp}/Temp/leadradar.log"
PID="${LOCALAPPDATA:-/tmp}/Temp/leadradar.pid"

NODE_ENV=production nohup node dist/server.cjs >>"$LOG" 2>&1 &
echo $! >"$PID"
disown || true
echo "servidor iniciado (pid $(cat "$PID")) — log: $LOG"
