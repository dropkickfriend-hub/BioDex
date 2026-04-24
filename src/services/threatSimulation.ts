import { SoilData } from './soilGridsService';

export interface ThreatProfile {
  id: string;
  name: string;
  scientificName: string;
  type: 'Invasive Plant' | 'Invasive Insect' | 'Invasive Animal' | 'Pathogen' | 'Climate';
  baseGrowthRate: number; // per year, logistic r parameter
  optimalPH: [number, number];
  optimalClay: [number, number];
  optimalOrganicCarbon: [number, number];
  dispersalKmPerYear: number;
  impactPerUnit: number; // 0-1, fraction of native biomass displaced per unit of invader
  description: string;
  counterStrategies: CounterStrategy[];
}

export interface CounterStrategy {
  name: string;
  scientificName: string;
  type: 'Native Plant' | 'Biocontrol' | 'Mechanical' | 'Chemical';
  mechanism: string;
  effectiveness: number; // 0-1
  establishmentYears: number;
}

export interface SimulationPoint {
  year: number;
  invaderCoverage: number; // 0-1 fraction
  nativeBiomass: number; // 0-1 fraction
  spreadRadiusKm: number;
  affectedSpecies: number;
}

export interface SimulationResult {
  threat: ThreatProfile;
  baseline: SimulationPoint[];
  withIntervention: SimulationPoint[];
  interventionYear: number;
  recommendedStrategy: CounterStrategy;
  soilSuitability: number;
}

export const KNOWN_THREATS: ThreatProfile[] = [
  {
    id: 'spotted-lanternfly',
    name: 'Spotted Lanternfly',
    scientificName: 'Lycorma delicatula',
    type: 'Invasive Insect',
    baseGrowthRate: 0.85,
    optimalPH: [6.0, 7.5],
    optimalClay: [10, 40],
    optimalOrganicCarbon: [1.5, 4.0],
    dispersalKmPerYear: 8,
    impactPerUnit: 0.35,
    description: 'Phloem-feeding planthopper. Weakens trees, promotes sooty mold. Host: Tree of Heaven, grapes, hardwoods.',
    counterStrategies: [
      {
        name: 'Tree of Heaven Removal',
        scientificName: 'Ailanthus altissima (removal target)',
        type: 'Mechanical',
        mechanism: 'Remove primary host tree to disrupt breeding cycle',
        effectiveness: 0.55,
        establishmentYears: 2,
      },
      {
        name: 'Parasitoid Wasp Release',
        scientificName: 'Anastatus orientalis',
        type: 'Biocontrol',
        mechanism: 'Egg parasitoid reduces next-generation population by 40-70%',
        effectiveness: 0.65,
        establishmentYears: 3,
      },
    ],
  },
  {
    id: 'japanese-knotweed',
    name: 'Japanese Knotweed',
    scientificName: 'Reynoutria japonica',
    type: 'Invasive Plant',
    baseGrowthRate: 0.72,
    optimalPH: [5.0, 7.5],
    optimalClay: [5, 35],
    optimalOrganicCarbon: [2.0, 5.0],
    dispersalKmPerYear: 0.3,
    impactPerUnit: 0.75,
    description: 'Rhizomatous perennial. Displaces riparian vegetation. Rhizomes penetrate concrete/asphalt.',
    counterStrategies: [
      {
        name: 'Native Willow Planting',
        scientificName: 'Salix nigra',
        type: 'Native Plant',
        mechanism: 'Fast-growing canopy shades knotweed, root mass competes for water',
        effectiveness: 0.45,
        establishmentYears: 5,
      },
      {
        name: 'Psyllid Biocontrol',
        scientificName: 'Aphalara itadori',
        type: 'Biocontrol',
        mechanism: 'Sap-sucking insect native to Japan. Stress-tests weakened plants.',
        effectiveness: 0.50,
        establishmentYears: 4,
      },
    ],
  },
  {
    id: 'cogongrass',
    name: 'Cogongrass',
    scientificName: 'Imperata cylindrica',
    type: 'Invasive Plant',
    baseGrowthRate: 0.80,
    optimalPH: [4.5, 7.0],
    optimalClay: [5, 25],
    optimalOrganicCarbon: [0.5, 3.0],
    dispersalKmPerYear: 1.5,
    impactPerUnit: 0.65,
    description: 'Rhizomatous grass, fire-adapted. Forms monocultures, burns hotter than natives.',
    counterStrategies: [
      {
        name: 'Longleaf Pine Restoration',
        scientificName: 'Pinus palustris',
        type: 'Native Plant',
        mechanism: 'Fire-adapted native, re-establishes closed canopy over 10+ years',
        effectiveness: 0.60,
        establishmentYears: 8,
      },
      {
        name: 'Prescribed Burn + Native Seeding',
        scientificName: 'Andropogon gerardii, Sorghastrum nutans',
        type: 'Native Plant',
        mechanism: 'Native warm-season grasses outcompete cogongrass post-fire',
        effectiveness: 0.55,
        establishmentYears: 4,
      },
    ],
  },
];

