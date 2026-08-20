import React from 'react';
import { X, GitMerge, CopyPlus, AlertTriangle, Building2, MapPin, Phone, Globe } from 'lucide-react';
import { BusinessLead } from '../types';

interface DuplicateMergeModalProps {
  existing: BusinessLead;
  incoming: BusinessLead;
  onMerge: () => void;
  onSeparate: () => void;
  onClose: () => void;
}

function ValueCell({ label, value }: { label: string; value?: string | number }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500">{label}</div>
      <div className="text-xs font-semibold text-slate-800 truncate" title={String(value ?? '—')}>
        {value || '—'}
      </div>
    </div>
  );
}

export const DuplicateMergeModal: React.FC<DuplicateMergeModalProps> = ({
  existing,
  incoming,
  onMerge,
  onSeparate,
  onClose,
}) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs" role="dialog" aria-modal="true">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden">
        <div className="p-5 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-white">
          <div className="flex items-center space-x-2 text-white font-bold text-lg">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
            <span>Possível empresa duplicada</span>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white transition-colors" aria-label="Fechar">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-sm text-slate-600">
            Encontramos um cadastro com o mesmo nome na mesma cidade. Pode ser a mesma empresa ou
            duas empresas distintas. Como devemos prosseguir?
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2.5">
              <div className="flex items-center space-x-1.5 text-indigo-700 font-bold text-xs uppercase tracking-wider">
                <Building2 className="w-3.5 h-3.5" />
                <span>Já cadastrado</span>
              </div>
              <div className="font-bold text-slate-900 text-sm line-clamp-1">{existing.name}</div>
              <ValueCell label="Cidade" value={existing.city} />
              <ValueCell label="Endereço" value={existing.address} />
              <ValueCell label="Telefone" value={existing.phone} />
              <ValueCell label="Site" value={existing.websiteUrl} />
              {existing.lastContactAt && (
                <ValueCell label="Último contato" value={new Date(existing.lastContactAt).toLocaleDateString('pt-BR')} />
              )}
            </div>

            <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-3 space-y-2.5">
              <div className="flex items-center space-x-1.5 text-slate-600 font-bold text-xs uppercase tracking-wider">
                <CopyPlus className="w-3.5 h-3.5" />
                <span>Novo cadastro</span>
              </div>
              <div className="font-bold text-slate-900 text-sm line-clamp-1">{incoming.name}</div>
              <ValueCell label="Cidade" value={incoming.city} />
              <ValueCell label="Endereço" value={incoming.address} />
              <ValueCell label="Telefone" value={incoming.phone} />
              <ValueCell label="Site" value={incoming.websiteUrl} />
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-xl border border-indigo-100 bg-indigo-50 p-3 text-[11px] text-indigo-800">
            <GitMerge className="w-4 h-4 shrink-0 mt-0.5" />
            <p>
              Ao <strong>mesclar</strong>, os dados mais completos são unificados no cadastro existente
              e o histórico de interações é preservado. Nenhuma nova empresa é criada.
            </p>
          </div>
        </div>

        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-end gap-2">
          <button
            onClick={onSeparate}
            className="flex items-center space-x-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 px-4 py-2.5 rounded-xl border border-slate-300 transition-all"
          >
            <CopyPlus className="w-3.5 h-3.5" />
            <span>Cadastrar separado</span>
          </button>
          <button
            onClick={onMerge}
            className="flex items-center space-x-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 px-5 py-2.5 rounded-xl shadow-sm transition-all"
          >
            <GitMerge className="w-3.5 h-3.5" />
            <span>Mesclar registros</span>
          </button>
          <button
            onClick={onClose}
            className="text-xs font-semibold text-slate-500 hover:text-slate-700 px-3 py-2.5 rounded-xl transition-all"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
};