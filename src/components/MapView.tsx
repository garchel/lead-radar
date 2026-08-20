import React, { useEffect, useMemo, useState } from 'react';
import { APIProvider, Map, AdvancedMarker, Pin, InfoWindow } from '@vis.gl/react-google-maps';
import { BusinessLead } from '../types';
import { MapPin, Star, Sparkles, ExternalLink, BookmarkPlus, BookmarkCheck, Instagram, AlertTriangle } from 'lucide-react';

interface MapViewProps {
  leads: BusinessLead[];
  onAnalyze: (lead: BusinessLead) => void;
  onToggleSave: (lead: BusinessLead) => void;
  savedLeadIds: Set<string>;
  hasMapsKey: boolean;
}

const hasCoordinates = (lead: BusinessLead): lead is BusinessLead & { lat: number; lng: number } =>
  Number.isFinite(lead.lat) && Number.isFinite(lead.lng);

const websiteLabel = (status: BusinessLead['websiteStatus']) => {
  if (status === 'none') return 'Sem website informado';
  if (status === 'social_only') return 'Apenas presença social informada';
  return 'Website informado';
};

export const MapView: React.FC<MapViewProps> = ({
  leads,
  onAnalyze,
  onToggleSave,
  savedLeadIds,
  hasMapsKey,
}) => {
  const coordinateLeads = useMemo(() => leads.filter(hasCoordinates), [leads]);
  const [selectedLead, setSelectedLead] = useState<BusinessLead | null>(coordinateLeads[0] || null);

  useEffect(() => {
    if (!selectedLead || !coordinateLeads.some((lead) => lead.id === selectedLead.id)) {
      setSelectedLead(coordinateLeads[0] || null);
    }
  }, [coordinateLeads, selectedLead]);

  const apiKey =
    process.env.GOOGLE_MAPS_PLATFORM_KEY ||
    (import.meta as any).env?.VITE_GOOGLE_MAPS_PLATFORM_KEY ||
    '';
  const hasValidKey = hasMapsKey && Boolean(apiKey) && apiKey !== 'YOUR_API_KEY' && apiKey !== 'MY_GOOGLE_MAPS_KEY';
  const mapCenter = coordinateLeads[0];

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm min-h-[600px] flex flex-col md:flex-row">
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
            const hasLocation = hasCoordinates(lead);
            return (
              <button
                type="button"
                key={lead.id}
                onClick={() => hasLocation && setSelectedLead(lead)}
                disabled={!hasLocation}
                className={`w-full text-left p-3 rounded-lg border text-xs transition-all ${
                  isSelected
                    ? 'bg-white border-indigo-500 shadow-sm ring-2 ring-indigo-500/20'
                    : 'bg-white border-slate-200 hover:border-slate-300'
                } ${!hasLocation ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
              >
                <div className="flex items-center justify-between font-bold text-slate-900 mb-1">
                  <span className="truncate max-w-[180px]">{lead.name}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 font-semibold border border-indigo-200">
                    {lead.opportunityScore !== undefined ? `${lead.opportunityScore} pts` : 'Score não informado'}
                  </span>
                </div>
                <div className="text-slate-500 flex items-center space-x-2 font-medium">
                  <span className="flex items-center text-amber-500 font-bold">
                    <Star className="w-3 h-3 fill-amber-400 mr-0.5" />
                    {lead.rating !== undefined ? lead.rating : 'Nota não informada'}
                  </span>
                  <span>•</span>
                  <span className="truncate">{lead.city}</span>
                </div>
                {!hasLocation && <span className="block mt-1 text-[10px] text-rose-600">Coordenadas não informadas</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 min-h-[500px] relative bg-slate-100">
        {!hasValidKey ? (
          <div role="alert" className="w-full min-h-[550px] bg-rose-50 p-6 flex items-center justify-center">
            <div className="max-w-lg rounded-xl border border-rose-200 bg-white p-5 text-center shadow-sm">
              <AlertTriangle className="w-8 h-8 mx-auto mb-3 text-rose-600" />
              <h3 className="font-bold text-rose-800">Google Maps indisponível</h3>
              <p className="mt-2 text-sm text-rose-700">
                Google Maps não está disponível: configure GOOGLE_MAPS_PLATFORM_KEY.
              </p>
            </div>
          </div>
        ) : !mapCenter ? (
          <div role="alert" className="w-full min-h-[550px] bg-amber-50 p-6 flex items-center justify-center">
            <div className="max-w-lg rounded-xl border border-amber-200 bg-white p-5 text-center shadow-sm">
              <MapPin className="w-8 h-8 mx-auto mb-3 text-amber-600" />
              <h3 className="font-bold text-amber-800">Mapa sem coordenadas</h3>
              <p className="mt-2 text-sm text-amber-700">
                Nenhum lead retornado possui latitude e longitude válidas para ser exibido no mapa.
              </p>
            </div>
          </div>
        ) : (
          <APIProvider apiKey={apiKey} version="weekly">
            <Map
              defaultCenter={{ lat: mapCenter.lat, lng: mapCenter.lng }}
              defaultZoom={13}
              mapId="LEAD_RADAR_MAP"
              internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
              style={{ width: '100%', height: '100%', minHeight: '550px' }}
            >
              {coordinateLeads.map((lead) => (
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

              {selectedLead && hasCoordinates(selectedLead) && (
                <InfoWindow
                  position={{ lat: selectedLead.lat, lng: selectedLead.lng }}
                  onCloseClick={() => setSelectedLead(null)}
                >
                  <div className="p-2 max-w-xs text-slate-900 font-sans space-y-2">
                    <div className="font-bold text-sm">{selectedLead.name}</div>
                    <div className="text-xs text-slate-600">{selectedLead.category} - {selectedLead.address}</div>
                    <div className="text-xs font-semibold text-red-600 bg-red-50 p-1 rounded">
                      {websiteLabel(selectedLead.websiteStatus)}
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
        )}
      </div>
    </div>
  );
};
