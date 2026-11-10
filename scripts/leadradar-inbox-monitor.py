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

DB = r"C:\Users\paulo\OneDrive\Documentos\lead-radar\data\leadradar.db"

QUERY = """
    SELECT c.id AS message_id, c.created_at, c.message, c.intent, c.intent_source,
           c.lead_id, l.name, l.phone, l.pipeline_status,
           (SELECT COUNT(*) FROM communications o
             WHERE o.lead_id = c.lead_id AND o.direction = 'outbound'
               AND o.created_at > c.created_at) AS replied_after
      FROM communications c
      JOIN leads l ON l.id = c.lead_id
     WHERE c.direction = 'inbound'
     ORDER BY c.created_at DESC, c.rowid DESC
     LIMIT 1
"""


def main() -> None:
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
