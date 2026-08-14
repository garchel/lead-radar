import React, { useState } from 'react';
import { X, Cpu, Check, Copy, Terminal, Zap, ExternalLink, Sparkles, Server } from 'lucide-react';

interface McpStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const McpStatusModal: React.FC<McpStatusModalProps> = ({ isOpen, onClose }) => {
  const [copied, setCopied] = useState(false);
  const [copiedHermes, setCopiedHermes] = useState(false);
  const [activeTab, setActiveTab] = useState<'config' | 'hermes' | 'tools' | 'test'>('config');
  const [testResult, setTestResult] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  if (!isOpen) return null;

  const originUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  const sseUrl = `${originUrl}/api/mcp/sse`;

  const claudeConfigJson = JSON.stringify(
    {
      mcpServers: {
        "leadradar-ai": {
          url: sseUrl,
          type: "sse",
        },
      },
    },
    null,
    2
  );

  const hermesConfigJson = JSON.stringify(
    {
      mcpServers: {
        "leadradar-ai": {
          url: sseUrl,
          type: "sse",
          description: "LeadRadar AI - Servidor MCP para Prospecção Autônoma B2B de Landing Pages",
        },
      },
    },
    null,
    2
  );

  const handleCopy = () => {
    navigator.clipboard.writeText(claudeConfigJson);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyHermes = () => {
    navigator.clipboard.writeText(hermesConfigJson);
    setCopiedHermes(true);
    setTimeout(() => setCopiedHermes(false), 2000);
  };

  const runMcpTest = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/mcp/info');
      const data = await res.json();
      setTestResult(JSON.stringify(data, null, 2));
    } catch (err: any) {
      setTestResult(`Erro no teste: ${err?.message || 'Falha de conexão'}`);
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col my-auto max-h-[90vh]">
        {/* Header */}
        <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-indigo-600 rounded-xl text-white shadow-md">
              <Cpu className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-bold text-lg">Servidor MCP (Model Context Protocol)</h3>
                <span className="bg-emerald-500/20 text-emerald-400 text-[11px] font-bold px-2 py-0.5 rounded-full border border-emerald-500/30 flex items-center space-x-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  <span>Online & Ativo</span>
                </span>
              </div>
              <p className="text-slate-400 text-xs">Conecte Agentes de IA autônomos para automatizar a prospecção B2B</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-5 pt-3 gap-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab('hermes')}
            className={`px-3.5 py-2 text-xs font-bold rounded-t-xl transition-all border-b-2 flex items-center space-x-1.5 shrink-0 ${
              activeTab === 'hermes'
                ? 'bg-white text-emerald-700 border-emerald-600 shadow-2xs'
                : 'text-slate-500 hover:text-slate-800 border-transparent'
            }`}
          >
            <span>🤖 Hermes Agent</span>
            <span className="bg-emerald-100 text-emerald-800 text-[10px] px-1.5 py-0.2 rounded-md font-extrabold">NOVO</span>
          </button>
          <button
            onClick={() => setActiveTab('config')}
            className={`px-3.5 py-2 text-xs font-bold rounded-t-xl transition-all border-b-2 shrink-0 ${
              activeTab === 'config'
                ? 'bg-white text-indigo-700 border-indigo-600 shadow-2xs'
                : 'text-slate-500 hover:text-slate-800 border-transparent'
            }`}
          >
            ⚙️ Claude / Cursor
          </button>
          <button
            onClick={() => setActiveTab('tools')}
            className={`px-3.5 py-2 text-xs font-bold rounded-t-xl transition-all border-b-2 shrink-0 ${
              activeTab === 'tools'
                ? 'bg-white text-indigo-700 border-indigo-600 shadow-2xs'
                : 'text-slate-500 hover:text-slate-800 border-transparent'
            }`}
          >
            🧰 Tools & Resources ({5})
          </button>
          <button
            onClick={() => setActiveTab('test')}
            className={`px-3.5 py-2 text-xs font-bold rounded-t-xl transition-all border-b-2 shrink-0 ${
              activeTab === 'test'
                ? 'bg-white text-indigo-700 border-indigo-600 shadow-2xs'
                : 'text-slate-500 hover:text-slate-800 border-transparent'
            }`}
          >
            🧪 Testar JSON-RPC
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6 overflow-y-auto space-y-4">
          {activeTab === 'hermes' && (
            <div className="space-y-4">
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-xs text-emerald-950 flex items-start space-x-3">
                <Sparkles className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-sm block mb-1">🤖 Conexão com Hermes Agent (Nous Research):</span>
                  O **Hermes Agent** conecta-se via transporte **SSE (Server-Sent Events)** para invocar as ferramentas de prospecção e funil B2B do LeadRadar AI de forma 100% autônoma.
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-700 flex items-center space-x-1">
                    <Terminal className="w-4 h-4 text-slate-500" />
                    <span>1. Salve o arquivo <code className="font-mono text-indigo-700 bg-slate-100 px-1 py-0.5 rounded">hermes_mcp_config.json</code>:</span>
                  </span>
                  <button
                    onClick={handleCopyHermes}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg flex items-center space-x-1.5 transition-all shadow-xs"
                  >
                    {copiedHermes ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Copiado!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copiar Config do Hermes</span>
                      </>
                    )}
                  </button>
                </div>
                <pre className="bg-slate-900 text-emerald-400 p-4 rounded-xl text-xs font-mono overflow-x-auto border border-slate-800 leading-relaxed">
                  {hermesConfigJson}
                </pre>
              </div>

              <div className="bg-slate-900 text-slate-100 p-4 rounded-xl space-y-2 border border-slate-800">
                <span className="text-xs font-bold text-indigo-400 block uppercase tracking-wider">
                  2. Comando de Execução da Prospecção no Hermes CLI:
                </span>
                <code className="text-xs font-mono text-emerald-300 block bg-slate-950 p-2.5 rounded-lg border border-slate-800 overflow-x-auto">
                  hermes agent --mcp-config ./hermes_mcp_config.json --prompt "Varra Campinas (SP) por dentistas Ouro sem site, analise com IA e crie os links de WhatsApp."
                </code>
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span>Guia Completo: <code className="font-mono text-indigo-700 font-bold">/docs/HERMES_AGENT_INTEGRATION.md</code></span>
                <a
                  href="/api/mcp/info"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-600 hover:underline flex items-center space-x-1 font-semibold"
                >
                  <span>Metadados do Servidor</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          )}

          {activeTab === 'config' && (
            <div className="space-y-4">
              <div className="bg-indigo-50/80 border border-indigo-200 rounded-xl p-4 text-xs text-indigo-900 flex items-start space-x-3">
                <Sparkles className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold block mb-1">Como usar com o Claude Desktop, Cursor ou n8n:</span>
                  Copie o código de configuração abaixo e cole no seu arquivo <code className="bg-indigo-100 px-1 py-0.5 rounded text-indigo-800 font-mono font-bold">claude_desktop_config.json</code> ou no seu agente de preferência.
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-700 flex items-center space-x-1">
                    <Terminal className="w-4 h-4 text-slate-500" />
                    <span>Configuração JSON (Protocolo SSE):</span>
                  </span>
                  <button
                    onClick={handleCopy}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg flex items-center space-x-1.5 transition-all shadow-xs"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Copiado!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copiar JSON</span>
                      </>
                    )}
                  </button>
                </div>
                <pre className="bg-slate-900 text-emerald-400 p-4 rounded-xl text-xs font-mono overflow-x-auto border border-slate-800 leading-relaxed">
                  {claudeConfigJson}
                </pre>
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span>Endpoint SSE Vivo: <code className="font-mono text-indigo-700 font-bold">{sseUrl}</code></span>
                <a
                  href="/api/mcp/info"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-600 hover:underline flex items-center space-x-1 font-semibold"
                >
                  <span>Ver Metadados Raw</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          )}

          {activeTab === 'tools' && (
            <div className="space-y-3">
              <span className="text-xs font-bold text-slate-500 block uppercase tracking-wider">
                Ferramentas Disponíveis para o Agente Autônomo:
              </span>

              <div className="grid gap-3">
                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-indigo-700">1. search_leads</span>
                    <span className="text-[10px] bg-indigo-100 text-indigo-800 font-bold px-2 py-0.5 rounded-full">MCP Tool</span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1">
                    Mapeia estabelecimentos locais na cidade/categoria com filtro inteligente por presença digital (Ouro: sem site, Prata: só instagram).
                  </p>
                </div>

                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-indigo-700">2. analyze_lead</span>
                    <span className="text-[10px] bg-indigo-100 text-indigo-800 font-bold px-2 py-0.5 rounded-full">MCP Tool</span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1">
                    Executa o diagnóstico estratégico completo de marketing com IA, gerando razões de venda, pontos fracos e abordagens.
                  </p>
                </div>

                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-indigo-700">3. generate_whatsapp_pitch</span>
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">MCP Tool</span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1">
                    Cria o script personalizado e o link wa.me direto para abordar o prospect no tom ideal (Direto, Consultivo ou Formal).
                  </p>
                </div>

                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-indigo-700">4. update_crm_status</span>
                    <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full">MCP Tool</span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1">
                    Move automaticamente o lead entre os estágios do Pipeline (Novo, Contatado, Proposta, Negociação, Fechado).
                  </p>
                </div>
              </div>

              <div className="pt-2">
                <span className="text-xs font-bold text-slate-500 block uppercase tracking-wider mb-2">
                  Recursos & Prompts Expostos:
                </span>
                <div className="flex flex-wrap gap-2 text-xs font-mono">
                  <span className="bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg border border-slate-200">
                    Resource: leads://categories
                  </span>
                  <span className="bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg border border-slate-200">
                    Resource: leads://pipeline
                  </span>
                  <span className="bg-purple-50 text-purple-700 px-2.5 py-1 rounded-lg border border-purple-200">
                    Prompt: autopilot_prospecting
                  </span>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'test' && (
            <div className="space-y-4">
              <p className="text-xs text-slate-600">
                Clique no botão abaixo para testar o endpoint de identificação do Servidor MCP e verificar os metadados devolvidos.
              </p>

              <button
                onClick={runMcpTest}
                disabled={isTesting}
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl flex items-center space-x-2 transition-all shadow-xs disabled:opacity-50"
              >
                <Zap className="w-4 h-4" />
                <span>{isTesting ? 'Carregando MCP Info...' : 'Executar Teste /api/mcp/info'}</span>
              </button>

              {testResult && (
                <div>
                  <span className="text-xs font-bold text-slate-700 block mb-1">Resposta do Servidor MCP:</span>
                  <pre className="bg-slate-900 text-emerald-400 p-4 rounded-xl text-xs font-mono max-h-60 overflow-y-auto border border-slate-800">
                    {testResult}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-50 p-4 border-t border-slate-200 flex items-center justify-between">
          <div className="text-xs text-slate-500 flex items-center space-x-1.5">
            <Server className="w-4 h-4 text-indigo-600" />
            <span>MCP SDK Protocol v1.30.0 • Compatível com Anthropic MCP Standard</span>
          </div>
          <button
            onClick={onClose}
            className="bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold px-4 py-2 rounded-xl transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
