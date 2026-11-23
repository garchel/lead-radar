import { GoogleGenAI } from "@google/genai";

/**
 * Cliente de IA único do app.
 *
 * Regra da casa: o Gemini fica SÓ com embeddings (o que mais ninguém faz) e com
 * o papel de reserva. Todo o resto (classificar intenção, ficha do cliente,
 * pesquisa de marca com imagem e copy) vai para o DeepSeek via OpenCode Go.
 *
 * Este módulo imita a forma do SDK do Gemini (`ai.models.generateContent`) para
 * que os serviços não precisem mudar a lógica: eles já têm laço de reserva por
 * modelo, então basta colocar o nome do DeepSeek no começo da lista.
 */

const BASE_URL = (process.env.OPENCODE_BASE_URL || "https://opencode.ai/zen/go/v1").replace(/\/+$/, "");
const SESSION_ID = process.env.OPENCODE_SESSION || "leadradar-app";
const PADRAO_MODELO = process.env.OPENCODE_MODEL || "deepseek-v4.1-flash";
const TIMEOUT_PADRAO_MS = Number(process.env.OPENCODE_TIMEOUT_MS || 120000);

export function chaveDeepSeek(): string {
  return String(process.env.OPENCODE_API_KEY || "").trim();
}

export function isDeepSeekModel(model: string): boolean {
  return /^deepseek/i.test(String(model || ""));
}

/**
 * Modelos do DeepSeek para pôr na frente da lista de reserva.
 * Vazio quando não há chave: aí o app continua 100% no Gemini.
 */
export function modelosDeepSeek(): string[] {
  // Testes de unidade rodam com o .env carregado; sem esta trava eles fariam
  // chamada real (rede + custo) e quebrariam as asserções dos mocks do Gemini.
  const emTeste = Boolean(process.env.VITEST) || process.env.NODE_ENV === "test";
  if (emTeste && process.env.OPENCODE_TESTS !== "1") return [];
  return chaveDeepSeek() ? [PADRAO_MODELO] : [];
}

type Parte = { text?: string; inlineData?: { mimeType: string; data: string } };

function textoDeInstrucao(systemInstruction: unknown): string {
  if (!systemInstruction) return "";
  if (typeof systemInstruction === "string") return systemInstruction;
  const partes = (systemInstruction as { parts?: Parte[] }).parts || [];
  return partes.map((p) => p.text || "").join("\n").trim();
}

function mensagensOpenAi(contents: unknown, systemInstruction?: unknown): Array<Record<string, unknown>> {
  const mensagens: Array<Record<string, unknown>> = [];
  const sistema = textoDeInstrucao(systemInstruction);
  if (sistema) mensagens.push({ role: "system", content: sistema });

  const blocos = Array.isArray(contents) ? contents : [{ role: "user", parts: [{ text: String(contents ?? "") }] }];
  for (const bloco of blocos as any[]) {
    if (typeof bloco === "string") {
      mensagens.push({ role: "user", content: bloco });
      continue;
    }
    const papel = bloco?.role === "model" ? "assistant" : "user";
    const partes: Parte[] = bloco?.parts || (bloco?.text ? [{ text: String(bloco.text) }] : []);
    const conteudo: Array<Record<string, unknown>> = [];
    for (const parte of partes) {
      if (parte?.text) conteudo.push({ type: "text", text: parte.text });
      else if (parte?.inlineData?.data) {
        conteudo.push({
          type: "image_url",
          image_url: { url: `data:${parte.inlineData.mimeType || "image/png"};base64,${parte.inlineData.data}` },
        });
      }
    }
    if (!conteudo.length) continue;
    const soTexto = conteudo.length === 1 && conteudo[0].type === "text";
    mensagens.push({ role: papel, content: soTexto ? (conteudo[0].text as string) : conteudo });
  }
  return mensagens;
}

/** O schema vai no prompt: o endpoint aceita json_object, não json_schema estrito. */
function instrucaoSchema(config: any): string {
  if (!config?.responseSchema) return "";
  try {
    return `\n\nResponda SOMENTE um JSON válido, sem comentários e sem cercas de código, seguindo exatamente este schema:\n${JSON.stringify(config.responseSchema)}`;
  } catch {
    return "";
  }
}

function erroNormalizado(status: number, corpo: string): Error {
  const resumo = corpo.replace(/\s+/g, " ").slice(0, 300);
  const err = new Error(`DeepSeek respondeu ${status}: ${resumo}`);
  (err as any).status = status;
  return err;
}

/** Uma linha no log por chamada: em produção é a única forma de saber quem respondeu. */
function registrar(modelo: string, inicio: number, uso: any, texto: string): void {
  if (process.env.VITEST) return;
  const ms = Date.now() - inicio;
  const entrada = Number(uso?.promptTokenCount || 0);
  const saida = Number(uso?.candidatesTokenCount || 0);
  console.log(`[ia] ${modelo} · ${ms}ms · ${entrada} in / ${saida} out · ${texto.length} chars`);
}

