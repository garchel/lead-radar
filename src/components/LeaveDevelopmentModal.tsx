import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface LeaveDevelopmentModalProps {
  leadName: string;
  targetStatus: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const LeaveDevelopmentModal: React.FC<LeaveDevelopmentModalProps> = ({
  leadName,
  targetStatus,
  onConfirm,
  onCancel,
}) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onCancel}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-6 py-4 border-b border-amber-200 bg-amber-50">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-full bg-amber-100 border border-amber-200 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Remover de Em Desenvolvimento?</h3>
              <p className="text-xs text-slate-600">Sairá da etapa do pipeline</p>
            </div>
          </div>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600 p-1" title="Fechar">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-3">
          <p className="text-sm text-slate-700">
            Ao mover <strong>{leadName}</strong> para <strong>{targetStatus}</strong>, o card dele no
            Kanban de <strong>Projetos</strong> será removido.
          </p>
          <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-3">
            Caso o lead volte para <strong>Em Desenvolvimento</strong>, o card será restaurado
            exatamente como estava (etapa, anotações, prazo e prioridade), sem perda de dados.
          </p>
        </div>

        <div className="flex items-center justify-end space-x-2 px-6 py-4 border-t border-slate-200 bg-slate-50">
          <button
            onClick={onCancel}
            className="bg-white hover:bg-slate-100 text-slate-700 font-semibold px-4 py-2 rounded-lg text-xs border border-slate-300"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className="bg-amber-600 hover:bg-amber-700 text-white font-semibold px-4 py-2 rounded-lg text-xs"
          >
            Remover do desenvolvimento
          </button>
        </div>
      </div>
    </div>
  );
};