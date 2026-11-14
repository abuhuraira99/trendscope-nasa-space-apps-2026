/**
 * Place search (Open-Meteo geocoding, free, no key) and reverse lookup (BigDataCloud client-side
 * endpoint, free, no key). Both fail soft: coordinates are always enough to investigate.
 */

export interface PlaceHit {
  name: string;
  detail: string;
  lat: number;
  lon: number;
}

export async function searchPlaces(q: string, signal?: AbortSignal): Promise<PlaceHit[]> {
  const term = q.trim();
  if (term.length < 2) return [];
  const coordMatch = term.match(/^(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)$/);
  if (coordMatch) {
    const lat = Number(coordMatch[1]);
    const lon = Number(coordMatch[2]);
    if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
      return [{ name: `${lat.toFixed(2)}, ${lon.toFixed(2)}`, detail: "Coordinates", lat, lon }];
    }
  }
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", term);
  url.searchParams.set("count", "6");
  url.searchParams.set("language", "en");
  url.searchParams.set("format", "json");
  const res = await fetch(url, { signal });
  if (!res.ok) return [];
  const j = (await res.json()) as {
    results?: { name: string; admin1?: string; country?: string; latitude: number; longitude: number }[];
  };
  return (j.results ?? []).map((r) => ({
    name: r.name,
    detail: [r.admin1, r.country].filter(Boolean).join(", "),
    lat: r.latitude,
    lon: r.longitude,
  }));
}

const reverseCache = new Map<string, Promise<string | null>>();

export function reverseName(lat: number, lon: number): Promise<string | null> {
  const k = `${lat.toFixed(1)},${lon.toFixed(1)}`;
  let p = reverseCache.get(k);
  if (!p) {
    p = (async () => {
      try {
        const url = new URL("https://api.bigdatacloud.net/data/reverse-geocode-client");
        url.searchParams.set("latitude", lat.toFixed(4));
        url.searchParams.set("longitude", lon.toFixed(4));
        url.searchParams.set("localityLanguage", "en");
        const res = await fetch(url);
        if (!res.ok) return null;
        const j = (await res.json()) as {
          city?: string;
          locality?: string;
          principalSubdivision?: string;
          countryName?: string;
          localityInfo?: { informative?: { name: string; description?: string }[] };
        };
        const local = j.city || j.locality;
        if (local && j.countryName) return `${local}, ${j.countryName}`;
        if (j.principalSubdivision && j.countryName) return `${j.principalSubdivision}, ${j.countryName}`;
        if (j.countryName) return j.countryName;
        const water = j.localityInfo?.informative?.find((i) => /ocean|sea|gulf|bay/i.test(i.name));
        return water?.name ?? j.locality ?? null;
      } catch {
        return null;
      }
    })();
    reverseCache.set(k, p);
  }
  return p;
}
