/**
 * Consumo de IA por cliente (quem paga a conta).
 *
 * O bot vendido a R$ 150/mês consome token a cada pergunta. Sem medir, o preço é
 * um chute: um cliente com base grande e perguntas frequentes pode custar mais do
 * que paga. Este módulo registra cada chamada com o dono dela (`client_id` do bot,
 * ou o lead quando é a Clara) e devolve o custo estimado por mês.
 *
 * Honestidade sobre o número: token é medido, preço é tabela. O valor em reais é
 * **estimativa** com o preço por milhão de tokens configurado abaixo; se o
 * provedor mudar, mude a tabela — o histórico de tokens continua válido.
 */
import { getDb } from "../store/schema";

export type AiUsageKind =
  | "bot_resposta" // pergunta respondida pelo bot do cliente
  | "bot_embeddings" // indexação/busca da base do cliente
  | "clara" // atendimento comercial da Vértice
  | "marca" // pesquisa de identidade visual
  | "ficha" // ficha do cliente
  | "intencao" // classificação de mensagem
  | "prospeccao"; // textos de abordagem

export interface AiUsageInput {
  kind: AiUsageKind;
  model: string;
  tokensIn?: number;
  tokensOut?: number;
  /** Cliente do bot (quando o gasto é de um cliente nosso). */
  clientId?: string;
  leadId?: string;
  /** Rótulo livre para o painel (ex.: nome da empresa no momento da chamada). */
  label?: string;
}

/** Preço por milhão de tokens, em dólar. Default: faixa do Gemini Flash. */
export interface PriceTable {
  inPerMillion: number;
  outPerMillion: number;
}

export function priceTable(model: string): PriceTable {
  const envIn = Number(process.env.AI_PRICE_IN_PER_M);
  const envOut = Number(process.env.AI_PRICE_OUT_PER_M);
  if (Number.isFinite(envIn) && Number.isFinite(envOut) && envIn > 0 && envOut > 0) {
    return { inPerMillion: envIn, outPerMillion: envOut };
  }
  const m = String(model || "").toLowerCase();
  if (m.includes("embedding")) return { inPerMillion: 0.15, outPerMillion: 0 };
  if (m.includes("pro")) return { inPerMillion: 1.25, outPerMillion: 10 };
  // flash / flash-latest / lite
  return { inPerMillion: 0.3, outPerMillion: 2.5 };
}

/** Custo em dólar de uma chamada. Arredonda para 6 casas (fração de centavo). */
export function estimateCostUsd(model: string, tokensIn = 0, tokensOut = 0): number {
  const p = priceTable(model);
  const usd = (tokensIn / 1_000_000) * p.inPerMillion + (tokensOut / 1_000_000) * p.outPerMillion;
  return Math.round(usd * 1_000_000) / 1_000_000;
}

let tabela = false;

