/**
 * Template da prévia: uma landing page de verdade, não um cartão de visita.
 *
 * A prévia é o produto da venda ("eu te mostro antes de você pagar"), então ela
 * precisa ter a qualidade do que o cliente recebe depois de comprar: hero com
 * foto do negócio, serviços, prova social, localização, FAQ e CTA de WhatsApp em
 * todos os pontos de decisão.
 *
 * Regras de conteúdo (não negociáveis):
 * - só entra fato que existe no cadastro/ficha/marca; nada de prêmio, tempo de
 *   mercado ou número de clientes inventado;
 * - quando falta serviço, usa-se o repertório típico do nicho com a nota de que
 *   o texto é ajustado com o cliente no rodapé;
 * - sem JS: FAQ usa `<details>`, o resto é CSS.
 */
import type { StoredLead } from "../store/types";
import { prettyName } from "./briefingService";
import { pickPreviewImages } from "./brandImagery";
import { monogramSvg } from "./logoSvg";
import { fontFamilyCss, fontStylesheetUrl, pickFontPair } from "./fontPairs";

export function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* ------------------------------------------------------------------ */
/* cor                                                                 */
/* ------------------------------------------------------------------ */

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(hex: string, target: [number, number, number], amount: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const out = rgb.map((c, i) => Math.round(c + (target[i] - c) * amount));
  return `#${out.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

/** Contraste simples: decide se o texto sobre a cor de marca é branco ou preto. */
export function readableOn(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return "#ffffff";
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.55 ? "#20170a" : "#ffffff";
}

/**
 * Paleta derivada da identidade do negócio.
 *
 * Marca clara e dessaturada (dourado, areia, off-white) não funciona como cor de
 * botão: fica com cara de desabilitado e derruba o contraste. Nesse caso o botão
 * usa tinta escura e a cor da marca fica nos detalhes (linhas, números, ícones) —
 * é o arranjo que parece caro em vez de lavado.
 */
export function previewPalette(accentHex?: string) {
  const cru = /^#[0-9a-f]{6}$/i.test(String(accentHex || "")) ? String(accentHex) : "#0b6b3a";
  const rgb = hexToRgb(cru)!;
  const max = Math.max(...rgb) / 255;
  const min = Math.min(...rgb) / 255;
  const luminosidade = (rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114) / 255;
  const saturacao = max === 0 ? 0 : (max - min) / max;

  // cor de marca serve de botão? precisa escurecer ou ser viva o suficiente
  const serveDeBotao = luminosidade < 0.6 && saturacao > 0.22;
  const accentBtn = serveDeBotao ? cru : "#17171a";

  return {
    accent: cru,
    accentBtn,
    onAccent: serveDeBotao ? readableOn(cru) : "#ffffff",
    accentSoft: mix(cru, [255, 255, 255], 0.87),
    accentLine: mix(cru, [255, 255, 255], 0.58),
    accentDeep: serveDeBotao ? mix(cru, [0, 0, 0], 0.3) : mix(cru, [0, 0, 0], 0.55),
    ink: "#141414",
    body: "#3f4147",
    mute: "#6b6f76",
    line: "#e7e5e1",
    paper: "#ffffff",
    wash: "#faf8f5",
  };
}

/* ------------------------------------------------------------------ */
/* repertório por nicho                                                */
/* ------------------------------------------------------------------ */

interface Niche {
  key: string;
  headline: string;
  sub: string;
  services: string[];
  faq: Array<{ q: string; a: string }>;
  diferenciais: Array<{ titulo: string; texto: string }>;
}

const NICHOS: Array<{ re: RegExp; nicho: Niche }> = [
  {
    re: /odonto|dent|dental|sorriso/i,
    nicho: {
      key: "odonto",
      headline: "Cuidar do seu sorriso pode ser uma experiência tranquila",
      sub: "Atendimento com hora marcada, explicação de cada etapa e um plano de tratamento que cabe no seu tempo.",
      services: ["Avaliação e plano de tratamento", "Limpeza e prevenção", "Clareamento", "Lentes e facetas", "Restaurações", "Implantes"],
      diferenciais: [
        { titulo: "Sem correria", texto: "Consulta com tempo reservado para você perguntar e entender." },
        { titulo: "Plano antes do procedimento", texto: "Você sabe o que vai ser feito, em quantas etapas e por quê." },
        { titulo: "Agenda pelo WhatsApp", texto: "Marca, remarca e tira dúvida sem ligar em horário comercial." },
      ],
      faq: [
        { q: "Como funciona a primeira consulta?", a: "É uma avaliação: escutamos o que te incomoda, examinamos e montamos o plano com prioridades e valores antes de começar." },
        { q: "Vocês atendem por convênio?", a: "Fale com a gente no WhatsApp com o nome do seu convênio que confirmamos na hora." },
        { q: "Dá para parcelar o tratamento?", a: "Sim, as condições são combinadas no orçamento de acordo com o tratamento indicado." },
      ],
    },
  },
  {
    re: /est[eé]tica|harmoniza|sobrancelha|depila|beleza|sal[aã]o|cabelo|unha|manicure/i,
    nicho: {
      key: "beleza",
      headline: "Seu momento de cuidado, com resultado que se vê",
      sub: "Avaliação honesta do que faz sentido para você, técnica atual e ambiente pensado para relaxar.",
      services: ["Avaliação personalizada", "Limpeza de pele", "Design de sobrancelha", "Massagem relaxante", "Tratamentos faciais", "Pacotes mensais"],
      diferenciais: [
        { titulo: "Avaliação antes de indicar", texto: "Nada de pacote pronto: primeiro entendemos sua pele e sua rotina." },
        { titulo: "Ambiente reservado", texto: "Atendimento individual, sem fila e sem pressa." },
        { titulo: "Agenda pelo WhatsApp", texto: "Escolhe horário, tira dúvida e recebe lembrete na conversa." },
      ],
      faq: [
        { q: "Preciso agendar com antecedência?", a: "Recomendamos, para garantir o horário que você quer. Chame no WhatsApp e vemos a agenda da semana." },
        { q: "Quantas sessões preciso?", a: "Depende do objetivo. Na avaliação a gente diz com honestidade quantas sessões fazem sentido." },
        { q: "Atende no mesmo dia?", a: "Quando há horário livre, sim. Pergunte no WhatsApp que respondemos na hora." },
      ],
    },
  },
  {
    re: /barbearia|barbeiro/i,
    nicho: {
      key: "barbearia",
      headline: "Corte, barba e um atendimento que respeita seu tempo",
      sub: "Hora marcada, ambiente tranquilo e profissional que entende o seu estilo.",
      services: ["Corte masculino", "Barba e navalha", "Corte + barba", "Degradê", "Pigmentação", "Atendimento infantil"],
      diferenciais: [
        { titulo: "Hora marcada de verdade", texto: "Você chega, senta e é atendido no horário combinado." },
        { titulo: "Profissional fixo", texto: "Sempre a mesma pessoa cuidando do seu corte." },
        { titulo: "Agenda pelo WhatsApp", texto: "Marca e desmarca numa conversa, sem ligação." },
      ],
      faq: [
        { q: "Precisa agendar?", a: "Recomendamos para não esperar. Chame no WhatsApp e veja os horários livres." },
        { q: "Quanto tempo leva corte e barba?", a: "Em média 50 minutos. Confirmamos o tempo junto com o horário marcado." },
        { q: "Atende criança?", a: "Sim, com paciência e horário reservado para não apressar ninguém." },
      ],
    },
  },
  {
    re: /restaurante|lanchonete|pizza|hamburgu|caf[eé]|padaria|bar |petisco|comida|delivery/i,
    nicho: {
      key: "alimentacao",
      headline: "Comida feita com cuidado, no salão ou na sua casa",
      sub: "Cardápio enxuto, ingrediente fresco e pedido direto no WhatsApp, sem taxa de aplicativo.",
      services: ["Almoço no salão", "Delivery no bairro", "Encomendas e eventos", "Pratos do dia", "Bebidas e sobremesas", "Reserva de mesa"],
      diferenciais: [
        { titulo: "Pedido sem intermediário", texto: "Você fala direto com a gente e combina entrega ou retirada." },
        { titulo: "Cardápio atualizado", texto: "O que está na página é o que está saindo da cozinha hoje." },
        { titulo: "Encomenda com antecedência", texto: "Para festa e evento, combinamos quantidade e horário de retirada." },
      ],
      faq: [
        { q: "Vocês entregam no meu bairro?", a: "Mande seu endereço no WhatsApp que confirmamos a área e o tempo de entrega." },
        { q: "Dá para reservar mesa?", a: "Sim, é só combinar pelo WhatsApp quantas pessoas e o horário." },
        { q: "Fazem encomenda para festa?", a: "Fazemos. O ideal é falar com antecedência para reservar a produção do dia." },
      ],
    },
  },
  {
    re: /pet|veterin|animal|banho e tosa/i,
    nicho: {
      key: "pet",
      headline: "Seu pet atendido com o mesmo cuidado que você daria",
      sub: "Banho, tosa e acompanhamento veterinário com hora marcada e retorno por WhatsApp.",
      services: ["Banho e tosa", "Consulta veterinária", "Vacinação", "Tosa higiênica", "Hospedagem", "Taxi dog"],
      diferenciais: [
        { titulo: "Sem estresse para o pet", texto: "Fluxo e horário organizados para não juntar muitos animais ao mesmo tempo." },
        { titulo: "Acompanhamento de verdade", texto: "Mensagem depois do atendimento perguntando como ele ficou." },
        { titulo: "Agenda pelo WhatsApp", texto: "Marca, tira dúvida e recebe fotos durante o banho." },
      ],
      faq: [
        { q: "Quanto tempo leva o banho e tosa?", a: "Entre 1h e 2h, dependendo do porte e do tipo de pelo. Avisamos quando estiver pronto." },
        { q: "Precisa de carteira de vacinação?", a: "Para hospedagem e convivência com outros animais, sim. Traga na primeira visita." },
        { q: "Atendem emergência?", a: "Fale no WhatsApp que orientamos o que fazer e se conseguimos encaixar no mesmo dia." },
      ],
    },
  },
  {
    re: /academia|fitness|crossfit|pilates|personal|treino/i,
    nicho: {
      key: "fitness",
      headline: "Treino que cabe na sua rotina e respeita seu corpo",
      sub: "Avaliação inicial, acompanhamento próximo e horários que não brigam com o seu trabalho.",
      services: ["Avaliação física", "Treino personalizado", "Musculação", "Aulas em grupo", "Acompanhamento mensal", "Treino para iniciantes"],
      diferenciais: [
        { titulo: "Começa pelo avaliar", texto: "Antes de montar o treino, entendemos histórico e objetivo." },
        { titulo: "Acompanhamento próximo", texto: "Alguém corrigindo execução, não só uma sala cheia de equipamento." },
        { titulo: "Ajuste a cada ciclo", texto: "Treino revisto a cada 4 a 6 semanas conforme sua evolução." },
      ],
      faq: [
        { q: "Nunca treinei, posso começar?", a: "Pode. O primeiro passo é a avaliação, e o treino começa no seu nível." },
        { q: "Tem horário de manhã cedo?", a: "Chame no WhatsApp que enviamos a grade de horários atualizada." },
        { q: "Preciso pagar matrícula?", a: "As condições são explicadas direto na conversa, sem taxa escondida." },
      ],
    },
  },
  {
    re: /advocacia|advogad|jur[ií]dic|escrit[oó]rio de advocacia/i,
    nicho: {
      key: "juridico",
      headline: "Antes de decidir, entenda o seu direito",
      sub: "Conversa inicial para ouvir o caso, explicar os caminhos possíveis e dizer com honestidade o que faz sentido.",
      services: ["Consulta inicial", "Análise de documentos", "Ações trabalhistas", "Direito de família", "Contratos", "Consultoria preventiva"],
      diferenciais: [
        { titulo: "Explicação sem juridiquês", texto: "Você entende o cenário e as opções antes de decidir qualquer coisa." },
        { titulo: "Retorno combinado", texto: "Prazo de resposta definido já na primeira conversa." },
        { titulo: "Atendimento pelo WhatsApp", texto: "Primeiro contato e envio de documentos direto na conversa." },
      ],
      faq: [
        { q: "A primeira conversa é gratuita?", a: "Combinamos na hora: a consulta inicial tem escopo e valor explicados antes de começar." },
        { q: "Quanto tempo demora um processo?", a: "Depende do tipo de ação e da vara. Na análise do seu caso damos uma estimativa realista." },
        { q: "Preciso ir ao escritório?", a: "Muitas etapas são resolvidas à distância, com documento digitalizado e assinatura eletrônica." },
      ],
    },
  },
  {
    re: /psic[oó]log|terapia|terapeuta|psiquiatr/i,
    nicho: {
      key: "saude-mental",
      headline: "Um espaço para falar do que você vem segurando",
      sub: "Atendimento acolhedor, sigiloso e sem julgamento, presencial ou online, no seu ritmo.",
      services: ["Primeira conversa", "Atendimento individual", "Terapia online", "Terapia de casal", "Acompanhamento contínuo", "Orientação a familiares"],
      diferenciais: [
        { titulo: "Sigilo absoluto", texto: "O que é falado em sessão fica entre você e o profissional." },
        { titulo: "Sem julgamento", texto: "O ritmo é seu, e não existe assunto pequeno." },
        { titulo: "Contato direto", texto: "Dúvida sobre horário ou formato é resolvida no WhatsApp." },
      ],
      faq: [
        { q: "Como é a primeira sessão?", a: "É uma conversa para entender o que te traz e combinar como o trabalho vai acontecer." },
        { q: "Atende online?", a: "Sim, com o mesmo sigilo e a mesma duração da sessão presencial." },
        { q: "Qual a frequência?", a: "Normalmente semanal, ajustada conforme o que você está vivendo." },
      ],
    },
  },
  {
    re: /m[eé]dic|cl[ií]nica|sa[uú]de|fisio|nutri|fono|exame|laborat/i,
    nicho: {
      key: "saude",
      headline: "Atendimento de saúde sem enrolação e sem fila",
      sub: "Hora marcada, escuta de verdade e explicação clara do próximo passo do seu tratamento.",
      services: ["Consulta inicial", "Avaliação completa", "Retorno e acompanhamento", "Exames", "Orientações de rotina", "Atendimento particular"],
      diferenciais: [
        { titulo: "Tempo de consulta real", texto: "Agenda sem superlotação para o atendimento não ser corrido." },
        { titulo: "Próximo passo claro", texto: "Você sai sabendo o que fazer, quando e por quê." },
        { titulo: "Contato pelo WhatsApp", texto: "Dúvida entre consultas e resultado de exame, sem ligar." },
      ],
      faq: [
        { q: "Como agendar?", a: "Pelo WhatsApp, escolhendo o horário disponível na agenda da semana." },
        { q: "Atende convênio?", a: "Mande o nome do seu convênio na conversa que confirmamos na hora." },
        { q: "Preciso levar exames anteriores?", a: "Sim, ajuda muito. Traga os últimos exames e a lista de medicamentos em uso." },
      ],
    },
  },
];

const NICHE_DEFAULT: Niche = {
  key: "servicos",
  headline: "Um atendimento que resolve, do primeiro contato à entrega",
  sub: "Você fala direto com quem faz o serviço, recebe prazo claro e acompanha cada etapa.",
  services: ["Atendimento inicial", "Orçamento sem compromisso", "Execução do serviço", "Acompanhamento", "Garantia do serviço", "Suporte pós-entrega"],
  diferenciais: [
    { titulo: "Fala direto com quem faz", texto: "Sem central de atendimento no meio do caminho." },
    { titulo: "Prazo combinado", texto: "Você sabe quando começa e quando termina." },
    { titulo: "Contato pelo WhatsApp", texto: "Orçamento, dúvida e acompanhamento na mesma conversa." },
  ],
  faq: [
    { q: "Como peço um orçamento?", a: "Chame no WhatsApp, conte o que precisa e envie uma foto se ajudar. O retorno é rápido." },
    { q: "Qual o prazo de execução?", a: "Depende do serviço. O prazo é informado no orçamento, antes de fechar." },
    { q: "Atendem na minha região?", a: "Mande seu bairro ou cidade na conversa e confirmamos na hora." },
  ],
};

export function nicheFor(lead: StoredLead): Niche {
  const alvo = `${lead.searchCategory || ""} ${lead.category || ""} ${lead.name || ""}`;
  return NICHOS.find((n) => n.re.test(alvo))?.nicho || NICHE_DEFAULT;
}

/**
 * Descrição curta por tipo de serviço. Serve para os cards não repetirem a mesma
 * frase (o que parece placeholder) sem inventar detalhe técnico que não temos.
 */
const DESCRICOES: Array<{ re: RegExp; texto: string }> = [
  { re: /lente|faceta|resina/i, texto: "Formato e cor ajustados ao seu rosto, com planejamento antes de começar." },
  { re: /clareament|branque/i, texto: "Tom mais claro preservando o esmalte, com controle de sensibilidade." },
  { re: /limpeza|profilax|preven/i, texto: "Remoção de tártaro e orientação de rotina para manter o resultado." },
  { re: /implante|pr[oó]tese/i, texto: "Reposição do dente com avaliação de estrutura e tempo de cicatrização." },
  { re: /ortodon|aparelho|alinhador/i, texto: "Alinhamento planejado por etapas, com revisões combinadas." },
  { re: /canal|endodont/i, texto: "Tratamento para eliminar a dor e preservar o dente." },
  { re: /restaura|obtura/i, texto: "Reconstrução do dente com material da cor natural." },
  { re: /avalia|consulta|diagn[oó]stico/i, texto: "Conversa e exame para entender o que você precisa, com plano e valores." },
  { re: /extens|alongament|c[ií]lios/i, texto: "Aplicação feita com técnica e material adequados ao seu fio." },
  { re: /sobrancelha|design/i, texto: "Formato desenhado conforme o seu rosto, com correção quando necessário." },
  { re: /pele|limpeza de pele|hidrat/i, texto: "Avaliação da pele antes de indicar o protocolo e a frequência." },
  { re: /massagem|relax/i, texto: "Sessão com ambiente reservado e tempo reservado para você." },
  { re: /corte/i, texto: "Corte feito na hora marcada, com acabamento no seu estilo." },
  { re: /barba|navalha/i, texto: "Modelagem com toalha quente e acabamento na navalha." },
  { re: /banho|tosa/i, texto: "Banho com produto adequado ao pelo e secagem sem estresse." },
  { re: /vacina/i, texto: "Protocolo aplicado conforme a carteira de vacinação do animal." },
  { re: /treino|muscula|personal/i, texto: "Série montada para o seu objetivo e corrigida durante a execução." },
  { re: /avalia[cç][aã]o f[ií]sica/i, texto: "Medidas e histórico antes de definir o treino." },
  { re: /contrato|consultoria/i, texto: "Análise do caso, riscos e o que dá para fazer antes de assinar." },
  { re: /fam[ií]lia|div[oó]rcio|pens[aã]o/i, texto: "Orientação sobre etapas, prazos e documentos necessários." },
  { re: /trabalh/i, texto: "Análise dos direitos e do que é possível pleitear." },
  { re: /entrega|encomenda|delivery|encomendas/i, texto: "Pedido combinado no WhatsApp, com horário de retirada ou entrega." },
  { re: /almo[cç]o|prato|card[aá]pio/i, texto: "Feito no dia, com opção de comer no salão ou levar." },
  { re: /reserva/i, texto: "Mesa reservada no horário combinado, sem fila." },
];

function descricaoServico(nome: string): string {
  return DESCRICOES.find((d) => d.re.test(nome))?.texto || "Fale com a gente para entender como funciona no seu caso.";
}

const FAMILIAS: Array<{ re: RegExp; familia: string }> = [
  { re: /lente|faceta|resina/i, familia: "lentes" },
  { re: /clareament|branque/i, familia: "clareamento" },
  { re: /limpeza|profilax/i, familia: "limpeza" },
  { re: /implante|pr[oó]tese/i, familia: "implante" },
  { re: /ortodon|aparelho|alinhador/i, familia: "ortodontia" },
  { re: /restaura|obtura/i, familia: "restauracao" },
  { re: /canal|endodont/i, familia: "canal" },
  { re: /avalia|consulta|diagn[oó]stico/i, familia: "avaliacao" },
  { re: /corte/i, familia: "corte" },
  { re: /barba/i, familia: "barba" },
  { re: /banho/i, familia: "banho" },
  { re: /tosa/i, familia: "tosa" },
  { re: /treino|muscula|personal/i, familia: "treino" },
  { re: /contrato|consultoria/i, familia: "contratos" },
];

function familiaDe(nome: string): string | null {
  return FAMILIAS.find((f) => f.re.test(nome))?.familia || null;
}

/** Tira quase-duplicata ("Lentes em resina" × "Lentes em Resina Lumini"). */
function semDuplicata(lista: string[]): string[] {
  const mantidos: string[] = [];
  const chaves: string[] = [];
  const familias: string[] = [];
  for (const item of lista) {
    const chave = item.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
    const familia = familiaDe(item);
    const repetido =
      chaves.some((v) => v === chave || chave.startsWith(`${v} `) || v.startsWith(`${chave} `)) ||
      (familia ? familias.includes(familia) : false);
    if (repetido) continue;
    mantidos.push(item);
    chaves.push(chave);
    if (familia) familias.push(familia);
  }
  return mantidos;
}

/** Porta de entrada primeiro: avaliação/consulta abre a lista. */
function ordenaServicos(lista: string[]): string[] {
  const entrada = lista.filter((s) => /avalia|consulta|diagn[oó]stico/i.test(s));
  return [...entrada, ...lista.filter((s) => !entrada.includes(s))];
}

/* ------------------------------------------------------------------ */
/* blocos                                                              */
/* ------------------------------------------------------------------ */

function ratingLine(lead: StoredLead): string {
  const nota = typeof lead.rating === "number" && Number.isFinite(lead.rating) ? String(lead.rating).replace(".", ",") : null;
  const reviews = lead.reviewsCount;
  if (nota && reviews) return `${nota} ★ · ${reviews} avaliações no Google`;
  if (nota) return `${nota} ★ no Google`;
  return "";
}

export interface PreviewContext {
  accent?: string;
}

/**
 * Monta a página da prévia.
 *
 * Fatos usados: cadastro (nome, categoria, endereço, telefone, nota, avaliações),
 * ficha do cliente (serviços, horário) e identidade visual (cor, fotos, logo).
 */
export function renderPreviewHtml(lead: StoredLead, now: Date = new Date()): string {
  const pal = previewPalette(
    (lead.brandSnapshot?.palette || []).map((c) => String(c.hex || "")).find((h) => /^#[0-9a-f]{6}$/i.test(h))
  );
  const nicho = nicheFor(lead);
  // Tipografia: display com personalidade + texto discreto, escolhidos pelo tom
  // da marca. Sem a fonte, o fallback do CSS mantém a página legível.
  const fontes = pickFontPair({
    tone: lead.brandSnapshot?.tone,
    typography: lead.brandSnapshot?.typography,
    nicho: `${lead.searchCategory || ""} ${lead.category || ""}`,
  });
  const fontUrl = fontStylesheetUrl(fontes);
  const fonteDisplay = fontFamilyCss(fontes.display, "display");
  const fonteCorpo = fontFamilyCss(fontes.body, "body");
  const name = prettyName(lead.name, 64);
  const categoria = lead.searchCategory || lead.category || "Negócio local";
  const local = [lead.neighborhood, lead.city, lead.state].filter(Boolean).join(", ");
  const wa = /^\d/.test(String(lead.phone || "").replace(/\D/g, "")) ? `https://wa.me/${String(lead.phone).replace(/\D/g, "").replace(/^0+/, "").replace(/^(\d{10,11})$/, "55$1")}` : null;
  const waLink = wa && wa.length > 15 ? wa : null;
  const prova = ratingLine(lead);
  const horario = lead.clientProfile?.hours || "";
  const endereco = lead.address || "";
  // Imagens classificadas por papel: fachada NUNCA vira hero (é foto de rua, com
  // reflexo e placa torta) — ela prova localização, no bloco de endereço.
  const imagens = pickPreviewImages(lead.brandSnapshot);
  const heroImg = imagens.hero;
  const galeria = imagens.gallery;
  const fachada = imagens.facade;

  // Logo de verdade (a IA descreveu como logo e confiou). Foto pequena no topo,
  // ainda que "confiante", é o que faz a página parecer amadora.
  const logoBruto = String(lead.brandSnapshot?.logo?.url || "");
  const logoConfianca = Number(lead.brandSnapshot?.logo?.confidence ?? 0);
  const logoPareceLogo = /logo|logotipo|logomarca|monograma/i.test(String(lead.brandSnapshot?.logo?.description || ""));
  const logo = /^https?:\/\//i.test(logoBruto) && logoConfianca >= 0.55 && logoPareceLogo ? logoBruto : null;
  const marcaSvg = monogramSvg(name, pal, 36);

  const servicosReais = semDuplicata((lead.clientProfile?.services || []).filter(Boolean)).slice(0, 6);
  // card vazio de texto e seção com 2 itens parecem placeholder: completa com o
  // repertório do nicho e avisa que a lista é ajustada com o cliente.
  const completar = servicosReais.length < 4;
  const servicos = ordenaServicos(
    completar ? semDuplicata([...servicosReais, ...nicho.services]).slice(0, 6) : servicosReais
  );
  const servicosSaoExemplo = completar;
  const diferenciais = nicho.diferenciais;
  const faq = nicho.faq.slice(0, 3);

  const iconeWpp = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.4A10 10 0 1 0 12 2Zm0 18a8 8 0 0 1-4.1-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8 8 0 1 1 12 20Zm4.6-5.9c-.2-.1-1.4-.7-1.6-.8-.2-.1-.4-.1-.6.1l-.8.9c-.1.2-.3.2-.5.1a6.5 6.5 0 0 1-3.2-2.8c-.1-.2 0-.4.1-.5l.6-.7c.1-.2.1-.3 0-.5l-.7-1.6c-.1-.3-.3-.3-.5-.3h-.5c-.2 0-.5.1-.7.3-.6.6-.9 1.3-.9 2.1 0 .8.4 1.6.6 2a9 9 0 0 0 3.5 3.4c.9.5 1.7.8 2.5.9.6.1 1.2 0 1.7-.2.4-.2.9-.7 1.1-1.2.1-.3.1-.6.1-.7-.1-.1-.3-.2-.4-.3Z"/></svg>`;
  const cta = (texto: string, classe = "btn btn-primary") =>
    waLink
      ? `<a class="${classe}" href="${esc(waLink)}" rel="noopener">${iconeWpp}${esc(texto)}</a>`
      : `<span class="${classe} btn-off">${esc(texto)}</span>`;

  const mapa = [name, endereco, lead.city, lead.state].filter(Boolean).join(" ");
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapa)}`;

  const heroFoto = heroImg?.url || "";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<meta name="theme-color" content="${pal.accent}" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="${esc(fontUrl)}" />
<title>${esc(name)} — ${esc(categoria)} em ${esc(lead.city || "sua cidade")}</title>
<meta name="description" content="${esc(`${name}: ${nicho.sub}`)}" />
<style>
  :root{
    --accent:${pal.accent}; --accent-btn:${pal.accentBtn}; --accent-soft:${pal.accentSoft};
    --accent-line:${pal.accentLine}; --accent-deep:${pal.accentDeep}; --on-accent:${pal.onAccent};
    --ink:${pal.ink}; --body:${pal.body}; --mute:${pal.mute}; --line:${pal.line};
    --paper:${pal.paper}; --wash:${pal.wash};
    --font-display:${fonteDisplay}; --font-body:${fonteCorpo};
    --r-lg:22px; --r-md:14px; --r-sm:10px;
    --shadow:0 1px 2px rgba(16,16,16,.04), 0 12px 32px -18px rgba(16,16,16,.25);
  }
  *{box-sizing:border-box}
  html{scroll-behavior:smooth}
  body{
    margin:0;background:var(--paper);color:var(--body);
    font-family:var(--font-body);
    font-size:17px;line-height:1.62;-webkit-font-smoothing:antialiased;text-wrap:pretty;
  }
  img{max-width:100%;display:block}
  a{color:inherit}
  .wrap{width:100%;max-width:1120px;margin:0 auto;padding:0 22px}
  .eyebrow{font-size:11.5px;letter-spacing:.18em;font-family:var(--font-body);text-transform:uppercase;color:#54585f;font-weight:650;margin:0 0 14px;text-wrap:pretty}
  h1,h2,h3{color:var(--ink);margin:0;letter-spacing:-.025em;line-height:1.08;font-weight:700;text-wrap:balance;font-family:var(--font-display)}
  h1{font-size:clamp(32px,5.2vw,60px);font-weight:600;letter-spacing:-.035em}
  h2{font-size:clamp(26px,3.6vw,40px)}
  h3{font-size:19px;letter-spacing:-.01em;line-height:1.25}
  p{margin:0}

  /* topo */
  .top{border-bottom:1px solid var(--line);background:rgba(255,255,255,.86);backdrop-filter:blur(10px);position:sticky;top:0;z-index:20}
  .top-in{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:13px 0}
  .brand{display:flex;align-items:center;gap:11px;min-width:0;text-decoration:none}
  .brand img{height:34px;width:auto;border-radius:8px;object-fit:contain}
  .mark-svg{display:inline-flex;flex:none;line-height:0;border-radius:11px}
  .mark-cover{display:block;line-height:0}
  .brand b{display:block;font-family:var(--font-display);font-size:15.5px;color:var(--ink);letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .brand span{display:block;font-size:11.5px;color:var(--mute)}
  .top .btn{white-space:nowrap}
  .nav{display:none;gap:26px;margin-left:auto;margin-right:8px}
  .nav a{font-size:14px;color:#4b4f55;text-decoration:none;font-weight:500}
  .nav a:hover{color:var(--ink)}

  /* botões */
  .btn{display:inline-flex;align-items:center;justify-content:center;gap:9px;text-decoration:none;
       font-weight:600;font-size:15.5px;padding:14px 24px;border-radius:999px;min-height:50px;
       transition:transform .16s ease,box-shadow .16s ease,background .16s ease}
  .btn-primary{background:var(--accent-btn);color:var(--on-accent);box-shadow:0 10px 24px -14px rgba(20,20,20,.55)}
  .btn-primary:hover{transform:translateY(-1px);box-shadow:0 16px 30px -16px rgba(20,20,20,.6)}
  .btn-ghost{background:transparent;color:var(--ink);border:1px solid var(--line)}
  .btn-ghost:hover{border-color:var(--accent-line);background:var(--accent-soft)}
  .btn-off{background:#c9ccd2;color:#fff;cursor:not-allowed}
  .btn:focus-visible,a:focus-visible,summary:focus-visible{outline:3px solid var(--accent-line);outline-offset:3px}
  .hero .btn{flex:none}
  .hero .actions{display:flex;flex-wrap:wrap;gap:12px;margin:30px 0 0}

  /* hero */
  .hero{padding:clamp(30px,5vw,64px) 0 clamp(36px,5vw,72px)}
  .hero-grid{display:grid;gap:clamp(28px,4vw,56px);align-items:center}
  .hero h1{margin-bottom:20px}
  .hero .sub{font-size:clamp(16.5px,2vw,19px);color:var(--body);max-width:46ch}
  .proof{display:inline-flex;align-items:center;gap:8px;margin:22px 0 0;font-size:14px;color:var(--ink);
         background:var(--wash);border:1px solid var(--line);border-radius:999px;padding:7px 14px}
  .proof b{font-weight:650}
  .place{font-size:13.5px;color:var(--mute);margin:12px 0 0;display:flex;align-items:center;gap:7px}
  .shot{position:relative;border-radius:var(--r-lg);overflow:hidden;background:var(--accent-soft);box-shadow:var(--shadow);
        aspect-ratio:4/5;min-height:280px}
  .shot img{width:100%;height:100%;object-fit:cover}
  .shot.noimg{display:grid;place-items:center;background:
      radial-gradient(120% 90% at 80% 0%, var(--accent-soft) 0%, #fff 62%);aspect-ratio:5/4}
  .cover-brand{display:grid;justify-items:center;text-align:center;gap:10px;padding:34px 26px;max-width:340px}
  .cover-brand b{font-size:20px;color:var(--ink);letter-spacing:-.02em;line-height:1.2}
  .cover-brand span{font-size:12.5px;letter-spacing:.1em;text-transform:uppercase;color:#54585f;font-weight:600}
  .cover-brand em{font-size:13.5px;font-style:normal;color:var(--mute);line-height:1.5;border-top:1px solid var(--accent-line);padding-top:12px;margin-top:2px}
  .fachada{margin:16px 0 0;border-radius:12px;overflow:hidden;border:1px solid var(--line);background:var(--accent-soft)}
  .fachada img{width:100%;height:150px;object-fit:cover}
  .float{position:absolute;left:14px;bottom:14px;right:14px;background:rgba(255,255,255,.94);backdrop-filter:blur(6px);
         border-radius:var(--r-md);padding:12px 14px;display:flex;align-items:center;gap:11px;box-shadow:0 8px 24px -14px rgba(0,0,0,.4)}
  .float b{display:block;font-size:13.5px;color:var(--ink);line-height:1.2}
  .float span{display:block;font-size:12px;color:var(--mute)}
  .dot{width:9px;height:9px;border-radius:50%;background:#22c55e;box-shadow:0 0 0 4px rgba(34,197,94,.16);flex:none}

  /* faixa de confiança */
  .strip{border-top:1px solid var(--line);border-bottom:1px solid var(--line);background:var(--wash)}
  .strip-in{display:grid;gap:18px;padding:22px 0;grid-template-columns:1fr}
  .strip-item{display:flex;gap:10px;align-items:flex-start}
  .strip-item b{display:block;font-size:13.5px;color:var(--ink)}
  .strip-item span{display:block;font-size:12.5px;color:var(--mute)}
  .ico{width:20px;height:20px;flex:none;color:var(--accent);margin-top:2px}

  /* seções */
  section.blk{padding:clamp(52px,7vw,96px) 0}
  .blk-head{max-width:62ch;margin-bottom:clamp(28px,4vw,44px)}
  .blk-head h2{margin-bottom:14px}
  .blk-head p{color:var(--body)}

  .servicos{display:grid;gap:14px;grid-template-columns:1fr}
  .servico{border:1px solid var(--line);border-radius:var(--r-md);padding:22px;background:var(--paper);
           transition:border-color .16s ease,box-shadow .16s ease,transform .16s ease}
  .servico:hover{border-color:var(--accent-line);box-shadow:var(--shadow);transform:translateY(-2px)}
  .servico .n{font-size:12px;font-variant-numeric:tabular-nums;color:var(--accent);font-weight:700;letter-spacing:.06em}
  .servico h3{margin:10px 0 0;font-family:var(--font-display);font-weight:600}
  .servico p{font-size:14px;color:var(--mute);margin:7px 0 0}

  .galeria{display:grid;gap:12px;grid-template-columns:1fr 1fr}
  .galeria figure{margin:0;border-radius:var(--r-md);overflow:hidden;background:var(--accent-soft);aspect-ratio:1}
  .galeria img{width:100%;height:100%;object-fit:cover}

  .difs{display:grid;gap:22px;grid-template-columns:1fr;margin:0;padding:0;list-style:none}
  .difs li{border-top:2px solid var(--accent-line);padding-top:16px}
  .difs b{display:block;color:var(--ink);font-size:16.5px;margin-bottom:6px}
  .difs span{font-size:14.5px;color:var(--body)}

  .info{display:grid;gap:16px;grid-template-columns:1fr}
  .card-info{border:1px solid var(--line);border-radius:var(--r-md);padding:22px;background:var(--wash)}
  .card-info h3{font-size:13px;text-transform:uppercase;letter-spacing:.12em;color:#54585f;font-weight:650;margin-bottom:12px}
  .card-info p{font-size:15px;color:var(--ink)}
  .card-info a{color:var(--accent-deep);font-weight:600}
  .linha{display:flex;gap:10px;align-items:flex-start;font-size:14.5px;color:var(--ink)}
  .linha + .linha{margin-top:12px}

  .faq details{border-bottom:1px solid var(--line);padding:18px 0}
  .faq summary{list-style:none;cursor:pointer;display:flex;justify-content:space-between;gap:16px;
               font-size:16.5px;font-weight:600;color:var(--ink)}
  .faq summary::-webkit-details-marker{display:none}
  .faq summary::after{content:"+";color:var(--accent-deep);font-weight:700;font-size:22px;line-height:1;padding-left:8px}
  .faq details[open] summary::after{content:"–"}
  .faq p{margin:12px 0 0;font-size:15px;color:var(--body);max-width:72ch}

  /* CTA final */
  .final{background:var(--ink);color:#f6f5f3;padding:clamp(52px,7vw,88px) 0}
  .final h2{color:#fff;max-width:24ch;font-family:var(--font-display)}
  .final p{color:#c9c7c2;margin-top:16px;max-width:48ch}
  .final .btn-primary{background:#fff;color:#141414;box-shadow:0 12px 28px -18px rgba(0,0,0,.8)}
  .final .btn-primary:hover{background:#f4f1ec}
  .final .btn-ghost{border-color:rgba(255,255,255,.28);color:#fff}
  .final .btn-ghost:hover{background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.5)}
  .final .actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:30px}

  /* rodapé */
  footer{padding:34px 0 44px;font-size:12.5px;color:var(--mute);line-height:1.65}
  footer .previa{display:inline-block;border:1px solid var(--line);border-radius:999px;padding:5px 12px;
                 font-size:11px;letter-spacing:.14em;text-transform:uppercase;margin-bottom:14px}
  footer strong{color:var(--ink)}


  /* ---------------------------------------------------------------- */
  /* movimento                                                         */
  /* ---------------------------------------------------------------- */
  @keyframes subir{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
  @keyframes aparecer{from{opacity:0;transform:translateY(22px) scale(.995)}to{opacity:1;transform:none}}

  /* a primeira dobra entra uma vez: dá a sensação de página montada na hora */
  .hero .eyebrow{animation:subir .6s cubic-bezier(.22,.7,.25,1) both}
  .hero h1{animation:subir .75s cubic-bezier(.22,.7,.25,1) .06s both}
  .hero .sub{animation:subir .75s cubic-bezier(.22,.7,.25,1) .14s both}
  .hero .proof,.hero .place{animation:subir .7s cubic-bezier(.22,.7,.25,1) .2s both}
  .hero .actions{animation:subir .7s cubic-bezier(.22,.7,.25,1) .26s both}
  .hero .shot{animation:aparecer .9s cubic-bezier(.22,.7,.25,1) .12s both}

  /* Reveal por scroll foi testado e DESCARTADO: com animation-timeline view()
     a seção ficava invisível justamente quando entrava na tela (o progresso do
     timeline não avança como esperado em viewport grande). Animação que esconde
     conteúdo é pior que animação nenhuma; no lugar dela, movimento sem risco:
     hover, toque e abertura de pergunta. */

  /* ponto de "online" pulsando devagar */
  @keyframes pulsar{0%,100%{box-shadow:0 0 0 4px rgba(34,197,94,.16)}50%{box-shadow:0 0 0 7px rgba(34,197,94,.06)}}
  .dot{animation:pulsar 3.2s ease-in-out infinite}

  /* pergunta abrindo aparece suave (não depende de scroll) */
  .faq details[open] p{animation:subir .28s ease both}

  /* resposta ao toque: botão afunda, card levanta */
  .btn:active{transform:translateY(1px) scale(.995)}
  .servico:active{transform:translateY(0)}

  /* toque vivo nos elementos clicáveis */
  .btn{will-change:transform}
  .galeria figure{transition:transform .3s ease,box-shadow .3s ease}
  .galeria figure:hover{transform:translateY(-3px) scale(1.01);box-shadow:var(--shadow)}
  .shot img{transition:transform .6s ease}
  .shot:hover img{transform:scale(1.015)}

  @media print{
    /* imprimir/salvar em PDF não rola a página: nada pode ficar invisível */
    .hero .eyebrow,.hero h1,.hero .sub,.hero .actions,.hero .shot{animation:none!important;opacity:1!important;transform:none!important}
  }

  @media (prefers-reduced-motion:reduce){
    *,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}
  }

  @media(min-width:720px){
    .hero-grid{grid-template-columns:1.05fr .95fr}
    .nav{display:flex}
    .strip-in{grid-template-columns:repeat(3,1fr);gap:26px}
    .servicos{grid-template-columns:repeat(2,1fr)}
    .difs{grid-template-columns:repeat(3,1fr)}
    .info{grid-template-columns:1.1fr .9fr}
  }
  @media(min-width:1000px){
    .servicos{grid-template-columns:repeat(3,1fr)}
  }
</style>
</head>
<body>

<header class="top">
  <div class="wrap top-in">
    <a class="brand" href="#topo">
      ${logo ? `<img src="${esc(logo)}" alt="${esc(name)}" loading="lazy" />` : `<span class="mark-svg">${marcaSvg}</span>`}
      <span>
        <b>${esc(name)}</b>
        <span>${esc(categoria)}${lead.city ? ` · ${esc(lead.city)}` : ""}</span>
      </span>
    </a>
    <nav class="nav">
      <a href="#servicos">Serviços</a>
      <a href="#contato">Contato</a>
      <a href="#duvidas">Dúvidas</a>
    </nav>
    ${cta("Falar no WhatsApp")}
  </div>
</header>

<main id="topo">
  <section class="hero">
    <div class="wrap hero-grid">
      <div>
        <p class="eyebrow">${esc(categoria)}${local ? ` · ${esc(local)}` : ""}</p>
        <h1>${esc(nicho.headline)}</h1>
        <p class="sub">${esc(nicho.sub)}</p>
        ${prova ? `<p class="proof"><b>${esc(prova)}</b></p>` : ""}
        ${endereco ? `<p class="place">${esc(endereco)}</p>` : local ? `<p class="place">${esc(local)}</p>` : ""}
        <div class="actions">
          ${cta("Falar no WhatsApp")}
          <a class="btn btn-ghost" href="#servicos">Ver serviços</a>
        </div>
      </div>

      <div class="shot${heroFoto ? "" : " noimg"}">
        ${
          heroFoto
            ? `<img src="${esc(heroFoto)}" alt="${esc(heroImg?.description || name)}" />`
            : `<span class="cover-brand">
            ${monogramSvg(name, pal, 88)}
            <b>${esc(name)}</b>
            <span>${esc(categoria)}${lead.city ? ` · ${esc(lead.city)}` : ""}</span>
            <em>Atendimento com hora marcada, direto no WhatsApp.</em>
          </span>`
        }
        <div class="float">
          <span class="dot"></span>
          <span>
            <b>Respondemos no WhatsApp</b>
            <span>${horario ? esc(horario) : "Atendimento com hora marcada"}</span>
          </span>
        </div>
      </div>
    </div>
  </section>

  <div class="strip">
    <div class="wrap strip-in">
      <div class="strip-item">
        <svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        <span><b>Contato direto</b><span>Sem formulário e sem robô: você fala com a gente.</span></span>
      </div>
      <div class="strip-item">
        <svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
        <span><b>Hora marcada</b><span>${horario ? esc(horario) : "Agenda combinada na conversa."}</span></span>
      </div>
      <div class="strip-item">
        <svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20 6 9 17l-5-5"/></svg>
        <span><b>Sem compromisso</b><span>Tirar dúvida não custa nada e não amarra você.</span></span>
      </div>
    </div>
  </div>

  <section class="blk" id="servicos">
    <div class="wrap">
      <div class="blk-head">
        <p class="eyebrow">O que fazemos</p>
        <h2>Serviços</h2>
        <p>${servicosSaoExemplo ? "Estes são os serviços mais procurados nesta área; ajustamos a lista com você antes de publicar." : "O que você encontra aqui, explicado de forma direta."}</p>
      </div>
      <div class="servicos">
        ${servicos
          .map(
            (s, i) => `<article class="servico">
          <span class="n">${String(i + 1).padStart(2, "0")}</span>
          <h3>${esc(s)}</h3>
          <p>${esc(descricaoServico(s))}</p>
        </article>`
          )
          .join("")}
      </div>
    </div>
  </section>

  ${
    galeria.length
      ? `<section class="blk" style="padding-top:0">
    <div class="wrap">
      <div class="blk-head">
        <p class="eyebrow">Por dentro</p>
        <h2>Onde você é atendido</h2>
      </div>
      <div class="galeria">
        ${galeria.map((f) => `<figure><img src="${esc(f)}" alt="${esc(name)}" loading="lazy" /></figure>`).join("")}
      </div>
    </div>
  </section>`
      : ""
  }

  <section class="blk" style="background:var(--wash)">
    <div class="wrap">
      <div class="blk-head">
        <p class="eyebrow">Por que aqui</p>
        <h2>O que muda no atendimento</h2>
      </div>
      <ul class="difs">
        ${diferenciais.map((d) => `<li><b>${esc(d.titulo)}</b><span>${esc(d.texto)}</span></li>`).join("")}
      </ul>
    </div>
  </section>

  <section class="blk" id="contato">
    <div class="wrap info">
      <div class="card-info">
        <h3>Onde estamos</h3>
        <p>${esc(endereco || [lead.neighborhood, lead.city, lead.state].filter(Boolean).join(", ") || "Endereço a confirmar")}</p>
        ${fachada ? `<figure class="fachada"><img src="${esc(fachada.url)}" alt="Fachada de ${esc(name)}" loading="lazy" /></figure>` : ""}
        <div style="margin-top:18px">
          <div class="linha">
            <svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 10c0 7-9 12-9 12s-9-5-9-12a9 9 0 0 1 18 0Z"/><circle cx="12" cy="10" r="3"/></svg>
            <span><a href="${esc(mapsUrl)}" rel="noopener">Abrir no Google Maps</a></span>
          </div>
          ${lead.phone ? `<div class="linha">
            <svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z"/></svg>
            <span>Telefone: <a href="${esc(waLink || "#")}" rel="noopener">${esc(lead.phone)}</a></span>
          </div>` : ""}
        </div>
      </div>
      <div class="card-info">
        <h3>Horário</h3>
        <p>${horario ? esc(horario) : "Combine o melhor horário pelo WhatsApp."}</p>
        <div style="margin-top:18px">${cta("Falar no WhatsApp")}</div>
      </div>
    </div>
  </section>

  <section class="blk faq" id="duvidas" style="padding-top:0">
    <div class="wrap">
      <div class="blk-head">
        <p class="eyebrow">Dúvidas</p>
        <h2>Perguntas frequentes</h2>
      </div>
      ${faq.map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join("")}
    </div>
  </section>

  <section class="final">
    <div class="wrap">
      <h2>${esc(`Quer falar com a ${name}?`)}</h2>
      <p>Manda uma mensagem agora. A gente responde, entende o que você precisa e passa o valor antes de qualquer compromisso.</p>
      <div class="actions">
        ${cta("Falar no WhatsApp")}
        <a class="btn btn-ghost" href="#servicos">Ver serviços</a>
      </div>
    </div>
  </section>
</main>

<footer>
  <div class="wrap">
    <span class="previa">Prévia</span>
    <p>
      Página montada pela <strong>Vértice Páginas Web</strong> com as informações públicas do seu negócio no Google.
      Textos, fotos e seções são <strong>ajustados com você antes de qualquer pagamento</strong>.
    </p>
    <p style="margin-top:10px">
      ${esc([name, endereco, [lead.city, lead.state].filter(Boolean).join("/"), lead.phone].filter(Boolean).join(" · "))}
    </p>
    <p style="margin-top:10px">
      Esta é a primeira versão · gerada em ${esc(now.toLocaleDateString("pt-BR"))}.
    </p>
  </div>
</footer>

</body>
</html>`;
}
