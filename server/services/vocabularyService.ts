/**
 * Vocabulário por nicho.
 *
 * O texto da prévia é o mesmo para todos os negócios, mas a palavra que nomeia
 * quem compra muda com o ramo. Numa barbearia "cliente" é natural; numa clínica
 * de psicologia soa a varejo e afasta ("paciente" ou "pessoa" é o que se espera).
 *
 * A regra é uma só: usar a palavra que o próprio negócio usaria com quem atende.
 */

export interface Vocabulario {
  /** Quem é atendido: cliente, paciente, aluno. */
  singular: string;
  plural: string;
  /** Artigo definido que combina com o singular. */
  artigo: "o" | "a";
  /** "o cliente" / "o paciente" / "o aluno". */
  comArtigo: string;
  /** Possessivo pronto: "dos seus clientes" / "das suas pessoas". */
  possessivo: string;
}

const CLIENTE: Vocabulario = { singular: "cliente", plural: "clientes", artigo: "o", comArtigo: "o cliente", possessivo: "dos seus clientes" };
const PACIENTE: Vocabulario = { singular: "paciente", plural: "pacientes", artigo: "o", comArtigo: "o paciente", possessivo: "dos seus pacientes" };
const ALUNO: Vocabulario = { singular: "aluno", plural: "alunos", artigo: "o", comArtigo: "o aluno", possessivo: "dos seus alunos" };
const PESSOA: Vocabulario = { singular: "pessoa", plural: "pessoas", artigo: "a", comArtigo: "a pessoa", possessivo: "das suas pessoas" };

/** Categorias em que tratar quem chega como "cliente" pega mal. */
const SAUDE =
  /psic[oó]log|psicoterap|terapia|cl[ií]nica|odont|dentist|m[eé]dic|fisioterap|nutri|fonoaudi|veterin|farmac|enfermag|acolhimento|recupera|depend[eê]ncia|sa[uú]de mental|analis[ei]|psiquiatr|terapeuta|casa de repouso|repouso/i;

const EDUCACAO = /escola|col[eé]gio|curso|aula|professor|treinamento|idiomas|educa[cç][aã]o|creche|ber[cç][aá]rio/i;

/** Saúde mental: aqui "paciente" ainda é clínico demais; "pessoa" acolhe. */
const ACOLHIMENTO = /psic[oó]log|psicoterap|terapia|acolhimento|depend[eê]ncia|sa[uú]de mental|psiquiatr|terapeuta|recupera/i;

export function vocabularioDoNicho(...pistas: Array<string | undefined | null>): Vocabulario {
  const texto = pistas.filter(Boolean).join(" ");
  if (!texto.trim()) return CLIENTE;

  if (ACOLHIMENTO.test(texto)) return PESSOA;
  if (SAUDE.test(texto)) return PACIENTE;
  if (EDUCACAO.test(texto)) return ALUNO;
  return CLIENTE;
}

/** Frase pronta: "o cliente decide" / "a pessoa decide". */
export function quemDecide(vocab: Vocabulario): string {
  return `${vocab.comArtigo} decide sem precisar ligar`;
}
