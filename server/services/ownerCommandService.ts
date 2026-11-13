/**
 * Canal de comando do dono pelo WhatsApp.
 *
 * O Paulo já conversa com os leads pelo número; faltava poder conversar com a
 * Clara pelo mesmo canal para saber o que está acontecendo — e para parar tudo em
 * emergência sem abrir o notebook.
 *
 * Regra de ouro: comando é **prefixado com "/"**. Isso resolve o conflito de o
 * número dele também ser o lead de simulação (`pv-landing-1`): mensagem normal
 * continua sendo conversa de cliente; `/hoje` é ordem para o sistema.
 *
 * Nada aqui inventa número: tudo sai do banco (conversas, janela de horário,
 * configuração ativa). Se não há dado, a resposta diz que não há.
 */
import { getDb } from "../store/schema";
import { getSetting, setSetting, recordCommunication } from "../store/db";
import type { StoredLead } from "../store/types";
import { sendGatewayText } from "./whatsappGateway";
import { fallbackEnabled, fallbackMinAgeMinutes } from "./agentWatchdog";

const PREFIXO = "/";

/** Números do dono: `owner_alert_phone` (painel) e `OWNER_ALERT_PHONE` (env). */
export function ownerPhones(): string[] {
  const brutos = [getSetting("owner_alert_phone"), process.env.OWNER_ALERT_PHONE]
    .filter(Boolean)
    .map((v) => String(v).replace(/\D/g, ""))
    .filter((v) => v.length >= 10);
  return [...new Set(brutos)];
}

/**
 * Chave de comparação de telefone: DDD + últimos 8 dígitos.
 *
 * Comparar "os últimos 10 dígitos" falha quando um cadastro tem 13 dígitos (com o
 * nono) e o outro 12 — o deslocamento faz dois números diferentes parecerem iguais
 * e o mesmo número parecer diferente. O DDD + 8 finais é estável nos dois formatos.
 */
function chaveTelefone(phone?: string): string {
  let digitos = String(phone || "").replace(/\D/g, "");
  if (digitos.startsWith("55") && digitos.length > 11) digitos = digitos.slice(2);
  if (digitos.length < 10) return "";
  return `${digitos.slice(0, 2)}${digitos.slice(-8)}`;
}

export function isOwnerPhone(phone?: string): boolean {
  const alvo = chaveTelefone(phone);
  if (!alvo) return false;
  return ownerPhones().some((dono) => chaveTelefone(dono) === alvo);
}

const COMANDOS_CONHECIDOS = new Set([
  "hoje",
  "pendentes",
  "paradas",
  "fora",
  "status",
  "lead",
  "pausar",
  "parar",
  "retomar",
  "ligar",
  "ajuda",
  "help",
  "comandos",
]);

/**
 * Extrai o comando de um texto que pode vir sujo.
 *
 * O dono colou a lista de comandos inteira no WhatsApp e nada aconteceu, porque a
 * checagem exigia que a mensagem começasse com "/". Agora procura o primeiro
 * `/comando` conhecido **no começo de qualquer linha**, tolerando markdown, bullets
 * e traços que o app de mensagem adiciona ao colar.
 */
