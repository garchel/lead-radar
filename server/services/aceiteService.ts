import { getDb } from "../store/schema";
import { getLeadById, recordCommunication, upsertLead } from "../store/db";
import { sendOwnerAlert } from "./ownerAlertService";
import { brl } from "./paymentPlan";
import type { CommercialPackage, CommercialPolicy } from "./commercialPolicy";

/**
 * Aceite do contrato por WhatsApp.
 *
 * É a assinatura eletrônica SIMPLES da Lei 14.063/2020: identifica quem concordou e com
 * o quê. O que dá força não é o "ok" — é o conjunto: telefone de origem, data e hora,
 * o texto exato aceito e o contrato enviado na mesma conversa.
 *
 * Por isso a frase é fixa e nomeia pacote e valor. "Ok" e "beleza" não provam nada:
 * quem contesta depois diz que concordou com outra coisa. A frase não permite ambiguidade.
 */

export interface FraseDeAceite {
  frase: string;
  pacote: string;
  valor: number;
}

export function fraseDeAceite(policy: CommercialPolicy, pacote: CommercialPackage): FraseDeAceite {
  const valor = pacote.price;
  const frase = `ACEITO O CONTRATO DA ${policy.companyName.toUpperCase()} — PACOTE ${pacote.name.toUpperCase()} — ${brl(valor)}`;
  return { frase, pacote: pacote.name, valor };
}

