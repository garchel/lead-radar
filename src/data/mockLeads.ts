import { BusinessLead } from '../types';

export const MOCK_LEADS: BusinessLead[] = [
  {
    id: 'lead-1',
    name: 'Dra. Camilla Ribeiro - Odontologia Estética',
    category: 'Dentista & Odontologia',
    address: 'Rua Oscar Freire, 1020, Cerqueira César',
    neighborhood: 'Jardins',
    city: 'São Paulo',
    state: 'SP',
    phone: '(11) 98765-4321',
    rating: 4.9,
    reviewsCount: 84,
    websiteStatus: 'none',
    instagramHandle: '@dracamillaribeiro.odonto',
    lat: -23.5615,
    lng: -46.6668,
    opportunityScore: 95,
    opportunityLevel: 'high',
    estimatedValue: 'R$ 2.500 - R$ 4.000',
    keyInsights: [
      'Dentista de alto padrão com 84 avaliações 5 estrelas no Google',
      'Sem site ou landing page para captar agendamentos diretos',
      'Depende 100% de mensagens diretas no Instagram ou ligação telefônica',
      'Excelente oportunidade para landing page com agendamento integrado'
    ],
    pipelineStatus: 'prospect',
    notes: 'Perfeita para abordagem via WhatsApp oferecendo protótipo de landing page com botão de WhatsApp e filtro de procedimentos.'
  },
  {
    id: 'lead-2',
    name: 'Auto Elétrica e Mecânica São Jorge',
    category: 'Oficina Mecânica',
    address: 'Av. Rebouças, 2150, Pinheiros',
    neighborhood: 'Pinheiros',
    city: 'São Paulo',
    state: 'SP',
    phone: '(11) 3081-9000',
    rating: 4.8,
    reviewsCount: 142,
    websiteStatus: 'none',
    instagramHandle: '@autoeletrica.saojorge',
    lat: -23.5688,
    lng: -46.6852,
    opportunityScore: 92,
    opportunityLevel: 'high',
    estimatedValue: 'R$ 1.800 - R$ 3.000',
    keyInsights: [
      '142 clientes satisfeitos no Google Maps',
      'Aparece no topo das buscas locais porém sem link para orçamento online',
      'Concorrentes com site captam motoristas em emergência via Google Ads',
      'Proposta recomendada: Landing Page rápida focada em Socorro 24h & WhatsApp'
    ],
    pipelineStatus: 'prospect'
  },
  {
    id: 'lead-3',
    name: 'Studio Pilates & Fisioterapia Vila Madalena',
    category: 'Saúde & Bem-Estar',
    address: 'Rua Harmonia, 450, Vila Madalena',
    neighborhood: 'Vila Madalena',
    city: 'São Paulo',
    state: 'SP',
    phone: '(11) 99123-8877',
    rating: 4.7,
    reviewsCount: 56,
    websiteStatus: 'social_only',
    instagramHandle: '@studiopilates.vilamada',
    lat: -23.5539,
    lng: -46.6912,
    opportunityScore: 88,
    opportunityLevel: 'high',
    estimatedValue: 'R$ 2.000 - R$ 3.500',
    keyInsights: [
      'Tem página no Instagram mas não possui Landing Page de conversão',
      'Sem tabela de horários ou formulário para aula experimental',
      'Alunos procuram no Google por "Pilates Vila Madalena" e vão para concorrentes com site'
    ],
    pipelineStatus: 'contacted',
    notes: 'Mensagem enviada no Instagram apresentando mockup de landing para aula experimental grátis.'
  },
  {
    id: 'lead-4',
    name: 'Beto Refrigeração & Ar Condicionado',
    category: 'Assistência Técnica & Climatização',
    address: 'Av. Santo Amaro, 3400, Brooklin',
    neighborhood: 'Brooklin',
    city: 'São Paulo',
    state: 'SP',
    phone: '(11) 97444-1122',
    rating: 4.9,
    reviewsCount: 98,
    websiteStatus: 'none',
    instagramHandle: '@beto.refrigeracao',
    lat: -23.6111,
    lng: -46.6800,
    opportunityScore: 94,
    opportunityLevel: 'high',
    estimatedValue: 'R$ 1.500 - R$ 2.800',
    keyInsights: [
      'Serviço essencial de alta procura em dias quentes',
      'Falta de site faz perder contratos corporativos e residenciais',
      'Alto potencial para campanhas de busca com landing page de alta conversão'
    ],
    pipelineStatus: 'prospect'
  },
  {
    id: 'lead-5',
    name: 'Advocacia e Consultoria Mello & Associados',
    category: 'Advocacia & Direito',
    address: 'Rua do Ouvidor, 60, Centro',
    neighborhood: 'Centro',
    city: 'Rio de Janeiro',
    state: 'RJ',
    phone: '(21) 2221-5544',
    rating: 4.6,
    reviewsCount: 39,
    websiteStatus: 'none',
    instagramHandle: '@melloeassociados.adv',
    lat: -22.9035,
    lng: -43.1788,
    opportunityScore: 90,
    opportunityLevel: 'high',
    estimatedValue: 'R$ 3.000 - R$ 5.500',
    keyInsights: [
      'Escritório de advocacia tradicional sem presença institucional online',
      'Público corporativo exige credibilidade através de site profissional',
      'Oportunidade de landing page institucional com captação de consultas'
    ],
    pipelineStatus: 'prospect'
  },
  {
    id: 'lead-6',
    name: 'Espaço Beleza & Estética Avançada Lilian',
    category: 'Estética & Salão de Beleza',
    address: 'Av. Savassi, 120, Savassi',
    neighborhood: 'Savassi',
    city: 'Belo Horizonte',
    state: 'MG',
    phone: '(31) 98899-0011',
    rating: 4.8,
    reviewsCount: 71,
    websiteStatus: 'social_only',
    instagramHandle: '@lilian.esteticabh',
    lat: -19.9388,
    lng: -43.9328,
    opportunityScore: 85,
    opportunityLevel: 'high',
    estimatedValue: 'R$ 1.800 - R$ 3.200',
    keyInsights: [
      'Especializada em procedimentos de harmonização e limpeza profunda',
      'Usa Linktree simples no Instagram mas não tem Landing Page própria de vendas',
      'Apresentar proposta de página focada em transformar seguidores em agendamentos'
    ],
    pipelineStatus: 'prospect'
  },
  {
    id: 'lead-7',
    name: 'Consultório Veterinário & Pet Shop AuAu',
    category: 'Veterinária & Pet Shop',
    address: 'Rua das Flores, 880, Batel',
    neighborhood: 'Batel',
    city: 'Curitiba',
    state: 'PR',
    phone: '(41) 3342-9900',
    rating: 4.9,
    reviewsCount: 115,
    websiteStatus: 'none',
    instagramHandle: '@vet.auau.curitiba',
    lat: -25.4382,
    lng: -49.2831,
    opportunityScore: 91,
    opportunityLevel: 'high',
    estimatedValue: 'R$ 2.200 - R$ 3.800',
    keyInsights: [
      'Clínica veterinária 24 horas muito elogiada nas avaliações locais',
      'Sem landing page para emergências noturnas e vacinação',
      'Oportunidade urgente para destacar plantão 24h e atendimento domiciliar'
    ],
    pipelineStatus: 'prospect'
  },
  {
    id: 'lead-8',
    name: 'Empório & Padaria Artesanal Pão D\'Ouro',
    category: 'Gastronomia & Padaria',
    address: 'Rua Pamplona, 780, Bela Vista',
    neighborhood: 'Jardins',
    city: 'São Paulo',
    state: 'SP',
    phone: '(11) 3288-1200',
    rating: 4.7,
    reviewsCount: 210,
    websiteStatus: 'none',
    instagramHandle: '@paodeouro.padaria',
    lat: -23.5652,
    lng: -46.6533,
    opportunityScore: 82,
    opportunityLevel: 'medium',
    estimatedValue: 'R$ 1.500 - R$ 2.500',
    keyInsights: [
      'Mais de 200 avaliações no Google com fotos incríveis de produtos',
      'Não possui cardápio digital ou landing page para encomendas de eventos e cestas de café',
      'Ideal para landing page de encomendas corporativas e eventos'
    ],
    pipelineStatus: 'prospect'
  }
];

