import { Species } from '../types';

interface GBIFOccurrence {
  key: number;
  scientificName: string;
  commonName?: string;
  vernacularName?: string;
  taxonKey: number;
  speciesKey: number;
  species?: string;
  decimalLatitude: number;
  decimalLongitude: number;
  eventDate?: string;
  kingdom?: string;
  phylum?: string;
  class?: string;
  order?: string;
  family?: string;
  genus?: string;
  threatStatus?: string;
  iucnRedListCategory?: string;
  media?: Array<{ type?: string; identifier?: string; format?: string }>;
}

interface GBIFResponse {
  results: GBIFOccurrence[];
  count: number;
  limit: number;
}

const CONSERVATION_STATUS_MAP: { [key: string]: Species['conservationStatus'] } = {
  'EX': 'Critically Endangered',
  'EW': 'Critically Endangered',
  'CR': 'Critically Endangered',
  'EN': 'Endangered',
  'VU': 'Vulnerable',
  'NT': 'Least Concern',
  'LC': 'Least Concern',
  'DD': 'Unknown',
  'NE': 'Unknown',
};

export async function fetchSpeciesNearLocation(
  lat: number,
  lng: number,
  radiusKm: number = 10,
  limit: number = 20
): Promise<Species[]> {
  try {
    const params = new URLSearchParams({
      decimalLatitude: lat.toString(),
      decimalLongitude: lng.toString(),
      geoDistance: (radiusKm * 1000).toString(),
      limit: limit.toString(),
      hasCoordinate: 'true',
    });

    const response = await fetch(`https://api.gbif.org/v1/occurrence/search?${params}`);
    if (!response.ok) throw new Error('GBIF API error');

    const data: GBIFResponse = await response.json();
    return data.results
      .filter(occ => occ.scientificName && occ.kingdom)
      .map(occToSpecies);
  } catch (error) {
    console.error('Failed to fetch species from GBIF:', error);
    return [];
  }
}

function occToSpecies(occ: GBIFOccurrence): Species {
  const image = (occ.media || []).find(m => m.type === 'StillImage' && m.identifier)?.identifier || '';
  return {
    id: `gbif-${occ.key}`,
    commonName: occ.vernacularName || occ.commonName || occ.species || occ.scientificName.split(' ').slice(0, 2).join(' '),
    scientificName: occ.scientificName,
    category: mapKingdomToCategory(occ.kingdom),
    conservationStatus: occ.iucnRedListCategory
      ? CONSERVATION_STATUS_MAP[occ.iucnRedListCategory] || 'Unknown'
      : 'Unknown',
    description: `Observed near ${occ.decimalLatitude.toFixed(2)}, ${occ.decimalLongitude.toFixed(2)}${occ.eventDate ? ` on ${occ.eventDate}` : ''}`,
    habitat: `${occ.family || 'Unknown'} family`,
    hazards: [],
    scientificAccuracyScore: 0.85,
    identifiedAt: occ.eventDate || new Date().toISOString(),
    imageUrl: image,
  };
}

function mapKingdomToCategory(kingdom?: string): Species['category'] {
  if (!kingdom) return 'Fauna';
  const lower = kingdom.toLowerCase();
  if (lower === 'plantae') return 'Flora';
  if (lower === 'fungi') return 'Fungi';
  if (lower === 'animalia') return 'Fauna';
  return 'Invertebrate';
}

// ---------- Regional target list for "catch-'em-all" dex ----------

interface GBIFSpeciesSearchResult {
  key: number;
  scientificName: string;
  canonicalName?: string;
  kingdom?: string;
  family?: string;
  vernacularNames?: Array<{ vernacularName: string; language?: string }>;
  threatStatuses?: string[];
}

export interface TargetSpecies {
  taxonKey: number;
  scientificName: string;
  commonName: string;
  category: Species['category'];
  conservationStatus: Species['conservationStatus'];
  family?: string;
  imageUrl?: string;
}

// Build a regional target deck by sampling the most-observed species in a bbox
// around the user, split across kingdoms. GBIF occurrence search with `facet`
// returns a ranked list by occurrence count.
export async function fetchRegionalTargets(
  lat: number,
  lng: number,
  radiusKm: number = 25,
  perCategory: number = 10
): Promise<TargetSpecies[]> {
  const kingdoms: Array<{ key: string; cat: Species['category'] }> = [
    { key: 'Plantae', cat: 'Flora' },
    { key: 'Animalia', cat: 'Fauna' },
    { key: 'Fungi', cat: 'Fungi' },
  ];

  const results = await Promise.all(
    kingdoms.map(k => fetchTopSpeciesForKingdom(lat, lng, radiusKm, k.key, k.cat, perCategory))
  );
  return results.flat();
}

