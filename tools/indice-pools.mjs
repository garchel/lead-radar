/**
 * Consolida os pools de nicho em um índice único, consumível pelo gerador.
 *
 * Por que existe: cada nicho foi escrito à mão e os três formatos de arquivo
 * divergiram (presenca_pct vs referencia_pct; todos vs tipografia vs loja_fisica).
 * Sem normalizar, o gerador lê null e simplesmente ignora o catálogo.
 */
import fs from "node:fs";
import path from "node:path";

const dir = process.argv[2] || "server/data/pools";
const arquivos = fs.readdirSync(dir);

const ler = (nome) => {
  const p = path.join(dir, nome);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null;
};
const pct = (c) => c.presenca_pct ?? c.referencia_pct ?? 0;
const mediana = (v) => {
  const s = [...v].sort((a, b) => a - b);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round(((s[m - 1] + s[m]) / 2) * 10) / 10;
};

// nichos descobertos pelos arquivos de voz (todo nicho catalogado tem um)
const nichos = [...new Set(arquivos
  .filter((f) => f.endsWith("-voz.json"))
  .map((f) => f.replace("-voz.json", "")))].sort();

function tipografia(nicho) {
  const sv = ler(`${nicho}-sistema-visual.json`);
  if (sv?.todos) {
    const t = sv.todos;
    return { h1_mediana: t.h1_mediana ?? t.h1, h1_p25: t.h1_p25 ?? t.p25, h1_p75: t.h1_p75 ?? t.p75,
      corpo_mediana: t.corpo_mediana ?? t.corpo, razao: t.razao_h1_corpo ?? t.razao, n: t.n,
      brasil: sv.brasil || null };
  }
  if (sv?.tipografia) {
    const t = sv.tipografia;
    return { h1_mediana: t.h1_px?.mediana, h1_p25: t.h1_px?.p25, h1_p75: t.h1_px?.p75,
      corpo_mediana: t.corpo_px?.mediana, razao: t.razao_h1_corpo_mediana, n: sv.amostra };
  }
  if (sv?.loja_fisica) {
    const t = sv.loja_fisica; const b = sv.brasil_loja_fisica || {};
    return { h1_mediana: b.h1_mediana ?? t.h1_mediana, h1_p25: b.h1_p25 ?? t.h1_p25,
      h1_p75: b.h1_p75 ?? t.h1_p75, corpo_mediana: t.corpo_mediana,
      razao: t.razao ?? t.razao_h1_corpo, n: t.n, aviso: "amostra bimodal (loja física x e-commerce)" };
  }
  // odontologia: sem medição em lote, calcula das fichas de anatomia
  const an = ler(`${nicho}-anatomia.json`);
  if (an?.fichas?.length) {
    const h = an.fichas.map((f) => f.sistema_visual?.h1_px).filter(Boolean);
    const c = an.fichas.map((f) => f.sistema_visual?.corpo_px).filter(Boolean);
    const r = an.fichas.map((f) => f.sistema_visual?.razao_h1_corpo).filter(Boolean);
    return { h1_mediana: mediana(h), corpo_mediana: mediana(c), razao: mediana(r), n: h.length,
      aviso: "calculado das fichas de anatomia, não de medição em lote" };
  }
  return null;
}

const indice = {
  gerado_em: new Date().toISOString().slice(0, 10),
  versao: 2,
  como_usar: {
    estrutura_base: "aparece em 70%+ do nicho: usar só quando fizer sentido, nunca como diferencial",
    estrutura_diferenciador: "15-70%: é onde a página ganha especificidade",
    enquadramento_campeao: "o que a abertura boa faz no nicho; a prova obrigatória está no arquivo de voz",
    tipografia: "faixa medida; respeitar a proporção, nunca copiar o valor exato",
    lista_negra: "reprovar de imediato e aplicar o teste de troca",
  },
  nichos: {},
};

for (const n of nichos) {
  const e = ler(`${n}-estrutura.json`) || ler(`${n}.json`) || {};
  const v = ler(`${n}-voz.json`) || {};
  const comps = e.componentes || [];
  const enq = v.enquadramentos || [];
  const campeao = enq.length ? enq.reduce((a, b) => ((b.ocorrencias || 0) > (a.ocorrencias || 0) ? b : a)) : null;
  indice.nichos[n] = {
    amostra: e.amostra || null,
    estrutura_base: comps.filter((c) => pct(c) >= 70).map((c) => c.componente),
    estrutura_diferenciador: comps.filter((c) => pct(c) >= 15 && pct(c) < 70).map((c) => c.componente).slice(0, 8),
    enquadramento_campeao: campeao ? { id: campeao.id, nome: campeao.nome, ocorrencias: campeao.ocorrencias, de: campeao.de } : null,
    prova_obrigatoria_do_campeao: campeao?.prova_obrigatoria || null,
    tipografia: tipografia(n),
    lista_negra: v.lista_negra || [],
    regra_dado_ausente: v.regra_de_dado_ausente || null,
    limites: [...(v.limites || []), ...(e.aviso_amostra ? [e.aviso_amostra] : [])],
  };
}

const saida = path.join(dir, "_indice-nichos.json");
fs.writeFileSync(saida, JSON.stringify(indice, null, 2));
console.log(`índice com ${nichos.length} nichos: ${nichos.join(", ")}`);
for (const [n, d] of Object.entries(indice.nichos)) {
  const t = d.tipografia || {};
  console.log(`  ${n.padEnd(14)} base ${String(d.estrutura_base.length).padStart(2)} · dif ${String(d.estrutura_diferenciador.length).padStart(2)} · ${(d.enquadramento_campeao?.nome || "-").padEnd(32)} h1 ${t.h1_mediana} · corpo ${t.corpo_mediana} · razão ${t.razao}`);
}
