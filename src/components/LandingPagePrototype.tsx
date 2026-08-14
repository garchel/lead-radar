import { useState } from 'react';
import {
  Smartphone,
  Monitor,
  CheckCircle2,
  Star,
  MessageCircle,
  Phone,
  MapPin,
  Clock,
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
  analysis?: LeadAnalysisResult | null;
}

type ThemePreset = 'indigo' | 'emerald' | 'dark' | 'amber';

export function LandingPagePrototype({ lead, analysis }: LandingPagePrototypeProps) {
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [theme, setTheme] = useState<ThemePreset>('indigo');
  const [simulatedFormSubmitted, setSimulatedFormSubmitted] = useState(false);
  const [userMsg, setUserMsg] = useState('');

  // Extract or generate headline concepts
  const heroHeadline =
    analysis?.landingPageConcept?.heroHeadline ||
    `${lead.name} — Excelência e Qualidade em ${lead.category}`;

  const heroSubheadline =
    analysis?.landingPageConcept?.heroSubheadline ||
    `Atendimento rápido e personalizado em ${lead.city}. Solicite seu orçamento sem compromisso pelo WhatsApp!`;

  const ctaText =
    analysis?.landingPageConcept?.callToAction || 'Falar no WhatsApp Agora';

  const cleanPhone = lead.phone ? lead.phone.replace(/\D/g, '') : '5511999998888';
  const whatsappUrl = `https://wa.me/55${cleanPhone}?text=${encodeURIComponent(`Olá! Vi o site da ${lead.name} e gostaria de solicitar um orçamento.`)}`;

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
            Demonstração para Cliente
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
          {/* Simulated Browser Navbar */}
          <div className="bg-slate-800 text-slate-300 px-3 py-2 flex items-center justify-between text-xs border-b border-slate-700">
            <div className="flex items-center space-x-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
            </div>
            <div className="bg-slate-900/90 text-slate-300 px-3 py-0.5 rounded-full text-[11px] font-mono tracking-tight flex items-center space-x-1 border border-slate-700">
              <span className="text-emerald-400 font-bold">🔒 https://</span>
              <span>
                {lead.name.toLowerCase().replace(/[^a-z0-0]/g, '')}.com.br
              </span>
            </div>
            <span className="text-[10px] text-slate-400">Prévia Live</span>
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

            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center space-x-1.5 transition-all shadow-sm ${themeStyles.primaryBtn}`}
            >
              <MessageCircle className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Atendimento</span>
            </a>
          </header>

          {/* 2. Hero Section */}
          <section className={`px-5 py-8 sm:py-12 relative overflow-hidden ${themeStyles.heroBg}`}>
            <div className="max-w-2xl mx-auto text-center space-y-4">
              <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-semibold border backdrop-blur-sm mx-auto">
                <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                <span>
                  <strong>{lead.rating || 4.9}★ no Google Maps</strong> ({lead.reviewsCount || 85}+ avaliações)
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

              {/* Trust Indicators */}
              <div className="pt-4 flex items-center justify-center space-x-4 text-[11px] text-slate-300/80">
                <span className="flex items-center space-x-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Resposta em minutos</span>
                </span>
                <span className="flex items-center space-x-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Orçamento Gratuito</span>
                </span>
              </div>
            </div>
          </section>

          {/* 3. Differential Points & Benefits */}
          <section className="p-5 sm:p-8 space-y-6">
            <div className="text-center space-y-1">
              <h2 className={`text-base sm:text-lg font-bold ${themeStyles.textPrimary}`}>
                Por que escolher a {lead.name}?
              </h2>
              <p className={`text-xs ${themeStyles.textSecondary}`}>
                Compromisso com satisfação e resultados comprovados em {lead.city}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className={`p-4 rounded-xl border ${themeStyles.cardBg} space-y-2`}>
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                  <Clock className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-xs sm:text-sm">Agilidade de Atendimento</h3>
                <p className="text-[11px] text-slate-500 leading-normal">
                  Respostas rápidas via WhatsApp com suporte dedicado e orçamento simplificado.
                </p>
              </div>

              <div className={`p-4 rounded-xl border ${themeStyles.cardBg} space-y-2`}>
                <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-600 flex items-center justify-center">
                  <Star className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-xs sm:text-sm">Reputação 5 Estrelas</h3>
                <p className="text-[11px] text-slate-500 leading-normal">
                  Classificação impecável reconhecida pelos próprios clientes no Google Maps.
                </p>
              </div>

              <div className={`p-4 rounded-xl border ${themeStyles.cardBg} space-y-2`}>
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-xs sm:text-sm">Garantia & Confiança</h3>
                <p className="text-[11px] text-slate-500 leading-normal">
                  Profissionais qualificados atuando com transparência e foco em {lead.category}.
                </p>
              </div>
            </div>
          </section>

          {/* 4. Google Reviews Testimonials Section */}
          <section className="px-5 py-6 bg-slate-100/70 border-y border-slate-200/80 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs sm:text-sm font-bold text-slate-900 flex items-center space-x-1.5">
                  <span>Avaliações Reais no Google Maps</span>
                  <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-bold">
                    ★ {lead.rating || 4.9}
                  </span>
                </h3>
                <p className="text-[11px] text-slate-500">
                  O que os clientes da região dizem sobre o trabalho
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm space-y-2">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-slate-900">Carlos M.</div>
                  <div className="flex text-amber-400">★★★★★</div>
                </div>
                <p className="text-slate-600 text-[11px] italic">
                  "Atendimento espetacular! Foram super rápidos e prestativos desde o primeiro contato no WhatsApp. Recomendo muito em {lead.city}!"
                </p>
              </div>

              <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm space-y-2">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-slate-900">Fernanda R.</div>
                  <div className="flex text-amber-400">★★★★★</div>
                </div>
                <p className="text-slate-600 text-[11px] italic">
                  "Serviço impecável e preço justo. A melhor opção de {lead.category} da nossa região."
                </p>
              </div>
            </div>
          </section>

          {/* 5. Contact / Fast Quote Form Simulation */}
          <section className="p-5 sm:p-8 space-y-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
              <h3 className="font-bold text-sm text-slate-900 flex items-center space-x-2">
                <MessageCircle className="w-4 h-4 text-emerald-600" />
                <span>Solicite seu Orçamento pelo WhatsApp</span>
              </h3>

              {simulatedFormSubmitted ? (
                <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-xl text-center space-y-2">
                  <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto animate-bounce" />
                  <div className="font-bold text-xs text-emerald-900">
                    Simulação: Redirecionando para o WhatsApp do cliente...
                  </div>
                  <p className="text-[11px] text-emerald-700">
                    A mensagem formatada "<em>{userMsg || 'Olá! Gostaria de um orçamento.'}</em>" seria enviada automaticamente.
                  </p>
                  <button
                    onClick={() => setSimulatedFormSubmitted(false)}
                    className="text-[11px] text-emerald-700 underline font-semibold pt-1"
                  >
                    Testar outra mensagem
                  </button>
                </div>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    setSimulatedFormSubmitted(true);
                  }}
                  className="space-y-2.5 text-xs"
                >
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Qual serviço você precisa?
                    </label>
                    <input
                      type="text"
                      value={userMsg}
                      onChange={(e) => setUserMsg(e.target.value)}
                      placeholder={`Ex: Orçamento para ${lead.category}`}
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
              )}
            </div>
          </section>

          {/* Footer */}
          <footer className="bg-slate-900 text-slate-400 p-4 text-center text-[10px] space-y-1">
            <div className="font-bold text-white text-xs">{lead.name}</div>
            <div>📍 {lead.address}, {lead.city} - {lead.state || ''}</div>
            <div className="pt-2 text-slate-500">
              © {new Date().getFullYear()} {lead.name}. Todos os direitos reservados.
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}
