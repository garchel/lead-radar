#!/bin/sh
# Garante /app/data exista mesmo quando um volume Docker é montado por cima
# (volume vazio sobrescreve o dir criado na imagem — bug de 1ª subida).
set -e
mkdir -p /app/data
chmod 777 /app/data 2>/dev/null || true
exec /app/whatsmiau
