export interface Species {
  id: string;
  commonName: string;
  scientificName: string;
  category: "Flora" | "Fauna" | "Fungi" | "Invertebrate";
  conservationStatus: "Least Concern" | "Vulnerable" | "Endangered" | "Critically Endangered" | "Unknown";
  description: string;
  habitat: string;
  hazards?: string[];
  scientificAccuracyScore: number;
  identifiedAt: string;
  imageUrl: string;
}

export type ReviewStatus = 'Draft' | 'Submitted' | 'Under Review' | 'Verified' | 'Rejected';

export interface CollectionEntry {
  id: string; // Added ID field for convenience
  species: Species;
  location?: {
    lat: number;
    lng: number;
    areaName: string;
    precision?: number;
  };
  userId: string;
  timestamp: string;
  reviewStatus: ReviewStatus;
  userObservations?: string;
  reviewerNotes?: string;
}

export interface FieldMission {
  id: string;
  title: string;
  description: string;
  priority: 'High' | 'Medium' | 'Low';
  category: 'Invasive' | 'Endangered' | 'Impact';
  targetSpecies?: string[];
  location: {
    lat: number;
    lng: number;
    radius: number; // in meters
    name: string;
  };
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: 'create' | 'update' | 'delete' | 'list' | 'get' | 'write';
  path: string | null;
  authInfo: {
    userId: string;
    email: string;
    emailVerified: boolean;
    isAnonymous: boolean;
    providerInfo: { providerId: string; displayName: string; email: string; }[];
  };
}
