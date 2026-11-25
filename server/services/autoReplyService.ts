/**
 * Detecção de resposta automática do lead.
 *
 * Muita empresa pequena usa atendente eletrônico no WhatsApp: menu numerado,
 * aviso de ausência, "retornaremos em breve". Para o funil isso não é resposta
 * humana — e tratar como interesse faz o app gerar e publicar uma página para um
 * robô, gastando IA e queimando o lead com um link que ninguém vai abrir.
 *
 * A regra é conservadora: só marca como automática o que é claramente de máquina.
 * Resposta curta de humano ("pode mandar", "oi", "quanto custa") nunca entra.
 */

export interface VereditoAutoResposta {
  automatica: boolean;
  motivo?: string;
  confianca: number;
}

/** Padrões que sozinhos já indicam máquina. */
const FORTES = [
  /digite\s+[0-9]/,
  /digite\s+(uma\s+)?op[cç][aã]o/,
  /escolha\s+(uma\s+)?op[cç][aã]o/,
  /selecione\s+(uma\s+)?op[cç][aã]o/,
  /mensagem\s+autom[aá]tica/,
  /resposta\s+autom[aá]tica/,
  /atendimento\s+autom[aá]tico/,
  /assistente\s+virtual/,
  /rob[oô]\s+(de\s+)?atendimento/,
  /fora\s+do\s+(hor[aá]rio|expediente)/,
  /retornaremos/,
  /responderemos\s+em\s+breve/,
  /em\s+breve\s+(entraremos|retornaremos|responderemos)/,
  /recebemos\s+sua\s+mensagem/,
  /mensagem\s+recebida/,
  /n[aã]o\s+monitoramos/,
  /canal\s+apenas\s+para/,
  /fale\s+com\s+(um\s+)?atendente/,
];

/** Padrões que só valem combinados com outro sinal. */
const FRACOS = [
  /hor[aá]rio\s+de\s+atendimento/,
  /nosso\s+time\s+(responde|retorna)/,
  /equipe\s+(responde|retorna)/,
  /aguarde/,
  /protocolo\s*[:#]?\s*\d+/,
  /obrigado\s+pelo\s+contato/,
  /estamos\s+ausentes/,
  /volte\s+mais\s+tarde/,
];

function normalizar(texto: string): string {
  return String(texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function detectarAutoResposta(texto: string): VereditoAutoResposta {
  const alvo = normalizar(texto).trim();
  if (!alvo) return { automatica: false, confianca: 0 };

  // Mensagem de humano é curta e não tem cara de aviso. Evita falso positivo com
  // "pode mandar", "oi", "quanto custa?".
  const fortes = FORTES.filter((padrao) => padrao.test(alvo));
  if (fortes.length) {
    return {
      automatica: true,
      motivo: `resposta automática (${fortes[0].source.replace(/\\s\+/g, " ").slice(0, 40)})`,
      confianca: fortes.length >= 2 ? 0.95 : 0.85,
    };
  }

  const fracos = FRACOS.filter((padrao) => padrao.test(alvo));
  if (fracos.length >= 2) {
    return {
      automatica: true,
      motivo: `aviso automático (${fracos.length} sinais)`,
      confianca: 0.7,
    };
  }

  return { automatica: false, confianca: 0 };
}
