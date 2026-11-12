/**
 * Classificação das imagens coletadas do negócio.
 *
 * O erro que isto corrige: usar a FOTO DA FACHADA no hero. Fachada é vitrine de
 * rua, com reflexo, placa torta e gente passando — num hero ela entrega "prévia
 * feita no automático". Retrato e interior vendem; fachada serve para provar onde
 * fica, então vai no bloco de localização, pequena.
 *
 * A classificação é determinística, pelas palavras que a pesquisa de marca já
 * escreveu em cada imagem (`description`). Sem descrição, o veredito é `generico`
 * — e `generico` nunca vira hero sozinho.
 */
import type { BrandSnapshot } from "../store/types";

export type ImageRole = "retrato" | "interior" | "produto" | "fachada" | "logo" | "generico";

export interface ClassifiedImage {
  url: string;
  description: string;
  role: ImageRole;
}

const REGRAS: Array<{ role: ImageRole; re: RegExp }> = [
  { role: "logo", re: /\b(logo|logotipo|logomarca|marca d.?\s?água|marca dagua|monograma)\b/i },
  {
    role: "fachada",
    re: /\b(fachada|frente da loja|frente do (consult|escrit|sal[aã]o|restaurante)|vitrine|letreiro|placa|entrada do|rua|cal[cç]ada|street ?view)\b/i,
  },
  {
    role: "retrato",
    re: /\b(retrato|rosto|sorriso|profissional posando|equipe|dentista|m[eé]dic[ao]|doutor[ao]?|barbeir[oa]|cabeleireir[oa]|atendimento ao paciente|pessoa|mulher|homem|crian[cç]a com|selfie|trabalhando|enviada pelo cliente)\b/i,
  },
  {
    role: "interior",
    re: /\b(interior|consult[oó]rio|recep[cç][aã]o|sala|ambiente|escrit[oó]rio|balc[aã]o|mesa de atendimento|esta[cç][aã]o de trabalho|poltrona|cadeira odontol[oó]gica|cl[ií]nica por dentro|sal[aã]o por dentro|cozinha|sal[aã]o de treino)\b/i,
  },
  { role: "produto", re: /\b(prato|comida|caf[eé]|bebida|produto|equipamento|instrumento|lente|aparelho|resultado|antes e depois|cabelo|unha|corte de cabelo)\b/i },
];

export function classifyImage(url: string, description = ""): ImageRole {
  const texto = `${description} ${url}`.toLowerCase();
  const achado = REGRAS.find((r) => r.re.test(texto));
  return achado ? achado.role : "generico";
}

// `assets/...` é a cópia local feita por imageCacheService; URL remota só entra
// depois de baixada (o CDN de rede social bloqueia hotlink e entrega imagem quebrada).
const urlUsavel = (u: string) => /^assets\//i.test(u) || /^https?:\/\//i.test(u);

export function classifiedImagery(snapshot?: BrandSnapshot): ClassifiedImage[] {
  if (!snapshot) return [];
  const vistos = new Set<string>();
  const out: ClassifiedImage[] = [];
  for (const img of snapshot.imagery || []) {
    const url = String(img.url || "");
    const chave = url.split("?")[0];
    if (!urlUsavel(url) || vistos.has(chave)) continue;
    vistos.add(chave);
    out.push({ url, description: String(img.description || ""), role: classifyImage(url, String(img.description || "")) });
  }
  return out;
}

export interface PreviewImages {
  /** Imagem grande do hero: nunca fachada nem logo. */
  hero: ClassifiedImage | null;
  /** Até 2 imagens de apoio (interior/produto/retrato). */
  gallery: ClassifiedImage[];
  /** Fachada: vai pequena no bloco de localização, provando onde o negócio fica. */
  facade: ClassifiedImage | null;
}

export function pickPreviewImages(snapshot?: BrandSnapshot): PreviewImages {
  const todas = classifiedImagery(snapshot);
  const heroOrdem: ImageRole[] = ["retrato", "interior", "produto", "generico"];
  const hero = todas.find((i) => heroOrdem.includes(i.role)) || null;
  const facade = todas.find((i) => i.role === "fachada") || null;
  const gallery = todas.filter((i) => i !== hero && i.role !== "fachada" && i.role !== "logo").slice(0, 2);
  return { hero, gallery, facade };
}
