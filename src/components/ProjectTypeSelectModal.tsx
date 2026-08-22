import React, { useState } from 'react';
import { Rocket, Globe, X } from 'lucide-react';
import { ProjectType } from '../types';

interface ProjectTypeSelectModalProps {
  leadName: string;
  onConfirm: (type: ProjectType) => void;
  onCancel: () => void;
}

const OPTIONS: { id: ProjectType; title: string; description: string; icon: React.ReactNode; active: string }[] = [
  {
    id: 'landing_page',
    title: 'Landing Page',
    description: 'Página única de alta conversão para captar leads de uma oferta.',
    icon: <Rocket className="w-6 h-6" />,
    active: 'border-violet-400 bg-violet-50 ring-2 ring-violet-100',
  },
  {
    id: 'site_institucional',
    title: 'Site Institucional',
    description: 'Site completo da empresa: páginas, serviços, sobre e contato.',
    icon: <Globe className="w-6 h-6" />,
    active: 'border-sky-400 bg-sky-50 ring-2 ring-sky-100',
  },
];

export const ProjectTypeSelectModal: React.FC<ProjectTypeSelectModalProps> = ({
  leadName,
  onConfirm,
  onCancel,
}) => {
  const [selected, setSelected] = useState<ProjectType>('landing_page');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onCancel}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-6 py-4 border-b border-violet-200 bg-violet-50">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-full bg-violet-100 border border-violet-200 flex items-center justify-center shrink-0">
              <Rocket className="w-5 h-5 text-violet-600" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Novo Projeto</h3>
              <p className="text-xs text-slate-600">Mover <strong>{leadName}</strong> para Em Desenvolvimento</p>
            </div>
          </div>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600 p-1" title="Fechar">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-3">
          <p className="text-sm text-slate-700">Qual o tipo do projeto?</p>

          {OPTIONS.map((opt) => (
            <button
              key={opt.id}
              onClick={() => setSelected(opt.id)}
              className={`w-full flex items-start space-x-3 text-left border rounded-xl p-4 transition-all ${
                selected === opt.id
                  ? opt.active
                  : 'border-slate-200 hover:border-slate-300 bg-white'
              }`}
            >
              <span className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 border ${
                opt.id === 'landing_page'
                  ? 'bg-violet-100 border-violet-200 text-violet-600'
                  : 'bg-sky-100 border-sky-200 text-sky-600'
              }`}>
                {opt.icon}
              </span>
              <span>
                <span className="block text-sm font-bold text-slate-900">{opt.title}</span>
                <span className="block text-xs text-slate-500 mt-0.5">{opt.description}</span>
              </span>
            </button>
          ))}
        </div>

        <div className="flex items-center justify-end space-x-2 px-6 py-4 border-t border-slate-200 bg-slate-50">
          <button
            onClick={onCancel}
            className="bg-white hover:bg-slate-100 text-slate-700 font-semibold px-4 py-2 rounded-lg text-xs border border-slate-300"
          >
            Cancelar
          </button>
          <button
            onClick={() => onConfirm(selected)}
            className="bg-violet-600 hover:bg-violet-700 text-white font-semibold px-4 py-2 rounded-lg text-xs"
          >
            Criar projeto
          </button>
        </div>
      </div>
    </div>
  );
};