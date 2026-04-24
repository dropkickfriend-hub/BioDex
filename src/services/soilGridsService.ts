export interface SoilData {
  clay: number;
  sand: number;
  silt: number;
  organicCarbon: number;
  pH: number;
  depth: string;
}

interface SoilGridsProperty {
  name: string;
  mean: number;
  q0_5?: number;
  q50?: number;
  q95?: number;
}

interface SoilGridsLayer {
  depth: string;
  values: {
    [key: string]: SoilGridsProperty[];
  };
}

interface SoilGridsResponse {
  properties: {
    layers: SoilGridsLayer[];
  };
}

export async function fetchSoilData(lat: number, lng: number): Promise<SoilData[]> {
  try {
    const params = new URLSearchParams({
      lon: lng.toString(),
      lat: lat.toString(),
      property: ['clay', 'sand', 'silt', 'organic_carbon', 'ph_h2o'].join(','),
      depth: ['0-5cm', '5-15cm', '15-30cm', '30-60cm', '60-100cm', '100-200cm'].join(','),
    });

    const response = await fetch(`https://rest.isric.org/soilgrids/v2.0/properties/query?${params}`);
    if (!response.ok) throw new Error('SoilGrids API error');

    const data: SoilGridsResponse = await response.json();

    return data.properties.layers.map(layer => {
      const props = layer.values;
      return {
        clay: extractValue(props.clay),
        sand: extractValue(props.sand),
        silt: extractValue(props.silt),
        organicCarbon: extractValue(props.organic_carbon),
        pH: extractValue(props.ph_h2o),
        depth: layer.depth,
      };
    });
  } catch (error) {
    console.error('Failed to fetch soil data from SoilGrids:', error);
    return [];
  }
}

function extractValue(property?: SoilGridsProperty[]): number {
  if (!property || property.length === 0) return 0;
  return Math.round(property[0].mean * 100) / 100;
}

export function interpretSoilData(soilData: SoilData[]): string {
  if (soilData.length === 0) return 'No soil data available';

  const topSoil = soilData[0];
  const parts: string[] = [];

  if (topSoil.clay > 0) parts.push(`${topSoil.clay}% clay`);
  if (topSoil.sand > 0) parts.push(`${topSoil.sand}% sand`);
  if (topSoil.silt > 0) parts.push(`${topSoil.silt}% silt`);
  if (topSoil.pH > 0) parts.push(`pH ${topSoil.pH}`);
  if (topSoil.organicCarbon > 0) parts.push(`${topSoil.organicCarbon}% organic carbon`);

  return `${topSoil.depth}: ${parts.join(', ')}`;
}
