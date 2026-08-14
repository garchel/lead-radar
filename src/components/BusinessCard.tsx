import React from 'react';
import { Star, MapPin, Phone, Globe, Instagram, Sparkles, MessageCircle, BookmarkCheck, BookmarkPlus, AlertTriangle, ArrowRight, ExternalLink } from 'lucide-react';
import { BusinessLead } from '../types';

interface BusinessCardProps {
  lead: BusinessLead;
  onAnalyze: (lead: BusinessLead) => void;
  onToggleSave: (lead: BusinessLead) => void;
  isSaved: boolean;
}

export const BusinessCard: React.FC<BusinessCardProps> = ({
  lead,
  onAnalyze,
  onToggleSave,
  isSaved
}) => {
  const getWebsiteBadge = () => {
    if (lead.websiteStatus === 'none') {
      return (
        <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-600 border border-red-200">
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>Sem Website Detectado</span>
        </span>
      );
    }
    if (lead.websiteStatus === 'social_only') {
      return (
        <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
          <Instagram className="w-3.5 h-3.5" />
          <span>Apenas Instagram</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
        <Globe className="w-3.5 h-3.5" />
        <span>Possui Website</span>
      </span>
    );
  };

  const getScoreColor = (score: number) => {
    if (score >= 85) return 'text-indigo-700 border-indigo-200 bg-indigo-50';
    if (score >= 70) return 'text-amber-700 border-amber-200 bg-amber-50';
    return 'text-slate-600 border-slate-200 bg-slate-100';
  };

  const whatsappLink = lead.phone
    ? `https://wa.me/55${lead.phone.replace(/\D/g, '')}?text=${encodeURIComponent(
        `Olá! Encontrei o perfil da ${lead.name} no Google e reparei que vocês têm avaliações excelentes. Desenvolvi um conceito de landing page focado em agendamentos pelo WhatsApp para sua empresa. Gostaria de ver uma prévia rápida?`
      )}`
    : null;

  return (
    <div className="bg-white border border-slate-200 hover:border-indigo-300 rounded-xl p-5 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col justify-between group">
      <div className="space-y-4">
        {/* Card Header: Category + Website Status Badge */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
              {lead.category}
            </span>
            <h3 className="text-lg font-bold text-slate-900 group-hover:text-indigo-600 transition-colors mt-0.5">
              {lead.name}
            </h3>
          </div>
          {getWebsiteBadge()}
        </div>

        {/* Rating, Reviews & Score Badge */}
        <div className="flex items-center justify-between bg-slate-50 p-3 rounded-lg border border-slate-100 text-xs sm:text-sm">
          <div className="flex items-center space-x-2">
            <div className="flex items-center text-amber-500 font-bold space-x-1">
              <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
              <span>{lead.rating || '4.8'}</span>
            </div>
            <span className="text-slate-300">•</span>
            <span className="text-slate-500 font-medium">
              {lead.reviewsCount ? `${lead.reviewsCount} avaliações Google` : 'Muitas avaliações'}
            </span>
          </div>

          <div className={`px-2.5 py-1 rounded-lg border font-bold text-xs flex items-center space-x-1 ${getScoreColor(lead.opportunityScore)}`}>
            <span>Score:</span>
            <span className="text-sm font-extrabold">{lead.opportunityScore}</span>
            <span className="text-[10px] text-slate-400">/100</span>
          </div>
        </div>

        {/* Location & Phone Info */}
        <div className="space-y-1.5 text-xs text-slate-600 font-medium">
          <div className="flex items-start space-x-2">
            <MapPin className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
            <span className="line-clamp-1">{lead.address} ({lead.city} - {lead.state || 'SP'})</span>
          </div>
          {lead.phone && (
            <div className="flex items-center space-x-2 text-slate-700 font-mono">
              <Phone className="w-4 h-4 text-slate-400 shrink-0" />
              <span>{lead.phone}</span>
            </div>
          )}
          {lead.instagramHandle && (
            <a
              href={lead.instagramHandle.startsWith('http') ? lead.instagramHandle : `https://instagram.com/${lead.instagramHandle.replace(/^@/, '').trim()}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center space-x-1.5 text-pink-600 hover:text-pink-700 hover:underline transition-all font-semibold"
              title={`Acessar perfil de ${lead.name} no Instagram`}
            >
              <Instagram className="w-4 h-4 shrink-0" />
              <span>{lead.instagramHandle.startsWith('@') ? lead.instagramHandle : `@${lead.instagramHandle}`}</span>
              <ExternalLink className="w-3 h-3 text-pink-400 shrink-0" />
            </a>
          )}
        </div>

        {/* Key Insights bullets */}
        {lead.keyInsights && lead.keyInsights.length > 0 && (
          <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 text-xs space-y-1.5">
            <div className="font-bold text-slate-500 uppercase tracking-wider text-[10px] mb-1">
              Pontos de Oportunidade:
            </div>
            {lead.keyInsights.slice(0, 3).map((insight, idx) => (
              <div key={idx} className="flex items-start space-x-1.5 text-slate-700">
                <span className="text-indigo-600 font-bold select-none">•</span>
                <span className="leading-snug">{insight}</span>
              </div>
            ))}
          </div>
        )}

        {/* Project Fee Estimate */}
        <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-100">
          <span className="text-slate-500 font-medium">Potencial de Projeto:</span>
          <span className="font-extrabold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded border border-indigo-100">
            {lead.estimatedValue}
          </span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between gap-2">
        <button
          onClick={() => onToggleSave(lead)}
          className={`p-2 rounded-lg border transition-all text-xs font-semibold flex items-center space-x-1 ${
            isSaved
              ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
              : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
          }`}
          title={isSaved ? 'Remover do Pipeline' : 'Salvar no Dashboard'}
        >
          {isSaved ? <BookmarkCheck className="w-4 h-4 text-indigo-600" /> : <BookmarkPlus className="w-4 h-4" />}
          <span className="hidden sm:inline">{isSaved ? 'Salvo' : 'Salvar'}</span>
        </button>

        {whatsappLink && (
          <a
            href={whatsappLink}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 transition-all text-xs font-semibold flex items-center space-x-1"
            title="Enviar mensagem no WhatsApp"
          >
            <MessageCircle className="w-4 h-4" />
            <span className="hidden sm:inline">WhatsApp</span>
          </a>
        )}

        <button
          onClick={() => onAnalyze(lead)}
          className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-3 rounded-lg shadow-sm transition-all text-xs flex items-center justify-center space-x-1.5 active:scale-98"
        >
          <Sparkles className="w-4 h-4" />
          <span>Pitch IA</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
