import React, { useState, useEffect, useCallback } from 'react';
import { Bot, RefreshCw, Copy, Check, Rocket, AlertCircle, ClipboardList, ShieldCheck, Terminal, Info } from 'lucide-react';

/**
 * Página "Agentes" — orquestração de bots Hermes de execução por projeto.
 * Mostra como o app funciona, o runbook da etapa atual e o prompt de spawn
 * pronto para copiar (o bot puxa o resto via MCP).
 */

interface ProjectSummary {
  projectId: string;
  name: string;
  type: string;
  stage: string;
  status: string;
  priority: string;
  devStatus: string;
  leadId: string;
  leadName: string | null;
  leadCity: string | null;
  dueDate: string | null;
  tasksDone: number;
  tasksTotal: number;
  createdAt: string;
  updatedAt: string;
}

interface AgentRunbook {
  success: boolean;
  projectId: string;
  generatedAt: string;
  app: {
    nome: string;
    oQueFaz: string;
    fluxoDeTrabalho: string[];
    modeloDeDados: string[];
  };
  projeto: {
    nome: string;
    leadId: string;
    cliente: { nome: string; categoria: string | null; cidade: string | null; telefone: string | null; instagram: string | null } | null;
    etapa: string;
    status: string;
    prioridade: string;
    devStatus: string;
    temBriefingTexto: boolean;
    camposBriefing: number;
    briefPreview: string | null;
    temCopy: boolean;
    temDesignNotes: boolean;
    repo: string | null;
    previewUrl: string | null;
    deployUrl: string | null;
    tarefas: { feitas: number; total: number };
  };
  runbook: Array<{ etapa: string; objetivo: string; acoes: string[] }>;
  regras: string[];
  mcp: { servidor: string; urlSse: string; ferramentas: Array<{ tool: string; uso: string }> };
  promptDeSpawn: string;
}

const STAGE_LABELS: Record<string, string> = {
  briefing: 'Briefing',
  copywriting: 'Copywriting',
  design: 'Design',
  desenvolvimento: 'Desenvolvimento',
  revisao: 'Revisão',
  deploy: 'Deploy',
};

const STAGE_ICONS: Record<string, string> = {
  briefing: '📋',
  copywriting: '✍️',
  design: '🎨',
  desenvolvimento: '⌨️',
  revisao: '🔍',
  deploy: '🚀',
};

const DEV_STATUS_LABELS: Record<string, string> = {
  aguardando_agente: 'Aguardando o agente',
  em_desenvolvimento: 'Em desenvolvimento (agente codando)',
  codigo_entregue: 'Código entregue — aguardando revisão humana',
  aprovado: 'Código aprovado pelo humano',
};

const STATUS_BADGES: Record<string, string> = {
  em_andamento: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  pausado: 'bg-amber-100 text-amber-700 border-amber-200',
  cancelado: 'bg-rose-100 text-rose-700 border-rose-200',
  concluido: 'bg-emerald-100 text-emerald-700 border-emerald-200',
};