async function fetchTopSpeciesForKingdom(
  lat: number,
  lng: number,
  radiusKm: number,
  kingdom: string,
  category: Species['category'],
  limit: number
): Promise<TargetSpecies[]> {
  try {
    const params = new URLSearchParams({
      decimalLatitude: lat.toString(),
      decimalLongitude: lng.toString(),
      geoDistance: `${radiusKm * 1000}m`,
      kingdom,
      facet: 'speciesKey',
      facetLimit: limit.toString(),
      limit: '0',
      hasCoordinate: 'true',
    });
    const res = await fetch(`https://api.gbif.org/v1/occurrence/search?${params}`);
    if (!res.ok) return [];
    const data = await res.json();
    const facetBucket = (data.facets || []).find((f: { field: string }) => f.field === 'SPECIES_KEY');
    const counts: Array<{ name: string }> = facetBucket?.counts || [];
    const taxonKeys = counts.map(c => Number(c.name)).filter(Boolean);
    if (taxonKeys.length === 0) return [];

    const details = await Promise.all(taxonKeys.map(k => fetchSpeciesDetail(k, category)));
    return details.filter((d): d is TargetSpecies => d !== null);
  } catch (err) {
    console.error('fetchTopSpeciesForKingdom failed', kingdom, err);
    return [];
  }
}

async function fetchSpeciesDetail(
  taxonKey: number,
  category: Species['category']
): Promise<TargetSpecies | null> {
  try {
    const res = await fetch(`https://api.gbif.org/v1/species/${taxonKey}`);
    if (!res.ok) return null;
    const sp: GBIFSpeciesSearchResult = await res.json();
    const common = pickVernacular(sp.vernacularNames);
    const image = await fetchFirstImage(taxonKey);
    const status = sp.threatStatuses?.[0];
    return {
      taxonKey,
      scientificName: sp.canonicalName || sp.scientificName,
      commonName: common || sp.canonicalName || sp.scientificName,
      category,
      family: sp.family,
      conservationStatus: status ? mapIUCNStatus(status) : 'Unknown',
      imageUrl: image,
    };
  } catch {
    return null;
  }
}

function pickVernacular(names?: Array<{ vernacularName: string; language?: string }>): string | undefined {
  if (!names || names.length === 0) return undefined;
  const en = names.find(n => n.language === 'eng');
  return (en || names[0]).vernacularName;
}

async function fetchFirstImage(taxonKey: number): Promise<string | undefined> {
  try {
    const res = await fetch(`https://api.gbif.org/v1/occurrence/search?taxonKey=${taxonKey}&mediaType=StillImage&limit=1`);
    if (!res.ok) return undefined;
    const data = await res.json();
    const first = data.results?.[0];
    const media = first?.media?.find((m: { type?: string; identifier?: string }) => m.type === 'StillImage' && m.identifier);
    return media?.identifier;
  } catch {
    return undefined;
  }
}

function mapIUCNStatus(raw: string): Species['conservationStatus'] {
  const upper = raw.toUpperCase();
  if (upper.includes('CRITICALLY')) return 'Critically Endangered';
  if (upper.includes('ENDANGERED')) return 'Endangered';
  if (upper.includes('VULNERABLE')) return 'Vulnerable';
  if (upper.includes('LEAST')) return 'Least Concern';
  return 'Unknown';
}

// ---------- Regional invasive / threatened checklists ----------

export interface RegionalThreat {
  taxonKey: number;
  scientificName: string;
  commonName: string;
  kind: 'invasive' | 'endangered';
  category: Species['category'];
  imageUrl?: string;
}

// GBIF checklist for GRIIS (Global Register of Introduced and Invasive Species)
// datasetKey below is the unified GRIIS umbrella. We filter results by country.
const GRIIS_DATASET_KEY = 'b351a324-77c4-41c9-b04e-d3eeadac5e81';

