/**
 * Monta a visão do catálogo de nichos para a tela /nichos.
 *
 * Fonte da verdade continua sendo server/data/pools: aqui só se JUNTA o índice
 * (que já normaliza os três formatos que divergiram ao longo da pesquisa) com os
 * arquivos de sistema visual e voz de cada nicho, e com a contagem real de leads
 * do banco. Nada é recalculado nem reescrito — se o índice mudar, a tela muda.
 */
import fs from "node:fs";
import path from "node:path";
import { getDb } from "../store/schema";
import { classificarNicho, resolverPoolsDir } from "./nichoPoolService";

export interface FonteTipografica {
  nome: string;
  ocorrencias: number;
}

export interface EnquadramentoDeVoz {
  id: string;
  nome: string;
  ocorrencias: number;
  de: number;
  pergunta: string | null;
  prova: string[];
  porque: string | null;
}

export interface NichoCatalogo {
  id: string;
  titulo: string;
  amostra: { paginas: number | null; fonte: string | null; coletadoEm: string | null };
  /** Leads do banco cuja categoria/nome caem neste nicho. */
  leads: number;
  estrutura: { base: string[]; diferenciador: string[] };
  campeao: { id: string; nome: string; ocorrencias: number | null; de: number | null } | null;
  provaObrigatoria: string[];
  tipografia: {
    h1Mediana: number | null;
    h1P25: number | null;
    h1P75: number | null;
    corpoMediana: number | null;
    razao: number | null;
    n: number | null;
    semH1: { n: number; de: number; pct: number } | null;
    fontes: FonteTipografica[];
    aviso: string | null;
  } | null;
  voz: {
    lidos: number | null;
    uteis: number | null;
    enquadramentos: EnquadramentoDeVoz[];
    ausentes: Array<{ nome: string; ocorrencias: number | null; leitura: string | null }>;
    testeDeTroca: string | null;
    regraDadoAusente: string | null;
  } | null;
  listaNegra: string[];
  regras: string[];
  limites: string[];
  /** Texto que o gerador recebe hoje quando o nicho tem pool. */
  bloco: string;
}

export interface CatalogoDeNichos {
  ok: boolean;
  geradoEm: string | null;
  comoUsar: Record<string, string>;
  nichos: NichoCatalogo[];
  cobertura: { nichos: number; leadsNoPool: number; leadsTotal: number };
  aviso?: string;
}

const TITULOS: Record<string, string> = {
  advocacia: "Advocacia",
  barbearia: "Barbearia",
  estetica: "Estética",
  fisioterapia: "Fisioterapia",
  odontologia: "Odontologia",
  oficina: "Oficina mecânica",
  otica: "Ótica",
  pilates: "Pilates",
  psicologia: "Psicologia",
  veterinaria: "Veterinária",
};

/** Ordem de leitura da tela: os nichos com mais leads primeiro. */
const ORDEM = [
  "odontologia", "barbearia", "otica", "psicologia", "pilates",
  "fisioterapia", "oficina", "estetica", "veterinaria", "advocacia",
];

function lerJson<T>(dir: string, arquivo: string): T | null {
  try {
    const p = path.join(dir, arquivo);
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf8")) as T;
  } catch {
    return null;
  }
}

let cacheLeads: { em: number; mapa: Record<string, number>; total: number } | null = null;

function contarLeads(): { mapa: Record<string, number>; total: number } {
  const agora = Date.now();
  if (cacheLeads && agora - cacheLeads.em < 30_000) return { mapa: cacheLeads.mapa, total: cacheLeads.total };
  const mapa: Record<string, number> = {};
  let total = 0;
  try {
    const linhas = getDb().prepare("select name, category from leads").all() as Array<{ name: string | null; category: string | null }>;
    total = linhas.length;
    for (const l of linhas) {
      const nicho = classificarNicho(l.name || "", l.category || "");
      if (nicho) mapa[nicho] = (mapa[nicho] || 0) + 1;
    }
  } catch {
    /* banco indisponível: a tela mostra zero em vez de quebrar */
  }
  cacheLeads = { em: agora, mapa, total };
  return { mapa, total };
}

function fontesDe(sv: any): FonteTipografica[] {
  const bruto = sv?.tipografia?.familias_de_display_observadas;
  if (!bruto || typeof bruto !== "object") return [];
  return Object.entries(bruto as Record<string, number>)
    .filter(([nome]) => !/^(sans-serif|serif|monospace)$/i.test(nome))
    .map(([nome, ocorrencias]) => ({ nome, ocorrencias: Number(ocorrencias) || 0 }))
    .sort((a, b) => b.ocorrencias - a.ocorrencias)
    .slice(0, 6);
}

