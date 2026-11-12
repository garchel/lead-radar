import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Calculator,
  CheckCircle2,
  Lightbulb,
  MessageCircle,
  Sparkles,
  TrendingUp,
  Wallet,
  Zap,
} from 'lucide-react';

/**
 * Estratégia & receita.
 *
 * Era uma página só de leitura ("metodologia + calculadora") e a calculadora usava
 * R$ 2.200 de projeto e R$ 90–190/mês de manutenção, contradizendo a política
 * comercial (R$ 899 / R$ 1.199 e bot de R$ 649 + R$ 150/mês). Aqui os números vêm
 * da política real e a simulação mostra as duas fontes de receita: site e bot.
 */

interface Pacote {
  id: string;
  name: string;
  price: number;
}

const FALLBACK_PACOTES: Pacote[] = [
  { id: 'essencial', name: 'Essencial', price: 899 },
  { id: 'profissional', name: 'Profissional', price: 1199 },
];

const ETAPAS = [
  {
    titulo: 'Achar quem tem dor, não quem tem perfil',
    detalhe:
      'Nota alta no Google com muitas avaliações e sem site próprio: demanda provada, canal digital faltando. É o filtro que a busca por cidade já aplica.',
    tag: 'Captura',
  },
  {
    titulo: 'Primeiro contato sem preço',
    detalhe:
      'Uma ideia por linha, prova real (nota e avaliações) e a prévia grátis como saída. Falar de pacote na primeira mensagem mata a conversa.',
    tag: 'Abordagem',
  },
  {
    titulo: 'Prévia primeiro, preço depois',
    detalhe:
      'Monta a primeira tela, manda, espera a reação. Só então o convite: "quer ver os pacotes?". Preço sem prévia é comparação de valor no escuro.',
    tag: 'Prova',
  },
  {
    titulo: 'Fechar e ficar no mês seguinte',
    detalhe:
      'Site é venda única; bot, manutenção e captação são mensalidade. A conta fecha com recorrência: R$ 150/mês de 10 clientes pagam um mês inteiro.',
    tag: 'Recorrência',
  },
];

const moeda = (valor: number) => `R$ ${Math.round(valor).toLocaleString('pt-BR')}`;

