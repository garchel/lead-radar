import { useState } from 'react';
import {
  Smartphone,
  Monitor,
  CheckCircle2,
  Star,
  MessageCircle,
  Phone,
  MapPin,

  ShieldCheck,
  Send,
  Sparkles,
  ExternalLink,
  ChevronRight,
  Palette
} from 'lucide-react';
import { BusinessLead, LeadAnalysisResult } from '../types';

interface LandingPagePrototypeProps {
  lead: BusinessLead;
  analysis: LeadAnalysisResult;
}

type ThemePreset = 'indigo' | 'emerald' | 'dark' | 'amber';

export function LandingPagePrototype({ lead, analysis }: LandingPagePrototypeProps) {
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [theme, setTheme] = useState<ThemePreset>('indigo');
  const [userMsg, setUserMsg] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const heroHeadline = analysis.landingPageConcept.heroHeadline;
  const heroSubheadline = analysis.landingPageConcept.heroSubheadline;
  const ctaText = analysis.landingPageConcept.callToAction;

  const cleanPhone = lead.phone?.replace(/\D/g, '') || '';
  const fullPhone = cleanPhone && !cleanPhone.startsWith('55') ? `55${cleanPhone}` : cleanPhone;
  const whatsappMessage = userMsg.trim() || analysis.customPitchWhatsApp;
  const whatsappUrl = fullPhone && whatsappMessage
    ? `https://wa.me/${fullPhone}?text=${encodeURIComponent(whatsappMessage)}`
    : null;

  // Theme style classes
  const themeStyles = {
    indigo: {
      bg: 'bg-slate-50',
      headerBg: 'bg-white border-slate-200',
      heroBg: 'bg-gradient-to-br from-indigo-900 via-slate-900 to-indigo-950 text-white',
      primaryBtn: 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-500/20',
      accentBadge: 'bg-indigo-500/20 text-indigo-200 border-indigo-400/30',
      cardBg: 'bg-white border-slate-200 text-slate-800',
      textPrimary: 'text-slate-900',
      textSecondary: 'text-slate-600',
      accentText: 'text-indigo-600',
    },
    emerald: {
      bg: 'bg-emerald-50/40',
      headerBg: 'bg-white border-emerald-100',
      heroBg: 'bg-gradient-to-br from-emerald-900 via-teal-900 to-slate-900 text-white',
      primaryBtn: 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-500/20',
      accentBadge: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/30',
      cardBg: 'bg-white border-emerald-100 text-slate-800',
      textPrimary: 'text-slate-900',
      textSecondary: 'text-slate-600',
      accentText: 'text-emerald-600',
    },
    dark: {
      bg: 'bg-slate-950',
      headerBg: 'bg-slate-900/90 border-slate-800 text-white',
      heroBg: 'bg-gradient-to-b from-slate-900 via-slate-950 to-black text-white',
      primaryBtn: 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-500/30',
      accentBadge: 'bg-amber-400/10 text-amber-300 border-amber-400/20',
      cardBg: 'bg-slate-900 border-slate-800 text-slate-100',
      textPrimary: 'text-white',
      textSecondary: 'text-slate-400',
      accentText: 'text-amber-400',
    },
    amber: {
      bg: 'bg-amber-50/30',
      headerBg: 'bg-white border-amber-200/80',
      heroBg: 'bg-gradient-to-br from-amber-900 via-stone-900 to-slate-900 text-white',
      primaryBtn: 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-500/20',
      accentBadge: 'bg-amber-500/20 text-amber-200 border-amber-400/30',
      cardBg: 'bg-white border-amber-100 text-slate-800',
      textPrimary: 'text-slate-900',
      textSecondary: 'text-slate-600',
      accentText: 'text-amber-600',
    },
  }[theme];

  return (
    <div className="space-y-4">
      {/* Top Toolbar for Device & Theme customizer */}
      <div className="bg-slate-900 text-white p-3.5 rounded-2xl flex flex-wrap items-center justify-between gap-3 shadow-md">
        <div className="flex items-center space-x-2">
          <Sparkles className="w-4 h-4 text-amber-400" />
          <span className="text-xs font-bold text-slate-200">
            Protótipo Interativo em Tempo Real
          </span>
          <span className="hidden sm:inline-block text-[11px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full border border-slate-700">
            Revisão de Protótipo
          </span>
        </div>

        <div className="flex items-center space-x-4">
          {/* Theme Presets */}
          <div className="flex items-center space-x-1 bg-slate-800 p-1 rounded-xl border border-slate-700">
            <Palette className="w-3.5 h-3.5 text-slate-400 ml-1.5 mr-0.5" />
            <button
              onClick={() => setTheme('indigo')}
              className={`w-5 h-5 rounded-full bg-indigo-600 border ${theme === 'indigo' ? 'ring-2 ring-white' : 'opacity-70'}`}
              title="Tema Azul Corporativo"
            />
            <button
              onClick={() => setTheme('emerald')}
              className={`w-5 h-5 rounded-full bg-emerald-600 border ${theme === 'emerald' ? 'ring-2 ring-white' : 'opacity-70'}`}
              title="Tema Saúde & Estética Esmeralda"
            />
            <button
              onClick={() => setTheme('dark')}
              className={`w-5 h-5 rounded-full bg-slate-950 border ${theme === 'dark' ? 'ring-2 ring-white' : 'opacity-70'}`}
              title="Tema Dark Luxo"
            />
            <button
              onClick={() => setTheme('amber')}
              className={`w-5 h-5 rounded-full bg-amber-600 border ${theme === 'amber' ? 'ring-2 ring-white' : 'opacity-70'}`}
              title="Tema Dourado Premium"
            />
          </div>

          {/* Device Toggle */}
          <div className="bg-slate-800 p-1 rounded-xl border border-slate-700 flex items-center space-x-1">
            <button
              onClick={() => setDevice('desktop')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center space-x-1 transition-all ${
                device === 'desktop'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Monitor className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Desktop</span>
            </button>
            <button
              onClick={() => setDevice('mobile')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center space-x-1 transition-all ${
                device === 'mobile'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>Mobile</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Preview Screen Wrapper */}
      <div className="bg-slate-200/80 p-4 sm:p-6 rounded-2xl flex justify-center overflow-x-auto border border-slate-300/70">
        <div
          className={`transition-all duration-300 rounded-2xl overflow-hidden shadow-2xl border border-slate-300/80 ${themeStyles.bg} ${
            device === 'mobile' ? 'w-[375px] max-w-full min-h-[680px]' : 'w-full max-w-4xl'
          }`}
        >
          <div className="bg-slate-800 text-slate-300 px-3 py-2 flex items-center justify-center text-xs border-b border-slate-700">
            <span className="text-[10px] text-slate-400">Prévia do protótipo gerado para {lead.name}</span>
          </div>

          {/* 1. Header Navigation */}
          <header className={`px-4 py-3 border-b flex items-center justify-between sticky top-0 z-10 ${themeStyles.headerBg}`}>
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-black text-sm">
                {lead.name.charAt(0)}
              </div>
              <div>
                <div className="font-bold text-xs sm:text-sm tracking-tight leading-tight">
                  {lead.name}
                </div>
                <div className="text-[10px] text-slate-500 font-medium">
                  {lead.category} • {lead.city}
                </div>
              </div>
            </div>

            {whatsappUrl && (
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center space-x-1.5 transition-all shadow-sm ${themeStyles.primaryBtn}`}
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Atendimento</span>
              </a>
            )}
          </header>

          {/* 2. Hero Section */}
          <section className={`px-5 py-8 sm:py-12 relative overflow-hidden ${themeStyles.heroBg}`}>
            <div className="max-w-2xl mx-auto text-center space-y-4">
              <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-semibold border backdrop-blur-sm mx-auto">
                <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                <span>
                  <strong>{lead.rating !== undefined ? `${lead.rating}★ no Google Maps` : 'Avaliação Google não informada'}</strong>
                  {lead.reviewsCount !== undefined && ` (${lead.reviewsCount} avaliações)`}
                </span>
              </div>

              <h1 className="text-xl sm:text-3xl font-extrabold tracking-tight leading-tight">
                {heroHeadline}
              </h1>

              <p className="text-xs sm:text-sm text-slate-200/90 max-w-lg mx-auto leading-relaxed">
                {heroSubheadline}
              </p>

              {/* Primary Call to Action */}
              <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
                {whatsappUrl && (
                  <a
                    href={whatsappUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`w-full sm:w-auto px-6 py-3 rounded-xl font-bold text-sm flex items-center justify-center space-x-2 shadow-lg transition-all transform hover:-translate-y-0.5 ${themeStyles.primaryBtn}`}
                  >
                    <MessageCircle className="w-4 h-4 fill-white" />
                    <span>{ctaText}</span>
                    <ChevronRight className="w-4 h-4" />
                  </a>
                )}
                {!whatsappUrl && <p className="text-xs text-amber-200">WhatsApp indisponível: telefone ou pitch da análise não informado.</p>}

                {lead.phone && (
                  <a
                    href={`tel:${cleanPhone}`}
                    className="w-full sm:w-auto px-4 py-3 rounded-xl font-semibold text-xs text-white border border-white/20 hover:bg-white/10 flex items-center justify-center space-x-1.5 transition-all"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    <span>Ligar: {lead.phone}</span>
                  </a>
                )}
              </div>


            </div>
          </section>

          {/* 3. Pontos de venda gerados pela análise */}
          <section className="p-5 sm:p-8 space-y-6">
            <div className="text-center space-y-1">
              <h2 className={`text-base sm:text-lg font-bold ${themeStyles.textPrimary}`}>
                Por que escolher a {lead.name}?
              </h2>
              <p className={`text-xs ${themeStyles.textSecondary}`}>
                Pontos de venda obtidos na análise estratégica.
              </p>
            </div>

            {analysis.landingPageConcept.keySellingPoints?.length ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {analysis.landingPageConcept.keySellingPoints.map((point) => (
                  <div key={point} className={`p-4 rounded-xl border ${themeStyles.cardBg} space-y-2`}>
                    <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-600 flex items-center justify-center">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                    <h3 className="font-bold text-xs sm:text-sm">{point}</h3>
                  </div>
                ))}
              </div>
            ) : (
              <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-center text-xs text-rose-700">
                A análise não retornou pontos de venda para o protótipo.
              </div>
            )}
          </section>

          {/* 4. Dados reais de reputação */}
          <section className="px-5 py-6 bg-slate-100/70 border-y border-slate-200/80 space-y-2">
            <h3 className="text-xs sm:text-sm font-bold text-slate-900">Reputação informada na prospecção</h3>
            <p className="text-[11px] text-slate-500">
              {lead.rating !== undefined ? `${lead.rating} estrelas no Google` : 'Nota Google não informada'}
              {lead.reviewsCount !== undefined ? ` em ${lead.reviewsCount} avaliações.` : '.'}
            </p>
          </section>

          {/* 5. Contact / Fast Quote Form */}
          <section className="p-5 sm:p-8 space-y-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
              <h3 className="font-bold text-sm text-slate-900 flex items-center space-x-2">
                <MessageCircle className="w-4 h-4 text-emerald-600" />
                <span>Contato pelo WhatsApp</span>
              </h3>

              {formError && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{formError}</div>}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setFormError(null);
                  if (!whatsappUrl) {
                    setFormError('Não é possível abrir o WhatsApp porque o telefone ou o pitch da análise não foi informado.');
                    return;
                  }
                  const popup = window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
                  if (!popup) setFormError('O navegador bloqueou a abertura do WhatsApp. Permita pop-ups e tente novamente.');
                }}
                className="space-y-2.5 text-xs"
              >
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Mensagem
                  </label>
                  <input
                    type="text"
                    value={userMsg}
                    onChange={(e) => setUserMsg(e.target.value)}
                    placeholder="Digite uma mensagem ou use o pitch gerado pela análise"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <button
                  type="submit"
                  className={`w-full py-2.5 px-4 rounded-xl font-bold text-xs flex items-center justify-center space-x-2 shadow-sm ${themeStyles.primaryBtn}`}
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Enviar Mensagem Direta no WhatsApp</span>
                </button>
              </form>
            </div>
          </section>

          {/* Footer */}
          <footer className="bg-slate-900 text-slate-400 p-4 text-center text-[10px] space-y-1">
            <div className="font-bold text-white text-xs">{lead.name}</div>
            <div>📍 {lead.address}, {lead.city}{lead.state ? ` - ${lead.state}` : ' - UF não informada'}</div>
            <div className="pt-2 text-slate-500">
              © {new Date().getFullYear()} {lead.name}. Todos os direitos reservados.
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}
