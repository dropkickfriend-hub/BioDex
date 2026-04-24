import { ThreatProfile } from './threatSimulation';

export interface PlantTrait {
  id: string;
  commonName: string;
  scientificName: string;
  nativeRegions: string[];
  growthRate: 'Slow' | 'Moderate' | 'Fast';
  matureHeight: number;
  rootDepth: number;
  competitiveness: number;
  nativeThreats: string[];
  soilPHRange: [number, number];
  soilMoistureRange: [number, number];
  nectarValue: number;
  fruitValue: number;
  fireAdapted: boolean;
  maxAge: number;
  canopySpread: number;
}

export interface RestorationPlan {
  threatId: string;
  threatName: string;
  years: number;
  stages: RestorationStage[];
  totalSpecies: number;
  estimatedSuccess: number;
  keyBenefits: string[];
}

export interface RestorationStage {
  year: number;
  actions: string[];
  plants: PlantTrait[];
  targetCoverage: number;
}

export const NATIVE_PLANTS: PlantTrait[] = [
  {
    id: 'salix-nigra',
    commonName: 'Black Willow',
    scientificName: 'Salix nigra',
    nativeRegions: ['Eastern North America'],
    growthRate: 'Fast',
    matureHeight: 25,
    rootDepth: 3,
    competitiveness: 0.75,
    nativeThreats: ['japanese-knotweed'],
    soilPHRange: [5.0, 7.5],
    soilMoistureRange: [0.5, 1.0],
    nectarValue: 0.6,
    fruitValue: 0.3,
    fireAdapted: false,
    maxAge: 80,
    canopySpread: 20,
  },
  {
    id: 'pinus-palustris',
    commonName: 'Longleaf Pine',
    scientificName: 'Pinus palustris',
    nativeRegions: ['Southeastern US'],
    growthRate: 'Slow',
    matureHeight: 35,
    rootDepth: 6,
    competitiveness: 0.65,
    nativeThreats: ['cogongrass'],
    soilPHRange: [4.5, 6.5],
    soilMoistureRange: [0.3, 0.7],
    nectarValue: 0.4,
    fruitValue: 0.8,
    fireAdapted: true,
    maxAge: 300,
    canopySpread: 15,
  },
  {
    id: 'andropogon-gerardii',
    commonName: 'Big Bluestem',
    scientificName: 'Andropogon gerardii',
    nativeRegions: ['Tallgrass Prairie'],
    growthRate: 'Moderate',
    matureHeight: 2.5,
    rootDepth: 4,
    competitiveness: 0.7,
    nativeThreats: ['cogongrass'],
    soilPHRange: [5.5, 7.5],
    soilMoistureRange: [0.4, 0.8],
    nectarValue: 0.3,
    fruitValue: 0.4,
    fireAdapted: true,
    maxAge: 30,
    canopySpread: 1.5,
  },
  {
    id: 'quercus-alba',
    commonName: 'White Oak',
    scientificName: 'Quercus alba',
    nativeRegions: ['Eastern North America'],
    growthRate: 'Moderate',
    matureHeight: 25,
    rootDepth: 5,
    competitiveness: 0.6,
    nativeThreats: ['spotted-lanternfly'],
    soilPHRange: [5.0, 8.0],
    soilMoistureRange: [0.3, 0.7],
    nectarValue: 0.2,
    fruitValue: 0.95,
    fireAdapted: true,
    maxAge: 300,
    canopySpread: 20,
  },
  {
    id: 'sambucus-nigra',
    commonName: 'American Elderberry',
    scientificName: 'Sambucus nigra',
    nativeRegions: ['Eastern North America'],
    growthRate: 'Fast',
    matureHeight: 5,
    rootDepth: 2,
    competitiveness: 0.5,
    nativeThreats: [],
    soilPHRange: [4.0, 8.0],
    soilMoistureRange: [0.4, 0.9],
    nectarValue: 0.8,
    fruitValue: 0.9,
    fireAdapted: false,
    maxAge: 50,
    canopySpread: 6,
  },
  {
    id: 'vernonia-noveboracensis',
    commonName: 'New York Ironweed',
    scientificName: 'Vernonia noveboracensis',
    nativeRegions: ['Eastern North America'],
    growthRate: 'Moderate',
    matureHeight: 1.8,
    rootDepth: 2,
    competitiveness: 0.4,
    nativeThreats: [],
    soilPHRange: [5.5, 7.5],
    soilMoistureRange: [0.6, 1.0],
    nectarValue: 0.9,
    fruitValue: 0.2,
    fireAdapted: false,
    maxAge: 40,
    canopySpread: 1,
  },
  {
    id: 'aquilegia-canadensis',
    commonName: 'Eastern Columbine',
    scientificName: 'Aquilegia canadensis',
    nativeRegions: ['Eastern North America'],
    growthRate: 'Slow',
    matureHeight: 0.7,
    rootDepth: 1,
    competitiveness: 0.2,
    nativeThreats: [],
    soilPHRange: [5.0, 7.5],
    soilMoistureRange: [0.3, 0.7],
    nectarValue: 1.0,
    fruitValue: 0.1,
    fireAdapted: false,
    maxAge: 60,
    canopySpread: 0.5,
  },
  {
    id: 'liatris-spicata',
    commonName: 'Dense Blazing Star',
    scientificName: 'Liatris spicata',
    nativeRegions: ['Eastern North America'],
    growthRate: 'Fast',
    matureHeight: 1.2,
    rootDepth: 1.5,
    competitiveness: 0.5,
    nativeThreats: ['spotted-lanternfly'],
    soilPHRange: [5.0, 7.5],
    soilMoistureRange: [0.4, 0.9],
    nectarValue: 0.95,
    fruitValue: 0.1,
    fireAdapted: true,
    maxAge: 30,
    canopySpread: 0.6,
  },
];