function semAcento(v: string): string {
  return String(v || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/** Compara ignorando acento, caixa, pontuação e espaço — mas não o conteúdo. */
export function normalizarFala(texto: string): string {
  return semAcento(texto)
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Valor falado ou digitado.
 *
 * Áudio não diz "R$ 1.199,00": diz "mil cento e noventa e nove". Número por extenso não
 * se resolve com regex confiável, então os preços do catálogo têm a forma falada mapeada;
 * para preço novo, o número ainda funciona.
 */
const VALOR_FALADO: Record<number, string[]> = {
  899: ["oitocentos e noventa e nove", "oitocentos e noventa e nove reais"],
  1199: ["mil cento e noventa e nove", "mil cento e noventa e nove reais", "mil e cento e noventa e nove"],
};

function valorDito(dito: string, valor: number): boolean {
  const digitos = dito.replace(/\s/g, "");
  const semCentavos = String(Math.round(valor));
  if (digitos.includes(semCentavos)) return true;
  if (digitos.includes(`${semCentavos}00`)) return true;
  const falado = VALOR_FALADO[Math.round(valor)] || [];
  return falado.some((f) => dito.includes(normalizarFala(f)));
}

export interface ResultadoDaFrase {
  confere: boolean;
  faltando: string[];
}

/**
 * Confere se o texto/áudio transcrito cumpre a frase.
 *
 * Exige os quatro elementos que dão sentido ao aceite: aceitação explícita, a palavra
 * "contrato", o nome da empresa e o pacote com o valor. Tolerante na forma, rígido no
 * conteúdo: "aceito" sozinho não passa.
 */
export function conferirFrase(
  mensagem: string,
  policy: CommercialPolicy,
  pacote: CommercialPackage,
): ResultadoDaFrase {
  const dito = normalizarFala(mensagem);
  const faltando: string[] = [];

  if (!/\baceito\b|\baceitamos\b|\bconcordo\b|\bde acordo\b/.test(dito)) faltando.push("a palavra \"aceito\"");
  if (!/\bcontrato\b/.test(dito)) faltando.push("\"contrato\"");
  const empresa = normalizarFala(policy.companyName).split(" ")[0];
  if (empresa && !dito.includes(empresa)) faltando.push(`o nome ${policy.companyName}`);
  if (!dito.includes(normalizarFala(pacote.name))) faltando.push(`o pacote ${pacote.name}`);

  // O valor pode vir em número (1.199, 1199,00) ou por extenso no áudio.
  if (!valorDito(dito, pacote.price)) faltando.push(`o valor ${brl(pacote.price)}`);

  return { confere: faltando.length === 0, faltando };
}

export interface RegistroDeAceite {
  id: number;
  leadId: string;
  pacote: string;
  valor: number;
  frase: string;
  mensagem: string;
  telefone: string | null;
  canal: "texto" | "audio";
  hashContrato: string | null;
  aceitoEm: string;
}

let tabelaPronta = false;

export function garantirTabelaDeAceites(): void {
  if (tabelaPronta) return;
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS contract_acceptances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id TEXT NOT NULL,
      pacote TEXT NOT NULL,
      valor REAL NOT NULL,
      frase TEXT NOT NULL,
      mensagem TEXT NOT NULL,
      telefone TEXT,
      canal TEXT NOT NULL DEFAULT 'texto',
      hash_contrato TEXT,
      aceito_em TEXT NOT NULL,
      criado_em TEXT NOT NULL
    );
  `);
  tabelaPronta = true;
}

export interface EntradaAceite {
  leadId: string;
  policy: CommercialPolicy;
  pacote: CommercialPackage;
  /** O que o cliente escreveu (ou a transcrição do áudio). */
  mensagem: string;
  telefone?: string;
  canal?: "texto" | "audio";
  hashContrato?: string;
}

/** Grava o aceite quando a frase confere. Não aceita "ok" e não inventa registro. */
export function registrarAceite(entrada: EntradaAceite): {
  registrado: boolean;
  faltando: string[];
  registro?: RegistroDeAceite;
  comprovante?: string;
} {
  const { leadId, policy, pacote, mensagem } = entrada;
  const conferencia = conferirFrase(mensagem, policy, pacote);
  if (!conferencia.confere) {
    return { registrado: false, faltando: conferencia.faltando };
  }

  garantirTabelaDeAceites();
  const lead = getLeadById(leadId);
  const agora = new Date().toISOString();
  const { frase, valor } = fraseDeAceite(policy, pacote);
  const telefone = String(entrada.telefone || lead?.phone || "").trim() || null;
  const canal = entrada.canal === "audio" ? "audio" : "texto";

  const info = getDb()
    .prepare(
      `INSERT INTO contract_acceptances
         (lead_id, pacote, valor, frase, mensagem, telefone, canal, hash_contrato, aceito_em, criado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(leadId, pacote.name, valor, frase, mensagem, telefone, canal, entrada.hashContrato || null, agora, agora);

  const registro: RegistroDeAceite = {
    id: Number(info.lastInsertRowid),
    leadId,
    pacote: pacote.name,
    valor,
    frase,
    mensagem,
    telefone,
    canal,
    hashContrato: entrada.hashContrato || null,
    aceitoEm: agora,
  };

  // O aceite move o funil: quem aceitou não é mais "contatado".
  if (lead && lead.pipelineStatus !== "negotiating" && lead.pipelineStatus !== "closed") {
    try {
      upsertLead({ ...lead, pipelineStatus: "negotiating", updatedAt: agora } as any, { preserveInteraction: true });
    } catch {
      /* o registro vale mesmo se o funil não mover */
    }
  }

  try {
    recordCommunication({
      leadId,
      channel: "whatsapp",
      direction: "inbound",
      status: "delivered",
      hook: "aceite_contrato",
      message: `[aceite ${canal}] ${mensagem}`,
    });
  } catch {
    /* histórico é auxiliar */
  }

  void sendOwnerAlert({
    kind: "contrato_aceito",
    detail: `${lead?.name || leadId} aceitou o pacote ${pacote.name} (${brl(valor)}) — cobrar a entrada e começar.`,
    leadId,
    leadName: lead?.name,
    leadPhone: telefone || undefined,
  }).catch(() => undefined);

  return { registrado: true, faltando: [], registro, comprovante: comprovanteDeAceite(registro, policy) };
}

/** Comprovante de uma página, para anexar ao processo. */
export function comprovanteDeAceite(registro: RegistroDeAceite, policy: CommercialPolicy): string {
  const quando = new Date(registro.aceitoEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const linhas = [
    `COMPROVANTE DE ACEITE ELETRÔNICO`,
    ``,
    `Contratada: ${policy.companyName}`,
    `Cliente: ${registro.leadId}`,
    `Pacote: ${registro.pacote}`,
    `Valor: ${brl(registro.valor)}`,
    `Telefone de origem: ${registro.telefone || "não informado"}`,
    `Meio: ${registro.canal === "audio" ? "áudio" : "mensagem de texto"} no WhatsApp`,
    `Data e hora: ${quando}`,
    ``,
    `Frase de aceite combinada:`,
    `"${registro.frase}"`,
    ``,
    `O que o cliente respondeu:`,
    `"${registro.mensagem}"`,
    ``,
    registro.hashContrato ? `Hash do contrato enviado: ${registro.hashContrato}` : `Contrato enviado na mesma conversa.`,
    ``,
    `Aceite registrado nos termos do art. 10, §2º, da MP 2.200-2/2001 e da Lei 14.063/2020`,
    `(assinatura eletrônica simples).`,
  ];
  return linhas.join("\n");
}

export function aceitesDoLead(leadId: string): RegistroDeAceite[] {
  garantirTabelaDeAceites();
  const linhas = getDb()
    .prepare("SELECT * FROM contract_acceptances WHERE lead_id = ? ORDER BY id DESC")
    .all(leadId) as any[];
  return linhas.map((l) => ({
    id: l.id,
    leadId: l.lead_id,
    pacote: l.pacote,
    valor: l.valor,
    frase: l.frase,
    mensagem: l.mensagem,
    telefone: l.telefone,
    canal: l.canal === "audio" ? "audio" : "texto",
    hashContrato: l.hash_contrato,
    aceitoEm: l.aceito_em,
  }));
}
