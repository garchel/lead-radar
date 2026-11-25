/**
 * Público e medidas.
 *
 * Ideia importada da skill `chicote` (matheusmongarde), que faz o que a gente não
 * fazia: transformar público em NÚMEROS, em vez de usar um conjunto fixo para
 * todo mundo. Uma clínica no interior e uma barbearia jovem não têm o mesmo leitor.
 *
 * Diferença de execução: aqui os números entram no prompt E viram limite do portão
 * — não são só documentação.
 */

export type Perfil = "geral" | "idoso" | "jovem" | "b2b";

export interface MedidasDoPublico {
  corpo: number;
  minimo: number;
  razao: number;
  alvo: number;
  contraste: number;
  opcoes: number;
  movimento: string;
  porque: string;
}

export const PERFIS: Record<Perfil, MedidasDoPublico> = {
  geral: {
    corpo: 17,
    minimo: 13,
    razao: 1.25,
    alvo: 44,
    contraste: 4.5,
    opcoes: 5,
    movimento: "equilibrado: entrada de 0,8s, sem excesso",
    porque: "público amplo: 17px lê bem sem zoom e 1,25 dá hierarquia clara",
  },
  idoso: {
    corpo: 19,
    minimo: 15,
    razao: 1.2,
    alvo: 52,
    contraste: 7,
    opcoes: 3,
    movimento: "mínimo: entrada de 0,4s, nada de parallax",
    porque: "acuidade e contraste percebido caem com a idade; tremor pede alvo maior",
  },
  jovem: {
    corpo: 16,
    minimo: 12,
    razao: 1.333,
    alvo: 44,
    contraste: 4.5,
    opcoes: 5,
    movimento: "rico: entrada de 1s com escala, título palavra por palavra",
    porque: "leitura rápida no celular; salto de tamanho maior dá o drama que esse público espera",
  },
  b2b: {
    corpo: 16,
    minimo: 13,
    razao: 1.25,
    alvo: 44,
    contraste: 4.5,
    opcoes: 7,
    movimento: "discreto: entrada de 0,6s, sem chamar atenção",
    porque: "decisor lê comparando; densidade média importa mais que impacto",
  },
};

/**
 * Perfil a partir do nicho. Quem atende majoritariamente gente mais velha recebe
 * letra maior, alvo maior e contraste AAA — não é preferência estética.
 */
export function perfilDoLead(categoria: string, nome = ""): Perfil {
  const alvo = `${categoria || ""} ${nome || ""}`.toLowerCase();
  if (/[oó]tica|joalher|relojoar|loter|farm[aá]cia|cart[oó]rio|banco|previd|cl[ií]nica m[eé]dica|geriatria|fisioterap|auditiv|aparelho auditivo/.test(alvo)) return "idoso";
  if (/barbearia|barbeiro|est[eé]tica|tatuagem|academia|personal|a[cç]a[ií]|burger|lanche|cervejaria|bike|skate|pet shop|petshop/.test(alvo)) return "jovem";
  if (/advocacia|advogad|contabil|contador|consultoria|software|ag[eê]ncia|engenharia|arquitet/.test(alvo)) return "b2b";
  return "geral";
}

/** Entrelinha derivada: letra grande pede entrelinha relativa menor. */
export function entrelinhaPara(tamanhoPx: number, corpoPx: number, perfil: Perfil = "geral"): number {
  const base = corpoPx > 0 ? corpoPx : 16;
  const bruto = 1.1 + 0.4 * (base / Math.max(tamanhoPx, 8));
  const extra = perfil === "idoso" && tamanhoPx <= base * 1.3 ? 0.1 : 0;
  return Math.round(Math.min(1.75, Math.max(1.02, bruto + extra)) * 100) / 100;
}

export interface MedidaDoTitulo {
  /** Tamanho máximo que faz a frase caber no número de linhas pedido. */
  px: number;
  /** Quantas linhas a frase ocupa nesse tamanho. */
  cabe: boolean;
  /** Sugestão quando a frase é longa demais para ter peso de título. */
  sugestao: string | null;
}

/**
 * Tamanho do título que cabe em N linhas numa largura — a conta que evita
 * "Cuidado / psicológico / em / Cachoeirinha" com o "em" sozinho.
 *
 * largura em px, letraEm = largura média do caractere relativa ao tamanho
 * (grotesca ~0,52; serifada/negrito ~0,58), quebra = desperdício de fim de linha.
 */
export function medirTitulo(
  titulo: string,
  larguraPx = 328,
  linhas = 3,
  letraEm = 0.52,
  quebra = 1.15,
): MedidaDoTitulo {
  const texto = String(titulo || "").trim();
  const largura = Math.max(120, larguraPx);
  if (!texto) return { px: 40, cabe: true, sugestao: null };

  const caracteres = texto.length;
  const porConta = Math.floor((largura * linhas) / (caracteres * letraEm * quebra));
  const px = Math.max(24, Math.min(porConta, 72));
  const palavras = texto.split(/\s+/).filter(Boolean).length;

  // Abaixo de ~2× o corpo do texto, o "título" não tem peso: melhor encurtar.
  const fraco = px < 30 || palavras > 12;
  return {
    px,
    cabe: !fraco,
    sugestao: fraco
      ? `a frase tem ${caracteres} caracteres e ${palavras} palavras: para caber em ${linhas} linhas a ${largura}px ela ficaria com ${px}px. Encurte o título (o ideal é até 8 palavras) em vez de diminuir a letra.`
      : null,
  };
}
