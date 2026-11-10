import React, { useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { BusinessLead, InteractionOutcome } from '../types';
import { FolderKanban, Download, Edit3, Sparkles, Trash2, ChevronDown, ChevronRight, PanelLeftClose, PanelLeftOpen } from 'lucide-react';

interface CrmPipelineProps {
  savedLeads: BusinessLead[];
  onUpdateStatus: (id: string, status: BusinessLead['pipelineStatus']) => void;
  onUpdateNotes: (id: string, notes: string) => void;
  onRecordOutcome: (id: string, outcome: Exclude<InteractionOutcome, 'pending'>) => void;
  onRemoveLead: (id: string) => void;
  onAnalyze: (lead: BusinessLead) => void;
}

const PIPELINE_COLUMNS: { id: BusinessLead['pipelineStatus']; title: string; color: string }[] = [
  { id: 'prospect', title: 'Novos Prospects', color: 'border-slate-200 bg-slate-100 text-slate-700' },
  { id: 'contacted', title: 'Contato Feito', color: 'border-blue-200 bg-blue-50 text-blue-700' },
  { id: 'negotiating', title: 'Em Negociação', color: 'border-amber-200 bg-amber-50 text-amber-800' },
  { id: 'em_desenvolvimento', title: 'Em Desenvolvimento', color: 'border-violet-200 bg-violet-50 text-violet-700' },
  { id: 'closed', title: 'Finalizado', color: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  { id: 'declined', title: 'Perdido', color: 'border-red-200 bg-red-50 text-red-700' },
];

interface SortableLeadCardProps {
  lead: BusinessLead;
  onUpdateNotes: (id: string, notes: string) => void;
  onRecordOutcome: (id: string, outcome: Exclude<InteractionOutcome, 'pending'>) => void;
  onRemoveLead: (id: string) => void;
  onAnalyze: (lead: BusinessLead) => void;
}

interface PipelineColumnProps {
  id: BusinessLead['pipelineStatus'];
  title: string;
  color: string;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

/**
 * Etapa do kanban como ACORDEÃO horizontal: cada coluna fica lado a lado (a tela
 * nunca empilha as etapas) e o cabeçalho abre/fecha o conteúdo.
 * Recolhida ela continua sendo alvo de drop — dá para mover um card para uma
 * etapa fechada.
 */
const PipelineColumn: React.FC<PipelineColumnProps> = ({ id, title, color, count, collapsed, onToggle, children }) => {
  const { setNodeRef, isOver } = useDroppable({ id });

  // Recolhida: a coluna inteira é o botão de expandir (alvo grande, cor da etapa).
  if (collapsed) {
    return (
      <section
        ref={setNodeRef}
        aria-label={`Etapa ${title}`}
        className={`shrink-0 w-[78px] transition-all duration-200 ${isOver ? 'ring-2 ring-indigo-300 rounded-2xl' : ''}`}
      >
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={false}
          title={`Expandir ${title} (${count})`}
          className={`w-full min-h-[220px] flex flex-col items-center gap-2 py-3 rounded-2xl border font-bold cursor-pointer transition-transform hover:scale-[1.02] hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${color}`}
        >
          <ChevronRight className="w-4 h-4" />
          <span className="px-1.5 py-0.5 rounded-full bg-white text-slate-800 text-[10px] font-bold border border-slate-200">
            {count}
          </span>
          <span className="[writing-mode:vertical-rl] rotate-180 text-[11px] tracking-wide">
            {title}
          </span>
          <span className="mt-auto text-[9px] uppercase tracking-wider opacity-70">abrir</span>
        </button>
      </section>
    );
  }

  return (
    <section
      ref={setNodeRef}
      aria-label={`Etapa ${title}`}
      className={`shrink-0 w-[330px] bg-slate-50 border rounded-2xl flex flex-col transition-all duration-200 ${
        isOver ? 'border-indigo-400 ring-2 ring-indigo-100' : 'border-slate-200'
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded
        title={`Recolher ${title}`}
        className={`w-full p-2.5 rounded-t-2xl border-b font-bold text-xs flex items-center justify-between gap-2 cursor-pointer hover:brightness-[0.98] ${color}`}
      >
        <span className="truncate">{title}</span>
        <span className="flex items-center gap-1.5 shrink-0">
          <span className="px-2 py-0.5 rounded-full bg-white text-slate-800 text-[10px] font-bold border border-slate-200">
            {count}
          </span>
          <ChevronDown className="w-3.5 h-3.5" />
        </span>
      </button>

      <div className="p-2.5 flex-1 min-h-[160px] max-h-[68vh] overflow-y-auto overscroll-contain">
        {children}
      </div>
    </section>
  );
};

const SortableLeadCard: React.FC<SortableLeadCardProps> = ({
  lead,
  onUpdateNotes,
  onRecordOutcome,
  onRemoveLead,
  onAnalyze,
}) => {
  const [editingNotesId, setEditingNotesId] = useState<string | null>(null);
  const [tempNotes, setTempNotes] = useState<string>('');

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: lead.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="bg-white border border-slate-200 hover:border-indigo-300 p-4 rounded-xl space-y-3 shadow-sm text-xs transition-all cursor-grab active:cursor-grabbing"
    >
      <div>
        <div className="font-bold text-slate-900 line-clamp-1">{lead.name}</div>
        <div className="text-slate-500 text-[11px] font-medium">{lead.category} • {lead.city}</div>
      </div>

      <div className="bg-slate-50 p-2 rounded-lg border border-slate-200 font-semibold text-indigo-700 flex items-center justify-between">
        <span className="text-slate-500 text-[10px]">Projeto:</span>
        <span className="font-bold">{lead.estimatedValue || 'Valor não informado'}</span>
      </div>

      {lead.lastContactAt && (
        <div className="space-y-2 rounded-lg border border-indigo-100 bg-indigo-50 p-2">
          <label className="text-[10px] text-indigo-700 font-bold uppercase block">Resultado do contato</label>
          {lead.lastContactOutcome === 'pending' && !lead.doNotContact && (
            <select
              defaultValue=""
              onChange={(event) => {
                const outcome = event.target.value as Exclude<InteractionOutcome, 'pending'>;
                if (outcome) onRecordOutcome(lead.id, outcome);
              }}
              className="w-full bg-white border border-indigo-200 rounded-lg text-slate-800 text-xs p-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Registrar resposta...</option>
              <option value="no_response">Ainda não respondeu</option>
              <option value="negative">Resposta negativa</option>
              <option value="positive">Demonstrou interesse</option>
              <option value="meeting_scheduled">Reunião agendada</option>
              <option value="negotiating">Em negociação</option>
              <option value="do_not_contact">Não contatar novamente</option>
            </select>
          )}
          {lead.nextContactAt && !lead.doNotContact && (
            <p className="text-[10px] text-indigo-700">
              Próximo contato: {new Date(lead.nextContactAt).toLocaleDateString('pt-BR')}
            </p>
          )}
          {lead.doNotContact && <p className="text-[10px] text-red-700">Recontato bloqueado pela empresa.</p>}
        </div>
      )}

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
  );
};

const COLLAPSED_STORAGE_KEY = 'leadradar.crm.stages.collapsed.v1';

function readCollapsedStages(): string[] {
  try {
    const raw = localStorage.getItem(COLLAPSED_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export const CrmPipeline: React.FC<CrmPipelineProps> = ({
  savedLeads,
  onUpdateStatus,
  onUpdateNotes,
  onRecordOutcome,
  onRemoveLead,
  onAnalyze,
}) => {
  // Quais etapas estão recolhidas — persistido para sobreviver a recarregar a página.
  const [collapsedStages, setCollapsedStages] = useState<string[]>(() => readCollapsedStages());

  const persistCollapsed = (next: string[]) => {
    setCollapsedStages(next);
    try {
      localStorage.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* modo privado / storage cheio: só não persiste */
    }
  };

  const toggleStage = (id: string) => {
    persistCollapsed(
      collapsedStages.includes(id) ? collapsedStages.filter((item) => item !== id) : [...collapsedStages, id]
    );
  };

  const collapseAll = () => persistCollapsed(PIPELINE_COLUMNS.map((col) => col.id));
  const expandAll = () => persistCollapsed([]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor)
  );

  const totalLeads = savedLeads.length;
  const closedCount = savedLeads.filter(l => l.pipelineStatus === 'closed').length;
  const negotiatingCount = savedLeads.filter(l => l.pipelineStatus === 'negotiating').length;

  const totalPipelineValue = savedLeads.reduce((acc, lead) => {
    if (!lead.estimatedValue) return acc;
    const numbers = lead.estimatedValue.match(/\\d[\\d.]*/g) || [];
    const values = numbers
      .map((value) => Number(value.replace(/\\./g, '')))
      .filter((value) => Number.isFinite(value));
    if (values.length === 0) return acc;
    const average = values.reduce((sum, value) => sum + value, 0) / values.length;
    return acc + average;
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
      `"${l.notes || ''}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `pipeline_lead_finder_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const leadId = active.id as string;

    // O alvo do drop pode ser uma coluna ou um card — nesse caso,
    // resolvemos para a coluna (pipelineStatus) à qual o card pertence.
    let destinationColumnId = over.id as string;
    const overLead = savedLeads.find(l => l.id === destinationColumnId);
    if (overLead) destinationColumnId = overLead.pipelineStatus || 'prospect';

    const isColumn = PIPELINE_COLUMNS.some(col => col.id === destinationColumnId);
    if (!isColumn) return;

    const lead = savedLeads.find(l => l.id === leadId);
    if (!lead) return;

    // If the lead is already in that column, do nothing
    if (lead.pipelineStatus === destinationColumnId) return;

    // Update status
    onUpdateStatus(leadId, destinationColumnId as BusinessLead['pipelineStatus']);
  };

  return (
    <div className="space-y-6 py-6 px-4 sm:px-6 lg:px-8">
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
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-slate-500">
                Etapas lado a lado — clique no cabeçalho da etapa para recolher ou expandir. O estado fica salvo.
              </p>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={expandAll}
                  disabled={collapsedStages.length === 0}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                >
                  <PanelLeftOpen className="w-3.5 h-3.5" /> Expandir todas
                </button>
                <button
                  type="button"
                  onClick={collapseAll}
                  disabled={collapsedStages.length === PIPELINE_COLUMNS.length}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                >
                  <PanelLeftClose className="w-3.5 h-3.5" /> Recolher todas
                </button>
              </div>
            </div>

            <div className="flex items-start gap-3 overflow-x-auto pb-3 scroll-smooth">
              {PIPELINE_COLUMNS.map(col => {
                const columnLeads = savedLeads.filter(l => l.pipelineStatus === col.id);
                const columnLeadIds = columnLeads.map(l => l.id);
                const isCollapsed = collapsedStages.includes(col.id);

                return (
                  <PipelineColumn
                    key={col.id}
                    id={col.id}
                    title={col.title}
                    color={col.color}
                    count={columnLeads.length}
                    collapsed={isCollapsed}
                    onToggle={() => toggleStage(col.id)}
                  >
                    <SortableContext
                      items={columnLeadIds}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="space-y-3">
                        {columnLeads.map(lead => (
                          <SortableLeadCard
                            key={lead.id}
                            lead={lead}
                            onUpdateNotes={onUpdateNotes}
                            onRecordOutcome={onRecordOutcome}
                            onRemoveLead={onRemoveLead}
                            onAnalyze={onAnalyze}
                          />
                        ))}
                        {columnLeads.length === 0 && (
                          <p className="text-[11px] text-slate-400 text-center py-6 border border-dashed border-slate-300 rounded-xl">
                            arraste um lead para cá
                          </p>
                        )}
                      </div>
                    </SortableContext>
                  </PipelineColumn>
                );
              })}
            </div>
          </div>
        </DndContext>
      )}
    </div>
  );
};