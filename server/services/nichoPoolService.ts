/**
 * Ponte entre o catálogo de nichos medido (server/data/pools) e o gerador.
 *
 * O catálogo tem três camadas por nicho — estrutura, sistema visual e voz — e foi
 * montado medindo sites reais (ver server/data/pools/README.md). Este serviço só LÊ:
 * não altera o comportamento do gerador até que alguém use o resultado.
 *
 * Regra de segurança: se o índice não existir ou o nicho não estiver catalogado,
 * devolve null e o gerador segue com o repertório escrito à mão. Nada quebra.
 */
import fs from "node:fs";
import path from "node:path";

export interface CampeaoDoNicho {
  id: string;
  nome: string;
  ocorrencias?: number;
  de?: number;
}

export interface TipografiaDoNicho {
  h1_mediana?: number | null;
  h1_p25?: number | null;
  h1_p75?: number | null;
  corpo_mediana?: number | null;
  razao?: number | null;
  n?: number;
  aviso?: string;
}

export interface PerfilDoPool {
  nicho: string;
  estruturaBase: string[];
  estruturaDiferenciador: string[];
  campeao: CampeaoDoNicho | null;
  provaObrigatoria: string[] | null;
  tipografia: TipografiaDoNicho | null;
  listaNegra: string[];
  regraDadoAusente: string | null;
  limites: string[];
}

interface Indice {
  gerado_em?: string;
  versao?: number;
  como_usar?: Record<string, string>;
  nichos: Record<string, {
    estrutura_base?: string[];
    estrutura_diferenciador?: string[];
    enquadramento_campeao?: CampeaoDoNicho | null;
    prova_obrigatoria_do_campeao?: string[] | null;
    tipografia?: TipografiaDoNicho | null;
    lista_negra?: string[];
    regra_dado_ausente?: string | null;
    limites?: string[];
  }>;
}

/**
 * Chaves de reconhecimento por nicho catalogado. A ordem importa: o primeiro que
 * casar vence, então padrões específicos vêm antes dos genéricos.
 */
const CHAVES: Array<{ nicho: string; chave: RegExp }> = [
  { nicho: "odontologia", chave: /odont|dentist|dental|implante dent|ortodont|clareamento/i },
  { nicho: "veterinaria", chave: /veterin|pet ?shop|cl[ií]nica veterin|crmv|animal hospital/i },
  { nicho: "advocacia", chave: /advog|advocacia|jur[ií]dic|law ?firm|attorney|lawyer|\boab\b/i },
  { nicho: "estetica", chave: /est[eé]tica|esteticista|harmoniza[cç][aã]o|med ?spa|aesthetic (clinic|medicine)|limpeza de pele/i },
  { nicho: "pilates", chave: /pilates|reformer|\bcadillac\b/i },
  { nicho: "fisioterapia", chave: /fisioterap|physiotherap|physical therap|crefito/i },
  { nicho: "psicologia", chave: /psic[oó]log|psicoterapia|psican[aá]lise|terapeuta|\bcrp\b|therapist|counsel/i },
  { nicho: "oficina", chave: /oficina mec|auto ?cent(er|ro)|mec[aâ]nica (automotiva|geral)|auto repair|alinhamento|pneu/i },
  { nicho: "otica", chave: /[oó]tica|óptica|[oó]culos|optometri|\boptician\b|eyewear/i },
  { nicho: "barbearia", chave: /barbearia|barbershop|barbeiro|barbear|haircut|\bfade\b/i },
];

let cache: { indice: Indice; origem: string } | null = null;
let avisou = false;

function candidatos(): string[] {
  const lista: string[] = [];
  if (process.env.LEADRADAR_POOLS_DIR) lista.push(process.env.LEADRADAR_POOLS_DIR);
  lista.push(path.join(process.cwd(), "server", "data", "pools"));
  lista.push(path.join(process.cwd(), "data", "pools"));
  lista.push(path.join(__dirname, "..", "..", "server", "data", "pools"));
  lista.push(path.join(__dirname, "..", "data", "pools"));
  return lista;
}

