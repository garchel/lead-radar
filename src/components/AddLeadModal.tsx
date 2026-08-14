import React, { useState } from 'react';
import { X, PlusCircle, Building2, MapPin, Phone, Star, Tag, Sparkles } from 'lucide-react';
import { BusinessLead } from '../types';
import { CATEGORY_OPTIONS } from '../data/mockLeads';

interface AddLeadModalProps {
  onClose: () => void;
  onAddLead: (lead: BusinessLead) => void;
}

export const AddLeadModal: React.FC<AddLeadModalProps> = ({ onClose, onAddLead }) => {
  const [name, setName] = useState('');
  const [category, setCategory] = useState(CATEGORY_OPTIONS[1] || 'Dentista & Odontologia');
  const [city, setCity] = useState('São Paulo');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [instagramHandle, setInstagramHandle] = useState('');
  const [rating, setRating] = useState('4.8');
  const [reviewsCount, setReviewsCount] = useState('35');
  const [notes, setNotes] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const newLead: BusinessLead = {
      id: `manual-${Date.now()}`,
      name: name.trim(),
      category,
      city: city.trim() || 'São Paulo',
      address: address.trim() || 'Endereço Central',
      phone: phone.trim(),
      instagramHandle: instagramHandle.trim() ? (instagramHandle.trim().startsWith('@') ? instagramHandle.trim() : `@${instagramHandle.trim()}`) : undefined,
      rating: parseFloat(rating) || 4.8,
      reviewsCount: parseInt(reviewsCount, 10) || 30,
      websiteStatus: 'none',
      lat: -23.5505,
      lng: -46.6333,
      opportunityScore: 90,
      opportunityLevel: 'high',
      estimatedValue: 'R$ 2.000 - R$ 3.500',
      keyInsights: [
        'Lead inserido manualmente para prospecção direta',
        'Sem landing page ou presença web estruturada',
        'Excelente oportunidade para envio de proposta com IA'
      ],
      pipelineStatus: 'prospect',
      notes: notes.trim(),
      savedAt: new Date().toISOString()
    };

    onAddLead(newLead);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
        <div className="p-5 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-white">
          <div className="flex items-center space-x-2 text-white font-bold text-lg">
            <PlusCircle className="w-5 h-5 text-indigo-400" />
            <span>Adicionar Novo Lead Manualmente</span>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 bg-white">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Nome da Empresa / Profissional *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Clínica Odontológica Sorriso Perfeito"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 text-sm font-medium focus:outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Categoria</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 text-xs font-medium focus:outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500"
              >
                {CATEGORY_OPTIONS.filter((c) => c !== 'Todas as Categorias').map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Cidade / Região</label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Ex: São Paulo"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 text-xs font-medium focus:outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Endereço / Bairro</label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Ex: Av. Paulista, 1000 - Bela Vista"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 text-xs font-medium focus:outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Telefone / WhatsApp</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(11) 99999-8888"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 text-xs font-medium focus:outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Instagram (@usuario)</label>
              <input
                type="text"
                value={instagramHandle}
                onChange={(e) => setInstagramHandle(e.target.value)}
                placeholder="@nome.empresa"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 text-xs font-medium focus:outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Nota Google (0-5)</label>
              <input
                type="number"
                step="0.1"
                min="1"
                max="5"
                value={rating}
                onChange={(e) => setRating(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 text-xs font-medium focus:outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Qtd Avaliações</label>
              <input
                type="number"
                value={reviewsCount}
                onChange={(e) => setReviewsCount(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 text-xs font-medium focus:outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Anotações Iniciais (Opcional)</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: Passei na frente do estabelecimento ou vi no Instagram..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 text-xs font-medium focus:outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="pt-3 flex justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold px-4 py-2.5 rounded-xl border border-slate-200 transition-all"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-5 py-2.5 rounded-xl flex items-center space-x-1.5 shadow-sm transition-all"
            >
              <Sparkles className="w-4 h-4" />
              <span>Adicionar Lead</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
