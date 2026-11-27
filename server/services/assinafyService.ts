import { getDb } from "../store/schema";

/**
 * Cliente da API do Assinafy (assinatura eletrônica com trilha de auditoria).
 *
 * Contrato conferido no OpenAPI oficial (api.assinafy.com.br/v1/docs/openapi.json):
 *   - autenticação: header `X-Api-Key` (chave permanente, recomendada para backend)
 *   - upload: POST /v1/accounts/{accountId}/documents, multipart, campo `file` (PDF/DOC/DOCX/ODT)
 *   - signatário: POST /v1/accounts/{accountId}/signers {full_name, email, whatsapp_phone_number}
 *   - pedido de assinatura: POST /v1/documents/{id}/assignments {method, signers:[{id, verification_method}]}
 *   - status: GET /v1/documents/{id}        download: GET /v1/documents/{id}/download/{artifact}
 *
 * Verificação por WhatsApp custa 0.45 crédito e exige plano pago; no plano grátis o
 * caminho é `Email` (código de uso único por e-mail) com o link enviado por nós.
 */

const BASE = process.env.ASSINAFY_BASE_URL || "https://api.assinafy.com.br";

/**
 * A API fica atrás do Cloudflare: sem User-Agent de navegador ela responde 403 com
 * "error code: 1010" (bot check) — não é erro de chave. Constatado na prática.
 */
const AGENTE = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) LeadRadar/1.0";

export interface ConfigAssinafy {
  apiKey: string;
  /** Vazio quando ainda não descoberto: GET /v1/accounts resolve. */
  accountId: string;
}

let contaDescoberta: string | null = null;

function lerSetting(chave: string): string {
  try {
    const linha = getDb().prepare("SELECT value FROM app_settings WHERE key = ?").get(chave) as { value?: string } | undefined;
    return String(linha?.value || "").trim();
  } catch {
    return "";
  }
}

export function configAssinafy(): ConfigAssinafy | null {
  const apiKey = (process.env.ASSINAFY_API_KEY || lerSetting("assinafy_api_key")).trim();
  if (!apiKey) return null;
  const accountId = (process.env.ASSINAFY_ACCOUNT_ID || lerSetting("assinafy_account_id") || contaDescoberta || "").trim();
  return { apiKey, accountId };
}

export function assinafyConfigurado(): boolean {
  return configAssinafy() !== null;
}

/**
 * Descobre o account id a partir da própria chave (GET /v1/accounts).
 *
 * Assim basta a ASSINAFY_API_KEY no .env: o dono da conta não precisa caçar o id.
 */
export async function resolverConta(): Promise<ConfigAssinafy> {
  const config = configAssinafy();
  if (!config) throw new AssinafyError("Assinafy não configurado: falta a ASSINAFY_API_KEY.");
  if (config.accountId) return config;

  const json = await chamar("/v1/accounts", { method: "GET" }, config);
  const contas = Array.isArray(json?.data) ? json.data : [];
  const id = contas[0]?.id;
  if (!id) throw new AssinafyError("A chave não tem nenhuma conta associada.", 200, json);
  contaDescoberta = String(id);
  return { ...config, accountId: contaDescoberta };
}

export interface UsoDaConta {
  plano: string;
  documentosRestantes: number;
  documentosLimite: number;
  documentosUsados: number;
  creditos: number;
  renovaEm: string | null;
}

/** Uso do mês — para saber se ainda cabe mais contrato no plano grátis. */
export async function usoDaConta(): Promise<UsoDaConta> {
  const config = await resolverConta();
  const json = await chamar(`/v1/accounts/${config.accountId}/usage`, { method: "GET" }, config);
  const d = json?.data || {};
  const docs = d?.balances?.documents || {};
  return {
    plano: String(d.plan || "?"),
    documentosRestantes: Number(docs.balance ?? 0),
    documentosLimite: Number(docs.limit ?? 0),
    documentosUsados: Number(docs.spent ?? 0),
    creditos: Number(d?.balances?.credits?.balance ?? 0),
    renovaEm: d.documents_renewal_date || null,
  };
}

export class AssinafyError extends Error {
  constructor(
    message: string,
    public status?: number,
    public corpo?: unknown,
  ) {
    super(message);
  }
}