export const AgentsDashboard: React.FC = () => {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [runbook, setRunbook] = useState<AgentRunbook | null>(null);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [loadingRunbook, setLoadingRunbook] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const loadProjects = useCallback(async () => {
    setLoadingProjects(true);
    try {
      const res = await fetch('/api/projects');
      const data = await res.json();
      if (data.success) {
        const emAndamento: ProjectSummary[] = (data.projects || []).filter(
          (p: ProjectSummary) => p.status === 'em_andamento'
        );
        setProjects(emAndamento);
        if (!selectedId && emAndamento.length > 0) setSelectedId(emAndamento[0].projectId);
      }
    } catch {
      setError('Falha ao carregar projetos.');
    } finally {
      setLoadingProjects(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadRunbook = useCallback(async (projectId: string) => {
    setLoadingRunbook(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/agent-runbook`);
      const data = await res.json();
      if (data.success) {
        setRunbook(data);
      } else {
        setError(data.error || 'Falha ao carregar runbook.');
        setRunbook(null);
      }
    } catch {
      setError('Falha ao carregar runbook.');
      setRunbook(null);
    } finally {
      setLoadingRunbook(false);
    }
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    if (selectedId) loadRunbook(selectedId);
  }, [selectedId, loadRunbook]);

  const copyToClipboard = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 2500);
    } catch {
      /* silencioso */
    }
  };

  const selected = projects.find((p) => p.projectId === selectedId);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-slate-100 border-b border-slate-200/80 py-6 px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Bot className="w-7 h-7 text-indigo-600" />
              Agentes de Execução
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Delegue um bot Hermes por projeto ativo — ele executa via MCP sem precisar ler a codebase.
            </p>
          </div>
          <button
            onClick={loadProjects}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loadingProjects ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        </div>
      </div>

      <div className="px-4 sm:px-6 lg:px-8 space-y-6">
        {error && (
          <div className="flex items-center gap-2 p-3 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-700">
            <AlertCircle className="w-4 h-4 shrink-0" /> {error}
          </div>
        )}

        {/* Seletor de projeto */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Projeto ativo (um bot por projeto)
          </label>
          {loadingProjects ? (
            <div className="h-10 bg-slate-100 rounded-lg animate-pulse" />
          ) : projects.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-slate-500 py-2">
              <Info className="w-4 h-4" />
              Nenhum projeto em andamento. Mova um lead para "Em Desenvolvimento" no CRM para criar um projeto.
            </div>
          ) : (
            <select
              value={selectedId ?? ''}
              onChange={(e) => setSelectedId(e.target.value)}
              className="w-full max-w-xl px-3 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500"
            >
              {projects.map((p) => (
                <option key={p.projectId} value={p.projectId}>
                  {STAGE_ICONS[p.stage] || '📁'} {p.name} — {STAGE_LABELS[p.stage] || p.stage}
                  {p.leadName ? ` (${p.leadName})` : ''}
                </option>
              ))}
            </select>
          )}
        </div>

        {runbook && selected && (
          <>
            {/* Card do projeto */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm lg:col-span-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">{runbook.projeto.nome}</h2>
                    <p className="text-sm text-slate-500">
                      {runbook.projeto.cliente ? (
                        <>
                          {runbook.projeto.cliente.nome}
                          {runbook.projeto.cliente.cidade ? ` · ${runbook.projeto.cliente.cidade}` : ''}
                          {runbook.projeto.cliente.categoria ? ` · ${runbook.projeto.cliente.categoria}` : ''}
                        </>
                      ) : (
                        'Sem lead vinculado'
                      )}
                    </p>
                  </div>
                  <span className={`px-2.5 py-1 text-xs font-bold rounded-full border ${STATUS_BADGES[runbook.projeto.status] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                    {runbook.projeto.status.replace('_', ' ')}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                  <div className="bg-slate-50 rounded-lg p-3">
                    <div className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Etapa</div>
                    <div className="text-sm font-semibold text-slate-800 mt-0.5">
                      {STAGE_ICONS[runbook.projeto.etapa]} {STAGE_LABELS[runbook.projeto.etapa] || runbook.projeto.etapa}
                    </div>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3">
                    <div className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">devStatus</div>
                    <div className="text-sm font-semibold text-slate-800 mt-0.5">
                      {DEV_STATUS_LABELS[runbook.projeto.devStatus] || runbook.projeto.devStatus}
                    </div>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3">
                    <div className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Briefing</div>
                    <div className="text-sm font-semibold text-slate-800 mt-0.5">
                      {runbook.projeto.temBriefingTexto || runbook.projeto.camposBriefing > 0 ? (
                        <span className="text-emerald-600">
                          ✓ {runbook.projeto.camposBriefing > 0 ? `${runbook.projeto.camposBriefing} campos` : 'texto'}
                        </span>
                      ) : (
                        <span className="text-rose-500">faltando</span>
                      )}
                    </div>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3">
                    <div className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Tarefas</div>
                    <div className="text-sm font-semibold text-slate-800 mt-0.5">
                      {runbook.projeto.tarefas.feitas}/{runbook.projeto.tarefas.total}
                    </div>
                  </div>
                </div>

                {runbook.projeto.briefPreview && (
                  <div className="mt-4">
                    <div className="text-[10px] font-bold uppercase text-slate-400 tracking-wider mb-1">Briefing (prévia)</div>
                    <div className="text-xs text-slate-600 bg-slate-50 border border-slate-100 rounded-lg p-3 whitespace-pre-wrap max-h-32 overflow-y-auto">
                      {runbook.projeto.briefPreview}
                    </div>
                  </div>
                )}
              </div>

              {/* Como o app funciona */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-3">
                  <Info className="w-4 h-4 text-indigo-600" />
                  Como o LeadRadar funciona
                </h3>
                <p className="text-xs text-slate-600 mb-3">{runbook.app.oQueFaz}</p>
                <ol className="space-y-1.5">
                  {runbook.app.fluxoDeTrabalho.map((step, i) => (
                    <li key={i} className="text-xs text-slate-600 flex gap-2">
                      <span className="font-bold text-indigo-600 shrink-0">{i + 1}.</span>
                      {step}
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </>
        )}

        {/* Runbook da etapa + rules + tools */}
        {runbook && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Runbook */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm lg:col-span-2">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-4">
                <ClipboardList className="w-4 h-4 text-indigo-600" />
                Runbook — etapa atual e seguintes
              </h3>
              <div className="space-y-4">
                {runbook.runbook.map((step, i) => (
                  <div key={step.etapa} className={`border rounded-lg p-4 ${i === 0 ? 'border-indigo-300 bg-indigo-50/50' : 'border-slate-200'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-sm font-bold ${i === 0 ? 'text-indigo-700' : 'text-slate-700'}`}>
                        {STAGE_ICONS[step.etapa]} {STAGE_LABELS[step.etapa] || step.etapa}
                        {i === 0 && <span className="ml-2 text-[10px] font-bold uppercase tracking-wider bg-indigo-600 text-white px-1.5 py-0.5 rounded">atual</span>}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mb-2">{step.objetivo}</p>
                    <ul className="space-y-1.5">
                      {step.acoes.map((a, j) => (
                        <li key={j} className="text-xs text-slate-700 flex gap-2">
                          <span className="text-slate-400 shrink-0">•</span>
                          <span>{a}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>

            {/* Regras de ouro */}
            <div className="space-y-4">
              <div className="bg-white border border-amber-200 rounded-xl p-5 shadow-sm">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-3">
                  <ShieldCheck className="w-4 h-4 text-amber-500" />
                  Regras de ouro do bot
                </h3>
                <ul className="space-y-2">
                  {runbook.regras.map((rule, i) => (
                    <li key={i} className="text-xs text-slate-700 flex gap-2">
                      <span className="text-amber-500 shrink-0">⚠</span>
                      <span>{rule}</span>
                    </li>
                  ))}
                </ul>
      </div>

              {/* Tools MCP */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-3">
                  <Terminal className="w-4 h-4 text-indigo-600" />
                  Tools MCP do bot
                </h3>
                <div className="space-y-2">
                  {runbook.mcp.ferramentas.map((t) => (
                    <div key={t.tool} className="text-xs">
                      <code className="font-mono font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">{t.tool}</code>
                      <p className="text-slate-600 mt-1">{t.uso}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Prompt de spawn */}
        {runbook && (
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Rocket className="w-4 h-4 text-indigo-600" />
                Prompt de spawn — cole no novo chat do bot Hermes
              </h3>
              <button
                onClick={() => copyToClipboard(runbook.promptDeSpawn, 'spawn')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 transition-colors"
              >
                {copied === 'spawn' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied === 'spawn' ? 'Copiado!' : 'Copiar prompt'}
              </button>
            </div>
            <pre className="text-xs text-slate-700 bg-slate-900 rounded-lg p-4 overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed">
              {runbook.promptDeSpawn}
            </pre>
            <p className="text-[11px] text-slate-400 mt-2">
              O bot chama <code className="font-mono">get_agent_runbook</code> via MCP e recebe o guia completo + estado fresco — não precisa ler a codebase.
            </p>
          </div>
        )}

        {loadingRunbook && (
          <div className="bg-white border border-slate-200 rounded-xl p-8 shadow-sm flex items-center justify-center">
            <RefreshCw className="w-6 h-6 text-slate-400 animate-spin" />
          </div>
        )}
      </div>
    </div>
  );
};