function carregar(): Indice | null {
  if (cache) return cache.indice;
  for (const dir of candidatos()) {
    const arquivo = path.join(dir, "_indice-nichos.json");
    try {
      if (!fs.existsSync(arquivo)) continue;
      const indice = JSON.parse(fs.readFileSync(arquivo, "utf8")) as Indice;
      if (!indice?.nichos) continue;
      cache = { indice, origem: arquivo };
      return indice;
    } catch {
      continue;
    }
  }
  if (!avisou) {
    avisou = true;
    console.warn("[pool-nichos] índice de nichos não encontrado: o gerador segue com o repertório interno");
  }
  return null;
}

/** Só quem já foi catalogado tem pool; o resto continua no repertório manual. */
export function nichoCatalogado(nome: string, categoria?: string): string | null {
  const alvo = `${nome || ""} ${categoria || ""}`.normalize("NFC");
  const achado = CHAVES.find((c) => c.chave.test(alvo));
  if (!achado) return null;
  const indice = carregar();
  if (!indice) return null;
  return indice.nichos[achado.nicho] ? achado.nicho : null;
}

export function perfilDoPool(nome: string, categoria?: string): PerfilDoPool | null {
  const nicho = nichoCatalogado(nome, categoria);
  if (!nicho) return null;
  const indice = carregar();
  const dados = indice?.nichos[nicho];
  if (!dados) return null;
  return {
    nicho,
    estruturaBase: dados.estrutura_base || [],
    estruturaDiferenciador: dados.estrutura_diferenciador || [],
    campeao: dados.enquadramento_campeao || null,
    provaObrigatoria: dados.prova_obrigatoria_do_campeao || null,
    tipografia: dados.tipografia || null,
    listaNegra: dados.lista_negra || [],
    regraDadoAusente: dados.regra_dado_ausente || null,
    limites: dados.limites || [],
  };
}

/**
 * Bloco pronto para entrar no prompt. Devolve "" quando o nicho não tem pool,
 * para que o chamador só concatene e nada mude.
 */
export function blocoDoPool(nome: string, categoria?: string): string {
  const p = perfilDoPool(nome, categoria);
  if (!p) return "";
  const linhas: string[] = [];
  linhas.push(`POOL MEDIDO DO NICHO (${p.nicho}) — dado de sites reais, use como referência, nunca como molde:`);
  if (p.campeao) {
    linhas.push(`- enquadramento que funciona neste nicho: ${p.campeao.nome}`);
  }
  if (p.provaObrigatoria?.length) {
    linhas.push(`- esse enquadramento EXIGE prova: ${p.provaObrigatoria.join("; ")}`);
  }
  if (p.estruturaBase.length) {
    linhas.push(`- o que 70%+ do nicho já tem (não é diferencial): ${p.estruturaBase.join(", ")}`);
  }
  if (p.estruturaDiferenciador.length) {
    linhas.push(`- onde ainda dá para se diferenciar (15-70%): ${p.estruturaDiferenciador.join(", ")}`);
  }
  if (p.tipografia?.h1_mediana && p.tipografia?.razao) {
    linhas.push(`- proporção tipográfica medida: título ~${p.tipografia.razao}x o corpo (mediana do nicho: ${p.tipografia.h1_mediana}px de título com ${p.tipografia.corpo_mediana}px de corpo em 1440px)`);
  }
  if (p.listaNegra.length) {
    linhas.push(`- PROIBIDO neste nicho (clichê medido): ${p.listaNegra.join(" · ")}`);
  }
  if (p.regraDadoAusente) {
    linhas.push(`- dado ausente: ${p.regraDadoAusente}`);
  }
  return linhas.join("\n");
}

/** Exposto para teste e para o diagnóstico do painel. */
export function _resetCache(): void {
  cache = null;
  avisou = false;
}