/** "/hoje — conversas de hoje" → "/hoje" (a descrição do menu não é argumento). */
function normalizaLinha(linha: string): string | null {
  const limpa = linha.replace(/^[\s>*•\-–—`.]+/, "").trim();
  if (!limpa.startsWith(PREFIXO)) return null;
  let corpo = limpa.slice(PREFIXO.length).trim();
  corpo = corpo.split(/\s+[—–]\s+|\s+-\s+|:\s+/)[0].trim();
  const [comando, ...resto] = corpo.split(/\s+/);
  if (!/^[a-z]+$/i.test(comando || "")) return null;
  return `${PREFIXO}${[comando.toLowerCase(), ...resto].join(" ")}`.trim();
}

export function extractOwnerCommand(text?: string): string | null {
  for (const linha of String(text || "").split(/\r?\n/)) {
    const normalizada = normalizaLinha(linha);
    if (!normalizada) continue;
    const nome = normalizada.slice(1).split(/\s+/)[0];
    if (COMANDOS_CONHECIDOS.has(nome)) return normalizada;
  }
  return null;
}

export function isOwnerCommand(text?: string): boolean {
  return extractOwnerCommand(text) !== null;
}

/* ------------------------------------------------------------------ */
/* dados                                                               */
/* ------------------------------------------------------------------ */

function inicioDoDiaLocal(): string {
  const agora = new Date();
  const inicio = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 0, 0, 0, 0);
  return inicio.toISOString();
}

interface LinhaConversa {
  leadId: string;
  nome: string;
  telefone?: string;
  quando: string;
  minutos: number;
  texto: string;
}

function minutosDesde(iso: string): number {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.round((Date.now() - t) / 60000));
}

/** Conversas abertas (última mensagem é do lead) paradas há mais de N minutos. */
export function conversasParadas(minutos = 5, limite = 10): LinhaConversa[] {
  const corte = new Date(Date.now() - minutos * 60_000).toISOString();
  const rows = getDb()
    .prepare(
      `SELECT l.id AS leadId, l.name AS nome, l.phone AS telefone, c.created_at AS quando, c.message AS texto
         FROM leads l
         JOIN communications c ON c.lead_id = l.id
        WHERE c.status != 'failed'
          AND c.direction = 'inbound'
          AND c.created_at <= ?
          AND COALESCE(l.do_not_contact, 0) = 0
          AND c.id = (
                SELECT c2.id FROM communications c2
                 WHERE c2.lead_id = l.id AND c2.status != 'failed'
                 ORDER BY c2.created_at DESC, c2.rowid DESC LIMIT 1
              )
          AND NOT EXISTS (
                SELECT 1 FROM communications o
                 WHERE o.lead_id = l.id AND o.direction = 'outbound' AND o.status != 'failed'
                   AND o.created_at > c.created_at
              )
        ORDER BY c.created_at ASC
        LIMIT ?`
    )
    .all(corte, limite) as Array<{ leadId: string; nome: string; telefone?: string; quando: string; texto: string }>;

  return rows.map((r) => ({ ...r, minutos: minutosDesde(r.quando) }));
}

/** Recebidas hoje (desde 00:00 local) com e sem resposta. */
export function conversasDeHoje(): { recebidas: number; respondidas: number; pendentes: LinhaConversa[] } {
  const inicio = inicioDoDiaLocal();
  const db = getDb();

  const recebidas = db
    .prepare("SELECT COUNT(*) c FROM communications WHERE direction = 'inbound' AND status != 'failed' AND created_at >= ?")
    .get(inicio) as { c: number };

  const respondidas = db
    .prepare(
      `SELECT COUNT(*) c FROM communications i
        WHERE i.direction = 'inbound' AND i.status != 'failed' AND i.created_at >= ?
          AND EXISTS (SELECT 1 FROM communications o
                       WHERE o.lead_id = i.lead_id AND o.direction = 'outbound'
                         AND o.status != 'failed' AND o.created_at > i.created_at)`
    )
    .get(inicio) as { c: number };

  return {
    recebidas: Number(recebidas?.c || 0),
    respondidas: Number(respondidas?.c || 0),
    pendentes: conversasParadas(5, 10),
  };
}

/**
 * Mensagens recebidas fora da janela de resposta (antes das 7h ou depois das 20h)
 * que ainda estão sem resposta — é o estoque que a Clara não pode tocar agora.
 */
export function foraDaJanela(horasParaTras = 36): LinhaConversa[] {
  const desde = new Date(Date.now() - horasParaTras * 3600_000).toISOString();
  const rows = getDb()
    .prepare(
      `SELECT l.id AS leadId, l.name AS nome, l.phone AS telefone, c.created_at AS quando, c.message AS texto
         FROM leads l
         JOIN communications c ON c.lead_id = l.id
        WHERE c.direction = 'inbound' AND c.status != 'failed' AND c.created_at >= ?
          AND COALESCE(l.do_not_contact, 0) = 0
          AND NOT EXISTS (SELECT 1 FROM communications o
                           WHERE o.lead_id = l.id AND o.direction = 'outbound'
                             AND o.status != 'failed' AND o.created_at > c.created_at)
        ORDER BY c.created_at DESC
        LIMIT 15`
    )
    .all(desde) as Array<{ leadId: string; nome: string; telefone?: string; quando: string; texto: string }>;

  const horaLocal = (iso: string) => {
    const d = new Date(iso);
    return { hora: d.getHours(), dia: d.toDateString() };
  };
  const hoje = new Date().toDateString();

  return rows
    .filter((r) => {
      const { hora, dia } = horaLocal(r.quando);
      return hora < 7 || hora >= 20 || dia !== hoje;
    })
    .map((r) => ({ ...r, minutos: minutosDesde(r.quando) }));
}

/* ------------------------------------------------------------------ */
/* respostas                                                           */
/* ------------------------------------------------------------------ */

const AJUDA = [
  "*Comandos da Clara*",
  "",
  "/hoje — conversas de hoje",
  "/pendentes — quem está esperando resposta",
  "/fora — mensagens que chegaram fora do horário",
  "/lead nome — ficha rápida de um lead",
  "/status — como está a automação",
  "/pausar e /retomar — liga/desliga as respostas automáticas",
].join("\n");

function linhaConversa(c: LinhaConversa): string {
  const texto = c.texto.replace(/^\[RECEBIDA\]\s*/, "").replace(/\n+/g, " ").slice(0, 70);
  return `• *${c.nome}* · ${c.minutos} min\n${texto}`;
}

function respostaHoje(): string {
  const { recebidas, respondidas, pendentes } = conversasDeHoje();
  if (!recebidas) return "Hoje não chegou nenhuma mensagem de lead até agora.";
  const linhas = [`*Hoje:* ${recebidas} recebida(s) · ${respondidas} respondida(s)`];
  if (pendentes.length) {
    linhas.push("", `*Esperando resposta (${pendentes.length}):*`);
    linhas.push(...pendentes.slice(0, 5).map(linhaConversa));
  } else {
    linhas.push("", "Nenhuma conversa parada. Tudo respondido.");
  }
  return linhas.join("\n");
}

function respostaPendentes(): string {
  const paradas = conversasParadas(5, 10);
  if (!paradas.length) return "Nenhuma conversa parada agora.";
  return ["*Esperando resposta:*", "", ...paradas.map(linhaConversa)].join("\n");
}

function respostaFora(): string {
  const fora = foraDaJanela(36);
  if (!fora.length) return "Nada fora do horário esperando resposta.";
  return [
    "*Fora da janela (7h–20h), esperando:*",
    "",
    ...fora.slice(0, 8).map((c) => `${linhaConversa(c)}\n_chegou ${new Date(c.quando).toLocaleString("pt-BR")}_`),
    "",
    "Eu respondo todas a partir das 7h.",
  ].join("\n");
}

function respostaStatus(): string {
  const agente = getSetting("automation_agent_enabled") !== "false";
  const claraPrimeiro = getSetting("automation_prefer_clara") !== "false";
  const rede = fallbackEnabled();
  return [
    "*Status da automação*",
    "",
    `Agente: ${agente ? "ligado" : "pausado"}`,
    `Clara responde primeiro: ${claraPrimeiro ? "sim" : "não"}`,
    `Rede de segurança: ${rede ? `sim, após ${fallbackMinAgeMinutes()} min` : "desligada"}`,
    `Janela de resposta: 7h às 20h`,
  ].join("\n");
}

function respostaLead(termo: string): string {
  const busca = String(termo || "").trim();
  if (!busca) return "Manda assim: /lead nome da empresa";
  const db = getDb();
  const like = `%${busca.toLowerCase()}%`;
  const lead = db
    .prepare(
      `SELECT id, name, phone, city, pipeline_status FROM leads
        WHERE LOWER(name) LIKE ? OR REPLACE(REPLACE(phone,'+',''),' ','') LIKE ?
        ORDER BY updated_at DESC LIMIT 1`
    )
    .get(like, `%${busca.replace(/\D/g, "")}%`) as any;

  if (!lead) return `Não achei lead com "${busca}".`;

  const ultimas = db
    .prepare(
      `SELECT direction, created_at, message FROM communications
        WHERE lead_id = ? ORDER BY created_at DESC LIMIT 3`
    )
    .all(lead.id) as Array<{ direction: string; created_at: string; message: string }>;

  const linhas = [`*${lead.name}*`, `${lead.city || ""} · etapa: ${lead.pipeline_status}`, lead.phone || ""];
  if (ultimas.length) {
    linhas.push("");
    for (const m of ultimas.reverse()) {
      const quem = m.direction === "inbound" ? "ele" : "nós";
      linhas.push(`${quem} (${new Date(m.created_at).toLocaleString("pt-BR")}): ${String(m.message).replace(/^\[RECEBIDA\]\s*/, "").replace(/\n/g, " ").slice(0, 80)}`);
    }
  }
  return linhas.filter(Boolean).join("\n");
}

export interface OwnerCommandResult {
  handled: boolean;
  comando?: string;
  reply?: string;
}

/**
 * Executa o comando e **responde pelo gateway**, registrando a comunicação.
 *
 * Registrar o envio é o que impede a rotina da Clara de tratar a mesma mensagem
 * como conversa de lead e responder duas vezes.
 */
export async function handleOwnerCommand(
  lead: StoredLead,
  texto: string,
  opcoes: { enviar?: boolean } = {}
): Promise<OwnerCommandResult> {
  // Comando conhecido em qualquer linha (menu colado) ou, se a mensagem já começa
  // com "/", qualquer palavra — comando inválido responde com a ajuda.
  const comandoExtraido =
    extractOwnerCommand(texto) ?? (/^\s*\//.test(String(texto || "")) ? normalizaLinha(String(texto).trim()) : null);
  if (!comandoExtraido) return { handled: false };

  const semPrefixo = comandoExtraido.slice(PREFIXO.length).trim();
  const [comandoBruto, ...resto] = semPrefixo.split(/\s+/);
  const comando = (comandoBruto || "ajuda").toLowerCase();
  const argumento = resto.join(" ");

  let reply: string;
  switch (comando) {
    case "ajuda":
    case "help":
    case "comandos":
      reply = AJUDA;
      break;
    case "hoje":
      reply = respostaHoje();
      break;
    case "pendentes":
    case "paradas":
      reply = respostaPendentes();
      break;
    case "fora":
      reply = respostaFora();
      break;
    case "status":
      reply = respostaStatus();
      break;
    case "lead":
      reply = respostaLead(argumento);
      break;
    case "pausar":
    case "parar":
      // `automation_agent_enabled` cala o agente interno; `automation_clara_paused`
      // é lido pelo monitor do inbox e é o que cala a Clara (rotina externa).
      setSetting("automation_agent_enabled", "false");
      setSetting("automation_clara_paused", "true");
      reply = "Respostas automáticas *pausadas* (Clara e rede de segurança).\n\nNinguém recebe resposta automática até você mandar /retomar.";
      break;
    case "retomar":
    case "ligar":
      setSetting("automation_agent_enabled", "true");
      setSetting("automation_clara_paused", "false");
      reply = "Respostas automáticas *ligadas* de novo.";
      break;
    default:
      reply = `Não conheço "/${comando}".\n\n${AJUDA}`;
  }

  if (opcoes.enviar === false) return { handled: true, comando, reply };

  try {
    const envio = await sendGatewayText(String(lead.phone || ""), reply);
    recordCommunication({
      leadId: lead.id,
      channel: "whatsapp",
      status: "sent",
      direction: "outbound",
      toAddress: String(lead.phone || ""),
      message: reply,
      externalId: envio.externalId,
      hook: "comando_dono",
    });
  } catch (erro: any) {
    recordCommunication({
      leadId: lead.id,
      channel: "whatsapp",
      status: "failed",
      direction: "outbound",
      toAddress: String(lead.phone || ""),
      message: reply,
      errorDetail: erro?.message || String(erro),
      hook: "comando_dono",
    });
    return { handled: true, comando, reply: `(falhou enviar: ${erro?.message || erro})` };
  }

  return { handled: true, comando, reply };
}
