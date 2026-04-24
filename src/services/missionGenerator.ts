import { FieldMission } from '../types';
import { RegionalThreat } from './gbifService';

const CATEGORY_CYCLE: Array<{ dLat: number; dLng: number; radius: number; name: string }> = [
  { dLat: 0.008, dLng: -0.006, radius: 300, name: 'North Ridge' },
  { dLat: -0.012, dLng: 0.009, radius: 450, name: 'Riverbank Line' },
  { dLat: 0.005, dLng: 0.013, radius: 250, name: 'East Reserve' },
  { dLat: -0.009, dLng: -0.011, radius: 600, name: 'South Scrub' },
  { dLat: 0.014, dLng: 0.004, radius: 350, name: 'Upper Canopy Grid' },
];

export interface GeneratedMissions {
  missions: FieldMission[];
}

export function generateLocalMissions(
  coords: { lat: number; lng: number },
  invasives: RegionalThreat[],
  endangered: RegionalThreat[]
): FieldMission[] {
  const missions: FieldMission[] = [];

  invasives.slice(0, 3).forEach((threat, i) => {
    const slot = CATEGORY_CYCLE[i % CATEGORY_CYCLE.length];
    missions.push({
      id: `inv-${threat.taxonKey}`,
      title: `Contain ${threat.commonName}`,
      description: `${threat.scientificName} is a registered invasive in your region. Document presence and flag hotspots for local land managers.`,
      priority: i === 0 ? 'High' : 'Medium',
      category: 'Invasive',
      targetSpecies: [threat.scientificName],
      location: {
        lat: coords.lat + slot.dLat,
        lng: coords.lng + slot.dLng,
        radius: slot.radius,
        name: slot.name,
      },
    });
  });

  endangered.slice(0, 2).forEach((threat, i) => {
    const slot = CATEGORY_CYCLE[(i + 3) % CATEGORY_CYCLE.length];
    missions.push({
      id: `end-${threat.taxonKey}`,
      title: `Survey ${threat.commonName}`,
      description: `${threat.scientificName} is threatened here. Confirm presence, photograph, and note habitat condition.`,
      priority: 'Medium',
      category: 'Endangered',
      targetSpecies: [threat.scientificName],
      location: {
        lat: coords.lat + slot.dLat,
        lng: coords.lng + slot.dLng,
        radius: slot.radius,
        name: slot.name,
      },
    });
  });

  return missions;
}