function textoDoBloco(n: NichoCatalogo): string {
  const linhas: string[] = [];
  linhas.push(`POOL MEDIDO DO NICHO (${n.id}) — dado de sites reais, use como referência, nunca como molde:`);
  if (n.campeao) linhas.push(`- enquadramento que funciona neste nicho: ${n.campeao.nome}`);
  if (n.provaObrigatoria.length) linhas.push(`- esse enquadramento EXIGE prova: ${n.provaObrigatoria.join("; ")}`);
  if (n.estrutura.base.length) linhas.push(`- o que 70%+ do nicho já tem (não é diferencial): ${n.estrutura.base.join(", ")}`);
  if (n.estrutura.diferenciador.length) linhas.push(`- onde ainda dá para se diferenciar (15-70%): ${n.estrutura.diferenciador.join(", ")}`);
  if (n.tipografia?.h1Mediana && n.tipografia?.razao) {
    linhas.push(`- proporção tipográfica medida: título ~${n.tipografia.razao}x o corpo (mediana do nicho: ${n.tipografia.h1Mediana}px de título com ${n.tipografia.corpoMediana}px de corpo em 1440px)`);
  }
  if (n.listaNegra.length) linhas.push(`- PROIBIDO neste nicho (clichê medido): ${n.listaNegra.join(" · ")}`);
  if (n.voz?.regraDadoAusente) linhas.push(`- dado ausente: ${n.voz.regraDadoAusente}`);
  return linhas.join("\n");
}

export function montarCatalogoDeNichos(): CatalogoDeNichos {
  const dir = resolverPoolsDir();
  if (!dir) {
    return {
      ok: false,
      geradoEm: null,
      comoUsar: {},
      nichos: [],
      cobertura: { nichos: 0, leadsNoPool: 0, leadsTotal: 0 },
      aviso: "Índice de nichos não encontrado: rode node tools/indice-pools.mjs para gerar server/data/pools/_indice-nichos.json.",
    };
  }

  const indice = lerJson<any>(dir, "_indice-nichos.json");
  const fundamento = indice?.nichos || {};
  const { mapa: leadsPorNicho, total: leadsTotal } = contarLeads();

  const ids = ORDEM.filter((id) => fundamento[id]).concat(
    Object.keys(fundamento).filter((id) => !ORDEM.includes(id)),
  );

  const nichos: NichoCatalogo[] = ids.map((id) => {
    const base = fundamento[id] || {};
    const sv = lerJson<any>(dir, `${id}-sistema-visual.json`);
    const voz = lerJson<any>(dir, `${id}-voz.json`);

    const tipografia = {
      h1Mediana: base.tipografia?.h1_mediana ?? sv?.tipografia?.h1_px?.mediana ?? null,
      h1P25: sv?.tipografia?.h1_px?.p25 ?? null,
      h1P75: sv?.tipografia?.h1_px?.p75 ?? null,
      corpoMediana: base.tipografia?.corpo_mediana ?? sv?.tipografia?.corpo_px?.mediana ?? null,
      razao: base.tipografia?.razao ?? sv?.tipografia?.razao_h1_corpo_mediana ?? null,
      n: base.tipografia?.n ?? sv?.amostra ?? null,
      semH1: sv?.defeito_frequente
        ? { n: sv.defeito_frequente.sem_h1, de: sv.defeito_frequente.de, pct: sv.defeito_frequente.pct }
        : null,
      fontes: fontesDe(sv),
      aviso: base.tipografia?.aviso ?? null,
    };

    const enquadramentos: EnquadramentoDeVoz[] = (voz?.enquadramentos || []).map((e: any) => ({
      id: e.id,
      nome: e.nome,
      ocorrencias: e.ocorrencias ?? 0,
      de: e.de ?? voz?.n_util ?? 0,
      pergunta: e.pergunta_que_responde ?? null,
      prova: e.prova_obrigatoria || [],
      porque: e.porque_funciona ?? null,
    }));

    const nicho: NichoCatalogo = {
      id,
      titulo: TITULOS[id] || base.titulo || id,
      amostra: {
        paginas: base.amostra?.paginas ?? sv?.amostra ?? null,
        fonte: base.amostra?.fonte ?? null,
        coletadoEm: base.amostra?.coletado_em ?? sv?.medido_em ?? null,
      },
      leads: leadsPorNicho[id] || 0,
      estrutura: {
        base: base.estrutura_base || [],
        diferenciador: base.estrutura_diferenciador || [],
      },
      campeao: base.enquadramento_campeao || null,
      provaObrigatoria: base.prova_obrigatoria_do_campeao || [],
      tipografia,
      voz: voz
        ? {
            lidos: voz.n_lido ?? null,
            uteis: voz.n_util ?? null,
            enquadramentos,
            ausentes: (voz.ausentes_ou_raros || []).map((a: any) => ({
              nome: a.enquadramento ?? a.id ?? "",
              ocorrencias: a.ocorrencias ?? null,
              leitura: a.leitura ?? null,
            })),
            testeDeTroca: voz.teste_de_troca?.regra ?? voz.teste_de_troca ?? null,
            regraDadoAusente: voz.regra_de_dado_ausente ?? base.regra_dado_ausente ?? null,
          }
        : null,
      listaNegra: voz?.lista_negra?.length ? voz.lista_negra : (base.lista_negra || []),
      regras: sv?.regras_que_saem_da_medicao || [],
      limites: base.limites || voz?.limites || [],
      bloco: "",
    };
    nicho.bloco = textoDoBloco(nicho);
    return nicho;
  });

  const leadsNoPool = Object.values(leadsPorNicho).reduce((a, b) => a + b, 0);

  return {
    ok: true,
    geradoEm: indice?.gerado_em ?? null,
    comoUsar: indice?.como_usar || {},
    nichos,
    cobertura: { nichos: nichos.length, leadsNoPool, leadsTotal },
  };
}
