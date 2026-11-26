import React, { useEffect, useMemo, useState } from 'react';
import {
  BookOpen, Ruler, MessageSquareQuote, AlertTriangle, Search, Layers, Type,
  Copy, Check, Ban, Loader2, Users, Compass, Quote, ArrowRight,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Catálogo de nichos — leitura do que foi MEDIDO em sites reais.     */
/*  Não é template: cada bloco diz de onde veio o número.              */
/* ------------------------------------------------------------------ */

interface FonteTipografica { nome: string; ocorrencias: number }

interface Enquadramento {
  id: string;
  nome: string;
  ocorrencias: number;
  de: number;
  pergunta: string | null;
  prova: string[];
  porque: string | null;
}

interface NichoCatalogo {
  id: string;
  titulo: string;
  amostra: { paginas: number | null; fonte: string | null; coletadoEm: string | null };
  leads: number;
  estrutura: { base: string[]; diferenciador: string[] };
  campeao: { id: string; nome: string; ocorrencias: number | null; de: number | null } | null;
  provaObrigatoria: string[];
  tipografia: {
    h1Mediana: number | null; h1P25: number | null; h1P75: number | null;
    corpoMediana: number | null; razao: number | null; n: number | null;
    semH1: { n: number; de: number; pct: number } | null;
    fontes: FonteTipografica[]; aviso: string | null;
  } | null;
  voz: {
    lidos: number | null; uteis: number | null;
    enquadramentos: Enquadramento[];
    ausentes: Array<{ nome: string; ocorrencias: number | null; leitura: string | null }>;
    testeDeTroca: string | null;
    regraDadoAusente: string | null;
  } | null;
  listaNegra: string[];
  regras: string[];
  limites: string[];
  bloco: string;
}

interface Catalogo {
  ok: boolean;
  geradoEm: string | null;
  comoUsar: Record<string, string>;
  nichos: NichoCatalogo[];
  cobertura: { nichos: number; leadsNoPool: number; leadsTotal: number };
  aviso?: string;
}

const rotulo = (s: string) => s.replace(/_/g, ' ');

function Barra({ valor, total }: { valor: number; total: number }) {
  const pct = total > 0 ? Math.round((valor / total) * 100) : 0;
  return (
    <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
      <div className="h-full rounded-full bg-indigo-500" style={{ width: `${Math.max(pct, 2)}%` }} />
    </div>
  );
}

function Secao({ icone, titulo, nota, children }: { icone: React.ReactNode; titulo: string; nota?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <header className="flex items-start gap-2 border-b border-slate-100 px-4 py-3">
        <span className="mt-0.5 text-indigo-600">{icone}</span>
        <div>
          <h3 className="text-sm font-bold text-slate-900">{titulo}</h3>
          {nota && <p className="mt-0.5 text-xs text-slate-500">{nota}</p>}
        </div>
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function NicheCatalogPage() {
  const [catalogo, setCatalogo] = useState<Catalogo | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    let vivo = true;
    fetch('/api/nichos')
      .then((r) => r.json())
      .then((j) => {
        if (!vivo) return;
        if (!j?.success) throw new Error(j?.error || 'Falha ao carregar o catálogo.');
        setCatalogo(j.catalogo as Catalogo);
        setSelecionado(j.catalogo?.nichos?.[0]?.id ?? null);
      })
      .catch((e) => vivo && setErro(e instanceof Error ? e.message : String(e)))
      .finally(() => vivo && setCarregando(false));
    return () => { vivo = false; };
  }, []);

  const nichos = catalogo?.nichos ?? [];

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return nichos;
    return nichos.filter((n) => {
      const alvo = [
        n.titulo, n.id,
        n.campeao?.nome ?? '',
        ...n.estrutura.base, ...n.estrutura.diferenciador,
        ...n.tipografia?.fontes.map((f) => f.nome) ?? [],
        ...n.listaNegra,
      ].join(' ').toLowerCase();
      return alvo.includes(q);
    });
  }, [nichos, busca]);

  const nicho = nichos.find((n) => n.id === selecionado) ?? filtrados[0] ?? null;

  const sitesAnalisados = nichos.reduce((soma, n) => soma + (n.amostra.paginas ?? 0), 0);
  const maiorNicho = [...nichos].sort((a, b) => b.leads - a.leads)[0];
  const coberturaPct = catalogo?.cobertura.leadsTotal
    ? Math.round((catalogo.cobertura.leadsNoPool / catalogo.cobertura.leadsTotal) * 100)
    : 0;

  async function copiarBriefing() {
    if (!nicho) return;
    try {
      await navigator.clipboard.writeText(nicho.bloco);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2200);
    } catch {
      setCopiado(false);
    }
  }

  if (carregando) {
    return (
      <div className="flex items-center gap-2 px-6 py-10 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Lendo o catálogo de nichos…
      </div>
    );
  }

  if (erro || !catalogo?.ok) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div>
            <p className="font-bold">O catálogo não carregou.</p>
            <p className="mt-1">{erro || catalogo?.aviso}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-5">
      {/* Cabeçalho */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <Compass className="h-6 w-6 text-indigo-600" /> Catálogo de Nichos
            <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">
              medido, não inventado
            </span>
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            O que os sites reais de cada nicho fazem, medido em três camadas: <strong>estrutura</strong> (o que a página tem),
            <strong> sistema visual</strong> (tamanho, proporção, tipografia) e <strong>voz</strong> (por onde a abertura começa e que prova ela exige).
            Serve para a página gerada ser específica — nunca para virar molde.
          </p>
        </div>
        <div className="text-xs text-slate-500">
          {catalogo.geradoEm && <div>Índice gerado em {new Date(catalogo.geradoEm).toLocaleDateString('pt-BR')}</div>}
          <div>{sitesAnalisados.toLocaleString('pt-BR')} sites analisados · {nichos.length} nichos</div>
        </div>
      </div>

      {/* Números de topo */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { icone: <Layers className="h-4 w-4" />, rotulo: 'Nichos no catálogo', valor: String(nichos.length), nota: 'com pool medido e barreira ativa' },
          { icone: <Users className="h-4 w-4" />, rotulo: 'Leads cobertos', valor: `${catalogo.cobertura.leadsNoPool}`, nota: `${coberturaPct}% da base de ${catalogo.cobertura.leadsTotal} leads` },
          { icone: <Ruler className="h-4 w-4" />, rotulo: 'Sites medidos', valor: String(sitesAnalisados), nota: 'páginas reais, contadas por componente' },
          { icone: <Compass className="h-4 w-4" />, rotulo: 'Maior mercado', valor: maiorNicho?.titulo ?? '—', nota: maiorNicho ? `${maiorNicho.leads} leads no banco` : '' },
        ].map((k) => (
          <div key={k.rotulo} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <span className="text-indigo-600">{k.icone}</span>{k.rotulo}
            </div>
            <div className="mt-2 text-2xl font-bold text-slate-900">{k.valor}</div>
            <div className="text-xs text-slate-500">{k.nota}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        {/* Lista de nichos */}
        <div className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar nicho, componente, clichê…"
              className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
          </div>

          <div className="flex gap-2 overflow-x-auto pb-2 lg:block lg:space-y-2 lg:overflow-visible lg:pb-0">
            {filtrados.map((n) => {
              const ativo = nicho?.id === n.id;
              return (
                <button
                  key={n.id}
                  onClick={() => setSelecionado(n.id)}
                  className={`min-w-[220px] shrink-0 rounded-xl border p-3 text-left transition lg:w-full lg:min-w-0 lg:shrink ${
                    ativo ? 'border-indigo-300 bg-indigo-50/70 ring-1 ring-indigo-200' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-slate-900">{n.titulo}</span>
                    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-700">
                      {n.leads} leads
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-700">
                    <Quote className="h-3 w-3 shrink-0 text-indigo-500" />
                    <span className="truncate">{n.campeao?.nome ?? 'voz não catalogada'}</span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-3 text-[11px] font-medium text-slate-600">
                    <span>{n.amostra.paginas ?? '—'} sites</span>
                    {n.tipografia?.h1Mediana ? <span>h1 {n.tipografia.h1Mediana}px</span> : null}
                    {n.tipografia?.razao ? <span>razão {n.tipografia.razao}</span> : null}
                  </div>
                </button>
              );
            })}
            {filtrados.length === 0 && (
              <p className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-xs text-slate-500">
                Nenhum nicho com “{busca}”.
              </p>
            )}
          </div>
        </div>

        {/* Detalhe */}
        {nicho ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">{nicho.titulo}</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Amostra: {nicho.amostra.paginas ?? '—'} páginas
                    {nicho.amostra.fonte ? ` · ${nicho.amostra.fonte}` : ''}
                    {nicho.amostra.coletadoEm ? ` · ${new Date(nicho.amostra.coletadoEm).toLocaleDateString('pt-BR')}` : ''}
                  </p>
                </div>
                <button
                  onClick={copiarBriefing}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700"
                  title="Copia o bloco que o gerador recebe para este nicho"
                >
                  {copiado ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                  {copiado ? 'Briefing copiado' : 'Copiar briefing do gerador'}
                </button>
              </div>

              {/* Voz campeã */}
              {nicho.campeao ? (
                <div className="mt-4 rounded-lg border border-indigo-200 bg-indigo-50/60 p-4">
                  <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-indigo-700">
                    <Quote className="h-3.5 w-3.5" /> A abertura que funciona aqui
                  </div>
                  <div className="mt-1 text-lg font-bold text-slate-900">{nicho.campeao.nome}</div>
                  {nicho.campeao.ocorrencias != null && nicho.campeao.de ? (
                    <>
                      <div className="mt-2 max-w-sm">
                        <Barra valor={nicho.campeao.ocorrencias} total={nicho.campeao.de} />
                      </div>
                      <div className="mt-1 text-xs text-slate-600">
                        {nicho.campeao.ocorrencias} de {nicho.campeao.de} aberturas lidas
                      </div>
                    </>
                  ) : null}
                  {nicho.provaObrigatoria.length > 0 && (
                    <div className="mt-3">
                      <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Sem esta prova, não use esse enquadramento</div>
                      <ul className="mt-1 space-y-1">
                        {nicho.provaObrigatoria.map((p) => (
                          <li key={p} className="flex items-start gap-1.5 text-xs text-slate-700">
                            <ArrowRight className="mt-0.5 h-3 w-3 shrink-0 text-indigo-500" /> {p}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <p className="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">Voz ainda não catalogada para este nicho.</p>
              )}
            </div>

            {/* Estrutura */}
            <Secao
              icone={<Layers className="h-4 w-4" />}
              titulo="Estrutura da página"
              nota="Separado pelo que é obrigação e pelo que ainda diferencia."
            >
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <div className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
                    Todo mundo já tem · 70%+
                  </div>
                  <p className="mb-2 text-[11px] text-slate-500">Usar só quando fizer sentido. Como diferencial, não vale nada.</p>
                  <div className="flex flex-wrap gap-1.5">
                    {nicho.estrutura.base.map((c) => (
                      <span key={c} className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700">{rotulo(c)}</span>
                    ))}
                    {nicho.estrutura.base.length === 0 && <span className="text-xs text-slate-400">—</span>}
                  </div>
                </div>
                <div>
                  <div className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-indigo-700">
                    Onde dá para se diferenciar · 15–70%
                  </div>
                  <p className="mb-2 text-[11px] text-slate-500">É aqui que a página ganha especificidade.</p>
                  <div className="flex flex-wrap gap-1.5">
                    {nicho.estrutura.diferenciador.map((c) => (
                      <span key={c} className="rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1 text-xs text-indigo-800">{rotulo(c)}</span>
                    ))}
                    {nicho.estrutura.diferenciador.length === 0 && <span className="text-xs text-slate-400">—</span>}
                  </div>
                </div>
              </div>
            </Secao>

            {/* Sistema visual */}
            <Secao
              icone={<Type className="h-4 w-4" />}
              titulo="Sistema visual medido"
              nota="Faixa medida em 1440px. Respeitar a proporção, nunca copiar o valor exato."
            >
              {nicho.tipografia ? (
                <div className="space-y-4">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <div
                      className="font-bold leading-tight text-slate-900"
                      style={{ fontSize: `${Math.min(nicho.tipografia.h1Mediana ?? 48, 64)}px` }}
                    >
                      {nicho.campeao?.nome ?? nicho.titulo}
                    </div>
                    <div className="mt-2 text-slate-600" style={{ fontSize: `${nicho.tipografia.corpoMediana ?? 16}px` }}>
                      Corpo do texto neste tamanho — é esta relação que o olho lê como “bem composto”.
                    </div>
                    <div className="mt-3 text-[11px] text-slate-500">
                      título {nicho.tipografia.h1Mediana ?? '—'}px · corpo {nicho.tipografia.corpoMediana ?? '—'}px ·
                      {' '}razão {nicho.tipografia.razao ?? '—'}×
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    {[
                      { r: 'Título (h1)', v: nicho.tipografia.h1Mediana, s: `p25 ${nicho.tipografia.h1P25 ?? '—'} · p75 ${nicho.tipografia.h1P75 ?? '—'}` },
                      { r: 'Corpo', v: nicho.tipografia.corpoMediana, s: 'mediana do nicho' },
                      { r: 'Razão título/corpo', v: nicho.tipografia.razao, s: 'proporção entre os dois' },
                    ].map((m) => (
                      <div key={m.r} className="rounded-lg border border-slate-200 p-3">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{m.r}</div>
                        <div className="text-lg font-bold text-slate-900">{m.v ?? '—'}</div>
                        <div className="text-[11px] text-slate-500">{m.s}</div>
                      </div>
                    ))}
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <div className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">Famílias observadas</div>
                      <div className="flex flex-wrap gap-1.5">
                        {nicho.tipografia.fontes.map((f) => (
                          <span key={f.nome} className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700">
                            {f.nome} <span className="text-slate-400">×{f.ocorrencias}</span>
                          </span>
                        ))}
                        {nicho.tipografia.fontes.length === 0 && <span className="text-xs text-slate-400">—</span>}
                      </div>
                    </div>
                    <div>
                      <div className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">Defeito frequente</div>
                      {nicho.tipografia.semH1 ? (
                        <p className="text-xs text-slate-700">
                          <strong>{nicho.tipografia.semH1.pct}%</strong> dos sites não têm <code className="rounded bg-slate-100 px-1">h1</code>{' '}
                          ({nicho.tipografia.semH1.n} de {nicho.tipografia.semH1.de}). Isso é defeito, não estilo.
                        </p>
                      ) : (
                        <p className="text-xs text-slate-400">não medido</p>
                      )}
                    </div>
                  </div>

                  {nicho.tipografia.aviso && (
                    <p className="text-[11px] text-slate-500">Ressalva da medição: {nicho.tipografia.aviso}</p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-slate-500">Sistema visual ainda não medido para este nicho.</p>
              )}
            </Secao>

            {/* Voz */}
            {nicho.voz && nicho.voz.enquadramentos.length > 0 && (
              <Secao
                icone={<MessageSquareQuote className="h-4 w-4" />}
                titulo="Voz: por onde a abertura começa"
                nota={`${nicho.voz.uteis ?? '—'} de ${nicho.voz.lidos ?? '—'} títulos lidos. O que se cataloga é a escolha, não a frase.`}
              >
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500">
                        <th className="py-2 pr-3 font-semibold">Enquadramento</th>
                        <th className="py-2 pr-3 font-semibold">Pergunta que responde</th>
                        <th className="py-2 pr-3 font-semibold whitespace-nowrap">Ocorrências</th>
                        <th className="py-2 font-semibold">Prova que exige</th>
                      </tr>
                    </thead>
                    <tbody>
                      {nicho.voz.enquadramentos.map((e) => (
                        <tr key={e.id} className="border-b border-slate-100 align-top">
                          <td className="py-2 pr-3 font-semibold text-slate-900">
                            {e.nome}
                            {nicho.campeao?.id === e.id && (
                              <span className="ml-1.5 rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-indigo-700">campeão</span>
                            )}
                          </td>
                          <td className="py-2 pr-3 text-slate-600">{e.pergunta ?? '—'}</td>
                          <td className="py-2 pr-3">
                            <div className="w-24">
                              <Barra valor={e.ocorrencias} total={e.de} />
                            </div>
                            <div className="mt-0.5 text-[11px] text-slate-500">{e.ocorrencias}/{e.de}</div>
                          </td>
                          <td className="py-2 text-slate-600">
                            {e.prova.length ? (
                              <ul className="space-y-0.5">
                                {e.prova.map((p) => <li key={p}>· {p}</li>)}
                              </ul>
                            ) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {nicho.voz.regraDadoAusente && (
                  <div className="mt-3 flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                    <BookOpen className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" />
                    <span><strong className="text-slate-900">Dado ausente:</strong> {nicho.voz.regraDadoAusente}</span>
                  </div>
                )}
                {nicho.voz.testeDeTroca && (
                  <div className="mt-2 flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                    <span><strong className="text-slate-900">Teste de troca:</strong> {nicho.voz.testeDeTroca}</span>
                  </div>
                )}
              </Secao>
            )}

            {/* Lista negra */}
            <Secao
              icone={<Ban className="h-4 w-4" />}
              titulo="Clichês proibidos neste nicho"
              nota="Reprovar de imediato: já foi dito por todo mundo."
            >
              <div className="flex flex-wrap gap-1.5">
                {nicho.listaNegra.map((t) => (
                  <span key={t} className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-800">✕ {t}</span>
                ))}
                {nicho.listaNegra.length === 0 && <span className="text-xs text-slate-400">—</span>}
              </div>
            </Secao>

            {/* Regras e limites */}
            {(nicho.regras.length > 0 || nicho.limites.length > 0) && (
              <Secao
                icone={<AlertTriangle className="h-4 w-4" />}
                titulo="Regras que saem da medição — e o limite da amostra"
                nota="Ler o limite é parte de usar o dado."
              >
                {nicho.regras.length > 0 && (
                  <ul className="space-y-1.5">
                    {nicho.regras.map((r) => (
                      <li key={r} className="flex items-start gap-1.5 text-xs text-slate-700">
                        <ArrowRight className="mt-0.5 h-3 w-3 shrink-0 text-indigo-500" /> {r}
                      </li>
                    ))}
                  </ul>
                )}
                {nicho.limites.length > 0 && (
                  <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <div className="text-[11px] font-bold uppercase tracking-wide text-amber-800">Limites desta amostra</div>
                    <ul className="mt-1 space-y-0.5 text-xs text-amber-900">
                      {nicho.limites.map((l) => <li key={l}>· {l}</li>)}
                    </ul>
                  </div>
                )}
              </Secao>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">
            Escolha um nicho à esquerda.
          </div>
        )}
      </div>
    </div>
  );
}

export default NicheCatalogPage;
