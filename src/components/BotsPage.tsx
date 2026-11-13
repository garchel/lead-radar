import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  Gauge,
  Bot,
  Check,
  ChevronDown,
  Loader2,
  MessageCircle,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  Trash2,
  Wallet,
} from "lucide-react";

/**
 * Bot de WhatsApp vendido ao cliente (R$ 649 + R$ 150/mês).
 *
 * A tela existe para a implantação ser operável: cadastrar cliente, colar a base
 * que ele mandou, testar perguntas antes de conectar e ver o que o bot não soube
 * responder (é daí que sai a melhoria do mês seguinte).
 */

interface BotClient {
  id: string;
  name: string;
  ownerPhone?: string;
  instance?: string;
  setupPrice: number;
  monthlyPrice: number;
  status: "active" | "paused";
  minScore: number;
  notes?: string;
  paused?: boolean;
  botPausedUntil?: string;
  botPausedReason?: string;
  knowledge?: { docs: number; chunks: number };
  stats?: { inbound: number; answered: number; escalated: number; owner: number; resolutionRate: number };
  subscription?: Subscription | null;
  pendingQuestion?: string | null;
}

interface Subscription {
  id: string;
  plan: string;
  amount: number;
  status: "trial" | "active" | "past_due" | "canceled";
  startedAt: string;
  nextDueAt: string | null;
}

interface Overview {
  mrr: { activeCount: number; mrr: number; overdueCount: number; overdueAmount: number; dueSoonCount: number; trialCount: number; overdue: { id: string; subjectId: string; plan: string; amount: number; nextDueAt: string | null }[] };
  clients: { total: number; active: number; withoutKnowledge: number; pausedByHandoff: number };
  openEscalations: number;
  aiError: { at: string; quota: boolean; message: string } | null;
}

interface AskResult {
  answer: string;
  customerMessage: string;
  escalated: boolean;
  reason: string | null;
  topScore: number;
  sources: { docId: string; ordinal: number; score: number; content: string }[];
}

const moeda = (v: number) => `R$ ${Number(v || 0).toLocaleString("pt-BR")}`;
const dataBR = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—";

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.success === false) throw new Error(data?.error || `Falha (${res.status})`);
  return data as T;
}

interface UsoCliente {
  id: string;
  name: string;
  monthlyFee: number;
  chamadas: number;
  tokensIn: number;
  tokensOut: number;
  usd: number;
  brl: number;
  margemBrl: number;
}

interface UsoIa {
  periodo: string;
  cambioUsdBrl: number;
  total: { chamadas: number; tokensIn: number; tokensOut: number; usd: number; brl: number };
  clientes: UsoCliente[];
}

