/**
 * Catálogo de estrutura de sites de odontologia.
 *
 * Lê só ESTRUTURA: títulos, presença de componentes e vocabulário de seção.
 * Não guarda texto, imagem nem código de terceiros — apenas contagem de tipos.
 */
import fs from "node:fs";

const urls = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const saida = process.argv[3] || "odonto-catalogo.json";

/**
 * Componentes GENÉRICOS (valem para qualquer nicho, em pt e en) e SERVIÇOS por nicho.
 * A separação é de propósito: serviço é vocabulário do nicho, componente é estrutura.
 */
const SINAIS_GENERICOS = {
  contato_whatsapp: /wa\.me|api\.whatsapp|whatsapp|\btext us\b/i,
  telefone_clicavel: /href=["']tel:/i,
  endereco: /\brua \b|\bavenida \b|\bav\. |\balameda |\brodovia |\bpra[cç]a |\bstreet\b|\bavenue\b|\bsuite\b|\bblvd\b/i,
  mapa: /maps\.google|<iframe[^>]*(maps|waze)|google\.com\/maps/i,
  horario: /hor[aá]rio|segunda a|seg\.? a sex|\bhours\b|open (mon|tue|wed)|\bmon[\s-]?(fri|sat)\b|office hours/i,
  equipe: /nossa equipe|corpo cl[ií]nico|respons[aá]vel t[eé]cnico|\bcro\b|\bteam\b|our (doctors|barbers|stylists|professionals)|meet the/i,
  depoimentos: /depoimento|avalia[cç][oõ]es|google reviews|o que dizem|\btestimonials?\b|\breviews?\b/i,
  galeria: /galeria|gallery|portfolio|\bour work\b/i,
  video: /youtube\.com\/embed|youtu\.be|vimeo\.com|<video/i,
  blog: /\/blog|artigos|conte[uú]dos|\bblog\b/i,
  agendamento_online: /agende (online|agora)|agendamento|calendly|\bbooking\.com|\bbooksy\b|\bfresha\b|\bvagaro\b|\bsquire\b|book (online|now|an appointment)|schedule (online|now)|reserve/i,
  pagamento: /parcel|cart[aã]o de cr[eé]dito|\bpix\b|formas de pagamento|\bfinancing\b|payment plans?|carecredit|\bwe accept\b/i,
  estacionamento: /estacionamento|\bparking\b/i,
  urgencia: /urg[eê]ncia|plant[aã]o|atendimento imediato|\bemergency\b|same-day|walk-?in/i,
  tecnologia: /scanner|radiografia digital|tomografia|laser|impressora 3d|cad\/cam|digital x-?ray|\bcerec\b|intraoral/i,
  antes_depois: /antes e depois|antes\/depois|before.?after|smile makeover|transformation/i,
  faq: /<details|<summary|perguntas frequentes|\bfaq\b|frequently asked/i,
    produtos: /loja online|shop now|\badd to cart\b|pomada|\bmerch\b|nossa loja|\bmembership products\b/i,
  gift_card: /gift ?card|vale.?presente/i,
  planos: /\bmembership\b|plano mensal|assinatura|\bclub\b|subscription/i,
};

const SERVICOS_POR_NICHO = {
  odontologia: {
    implante: /implante|\bimplants?\b|dental implant|pr[oó]tese|protocolo/i,
    ortodontia: /aparelho|alinhador|invisalign|ortodont|\bbraces\b|orthodont/i,
    clareamento: /clareamento|\bwhitening\b|bleach/i,
    odontopediatria: /odontopediatria|pediatric|kids/i,
    harmonizacao: /harmoniza[cç][aã]o facial|botox|preenchimento|cosmetic/i,
    convenios: /conv[eê]nio|plano de sa[uú]de|unimed|amil|bradesco sa[uú]de|sulamerica|odontoprev|\binsurance\b|in-network/i,
  },
  fisioterapia: {
    ortopedica: /ortop[eé]dic|coluna|joelho|ombro|h[eé]rnia|\blombar\b|\bcervical\b|tendinite|\bles[aã]o\b/i,
    esportiva: /esportiv|atleta|corrida|\brunner\b|\bsport\b|performance/i,
    pelvica: /p[eé]lvica|assoalho|incontin[eê]ncia|p[oó]s-?parto|gestante/i,
    respiratoria: /respirat[oó]ri|pulmonar|\bipap\b|\bcpap\b|asma|dpoc/i,
    neurologica: /neuro|\bavc\b|parkinson|esclerose|\bneurofuncional\b/i,
    pilates: /pilates|reformer/i,
    convenio: /conv[eê]nio|unimed|amil|bradesco sa[uú]de|sulamerica|\binsurance\b|reembolso/i,
    domiciliar: /domiciliar|em casa|home care|atendimento em domic[ií]lio/i,
    avaliacao: /avalia[cç][aã]o (postural|funcional)|\bassessment\b|diagn[oó]stico/i,
    equipamentos: /ultrassom|laser|tens|\bons\b|eletroterapia|\bcrioterapia\b/i,
  },
  pilates: {
    reformer: /\breformer\b/i,
    aparelhos: /\bcadillac\b|\bchair\b|\bbarreira\b|\bwall unit\b|aparelhos/i,
    turma: /turma|group class|\bgrupo\b|\bduo\b|\btrio\b/i,
    individual: /individual|personal|\bprivate\b|\bsolo\b/i,
    experimental: /aula experiment|experimental|aula gr[aá]tis|free class|\btrial\b/i,
    gestante: /gestante|gesta[cç][aã]o|p[oó]s-?parto|prenatal|pr[eé]-natal/i,
    terceira_idade: /terceira idade|idoso|\bs[eê]nior\b|60\+/i,
    dor_postura: /dor (nas costas|lombar|cervical)|postura|escoliose|h[eé]rnia|\bcoluna\b|\bposture\b|\bback pain\b/i,
    fisioterapia: /fisioterapi|\bphysio/i,
    formacao: /forma[cç][aã]o|curso|capacita[cç][aã]o|\bteacher training\b/i,
  },
  psicologia: {
    terapia_individual: /terapia individual|atendimento individual|psicoterapia individual|\bindividual therapy\b|one-to-one/i,
    terapia_casal: /terapia de casal|casal|relacionamento|\bcouples?\b|marriage/i,
    infantil: /infantil|crian[cç]a|adolescente|\bkids\b|\bchild\b|\bteen\b/i,
    online: /online|remot[oa]|videochamada|\btelehealth\b/i,
    presencial: /presencial|consult[oó]rio|\bin-person\b/i,
    tcc: /terapia cognitivo|\btcc\b|\bcbt\b|cognitivo-comportamental/i,
    psicanalise: /psican[aá]lise|psicanal[ií]tic|freud|lacan/i,
    ansiedade: /ansiedade|depress[aã]o|burnout|\bestresse\b|p[aâ]nico|\banxiety\b|\bdepress/i,
    abordagem: /abordagem|linha te[oó]rica|metodologia|\bapproach\b/i,
  },
  otica: {
    grau: /\bgrau\b|prescri[cç][aã]o|receita m[eé]dica|\bprescription\b/i,
    sol: /\bsol\b|sunglasses|\bsolar\b|polarizad/i,
    lentes_contato: /lente de contato|contact lens|contato gel/i,
    multifocal: /multifocal|progressiv|varilux|bifocal/i,
    infantil: /infantil|crian[cç]a|\bkids\b/i,
    esportivo: /esportiv|\bsport\b|nata[cç][aã]o|ciclismo/i,
    ajuste: /ajuste|conserto|manuten[cç][aã]o|\bfitting\b|\brepair\b/i,
    exame: /exame de vista|exame visual|\beye exam\b|\beye test\b|optometrista/i,
  },
  barbearia: {
    corte: /\bcorte\b|\bhaircut\b|\bfade\b|degrad[eê]|\btrim\b|\bcut\b/i,
    barba: /\bbarba\b|\bbeard\b|\bshave\b|navalha|\brazor\b|hot towel/i,
    combo: /\bcombo\b|\bpackage\b|pacote|corte \+ barba|haircut \+ beard/i,
    coloracao: /colora[cç][aã]o|\bhair color\b|platinum|descolora|coloring/i,
    sobrancelha: /sobrancelha|\bbrow\b/i,
    infantil: /infantil|crian[cç]a|\bkids\b|\bchild\b/i,
    produtos: /loja online|shop now|\badd to cart\b|pomada|\bmerch\b|nossa loja|\bmembership products\b/i,
  },
};

const SINAIS = { ...SINAIS_GENERICOS, ...(SERVICOS_POR_NICHO[process.env.NICHO_ALVO || "odontologia"] || {}) };


/**
 * Conferência de nicho — OBRIGATÓRIA antes de catalogar.
 * Já entrou errado uma referência de proctologia numa amostra de odontologia
 * (clinicazimmermann, vinda de portfólio de agência). Curadoria de lista e
 * case de agência não garantem que o site seja do nicho.
 */
// NOTA: radicais curtos (dent, odont) PRECISAM de \b — sem âncora, 'dent' casa dentro
// de 'acidente' e reprova ótica de verdade como se fosse odontologia.
const LEXICO_NICHO = {
  odontologia: {
    exige: 3,
    positivo: /dent(ista|e|al|adura)|odont(o|ologia)|implante|ortodont|aparelho ortod|clareamento|sorriso|\bcro\b|endodont|periodont|pr[oó]tese dent|canal|extra[cç][aã]o/i,
    outrosNichos: {
      proctologia: /proctolog|colonoscopia|colorretal|hemorroid|fissura anal|cirurgia rob[oó]tica/i,
      ginecologia: /ginecolog|obstetr|pr[eé]-natal|menopausa|contracep/i,
      dermatologia: /dermatolog|pele|melasma|acne|cabelo|capilar/i,
      oftalmologia: /oftalmolog|catarata|glaucoma|retina|miopia|astigmatismo/i,
      veterinaria: /veterin[aá]ri|pet shop|vacina[cç][aã]o animal|castra[cç][aã]o/i,
      advocacia: /advogad|jur[ií]dic|escrit[oó]rio de advocacia|oab\b/i,
      contabilidade: /contabil|contador|balan[cç]o|imposto de renda/i,
    },
  },
  barbearia: {
    exige: 3,
    positivo: /barbearia|barbeiro|barbershop|\bhig ?\b|navalha|\bfade\b|degrad[eê]|corte masculino|\bshave\b|\bhaircut\b|beard/i,
    outrosNichos: {
      odontologia: /\b(dentista|dentes?|dental|odontolog\w*|ortodont\w*)\b|implante dent[aá]rio/i,
      proctologia: /proctolog|colonoscopia|hemorroid/i,
      estetica_facial: /harmoniza[cç][aã]o facial|botox|preenchimento labial|skinbooster/i,
      veterinaria: /veterin[aá]ri|castra[cç][aã]o|vacina[cç][aã]o animal/i,
      advocacia: /advogad|\boab\b|jur[ií]dic/i,
      contabilidade: /contabil|contador|imposto de renda/i,
    },
  },
  fisioterapia: {
    exige: 3,
    positivo: /fisioterap|fisioterapeuta|\bcrefito\b|reabilita[cç][aã]o|fisioterapia (ortop[eé]dica|esportiva|respiratória|p[eé]lvica)|\bphysiotherap(y|ist)\b|\bphysical therapy\b|\bpt\b.*cl[ií]nica/i,
    outrosNichos: {
      odontologia: /\b(dentista|dentes?|dental|odontolog\w*|ortodont\w*)\b|implante dent[aá]rio/i,
      barbearia: /barbearia|barbershop|barbeiro/i,
      otica: /[oó]tica|\b[oó]culos\b|optometri/i,
      estetica_facial: /harmoniza[cç][aã]o facial|botox|preenchimento labial/i,
      veterinaria: /veterin[aá]ri|castra[cç][aã]o animal/i,
      advocacia: /advogad|\boab\b|jur[ií]dic/i,
      contabilidade: /contabil|contador|imposto de renda/i,
    },
  },
  pilates: {
    exige: 3,
    positivo: /pilates|\breformer\b|\bcadillac\b|\bchair\b.*pilates|pilates cl[aá]ssico|studio de pilates|est[uú]dio de pilates|\bcore\b|postura|\bcore\b|\bmat\b.*pilates/i,
    outrosNichos: {
      odontologia: /\b(dentista|dentes?|dental|odontolog\w*|ortodont\w*)\b|implante dent[aá]rio/i,
      barbearia: /barbearia|barbershop|barbeiro|\bnavalha\b/i,
      otica: /[oó]tica|\b[oó]culos\b|arma[cç][aã]o|optometri/i,
      estetica_facial: /harmoniza[cç][aã]o facial|botox|preenchimento labial|limpeza de pele/i,
      veterinaria: /veterin[aá]ri|castra[cç][aã]o animal/i,
      advocacia: /advogad|\boab\b|jur[ií]dic/i,
      contabilidade: /contabil|contador|imposto de renda/i,
    },
  },
  psicologia: {
    exige: 3,
    positivo: /psic[oó]log|psicoterapia|psican[aá]lise|terapia\b|\bcrp\b|\btdah\b|ansiedade|depress[aã]o|sa[uú]de mental|acolhimento|escuta|\btherap(y|ist)\b|\bcounsel(l)?ing\b/i,
    outrosNichos: {
      odontologia: /\b(dentista|dentes?|dental|odontolog\w*|ortodont\w*)\b|implante dent[aá]rio/i,
      barbearia: /barbearia|barbershop|barbeiro|\bnavalha\b|corte masculino/i,
      otica: /[oó]tica|\b[oó]culos\b|arma[cç][aã]o|optometri|eyewear|sunglasses/i,
      estetica_facial: /harmoniza[cç][aã]o facial|botox|preenchimento labial|limpeza de pele/i,
      veterinaria: /veterin[aá]ri|castra[cç][aã]o animal/i,
      advocacia: /advogad|\boab\b|jur[ií]dic/i,
      contabilidade: /contabil|contador|imposto de renda/i,
      psiquiatria: /psiquiatra|medica[cç][aã]o|receita de antidepressivo|\brivotril\b/i,
    },
  },
  otica: {
    exige: 3,
    positivo: /[oó]tica|\b[oó]culos\b|arma[cç][aã]o|\blentes?\b|optometri|eyewear|\bglasses\b|\boptician\b|sunglasses|\bframes\b|contato gel|multifocal|progressiv/i,
    outrosNichos: {
      odontologia: /\b(dentista|dentes?|dental|odontolog\w*|ortodont\w*)\b|implante dent[aá]rio/i,
      barbearia: /barbearia|barbershop|\bfade\b|navalha|degrad[eê]/i,
      estetica_facial: /harmoniza[cç][aã]o facial|botox|preenchimento labial/i,
      veterinaria: /veterin[aá]ri|castra[cç][aã]o animal/i,
      advocacia: /advogad|\boab\b|jur[ií]dic/i,
      contabilidade: /contabil|contador|imposto de renda/i,
    },
    grau: /\bgrau\b|prescri[cç][aã]o|receita m[eé]dica|\bprescription\b/i,
    sol: /\bsol\b|sunglasses|\bsolar\b|polarizad/i,
    lentes_contato: /lente de contato|contact lens|contato gel/i,
    multifocal: /multifocal|progressiv|varilux|bifocal/i,
    infantil: /infantil|crian[cç]a|\bkids\b/i,
    esportivo: /esportiv|sport|nata[cç][aã]o|ciclismo/i,
    ajuste: /ajuste|conserto|manuten[cç][aã]o|\bfitting\b|\brepair\b/i,
    exame: /exame de vista|exame visual|\beye exam\b|refrat|optometrista/i,
  },
};

function conferirNicho(html, titulo, nicho = "odontologia") {
  const regra = LEXICO_NICHO[nicho];
  if (!regra) return { confirmado: null, motivo: "sem léxico para este nicho" };
  const amostra = ((titulo || "") + " " + (html || "")).slice(0, 400000);
  // ATENÇÃO: regex sem /g casa só a PRIMEIRA ocorrência. Contar exigia a flag global —
  // sem isso todo site dava no máximo 1 "acerto" e era reprovado por insuficiência.
  const contar = (re) => (amostra.match(new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g")) || []).length;
  const acertos = contar(regra.positivo);
  const alheios = [];
  for (const [outro, re] of Object.entries(regra.outrosNichos)) {
    const n = contar(re);
    if (n >= 2) alheios.push(`${outro}:${n}`);
  }
  // Site feito em SPA entrega HTML quase vazio: não dá para julgar o nicho pelo
  // texto. Nesse caso é INCONCLUSIVO (precisa de captura renderizada), nunca reprovado.
  const textoVisivel = (html || "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const poucoTexto = textoVisivel.length < 1500;
  if (acertos >= regra.exige && alheios.length === 0) {
    return { confirmado: true, acertos, alheios, motivo: `ok (${acertos} sinais de ${nicho})` };
  }
  if (alheios.length) {
    return { confirmado: false, acertos, alheios, motivo: `fala de outro nicho (${alheios.join(", ")})` };
  }
  if (poucoTexto) {
    return { confirmado: null, acertos, alheios, motivo: `inconclusivo: HTML quase vazio (${textoVisivel.length} chars) — conferir na captura renderizada` };
  }
  return { confirmado: false, acertos, alheios, motivo: `sinais insuficientes de ${nicho} (${acertos}/${regra.exige})` };
}


/**
 * Domínios que NUNCA são o negócio: infraestrutura, plataformas, portais.
 * Vazam das listas de "inspiração" (link para Cloudflare, GitHub, reddit, API do
 * WhatsApp) e, se entram, contaminam a frequência com o que não é do nicho.
 */
const DOMINIOS_BLOQUEADOS = /^(www\.)?(cloudflare|github|gitlab|digitalocean|aws\.amazon|netlify|vercel|reddit|twitter|x|facebook|instagram|whatsapp|gmpg|w3|schema|wordpress|wordpress\.org|shopify|squarespace|wix|godaddy|medium|youtube|vimeo|apple|google)\b/i;


/**
 * Tipo de site — a conferência de nicho sozinha não basta.
 * Numa busca por "psicólogo", entraram diretório, associação e até agência de
 * marketing que fala de "agenda cheia". Nenhum deles é consultório e todos
 * distorcem a frequência.
 */
function classificarTipo(html, url) {
  const texto = (html || "").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<script[\s\S]*?<\/script>/gi, " ");
  const host = String(url || "").toLowerCase();
  const regras = [
    // regras apertadas de propósito: "eventos" e "curso" aparecem em consultório de verdade
    ["agencia", /ag[eê]ncia de (marketing|tr[aá]fego|publicidade)|tr[aá]fego pago|gest[aã]o de redes sociais|sua agenda cheia sem depender/i],
    ["agregador", /encontre (seu|a) (psic[oó]log|terapeuta|profissional)|find a (therapist|counselor|psychologist)|milhares de profissionais|diret[oó]rio de profissionais|compare pre[cç]os de/i],
    ["associacao", /associa[cç][aã]o (brasileira|de [a-z]|dos)|sociedade brasileira de|seja um associado|quadro de associados/i],
    ["instituto_metodo", /instituto (de|do) [a-z]|forma[cç][aã]o em (psicoterapia|psican[aá]lise)|curso de (forma[cç][aã]o|especializa[cç][aã]o)/i],
  ];
  for (const [tipo, re] of regras) if (re.test(texto)) return tipo;
  return "negocio";
}

const TITULOS = /<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/gi;
const limpar = (t) => t.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim().toLowerCase();

const resultado = [];
for (const url of urls) {
  const registro = { url, ok: false };
  const hostDoUrl = (() => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; } })();
  if (DOMINIOS_BLOQUEADOS.test(hostDoUrl)) {
    registro.motivo = `domínio de infraestrutura/plataforma (${hostDoUrl}): não é o negócio`;
    resultado.push(registro);
    continue;
  }
  try {
    const resposta = await fetch(url, {
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; LeadRadarCatalog/1.0)" },
      signal: AbortSignal.timeout(15000),
    });
    registro.status = resposta.status;
    if (!resposta.ok) { resultado.push(registro); continue; }
    const html = await resposta.text();
    registro.bytes = html.length;
    const titulos = [...html.matchAll(TITULOS)].map((m) => limpar(m[2])).filter((t) => t.length > 2 && t.length < 90);
    registro.titulos = titulos.slice(0, 24);
    registro.qtdSecoes = titulos.filter((_, i) => true).length;
    // Medir sobre o HTML SEM <style>/<script>: senão "color:" do CSS casa com coloração,
    // "product" de schema casa com produtos, e a frequência mente.
    const limpo = html.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ");
    registro.sinais = Object.fromEntries(Object.entries(SINAIS).map(([k, re]) => [k, re.test(limpo)]));
    const tituloHtml = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "";
    registro.tipo = classificarTipo(html, url);
    registro.nicho = conferirNicho(html, tituloHtml, process.env.NICHO_ALVO || "odontologia");
    registro.whatsapp_flutuante = /position:\s*fixed[^}]*whatsapp|whatsapp[^{]*\{[^}]*position:\s*fixed/i.test(html);
    registro.ok = true;
  } catch (erro) {
    registro.erro = String(erro?.message || erro).slice(0, 80);
  }
  resultado.push(registro);
  await new Promise((r) => setTimeout(r, 400));
}