export const CATEGORY_OPTIONS = [
  'Todas as Categorias',
  'Dentista & Odontologia',
  'Oficina Mecânica',
  'Saúde & Bem-Estar',
  'Assistência Técnica & Climatização',
  'Advocacia & Direito',
  'Estética & Salão de Beleza',
  'Veterinária & Pet Shop',
  'Gastronomia & Padaria',
  'Academia & Personal Trainer',
  'Contabilidade & Finanças',
  'Arquitetura & Design de Interiores',
  'Reformas & Construção',
  'Fotografia & Eventos',
  'Escola de Idiomas & Cursos'
];

export const STRATEGY_STEPS = [
  {
    step: 1,
    title: 'Identificação de Oportunidades',
    description: 'Empresas com boa nota e muitas avaliações no Google Maps (4.5+ e 30+ avaliações) que não possuem site têm demanda ativa comprovada, mas perdem até 60% das vendas digitais para concorrentes.',
    badge: 'Prospecção Inteligente'
  },
  {
    step: 2,
    title: 'Abordagem Consultiva (Sem Spam)',
    description: 'Em vez de vender "um site", ofereça uma solução para uma dor clara. Exemplo: "Notei que vocês têm 84 avaliações incríveis no Google, mas quando o cliente tenta agendar online, cai numa linha ocupada. Criei uma prévia de como vocês podem receber agendamentos automáticos pelo WhatsApp."',
    badge: 'Copywriting de Alto Impacto'
  },
  {
    step: 3,
    title: 'Apresentação de Protótipo Rápido',
    description: 'Gere a prévia da landing page usando o assistente de IA deste aplicativo e mostre ao proprietário a estrutura pronta (Hero Headline, prova social, botões de ação).',
    badge: 'Fechamento Visual'
  },
  {
    step: 4,
    title: 'Precificação e Recorrência',
    description: 'Cobre um valor inicial de criação (R$ 1.500 - R$ 3.500) e uma taxa mensal de manutenção/hospedagem (R$ 90 - R$ 190/mês) para criar renda recorrente para seu negócio.',
    badge: 'Modelo de Negócios'
  }
];
