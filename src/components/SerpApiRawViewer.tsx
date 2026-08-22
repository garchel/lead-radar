import React, { useState } from 'react';
import { Code, Copy, Download, ChevronDown, ChevronUp, ExternalLink, Clock, MapPin } from 'lucide-react';

interface Props {
  raw: any;
  meta: { query: string; location: string; state: string; category: string; timestamp: string; url: string } | null;
}

export const SerpApiRawViewer: React.FC<Props> = ({ raw, meta }) => {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!raw) {
    return (
      <div className="bg-slate-50 border border-dashed border-slate-300 rounded-xl p-6 text-center">
        <Code className="w-8 h-8 text-slate-400 mx-auto mb-2" />
        <p className="text-sm font-semibold text-slate-600">Nenhum retorno SerpAPI disponível</p>
        <p className="text-xs text-slate-500 mt-1">Faça uma busca com o provedor <strong>SerpAPI</strong> para ver o JSON bruto aqui. Apenas buscas com SerpAPI geram este log.</p>
      </div>
    );
  }

  const jsonStr = JSON.stringify(raw, null, 2);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(jsonStr);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const handleDownload = () => {
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `serpapi-raw-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const resultCount = raw.local_results?.length ?? raw.place_results?.length ?? 0;

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-4 py-3 bg-slate-900 text-white flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Code className="w-4 h-4 text-emerald-400" />
          <span className="text-sm font-bold">Retorno Bruto SerpAPI</span>
          <span className="text-xs bg-slate-700 px-2 py-0.5 rounded-full">{resultCount} local_results</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleCopy} className="inline-flex items-center gap-1 bg-slate-700 hover:bg-slate-600 text-white text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors">
            <Copy className="w-3.5 h-3.5" /> {copied ? 'Copiado!' : 'Copiar JSON'}
          </button>
          <button onClick={handleDownload} className="inline-flex items-center gap-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors">
            <Download className="w-3.5 h-3.5" /> Baixar
          </button>
          <button onClick={() => setExpanded(!expanded)} className="p-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {meta && (
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div>
            <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Query</span>
            <span className="font-semibold text-slate-800 flex items-center gap-1"><MapPin className="w-3 h-3" /> {meta.query}</span>
          </div>
          <div>
            <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Local</span>
            <span className="font-semibold text-slate-800">{meta.location} / {meta.state} • {meta.category}</span>
          </div>
          <div>
            <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Quando</span>
            <span className="font-semibold text-slate-800 flex items-center gap-1"><Clock className="w-3 h-3" /> {new Date(meta.timestamp).toLocaleString('pt-BR')}</span>
          </div>
          <div>
            <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">URL SerpAPI</span>
            <a href={meta.url.replace(/api_key=.*/, 'api_key=***')} target="_blank" rel="noreferrer" className="font-mono text-[11px] text-indigo-600 hover:underline flex items-center gap-1 truncate">
              <ExternalLink className="w-3 h-3 shrink-0" /> {meta.url.slice(0, 60)}...
            </a>
          </div>
        </div>
      )}

      {expanded && (
        <div className="max-h-[600px] overflow-auto bg-slate-950">
          <pre className="p-4 text-xs font-mono text-emerald-300 whitespace-pre-wrap break-words leading-relaxed">
            {jsonStr}
          </pre>
        </div>
      )}

      {!expanded && (
        <div className="px-4 py-3 bg-slate-50">
          <p className="text-xs text-slate-600">
            <strong>local_results:</strong> {resultCount} empresas reais do Google Maps. <strong>search_metadata:</strong> {raw.search_metadata ? 'presente' : 'ausente'} • <strong>search_parameters:</strong> {raw.search_parameters ? 'presente' : 'ausente'}
          </p>
          <p className="text-xs text-slate-500 mt-1">Clique em expandir para ver o JSON completo ou baixe o arquivo.</p>
        </div>
      )}
    </div>
  );
};