fs.writeFileSync(saida, JSON.stringify(resultado, null, 1));

// Agregação
const foraDoTipo = resultado.filter((r) => r.ok && r.tipo && r.tipo !== "negocio");
const validos = resultado.filter((r) => r.ok && r.nicho?.confirmado !== false && (!r.tipo || r.tipo === "negocio"));
const recusados = resultado.filter((r) => r.ok && r.nicho?.confirmado === false);
const bloqueados = resultado.filter((r) => !r.ok && /infraestrutura\/plataforma/.test(r.motivo || ""));
const inconclusivos = resultado.filter((r) => r.ok && r.nicho?.confirmado === null);
const freq = {};
for (const chave of Object.keys(SINAIS)) {
  freq[chave] = validos.filter((r) => r.sinais?.[chave]).length;
}
const ordenado = Object.entries(freq).sort((a, b) => b[1] - a[1]);
console.log(`\n=== ${validos.length} páginas válidas de ${resultado.length} ===`);
if (recusados.length) {
  console.log(`\nFORA DO NICHO (não entram na conta):`);
  for (const r of recusados) console.log(`  ${r.url} → ${r.nicho.motivo}`);
}
if (foraDoTipo.length) {
  console.log(`\nNÃO É NEGÓCIO (agregador/associação/agência — fora da conta):`);
  for (const r of foraDoTipo) console.log(`  ${r.url} → ${r.tipo}`);
}
if (bloqueados.length) {
  console.log(`\nBLOQUEADOS (infraestrutura, não são o negócio):`);
  for (const r of bloqueados) console.log(`  ${r.url}`);
}
if (inconclusivos.length) {
  console.log(`\nNICHO INCONCLUSIVO (entram, mas precisam de conferência visual):`);
  for (const r of inconclusivos) console.log(`  ${r.url} → ${r.nicho.motivo}`);
}
console.log("");
for (const [k, v] of ordenado) {
  console.log(`${String(Math.round((v / validos.length) * 100)).padStart(3)}%  ${k.padEnd(20)} (${v}/${validos.length})`);
}
const mediaSecoes = validos.reduce((s, r) => s + (r.qtdSecoes || 0), 0) / (validos.length || 1);
console.log(`\nmédia de títulos h1-h3 por página: ${mediaSecoes.toFixed(1)}`);
fs.writeFileSync(saida.replace(".json", "-freq.json"), JSON.stringify({ total: validos.length, freq: ordenado, mediaSecoes }, null, 1));
