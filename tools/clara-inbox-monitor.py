#!/usr/bin/env python3
"""Monitor do inbox do LeadRadar para o Hermes (job com `monitor`).

Imprime UMA linha determinística com a última mensagem RECEBIDA **e o contexto da
conversa** (histórico + fatos). Sem mensagem nova → linha idêntica → o Hermes pula
o agente. Mensagem nova → linha muda → o Hermes acorda o agente com o diff.

Por que o contexto vem junto: o agente era acordado só com a última mensagem e
reconstruía o resto no escuro. Resultado real: mandou o link, ouviu "achei legal
demais" e mandou o link de novo, porque elogio foi lido como pedido.

Só olha direction='inbound', então a NOSSA resposta (outbound) não gera um novo
despertar — nada de loop de resposta infinita.
"""
import json
import os
import re
import sqlite3

HISTORICO = 8  # turnos que vão no payload


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



# ---------------------------------------------------------------- nicho catalogado
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INDICES = [
    os.path.join(REPO, "server", "data", "pools", "_indice-nichos.json"),
    r"C:\Users\paulo\OneDrive\Documentos\lead-radar\server\data\pools\_indice-nichos.json",
]

# categoria do Google Places (texto livre) -> chave do pool catalogado
ALIASES = {
    "barbearia": "barbearia",
    "otica": "otica",
    "oculos": "otica",
    "psicolog": "psicologia",
    "pilates": "pilates",
    "fisioterap": "fisioterapia",
    "oficina": "oficina",
    "mecanic": "oficina",
    "automotiv": "oficina",
    "estetic": "estetica",
    "veterin": "veterinaria",
    "pet": "veterinaria",
    "advoca": "advocacia",
    "juridic": "advocacia",
    "odonto": "odontologia",
    "dentist": "odontologia",
}


def _sem_acento_texto(texto: str) -> str:
    import unicodedata

    return "".join(c for c in unicodedata.normalize("NFD", texto.lower()) if unicodedata.category(c) != "Mn")


def nicho_do_lead(category: str):
    """Devolve as seções que a pesquisa de nicho mostrou como essenciais.

    É o que o agente precisa para falar de conteúdo com propriedade em vez de
    perguntar "qual serviço aparece primeiro?" antes mesmo de vender.
    """
    cat = _sem_acento_texto(str(category or ""))
    if not cat:
        return None
    chave = next((v for k, v in ALIASES.items() if k in cat), None)
    if not chave:
        return None
    for caminho in INDICES:
        try:
            with open(caminho, "r", encoding="utf-8") as fh:
                indice = json.load(fh)
        except OSError:
            continue
        dados = (indice.get("nichos") or {}).get(chave)
        if not dados:
            return None
        return {
            "chave": chave,
            "secoes_essenciais": dados.get("estrutura_base") or [],
            "secoes_diferenciador": (dados.get("estrutura_diferenciador") or [])[:6],
        }
    return None


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
           c.lead_id, l.name, l.phone, l.pipeline_status, l.category,
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

CONVERSA = """
    SELECT direction, message, hook, created_at
      FROM communications
     WHERE lead_id = ?
     ORDER BY created_at DESC, rowid DESC
     LIMIT ?
"""

# Mesma regra do conversationContextService.ts: sem acento (\b não fecha depois de
# "á" em regex) e com guarda de negação ("não gostei" é crítica, não elogio).
NEGACAO = re.compile(r"\b(nao|nunca|nem)\b")
ELOGIO = re.compile(
    r"\b(achei|ficou|ta|esta)\b[^.]{0,20}\b(legal|bonit\w*|bom|boa|top|show|otim\w*|perfeito|lind\w*|bacana|massa)\b"
    r"|\b(gostei|amei|adorei|curti)\b",
    re.IGNORECASE,
)


def _sem_acento(texto: str) -> str:
    import unicodedata

    return "".join(c for c in unicodedata.normalize("NFD", texto.lower()) if unicodedata.category(c) != "Mn")


def eh_elogio(texto: str) -> bool:
    t = _sem_acento(str(texto or ""))
    if NEGACAO.search(t):
        return False
    return bool(ELOGIO.search(t))
URL = re.compile(r"https?://[^\s)]+", re.IGNORECASE)


def contexto(lead_id: str) -> dict:
    """Histórico + fatos que o agente precisa para conduzir a conversa."""
    try:
        con = sqlite3.connect(f"file:{DB}?mode=ro", uri=True, timeout=5)
        con.row_factory = sqlite3.Row
        linhas = list(con.execute(CONVERSA, (lead_id, HISTORICO * 3)).fetchall())
        con.close()
    except Exception:  # noqa: BLE001
        return {}

    linhas.reverse()  # a query vem DESC
    entregas = [l for l in linhas if l["direction"] == "outbound" and (l["hook"] or "") == "pagina_unica"]
    ultima = entregas[-1] if entregas else None
    url = None
    if ultima:
        achado = URL.search(str(ultima["message"] or ""))
        url = achado.group(0) if achado else None

    # elogio vale depois da PRIMEIRA entrega: se ele elogiou e o link foi reenviado
    # por engano, a última entrega é posterior ao elogio e ele sumiria do contexto.
    primeira = entregas[0] if entregas else None
    depois = [l for l in linhas if primeira and str(l["created_at"]) > str(primeira["created_at"])]
    elogiou = any(l["direction"] == "inbound" and eh_elogio(str(l["message"] or "")) for l in depois)

    turnos = []
    for l in linhas[-HISTORICO:]:
        texto = " ".join(str(l["message"] or "").replace("[RECEBIDA]", "").split())
        turnos.append(
            {
                "quem": "lead" if l["direction"] == "inbound" else "clara",
                "texto": texto[:280],
                "em": str(l["created_at"]),
            }
        )

    # Aviso automático não é fala: contá-lo como resposta nossa trava a conversa.
    # Aviso de espera e REENVIO de link são artefato automático, não fala. A primeira
    # entrega conta (ela pergunta "o que você achou?"); a segunda em diante não.
    primeira_entrega = entregas[0]["created_at"] if entregas else None
    def _eh_fala(l):
        hook = l["hook"] or ""
        if hook == "pagina_aviso":
            return False
        if hook == "pagina_unica" and str(l["created_at"]) != str(primeira_entrega):
            return False
        return True

    falas = [l for l in linhas if _eh_fala(l)]
    ultima_fala = falas[-1] if falas else (linhas[-1] if linhas else None)
    ultima_bruta = linhas[-1] if linhas else None
    aguardando = bool(ultima_fala and ultima_fala["direction"] == "inbound")
    travada = bool(aguardando and ultima_bruta is not ultima_fala)

    return {
        "aguardando_resposta": aguardando,
        "travada_por_aviso": travada,
        "pagina_entregue": bool(entregas),
        "pagina_url": url,
        "entregue_em": str(ultima["created_at"]) if ultima else None,
        "vezes_entregue": len(entregas),
        "elogiou_depois_de_ver": elogiou,
        "historico": turnos,
    }


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
    ctx = contexto(row["lead_id"])
    nicho = nicho_do_lead(row["category"])
    if nicho:
        ctx["nicho"] = nicho
    if "aguardando_resposta" in ctx:
        # "já respondido" é sobre FALA, não sobre aviso automático
        payload["already_answered"] = not ctx["aguardando_resposta"]
    payload.update(ctx)
    print("inbox_last_inbound " + json.dumps(payload, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