export function planRestoration(threat: ThreatProfile, soilSuitability: number): RestorationPlan {
  if (!threat || !NATIVE_PLANTS.length) {
    return {
      threatId: threat?.id || 'unknown',
      threatName: threat?.name || 'Unknown Threat',
      years: 25,
      stages: [],
      totalSpecies: 0,
      estimatedSuccess: 0,
      keyBenefits: [],
    };
  }

  const directCounters = NATIVE_PLANTS.filter(p => p.nativeThreats.includes(threat.id));
  const pollinators = NATIVE_PLANTS.filter(p => p.nectarValue >= 0.8);
  const seedStocks = NATIVE_PLANTS.filter(p => p.fruitValue >= 0.7);

  const stage1Plants = directCounters.length > 0 ? directCounters : NATIVE_PLANTS.slice(0, 2);
  const stage2Plants = pollinators.filter(p => p.growthRate === 'Fast' || p.growthRate === 'Moderate');
  const stage3Plants = seedStocks;

  const stages: RestorationStage[] = [
    {
      year: 0,
      actions: [
        `Remove or suppress ${threat.name} breeding sites`,
        'Prepare soil with native seed bank',
        'Establish canopy trees',
      ],
      plants: stage1Plants.slice(0, 2),
      targetCoverage: 0.1,
    },
    {
      year: 3,
      actions: [
        'Plant fast-growing understory',
        'Establish pollinator layers',
        `Monitor ${threat.name} suppression`,
      ],
      plants: [...(stage2Plants.slice(0, 3) || []), ...(stage3Plants.slice(0, 2) || [])],
      targetCoverage: 0.4,
    },
    {
      year: 7,
      actions: [
        'Thin canopy for diversity',
        'Support seed-dispersal',
        'Allow natural regeneration',
      ],
      plants: NATIVE_PLANTS.slice(0, 5),
      targetCoverage: 0.75,
    },
  ];

  const uniqueSpecies = new Set<string>();
  stages.forEach(s => s.plants.forEach(p => uniqueSpecies.add(p.id)));

  return {
    threatId: threat.id,
    threatName: threat.name,
    years: 25,
    stages,
    totalSpecies: uniqueSpecies.size,
    estimatedSuccess: Math.min(0.95, 0.6 + soilSuitability * 0.3),
    keyBenefits: [
      '↑ Pollinator abundance',
      '↑ Wildlife food availability',
      '↓ Invasive spread rate',
      '↑ Soil carbon',
      '↑ Genetic diversity',
    ],
  };
}