async function chamar(
  caminho: string,
  init: RequestInit & { corpoJson?: unknown } = {},
  config = configAssinafy(),
): Promise<any> {
  if (!config) throw new AssinafyError("Assinafy não configurado: falta a API key ou o account id.");
  const headers: Record<string, string> = { "X-Api-Key": config.apiKey, "User-Agent": AGENTE };
  let body = init.body as any;
  if (init.corpoJson !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(init.corpoJson);
  }
  const res = await fetch(`${BASE}${caminho}`, { ...init, headers, body });
  const texto = await res.text();
  let json: any = null;
  try {
    json = texto ? JSON.parse(texto) : null;
  } catch {
    /* resposta não-JSON: fica no erro como texto */
  }
  if (!res.ok) {
    const msg = json?.message || json?.error?.message || texto || `HTTP ${res.status}`;
    const detalhe = json?.details ? ` (${JSON.stringify(json.details)})` : "";
    throw new AssinafyError(`Assinafy: ${msg}${detalhe}`, res.status, json || texto);
  }
  return json;
}

/** Sobe o PDF do contrato. Devolve o id do documento no Assinafy. */
export async function subirDocumento(pdf: Buffer, nomeArquivo: string): Promise<string> {
  const config = await resolverConta();
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(pdf)], { type: "application/pdf" }), nomeArquivo);
  const json = await chamar(`/v1/accounts/${config.accountId}/documents`, { method: "POST", body: form }, config);
  const id = json?.data?.id || json?.id;
  if (!id) throw new AssinafyError("Assinafy não devolveu o id do documento.", 200, json);
  return String(id);
}

export interface DadosSignatario {
  nome: string;
  email: string;
  whatsapp?: string;
  cpf?: string;
}

export async function criarSignatario(dados: DadosSignatario): Promise<string> {
  const config = await resolverConta();
  const corpo: Record<string, string> = { full_name: dados.nome, email: dados.email };
  if (dados.whatsapp) corpo.whatsapp_phone_number = dados.whatsapp;
  if (dados.cpf) corpo.government_id = dados.cpf;
  const json = await chamar(`/v1/accounts/${config.accountId}/signers`, { method: "POST", corpoJson: corpo }, config);
  const id = json?.data?.id || json?.id;
  if (!id) throw new AssinafyError("Assinafy não devolveu o id do signatário.", 200, json);
  return String(id);
}

/**
 * Pede a assinatura.
 *
 * `virtual` assina sem campos na página (um clique + código) — é o que serve para
 * contrato de serviço. `Email` porque verificação por WhatsApp é de plano pago.
 */
export async function pedirAssinatura(
  documentId: string,
  signerId: string,
  verificacao: "Email" | "Whatsapp" = "Email",
): Promise<any> {
  return chamar(`/v1/documents/${documentId}/assignments`, {
    method: "POST",
    corpoJson: { method: "virtual", signers: [{ id: signerId, verification_method: verificacao }] },
  });
}

export interface SituacaoDocumento {
  id: string;
  status: string;
  assinado: boolean;
  /** Ainda preparando o arquivo: aguardar antes de cobrar status do cliente. */
  processando?: boolean;
  bruto: unknown;
}

const STATUS_ASSINADO = ["signed", "completed", "finished", "concluded"];
/** A API devolve isso logo após o upload; não é erro, é preparo do arquivo. */
const STATUS_PROCESSANDO = ["metadata_processing", "processing", "pending"];

export async function situacaoDoDocumento(documentId: string): Promise<SituacaoDocumento> {
  const json = await chamar(`/v1/documents/${documentId}`, { method: "GET" });
  const dados = json?.data || json;
  const status = String(dados?.status || dados?.assignment?.status || "desconhecido").toLowerCase();
  return {
    id: documentId,
    status,
    assinado: STATUS_ASSINADO.includes(status),
    processando: STATUS_PROCESSANDO.includes(status),
    bruto: dados,
  };
}

/** Baixa o PDF assinado. `pades` = com assinatura embutida; `bundle` = pacote completo. */
export async function baixarAssinado(documentId: string, artefato: "pades" | "certificated" | "bundle" = "pades"): Promise<Buffer> {
  const config = await resolverConta();
  const res = await fetch(`${BASE}/v1/documents/${documentId}/download/${artefato}`, {
    headers: { "X-Api-Key": config.apiKey, "User-Agent": AGENTE },
  });
  if (!res.ok) throw new AssinafyError(`Assinafy: falha ao baixar o assinado (HTTP ${res.status}).`, res.status);
  return Buffer.from(await res.arrayBuffer());
}
