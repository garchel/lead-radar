import React, { useCallback, useEffect, useState } from 'react';
import { KeyRound, MessageCircle, Server, RefreshCw, ExternalLink, AlertTriangle, CheckCircle2, Globe, Play, Copy, Check, UploadCloud } from 'lucide-react';
import { SerpApiKeyManager } from './SerpApiKeyManager';
import { WhatsappSettingsCard } from './WhatsappSettingsCard';
import { LeadQualityCard } from './LeadQualityCard';
import { McpStatusModal } from './McpStatusModal';

/**
 * Canais & APIs: a casa da infraestrutura.
 *
 * Antes as chaves SerpAPI abriam de dentro da Busca, a conexão do WhatsApp ficava
 * no topo do CRM e o MCP num modal solto. Configuração de canal não é operação de
 * funil — juntar aqui deixa a Busca falar só de busca e o CRM só de leads.
 */

interface SerpApiKeyRow {
  id: string;
  label: string | null;
  maskedKey: string;
  isActive: boolean;
  usedThisMonth: number;
  remainingThisMonth: number;
  nextMonthlyReset: string;
  usedThisHour: number;
  remainingThisHour: number;
  usedToday: number;
  dailyBudget: number;
  dailyRemaining: number;
  daysLeftInCycle: number;
}

interface NextKeyInfo {
  nextKeyId: string | null;
}

const fmtDate = (iso?: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR');
};