async function chamarDeepSeek(args: { model: string; contents: unknown; config?: any }): Promise<{ text: string; modelVersion: string; usageMetadata: any }> {
  const inicio = Date.now();
  const config = args.config || {};
  const mensagens = mensagensOpenAi(args.contents, config.systemInstruction);
  const schema = instrucaoSchema(config);
  if (schema && mensagens.length) {
    const primeiro = mensagens[0];
    if (primeiro.role === "system") primeiro.content = String(primeiro.content) + schema;
    else mensagens.unshift({ role: "system", content: schema.trim() });
  }

  // Raciocínio desligado por padrão: com ele ligado o modelo gasta centenas de
  // tokens "pensando" em tarefa de extração e pode estourar o teto antes de
  // escrever a resposta (finish_reason: length com content vazio).
  const esforco = config.reasoningEffort ?? process.env.OPENCODE_REASONING ?? "none";
  const teto = Number(config.maxOutputTokens || (config.responseMimeType === "application/json" ? 1200 : 2000));
  const maxTokens = esforco === "none" ? teto : teto + 2500;

  const payload: Record<string, unknown> = {
    model: args.model,
    messages: mensagens,
    max_tokens: maxTokens,
    reasoning_effort: esforco,
  };
  if (typeof config.temperature === "number") payload.temperature = config.temperature;
  if (config.responseMimeType === "application/json") payload.response_format = { type: "json_object" };

  const timeout = Number(config.timeoutMs || TIMEOUT_PADRAO_MS);
  const externo: AbortSignal | undefined = config.abortSignal;
  const sinal = externo || AbortSignal.timeout(timeout);

  let resposta: Response;
  try {
    resposta = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${chaveDeepSeek()}`,
        "User-Agent": "leadradar/0.1.6",
        // O gateway roteia por sessão; sem este cabeçalho devolve 400.
        "x-opencode-session": SESSION_ID,
      },
      body: JSON.stringify(payload),
      signal: sinal,
    });
  } catch (err: any) {
    const motivo = err?.name === "TimeoutError" || err?.name === "AbortError" ? "timeout" : String(err?.message || err);
    throw new Error(`DeepSeek indisponível: ${motivo}`);
  }

  const corpo = await resposta.text();
  if (!resposta.ok) throw erroNormalizado(resposta.status, corpo);

  let dados: any;
  try {
    dados = JSON.parse(corpo);
  } catch {
    throw new Error("DeepSeek devolveu resposta ilegível");
  }

  const escolha = dados?.choices?.[0];
  const mensagem = escolha?.message || {};
  const texto = String(mensagem.content || "").trim();
  const uso = dados?.usage || {};

  if (!texto) {
    // Acontece quando o raciocínio consome o teto inteiro. Vale tentar de novo.
    throw new Error(`DeepSeek devolveu resposta vazia (finish_reason: ${escolha?.finish_reason || "desconhecido"})`);
  }

  const resultado = {
    text: texto,
    modelVersion: String(dados?.model || args.model),
    usageMetadata: {
      promptTokenCount: Number(uso.prompt_tokens || 0),
      candidatesTokenCount: Number(uso.completion_tokens || 0),
      totalTokenCount: Number(uso.total_tokens || 0),
      provider: "deepseek",
      model: dados?.model || args.model,
      custoUsd: Number(uso?.opencode?.list_cost || 0),
    },
  };
  registrar(resultado.modelVersion, inicio, resultado.usageMetadata, texto);
  return resultado;
}

type Args = { model: string; contents: unknown; config?: any };

class ClienteIA {
  readonly models: {
    generateContent: (args: Args) => Promise<{ text: string; modelVersion?: string; usageMetadata: any }>;
    embedContent: (args: any) => Promise<any>;
  };

  constructor(private readonly gemini: GoogleGenAI | null) {
    this.models = {
      generateContent: async (args: Args) => {
        if (isDeepSeekModel(args.model) && chaveDeepSeek()) return chamarDeepSeek(args);
        if (!this.gemini) throw new Error("Sem chave de IA configurada");
        return this.gemini.models.generateContent(args as any) as any;
      },
      embedContent: async (args: any) => {
        // Embeddings são a única coisa que continua exclusivamente no Gemini.
        if (!this.gemini) throw new Error("Sem GEMINI_API_KEY para gerar embeddings");
        return this.gemini.models.embedContent(args);
      },
    };
  }
}

/**
 * Devolve o cliente. Aceita a chave do Gemini por parâmetro para manter o
 * formato dos chamadores atuais (`new GoogleGenAI({ apiKey })`).
 */
export function getAiClient(chaveGeminiExplicita?: string): ClienteIA {
  const apiKey = String(chaveGeminiExplicita || process.env.GEMINI_API_KEY || "").trim();
  return new ClienteIA(apiKey ? new GoogleGenAI({ apiKey }) : null);
}

/** Prefixa a lista de reserva com o DeepSeek, quando há chave. */
export function comDeepSeek<T extends string>(modelos: T[]): string[] {
  return Array.from(new Set([...modelosDeepSeek(), ...modelos]));
}
