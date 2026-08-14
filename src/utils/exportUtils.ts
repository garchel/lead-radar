import { BusinessLead, LeadAnalysisResult } from '../types';

export function exportLeadsToCSV(leads: BusinessLead[], filename = 'leads-prospeccao.csv') {
  if (!leads || leads.length === 0) return;

  const headers = [
    'Nome da Empresa',
    'Categoria',
    'Cidade',
    'UF',
    'Endereço',
    'Telefone/WhatsApp',
    'Instagram',
    'Nota Google',
    'Avaliações',
    'Status do Site',
    'Score de Oportunidade (%)',
    'Nível de Oportunidade',
    'Valor Estimado'
  ];

  const rows = leads.map((l) => [
    `"${(l.name || '').replace(/"/g, '""')}"`,
    `"${(l.category || '').replace(/"/g, '""')}"`,
    `"${(l.city || '').replace(/"/g, '""')}"`,
    `"${(l.state || '').replace(/"/g, '""')}"`,
    `"${(l.address || '').replace(/"/g, '""')}"`,
    `"${(l.phone || '').replace(/"/g, '""')}"`,
    `"${(l.instagramHandle || '').replace(/"/g, '""')}"`,
    l.rating || '',
    l.reviewsCount || 0,
    l.websiteStatus === 'none' ? 'Sem Site' : l.websiteStatus === 'social_only' ? 'Apenas Redes Sociais' : 'Com Site',
    l.opportunityScore || 0,
    l.opportunityLevel === 'high' ? 'Alta' : l.opportunityLevel === 'medium' ? 'Média' : 'Baixa',
    `"${(l.estimatedValue || '').replace(/"/g, '""')}"`
  ]);

  const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function printLeadDossier(lead: BusinessLead, analysis?: LeadAnalysisResult) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Por favor, permita popups no navegador para gerar o dossiê para impressão/PDF.');
    return;
  }

  const dateStr = new Date().toLocaleDateString('pt-BR');

  const html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <title>Dossiê de Oportunidade - ${lead.name}</title>
      <style>
        body { font-family: system-ui, -apple-system, sans-serif; color: #0f172a; margin: 0; padding: 40px; background: #fff; line-height: 1.5; }
        .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; margin-bottom: 30px; }
        .logo { font-size: 20px; font-weight: bold; color: #4f46e5; }
        .badge { background: #e0e7ff; color: #3730a3; font-size: 12px; font-weight: bold; padding: 4px 12px; border-radius: 9999px; display: inline-block; }
        .title { font-size: 26px; font-weight: 800; margin: 0 0 6px 0; color: #0f172a; }
        .subtitle { color: #64748b; font-size: 14px; margin: 0; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
        .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px; }
        .card-title { font-size: 12px; font-weight: bold; text-transform: uppercase; color: #64748b; letter-spacing: 0.05em; margin-bottom: 8px; }
        .metric-val { font-size: 28px; font-weight: 800; color: #4f46e5; }
        .list { padding-left: 20px; margin: 10px 0; }
        .list li { margin-bottom: 6px; font-size: 13px; color: #334155; }
        .pitch-box { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 16px; margin-top: 20px; font-size: 13px; color: #166534; white-space: pre-wrap; font-family: monospace; }
        .footer { margin-top: 50px; border-top: 1px solid #e2e8f0; padding-top: 20px; text-align: center; font-size: 11px; color: #94a3b8; }
        @media print {
          body { padding: 20px; }
          .no-print { display: none; }
        }
      </style>
    </head>
    <body>
      <div class="no-print" style="margin-bottom: 20px; text-align: right;">
        <button onclick="window.print()" style="background: #4f46e5; color: white; border: none; padding: 10px 20px; font-weight: bold; border-radius: 8px; cursor: pointer;">🖨️ Imprimir ou Salvar em PDF</button>
      </div>

      <div class="header">
        <div>
          <div class="logo">⚡ LeadRadar AI — Dossiê Diagnóstico</div>
          <div class="subtitle">Análise de Presença Digital e Oportunidade de Vendas</div>
        </div>
        <div style="text-align: right;">
          <span class="badge">Score de Oportunidade: ${lead.opportunityScore}%</span>
          <div style="font-size: 11px; color: #94a3b8; margin-top: 6px;">Gerado em ${dateStr}</div>
        </div>
      </div>

      <h1 class="title">${lead.name}</h1>
      <p class="subtitle">📍 ${lead.address}, ${lead.city} - ${lead.state || ''} | 📞 ${lead.phone || 'Não informado'} | 📸 ${lead.instagramHandle || 'Não informado'}</p>

      <div style="margin-top: 25px;" class="grid">
        <div class="card">
          <div class="card-title">Métricas no Google Maps</div>
          <div style="font-size: 18px; font-weight: bold; color: #0f172a;">⭐ ${lead.rating || 4.8} / 5.0</div>
          <div style="font-size: 13px; color: #64748b;">Baseado em ${lead.reviewsCount || 0} avaliações reais de clientes</div>
          <div style="margin-top: 10px; font-size: 12px; font-weight: bold; color: ${lead.websiteStatus === 'none' ? '#dc2626' : '#d97706'};">
            Status Atual: ${lead.websiteStatus === 'none' ? '❌ Sem nenhuma página/site no Google' : '⚠️ Apenas rede social (sem controle de conversão)'}
          </div>
        </div>

        <div class="card">
          <div class="card-title">Potencial de Faturamento</div>
          <div class="metric-val">${analysis?.revenuePotential || lead.estimatedValue || 'R$ 2.500 - R$ 4.000'}</div>
          <div style="font-size: 12px; color: #64748b;">Estimativa de ticket por projeto de Landing Page + Otimização</div>
        </div>
      </div>

      ${analysis ? `
        <div class="card" style="margin-bottom: 20px;">
          <div class="card-title">Por que esta empresa precisa urgentemente de uma Landing Page?</div>
          <p style="font-size: 13px; color: #334155; margin: 0;">${analysis.whyTheyNeedLandingPage}</p>
        </div>

        <div class="card" style="margin-bottom: 20px;">
          <div class="card-title">Recursos e Funcionalidades Faltantes</div>
          <ul class="list">
            ${analysis.missingFeatures.map((f) => `<li>❌ ${f}</li>`).join('')}
          </ul>
        </div>

        <div class="card" style="margin-bottom: 20px;">
          <div class="card-title">Roteiro Recomendado de Abordagem WhatsApp</div>
          <div class="pitch-box">${analysis.customPitchWhatsApp}</div>
        </div>
      ` : `
        <div class="card">
          <div class="card-title">Insights Chave da Região</div>
          <ul class="list">
            ${lead.keyInsights.map((i) => `<li>• ${i}</li>`).join('')}
          </ul>
        </div>
      `}

      <div class="footer">
        Relatório gerado por LeadRadar AI — Ferramenta de Prospecção Inteligente de Landing Pages.
      </div>

      <script>
        window.onload = function() {
          // Optional auto print dialog
        };
      </script>
    </body>
    </html>
  `;

  printWindow.document.write(html);
  printWindow.document.close();
}
