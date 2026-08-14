import React, { useState } from 'react';
import { BookOpen, Calculator, CheckCircle2, MessageSquare, TrendingUp, Award, Zap, ArrowRight, Lightbulb } from 'lucide-react';
import { STRATEGY_STEPS } from '../data/mockLeads';

export const StrategyGuide: React.FC = () => {
  // ROI Calculator State
  const [proposalsPerWeek, setProposalsPerWeek] = useState<number>(10);
  const [conversionRate, setConversionRate] = useState<number>(20); // 20%
  const [projectPrice, setProjectPrice] = useState<number>(2200); // R$ 2.200
  const [monthlyRetainer, setMonthlyRetainer] = useState<number>(150); // R$ 150/mês

  // Calculated metrics
  const proposalsPerMonth = proposalsPerWeek * 4;
  const closedClientsPerMonth = Math.round((proposalsPerMonth * conversionRate) / 100);
  const upfrontRevenueMonthly = closedClientsPerMonth * projectPrice;
  const newMRRMonthly = closedClientsPerMonth * monthlyRetainer;

  return (
    <div className="space-y-8 py-6 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800 p-6 sm:p-8 rounded-2xl shadow-md text-white relative overflow-hidden">
        <div className="relative z-10 space-y-2">
          <div className="inline-flex items-center space-x-2 text-xs font-bold text-indigo-300 bg-indigo-500/20 px-3 py-1 rounded-full border border-indigo-500/30">
            <BookOpen className="w-4 h-4" />
            <span>Metodologia & Estratégia Comercial</span>
          </div>
          <h2 className="text-2xl sm:text-4xl font-bold text-white">
            Como Vender Landing Pages para Negócios sem Website
          </h2>
          <p className="text-slate-300 text-sm sm:text-base max-w-3xl leading-relaxed font-medium">
            Entenda o funil de prospecção consultiva para abordar empresários locais que já possuem clientes no Google, mas necessitam de uma Landing Page para fechar vendas pelo WhatsApp.
          </p>
        </div>
      </div>

      {/* 4 Steps Strategy Cards */}
      <div className="space-y-4">
        <h3 className="text-xl font-bold text-slate-900 flex items-center space-x-2">
          <Zap className="w-5 h-5 text-indigo-600" />
          <span>O Método de Abordagem em 4 Etapas</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {STRATEGY_STEPS.map((step) => (
            <div key={step.step} className="bg-white border border-slate-200 p-6 rounded-xl shadow-sm space-y-3 relative group">
              <div className="flex items-center justify-between">
                <span className="w-8 h-8 rounded-lg bg-indigo-600 text-white font-bold flex items-center justify-center text-sm shadow-2xs">
                  {step.step}
                </span>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                  {step.badge}
                </span>
              </div>

              <h4 className="text-lg font-bold text-slate-900">{step.title}</h4>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed font-medium">{step.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Interactive Agency ROI Calculator */}
      <div className="bg-white border border-slate-200 p-6 sm:p-8 rounded-2xl shadow-sm space-y-6">
        <div className="flex items-center space-x-3 pb-4 border-b border-slate-200">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
            <Calculator className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-slate-900">Simulador de Receita & ROI de Vendas</h3>
            <p className="text-slate-500 text-xs sm:text-sm">Calcule o potencial de faturamento mensal com a criação e manutenção de landing pages.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
          {/* Controls */}
          <div className="md:col-span-6 space-y-5">
            <div>
              <div className="flex justify-between text-xs sm:text-sm font-semibold mb-2">
                <span className="text-slate-700">Propostas enviadas por semana:</span>
                <span className="text-indigo-600 font-bold">{proposalsPerWeek} propostas/semana</span>
              </div>
              <input
                type="range"
                min="2"
                max="30"
                value={proposalsPerWeek}
                onChange={(e) => setProposalsPerWeek(Number(e.target.value))}
                className="w-full accent-indigo-600 bg-slate-100 h-2 rounded-lg cursor-pointer"
              />
              <span className="text-[11px] text-slate-500 mt-1 block">Total mensal: {proposalsPerMonth} propostas enviadas</span>
            </div>

            <div>
              <div className="flex justify-between text-xs sm:text-sm font-semibold mb-2">
                <span className="text-slate-700">Taxa de Conversão estimada:</span>
                <span className="text-indigo-600 font-bold">{conversionRate}%</span>
              </div>
              <input
                type="range"
                min="5"
                max="50"
                step="5"
                value={conversionRate}
                onChange={(e) => setConversionRate(Number(e.target.value))}
                className="w-full accent-indigo-600 bg-slate-100 h-2 rounded-lg cursor-pointer"
              />
              <span className="text-[11px] text-slate-500 mt-1 block">Estimativa: {closedClientsPerMonth} novos clientes por mês</span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Preço do Projeto (R$)</label>
                <input
                  type="number"
                  value={projectPrice}
                  onChange={(e) => setProjectPrice(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 text-sm font-bold focus:outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Taxa de Manutenção (R$/mês)</label>
                <input
                  type="number"
                  value={monthlyRetainer}
                  onChange={(e) => setMonthlyRetainer(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 text-sm font-bold focus:outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
          </div>

          {/* Result Highlight Cards */}
          <div className="md:col-span-6 bg-slate-50 border border-slate-200 p-6 rounded-2xl flex flex-col justify-between space-y-4">
            <div className="space-y-4">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
                Faturamento Potencial Mês:
              </span>

              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-1">
                <span className="text-xs text-slate-500 font-medium">Receita de Implementação (Projetos):</span>
                <div className="text-2xl sm:text-3xl font-extrabold text-indigo-700">
                  R$ {upfrontRevenueMonthly.toLocaleString('pt-BR')}
                </div>
                <span className="text-[11px] text-slate-500">Com base em {closedClientsPerMonth} vendas x R$ {projectPrice}</span>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-1">
                <span className="text-xs text-slate-500 font-medium">Receita Recorrente Acumulada (MRR):</span>
                <div className="text-2xl sm:text-3xl font-extrabold text-emerald-700">
                  + R$ {newMRRMonthly.toLocaleString('pt-BR')}/mês
                </div>
                <span className="text-[11px] text-slate-500">Contratos de hospedagem, atualização e manutenção</span>
              </div>
            </div>

            <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100 text-xs text-indigo-900 flex items-center space-x-3">
              <Award className="w-8 h-8 text-indigo-600 shrink-0" />
              <div className="font-medium">
                <strong className="block text-indigo-950 font-bold">Dica Comercial:</strong>
                Clientes sem landing page respondem muito melhor a contatos que já incluem uma imagem do conceito visual do site.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
