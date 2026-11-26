/**
 * Catálogo de estrutura de sites de odontologia.
 *
 * Lê só ESTRUTURA: títulos, presença de componentes e vocabulário de seção.
 * Não guarda texto, imagem nem código de terceiros — apenas contagem de tipos.
 */
import fs from "node:fs";

const urls = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const saida = process.argv[3] || "odonto-catalogo.json";

const SINAIS = {
  convenios: /conv[eê]nio|plano de sa[uú]de|unimed|amil|bradesco sa[uú]de|sulamerica|odontoprev|particular/i,
  urgencia: /urg[eê]ncia|dor de dente|plant[aã]o|24 ?h|atendimento imediato/i,
  antes_depois: /antes e depois|antes\/depois|before.?after|transforma[cç][aã]o do sorriso/i,
  equipe: /nossa equipe|corpo cl[ií]nico|doutor|dra\.|respons[aá]vel t[eé]cnico|\bcro\b/i,
  depoimentos: /depoimento|avalia[cç][oõ]es|google reviews|o que dizem/i,
  faq: /<details|<summary|perguntas frequentes|\bfaq\b/i,
  mapa: /maps\.google|<iframe[^>]*(maps|waze)|google\.com\/maps/i,
  horario: /hor[aá]rio de (atendimento|funcionamento)|segunda a|seg\.? a sex|aberto das/i,
  pagamento: /parcel|cart[aã]o de cr[eé]dito|pix|formas de pagamento/i,
  estacionamento: /estacionamento/i,
  tecnologia: /scanner|radiografia digital|tomografia|laser|impressora 3d|cad\/cam/i,
  implante: /implante|protocolo|pr[oó]tese/i,
  ortodontia: /aparelho|alinhador|invisalign|ortodont/i,
  clareamento: /clareamento/i,
  infantil: /odontopediatria|infantil|crian[cç]a/i,
  harmonizacao: /harmoniza[cç][aã]o|botox|preenchimento|est[eé]tica facial/i,
  casos: /casos? cl[ií]nicos|resultados reais|portfolio/i,
  galeria: /galeria|gallery/i,
  video: /youtube\.com\/embed|<video/i,
  blog: /\/blog|artigos|conte[uú]dos/i,
  agendamento_online: /agende (online|agora)|agendamento online|calendly|booking|agende seu hor[aá]rio/i,
  whatsapp: /wa\.me|api\.whatsapp|whatsapp/i,
  telefone_clicavel: /href=["']tel:/i,
  endereco: /rua |avenida |av\. |alameda |rodovia |pra[cç]a /i,
  financeiro: /financiamento|boleto|mensalidade/i,
};


/**
 * Conferência de nicho — OBRIGATÓRIA antes de catalogar.
 * Já entrou errado uma referência de proctologia numa amostra de odontologia
 * (clinicazimmermann, vinda de portfólio de agência). Curadoria de lista e
 * case de agência não garantem que o site seja do nicho.
 */
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
};

function conferirNicho(html, titulo, nicho = "odontologia") {
  const regra = LEXICO_NICHO[nicho];
  if (!regra) return { confirmado: null, motivo: "sem léxico para este nicho" };
  const amostra = ((titulo || "") + " " + (html || "")).slice(0, 400000);
  const acertos = (amostra.match(regra.positivo) || []).length;
  const alheios = [];
  for (const [outro, re] of Object.entries(regra.outrosNichos)) {
    const n = (amostra.match(re) || []).length;
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

const TITULOS = /<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/gi;
const limpar = (t) => t.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim().toLowerCase();

const resultado = [];
for (const url of urls) {
  const registro = { url, ok: false };
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
    registro.sinais = Object.fromEntries(Object.entries(SINAIS).map(([k, re]) => [k, re.test(html)]));
    const tituloHtml = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "";
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
const validos = resultado.filter((r) => r.ok && r.nicho?.confirmado !== false);
const recusados = resultado.filter((r) => r.ok && r.nicho?.confirmado === false);
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
