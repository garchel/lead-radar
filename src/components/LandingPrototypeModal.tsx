import React from 'react';
import { X, Monitor } from 'lucide-react';
import { BusinessLead, LeadAnalysisResult } from '../types';
import { LandingPagePrototype } from './LandingPagePrototype';

/**
 * Protótipo da landing page em tela cheia.
 *
 * Antes ele era uma ABA dentro do modal de análise, que já tem diagnóstico,
 * scripts de WhatsApp/e-mail/ligação e dossiê — 544 linhas num modal só. Aqui o
 * protótipo ganha espaço (é uma página inteira) e o modal de análise fica com o
 * que é análise.
 */
export const LandingPrototypeModal: React.FC<{
  lead: BusinessLead;
  analysis: LeadAnalysisResult | null;
  onClose: () => void;
}> = ({ lead, analysis, onClose }) => (
  <div className="fixed inset-0 z-[60] bg-slate-900/70 backdrop-blur-xs p-3 sm:p-6 overflow-y-auto">
    <div className="mx-auto w-full max-w-6xl bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col max-h-[94vh]">
      <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-200 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Monitor className="w-4 h-4 text-indigo-600 shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-bold text-slate-900 truncate">Protótipo — {lead.name}</div>
            <div className="text-[11px] text-slate-500">Prévia do site que seria apresentado ao cliente</div>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700"
        >
          <X className="w-3.5 h-3.5" /> Fechar
        </button>
      </div>
      <div className="p-4 overflow-y-auto">
        <LandingPagePrototype lead={lead} analysis={analysis} />
      </div>
    </div>
  </div>
);
