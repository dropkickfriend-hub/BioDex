// Jurisdiction-specific protected-species providers. Each provider returns a
// list of locally listed threatened species sourced from an *official* national
// authority where possible, otherwise the GBIF/IUCN fallback.

import { Species } from '../types';
import { fetchThreatenedSpeciesForCountry, RegionalThreat } from './gbifService';

export interface ProtectedListResult {
  source: string; // human-readable provenance, e.g. "USFWS ECOS"
  authoritative: boolean;
  threats: RegionalThreat[];
}

export async function fetchProtectedSpecies(
  countryCode: string,
  lat: number,
  lng: number,
  limit: number = 12
): Promise<ProtectedListResult> {
  const cc = countryCode.toUpperCase();
  try {
    if (cc === 'US') {
      const result = await fetchUSFWSListed(lat, lng, limit);
      if (result.threats.length > 0) return result;
    } else if (cc === 'AU') {
      const result = await fetchALAThreatened(lat, lng, limit);
      if (result.threats.length > 0) return result;
    }
  } catch (err) {
    console.error(`Jurisdictional adapter for ${cc} failed; falling back to GBIF`, err);
  }

  // Fallback: country-level GBIF/IUCN.
  const gbif = await fetchThreatenedSpeciesForCountry(cc, limit);
  return {
    source: 'GBIF · IUCN Red List',
    authoritative: false,
    threats: gbif,
  };
}

// ---------- US: USFWS ECOS Environmental Conservation Online System ----------
// Public JSON API of ESA-listed species (no key). Filtered by state via FIPS,
// but ECOS doesn't expose lat/lng directly; for an MVP we pull the federal
// list and rank by random sample. State-level filter could be added by passing
// `state` query string when we know the user's state via Nominatim's admin1.

interface ECOSRecord {
  COMNAME?: string;
  SCINAME?: string;
  STATUS?: string;
  TAXGROUP?: string;
  CRITHAB?: string;
}

async function fetchUSFWSListed(_lat: number, _lng: number, limit: number): Promise<ProtectedListResult> {
  const url = 'https://ecos.fws.gov/ecp/report/ad-hoc-species?format=json&columns=SCINAME,COMNAME,STATUS,TAXGROUP&fil=on&listingStatus=E,T';
  const res = await fetch(url);
  if (!res.ok) throw new Error('ECOS unavailable');
  const data = await res.json();
  const records: ECOSRecord[] = data.data || data || [];
  if (!Array.isArray(records) || records.length === 0) throw new Error('ECOS empty');

  const sample = records
    .filter(r => r.SCINAME && r.STATUS && (r.STATUS === 'Endangered' || r.STATUS === 'Threatened'))
    .sort(() => Math.random() - 0.5)
    .slice(0, limit);

  const threats: RegionalThreat[] = sample.map((r, i) => ({
    taxonKey: i,
    scientificName: r.SCINAME!,
    commonName: r.COMNAME || r.SCINAME!,
    kind: 'endangered',
    category: mapTaxGroupToCategory(r.TAXGROUP),
  }));
  return { source: 'USFWS ECOS · Endangered Species Act', authoritative: true, threats };
}

function mapTaxGroupToCategory(g?: string): Species['category'] {
  if (!g) return 'Fauna';
  const lower = g.toLowerCase();
  if (lower.includes('plant') || lower.includes('lichen') || lower.includes('flowering')) return 'Flora';
  if (lower.includes('fungi')) return 'Fungi';
  return 'Fauna';
}

// ---------- AU: Atlas of Living Australia (ALA) ----------
// ALA's species lookup supports a "conservationStatus" facet aligned with the
// EPBC Act. We pull threatened species recorded near the user's coordinates.

interface ALARecord {
  guid?: string;
  scientificName?: string;
  commonName?: string;
  rank?: string;
  kingdom?: string;
}

async function fetchALAThreatened(lat: number, lng: number, limit: number): Promise<ProtectedListResult> {
  const wkt = `POINT(${lng} ${lat})`;
  const url = `https://biocache-ws.ala.org.au/ws/occurrences/search?q=lsid:*&fq=stateConservation:*+OR+countryConservation:*&lat=${lat}&lon=${lng}&radius=50&pageSize=${limit * 4}&_=${Date.now()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('ALA unavailable');
  const data = await res.json();
  const occs: ALARecord[] = data.occurrences || [];
  if (occs.length === 0) {
    // Fallback to a non-spatial threatened-species lookup
    const url2 = `https://bie-ws.ala.org.au/ws/search?q=conservationStatus:*&fq=conservationStatus:Endangered+OR+conservationStatus:Vulnerable&pageSize=${limit}`;
    void wkt;
    const res2 = await fetch(url2);
    if (!res2.ok) throw new Error('ALA empty');
    const d2 = await res2.json();
    const items = d2.searchResults?.results || [];
    const threats = items.slice(0, limit).map((r: ALARecord, i: number) => ({
      taxonKey: i,
      scientificName: r.scientificName || 'Unknown',
      commonName: r.commonName || r.scientificName || 'Unknown',
      kind: 'endangered' as const,
      category: r.kingdom?.toLowerCase() === 'plantae' ? ('Flora' as const) : ('Fauna' as const),
    }));
    return { source: 'Atlas of Living Australia · EPBC Act 1999', authoritative: true, threats };
  }

  const seen = new Set<string>();
  const threats: RegionalThreat[] = [];
  for (let i = 0; i < occs.length && threats.length < limit; i++) {
    const r = occs[i];
    const sci = r.scientificName;
    if (!sci || seen.has(sci)) continue;
    seen.add(sci);
    threats.push({
      taxonKey: threats.length,
      scientificName: sci,
      commonName: r.commonName || sci,
      kind: 'endangered',
      category: r.kingdom?.toLowerCase() === 'plantae' ? 'Flora' : 'Fauna',
    });
  }
  return { source: 'Atlas of Living Australia · EPBC Act 1999', authoritative: true, threats };
}