export const ChannelsPage: React.FC<{ onOpenAutomation?: () => void }> = ({ onOpenAutomation }) => {
  const [keys, setKeys] = useState<SerpApiKeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showKeyManager, setShowKeyManager] = useState(false);
  const [showMcp, setShowMcp] = useState(false);
  const [mcpOnline, setMcpOnline] = useState<boolean | null>(null);
  const [nextKeyId, setNextKeyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/serpapi/keys');
      const data = await res.json();
      setNextKeyId(typeof data?.nextKeyId === 'string' ? data.nextKeyId : null);
      if (Array.isArray(data?.keys)) setKeys(data.keys);
      else if (Array.isArray(data)) setKeys(data);
      else if (!data?.success) throw new Error(data?.error || 'Falha ao listar as chaves SerpAPI.');
      else setKeys(data.keys || []);
    } catch (e: any) {
      setError(e?.message || 'Falha ao listar as chaves SerpAPI.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMcp = useCallback(async () => {
    try {
      const res = await fetch('/api/mcp/info');
      const data = await res.json();
      setMcpOnline(Boolean(data?.success ?? data?.info));
    } catch {
      setMcpOnline(false);
    }
  }, []);

  useEffect(() => {
    void load();
    void loadMcp();
  }, [load, loadMcp]);

  const active = keys.find((k) => k.isActive) || keys[0];

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <KeyRound className="w-6 h-6 text-indigo-600" /> Canais &amp; APIs
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            As conexões que alimentam o radar: SerpAPI (busca real), WhatsApp (contato) e o servidor MCP (agentes).
          </p>
        </div>
        <button
          type="button"
          onClick={() => { void load(); void loadMcp(); }}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Atualizar
        </button>
      </div>

      {/* SerpAPI */}
      <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-bold text-slate-900 flex items-center gap-2"><KeyRound className="w-4 h-4 text-orange-600" /> SerpAPI — busca do Google Maps</h2>
            <p className="text-xs text-slate-500 mt-1">
              É daqui que saem as empresas reais. Cada busca = 1 crédito (cidade × categoria); o cache de 7 dias não gasta.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowKeyManager(true)}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-900 text-white hover:bg-slate-700"
          >
            Gerenciar chaves
          </button>
        </div>

        {error && (
          <div className="flex items-start gap-2 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5" /> {error}
          </div>
        )}

        {!error && keys.length === 0 && !loading && (
          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
            Nenhuma chave cadastrada — a busca real está desligada. Adicione uma chave em <strong>Gerenciar chaves</strong>.
          </div>
        )}

        {keys.length > 0 && (
          <div className="divide-y divide-slate-100">
            {keys.map((key) => (
              <div key={key.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  {key.isActive
                    ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    : <span className="w-3.5 h-3.5 shrink-0" />}
                  <span className="font-mono text-slate-600">{key.maskedKey}</span>
                  {key.label && <span className="text-slate-500 truncate">· {key.label}</span>}
                  {key.isActive && <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold text-[11px]">ATIVA</span>}
                  {nextKeyId === key.id && (
                    <span title="A rotação escolhe esta chave na próxima busca" className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 font-bold text-[11px]">EM USO</span>
                  )}
                  {key.dailyRemaining <= 0 && (
                    <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 font-bold text-[11px]">cota do dia esgotada</span>
                  )}
                </div>
                <div className="text-slate-600 tabular-nums">
                  hoje <strong>{key.usedToday}/{key.dailyBudget}</strong>
                  <span className="text-slate-500"> · </span>
                  {key.usedThisMonth} usadas no ciclo · <strong>{key.remainingThisMonth}</strong> restantes · renova {fmtDate(key.nextMonthlyReset)}
                </div>
              </div>
            ))}
          </div>
        )}

        {active && onOpenAutomation && (
          <button
            type="button"
            onClick={onOpenAutomation}
            className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 inline-flex items-center gap-1"
          >
            O ritmo dessas buscas (orçamento por dia) está em Automação → Autopilot de coleta <ExternalLink className="w-3 h-3" />
          </button>
        )}
      </section>

      <LeadQualityCard />

      {/* WhatsApp */}
      <section className="space-y-2">
        <h2 className="font-bold text-slate-900 flex items-center gap-2 px-1">
          <MessageCircle className="w-4 h-4 text-emerald-600" /> WhatsApp — canal de contato
        </h2>
        <p className="text-xs text-slate-500 px-1">
          Provedor, estado da conexão e limite de envio. As regras de humanização (janela, digitação, teto) ficam em Automação.
        </p>
        <WhatsappSettingsCard />
      </section>

      {/* Link público das prévias */}
      <PublicLinkCard />

      {/* MCP */}
      <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-bold text-slate-900 flex items-center gap-2"><Server className="w-4 h-4 text-sky-600" /> Servidor MCP</h2>
            <p className="text-xs text-slate-500 mt-1">
              Expõe o radar para agentes (Hermes, Claude Desktop, Cursor, n8n) via ferramentas MCP.
            </p>
            <div className="mt-2 text-xs font-semibold flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${mcpOnline ? 'bg-emerald-500' : 'bg-slate-400'}`} />
              <span className={mcpOnline ? 'text-emerald-700' : 'text-slate-500'}>
                {mcpOnline === null ? 'verificando…' : mcpOnline ? 'Online' : 'Sem resposta'}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowMcp(true)}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
          >
            Ver configuração e ferramentas
          </button>
        </div>
      </section>

      {showKeyManager && (
        <SerpApiKeyManager
          onClose={() => setShowKeyManager(false)}
          onChanged={() => void load()}
        />
      )}
      <McpStatusModal isOpen={showMcp} onClose={() => setShowMcp(false)} />
    </div>
  );
};

/**
 * Link público das prévias.
 *
 * Sem isso o cliente do outro lado da cidade recebe um endereço 192.168.x.x que
 * não abre. Aqui o operador vê qual base está em uso e sobe/derruba o túnel.
 */
