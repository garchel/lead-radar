/**
 * Memória da conversa.
 *
 * O agente respondia sem saber o que já tinha sido dito: o monitor do inbox
 * acordava a Clara com UMA linha e ela reconstruía o contexto no escuro. O
 * resultado apareceu em produção: o lead recebeu o link, disse "achei legal
 * demais" e recebeu o link de novo, porque o pipeline tratou elogio como pedido.
 *
 * Aqui a conversa vira dado: quem falou o quê, quando, e os fatos que o agente
 * precisa para conduzir em vez de adivinhar (página já entregue? qual link? há
 * quanto tempo ele não responde?).
 */
import { getCommunicationsByLead, getLeadById } from "../store/db";

export type Turno = {
  de: "lead" | "clara";
  texto: string;
  em: string;
  hook: string | null;
  intent: string | null;
};

export type FatosDaConversa = {
  /** A página já foi entregue alguma vez nesta conversa. */
  paginaEntregue: boolean;
  /** Link entregue (o último, se houve mais de um). */
  paginaUrl: string | null;
  /** Quando a página foi entregue. */
  entregueEm: string | null;
  /** Quantas vezes o lead já recebeu o link. */
  vezesEntregue: number;
  /** Quantas mensagens o lead já mandou. */
  respostasDoLead: number;
  /** Já elogiou a página depois de receber ("achei legal", "gostei"). */
  elogiouDepoisDeVer: boolean;
  /** Última FALA da conversa é do lead (ela está devendo resposta). */
  aguardandoResposta: boolean;
  /** A última mensagem no histórico é um aviso automático nosso, e não uma fala. */
  travadaPorAviso: boolean;
  /** A rede de segurança do app já falou nesta conversa (outro repertório). */
  fallbackFalou: boolean;
  /** Horas desde a última mensagem do lead. */
  silencioHoras: number | null;
};

export type ContextoDaConversa = {
  turnos: Turno[];
  fatos: FatosDaConversa;
  etapa: EtapaDoFunil;
  /** Bloco pronto para o prompt do agente. */
  texto: string;
};

const URL_RE = /https?:\/\/[^\s)]+/i;