export function BotsPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [clients, setClients] = useState<BotClient[]>([]);
  const [instances, setInstances] = useState<{ name: string; state: string | null; inUse: boolean }[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);
  const [uso, setUso] = useState<UsoIa | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const [ov, lista] = await Promise.all([
        api<Overview>("/api/bot/overview"),
        api<{ clients: BotClient[] }>("/api/bot/clients"),
      ]);
      setOverview(ov);
      setClients(lista.clients);
      try {
        setUso(await api<UsoIa>("/api/bot/usage"));
      } catch {
        setUso(null);
      }
      try {
        const inst = await api<{ instances: any[] }>("/api/bot/instances");
        setInstances(inst.instances);
      } catch {
        setInstances([]);
      }
    } catch (e: any) {
      setErro(e?.message || "Falha ao carregar os bots.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const mrrTexto = useMemo(() => moeda(overview?.mrr.mrr || 0), [overview]);

  // Custo de token é fração de centavo: "R$ 0,00" faria parecer que nada foi gasto.
  const custo = (valor: number) => (valor > 0 && valor < 0.01 ? "< R$ 0,01" : moeda(valor));

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Bot className="h-6 w-6 text-indigo-600" /> Bots de WhatsApp
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Serviço de chatbot para cliente: {moeda(649)} de implantação + mensalidade. A base é dele, o bot responde
            só o que está nela e chama o dono quando não sabe.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => void carregar()}
            className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className={`w-4 h-4 ${carregando ? "animate-spin" : ""}`} /> Atualizar
          </button>
          <button
            onClick={() => setCriando((v) => !v)}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            <Plus className="w-4 h-4" /> Novo cliente
          </button>
        </div>
      </div>

      {erro && (
        <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          <AlertTriangle className="w-4 h-4" /> {erro}
        </div>
      )}

      {overview?.aiError?.quota && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <strong>Cota da IA esgotada.</strong> O bot está escalando tudo para o dono em vez de responder (comportamento
          seguro). Ative o faturamento da chave Gemini para operar de verdade.
          <span className="block text-xs text-amber-800/80">
            Último erro: {new Date(overview.aiError.at).toLocaleString("pt-BR")}
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi titulo="Receita recorrente" valor={mrrTexto} detalhe={`${overview?.mrr.activeCount || 0} assinatura(s)`} destaque />
        <Kpi titulo="Clientes" valor={String(overview?.clients.total || 0)} detalhe={`${overview?.clients.active || 0} ativos`} />
        <Kpi
          titulo="Em atraso"
          valor={moeda(overview?.mrr.overdueAmount || 0)}
          detalhe={`${overview?.mrr.overdueCount || 0} vencida(s)`}
        />
        <Kpi
          titulo="Perguntas abertas"
          valor={String(overview?.openEscalations || 0)}
          detalhe="o bot não soube responder"
        />
      </div>

      {/* Consumo de IA: mensalidade é fixa, token não */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Gauge className="h-4 w-4 text-indigo-600" /> Consumo de IA em {uso?.periodo || "—"}
          </h2>
          <span className="text-xs text-slate-500">
            {uso ? `${uso.total.chamadas} chamadas · ${(uso.total.tokensIn + uso.total.tokensOut).toLocaleString("pt-BR")} tokens · US$ ${uso.total.usd.toFixed(2)} (≈ ${moeda(uso.total.brl)}) · câmbio ${uso.cambioUsdBrl.toFixed(2)}` : "sem dados"}
          </span>
        </div>

        {uso && uso.clientes.length > 0 ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-slate-500">
                <tr className="border-b border-slate-200">
                  <th className="py-1.5 pr-3 font-semibold">Cliente</th>
                  <th className="py-1.5 pr-3 font-semibold text-right">Respostas</th>
                  <th className="py-1.5 pr-3 font-semibold text-right">Tokens</th>
                  <th className="py-1.5 pr-3 font-semibold text-right">Custo</th>
                  <th className="py-1.5 pr-3 font-semibold text-right">Mensalidade</th>
                  <th className="py-1.5 font-semibold text-right">Margem</th>
                </tr>
              </thead>
              <tbody>
                {uso.clientes.map((linha) => (
                  <tr key={linha.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-1.5 pr-3 font-medium text-slate-800">{linha.name}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-slate-600">{linha.chamadas}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-slate-600">
                      {(linha.tokensIn + linha.tokensOut).toLocaleString("pt-BR")}
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-slate-700">
                      {linha.usd > 0 ? `≈ ${custo(linha.brl)}` : "—"}
                      <span className="ml-1 text-[10px] text-slate-400">US$ {linha.usd.toFixed(4)}</span>
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-slate-600">{moeda(linha.monthlyFee)}</td>
                    <td
                      className={`py-1.5 text-right tabular-nums font-semibold ${
                        linha.margemBrl < 0 ? "text-rose-700" : "text-emerald-700"
                      }`}
                    >
                      {linha.chamadas ? custo(linha.margemBrl) : moeda(linha.margemBrl)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[11px] text-slate-500">
              Token é medido; o valor em reais é estimativa (preço por milhão + câmbio configurados no servidor).
            </p>
          </div>
        ) : (
          <p className="mt-2 text-xs text-slate-500">
            Nenhuma chamada de IA registrada neste mês. O consumo aparece aqui conforme os bots atendem.
          </p>
        )}
      </div>

      {criando && <NovoClienteBot instances={instances} onCriado={() => void carregar()} onFechar={() => setCriando(false)} />}

      {carregando && !clients.length ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando clientes…
        </div>
      ) : clients.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
          <Bot className="mx-auto mb-2 h-8 w-8 text-slate-400" />
          <p className="text-sm font-semibold text-slate-700">Nenhum bot cadastrado ainda</p>
          <p className="text-xs text-slate-500">
            Clique em <strong>Novo cliente</strong>, cole a base que ele mandou e teste as perguntas antes de conectar o
            número.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {clients.map((c) => (
            <React.Fragment key={c.id}>
              <ClienteCard
                client={c}
                aberto={aberto === c.id}
                onToggle={() => setAberto(aberto === c.id ? null : c.id)}
                onAtualizar={() => void carregar()}
              />
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

function Kpi({ titulo, valor, detalhe, destaque }: { titulo: string; valor: string; detalhe?: string; destaque?: boolean }) {
  return (
    <div className={`rounded-xl border bg-white px-4 py-3 ${destaque ? "border-indigo-200" : "border-slate-200"}`}>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{titulo}</div>
      <div className={`text-xl font-bold ${destaque ? "text-indigo-700" : "text-slate-900"}`}>{valor}</div>
      {detalhe && <div className="text-xs text-slate-500">{detalhe}</div>}
    </div>
  );
}

function NovoClienteBot({
  instances,
  onCriado,
  onFechar,
}: {
  instances: { name: string; state: string | null; inUse: boolean }[];
  onCriado: () => void;
  onFechar: () => void;
}) {
  const [nome, setNome] = useState("");
  const [dono, setDono] = useState("");
  const [instancia, setInstancia] = useState("");
  const [setup, setSetup] = useState("649");
  const [mensal, setMensal] = useState("150");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const salvar = async () => {
    if (!nome.trim()) return setErro("Informe o nome do cliente.");
    setSalvando(true);
    setErro(null);
    try {
      await api("/api/bot/clients", {
        method: "POST",
        body: JSON.stringify({
          name: nome,
          ownerPhone: dono,
          instance: instancia,
          setupPrice: Number(setup) || 0,
          monthlyPrice: Number(mensal) || 0,
        }),
      });
      onCriado();
      onFechar();
    } catch (e: any) {
      setErro(e?.message || "Falha ao criar.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="rounded-xl border border-indigo-200 bg-white p-4">
      <div className="mb-3 text-sm font-semibold text-slate-800">Novo cliente de bot</div>
      <div className="grid gap-3 md:grid-cols-2">
        <Campo label="Nome do negócio">
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Barbearia Navalha de Ouro"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </Campo>
        <Campo label="WhatsApp do dono (recebe as perguntas)">
          <input
            value={dono}
            onChange={(e) => setDono(e.target.value)}
            placeholder="+55 61 99277-5759"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </Campo>
        <Campo label="Instância do WhatsApp (número do cliente)">
          <input
            value={instancia}
            onChange={(e) => setInstancia(e.target.value)}
            list="bot-instances"
            placeholder="barbearia-nivaldo"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <datalist id="bot-instances">
            {instances.map((i) => (
              <option key={i.name} value={i.name}>
                {i.state || "—"} {i.inUse ? "(em uso)" : ""}
              </option>
            ))}
          </datalist>
        </Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Implantação">
            <input
              value={setup}
              onChange={(e) => setSetup(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </Campo>
          <Campo label="Mensalidade">
            <input
              value={mensal}
              onChange={(e) => setMensal(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </Campo>
        </div>
      </div>
      {erro && <div className="mt-2 text-xs text-rose-600">{erro}</div>}
      <div className="mt-3 flex gap-2">
        <button
          onClick={() => void salvar()}
          disabled={salvando}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Criar
        </button>
        <button onClick={onFechar} className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600">
          Cancelar
        </button>
      </div>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function ClienteCard({
  client,
  aberto,
  onToggle,
  onAtualizar,
}: {
  client: BotClient;
  aberto: boolean;
  onToggle: () => void;
  onAtualizar: () => void;
}) {
  const [detalhe, setDetalhe] = useState<any>(null);
  const [carregando, setCarregando] = useState(false);
  const [conteudo, setConteudo] = useState("");
  const [titulo, setTitulo] = useState("");
  const [pergunta, setPergunta] = useState("");
  const [teste, setTeste] = useState<AskResult | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregarDetalhe = useCallback(async () => {
    setCarregando(true);
    try {
      setDetalhe(await api(`/api/bot/clients/${client.id}`));
    } catch (e: any) {
      setErro(e?.message || "Falha ao carregar o cliente.");
    } finally {
      setCarregando(false);
    }
  }, [client.id]);

  useEffect(() => {
    if (aberto && !detalhe) void carregarDetalhe();
  }, [aberto, detalhe, carregarDetalhe]);

  const acao = async (nome: string, fn: () => Promise<any>) => {
    setOcupado(nome);
    setErro(null);
    try {
      await fn();
      await carregarDetalhe();
      onAtualizar();
    } catch (e: any) {
      setErro(e?.message || "Falha na ação.");
    } finally {
      setOcupado(null);
    }
  };

  const docs = detalhe?.docs || [];
  const stats = detalhe?.stats || client.stats;
  const sub: Subscription | null = detalhe?.subscription || client.subscription || null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <button onClick={onToggle} className="flex w-full items-center gap-3 px-4 py-3 text-left">
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
            client.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
          }`}
        >
          <Bot className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-slate-900">{client.name}</span>
            {client.paused && (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-800">
                humano atendendo
              </span>
            )}
            {client.pendingQuestion && (
              <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-rose-700">
                1 pergunta aberta
              </span>
            )}
          </span>
          <span className="mt-0.5 block text-xs text-slate-500">
            {client.instance || "sem número conectado"} · {client.knowledge?.chunks || 0} trecho(s) na base ·{" "}
            {moeda(client.monthlyPrice)}/mês
            {sub ? ` · vence ${dataBR(sub.nextDueAt)}` : ""}
          </span>
        </span>
        <span className="hidden shrink-0 items-center gap-3 text-xs text-slate-500 md:flex">
          <span>{stats?.inbound || 0} mensagens</span>
          <span>{stats?.resolutionRate || 0}% resolvido</span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition ${aberto ? "rotate-180" : ""}`} />
      </button>

      {aberto && (
        <div className="space-y-4 border-t border-slate-100 px-4 py-4">
          {erro && <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{erro}</div>}
          {carregando && !detalhe && (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando…
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => acao("handoff", () => api(`/api/bot/clients/${client.id}/handoff`, { method: "POST", body: JSON.stringify({ paused: !client.paused, hours: 6 }) }))}
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              {client.paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
              {client.paused ? "Devolver ao bot" : "Assumir conversa (6h)"}
            </button>
            {sub && (
              <>
                <button
                  onClick={() => acao("pago", () => api(`/api/bot/subscriptions/${sub.id}/paid`, { method: "POST" }))}
                  className="flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                >
                  <Wallet className="h-3.5 w-3.5" /> Registrar pagamento
                </button>
                <span className="flex items-center rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs text-slate-600">
                  {moeda(sub.amount)} · {sub.status} · próx. {dataBR(sub.nextDueAt)}
                </span>
              </>
            )}
          </div>

          {/* Base de conhecimento */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800">Base de conhecimento</h3>
              <span className="text-xs text-slate-500">
                {detalhe?.knowledge?.docs || 0} documento(s) · {detalhe?.knowledge?.chunks || 0} trecho(s)
              </span>
            </div>
            <textarea
              value={conteudo}
              onChange={(e) => setConteudo(e.target.value)}
              rows={5}
              placeholder="Cole aqui o que o cliente mandou: serviços, preços, horário, endereço, formas de pagamento, dúvidas frequentes…"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Título (ex.: preços e serviços)"
                className="w-56 rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
              />
              <button
                onClick={() =>
                  acao("indexar", async () => {
                    await api(`/api/bot/clients/${client.id}/knowledge`, {
                      method: "POST",
                      body: JSON.stringify({ content: conteudo, title: titulo || undefined }),
                    });
                    setConteudo("");
                    setTitulo("");
                  })
                }
                disabled={conteudo.trim().length < 20 || ocupado === "indexar"}
                className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
              >
                {ocupado === "indexar" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                Indexar na base
              </button>
            </div>
            {docs.length > 0 && (
              <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
                {docs.map((d: any) => (
                  <li key={d.id} className="flex items-center gap-2 px-3 py-2 text-xs">
                    <span className="min-w-0 flex-1 truncate text-slate-700">{d.title || "Documento sem título"}</span>
                    <span className="shrink-0 text-slate-500">{d.chunks} trecho(s)</span>
                    <button
                      onClick={() => acao(`del-${d.id}`, () => api(`/api/bot/clients/${client.id}/knowledge/${d.id}`, { method: "DELETE" }))}
                      className="shrink-0 rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                      title="Remover documento"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Teste de pergunta */}
          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-800">Testar pergunta (não envia nada)</h3>
            <div className="flex gap-2">
              <input
                value={pergunta}
                onChange={(e) => setPergunta(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && pergunta.trim()) {
                    void acao("teste", async () => {
                      setTeste(await api(`/api/bot/clients/${client.id}/ask`, {
                        method: "POST",
                        body: JSON.stringify({ question: pergunta }),
                      }));
                    });
                  }
                }}
                placeholder="Quanto custa o corte?"
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <button
                onClick={() =>
                  acao("teste", async () => {
                    setTeste(await api(`/api/bot/clients/${client.id}/ask`, {
                      method: "POST",
                      body: JSON.stringify({ question: pergunta }),
                    }));
                  })
                }
                disabled={!pergunta.trim() || ocupado === "teste"}
                className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {ocupado === "teste" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Testar
              </button>
            </div>
            {teste && (
              <div
                className={`mt-2 rounded-lg border px-3 py-2 text-sm ${
                  teste.escalated ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"
                }`}
              >
                <div className="mb-1 flex items-center gap-2 text-xs font-semibold">
                  {teste.escalated ? (
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-700" />
                  ) : (
                    <Check className="h-3.5 w-3.5 text-emerald-700" />
                  )}
                  <span className={teste.escalated ? "text-amber-800" : "text-emerald-800"}>
                    {teste.escalated ? `escalaria ao dono (${teste.reason})` : "responderia com base"}
                  </span>
                  <span className="text-slate-500">similaridade {teste.topScore.toFixed(2)}</span>
                </div>
                <p className="whitespace-pre-wrap text-slate-800">{teste.customerMessage}</p>
                {teste.sources?.length > 0 && (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-[11px] text-slate-500">
                      {teste.sources.length} trecho(s) usados
                    </summary>
                    <ul className="mt-1 space-y-1">
                      {teste.sources.map((s, i) => (
                        <li key={i} className="rounded bg-white/70 px-2 py-1 text-[11px] text-slate-600">
                          ({s.score.toFixed(2)}) {s.content.slice(0, 160)}…
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            )}
          </div>

          {/* Perguntas abertas */}
          {(detalhe?.escalations || []).filter((e: any) => !e.answeredAt).length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-slate-800">Perguntas que o bot não soube</h3>
              <div className="space-y-2">
                {detalhe.escalations
                  .filter((e: any) => !e.answeredAt)
                  .map((e: any) => (
                    <React.Fragment key={e.id}>
                      <ResponderEscalada
                        clientId={client.id}
                        escalacao={e}
                        onRespondido={() => void acao("resp", async () => {})}
                      />
                    </React.Fragment>
                  ))}
              </div>
            </div>
          )}

          {/* Conversas recentes */}
          {(detalhe?.messages || []).length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-slate-800">Últimas conversas</h3>
              <ul className="max-h-64 space-y-1 overflow-auto rounded-lg border border-slate-200 p-2">
                {detalhe.messages.map((m: any) => (
                  <li key={m.id} className="text-[11px]">
                    <span
                      className={`mr-1 rounded px-1 py-0.5 font-semibold ${
                        m.direction === "in" ? "bg-slate-100 text-slate-600" : "bg-indigo-50 text-indigo-700"
                      }`}
                    >
                      {m.kind}
                    </span>
                    <span className="text-slate-400">{m.phone}</span>{" "}
                    <span className="text-slate-700">{m.text.slice(0, 180)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ResponderEscalada({
  clientId,
  escalacao,
  onRespondido,
}: {
  clientId: string;
  escalacao: { id: string; question: string; customerPhone: string };
  onRespondido: () => void;
}) {
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-900">
        <MessageCircle className="h-3.5 w-3.5" /> {escalacao.customerPhone}
      </div>
      <p className="mt-1 text-sm text-slate-800">“{escalacao.question}”</p>
      <div className="mt-2 flex gap-2">
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Responda aqui que o bot repassa ao cliente"
          className="flex-1 rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 text-xs"
        />
        <button
          onClick={async () => {
            if (!texto.trim()) return;
            setEnviando(true);
            try {
              await api(`/api/bot/clients/${clientId}/escalations/${escalacao.id}/answer`, {
                method: "POST",
                body: JSON.stringify({ text: texto }),
              });
              setTexto("");
              onRespondido();
            } finally {
              setEnviando(false);
            }
          }}
          disabled={!texto.trim() || enviando}
          className="flex items-center gap-1.5 rounded-lg bg-amber-600 px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          {enviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Repassar
        </button>
      </div>
    </div>
  );
}

export default BotsPage;
