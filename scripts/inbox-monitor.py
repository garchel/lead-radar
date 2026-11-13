#!/usr/bin/env python3
"""Monitor do inbox do LeadRadar para o Hermes (job com `monitor`).

Imprime UMA linha determinística descrevendo a última mensagem RECEBIDA.
- Sem mensagem nova → a linha é idêntica ao tick anterior → o Hermes pula o
  agente (nenhum token gasto).
- Mensagem nova → a linha muda → o Hermes acorda o agente com o diff.

Só olha direction='inbound', então a NOSSA resposta (outbound) não gera um novo
despertar — nada de loop de resposta infinita.
"""
import json
import os
import sqlite3

def _resolve_db() -> str:
    """Descobre o banco do LeadRadar sem caminho fixo.

    O app passou a guardar os dados fora do OneDrive (`LEADRADAR_DATA_DIR` no
    `.env`). Caminho cravado aqui é o que quebrou o monitor por 20 execuções, com
    a Clara muda sem ninguém perceber.
    """
    repo = r"C:\Users\paulo\OneDrive\Documentos\lead-radar"
    env_file = os.path.join(repo, ".env")
    data_dir = None
    try:
        with open(env_file, "r", encoding="utf-8", errors="ignore") as fh:
            for linha in fh:
                linha = linha.strip()
                if linha.startswith("LEADRADAR_DATA_DIR="):
                    data_dir = linha.split("=", 1)[1].strip().strip('"').strip("'")
                    break
    except OSError:
        data_dir = None
    if not data_dir:
        data_dir = os.path.join(repo, "data")
    # caminho no .env pode vir com barras normais (Windows aceita)
    return os.path.join(data_dir, "leadradar.db")


DB = _resolve_db()


def clara_pausada() -> bool:
    """O dono pode calar a Clara pelo WhatsApp (`/pausar`)."""
    try:
        conexao = sqlite3.connect(f"file:{DB}?mode=ro", uri=True, timeout=5)
        linha = conexao.execute("SELECT value FROM app_settings WHERE key = 'automation_clara_paused'").fetchone()
        conexao.close()
        return bool(linha and str(linha[0]).strip() == "true")
    except Exception:  # noqa: BLE001
        return False

QUERY = """
    SELECT c.id AS message_id, c.created_at, c.message, c.intent, c.intent_source,
           c.lead_id, l.name, l.phone, l.pipeline_status,
           (SELECT COUNT(*) FROM communications o
             WHERE o.lead_id = c.lead_id AND o.direction = 'outbound'
               AND o.created_at > c.created_at) AS replied_after
      FROM communications c
      JOIN leads l ON l.id = c.lead_id
     WHERE c.direction = 'inbound'
       -- LGPD: nunca acordar o agente para quem pediu para sair
       AND COALESCE(l.do_not_contact, 0) = 0
       AND COALESCE(c.intent, '') != 'recusa'
       -- comando do dono (" /hoje") não é conversa de lead: não acorda o agente
       AND COALESCE(c.intent, '') != 'comando_dono'
     ORDER BY c.created_at DESC, c.rowid DESC
     LIMIT 1
"""


def main() -> None:
    if clara_pausada():
        # linha fixa: o Hermes não acorda o agente enquanto a pausa durar
        print("inbox: clara pausada pelo dono (/retomar para voltar)")
        return

    try:
        con = sqlite3.connect(f"file:{DB}?mode=ro", uri=True, timeout=5)
        con.row_factory = sqlite3.Row
        row = con.execute(QUERY).fetchone()
        con.close()
    except Exception as exc:  # banco fora: sai com erro (o Hermes alerta em vez de silenciar)
        raise SystemExit(f"monitor do inbox: falha ao ler o banco ({exc})")

    if row is None:
        print("inbox: vazio")
        return

    payload = {
        "message_id": row["message_id"],
        "created_at": row["created_at"],
        "lead_id": row["lead_id"],
        "name": row["name"],
        "phone_last4": ("".join(ch for ch in (row["phone"] or "") if ch.isdigit()) or "")[-4:],
        "intent": row["intent"] or None,
        "intent_source": row["intent_source"] or None,
        "pipeline": row["pipeline_status"],
        "already_answered": bool(row["replied_after"]),
        "text": " ".join(str(row["message"] or "").split())[:240],
    }
    print("inbox_last_inbound " + json.dumps(payload, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