export async function fetchInvasiveSpeciesForCountry(
  countryCode: string,
  limit: number = 12
): Promise<RegionalThreat[]> {
  try {
    const params = new URLSearchParams({
      datasetKey: GRIIS_DATASET_KEY,
      country: countryCode,
      status: 'ACCEPTED',
      limit: limit.toString(),
    });
    const res = await fetch(`https://api.gbif.org/v1/species/search?${params}`);
    if (!res.ok) return [];
    const data = await res.json();
    const results = (data.results || []) as GBIFSpeciesSearchResult[];
    const withImages = await Promise.all(
      results.slice(0, limit).map(async sp => ({
        taxonKey: sp.key,
        scientificName: sp.canonicalName || sp.scientificName,
        commonName: pickVernacular(sp.vernacularNames) || sp.canonicalName || sp.scientificName,
        kind: 'invasive' as const,
        category: mapKingdomToCategory(sp.kingdom),
        imageUrl: await fetchFirstImage(sp.key),
      }))
    );
    return withImages;
  } catch (err) {
    console.error('fetchInvasiveSpeciesForCountry failed', err);
    return [];
  }
}

// Country-scoped threatened species via IUCN threat status facets on GBIF.
export async function fetchThreatenedSpeciesForCountry(
  countryCode: string,
  limit: number = 12
): Promise<RegionalThreat[]> {
  const categories: string[] = ['CRITICALLY_ENDANGERED', 'ENDANGERED', 'VULNERABLE'];
  try {
    const params = new URLSearchParams({
      country: countryCode,
      status: 'ACCEPTED',
      limit: limit.toString(),
    });
    categories.forEach(c => params.append('threat', c));
    const res = await fetch(`https://api.gbif.org/v1/species/search?${params}`);
    if (!res.ok) return [];
    const data = await res.json();
    const results = (data.results || []) as GBIFSpeciesSearchResult[];
    const withImages = await Promise.all(
      results.slice(0, limit).map(async sp => ({
        taxonKey: sp.key,
        scientificName: sp.canonicalName || sp.scientificName,
        commonName: pickVernacular(sp.vernacularNames) || sp.canonicalName || sp.scientificName,
        kind: 'endangered' as const,
        category: mapKingdomToCategory(sp.kingdom),
        imageUrl: await fetchFirstImage(sp.key),
      }))
    );
    return withImages;
  } catch (err) {
    console.error('fetchThreatenedSpeciesForCountry failed', err);
    return [];
  }
}

// ---------- Habitat coarse-grain ratios ----------

export interface HabitatRatios {
  flora: number;
  fauna: number;
  fungi: number;
  invertebrates: number;
  totalOccurrences: number;
}

// Cheap native-density proxy from the existing ratios. Combines plant + fungi
// share with a log-scaled occurrence count so sparsely surveyed or
// fauna-dominated areas score lower. Returns 0..1.
export function estimateNativeDensity(r: HabitatRatios | null): number {
  if (!r || r.totalOccurrences === 0) return 0.5;
  const plantShare = r.flora + r.fungi;
  const survey = Math.min(1, Math.log10(r.totalOccurrences + 1) / 3.5);
  return Math.max(0.1, Math.min(1, plantShare * 0.6 + survey * 0.4));
}

export async function fetchHabitatRatios(
  lat: number,
  lng: number,
  radiusKm: number = 10
): Promise<HabitatRatios | null> {
  try {
    const params = new URLSearchParams({
      decimalLatitude: lat.toString(),
      decimalLongitude: lng.toString(),
      geoDistance: `${radiusKm * 1000}m`,
      facet: 'kingdomKey',
      facetLimit: '10',
      limit: '0',
      hasCoordinate: 'true',
    });
    const res = await fetch(`https://api.gbif.org/v1/occurrence/search?${params}`);
    if (!res.ok) return null;
    const data = await res.json();
    const bucket = (data.facets || []).find((f: { field: string }) => f.field === 'KINGDOM_KEY');
    const counts: Array<{ name: string; count: number }> = bucket?.counts || [];
    // GBIF kingdom keys: 1=Animalia, 6=Plantae, 5=Fungi, 7=Chromista, 3=Bacteria, 4=Archaea
    const by = Object.fromEntries(counts.map(c => [c.name, c.count]));
    const flora = by['6'] || 0;
    const fauna = by['1'] || 0;
    const fungi = by['5'] || 0;
    const invert = (by['7'] || 0) + (by['3'] || 0) + (by['4'] || 0);
    const total = flora + fauna + fungi + invert;
    if (total === 0) return null;
    return {
      flora: flora / total,
      fauna: fauna / total,
      fungi: fungi / total,
      invertebrates: invert / total,
      totalOccurrences: total,
    };
  } catch (err) {
    console.error('fetchHabitatRatios failed', err);
    return null;
  }
}
