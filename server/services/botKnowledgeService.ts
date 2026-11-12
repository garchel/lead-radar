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
import { gatewayRequest } from "./whatsappGateway";

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
  `);
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
    createdAt: now,
    updatedAt: now,
  };
  getDb()
    .prepare(
      `INSERT INTO bot_clients (id, name, owner_phone, instance, setup_price, monthly_price, status, min_score, created_at, updated_at)
       VALUES (@id, @name, @ownerPhone, @instance, @setupPrice, @monthlyPrice, @status, @minScore, @createdAt, @updatedAt)`
    )
    .run(client);
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
        min_score = @minScore, updated_at = @updatedAt WHERE id = @id`
    )
    .run(next);
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

async function embedAll(texts: string[]): Promise<number[][]> {
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
  const vetores = await embedAll(pedacos);
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

  const [vetorPergunta] = await embedAll([pergunta]);
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

  const { topScore, hits } = await searchKnowledge(clientId, question, { k: opts.k ?? 4 });
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
    const res = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || "gemini-flash-latest",
      contents: [{ role: "user", parts: [{ text: buildGroundedPrompt(client, question, hits.map((h) => h.content)) }] }],
      config: { temperature: 0, abortSignal: AbortSignal.timeout(20000) },
    });
    const answer = (res.text || "").trim();
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
    console.warn(`[bot] resposta com base falhou para ${clientId}: ${error?.message || error}`);
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
    await gatewayRequest(`/message/sendText/${client.instance || ""}`.replace(/\/+$/, ""), {
      method: "POST",
      body: { number: client.ownerPhone, text: texto },
    });
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
