import React, { useState } from 'react';
import { APIProvider, Map, AdvancedMarker, Pin, InfoWindow } from '@vis.gl/react-google-maps';
import { BusinessLead } from '../types';
import { MapPin, Star, AlertTriangle, Sparkles, MessageCircle, ExternalLink, BookmarkPlus, BookmarkCheck, Instagram } from 'lucide-react';

interface MapViewProps {
  leads: BusinessLead[];
  onAnalyze: (lead: BusinessLead) => void;
  onToggleSave: (lead: BusinessLead) => void;
  savedLeadIds: Set<string>;
}

export const MapView: React.FC<MapViewProps> = ({
  leads,
  onAnalyze,
  onToggleSave,
  savedLeadIds
}) => {
  const [selectedLead, setSelectedLead] = useState<BusinessLead | null>(leads[0] || null);

  const API_KEY =
    process.env.GOOGLE_MAPS_PLATFORM_KEY ||
    (import.meta as any).env?.VITE_GOOGLE_MAPS_PLATFORM_KEY ||
    '';

  const hasValidKey = Boolean(API_KEY) && API_KEY !== 'YOUR_API_KEY' && API_KEY !== 'MY_GOOGLE_MAPS_KEY';

  // Default center around average lat/lng or São Paulo
  const defaultCenter = leads.length > 0 && leads[0].lat && leads[0].lng
    ? { lat: leads[0].lat, lng: leads[0].lng }
    : { lat: -23.5505, lng: -46.6333 };

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm min-h-[600px] flex flex-col md:flex-row">
      {/* Left Sidebar - Lead Quick List */}
      <div className="w-full md:w-80 border-r border-slate-200 bg-slate-50 p-4 space-y-3 overflow-y-auto max-h-[600px]">
        <div className="flex items-center justify-between pb-2 border-b border-slate-200">
          <h3 className="font-bold text-slate-800 text-sm flex items-center space-x-2">
            <MapPin className="w-4 h-4 text-indigo-600" />
            <span>Empresas no Mapa ({leads.length})</span>
          </h3>
        </div>

        <div className="space-y-2">
          {leads.map((lead) => {
            const isSelected = selectedLead?.id === lead.id;
            return (
              <div
                key={lead.id}
                onClick={() => setSelectedLead(lead)}
                className={`p-3 rounded-lg border text-xs cursor-pointer transition-all ${
                  isSelected
                    ? 'bg-white border-indigo-500 shadow-sm ring-2 ring-indigo-500/20'
                    : 'bg-white border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between font-bold text-slate-900 mb-1">
                  <span className="truncate max-w-[180px]">{lead.name}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 font-semibold border border-indigo-200">
                    {lead.opportunityScore} pts
                  </span>
                </div>
                <div className="text-slate-500 flex items-center space-x-2 font-medium">
                  <span className="flex items-center text-amber-500 font-bold">
                    <Star className="w-3 h-3 fill-amber-400 mr-0.5" />
                    {lead.rating || 4.8}
                  </span>
                  <span>•</span>
                  <span className="truncate">{lead.city}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right - Interactive Google Map or Vector Map */}
      <div className="flex-1 min-h-[500px] relative bg-slate-100">
        {hasValidKey ? (
          <APIProvider apiKey={API_KEY} version="weekly">
            <Map
              defaultCenter={defaultCenter}
              defaultZoom={13}
              mapId="LEAD_RADAR_MAP"
              internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
              style={{ width: '100%', height: '100%', minHeight: '550px' }}
            >
              {leads.map((lead) => (
                <AdvancedMarker
                  key={lead.id}
                  position={{ lat: lead.lat, lng: lead.lng }}
                  onClick={() => setSelectedLead(lead)}
                  title={lead.name}
                >
                  <Pin
                    background={selectedLead?.id === lead.id ? '#4f46e5' : '#ef4444'}
                    glyphColor="#ffffff"
                    borderColor="#ffffff"
                  />
                </AdvancedMarker>
              ))}

              {selectedLead && (
                <InfoWindow
                  position={{ lat: selectedLead.lat, lng: selectedLead.lng }}
                  onCloseClick={() => setSelectedLead(null)}
                >
                  <div className="p-2 max-w-xs text-slate-900 font-sans space-y-2">
                    <div className="font-bold text-sm">{selectedLead.name}</div>
                    <div className="text-xs text-slate-600">{selectedLead.category} - {selectedLead.address}</div>
                    <div className="text-xs font-semibold text-red-600 bg-red-50 p-1 rounded">
                      Sem Website Detectado
                    </div>
                    <button
                      onClick={() => onAnalyze(selectedLead)}
                      className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-1 px-2 rounded text-xs flex items-center justify-center space-x-1"
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>Analisar com IA</span>
                    </button>
                  </div>
                </InfoWindow>
              )}
            </Map>
          </APIProvider>
        ) : (
          <div className="w-full h-full min-h-[550px] bg-slate-50 p-6 flex flex-col justify-between relative overflow-hidden">
            {/* Grid Map Background Pattern */}
            <div className="absolute inset-0 opacity-15 bg-[radial-gradient(#4f46e5_1px,transparent_1px)] [background-size:20px_20px] pointer-events-none" />

            {/* Top Banner Notice */}
            <div className="relative z-10 bg-white border border-slate-200 p-4 rounded-xl max-w-lg shadow-sm">
              <div className="flex items-center space-x-2 text-indigo-700 font-bold text-sm mb-1">
                <MapPin className="w-4 h-4 text-indigo-600" />
                <span>Mapeamento de Região & Oportunidades Locais</span>
              </div>
              <p className="text-xs text-slate-600">
                Selecione uma empresa na lista ao lado para visualizar os detalhes mapeados e gerar o roteiro comercial de abordagem com IA.
              </p>
            </div>

            {/* Selected Lead Detailed Card inside Map */}
            {selectedLead && (
              <div className="relative z-10 bg-white border border-slate-200 p-5 rounded-xl max-w-md shadow-md space-y-4 my-auto">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      {selectedLead.category}
                    </span>
                    <h3 className="text-lg font-bold text-slate-900">{selectedLead.name}</h3>
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-600 border border-red-200">
                    Sem Website
                  </span>
                </div>

                <div className="text-xs text-slate-600 font-medium space-y-1">
                  <div className="flex items-center space-x-1 font-bold text-amber-500">
                    <Star className="w-4 h-4 fill-amber-400" />
                    <span>{selectedLead.rating || 4.8}★ Google ({selectedLead.reviewsCount || 45} avaliações)</span>
                  </div>
                  <div>📍 {selectedLead.address}, {selectedLead.city}</div>
                  {selectedLead.phone && <div className="font-mono">📞 {selectedLead.phone}</div>}
                  {selectedLead.instagramHandle && (
                    <a
                      href={selectedLead.instagramHandle.startsWith('http') ? selectedLead.instagramHandle : `https://instagram.com/${selectedLead.instagramHandle.replace(/^@/, '').trim()}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center space-x-1.5 text-pink-600 hover:text-pink-700 hover:underline transition-all font-semibold pt-1"
                      title={`Ver perfil no Instagram`}
                    >
                      <Instagram className="w-3.5 h-3.5 shrink-0" />
                      <span>{selectedLead.instagramHandle.startsWith('@') ? selectedLead.instagramHandle : `@${selectedLead.instagramHandle}`}</span>
                      <ExternalLink className="w-3 h-3 text-pink-400 shrink-0" />
                    </a>
                  )}
                </div>

                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs text-slate-700 space-y-1">
                  <div className="font-bold text-slate-800">Diagnóstico de Presença:</div>
                  <p>Empresa com excelente prova social nas buscas do Google, porém sem página web para receber pedidos e agendamentos diretos.</p>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => onToggleSave(selectedLead)}
                    className={`p-2 rounded-lg border text-xs font-semibold flex items-center space-x-1 ${
                      savedLeadIds.has(selectedLead.id)
                        ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                        : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                    }`}
                  >
                    {savedLeadIds.has(selectedLead.id) ? <BookmarkCheck className="w-4 h-4 text-indigo-600" /> : <BookmarkPlus className="w-4 h-4" />}
                  </button>

                  <button
                    onClick={() => onAnalyze(selectedLead)}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 px-4 rounded-lg text-xs flex items-center justify-center space-x-1.5 shadow-sm"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>Analisar Oportunidade com IA</span>
                  </button>
                </div>
              </div>
            )}

            <div className="relative z-10 text-[11px] text-slate-500 text-right">
              Para ver o Google Maps dinâmico ao vivo com visualização por satélite, insira <code>GOOGLE_MAPS_PLATFORM_KEY</code> no painel de Secrets.
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