function PublicLinkCard() {
  const [estado, setEstado] = useState<{
    available: boolean;
    tunnel: { running: boolean; url: string | null; source: string; error?: string };
    previewBase: { baseUrl: string | null; source: string };
    previewExample: string | null;
  } | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [pages, setPages] = useState<{ configured: boolean; project: string | null; baseUrl: string | null; error?: string } | null>(null);
  const [publicacao, setPublicacao] = useState<string | null>(null);

  const carregar = async () => {
    try {
      const res = await fetch('/api/tunnel');
      const data = await res.json();
      if (data?.success) setEstado(data);
    } catch {
      /* cartão secundário */
    }
    try {
      const res = await fetch('/api/previews/public');
      const data = await res.json();
      if (data?.success) setPages(data.pages);
    } catch {
      /* sem Pages configurado */
    }
  };

  useEffect(() => {
    void carregar();
  }, []);

  const acao = async (nome: 'start' | 'stop') => {
    setOcupado(nome);
    setErro(null);
    try {
      const res = await fetch(`/api/tunnel/${nome}`, { method: 'POST' });
      const data = await res.json();
      if (data?.error) throw new Error(data.error);
      await carregar();
    } catch (e: any) {
      setErro(e?.message || 'Falha ao mexer no túnel.');
    } finally {
      setOcupado(null);
    }
  };

  const publicar = async () => {
    setOcupado('publish');
    setErro(null);
    setPublicacao(null);
    try {
      const res = await fetch('/api/previews/publish', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || 'A publicação falhou.');
      setPublicacao(data.base?.baseUrl ? `publicado em ${data.base.baseUrl}` : 'publicado');
      await carregar();
    } catch (e: any) {
      setErro(e?.message || 'Falha ao publicar no Cloudflare.');
    } finally {
      setOcupado(null);
    }
  };

  const url = estado?.previewBase?.baseUrl;
  const fonte = estado?.previewBase?.source;

  return (
    <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-bold text-slate-900 flex items-center gap-2">
            <Globe className="w-4 h-4 text-indigo-600" /> Link público das prévias
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            O cliente abre a prévia de qualquer rede. Sem isso o link só funciona no mesmo Wi-Fi.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => void publicar()}
            disabled={ocupado !== null || !pages?.configured}
            title={pages?.configured ? 'Publica todas as prévias no Cloudflare (link estável)' : 'Configure CLOUDFLARE_ACCOUNT_ID e CLOUDFLARE_API_TOKEN no .env'}
            className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
          >
            {ocupado === 'publish' ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <UploadCloud className="w-3.5 h-3.5" />} Publicar
          </button>
          <button
            onClick={() => void acao('start')}
            disabled={ocupado !== null}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
          >
            {ocupado === 'start' ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />} Subir túnel
          </button>
          <button
            onClick={() => void acao('stop')}
            disabled={ocupado !== null || !estado?.tunnel?.running}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 disabled:opacity-50"
          >
            Parar
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          base em uso ({fonte || '—'})
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 truncate text-xs text-slate-800">{url || 'nenhuma: o link não será enviado'}</code>
          {url && (
            <button
              onClick={() => {
                void navigator.clipboard?.writeText(url).then(() => {
                  setCopiado(true);
                  setTimeout(() => setCopiado(false), 1500);
                });
              }}
              className="flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700"
            >
              {copiado ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />} {copiado ? 'copiado' : 'copiar'}
            </button>
          )}
        </div>
        {estado?.previewExample && <p className="mt-1 text-[11px] text-slate-500">exemplo: {estado.previewExample}</p>}
        <p className="mt-1 text-[11px] text-slate-600">
          Cloudflare Pages: {!pages
            ? 'lendo…'
            : pages.configured
              ? `${pages.project}${pages.baseUrl ? ` — ${pages.baseUrl}` : ' (publicando…)'}`
              : 'não configurado (defina CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN e CF_PAGES_PROJECT)'}
        </p>
        {publicacao && <p className="mt-1 text-[11px] text-emerald-700">{publicacao}</p>}
        {estado?.tunnel?.error && <p className="mt-1 text-[11px] text-amber-700">{estado.tunnel.error}</p>}
        <p className="mt-1 text-[11px] text-slate-500">
          Túnel do cloudflared: a URL muda a cada reinício e cai se o app fechar. Para endereço fixo, defina{' '}
          <code className="rounded bg-white px-1">PUBLIC_BASE_URL</code> ou rode numa VPS.
        </p>
      </div>

      {erro && <p className="text-xs text-rose-700">{erro}</p>}
    </section>
  );
}