export function calculateSoilSuitability(threat: ThreatProfile, soil: SoilData[]): number {
  if (soil.length === 0) return 0.5; // unknown

  const topSoil = soil[0];
  let score = 0;
  let factors = 0;

  if (topSoil.pH > 0) {
    const phScore = inRangeScore(topSoil.pH, threat.optimalPH);
    score += phScore;
    factors++;
  }
  if (topSoil.clay > 0) {
    const clayScore = inRangeScore(topSoil.clay, threat.optimalClay);
    score += clayScore;
    factors++;
  }
  if (topSoil.organicCarbon > 0) {
    const ocScore = inRangeScore(topSoil.organicCarbon, threat.optimalOrganicCarbon);
    score += ocScore;
    factors++;
  }

  return factors > 0 ? score / factors : 0.5;
}

function inRangeScore(value: number, range: [number, number]): number {
  const [min, max] = range;
  if (value >= min && value <= max) return 1.0;
  const midpoint = (min + max) / 2;
  const width = max - min;
  const distance = Math.abs(value - midpoint);
  return Math.max(0, 1 - distance / (width * 2));
}

export interface SimulateOptions {
  years?: number;
  initialCoverage?: number;
  strategy?: CounterStrategy;
  nativeBiomassFactor?: number; // 0..1 multiplier from measured native density
}

export function simulateThreat(
  threat: ThreatProfile,
  soil: SoilData[],
  optsOrYears: SimulateOptions | number = {},
  legacyInitialCoverage?: number
): SimulationResult {
  // Support both the legacy (years, initialCoverage) and new options-object calls.
  const opts: SimulateOptions =
    typeof optsOrYears === 'number'
      ? { years: optsOrYears, initialCoverage: legacyInitialCoverage }
      : optsOrYears;
  const years = opts.years ?? 100;
  const initialCoverage = opts.initialCoverage ?? 0.05;
  const nativeFactor = Math.max(0, Math.min(1, opts.nativeBiomassFactor ?? 1));

  const soilSuitability = calculateSoilSuitability(threat, soil);
  const effectiveGrowthRate = threat.baseGrowthRate * soilSuitability;
  // Carrying capacity shrinks when native community is healthy (biotic resistance).
  const carryingCapacity = Math.min(0.95, (0.4 + soilSuitability * 0.55) * (1 - 0.3 * nativeFactor));

  const baseline: SimulationPoint[] = [];
  for (let year = 0; year <= years; year += 5) {
    const invaderCoverage = logisticGrowth(
      initialCoverage,
      carryingCapacity,
      effectiveGrowthRate,
      year
    );
    baseline.push({
      year,
      invaderCoverage,
      nativeBiomass: Math.max(0, nativeFactor - invaderCoverage * threat.impactPerUnit),
      spreadRadiusKm: Math.min(500, threat.dispersalKmPerYear * year * soilSuitability),
      affectedSpecies: Math.round(invaderCoverage * 50),
    });
  }

  const strategy =
    opts.strategy ??
    threat.counterStrategies
      .slice()
      .sort((a, b) => b.effectiveness / b.establishmentYears - a.effectiveness / a.establishmentYears)[0];

  const interventionYear = 2;
  const withIntervention: SimulationPoint[] = [];
  for (let year = 0; year <= years; year += 5) {
    let invaderCoverage: number;
    if (year < interventionYear) {
      invaderCoverage = logisticGrowth(initialCoverage, carryingCapacity, effectiveGrowthRate, year);
    } else {
      const yearsPostIntervention = year - interventionYear;
      const interventionActive = Math.min(1, yearsPostIntervention / strategy.establishmentYears);
      const dampedRate = effectiveGrowthRate * (1 - strategy.effectiveness * interventionActive);
      const startCoverage = logisticGrowth(
        initialCoverage,
        carryingCapacity,
        effectiveGrowthRate,
        interventionYear
      );
      const dampedCarrying = carryingCapacity * (1 - strategy.effectiveness * interventionActive * 0.7);
      invaderCoverage = logisticGrowth(
        startCoverage,
        Math.max(initialCoverage, dampedCarrying),
        dampedRate,
        yearsPostIntervention
      );
    }
    withIntervention.push({
      year,
      invaderCoverage,
      nativeBiomass: Math.max(0, nativeFactor - invaderCoverage * threat.impactPerUnit),
      spreadRadiusKm: Math.min(500, threat.dispersalKmPerYear * year * soilSuitability * (1 - strategy.effectiveness * 0.5)),
      affectedSpecies: Math.round(invaderCoverage * 50),
    });
  }

  return {
    threat,
    baseline,
    withIntervention,
    interventionYear,
    recommendedStrategy: strategy,
    soilSuitability,
  };
}

function logisticGrowth(P0: number, K: number, r: number, t: number): number {
  if (P0 >= K) return K;
  if (P0 <= 0) return 0;
  return K / (1 + ((K - P0) / P0) * Math.exp(-r * t));
}

export function getThreatForMission(missionCategory: string, missionTitle: string): ThreatProfile | null {
  const title = missionTitle.toLowerCase();
  if (title.includes('lanternfly')) return KNOWN_THREATS[0];
  if (title.includes('knotweed')) return KNOWN_THREATS[1];
  if (title.includes('cogongrass')) return KNOWN_THREATS[2];
  if (missionCategory === 'Invasive') return KNOWN_THREATS[0];
  return null;
}