/** Normaliza acentos: `\b` do JS não fecha depois de "á" e quebrava "tá top". */
function semAcento(texto: string): string {
  return String(texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

const NEGACAO = /\b(nao|nunca|nem)\b/;

/** Pedido explícito do link. Elogio NÃO é pedido. */
export function pedidoDeLink(texto: string): boolean {
  const t = semAcento(texto);
  if (!t.trim()) return false;
  const padroes = [
    /\b(mand|envi|reenvi|repet|repit)\w*[^.]{0,25}\b(link|pagina|site|de novo|novamente|outra vez)\b/,
    /\b(cade)\b[^.]{0,15}\b(link|pagina)\b/,
    /\bnao\s+(achei|encontrei|abriu|consigo abrir)\b/,
    /\b(perdi|sumiu)\b[^.]{0,15}\b(link|mensagem)\b/,
    /\b(qual|manda)\b[^.]{0,10}\bo?\s*link\b/,
  ];
  return padroes.some((r) => r.test(t));
}

/** Elogio/aceitação sem pedido: "achei legal", "gostei", "ficou bom", "top". */
export function ehElogio(texto: string): boolean {
  const t = semAcento(texto);
  // "não gostei" e "não achei legal" são crítica, não elogio.
  if (NEGACAO.test(t)) {
    const afirmativo = /\b(gostei|amei|adorei|curti|legal|bonit|bacana)\b/.test(t);
    if (!afirmativo) return false;
    return false;
  }
  return (
    /\b(achei|ficou|ta|esta)\b[^.]{0,20}\b(legal|bonit\w*|bom|boa|top|show|otim\w*|perfeito|lind\w*|bacana|massa)\b/.test(t) ||
    /\b(gostei|amei|adorei|curti)\b/.test(t)
  );
}


/* --------------------------------------------------------------- etapa do funil */

export type EtapaDoFunil = {
  numero: number;
  nome: string;
  /** O que fazer AGORA, e só isso. */
  proximaAcao: string;
  /** Etapas já cumpridas, na ordem. */
  cumpridas: number[];
};

const SECOES = /\b(secoes|seções|servicos|serviços|equipe|galeria|agendamento|depoimentos|faq|horario|horário|endereco|endereço)\b/i;
const PRECO = /(R\$\s*899|R\$\s*1\.?199|899|1\.?199)/;
const ACEITE = /\b(fechado|fechou|vamos fechar|quero contratar|pode fazer|aceito|combinado|bora|vamos nessa)\b/i;
const DOR = /\b(indicacao|indicação|google|instagram|instagram|whatsapp|cliente|chega|procura)\b/i;

/**
 * Onde a venda está — calculada da conversa, não adivinhada pelo modelo.
 *
 * O modelo pulava etapas porque ninguém dizia em qual ele estava: a mesma mensagem
 * servia para "apresentar o que a página tem" e para "decidir o que produzir". Aqui a
 * etapa é medida pelo que já foi DITO, e o prompt recebe uma única instrução: a próxima.
 */
export function etapaDoFunil(turnos: Turno[], fatos: FatosDaConversa): EtapaDoFunil {
  const falasDaClara = turnos.filter((t) => t.de === "clara").map((t) => t.texto);
  const falasDoLead = turnos.filter((t) => t.de === "lead").map((t) => t.texto);

  // Página já entregue prova interesse: não se volta a perguntar "como chega cliente hoje".
  const dorExplorada = fatos.paginaEntregue || falasDoLead.some((t) => DOR.test(t));
  const secoesApresentadas = falasDaClara.some((t) => SECOES.test(t));
  const precoDado = falasDaClara.some((t) => PRECO.test(t));
  const aceitou = precoDado && falasDoLead.some((t) => ACEITE.test(t));

  const cumpridas: number[] = [];
  if (dorExplorada) cumpridas.push(1);
  if (secoesApresentadas) cumpridas.push(2);
  if (precoDado) cumpridas.push(3);
  if (aceitou) cumpridas.push(4);

  if (aceitou) {
    return {
      numero: 5,
      nome: "produção",
      proximaAcao: "Combinar o que produzir: qual serviço destacar, fotos, textos e aprovação. Aqui sim entra conteúdo.",
      cumpridas,
    };
  }
  if (precoDado) {
    return {
      numero: 4,
      nome: "fechar",
      proximaAcao: "Tirar a dúvida que ficou e propor o próximo passo comercial (qual pacote, prazo, pagamento com o Paulo, contrato e nota).",
      cumpridas,
    };
  }
  if (secoesApresentadas) {
    return {
      numero: 3,
      nome: "pacotes e valor",
      proximaAcao: "Dizer o preço: Essencial R$ 899 e Profissional R$ 1.199, com o que muda entre os dois.",
      cumpridas,
    };
  }
  if (dorExplorada) {
    return {
      numero: 2,
      nome: "o que a página terá",
      proximaAcao: "Mostrar, com as seções do nicho dele, o que uma página que converte precisa ter. Sem preço ainda.",
      cumpridas,
    };
  }
  return {
    numero: 1,
    nome: "entender a dor",
    proximaAcao: "Perguntar como o cliente chega hoje (indicação, Google, Instagram) e conectar com o que ele responder.",
    cumpridas,
  };
}

function horasDesde(iso: string | null): number | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return null;
  return Number((ms / 3_600_000).toFixed(1));
}

/**
 * Reconstrói a conversa de um lead.
 *
 * `limite` corta os turnos antigos do texto do prompt, mas os FATOS são sempre
 * calculados sobre o histórico inteiro: a página pode ter sido entregue há 40
 * mensagens e isso não pode sumir do contexto.
 */
export function contextoDaConversa(leadId: string, opts: { limite?: number } = {}): ContextoDaConversa {
  const limite = opts.limite ?? 12;
  // getCommunicationsByLead jé vem ordenado (created_at DESC, rowid DESC) — o rowid
  // desempata mensagens do mesmo milissegundo. Reordenar só por createdAt embaralhava
  // esse empate e fazia "a última mensagem" ser a mais antiga.
  const desc = getCommunicationsByLead(leadId) || [];
  const todas = [...desc].reverse();

  const turnos: Turno[] = todas.map((c: any) => ({
    de: c.direction === "inbound" ? "lead" : "clara",
    texto: String(c.message || "").replace(/^\[RECEBIDA\]\s*/i, ""),
    em: c.createdAt || "",
    hook: c.hook || null,
    intent: c.intent || null,
  }));

  const entregas = todas.filter((c: any) => c.direction === "outbound" && String(c.hook || "") === "pagina_unica");
  const ultimaEntrega = entregas[entregas.length - 1];
  const urlDaEntrega = ultimaEntrega ? (String(ultimaEntrega.message || "").match(URL_RE) || [])[0] || null : null;

  const inbound = todas.filter((c: any) => c.direction === "inbound");
  const ultimoInbound = inbound[inbound.length - 1];

  // Aviso automático ("dá um minutinho que eu já te mando o link") NÃO é fala da
  // conversa. Contá-lo como resposta nossa travou a thread de verdade: o lead disse
  // "achei legal", o app soltou o aviso duplicado, e a Clara concluiu que a última
  // mensagem era dela e ficou calada para sempre.
  // Aviso de espera e REENVIO de link são artefato automático, não fala. A primeira
  // entrega conta como fala (ela termina perguntando "o que você achou?"); a segunda
  // em diante não, senão um reenvio acidental enterra a resposta que o lead espera.
  const primeiraEntregaId = (todas.find((c: any) => String(c.hook || "") === "pagina_unica") || {}).id;
  const falas = todas.filter((c: any) => {
    const hook = String(c.hook || "");
    if (hook === "pagina_aviso") return false;
    // Rede de segurança do app: outro repertório. Não é fala da Clara.
    if (hook.startsWith("fallback")) return false;
    if (hook === "pagina_unica" && c.id !== primeiraEntregaId) return false;
    return true;
  });
  const ultimaMensagem = falas[falas.length - 1] || todas[todas.length - 1];

  // Referência é a PRIMEIRA entrega: se o link foi reenviado por engano, medir a
  // partir da última esconderia o elogio (ele veio antes do reenvio).
  const primeiraEntrega = entregas[0];
  const elogiouDepoisDeVer = Boolean(
    primeiraEntrega &&
      inbound.some(
        (c: any) =>
          new Date(c.createdAt || 0).getTime() > new Date(primeiraEntrega.createdAt || 0).getTime() &&
          ehElogio(String(c.message || "")),
      ),
  );

  const fatos: FatosDaConversa = {
    paginaEntregue: entregas.length > 0,
    paginaUrl: urlDaEntrega,
    entregueEm: ultimaEntrega ? ultimaEntrega.createdAt || null : null,
    vezesEntregue: entregas.length,
    respostasDoLead: inbound.length,
    elogiouDepoisDeVer,
    aguardandoResposta: Boolean(ultimaMensagem && ultimaMensagem.direction === "inbound"),
    fallbackFalou: todas.some((c: any) => String(c.hook || "").startsWith("fallback")),
    travadaPorAviso: Boolean(
      ultimaMensagem && ultimaMensagem.direction === "inbound" && todas[todas.length - 1] !== ultimaMensagem,
    ),
    silencioHoras: horasDesde(ultimoInbound ? ultimoInbound.createdAt || null : null),
  };

  const lead = getLeadById(leadId);
  const linhas: string[] = [];
  if (lead) linhas.push(`${lead.name}${lead.city ? ` · ${lead.city}` : ""}`);

  if (fatos.paginaEntregue) {
    linhas.push(`Página JÁ entregue (${fatos.vezesEntregue}x)${fatos.entregueEm ? ` em ${fatos.entregueEm}` : ""}${fatos.paginaUrl ? `: ${fatos.paginaUrl}` : ""}`);
    if (fatos.elogiouDepoisDeVer) linhas.push("O lead já ELOGIOU a página depois de ver. Não mande o link de novo: elogio não é pedido.");
  } else {
    linhas.push("Página ainda NÃO foi entregue.");
  }
  if (fatos.silencioHoras !== null) linhas.push(`Última mensagem do lead: ${fatos.silencioHoras}h atrás.`);
  if (fatos.fallbackFalou) {
    linhas.push("A rede de segurança do app já respondeu nesta conversa com outro repertório. Retome o fio pela etapa certa, sem se desculpar e sem citar bastidor.");
  }
  if (fatos.travadaPorAviso) {
    linhas.push(
      "A última mensagem do histórico é um AVISO AUTOMÁTICO nosso, não uma resposta. O lead está esperando: responda a fala dele.",
    );
  }

  const recentes = turnos.slice(-limite);
  const transcricao = recentes
    .map((t) => {
      const hora = t.em ? new Date(t.em).toISOString().slice(11, 16) : "";
      return `${t.de === "lead" ? "LEAD" : "CLARA"}${hora ? ` (${hora})` : ""}: ${t.texto.replace(/\s+/g, " ").slice(0, 320)}`;
    })
    .join("\n");

  const etapa = etapaDoFunil(turnos, fatos);
  const texto = [
    "CONTEXTO REAL DA CONVERSA (leia antes de escrever, não repita o que já foi feito):",
    ...linhas.map((l) => `- ${l}`),
    `- ETAPA DO FUNIL: ${etapa.numero}/5 (${etapa.nome}). Faça SÓ isto agora: ${etapa.proximaAcao}`,
    "",
    transcricao ? `Últimas mensagens:\n${transcricao}` : "Sem histórico anterior.",
  ].join("\n");

  return { turnos, fatos, etapa, texto };
}

/**
 * A entrega da página deve rodar?
 *
 * Regra: entrega na primeira vez, e depois SÓ com pedido explícito do link.
 * Elogio, dúvida e objeção não reentregam — quem trata esses casos é a conversa.
 */
export function deveEntregarPagina(fatos: FatosDaConversa, mensagemDoLead: string): { entregar: boolean; motivo: string } {
  if (!fatos.paginaEntregue) return { entregar: true, motivo: "primeira entrega" };
  if (pedidoDeLink(mensagemDoLead)) return { entregar: true, motivo: "o lead pediu o link explicitamente" };
  return {
    entregar: false,
    motivo: `página já entregue${fatos.entregueEm ? ` em ${fatos.entregueEm}` : ""}; a mensagem não é pedido de link`,
  };
}
