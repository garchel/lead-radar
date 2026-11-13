/**
 * Base de conhecimento + RAG do chatbot de cliente.
 *
 * O problema que isto resolve: um bot que "sabe" por conta própria inventa preço,
 * horário e endereço, e isso queima o cliente. Aqui ele só responde com base nos
 * trechos que o cliente forneceu; se a base não cobre a pergunta, ele não chuta:
 * avisa o dono do negócio no WhatsApp e avisa o cliente que vai confirmar.
 *
 * Como funciona:
 *   1. O que o cliente manda (texto, FAQ, markdown) vira documento.
 *   2. O documento é fatiado em trechos de ~600 caracteres com sobreposição.
 *   3. Cada trecho ganha um vetor (Gemini `gemini-embedding-001`, 768 dims).
 *   4. Na pergunta: vetoriza, compara por similaridade de cosseno, pega os top-k.
 *   5. Se o melhor trecho não passa do limite, ou a IA responde `NAO_SEI`,
 *      escala para o dono em vez de inventar.
 */
import { GoogleGenAI } from "@google/genai";
import { getDb } from "../store/schema";
import { gatewayRequest, sendGatewayText } from "./whatsappGateway";
import { getSetting, setSetting } from "../store/db";
import { approximateTokens, recordAiUsage, usageFromResponse } from "./aiUsageService";

export const EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-001";
export const EMBEDDING_DIMENSIONS = 768;
/**
 * Pré-filtro barato: abaixo disto nem vale chamar o modelo, é claramente fora da
 * base. Medido com perguntas reais, o cosseno NÃO separa bem (uma pergunta de
 * sobrancelha deu 0,67 e "que horas abre no sábado" deu 0,62), então quem decide
 * de verdade se pode responder é o modelo lendo os trechos e dizendo NAO_SEI.
 */
export const DEFAULT_MIN_SCORE = Number(process.env.BOT_MIN_SCORE || 0.5);
export const NAO_SEI = "NAO_SEI";

