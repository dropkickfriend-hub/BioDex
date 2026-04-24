// Reverse geocoding + country-level biodiversity context.
// Uses free, no-key endpoints: Nominatim (OSM) and GBIF.

export interface RegionContext {
  countryCode: string; // ISO 3166-1 alpha-2, e.g. "AU", "US"
  countryName: string;
  admin1?: string; // state / region
  admin2?: string; // county / council area
  displayName: string; // short human label
}

export async function reverseGeocode(lat: number, lng: number): Promise<RegionContext | null> {
  try {
    const params = new URLSearchParams({
      format: 'jsonv2',
      lat: lat.toString(),
      lon: lng.toString(),
      zoom: '10',
      addressdetails: '1',
    });
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?${params}`, {
      headers: { 'Accept': 'application/json' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const a = data.address || {};
    const countryCode = (a.country_code || '').toUpperCase();
    if (!countryCode) return null;
    const admin1 = a.state || a.region || a.province;
    const admin2 = a.county || a.municipality || a.city_district || a.suburb || a.city || a.town;
    const parts = [admin2, admin1, a.country].filter(Boolean);
    return {
      countryCode,
      countryName: a.country || countryCode,
      admin1,
      admin2,
      displayName: parts.slice(0, 2).join(', ') || a.country || countryCode,
    };
  } catch (err) {
    console.error('reverseGeocode failed', err);
    return null;
  }
}

// Very rough IP-based fallback when user denies precise geolocation.
export async function ipLocate(): Promise<{ lat: number; lng: number } | null> {
  try {
    const res = await fetch('https://ipapi.co/json/');
    if (!res.ok) return null;
    const data = await res.json();
    if (typeof data.latitude === 'number' && typeof data.longitude === 'number') {
      return { lat: data.latitude, lng: data.longitude };
    }
    return null;
  } catch {
    return null;
  }
}
