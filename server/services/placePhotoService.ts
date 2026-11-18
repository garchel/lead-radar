/**
 * Foto do negócio que já veio na busca (Google Maps via SerpAPI).
 *
 * A pesquisa de marca costuma terminar sem imagem utilizável quando o negócio só
 * tem Instagram: o CDN do Instagram/Facebook bloqueia hotlink e devolve HTML no
 * lugar do JPG, então `imageCacheService` descarta e o hero fica com o cartão de
 * marca. Só que a busca ORIGINAL já trouxe uma foto de cada estabelecimento no
 * campo `thumbnail` do `local_results` — 1000×1000, servida por
 * `lh3.googleusercontent.com`, que baixa normalmente.
 *
 * Ou seja: a foto estava no banco desde o começo, só não era usada. Esta camada
 * aproveita o que já foi pago em cota de SerpAPI, sem gastar chamada nova.
 */
import { getDb } from "../store/schema";
import type { BrandSnapshot, StoredLead } from "../store/types";

type LeadImage = BrandSnapshot["imagery"][number];

/** Comparação de nome sem acento, caixa ou pontuação. */
function normaliza(valor: string): string {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** O título do Maps casa com o nome do lead? (nome do Maps costuma ter sufixo) */
function casaNome(titulo: string, alvo: string): boolean {
  if (!titulo || !alvo) return false;
  if (titulo === alvo) return true;
  if (titulo.startsWith(alvo) || alvo.startsWith(titulo)) return true;
  // "Rede Amor" casa com "Rede Amor Vida Cachoeirinha": as duas primeiras palavras
  const chave = alvo.split(" ").slice(0, 2).join(" ");
  return chave.length >= 8 && titulo.includes(chave);
}

/**
 * Procura no cache de buscas a foto do estabelecimento.
 *
 * Só leitura: não consome cota e não cria nada. Devolve `null` quando o negócio
 * não aparece em nenhuma busca guardada.
 */
export function findPlacePhoto(lead: StoredLead): string | null {
  const alvo = normaliza(lead.name);
  if (!alvo) return null;

  let linhas: Array<{ serpapi_raw: string | null }> = [];
  try {
    // filtra pelo primeiro termo do nome para não varrer o cache inteiro
    const termo = String(lead.name || "").split(/\s+/).filter(Boolean)[0] || "";
    linhas = getDb()
      .prepare(
        `SELECT serpapi_raw FROM serpapi_search_cache
         WHERE serpapi_raw LIKE ?
         ORDER BY created_at DESC
         LIMIT 12`
      )
      .all(`%${termo}%`) as Array<{ serpapi_raw: string | null }>;
  } catch {
    return null;
  }

  for (const linha of linhas) {
    let raw: any;
    try {
      raw = JSON.parse(linha.serpapi_raw || "{}");
    } catch {
      continue;
    }
    const itens = Array.isArray(raw?.local_results) ? raw.local_results : [];
    for (const item of itens) {
      const titulo = normaliza(item?.title || item?.name || "");
      if (!casaNome(titulo, alvo)) continue;
      const url = String(item?.thumbnail || "");
      if (/^https?:\/\//.test(url)) return url;
    }
  }
  return null;
}

/**
 * Devolve o lead com a foto da busca no snapshot, quando ele ainda não tem imagem.
 *
 * O papel é `interior` de propósito: a foto do Maps é quase sempre o ambiente, e
 * `brandImagery` usa interior no hero e reserva fachada para o bloco de endereço.
 */
/**
 * CDN de rede social devolve HTML no lugar do JPG (ver `imageCacheService`): a URL
 * existe no snapshot, mas nunca vira imagem na página. Contar essas como "já tem
 * foto" era o que deixava o hero vazio mesmo com a foto do Maps disponível.
 */
const CDN_BLOQUEADO = /(lookaside\.fbsbx\.com|lookaside\.instagram\.com|fbcdn\.net|cdninstagram\.com)/i;

function utilizavel(img: LeadImage | undefined): boolean {
  const url = String(img?.url || "");
  if (!url) return false;
  if (/^assets\//i.test(url)) return true; // já é cópia local
  return !CDN_BLOQUEADO.test(url);
}

export function applyPlacePhoto(lead: StoredLead): { lead: StoredLead; url: string | null } {
  const jaTem = Boolean(lead.brandSnapshot?.imagery?.some((img: LeadImage) => utilizavel(img)));
  if (jaTem) return { lead, url: null };

  const url = findPlacePhoto(lead);
  if (!url) return { lead, url: null };

  const base: BrandSnapshot =
    lead.brandSnapshot ||
    ({
      version: 1,
      createdAt: new Date().toISOString(),
      source: "google-maps",
      palette: [],
      tone: [],
      typography: undefined,
      logo: undefined,
      imagery: [],
      summary: "",
      confidence: 0,
    } as unknown as BrandSnapshot);

  // Descrição neutra de propósito: a foto do Maps é o que é (muitas vezes a
  // fachada). Forçar "interior" só para caber no hero colocou uma fachada com
  // reflexo como imagem principal. Quem decide o lugar é `brandImagery`.
  const imagem: LeadImage = {
    url,
    description: "Foto do estabelecimento no perfil do Google Maps",
  };

  const snapshot = {
    ...base,
    imagery: [imagem, ...(base.imagery || [])],
    // foto real encontrada eleva a confiança: a prévia deixa de ser só cor e texto
    confidence: Math.max(Number(base.confidence || 0), 0.45),
  } as BrandSnapshot;

  return { lead: { ...lead, brandSnapshot: snapshot }, url };
}