export const StrategyGuide: React.FC = () => {
  const [pacotes, setPacotes] = useState<Pacote[]>(FALLBACK_PACOTES);
  const [pacoteId, setPacoteId] = useState<string>(FALLBACK_PACOTES[0].id);

  const [propostasSemana, setPropostasSemana] = useState(10);
  const [conversao, setConversao] = useState(20);
  const [manutencao, setManutencao] = useState(59);
  const [botsMes, setBotsMes] = useState(2);
  const [botSetup, setBotSetup] = useState(649);
  const [botMensal, setBotMensal] = useState(150);

  // Preço real vem da política comercial (fonte única do app).
  useEffect(() => {
    let vivo = true;
    fetch('/api/agent/policy')
      .then((r) => r.json())
      .then((data) => {
        const lista: Pacote[] = (data?.policy?.packages || [])
          .map((p: any) => ({ id: String(p.id), name: String(p.name), price: Number(p.price) }))
          .filter((p: Pacote) => p.price > 0);
        if (vivo && lista.length) {
          setPacotes(lista);
          setPacoteId(lista[0].id);
        }
      })
      .catch(() => {
        /* mantém o fallback */
      });
    return () => {
      vivo = false;
    };
  }, []);

  const pacote = pacotes.find((p) => p.id === pacoteId) || pacotes[0] || FALLBACK_PACOTES[0];

  const conta = useMemo(() => {
    const propostasMes = propostasSemana * 4;
    const sitesMes = Math.round((propostasMes * conversao) / 100);
    const receitaSites = sitesMes * pacote.price;
    const receitaBots = botsMes * botSetup;
    const mrrNovo = sitesMes * manutencao + botsMes * botMensal;
    const mrrAno1 = mrrNovo * 12;
    const ano1 = receitaSites * 12 + receitaBots * 12 + mrrAno1;
    return { propostasMes, sitesMes, receitaSites, receitaBots, mrrNovo, mrrAno1, ano1 };
  }, [propostasSemana, conversao, pacote.price, manutencao, botsMes, botSetup, botMensal]);

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Wallet className="h-6 w-6 text-indigo-600" /> Estratégia &amp; receita
        </h1>
        <p className="max-w-3xl text-sm text-slate-600 mt-1">
          O método em quatro etapas e a conta que importa: quantas propostas viram site, quanto entra de mensalidade e
          como o ano fecha. Os preços vêm da política comercial, a mesma que o agente usa na conversa.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {ETAPAS.map((etapa, indice) => (
          <div key={etapa.titulo} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-xs font-bold text-white">
                {indice + 1}
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                {etapa.tag}
              </span>
            </div>
            <h2 className="text-sm font-bold text-slate-900">{etapa.titulo}</h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">{etapa.detalhe}</p>
          </div>
        ))}
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-indigo-100 bg-indigo-50 text-indigo-600">
              <Calculator className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base font-bold text-slate-900">Simulador de receita</h2>
              <p className="text-xs text-slate-500">
                Site (venda única) + mensalidade de manutenção + bot por mês.
              </p>
            </div>
          </div>
          <span className="flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800">
            <Sparkles className="h-3.5 w-3.5" /> preço da política: {moeda(pacote.price)}
          </span>
        </div>

        <div className="grid gap-6 lg:grid-cols-12">
          <div className="space-y-4 lg:col-span-6">
            <label className="block">
              <span className="mb-1 flex justify-between text-xs font-semibold text-slate-700">
                <span>Propostas por semana</span>
                <span className="text-indigo-700">{propostasSemana}</span>
              </span>
              <input
                type="range"
                min={2}
                max={40}
                value={propostasSemana}
                onChange={(e) => setPropostasSemana(Number(e.target.value))}
                className="h-2 w-full cursor-pointer accent-indigo-600"
              />
              <span className="mt-1 block text-[11px] text-slate-500">{conta.propostasMes} propostas no mês</span>
            </label>

            <label className="block">
              <span className="mb-1 flex justify-between text-xs font-semibold text-slate-700">
                <span>Taxa de conversão</span>
                <span className="text-indigo-700">{conversao}%</span>
              </span>
              <input
                type="range"
                min={5}
                max={60}
                step={5}
                value={conversao}
                onChange={(e) => setConversao(Number(e.target.value))}
                className="h-2 w-full cursor-pointer accent-indigo-600"
              />
              <span className="mt-1 block text-[11px] text-slate-500">
                {conta.sitesMes} site(s) fechado(s) por mês
              </span>
            </label>

            <div>
              <span className="mb-1 block text-xs font-semibold text-slate-700">Pacote do site</span>
              <div className="flex flex-wrap gap-2">
                {pacotes.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPacoteId(p.id)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                      p.id === pacote.id
                        ? 'border-indigo-300 bg-indigo-50 text-indigo-800'
                        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {p.name} · {moeda(p.price)}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Manutenção / mês
                </span>
                <input
                  type="number"
                  value={manutencao}
                  onChange={(e) => setManutencao(Number(e.target.value) || 0)}
                  className="w-full rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-2 text-sm font-semibold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Bots vendidos / mês
                </span>
                <input
                  type="number"
                  value={botsMes}
                  onChange={(e) => setBotsMes(Number(e.target.value) || 0)}
                  className="w-full rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-2 text-sm font-semibold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Bot: implantação
                </span>
                <input
                  type="number"
                  value={botSetup}
                  onChange={(e) => setBotSetup(Number(e.target.value) || 0)}
                  className="w-full rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-2 text-sm font-semibold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Bot: mensalidade
                </span>
                <input
                  type="number"
                  value={botMensal}
                  onChange={(e) => setBotMensal(Number(e.target.value) || 0)}
                  className="w-full rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-2 text-sm font-semibold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </label>
            </div>
          </div>

          <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 lg:col-span-6">
            <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Por mês, no cenário acima
            </span>
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <span className="text-xs text-slate-500">Venda de sites</span>
              <div className="text-2xl font-extrabold text-indigo-700">{moeda(conta.receitaSites)}</div>
              <span className="text-[11px] text-slate-500">
                {conta.sitesMes} × {moeda(pacote.price)} ({pacote.name})
              </span>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <span className="text-xs text-slate-500">Implantação de bots</span>
              <div className="text-2xl font-extrabold text-sky-700">{moeda(conta.receitaBots)}</div>
              <span className="text-[11px] text-slate-500">
                {botsMes} × {moeda(botSetup)}
              </span>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-800">
                <TrendingUp className="h-3.5 w-3.5" /> Mensalidade que passa a entrar
              </span>
              <div className="text-2xl font-extrabold text-emerald-700">+ {moeda(conta.mrrNovo)}/mês</div>
              <span className="text-[11px] text-emerald-800/80">
                {conta.sitesMes} × {moeda(manutencao)} + {botsMes} × {moeda(botMensal)}
              </span>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <span className="flex items-center gap-1.5 text-xs text-slate-500">
                <Wallet className="h-3.5 w-3.5" /> Ano 1 (repetindo esse mês)
              </span>
              <div className="text-xl font-bold text-slate-900">{moeda(conta.ano1)}</div>
              <span className="text-[11px] text-slate-500">
                sendo {moeda(conta.mrrAno1)} de recorrência acumulada
              </span>
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-start gap-2 rounded-lg border border-indigo-100 bg-indigo-50 p-3 text-xs text-indigo-900">
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" />
          <p>
            <strong>A conta que muda o jogo:</strong> site é dinheiro de uma vez, mensalidade é dinheiro todo mês. Com{' '}
            {botsMes} bot(s) por mês, em um ano a recorrência já passa de {moeda(conta.mrrAno1)} sem precisar prospectar
            de novo. É por isso que a oferta do bot vem depois do site, na mesma conversa.
          </p>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        {[
          {
            titulo: 'O que dizer no primeiro contato',
            texto: 'Nota e avaliações do Google, a falta do site e a prévia grátis. Nenhum preço.',
            icone: MessageCircle,
          },
          {
            titulo: 'Quando falar de valor',
            texto: 'Depois da prévia: "quer ver os pacotes?". Aí nome, valor e o que inclui.',
            icone: CheckCircle2,
          },
          {
            titulo: 'O que oferecer depois',
            texto: 'Bot de WhatsApp com a base do cliente, manutenção e captação. É a recorrência.',
            icone: Zap,
          },
        ].map((bloco) => (
          <div key={bloco.titulo} className="rounded-xl border border-slate-200 bg-white p-4">
            <bloco.icone className="mb-2 h-4 w-4 text-indigo-600" />
            <h2 className="text-sm font-semibold text-slate-900">{bloco.titulo}</h2>
            <p className="mt-1 text-xs text-slate-600">{bloco.texto}</p>
          </div>
        ))}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-xs text-slate-600">
          Os mesmos números dos pacotes estão em <strong className="text-slate-800">docs/PACOTES.md</strong> e no bot
          que responde no WhatsApp.
        </p>
        <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
          ajuste em Automação <ArrowRight className="h-3.5 w-3.5" /> Canais &amp; APIs
        </span>
      </div>
    </div>
  );
};

export default StrategyGuide;
