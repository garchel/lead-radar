#!/usr/bin/env bash
# Encerra o que estiver escutando na 3000 e só retorna quando a porta estiver livre.
#
# Duas lições que este script carrega (custaram dois deploys servindo build velho):
#  1. `kill -TERM` do git-bash NÃO encerra processo nativo do Windows, e `kill -0` volta
#     erro mesmo com o processo vivo: o script "confirmava" o encerramento e o servidor
#     velho continuava na porta. A instância nova morria com EADDRINUSE e a API seguia
#     respondendo o código antigo — o teste ao vivo mostrava o texto de antes.
#  2. `taskkill //F` não é convertido pelo MSYS e vira argumento inválido. O caminho que
#     funciona aqui é o PowerShell Stop-Process.
# Quem decide se liberou é a PORTA, não o pid.
set -uo pipefail
cd "$(dirname "$0")/.."

PID_FILE="${LOCALAPPDATA:-/tmp}/Temp/leadradar.pid"

pid_na_porta() {
  powershell -NoProfile -Command "(Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue).OwningProcess" 2>/dev/null | tr -d '\r\n ' || true
}

PID="$(pid_na_porta)"
if [ -z "$PID" ]; then
  echo "porta 3000 livre"
  rm -f "$PID_FILE"
  exit 0
fi

echo "encerrando pid $PID..."
powershell -NoProfile -Command "Stop-Process -Id $PID -Force -ErrorAction SilentlyContinue" >/dev/null 2>&1 || true

for _ in $(seq 1 20); do
  if [ -z "$(pid_na_porta)" ]; then
    echo "porta 3000 liberada"
    rm -f "$PID_FILE"
    exit 0
  fi
  sleep 0.5
done

echo "ERRO: porta 3000 continua ocupada por $(pid_na_porta)"
exit 1
