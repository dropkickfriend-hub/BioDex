import { Species } from '../types';

interface GBIFOccurrence {
  key: number;
  scientificName: string;
  commonName?: string;
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
}

interface GBIFResponse {
  results: GBIFOccurrence[];
  count: number;
  limit: number;
}

const CONSERVATION_STATUS_MAP: { [key: string]: string } = {
  'EX': 'Extinct',
  'EW': 'Extinct in the Wild',
  'CR': 'Critically Endangered',
  'EN': 'Endangered',
  'VU': 'Vulnerable',
  'NT': 'Near Threatened',
  'LC': 'Least Concern',
  'DD': 'Data Deficient',
  'NE': 'Not Evaluated',
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
      .map(occ => ({
        id: `gbif-${occ.key}`,
        commonName: occ.commonName || occ.species || 'Unknown',
        scientificName: occ.scientificName,
        category: mapKingdomToCategory(occ.kingdom) as 'Fauna' | 'Flora' | 'Fungi' | 'Invertebrate',
        conservationStatus: occ.iucnRedListCategory
          ? CONSERVATION_STATUS_MAP[occ.iucnRedListCategory] || 'Unknown'
          : 'Unknown',
        description: `Observed near ${occ.decimalLatitude.toFixed(2)}, ${occ.decimalLongitude.toFixed(2)}${occ.eventDate ? ` on ${occ.eventDate}` : ''}`,
        habitat: `${occ.family || 'Unknown'} family, observed in region`,
        hazards: [],
        scientificAccuracyScore: 0.85,
        identifiedAt: occ.eventDate || new Date().toISOString(),
        imageUrl: '',
      }) as Species);
  } catch (error) {
    console.error('Failed to fetch species from GBIF:', error);
    return [];
  }
}

function mapKingdomToCategory(kingdom?: string): 'Fauna' | 'Flora' | 'Fungi' | 'Invertebrate' {
  if (!kingdom) return 'Fauna';
  const lower = kingdom.toLowerCase();
  if (lower === 'plantae') return 'Flora';
  if (lower === 'fungi') return 'Fungi';
  if (lower === 'animalia') return 'Fauna';
  if (lower === 'archaea' || lower === 'bacteria') return 'Invertebrate';
  return 'Invertebrate';
}