export interface BotClient {
  id: string;
  name: string;
  ownerPhone?: string;
  instance?: string;
  setupPrice: number;
  monthlyPrice: number;
  status: "active" | "paused";
  minScore: number;
  /** Anotações comerciais (o que combinou, o que falta). */
  notes?: string;
  /** Assinatura vinculada (receita recorrente). */
  subscriptionId?: string;
  /**
   * Handoff: quando o dono responde manualmente, o bot fica calado até este
   * horário. Sem isso, bot e humano respondem juntos e o cliente fica confuso.
   */
  botPausedUntil?: string;
  botPausedReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeChunk {
  id: string;
  clientId: string;
  docId: string;
  ordinal: number;
  content: string;
  embedding: number[];
}

export interface RagAnswer {
  /** Resposta pronta para o cliente (vazia quando não houve base). */
  answer: string;
  /**
   * O que mandar ao cliente no WhatsApp: a resposta, ou o aviso de que vai
   * confirmar com o responsável. Nunca fica sem resposta.
   */
  customerMessage: string;
  /** true = não sabia e chamou o dono. */
  escalated: boolean;
  /** Motivo da escalada, para auditoria. */
  reason: "sem_base" | "ia_sem_resposta" | "sem_chave" | "erro_ia" | null;
  /** Melhor similaridade encontrada (0 a 1). */
  topScore: number;
  sources: { docId: string; ordinal: number; score: number; content: string }[];
}

/** Texto enviado quando o bot precisa confirmar antes de responder. */
export const HOLDING_MESSAGE =
  "Boa pergunta! Vou confirmar com o responsável e já te respondo aqui. 🙂";

/* ------------------------------------------------------------------ */
/*  Tabelas (criadas sob demanda, sem migração de versão)              */
/* ------------------------------------------------------------------ */

let tablesReady = false;

export function ensureBotTables(): void {
  if (tablesReady) return;
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS bot_clients (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      owner_phone TEXT,
      instance TEXT,
      setup_price INTEGER NOT NULL DEFAULT 0,
      monthly_price INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      min_score REAL NOT NULL DEFAULT ${DEFAULT_MIN_SCORE},
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS bot_docs (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      title TEXT,
      source TEXT,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      indexed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS bot_chunks (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      doc_id TEXT NOT NULL,
      ordinal INTEGER NOT NULL,
      content TEXT NOT NULL,
      embedding TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_bot_chunks_client ON bot_chunks(client_id);
    CREATE TABLE IF NOT EXISTS bot_messages (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      phone TEXT NOT NULL,
      direction TEXT NOT NULL,
      kind TEXT NOT NULL,
      text TEXT NOT NULL,
      external_id TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_bot_messages_client ON bot_messages(client_id, created_at);
  `);

  // Migração aditiva: bancos criados antes do handoff/assinatura não têm estas
  // colunas, e `CREATE TABLE IF NOT EXISTS` não altera tabela existente.
  const cols = new Set((db.prepare("PRAGMA table_info(bot_clients)").all() as any[]).map((c) => c.name));
  const addCols: Record<string, string> = {
    notes: "TEXT",
    subscription_id: "TEXT",
    bot_paused_until: "TEXT",
    bot_paused_reason: "TEXT",
  };
  for (const [nome, tipo] of Object.entries(addCols)) {
    if (!cols.has(nome)) db.exec(`ALTER TABLE bot_clients ADD COLUMN ${nome} ${tipo}`);
  }
  const msgCols = new Set((db.prepare("PRAGMA table_info(bot_messages)").all() as any[]).map((c) => c.name));
  if (!msgCols.has("external_id")) db.exec("ALTER TABLE bot_messages ADD COLUMN external_id TEXT");

  tablesReady = true;
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/* ------------------------------------------------------------------ */
/*  Clientes                                                           */
/* ------------------------------------------------------------------ */

export function createBotClient(input: {
  name: string;
  ownerPhone?: string;
  instance?: string;
  setupPrice?: number;
  monthlyPrice?: number;
  minScore?: number;
}): BotClient {
  ensureBotTables();
  const now = new Date().toISOString();
  const client: BotClient = {
    id: newId("bot"),
    name: String(input.name || "").trim() || "Cliente",
    ownerPhone: input.ownerPhone ? String(input.ownerPhone).replace(/\D/g, "") : undefined,
    instance: input.instance?.trim() || undefined,
    setupPrice: Math.round(Number(input.setupPrice ?? 649)) || 0,
    monthlyPrice: Math.round(Number(input.monthlyPrice ?? 150)) || 0,
    status: "active",
    minScore: Number(input.minScore ?? DEFAULT_MIN_SCORE),
    notes: undefined,
    createdAt: now,
    updatedAt: now,
  };
  getDb()
    .prepare(
      `INSERT INTO bot_clients (id, name, owner_phone, instance, setup_price, monthly_price, status, min_score, notes, created_at, updated_at)
       VALUES (@id, @name, @ownerPhone, @instance, @setupPrice, @monthlyPrice, @status, @minScore, @notes, @createdAt, @updatedAt)`
    )
    .run({ ...client, notes: null });
  return client;
}

function rowToClient(row: any): BotClient {
  return {
    id: row.id,
    name: row.name,
    ownerPhone: row.owner_phone || undefined,
    instance: row.instance || undefined,
    setupPrice: row.setup_price ?? 0,
    monthlyPrice: row.monthly_price ?? 0,
    status: row.status === "paused" ? "paused" : "active",
    minScore: row.min_score ?? DEFAULT_MIN_SCORE,
    notes: row.notes || undefined,
    subscriptionId: row.subscription_id || undefined,
    botPausedUntil: row.bot_paused_until || undefined,
    botPausedReason: row.bot_paused_reason || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getBotClient(id: string): BotClient | undefined {
  ensureBotTables();
  const row = getDb().prepare("SELECT * FROM bot_clients WHERE id = ?").get(id) as any;
  return row ? rowToClient(row) : undefined;
}

export function listBotClients(): BotClient[] {
  ensureBotTables();
  return (getDb().prepare("SELECT * FROM bot_clients ORDER BY created_at DESC").all() as any[]).map(rowToClient);
}

export function updateBotClient(id: string, patch: Partial<BotClient>): BotClient | undefined {
  ensureBotTables();
  const current = getBotClient(id);
  if (!current) return undefined;
  const next: BotClient = { ...current, ...patch, id: current.id, updatedAt: new Date().toISOString() };
  getDb()
    .prepare(
      `UPDATE bot_clients SET name = @name, owner_phone = @ownerPhone, instance = @instance,
        setup_price = @setupPrice, monthly_price = @monthlyPrice, status = @status,
        min_score = @minScore, notes = @notes, subscription_id = @subscriptionId,
        bot_paused_until = @botPausedUntil, bot_paused_reason = @botPausedReason,
        updated_at = @updatedAt WHERE id = @id`
    )
    .run({
      ...next,
      notes: next.notes ?? null,
      subscriptionId: next.subscriptionId ?? null,
      botPausedUntil: next.botPausedUntil ?? null,
      botPausedReason: next.botPausedReason ?? null,
    });
  return getBotClient(id);
}

/* ------------------------------------------------------------------ */
/*  Fatiamento e similaridade (puro, testável)                         */
/* ------------------------------------------------------------------ */

/**
 * Corta o texto em trechos de até `maxChars`, preferindo quebra por parágrafo e
 * depois por frase, com sobreposição para não perder o contexto na emenda.
 */
export function chunkText(text: string, maxChars = 600, overlap = 100): string[] {
  const limpo = String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();
  if (!limpo) return [];
  if (limpo.length <= maxChars) return [limpo];

  const blocos = limpo
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let atual = "";

  const empurrar = () => {
    const t = atual.trim();
    if (t) chunks.push(t);
    atual = "";
  };

  for (const bloco of blocos) {
    // bloco maior que o limite: quebra por frase
    const partes =
      bloco.length <= maxChars
        ? [bloco]
        : bloco
            .split(/(?<=[.!?])\s+/)
            .reduce<string[]>((acc, frase) => {
              const ultimo = acc[acc.length - 1];
              if (ultimo && (ultimo + " " + frase).length <= maxChars) acc[acc.length - 1] = `${ultimo} ${frase}`;
              else acc.push(frase);
              return acc;
            }, []);

    for (const parte of partes) {
      if ((atual + "\n\n" + parte).trim().length <= maxChars) {
        atual = atual ? `${atual}\n\n${parte}` : parte;
      } else {
        const anterior = atual;
        empurrar();
        // sobreposição: recomeça com o fim do trecho anterior
        const rabo = anterior.slice(Math.max(0, anterior.length - overlap)).trim();
        atual = rabo && !parte.startsWith(rabo) ? `${rabo}\n${parte}`.slice(0, maxChars) : parte;
      }
    }
  }
  empurrar();
  return chunks;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (!n) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Decide se a resposta pode ir ou se precisa chamar o dono. */
export function decideAnswer(input: {
  answer: string;
  topScore: number;
  minScore: number;
}): { escalated: boolean; reason: RagAnswer["reason"] } {
  const texto = String(input.answer || "").trim();
  const vazio = !texto || texto.toUpperCase().startsWith("NAO_SEI");
  if (input.topScore < input.minScore) return { escalated: true, reason: "sem_base" };
  if (vazio) return { escalated: true, reason: "ia_sem_resposta" };
  return { escalated: false, reason: null };
}

/* ------------------------------------------------------------------ */
/*  Embeddings                                                         */
/* ------------------------------------------------------------------ */

function getAi(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
}

async function embedAll(texts: string[], clientId?: string): Promise<number[][]> {
  const ai = getAi();
  if (!ai) throw new Error("GEMINI_API_KEY ausente: não é possível indexar a base.");
  const out: number[][] = [];
  const lote = 16; // chamadas menores são mais previsíveis que uma gigante
  for (let i = 0; i < texts.length; i += lote) {
    const pedaco = texts.slice(i, i + lote);
    const res: any = await ai.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: pedaco,
      config: { outputDimensionality: EMBEDDING_DIMENSIONS },
    });
    const vetores: any[] = res?.embeddings || [];
    if (vetores.length !== pedaco.length) {
      throw new Error(`Embedding devolveu ${vetores.length} vetores para ${pedaco.length} trechos.`);
    }
    for (const item of vetores) out.push(item.values as number[]);
    // indexar custa token: o gasto é do cliente, não da Vértice
    recordAiUsage({
      kind: "bot_embeddings",
      model: EMBEDDING_MODEL,
      clientId,
      tokensIn: pedaco.reduce((soma, t) => soma + approximateTokens(t), 0),
      tokensOut: 0,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  Ingestão e busca                                                   */
/* ------------------------------------------------------------------ */

export async function addKnowledge(
  clientId: string,
  input: { title?: string; source?: string; content: string }
): Promise<{ docId: string; chunks: number }> {
  ensureBotTables();
  const client = getBotClient(clientId);
  if (!client) throw new Error(`Cliente de bot não encontrado: ${clientId}`);

  const conteudo = String(input.content || "").trim();
  if (!conteudo) throw new Error("Conteúdo vazio: nada para indexar.");

  const pedacos = chunkText(conteudo);
  const vetores = await embedAll(pedacos, clientId);
  const db = getDb();
  const now = new Date().toISOString();
  const docId = newId("doc");

  const inserirDoc = db.prepare(
    `INSERT INTO bot_docs (id, client_id, title, source, content, created_at, indexed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const inserirChunk = db.prepare(
    `INSERT INTO bot_chunks (id, client_id, doc_id, ordinal, content, embedding, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );

  db.transaction(() => {
    inserirDoc.run(docId, clientId, input.title || null, input.source || "manual", conteudo, now, now);
    pedacos.forEach((texto, indice) => {
      inserirChunk.run(newId("chk"), clientId, docId, indice, texto, JSON.stringify(vetores[indice]), now);
    });
  })();

  return { docId, chunks: pedacos.length };
}

export async function searchKnowledge(
  clientId: string,
  question: string,
  opts: { k?: number; minScore?: number } = {}
): Promise<{ topScore: number; hits: RagAnswer["sources"] }> {
  ensureBotTables();
  const pergunta = String(question || "").trim();
  if (!pergunta) return { topScore: 0, hits: [] };

  const rows = getDb()
    .prepare("SELECT doc_id, ordinal, content, embedding FROM bot_chunks WHERE client_id = ?")
    .all(clientId) as any[];
  if (!rows.length) return { topScore: 0, hits: [] };

  const [vetorPergunta] = await embedAll([pergunta], clientId);
  const k = Math.max(1, opts.k ?? 5);

  const scored = rows
    .map((row) => ({
      docId: row.doc_id,
      ordinal: row.ordinal,
      content: row.content,
      score: cosineSimilarity(vetorPergunta, JSON.parse(row.embedding) as number[]),
    }))
    .sort((a, b) => b.score - a.score);

  return { topScore: scored[0]?.score ?? 0, hits: scored.slice(0, k) };
}

/* ------------------------------------------------------------------ */
/*  Resposta com base (ou escalada)                                    */
/* ------------------------------------------------------------------ */

function buildGroundedPrompt(client: BotClient, question: string, contextos: string[]): string {
  return [
    `Você atende o WhatsApp de ${client.name}.`,
    "Responda à pergunta usando SOMENTE os trechos abaixo.",
    `Se os trechos não responderem com segurança, responda exatamente ${NAO_SEI} e nada mais.`,
    "Nunca invente preço, horário, endereço, prazo ou serviço que não esteja nos trechos.",
    "Nunca diga que é IA ou bot.",
    "Estilo: português do Brasil, 1 a 4 linhas curtas, sem travessão, direto ao ponto.",
    "",
    "## TRECHOS DA BASE",
    ...contextos.map((c, i) => `[${i + 1}] ${c}`),
    "",
    `## PERGUNTA DO CLIENTE\n${question}`,
  ].join("\n");
}

export async function answerWithRag(
  clientId: string,
  question: string,
  opts: { k?: number } = {}
): Promise<RagAnswer> {
  const client = getBotClient(clientId);
  if (!client) throw new Error(`Cliente de bot não encontrado: ${clientId}`);

  let busca: { topScore: number; hits: RagAnswer["sources"] };
  try {
    busca = await searchKnowledge(clientId, question, { k: opts.k ?? 4 });
  } catch (error: any) {
    // Sem chave / rede fora: não dá para buscar. Responde escalando, nunca chutando.
    console.warn(`[bot] busca na base falhou para ${clientId}: ${error?.message || error}`);
    return {
      answer: "",
      customerMessage: HOLDING_MESSAGE,
      escalated: true,
      reason: process.env.GEMINI_API_KEY ? "erro_ia" : "sem_chave",
      topScore: 0,
      sources: [],
    };
  }
  const { topScore, hits } = busca;
  const base: RagAnswer = {
    answer: "",
    customerMessage: HOLDING_MESSAGE,
    escalated: false,
    reason: null,
    topScore,
    sources: hits,
  };

  // Pré-filtro: nada parecido na base, nem gasta chamada de modelo.
  if (!hits.length) return { ...base, escalated: true, reason: "sem_base" };
  if (topScore < client.minScore) return { ...base, escalated: true, reason: "sem_base" };

  const ai = getAi();
  if (!ai) return { ...base, escalated: true, reason: "sem_chave" };

  try {
    // Um modelo só é ponto único de falha: um 503 do provedor virava escalada e o
    // cliente final recebia "vou confirmar" com a resposta na base. Tenta em fila.
    const modelos = [
      process.env.GEMINI_MODEL || "gemini-flash-latest",
      ...(process.env.GEMINI_BOT_FALLBACK_MODEL || "gemini-3-flash-preview,gemini-3.1-flash-lite").split(","),
    ]
      .map((m) => m.trim())
      .filter(Boolean);

    const prompt = buildGroundedPrompt(client, question, hits.map((h) => h.content));
    let res: any = null;
    let ultimoErro = "";
    for (const modelo of modelos) {
      try {
        res = await ai.models.generateContent({
          model: modelo,
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          config: { temperature: 0, abortSignal: AbortSignal.timeout(20000) },
        });
        if (String(res?.text || "").trim()) break;
        ultimoErro = `modelo ${modelo} devolveu vazio`;
      } catch (erro: any) {
        ultimoErro = String(erro?.message || erro);
        // 404/400 de modelo morto ou 503 de demanda: tenta o próximo
        if (/503|429|UNAVAILABLE|RESOURCE_EXHAUSTED|not found|no longer available|404/i.test(ultimoErro)) continue;
        throw erro;
      }
    }
    if (!res) throw new Error(ultimoErro || "nenhum modelo disponível");
    const answer = (res.text || "").trim();
    const uso = usageFromResponse(res, question, answer);
    recordAiUsage({
      kind: "bot_resposta",
      model: String((res as any)?.modelVersion || process.env.GEMINI_MODEL || "gemini-flash-latest"),
      clientId,
      label: client.name,
      tokensIn: uso.tokensIn,
      tokensOut: uso.tokensOut,
    });
    const decisao = decideAnswer({ answer, topScore, minScore: client.minScore });
    // O cliente nunca fica sem resposta: ou é a resposta com base, ou o aviso de
    // que o responsável vai confirmar (e o dono recebe a pergunta).
    return {
      ...base,
      answer: decisao.escalated ? "" : answer,
      customerMessage: decisao.escalated ? HOLDING_MESSAGE : answer,
      ...decisao,
    };
  } catch (error: any) {
    const detalhe = String(error?.message || error);
    console.warn(`[bot] resposta com base falhou para ${clientId}: ${detalhe.slice(0, 200)}`);
    // Cota estourada ou IA fora: fica registrado para o painel não fingir que está
    // tudo bem (o bot cai na escalada, mas o cliente final sente a diferença).
    try {
      setSetting(
        "bot_last_ai_error",
        JSON.stringify({
          at: new Date().toISOString(),
          quota: /429|RESOURCE_EXHAUSTED|quota/i.test(detalhe),
          message: detalhe.slice(0, 400),
        })
      );
    } catch {
      /* best-effort */
    }
    return { ...base, escalated: true, reason: "erro_ia" };
  }
}

/* ------------------------------------------------------------------ */
/*  Escalada para o dono do negócio                                    */
/* ------------------------------------------------------------------ */

/**
 * Mensagem que o dono recebe quando o bot não sabe. Precisa ser respondível:
 * diz quem perguntou o quê e o que fazer para ensinar o bot.
 */
export function formatOwnerEscalation(input: {
  clientName: string;
  question: string;
  customerName?: string;
  reason?: RagAnswer["reason"];
}): string {
  const de = input.customerName ? `*${input.customerName}*` : "Um cliente";
  const motivo =
    input.reason === "sem_base"
      ? "isso não está na base que você me passou"
      : input.reason === "ia_sem_resposta"
        ? "achei o assunto, mas não consegui responder com segurança"
        : "não consegui responder";
  return [
    `⚠️ ${de} perguntou algo que ${motivo}:`,
    "",
    `"${input.question.trim()}"`,
    "",
    "Me responde aqui em uma linha que eu já respondo pra ele. Se for algo recorrente, vale incluir na base de conhecimento.",
  ].join("\n");
}

/**
 * Envia texto a partir da instância do cliente.
 *
 * A instância vai no caminho da URL do gateway (o baseUrl e a apikey são da
 * conta), então cada cliente fala pelo próprio número.
 */
export async function sendBotText(
  instance: string | undefined,
  phone: string,
  text: string
): Promise<{ externalId?: string }> {
  const destino = String(phone || "").replace(/\D/g, "");
  if (!destino) throw new Error("Telefone de destino vazio.");
  return sendGatewayText(destino, text, instance);
}

/**
 * Manda a pergunta não respondida para o WhatsApp do dono.
 * Usa a instância do cliente (se houver) para a mensagem sair do número dele.
 */
export async function escalateToOwner(input: {
  clientId: string;
  question: string;
  customerName?: string;
  reason?: RagAnswer["reason"];
}): Promise<{ sent: boolean; detail: string }> {
  const client = getBotClient(input.clientId);
  if (!client) return { sent: false, detail: "cliente de bot não encontrado" };
  if (!client.ownerPhone) return { sent: false, detail: "cliente sem telefone do dono cadastrado" };

  const texto = formatOwnerEscalation({
    clientName: client.name,
    question: input.question,
    customerName: input.customerName,
    reason: input.reason,
  });

  try {
    await sendBotText(client.instance, client.ownerPhone, texto);
    return { sent: true, detail: `pergunta enviada para o dono (${client.ownerPhone})` };
  } catch (error: any) {
    return { sent: false, detail: `falha ao avisar o dono: ${error?.message || error}` };
  }
}

/** Quantos documentos e trechos já existem para um cliente. */
export function knowledgeStats(clientId: string): { docs: number; chunks: number } {
  ensureBotTables();
  const docs = getDb().prepare("SELECT COUNT(*) c FROM bot_docs WHERE client_id = ?").get(clientId) as any;
  const chunks = getDb().prepare("SELECT COUNT(*) c FROM bot_chunks WHERE client_id = ?").get(clientId) as any;
  return { docs: docs?.c ?? 0, chunks: chunks?.c ?? 0 };
}

/* ------------------------------------------------------------------ */
/*  Roteamento por instância (um número por cliente)                   */
/* ------------------------------------------------------------------ */

/** Acha o cliente dono de uma instância do gateway (ex.: "barbearia-nivaldo"). */
export function findBotClientByInstance(instance: string): BotClient | undefined {
  ensureBotTables();
  const alvo = String(instance || "").trim();
  if (!alvo) return undefined;
  const row = getDb()
    .prepare("SELECT * FROM bot_clients WHERE lower(instance) = lower(?) ORDER BY created_at DESC LIMIT 1")
    .get(alvo) as any;
  return row ? rowToClient(row) : undefined;
}

/** Clientes ativos com instância configurada (os que podem receber mensagem). */
export function listRoutableBots(): BotClient[] {
  ensureBotTables();
  return (getDb()
    .prepare("SELECT * FROM bot_clients WHERE status = 'active' AND instance IS NOT NULL AND instance != '' ORDER BY created_at DESC")
    .all() as any[]).map(rowToClient);
}

/* ------------------------------------------------------------------ */
/*  Handoff: o dono assume a conversa e o bot fica calado              */
/* ------------------------------------------------------------------ */

export const DEFAULT_HANDOFF_HOURS = Number(process.env.BOT_HANDOFF_HOURS || 6);

/** O bot está calado agora? (o dono assumiu e o prazo não venceu) */
export function isBotPaused(client: Pick<BotClient, "botPausedUntil">, now: Date = new Date()): boolean {
  if (!client.botPausedUntil) return false;
  const ate = new Date(client.botPausedUntil).getTime();
  return Number.isFinite(ate) && ate > now.getTime();
}

/** Pausa o bot (padrão 6h) porque um humano entrou na conversa. */
export function pauseBot(clientId: string, hours = DEFAULT_HANDOFF_HOURS, reason = "atendimento humano"): BotClient | undefined {
  const ate = new Date(Date.now() + Math.max(1, hours) * 60 * 60 * 1000).toISOString();
  return updateBotClient(clientId, { botPausedUntil: ate, botPausedReason: reason });
}

export function resumeBot(clientId: string): BotClient | undefined {
  return updateBotClient(clientId, { botPausedUntil: undefined, botPausedReason: undefined });
}

/* ------------------------------------------------------------------ */
/*  Histórico de conversas do bot (relatório e auditoria)              */
/* ------------------------------------------------------------------ */

export type BotMessageKind = "inbound" | "answer" | "holding" | "escalation" | "owner";

export function recordBotMessage(input: {
  clientId: string;
  phone: string;
  direction: "in" | "out";
  kind: BotMessageKind;
  text: string;
  occurredAt?: string;
  externalId?: string;
}): void {
  ensureBotTables();
  getDb()
    .prepare(
      `INSERT INTO bot_messages (id, client_id, phone, direction, kind, text, external_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      newId("msg"),
      input.clientId,
      String(input.phone || "").replace(/\D/g, ""),
      input.direction,
      input.kind,
      String(input.text || "").slice(0, 4000),
      input.externalId || null,
      input.occurredAt || new Date().toISOString()
    );
}

/**
 * A mensagem que o gateway ecoou é uma que nós mesmos enviamos?
 * Sem isso, cada resposta do bot pareceria "o dono digitando" e o bot se calaria
 * depois de falar a primeira vez.
 */
export function isOwnBotMessage(clientId: string, externalId?: string): boolean {
  if (!externalId) return false;
  ensureBotTables();
  const row = getDb()
    .prepare("SELECT 1 FROM bot_messages WHERE client_id = ? AND external_id = ? LIMIT 1")
    .get(clientId, externalId);
  return Boolean(row);
}

export interface BotMessageRow {
  id: string;
  clientId: string;
  phone: string;
  direction: "in" | "out";
  kind: BotMessageKind;
  text: string;
  createdAt: string;
}

export function listBotMessages(clientId: string, limit = 50): BotMessageRow[] {
  ensureBotTables();
  const rows = getDb()
    .prepare("SELECT * FROM bot_messages WHERE client_id = ? ORDER BY created_at DESC LIMIT ?")
    .all(clientId, Math.max(1, Math.min(500, limit))) as any[];
  return rows.map((r) => ({
    id: r.id,
    clientId: r.client_id,
    phone: r.phone,
    direction: r.direction === "out" ? "out" : "in",
    kind: r.kind,
    text: r.text,
    createdAt: r.created_at,
  }));
}

/** Números do mês: quantas conversas, quantas o bot resolveu, quantas escalou. */
export function botStats(clientId: string, sinceIso?: string): {
  inbound: number;
  answered: number;
  escalated: number;
  owner: number;
  resolutionRate: number;
} {
  ensureBotTables();
  const desde = sinceIso || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const linhas = getDb()
    .prepare("SELECT kind, COUNT(*) AS c FROM bot_messages WHERE client_id = ? AND created_at >= ? GROUP BY kind")
    .all(clientId, desde) as any[];
  const mapa = new Map<string, number>(linhas.map((l) => [l.kind, l.c]));
  const inbound = mapa.get("inbound") || 0;
  const answered = mapa.get("answer") || 0;
  const escalated = mapa.get("escalation") || 0;
  return {
    inbound,
    answered,
    escalated,
    owner: mapa.get("owner") || 0,
    resolutionRate: inbound ? Math.round((answered / inbound) * 100) : 0,
  };
}

/* ------------------------------------------------------------------ */
/*  Documentos da base                                                 */
/* ------------------------------------------------------------------ */

export interface KnowledgeDoc {
  id: string;
  title?: string;
  source?: string;
  chars: number;
  chunks: number;
  createdAt: string;
}

export function listKnowledgeDocs(clientId: string): KnowledgeDoc[] {
  ensureBotTables();
  const rows = getDb()
    .prepare(
      `SELECT d.id, d.title, d.source, d.content, d.created_at,
              (SELECT COUNT(*) FROM bot_chunks c WHERE c.doc_id = d.id) AS chunks
       FROM bot_docs d WHERE d.client_id = ? ORDER BY d.created_at DESC`
    )
    .all(clientId) as any[];
  return rows.map((r) => ({
    id: r.id,
    title: r.title || undefined,
    source: r.source || undefined,
    chars: String(r.content || "").length,
    chunks: r.chunks ?? 0,
    createdAt: r.created_at,
  }));
}

/** Remove um documento e seus trechos (reindexação manual do cliente). */
export function deleteKnowledgeDoc(clientId: string, docId: string): { removed: boolean; chunks: number } {
  ensureBotTables();
  const db = getDb();
  const chunks = db.prepare("DELETE FROM bot_chunks WHERE client_id = ? AND doc_id = ?").run(clientId, docId).changes;
  const docs = db.prepare("DELETE FROM bot_docs WHERE client_id = ? AND id = ?").run(clientId, docId).changes;
  return { removed: docs > 0, chunks };
}
