import React, { useState, useEffect } from 'react';
import { X, Sparkles, Copy, Check, MessageCircle, Mail, PhoneCall, Layout, ShieldAlert, ArrowRight, DollarSign, Download, ExternalLink, RefreshCw, Instagram, Printer, FileText, Palette, Search, Image as ImageIcon } from 'lucide-react';
import { BrandSnapshot, BusinessLead, LeadAnalysisResult } from '../types';
import { LandingPrototypeModal } from './LandingPrototypeModal';
import { printLeadDossier } from '../utils/exportUtils';

interface LeadAnalysisModalProps {
  lead: BusinessLead | null;
  onClose: () => void;
  onSaveLead: (lead: BusinessLead) => void;
  isSaved: boolean;
}

export const LeadAnalysisModal: React.FC<LeadAnalysisModalProps> = ({
  lead,
  onClose,
  onSaveLead,
  isSaved
}) => {
  const [analysis, setAnalysis] = useState<LeadAnalysisResult | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'whatsapp' | 'email' | 'call' | 'preview'>('whatsapp');
  const [copiedScript, setCopiedScript] = useState<string | null>(null);
  const [brandSnapshot, setBrandSnapshot] = useState<BrandSnapshot | null>(lead?.brandSnapshot ?? null);
  const [brandLoading, setBrandLoading] = useState<boolean>(false);
  const [brandError, setBrandError] = useState<string | null>(null);
  const [showPrototype, setShowPrototype] = useState(false);

  useEffect(() => {
    setBrandSnapshot(lead?.brandSnapshot ?? null);
    setBrandError(null);
  }, [lead?.id, lead?.brandSnapshot?.createdAt]);

  // O lead no estado do App pode estar defasado (o snapshot é gravado no
  // servidor). Ao abrir um lead já salvo, busca a versão mais recente.
  useEffect(() => {
    if (!lead || !isSaved) return;
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`/api/leads/${lead.id}`);
        const data = await response.json().catch(() => ({}));
        const fetched = data?.lead?.brandSnapshot as BrandSnapshot | undefined;
        if (!cancelled && fetched) {
          setBrandSnapshot((current) => {
            if (!current) return fetched;
            return new Date(fetched.createdAt) > new Date(current.createdAt) ? fetched : current;
          });
        }
      } catch {
        /* mantém o snapshot que já veio no lead */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lead?.id, isSaved]);

  const handleResearchBrand = async (force: boolean) => {
    if (!lead || brandLoading) return;
    setBrandLoading(true);
    setBrandError(null);
    try {
      const response = await fetch(`/api/leads/${lead.id}/brand-research`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.success === false) {
        throw new Error(data?.error || `A pesquisa falhou (HTTP ${response.status}).`);
      }
      setBrandSnapshot(data.snapshot);
    } catch (err: any) {
      setBrandError(err?.message || 'Falha ao pesquisar a identidade visual do lead.');
    } finally {
      setBrandLoading(false);
    }
  };

  useEffect(() => {
    if (!lead) return;

    const fetchAnalysis = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch('/api/analyze-lead', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            businessName: lead.name,
            category: lead.category,
            address: lead.address,
            city: lead.city,
            state: lead.state,
            phone: lead.phone,
            rating: lead.rating,
            reviewsCount: lead.reviewsCount,
            websiteStatus: lead.websiteStatus,
            suggestedTicket: lead.suggestedTicket,
            marketTier: lead.marketTier,
            userNotes: lead.notes
          })
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok || data?.success === false) {
          throw new Error(data?.error || `A análise falhou (HTTP ${response.status}).`);
        }
        if (!data.analysis) {
          throw new Error('A API não retornou uma análise válida.');
        }
        setAnalysis(data.analysis);
      } catch (err: any) {
        setError(err?.message || 'Falha ao gerar a análise do lead.');
      } finally {
        setLoading(false);
      }
    };

    fetchAnalysis();
  }, [lead]);

  if (!lead) return null;

  const handleCopy = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopiedScript(type);
    setTimeout(() => setCopiedScript(null), 2500);
  };


  const whatsappCleanNumber = lead.phone ? lead.phone.replace(/\D/g, '') : '';
  const currentScript =
    activeTab === 'whatsapp'
      ? analysis?.customPitchWhatsApp || ''
      : activeTab === 'email'
      ? analysis?.customPitchEmail || ''
      : analysis?.customPitchColdCall || '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col my-8 max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-5 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-white">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-bold shadow-md">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-lg font-bold text-white">{lead.name}</h2>
                <span className="text-xs px-2.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-semibold border border-indigo-500/30">
                  Análise Estratégica IA
                </span>
              </div>
              <div className="flex items-center space-x-2 text-xs text-slate-400 flex-wrap">
                <span>{lead.category} • {lead.city}</span>
                {lead.instagramHandle && (
                  <>
                    <span>•</span>
                    <a
                      href={lead.instagramHandle.startsWith('http') ? lead.instagramHandle : `https://instagram.com/${lead.instagramHandle.replace(/^@/, '').trim()}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center space-x-1 text-pink-400 hover:text-pink-300 underline font-semibold transition-colors"
                      title={`Acessar perfil de ${lead.name} no Instagram`}
                    >
                      <Instagram className="w-3.5 h-3.5 shrink-0" />
                      <span>{lead.instagramHandle.startsWith('@') ? lead.instagramHandle : `@${lead.instagramHandle}`}</span>
                      <ExternalLink className="w-3 h-3 text-pink-300 shrink-0" />
                    </a>
                  </>
                )}
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-white">
          {loading ? (
            <div className="py-16 text-center space-y-4">
              <RefreshCw className="w-10 h-10 animate-spin text-indigo-600 mx-auto" />
              <div>
                <h3 className="text-slate-900 font-bold text-lg">Gerando Diagnóstico de Vendas com Gemini...</h3>
                <p className="text-slate-500 text-sm">Criando cópias de e-mail, WhatsApp e conceito de landing page personalizado.</p>
              </div>
            </div>
          ) : analysis ? (
            <>
              {/* Summary Metrics Bar */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex items-center justify-between">
                  <div>
                    <span className="text-xs text-slate-500 font-medium block">Potencial do Projeto</span>
                    <strong className="text-indigo-700 text-lg font-bold">{analysis.revenuePotential}</strong>
                  </div>
                  <DollarSign className="w-8 h-8 text-indigo-600/20" />
                </div>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex items-center justify-between">
                  <div>
                    <span className="text-xs text-slate-500 font-medium block">Score de Oportunidade</span>
                    <strong className="text-slate-900 text-lg font-bold">{analysis.opportunityScore}/100</strong>
                  </div>
                  <div className="w-10 h-10 rounded-full border-2 border-indigo-600 flex items-center justify-center font-bold text-xs text-indigo-600">
                    {analysis.opportunityScore}%
                  </div>
                </div>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex items-center justify-between">
                  <div>
                    <span className="text-xs text-slate-500 font-medium block">Urgência de Prospecção</span>
                    <strong className="text-amber-700 text-lg font-bold capitalize">{analysis.urgencyLevel} Urgência</strong>
                  </div>
                  <ShieldAlert className="w-8 h-8 text-amber-500/30" />
                </div>
              </div>

              {/* Identidade visual do lead (pesquisa em perfis públicos) */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 space-y-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm flex items-center space-x-2">
                      <Palette className="w-4 h-4 text-pink-600" />
                      <span>Identidade Visual do Lead</span>
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Tons, imagens e logo que o negócio já usa — entram automaticamente no dev kit da landing page.
                    </p>
                  </div>
                  <button
                    onClick={() => handleResearchBrand(Boolean(brandSnapshot))}
                    disabled={brandLoading || !isSaved}
                    className="bg-slate-900 hover:bg-slate-800 disabled:opacity-60 disabled:cursor-not-allowed text-white text-xs font-semibold px-3.5 py-2 rounded-xl flex items-center space-x-1.5 shadow-sm transition-all"
                    title={!isSaved ? 'Salve o lead no CRM primeiro' : 'Consome 1–2 buscas SerpAPI + 1 chamada Gemini vision'}
                  >
                    {brandLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                    <span>{brandLoading ? 'Pesquisando...' : brandSnapshot ? 'Refazer pesquisa' : 'Pesquisar identidade'}</span>
                  </button>
                </div>

                {brandError && (
                  <p role="alert" className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2.5">
                    {brandError}
                  </p>
                )}

                {brandSnapshot ? (
                  <div className="space-y-4">
                    {brandSnapshot.palette.length > 0 && (
                      <div>
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-2">Paleta</span>
                        <div className="flex flex-wrap gap-2">
                          {brandSnapshot.palette.map((color, i) => (
                            <div key={`${color.hex}-${i}`} className="flex items-center space-x-2 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5">
                              <span
                                className="w-6 h-6 rounded-md border border-slate-300 shadow-2xs shrink-0"
                                style={{ backgroundColor: color.hex }}
                              />
                              <span className="text-[11px] font-mono font-semibold text-slate-700">{color.hex}</span>
                              {color.role && <span className="text-[10px] text-slate-500">{color.role}</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {brandSnapshot.tone.length > 0 && (
                      <div>
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-2">Tom visual</span>
                        <div className="flex flex-wrap gap-1.5">
                          {brandSnapshot.tone.map((word) => (
                            <span key={word} className="text-[11px] bg-pink-50 text-pink-700 border border-pink-200 rounded-full px-2.5 py-1 font-medium">
                              {word}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px]">
                      <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1">
                        <span className="font-bold text-slate-500 uppercase tracking-wider block text-[10px]">Logo</span>
                        {brandSnapshot.logo ? (
                          <>
                            <p className="text-slate-700 font-medium">{brandSnapshot.logo.description || 'Logo identificado nas imagens.'}</p>
                            <p className="text-slate-500">Confiança: {Math.round((brandSnapshot.logo.confidence ?? 0) * 100)}%</p>
                          </>
                        ) : (
                          <p className="text-slate-500">Nenhum logo legível identificado.</p>
                        )}
                      </div>
                      <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1">
                        <span className="font-bold text-slate-500 uppercase tracking-wider block text-[10px]">Tipografia observada</span>
                        {brandSnapshot.typography?.display || brandSnapshot.typography?.body ? (
                          <p className="text-slate-700 font-medium">
                            {[brandSnapshot.typography?.display, brandSnapshot.typography?.body].filter(Boolean).join(' / ')}
                          </p>
                        ) : (
                          <p className="text-slate-500">Sem referência clara de fonte.</p>
                        )}
                        {brandSnapshot.typography?.notes && <p className="text-slate-500">{brandSnapshot.typography.notes}</p>}
                      </div>
                    </div>

                    <div className={`border rounded-lg p-3 space-y-1 ${brandSnapshot.confidence < 0.25 ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'}`}>
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Resumo para o design</span>
                      <p className="text-xs text-slate-700 leading-relaxed">{brandSnapshot.summary}</p>
                      {brandSnapshot.notes && <p className={`text-[11px] ${brandSnapshot.confidence < 0.25 ? 'text-amber-800' : 'text-amber-700'}`}>{brandSnapshot.notes}</p>}
                    </div>

                    {(brandSnapshot.profiles.instagram || brandSnapshot.profiles.facebook) && (
                      <div className="flex flex-wrap gap-3 text-[11px]">
                        {brandSnapshot.profiles.instagram && (
                          <a href={brandSnapshot.profiles.instagram} target="_blank" rel="noopener noreferrer" className="inline-flex items-center space-x-1 text-pink-600 hover:underline font-semibold">
                            <Instagram className="w-3.5 h-3.5" />
                            <span>Instagram</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                        {brandSnapshot.profiles.facebook && (
                          <a href={brandSnapshot.profiles.facebook} target="_blank" rel="noopener noreferrer" className="inline-flex items-center space-x-1 text-blue-600 hover:underline font-semibold">
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span>Facebook</span>
                          </a>
                        )}
                      </div>
                    )}

                    {brandSnapshot.imagery.length > 0 && (
                      <div>
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-2">Referências visuais</span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {brandSnapshot.imagery.map((item, i) => (
                            <a
                              key={`${item.url}-${i}`}
                              href={item.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-start space-x-2 bg-slate-50 border border-slate-200 rounded-lg p-2 hover:bg-slate-100 transition-colors"
                            >
                              <ImageIcon className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
                              <span className="text-[11px] text-slate-600 leading-snug">{item.description || 'Referência visual'}</span>
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-100">
                      <span>
                        Confiança geral: {Math.round(brandSnapshot.confidence * 100)}% · {brandSnapshot.imagery.length} referência(s)
                      </span>
                      <span>Pesquisado em {new Date(brandSnapshot.createdAt).toLocaleDateString('pt-BR')}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">
                    Ainda não pesquisado. A busca usa imagens e perfis públicos (Google/Instagram/Facebook) para captar a paleta,
                    o tom e o logo que o negócio já usa.
                  </p>
                )}
              </div>

              {/* Diagnóstico de Oportunidade */}
              <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 space-y-3">
                <h3 className="font-bold text-slate-900 text-sm flex items-center space-x-2">
                  <ShieldAlert className="w-4 h-4 text-amber-600" />
                  <span>Diagnóstico Comercial & Oportunidades Faltantes</span>
                </h3>
                <p className="text-slate-700 text-xs sm:text-sm leading-relaxed font-medium">
                  {analysis.whyTheyNeedLandingPage}
                </p>

                <div className="pt-2 border-t border-slate-200">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">
                    Recursos Críticos Faltantes no Negócio:
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {analysis.missingFeatures.map((feature, i) => (
                      <div key={i} className="flex items-center space-x-2 text-xs text-slate-800 bg-white p-2.5 rounded-lg border border-slate-200 font-medium shadow-2xs">
                        <Check className="w-4 h-4 text-indigo-600 shrink-0" />
                        <span>{feature}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Pitch Tabs & Scripts */}
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                  <h3 className="font-bold text-slate-900 text-sm">Scripts de Abordagem Personalizados</h3>

                  {/* Tabs */}
                  <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
                    <button
                      onClick={() => setActiveTab('whatsapp')}
                      className={`px-3 py-1.5 rounded-lg font-semibold flex items-center space-x-1.5 transition-all ${
                        activeTab === 'whatsapp' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      <span>WhatsApp</span>
                    </button>
                    <button
                      onClick={() => setActiveTab('email')}
                      className={`px-3 py-1.5 rounded-lg font-semibold flex items-center space-x-1.5 transition-all ${
                        activeTab === 'email' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Mail className="w-3.5 h-3.5" />
                      <span>E-mail</span>
                    </button>
                    <button
                      onClick={() => setActiveTab('call')}
                      className={`px-3 py-1.5 rounded-lg font-semibold flex items-center space-x-1.5 transition-all ${
                        activeTab === 'call' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <PhoneCall className="w-3.5 h-3.5" />
                      <span>Cold Call</span>
                    </button>
                    <button
                      onClick={() => setActiveTab('preview')}
                      className={`px-3 py-1.5 rounded-lg font-semibold flex items-center space-x-1.5 transition-all ${
                        activeTab === 'preview' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Layout className="w-3.5 h-3.5" />
                      <span>Protótipo</span>
                    </button>
                  </div>
                </div>

                {/* Script Display */}
                {activeTab !== 'preview' ? (
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 relative group space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">
                        {activeTab === 'whatsapp' ? 'Copie e envie direto para o proprietário' : activeTab === 'email' ? 'E-mail de Apresentação Consultiva' : 'Roteiro de Ligação de 30 Segundos'}
                      </span>
                      <button
                        onClick={() => handleCopy(currentScript, activeTab)}
                        className="flex items-center space-x-1 text-xs font-semibold px-2.5 py-1 rounded bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 transition-all shadow-2xs"
                      >
                        {copiedScript === activeTab ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-indigo-600" />
                            <span className="text-indigo-600 font-bold">Copiado!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copiar Script</span>
                          </>
                        )}
                      </button>
                    </div>

                    <textarea
                      readOnly
                      rows={6}
                      value={currentScript}
                      className="w-full bg-white border border-slate-200 rounded-lg p-3 text-xs sm:text-sm text-slate-800 font-mono focus:outline-none resize-none leading-relaxed"
                    />

                    {activeTab === 'whatsapp' && whatsappCleanNumber && (
                      <div className="pt-2 flex justify-end">
                        <a
                          href={`https://wa.me/55${whatsappCleanNumber}?text=${encodeURIComponent(analysis.customPitchWhatsApp)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-4 py-2 rounded-xl flex items-center space-x-2 shadow-sm"
                        >
                          <MessageCircle className="w-4 h-4" />
                          <span>Abrir WhatsApp Web com Mensagem</span>
                        </a>
                      </div>
                    )}
                  </div>
                ) : (
                  /* Protótipo abre em tela cheia (é uma página inteira, não um bloco) */
                  <div className="pt-6 text-center space-y-3">
                    <p className="text-xs text-slate-500 max-w-md mx-auto">
                      O protótipo é uma prévia navegável do site que seria apresentado ao cliente — abre em tela cheia para caber desktop e celular.
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowPrototype(true)}
                      className="inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-700 text-white text-xs font-bold px-4 py-2 rounded-xl"
                    >
                      <Layout className="w-4 h-4" /> Abrir protótipo em tela cheia
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : error ? (
            <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-center text-sm text-rose-800">
              <strong className="block text-base">Não foi possível gerar a análise.</strong>
              <span className="mt-2 block">{error}</span>
            </div>
          ) : (
            <div className="py-12 text-center text-slate-500">Aguardando resposta da análise.</div>
          )}
        </div>

        {showPrototype && (
          <LandingPrototypeModal lead={lead} analysis={analysis} onClose={() => setShowPrototype(false)} />
        )}

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <button
              onClick={() => onSaveLead(lead)}
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                isSaved
                  ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                  : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 shadow-2xs'
              }`}
            >
              {isSaved ? '✓ Salvo no Pipeline' : '+ Salvar no CRM'}
            </button>

            <button
              onClick={() => printLeadDossier(lead, analysis || undefined)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-4 py-2 rounded-xl flex items-center space-x-1.5 shadow-sm transition-all"
              title="Gerar PDF ou imprimir relatório técnico da empresa"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Gerar Dossiê PDF</span>
            </button>
          </div>

          <button
            onClick={onClose}
            className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-all"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
