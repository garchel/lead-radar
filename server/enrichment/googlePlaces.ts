/**
 * Google Places / Google Business Profile enrichment.
 * Requires GOOGLE_MAPS_PLATFORM_KEY in .env.
 */
export interface PlacesEnrichment {
  name: string;
  formattedAddress?: string;
  phone?: string;
  website?: string;
  rating?: number;
  reviewsCount?: number;
  city?: string;
  state?: string;
  lat?: number;
  lng?: number;
  placeId?: string;
}

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Google Places HTTP ${res.status}`);
  }
  return res.json();
}

/**
 * Text search for a business. Returns the first candidate match.
 */
export async function searchGooglePlaces(
  query: string,
  apiKey?: string,
): Promise<PlacesEnrichment | null> {
  const key = apiKey || process.env.GOOGLE_MAPS_PLATFORM_KEY;
  if (!key) {
    throw new Error('GOOGLE_MAPS_PLATFORM_KEY não configurada para o enriquecimento Google Places.');
  }

  const url =
    'https://maps.googleapis.com/maps/api/place/textsearch/json' +
    `?query=${encodeURIComponent(query)}&language=pt-BR&key=${key}`;

  const data = await fetchJson(url);
  if (data.status !== 'OK' || !data.results?.length) return null;

  const first = data.results[0];
  const parts = (first.formatted_address || '').split(', ');

  return {
    name: first.name,
    formattedAddress: first.formatted_address,
    phone: '', // phone requires Place Details lookup
    website: '', // website requires Place Details lookup
    rating: first.rating ?? undefined,
    reviewsCount: first.user_ratings_total ?? undefined,
    city: parts.length > 1 ? parts[parts.length - 2] : undefined,
    state: parts.length > 2 ? parts[parts.length - 1] : undefined,
    lat: first.geometry?.location?.lat,
    lng: first.geometry?.location?.lng,
    placeId: first.place_id,
  };
}

/**
 * Fetch full Place Details (phone, website) for a place_id.
 */
export async function getPlaceDetails(
  placeId: string,
  apiKey?: string,
): Promise<{ phone?: string; website?: string }> {
  const key = apiKey || process.env.GOOGLE_MAPS_PLATFORM_KEY;
  if (!key) {
    throw new Error('GOOGLE_MAPS_PLATFORM_KEY não configurada para consultar detalhes do Google Places.');
  }
  if (!placeId) return {};

  const url =
    'https://maps.googleapis.com/maps/api/place/details/json' +
    `?place_id=${encodeURIComponent(placeId)}&fields=formatted_phone_number,website&language=pt-BR&key=${key}`;

  const data = await fetchJson(url);
  if (data.status !== 'OK' || !data.result) return {};

  return {
    phone: data.result.formatted_phone_number || undefined,
    website: data.result.website || undefined,
  };
}

/**
 * Convenience: full text search + details for a single business name.
 */
export async function enrichWithGooglePlaces(
  businessName: string,
  city?: string,
): Promise<PlacesEnrichment | null> {
  const query = city ? `${businessName} ${city}` : businessName;
  const place = await searchGooglePlaces(query);
  if (!place || !place.placeId) return place;

  const details = await getPlaceDetails(place.placeId);
  return {
    ...place,
    phone: place.phone || details.phone,
    website: place.website || details.website,
  };
}