function ensureTable(): void {
  if (tabela) return;
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS ai_usage (
      id         TEXT PRIMARY KEY,
      kind       TEXT NOT NULL,
      model      TEXT,
      client_id  TEXT,
      lead_id    TEXT,
      label      TEXT,
      tokens_in  INTEGER DEFAULT 0,
      tokens_out INTEGER DEFAULT 0,
      usd        REAL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_ai_usage_client ON ai_usage (client_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_ai_usage_kind ON ai_usage (kind, created_at);
  `);
  tabela = true;
}

/** Tokens aproximados quando o provedor não devolve uso (embeddings costumam não devolver). */
export function approximateTokens(text: string): number {
  return Math.max(1, Math.ceil(String(text || "").length / 4));
}

/**
 * Lê o uso devolvido pelo SDK do Gemini.
 *
 * `usageMetadata.promptTokenCount` / `candidatesTokenCount`; quando ausente,
 * estima por caracteres para não registrar zero (zero esconde gasto).
 */
export function usageFromResponse(res: any, promptTexto = "", respostaTexto = ""): { tokensIn: number; tokensOut: number } {
  const meta = res?.usageMetadata || res?.response?.usageMetadata;
  const entrada = Number(meta?.promptTokenCount ?? meta?.prompt_token_count ?? 0);
  const saida = Number(meta?.candidatesTokenCount ?? meta?.candidates_token_count ?? 0);
  return {
    tokensIn: entrada > 0 ? entrada : approximateTokens(promptTexto),
    tokensOut: saida > 0 ? saida : approximateTokens(respostaTexto),
  };
}

/** Registra uma chamada. Nunca lança: medir não pode derrubar atendimento. */
export function recordAiUsage(input: AiUsageInput): void {
  try {
    ensureTable();
    const tokensIn = Math.max(0, Math.round(input.tokensIn || 0));
    const tokensOut = Math.max(0, Math.round(input.tokensOut || 0));
    const usd = estimateCostUsd(input.model, tokensIn, tokensOut);
    getDb()
      .prepare(
        `INSERT INTO ai_usage (id, kind, model, client_id, lead_id, label, tokens_in, tokens_out, usd, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        `aiu_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
        input.kind,
        String(input.model || ""),
        input.clientId || null,
        input.leadId || null,
        input.label || null,
        tokensIn,
        tokensOut,
        usd,
        new Date().toISOString()
      );
  } catch (erro: any) {
    console.warn(`[ia] não consegui registrar consumo: ${erro?.message || erro}`);
  }
}

export interface UsageBucket {
  key: string;
  label?: string;
  chamadas: number;
  tokensIn: number;
  tokensOut: number;
  usd: number;
}

export interface UsageReport {
  periodo: string;
  total: { chamadas: number; tokensIn: number; tokensOut: number; usd: number };
  porCliente: UsageBucket[];
  porTipo: UsageBucket[];
}

function inicioDoMes(mes?: string): { inicio: string; fim: string; label: string } {
  const base = /^\d{4}-\d{2}$/.test(String(mes || "")) ? new Date(`${mes}-01T00:00:00`) : new Date();
  const ano = base.getFullYear();
  const m = base.getMonth();
  return {
    inicio: new Date(ano, m, 1).toISOString(),
    fim: new Date(ano, m + 1, 1).toISOString(),
    label: `${ano}-${String(m + 1).padStart(2, "0")}`,
  };
}

/** Consumo do mês, por cliente e por tipo de uso. */
export function usageReport(mes?: string, clientId?: string): UsageReport {
  ensureTable();
  const { inicio, fim, label } = inicioDoMes(mes);
  const db = getDb();

  const filtroCliente = clientId ? " AND client_id = ?" : "";
  const params: unknown[] = clientId ? [inicio, fim, clientId] : [inicio, fim];

  const porCliente = db
    .prepare(
      `SELECT COALESCE(client_id, 'sem-dono') AS key,
              MAX(label) AS label,
              COUNT(*) AS chamadas,
              SUM(tokens_in) AS tokensIn,
              SUM(tokens_out) AS tokensOut,
              SUM(usd) AS usd
         FROM ai_usage
        WHERE created_at >= ? AND created_at < ?${filtroCliente}
        GROUP BY key
        ORDER BY usd DESC`
    )
    .all(...params) as UsageBucket[];

  const porTipo = db
    .prepare(
      `SELECT kind AS key, COUNT(*) AS chamadas, SUM(tokens_in) AS tokensIn,
              SUM(tokens_out) AS tokensOut, SUM(usd) AS usd
         FROM ai_usage
        WHERE created_at >= ? AND created_at < ?${filtroCliente}
        GROUP BY kind
        ORDER BY usd DESC`
    )
    .all(...params) as UsageBucket[];

  const total = porCliente.reduce(
    (acc, b) => ({
      chamadas: acc.chamadas + Number(b.chamadas || 0),
      tokensIn: acc.tokensIn + Number(b.tokensIn || 0),
      tokensOut: acc.tokensOut + Number(b.tokensOut || 0),
      usd: acc.usd + Number(b.usd || 0),
    }),
    { chamadas: 0, tokensIn: 0, tokensOut: 0, usd: 0 }
  );

  return { periodo: label, total: { ...total, usd: Math.round(total.usd * 1_000_000) / 1_000_000 }, porCliente, porTipo };
}

/** Custo do mês de um cliente (para o cartão do bot). */
export function clientUsage(clientId: string, mes?: string): UsageBucket {
  const relatorio = usageReport(mes, clientId);
  return relatorio.porCliente[0] || { key: clientId, chamadas: 0, tokensIn: 0, tokensOut: 0, usd: 0 };
}
