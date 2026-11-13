#!/usr/bin/env python3
"""Vigia da Clara: avisa no WhatsApp do Paulo quando o atendimento para.

Motivo: o monitor do inbox quebrou por 20 ticks seguidos (caminho do banco fixo,
depois que os dados saíram do OneDrive) e a Clara ficou muda sem ninguém saber.
Falha silenciosa em canal de vendas é pior que falha barulhenta.

Checa três coisas, na ordem em que quebram na prática:
1. o script do monitor roda? (é ele que acorda a Clara)
2. o app responde /api/health? (é ele que envia e registra)
3. existe conversa aberta parada há mais de 10 min? (nem a rede de segurança falou)

Só manda alerta quando algo está errado. Sai com 0 sempre: erro de rede do vigia
não pode virar falha de cron barulhenta.
"""
import json
import os
import sqlite3
import subprocess
import sys
import time
import urllib.error
import urllib.request

APP = "http://localhost:3000"
MONITOR = os.path.join(os.path.expanduser("~"), "AppData", "Local", "hermes", "scripts", "leadradar-inbox-monitor.py")
MAX_SEM_RESPOSTA_MIN = 10


def alerta(motivo: str) -> None:
    payload = json.dumps({"kind": "clara_falhou", "detail": motivo[:480]}).encode("utf-8")
    req = urllib.request.Request(
        f"{APP}/api/alerts/owner",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as res:
            corpo = res.read().decode("utf-8", "ignore")[:200]
            print(f"alerta enviado: {motivo[:120]} | resposta: {corpo}", flush=True)
    except Exception as erro:  # noqa: BLE001 - vigia nunca deve explodir
        print(f"falha ao avisar: {motivo[:120]} | {erro}", flush=True)


def monitor_ok() -> tuple[bool, str]:
    try:
        saida = subprocess.run(
            [sys.executable, MONITOR],
            capture_output=True,
            text=True,
            timeout=60,
        )
    except Exception as erro:  # noqa: BLE001
        return False, f"não consegui rodar o monitor: {erro}"
    if saida.returncode != 0:
        detalhe = (saida.stderr or saida.stdout or "").strip().splitlines()
        return False, detalhe[-1][:200] if detalhe else f"monitor saiu com código {saida.returncode}"
    return True, ""


def app_ok() -> tuple[bool, str]:
    try:
        with urllib.request.urlopen(f"{APP}/api/health", timeout=10) as res:
            return res.status == 200, "" if res.status == 200 else f"health HTTP {res.status}"
    except Exception as erro:  # noqa: BLE001
        return False, f"app não responde: {erro}"


def _db_path() -> str:
    repo = os.path.join(os.path.expanduser("~"), "OneDrive", "Documentos", "lead-radar")
    data_dir = None
    try:
        with open(os.path.join(repo, ".env"), "r", encoding="utf-8", errors="ignore") as fh:
            for linha in fh:
                if linha.strip().startswith("LEADRADAR_DATA_DIR="):
                    data_dir = linha.split("=", 1)[1].strip().strip('"').strip("'")
                    break
    except OSError:
        data_dir = None
    return os.path.join(data_dir or os.path.join(repo, "data"), "leadradar.db")


def conversas_paradas() -> list[dict]:
    """Inbound sem resposta há mais de MAX_SEM_RESPOSTA_MIN minutos.

    Direto no SQLite: varrer lead por lead pela API levava minutos e travava o
    vigia (foi o que aconteceu na primeira versão).
    """
    cutoff = time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(time.time() - MAX_SEM_RESPOSTA_MIN * 60))
    sql = """
        SELECT l.name, c.created_at
          FROM leads l
          JOIN communications c ON c.lead_id = l.id
         WHERE c.status != 'failed'
           AND c.direction = 'inbound'
           AND c.created_at <= ?
           AND COALESCE(l.do_not_contact, 0) = 0
           AND c.id = (SELECT c2.id FROM communications c2
                        WHERE c2.lead_id = l.id AND c2.status != 'failed'
                        ORDER BY c2.created_at DESC, c2.rowid DESC LIMIT 1)
           AND NOT EXISTS (SELECT 1 FROM communications o
                            WHERE o.lead_id = l.id AND o.direction = 'outbound'
                              AND o.status != 'failed' AND o.created_at > c.created_at)
         ORDER BY c.created_at ASC
         LIMIT 5
    """
    try:
        conexao = sqlite3.connect(f"file:{_db_path()}?mode=ro", uri=True, timeout=10)
    except Exception:  # noqa: BLE001
        return []
    try:
        linhas = conexao.execute(sql, (cutoff,)).fetchall()
    except Exception:  # noqa: BLE001
        linhas = []
    finally:
        conexao.close()

    saida = []
    for nome, quando in linhas:
        try:
            epoch = time.mktime(time.strptime(quando[:19], "%Y-%m-%dT%H:%M:%S")) + time.timezone
        except Exception:  # noqa: BLE001
            continue
        saida.append({"nome": nome, "minutos": int((time.time() - (epoch - 2 * time.timezone)) / 60)})
    return saida


def main() -> None:
    ok, detalhe = monitor_ok()
    if not ok:
        alerta(f"monitor do inbox do LeadRadar quebrou: {detalhe}")
        return

    ok, detalhe = app_ok()
    if not ok:
        alerta(f"LeadRadar não está respondendo ({detalhe}). A Clara não consegue enviar.")
        return

    paradas = conversas_paradas()
    if paradas:
        nomes = ", ".join(f"{p['nome']} ({p['minutos']} min)" for p in paradas[:3])
        alerta(f"conversa parada sem resposta: {nomes}. A Clara não respondeu e a rede de segurança também não.")

    print("ok", flush=True)


if __name__ == "__main__":
    main()
