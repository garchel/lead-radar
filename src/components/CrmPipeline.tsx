import React, { useState } from 'react';
import { BusinessLead, PipelineStats } from '../types';
import { FolderKanban, DollarSign, CheckCircle2, MessageCircle, Sparkles, Trash2, Edit3, Download, ExternalLink, ArrowRight } from 'lucide-react';

interface CrmPipelineProps {
  savedLeads: BusinessLead[];
  onUpdateStatus: (id: string, status: BusinessLead['pipelineStatus']) => void;
  onUpdateNotes: (id: string, notes: string) => void;
  onRemoveLead: (id: string) => void;
  onAnalyze: (lead: BusinessLead) => void;
}

const PIPELINE_COLUMNS: { id: BusinessLead['pipelineStatus']; title: string; color: string }[] = [
  { id: 'prospect', title: 'Novos Prospects', color: 'border-slate-200 bg-slate-100 text-slate-700' },
  { id: 'contacted', title: 'Contato Feito', color: 'border-blue-200 bg-blue-50 text-blue-700' },
  { id: 'negotiating', title: 'Em Negociação', color: 'border-amber-200 bg-amber-50 text-amber-800' },
  { id: 'closed', title: 'Fechado / Ganho 🎉', color: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  { id: 'declined', title: 'Perdido', color: 'border-red-200 bg-red-50 text-red-700' },
];

export const CrmPipeline: React.FC<CrmPipelineProps> = ({
  savedLeads,
  onUpdateStatus,
  onUpdateNotes,
  onRemoveLead,
  onAnalyze
}) => {
  const [editingNotesId, setEditingNotesId] = useState<string | null>(null);
  const [tempNotes, setTempNotes] = useState<string>('');

  // Calculate stats
  const totalLeads = savedLeads.length;
  const closedCount = savedLeads.filter(l => l.pipelineStatus === 'closed').length;
  const negotiatingCount = savedLeads.filter(l => l.pipelineStatus === 'negotiating').length;

  // Revenue estimation
  const totalPipelineValue = savedLeads.reduce((acc, lead) => {
    // Parse range e.g. "R$ 1.800 - R$ 3.000" -> average 2400
    const numbers = lead.estimatedValue.match(/\d+(\.\d+)?/g);
    if (numbers && numbers.length > 0) {
      const val = parseInt(numbers[0].replace('.', ''), 10) * 1000 || 2000;
      return acc + val;
    }
    return acc + 2000;
  }, 0);

  const exportCSV = () => {
    const headers = ['Nome', 'Categoria', 'Cidade', 'Telefone', 'Status', 'Valor Estimado', 'Notas'];
    const rows = savedLeads.map(l => [
      `"${l.name}"`,
      `"${l.category}"`,
      `"${l.city}"`,
      `"${l.phone || ''}"`,
      `"${l.pipelineStatus || 'prospect'}"`,
      `"${l.estimatedValue}"`,
      `"${l.notes || ''}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `pipeline_lead_finder_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 py-6 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      {/* Top Banner Stats */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white border border-slate-200 p-6 rounded-2xl shadow-sm">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 flex items-center space-x-2">
            <FolderKanban className="w-6 h-6 text-indigo-600" />
            <span>Dashboard de Prospecção & CRM</span>
          </h2>
          <p className="text-slate-500 text-sm mt-1">
            Acompanhe o funil de propostas de criação de Landing Pages enviadas para empresas locais.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs sm:text-sm">
            <span className="text-slate-500 font-medium block">Total de Leads:</span>
            <strong className="text-slate-900 text-lg font-bold">{totalLeads} empresas</strong>
          </div>

          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs sm:text-sm">
            <span className="text-slate-500 font-medium block">Potencial do Funil:</span>
            <strong className="text-indigo-600 text-lg font-bold">R$ {totalPipelineValue.toLocaleString('pt-BR')}</strong>
          </div>

          <button
            onClick={exportCSV}
            disabled={totalLeads === 0}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-semibold px-4 py-3 rounded-xl text-xs flex items-center space-x-2 shadow-sm transition-all"
          >
            <Download className="w-4 h-4" />
            <span>Exportar CSV</span>
          </button>
        </div>
      </div>

      {/* Kanban Board Columns */}
      {savedLeads.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center space-y-3 shadow-sm">
          <FolderKanban className="w-12 h-12 text-slate-400 mx-auto" />
          <h3 className="text-slate-800 font-bold text-lg">Seu Pipeline CRM está vazio</h3>
          <p className="text-slate-500 text-sm max-w-md mx-auto">
            Navegue no <strong>Mapeamento de Região</strong> e clique em <strong>"Salvar"</strong> nas empresas encontradas para começar a gerenciar suas abordagens comerciais.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {PIPELINE_COLUMNS.map(col => {
            const columnLeads = savedLeads.filter(l => (l.pipelineStatus || 'prospect') === col.id);

            return (
              <div key={col.id} className="bg-slate-50 border border-slate-200 rounded-2xl p-3 flex flex-col space-y-3 min-h-[500px]">
                {/* Column Header */}
                <div className={`p-2.5 rounded-xl border font-bold text-xs flex items-center justify-between ${col.color}`}>
                  <span>{col.title}</span>
                  <span className="px-2 py-0.5 rounded-full bg-white text-slate-800 text-[10px] font-bold border border-slate-200">
                    {columnLeads.length}
                  </span>
                </div>

                {/* Column Cards */}
                <div className="space-y-3 flex-1 overflow-y-auto">
                  {columnLeads.map(lead => (
                    <div key={lead.id} className="bg-white border border-slate-200 hover:border-indigo-300 p-4 rounded-xl space-y-3 shadow-sm text-xs transition-all">
                      <div>
                        <div className="font-bold text-slate-900 line-clamp-1">{lead.name}</div>
                        <div className="text-slate-500 text-[11px] font-medium">{lead.category} • {lead.city}</div>
                      </div>

                      <div className="bg-slate-50 p-2 rounded-lg border border-slate-200 font-semibold text-indigo-700 flex items-center justify-between">
                        <span className="text-slate-500 text-[10px]">Projeto:</span>
                        <span className="font-bold">{lead.estimatedValue}</span>
                      </div>

                      {/* Status Selector */}
                      <div>
                        <label className="text-[10px] text-slate-500 font-bold uppercase block mb-1">Mover Status:</label>
                        <select
                          value={lead.pipelineStatus || 'prospect'}
                          onChange={(e) => onUpdateStatus(lead.id, e.target.value as any)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg text-slate-800 text-xs p-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                        >
                          <option value="prospect">1. Prospect Novo</option>
                          <option value="contacted">2. Contato Feito</option>
                          <option value="negotiating">3. Em Negociação</option>
                          <option value="closed">4. Fechado / Ganho 🎉</option>
                          <option value="declined">5. Perdido</option>
                        </select>
                      </div>

                      {/* Notes Section */}
                      <div className="pt-2 border-t border-slate-100 space-y-1">
                        <div className="flex items-center justify-between text-[11px] text-slate-500 font-medium">
                          <span>Anotações:</span>
                          <button
                            onClick={() => {
                              setEditingNotesId(lead.id);
                              setTempNotes(lead.notes || '');
                            }}
                            className="text-indigo-600 hover:underline flex items-center space-x-1 font-semibold"
                          >
                            <Edit3 className="w-3 h-3" />
                            <span>Editar</span>
                          </button>
                        </div>

                        {editingNotesId === lead.id ? (
                          <div className="space-y-2">
                            <textarea
                              rows={2}
                              value={tempNotes}
                              onChange={(e) => setTempNotes(e.target.value)}
                              className="w-full bg-slate-50 border border-slate-300 rounded p-1.5 text-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                              placeholder="Ex: Liguei dia 10, pediu orçamento via WhatsApp..."
                            />
                            <div className="flex justify-end space-x-1">
                              <button
                                onClick={() => {
                                  onUpdateNotes(lead.id, tempNotes);
                                  setEditingNotesId(null);
                                }}
                                className="bg-indigo-600 text-white font-semibold px-2 py-1 rounded text-[10px]"
                              >
                                Salvar
                              </button>
                              <button
                                onClick={() => setEditingNotesId(null)}
                                className="bg-slate-200 text-slate-700 px-2 py-1 rounded text-[10px]"
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-slate-600 bg-slate-50 p-2 rounded border border-slate-200/60 italic text-[11px] line-clamp-2">
                            {lead.notes || 'Nenhuma nota adicionada.'}
                          </p>
                        )}
                      </div>

                      {/* Card Action footer */}
                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                        <button
                          onClick={() => onAnalyze(lead)}
                          className="text-indigo-600 font-bold flex items-center space-x-1 hover:underline text-[11px]"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>Roteiro Pitch</span>
                        </button>

                        <button
                          onClick={() => onRemoveLead(lead.id)}
                          className="text-slate-400 hover:text-red-500 transition-colors p-1"
                          title="Remover do Pipeline"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
