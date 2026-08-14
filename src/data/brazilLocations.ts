export interface StateOption {
  code: string;
  name: string;
}

export const BRAZIL_STATES: StateOption[] = [
  { code: 'SP', name: 'São Paulo (SP)' },
  { code: 'RJ', name: 'Rio de Janeiro (RJ)' },
  { code: 'MG', name: 'Minas Gerais (MG)' },
  { code: 'PR', name: 'Paraná (PR)' },
  { code: 'RS', name: 'Rio Grande do Sul (RS)' },
  { code: 'SC', name: 'Santa Catarina (SC)' },
  { code: 'BA', name: 'Bahia (BA)' },
  { code: 'PE', name: 'Pernambuco (PE)' },
  { code: 'CE', name: 'Ceará (CE)' },
  { code: 'GO', name: 'Goiás (GO)' },
  { code: 'ES', name: 'Espírito Santo (ES)' },
  { code: 'DF', name: 'Distrito Federal (DF)' },
  { code: 'AM', name: 'Amazonas (AM)' },
  { code: 'PA', name: 'Pará (PA)' },
  { code: 'MT', name: 'Mato Grosso (MT)' },
  { code: 'MS', name: 'Mato Grosso do Sul (MS)' },
  { code: 'RN', name: 'Rio Grande do Norte (RN)' },
  { code: 'PB', name: 'Paraíba (PB)' },
  { code: 'MA', name: 'Maranhão (MA)' },
  { code: 'AL', name: 'Alagoas (AL)' },
  { code: 'SE', name: 'Sergipe (SE)' },
  { code: 'PI', name: 'Piauí (PI)' },
  { code: 'TO', name: 'Tocantins (TO)' },
  { code: 'RO', name: 'Rondônia (RO)' },
  { code: 'AC', name: 'Acre (AC)' },
  { code: 'AP', name: 'Amapá (AP)' },
  { code: 'RR', name: 'Roraima (RR)' },
];

export const CITIES_BY_STATE: Record<string, string[]> = {
  SP: [
    'São Paulo',
    'Campinas',
    'Guarulhos',
    'São Bernardo do Campo',
    'Santo André',
    'Osasco',
    'Ribeirão Preto',
    'Sorocaba',
    'Santos',
    'São José dos Campos',
    'Jundiaí',
    'Piracicaba',
    'Bauru',
    'Barueri',
    'Mogi das Cruzes',
    'Franca',
    'Araraquara',
    'São José do Rio Preto',
    'Taubaté',
    'Limeira',
    'Indaiatuba',
    'Cotia',
    'Praia Grande',
    'Americana'
  ],
  RJ: [
    'Rio de Janeiro',
    'Niterói',
    'Petrópolis',
    'Duque de Caxias',
    'Nova Iguaçu',
    'Macaé',
    'Cabo Frio',
    'Campos dos Goytacazes',
    'Volta Redonda',
    'Teresópolis',
    'Angra dos Reis',
    'Búzios',
    'São Gonçalo',
    'Resende'
  ],
  MG: [
    'Belo Horizonte',
    'Uberlândia',
    'Juiz de Fora',
    'Contagem',
    'Uberaba',
    'Montes Claros',
    'Poços de Caldas',
    'Ipatinga',
    'Governador Valadares',
    'Divinópolis',
    'Pouso Alegre',
    'Varginha',
    'Sete Lagoas'
  ],
  PR: [
    'Curitiba',
    'Londrina',
    'Maringá',
    'Ponta Grossa',
    'Cascavel',
    'Foz do Iguaçu',
    'São José dos Pinhais',
    'Guarapuava',
    'Paranaguá',
    'Toledo'
  ],
  RS: [
    'Porto Alegre',
    'Caxias do Sul',
    'Canoas',
    'Pelotas',
    'Santa Maria',
    'Gravataí',
    'Viamão',
    'Novo Hamburgo',
    'Passo Fundo',
    'Rio Grande'
  ],
  SC: [
    'Florianópolis',
    'Joinville',
    'Blumenau',
    'Balneário Camboriú',
    'Chapecó',
    'Criciúma',
    'Itajaí',
    'Jaraguá do Sul',
    'Palhoça',
    'Lages'
  ],
  BA: [
    'Salvador',
    'Feira de Santana',
    'Vitória da Conquista',
    'Camaçari',
    'Juazeiro',
    'Lauro de Freitas',
    'Itabuna',
    'Ilhéus',
    'Porto Seguro',
    'Barreiras'
  ],
  PE: [
    'Recife',
    'Jaboatão dos Guararapes',
    'Olinda',
    'Caruaru',
    'Petrolina',
    'Paulista',
    'Cabo de Santo Agostinho',
    'Garanhuns'
  ],
  CE: [
    'Fortaleza',
    'Caucaia',
    'Juazeiro do Norte',
    'Sobral',
    'Maracanaú',
    'Crato',
    'Itapipoca',
    'Aquiraz'
  ],
  GO: [
    'Goiânia',
    'Aparecida de Goiânia',
    'Anápolis',
    'Rio Verde',
    'Luziânia',
    'Águas Lindas de Goiás',
    'Valparaíso de Goiás',
    'Itumbiara'
  ],
  ES: [
    'Vitória',
    'Vila Velha',
    'Serra',
    'Cariacica',
    'Cachoeiro de Itapemirim',
    'Linhares',
    'Guarapari',
    'Colatina'
  ],
  DF: [
    'Brasília',
    'Taguatinga',
    'Ceilândia',
    'Águas Claras',
    'Samambaia',
    'Plano Piloto',
    'Gama',
    'Guará'
  ],
  AM: ['Manaus', 'Parintins', 'Itacoatiara', 'Manacapuru'],
  PA: ['Belém', 'Ananindeua', 'Santarém', 'Marabá', 'Parauapebas'],
  MT: ['Cuiabá', 'Várzea Grande', 'Rondonópolis', 'Sinop'],
  MS: ['Campo Grande', 'Dourados', 'Três Lagoas', 'Corumbá'],
  RN: ['Natal', 'Mossoró', 'Parnamirim', 'São Gonçalo do Amarante'],
  PB: ['João Pessoa', 'Campina Grande', 'Santa Rita', 'Patos'],
  MA: ['São Luís', 'Imperatriz', 'São José de Ribamar', 'Timon'],
  AL: ['Maceió', 'Arapiraca', 'Rio Largo', 'Palmeira dos Índios'],
  SE: ['Aracaju', 'Nossa Senhora do Socorro', 'Lagarto', 'Itabaiana'],
  PI: ['Teresina', 'Parnaíba', 'Picos', 'Floriano'],
  TO: ['Palmas', 'Araguaína', 'Gurupi', 'Porto Nacional'],
  RO: ['Porto Velho', 'Ji-Paraná', 'Ariquemes', 'Vilhena'],
  AC: ['Rio Branco', 'Cruzeiro do Sul', 'Sena Madureira'],
  AP: ['Macapá', 'Santana', 'Laranjal do Jari'],
  RR: ['Boa Vista', 'Rorainópolis', 'Caracaraí']
};

export function getCitiesForState(stateCode: string): string[] {
  if (!stateCode) {
    // Return unique popular cities across all states
    const all = Object.values(CITIES_BY_STATE).flat();
    return Array.from(new Set(all));
  }
  return CITIES_BY_STATE[stateCode] || [];
}
