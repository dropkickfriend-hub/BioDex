import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Camera, Book, Search, Activity, AlertTriangle, Loader2, MapPin, Target, CheckCircle2, Globe, Navigation, Layers, Send, Upload, X } from 'lucide-react';
import { cn } from './lib/utils';
import { CollectionEntry, FieldMission, PlayerStats, Species } from './types';
import MapView from './components/MapView';
import TargetDex from './components/TargetDex';
import {
  fetchSpeciesNearLocation,
  fetchRegionalTargets,
  fetchInvasiveSpeciesForCountry,
  fetchThreatenedSpeciesForCountry,
  fetchHabitatRatios,
  estimateNativeDensity,
  TargetSpecies,
  RegionalThreat,
  HabitatRatios,
} from './services/gbifService';
import { fetchSoilData, interpretSoilData, SoilData } from './services/soilGridsService';
import { CounterStrategy, getThreatForMission, simulateThreat } from './services/threatSimulation';
import ThreatSimulationView from './components/ThreatSimulationView';
import { useGeolocation } from './hooks/useGeolocation';
import { reverseGeocode, RegionContext } from './services/regionService';
import { generateLocalMissions } from './services/missionGenerator';
import { getJurisdiction } from './services/jurisdictionService';

const DEMO_USER = {
  uid: 'demo-operator',
  displayName: 'Demo Operator',
};

const getMockSpecies = (imageUrl: string): Species => ({
  id: 'mock',
  commonName: 'American Black Bear',
  scientificName: 'Ursus americanus',
  category: 'Fauna',
  conservationStatus: 'Least Concern',
  description: 'Large carnivorous mammal native to North America.',
  habitat: 'Forests and mountainous regions',
  hazards: ['Dangerous if provoked', 'Keep distance'],
  scientificAccuracyScore: 0.92,
  imageUrl,
  identifiedAt: new Date().toISOString(),
});

export default function App() {
  const [activeTab, setActiveTab] = useState<'intel' | 'targets' | 'dex' | 'community'>('intel');
  const user = DEMO_USER;
  const [selectedSpecies, setSelectedSpecies] = useState<CollectionEntry | null>(null);
  const [selectedMission, setSelectedMission] = useState<FieldMission | null>(null);
  const [inventory, setInventory] = useState<CollectionEntry[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const geo = useGeolocation();
  const coords = geo.coords;
  const [missions, setMissions] = useState<FieldMission[]>([]);
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [userObservations, setUserObservations] = useState('');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [missionSoilData, setMissionSoilData] = useState<{ [key: string]: SoilData[] }>({});
  const [missionSpecies, setMissionSpecies] = useState<{ [key: string]: Species[] }>({});
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [region, setRegion] = useState<RegionContext | null>(null);
  const [targets, setTargets] = useState<TargetSpecies[]>([]);
  const [invasives, setInvasives] = useState<RegionalThreat[]>([]);
  const [endangered, setEndangered] = useState<RegionalThreat[]>([]);
  const [habitatRatios, setHabitatRatios] = useState<HabitatRatios | null>(null);
  const [isLoadingTargets, setIsLoadingTargets] = useState(false);
  const [showLandCover, setShowLandCover] = useState(false);
  const [missionStrategy, setMissionStrategy] = useState<Record<string, CounterStrategy>>({});
  const [stats, setStats] = useState<PlayerStats>({ xp: 0, captures: 0, targetsCaught: 0, missionsAdvanced: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const jurisdiction = getJurisdiction(region?.countryCode);
  const nativeDensity = estimateNativeDensity(habitatRatios);

  const triggerCapture = () => {
    if (!user) return;
    setUploadError(null);
    fileInputRef.current?.click();
  };

  // Resolve region context + regional biodiversity data once we have coords.
  useEffect(() => {
    if (!coords) return;
    let cancelled = false;

    (async () => {
      setIsLoadingTargets(true);
      const ctx = await reverseGeocode(coords.lat, coords.lng);
      if (cancelled) return;
      setRegion(ctx);

      const [targetList, ratios] = await Promise.all([
        fetchRegionalTargets(coords.lat, coords.lng, 25, 10),
        fetchHabitatRatios(coords.lat, coords.lng, 10),
      ]);
      if (cancelled) return;
      setTargets(targetList);
      setHabitatRatios(ratios);

      if (ctx?.countryCode) {
        const [inv, end] = await Promise.all([
          fetchInvasiveSpeciesForCountry(ctx.countryCode, 6),
          fetchThreatenedSpeciesForCountry(ctx.countryCode, 6),
        ]);
        if (cancelled) return;
        setInvasives(inv);
        setEndangered(end);
      }
      setIsLoadingTargets(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [coords]);

  // Build missions from real regional threat/endangered lists, falling back to
  // generic survey missions if the API returned nothing (e.g. offline or rate-limited).
  useEffect(() => {
    if (!coords) return;
    const generated = generateLocalMissions(coords, invasives, endangered);
    const fallback: FieldMission[] =
      generated.length > 0
        ? []
        : [
            {
              id: 'scout',
              title: 'Baseline Biodiversity Scout',
              description: 'Walk your sector and capture any flora, fauna, or fungi you encounter. Every capture improves the local model.',
              priority: 'Medium',
              category: 'Impact',
              location: {
                lat: coords.lat + 0.004,
                lng: coords.lng + 0.002,
                radius: 400,
                name: 'Local Sector',
              },
            },
          ];
    setMissions([...generated, ...fallback]);
  }, [coords, invasives, endangered]);

  // Fetch soil / nearby species for each mission.
  useEffect(() => {
    if (missions.length === 0) return;
    let cancelled = false;
    setIsLoadingData(true);
    (async () => {
      const soilDataMap: { [key: string]: SoilData[] } = {};
      const speciesMap: { [key: string]: Species[] } = {};
      for (const mission of missions) {
        try {
          const [soil, species] = await Promise.all([
            fetchSoilData(mission.location.lat, mission.location.lng),
            fetchSpeciesNearLocation(mission.location.lat, mission.location.lng, 5, 15),
          ]);
          if (cancelled) return;
          soilDataMap[mission.id] = soil;
          speciesMap[mission.id] = species;
        } catch (error) {
          console.error(`Failed to fetch data for mission ${mission.id}:`, error);
        }
      }
      if (cancelled) return;
      setMissionSoilData(soilDataMap);
      setMissionSpecies(speciesMap);
      setIsLoadingData(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [missions]);

  const submitForReview = async () => {
    if (!selectedSpecies) return;
    setIsSubmittingReview(true);
    const updated: CollectionEntry = { ...selectedSpecies, reviewStatus: 'Submitted', userObservations };
    setInventory(prev => prev.map(item => item.id === updated.id ? updated : item));
    setSelectedSpecies(updated);
    setUserObservations('');
    setIsSubmittingReview(false);
  };

  const claimCapture = (target: TargetSpecies, missionId?: string) => {
    if (!selectedSpecies) return;
    const alreadyClaimed = !!selectedSpecies.claimedScientificName;
    const updated: CollectionEntry = {
      ...selectedSpecies,
      claimedScientificName: target.scientificName,
      claimedMissionId: missionId,
      species: {
        ...selectedSpecies.species,
        commonName: target.commonName,
        scientificName: target.scientificName,
        category: target.category,
        conservationStatus: target.conservationStatus,
      },
    };
    setInventory(prev => prev.map(item => item.id === updated.id ? updated : item));
    setSelectedSpecies(updated);
    if (!alreadyClaimed) {
      setStats(prev => ({
        xp: prev.xp + (missionId ? 50 : 20),
        captures: prev.captures,
        targetsCaught: prev.targetsCaught + 1,
        missionsAdvanced: prev.missionsAdvanced + (missionId ? 1 : 0),
      }));
    }
  };

  const handleCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    setUploadError(null);

    if (!file.type.startsWith('image/')) {
      setUploadError('Invalid transmission. Specimen capture requires image data (JPEG, PNG, WebP).');
      return;
    }
    const MAX_BYTES = 10 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      setUploadError(`Capture exceeds 10MB transmission limit (received ${(file.size / 1024 / 1024).toFixed(1)}MB). Compress and retry.`);
      return;
    }

    setIsAnalyzing(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          const data = result.split(',')[1];
          if (!data) reject(new Error('Failed to encode capture data.'));
          else resolve(data);
        };
        reader.onerror = () => reject(reader.error ?? new Error('FileReader transmission failed.'));
        reader.readAsDataURL(file);
      });

      const newRecord: CollectionEntry = {
        id: crypto.randomUUID(),
        species: getMockSpecies(`data:image/jpeg;base64,${base64}`),
        userId: user.uid,
        timestamp: new Date().toISOString(),
        reviewStatus: 'Draft',
        location: coords ? {
          lat: coords.lat,
          lng: coords.lng,
          areaName: 'Current Sector'
        } : undefined,
      } as CollectionEntry;

      setInventory(prev => [newRecord, ...prev]);
      setSelectedSpecies(newRecord);
      setStats(prev => ({ ...prev, xp: prev.xp + 10, captures: prev.captures + 1 }));
      setActiveTab('dex');
    } catch (error) {
      console.error("Capture failed:", error);
      const message = error instanceof Error ? error.message : 'Capture failed. Retry.';
      setUploadError(message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="min-h-screen bg-app-bg text-app-text font-sans flex flex-col selection:bg-emerald-500/30">
      {/* Shared hidden file input — driven by every Capture trigger in the UI */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleCapture}
        className="hidden"
      />

      <header className="h-14 border-b border-app-line bg-app-surface flex items-center justify-between px-6 sticky top-0 z-40">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-emerald-500 flex items-center justify-center rounded-sm font-bold text-app-bg text-lg">B</div>
            <span className="font-semibold tracking-wider text-sm uppercase">Biota Explorer <span className="text-emerald-500">v4.2</span></span>
          </div>

          <nav className="hidden lg:flex items-center gap-1">
            <button
              onClick={() => setActiveTab('intel')}
              className={cn(
                "px-4 py-1 text-[10px] font-bold uppercase tracking-widest transition-all border-b-2 hover:bg-white/5",
                activeTab === 'intel' ? "text-emerald-500 border-emerald-500" : "text-gray-500 border-transparent hover:text-white"
              )}
            >
              Field Intel
            </button>
            <button
              onClick={() => setActiveTab('targets')}
              className={cn(
                "px-4 py-1 text-[10px] font-bold uppercase tracking-widest transition-all border-b-2 hover:bg-white/5",
                activeTab === 'targets' ? "text-emerald-500 border-emerald-500" : "text-gray-500 border-transparent hover:text-white"
              )}
            >
              Field Targets
            </button>
            <button
              onClick={() => setActiveTab('dex')}
              className={cn(
                "px-4 py-1 text-[10px] font-bold uppercase tracking-widest transition-all border-b-2 hover:bg-white/5",
                activeTab === 'dex' ? "text-emerald-500 border-emerald-500" : "text-gray-500 border-transparent hover:text-white"
              )}
            >
              Specimen Archive
            </button>
            <button
              onClick={() => setActiveTab('community')}
              className={cn(
                "px-4 py-1 text-[10px] font-bold uppercase tracking-widest transition-all border-b-2 hover:bg-white/5",
                activeTab === 'community' ? "text-emerald-500 border-emerald-500" : "text-gray-500 border-transparent hover:text-white"
              )}
            >
              Mesh Network
            </button>
          </nav>
        </div>
        
        <div className="flex items-center gap-6">
          <button
            onClick={triggerCapture}
            disabled={isAnalyzing || !user}
            className="hidden md:inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-app-bg font-bold uppercase text-[10px] tracking-widest rounded-sm transition-all shadow-[0_0_20px_rgba(16,185,129,0.15)]"
            title="Capture specimen"
          >
            {isAnalyzing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            Capture Specimen
          </button>
          <div className="hidden md:flex items-center gap-3 px-3 py-1 bg-emerald-500/10 border border-emerald-500/25 rounded" title="Conservation XP">
            <div className="flex flex-col leading-tight">
              <span className="text-[8px] font-mono uppercase text-emerald-500/70 tracking-widest">XP</span>
              <span className="text-xs font-bold text-emerald-300 font-mono">{stats.xp}</span>
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-[8px] font-mono uppercase text-emerald-500/70 tracking-widest">Caught</span>
              <span className="text-xs font-bold text-emerald-300 font-mono">{stats.targetsCaught}</span>
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-[8px] font-mono uppercase text-emerald-500/70 tracking-widest">Missions</span>
              <span className="text-xs font-bold text-emerald-300 font-mono">{stats.missionsAdvanced}</span>
            </div>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-[10px] text-gray-400 uppercase tracking-widest leading-none mb-1">Field Operator</span>
            <span className="text-xs font-mono leading-none">{user?.displayName || 'Anonymous'}</span>
            <span className="text-[8px] text-emerald-500/60 font-mono uppercase leading-none mt-1">
              {user ? `ID: ${user.uid.slice(0, 10)}` : 'Connecting...'}
            </span>
          </div>
          <div className="hidden sm:flex items-center gap-2 text-[10px] bg-red-900/20 border border-red-500/30 px-3 py-1 rounded text-red-400 font-bold tracking-tighter">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
            18+ ENFORCED
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-hidden bg-app-subtle">
        <AnimatePresence mode="wait">
          {activeTab === 'intel' && (
            <motion.div
              key="intel"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="h-full flex flex-col lg:flex-row overflow-hidden"
            >
              {/* Real Map View */}
              <section className="flex-1 bg-app-void relative overflow-hidden">
                <MapView
                  userCoords={coords}
                  missions={missions}
                  selectedMission={selectedMission}
                  onMissionSelect={setSelectedMission}
                  showLandCover={showLandCover}
                  scanRadiusKm={10}
                />

                {/* Location status banner */}
                {geo.status !== 'located' && (
                  <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[500] max-w-md w-[calc(100%-2rem)]">
                    <div className="bg-app-surface/95 backdrop-blur border border-emerald-500/30 rounded-sm p-4 shadow-2xl flex items-start gap-3">
                      {geo.status === 'prompting' ? (
                        <Loader2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5 animate-spin" />
                      ) : (
                        <Navigation className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-[9px] font-mono uppercase tracking-widest text-emerald-500 mb-1">
                          {geo.status === 'prompting' && 'Acquiring GPS lock...'}
                          {geo.status === 'denied' && 'Location permission blocked'}
                          {geo.status === 'unsupported' && 'Geolocation unsupported'}
                          {geo.status === 'error' && 'Location unavailable'}
                          {geo.status === 'idle' && 'Location not requested'}
                        </p>
                        <p className="text-[11px] text-gray-300 leading-relaxed">
                          {geo.status === 'denied'
                            ? 'Enable location in your browser to see local missions, invasives, and species targets.'
                            : geo.error || 'Grant precise location to populate this sector with real regional data.'}
                        </p>
                      </div>
                      <button
                        onClick={geo.requestPrecise}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-app-bg font-bold uppercase text-[10px] tracking-widest rounded-sm transition-all whitespace-nowrap"
                      >
                        Retry
                      </button>
                    </div>
                  </div>
                )}

                {/* Approximate-source notice */}
                {geo.status === 'located' && geo.source !== 'gps' && (
                  <div className="absolute top-4 left-4 z-[500] bg-app-surface/90 backdrop-blur border border-amber-500/30 rounded-sm px-3 py-1.5 text-[10px] font-mono uppercase text-amber-400">
                    {geo.source === 'ip' ? 'IP-approximate location' : 'Manual location'}
                    <button
                      onClick={geo.requestPrecise}
                      className="ml-2 text-emerald-400 hover:text-emerald-300 underline"
                    >
                      use GPS
                    </button>
                  </div>
                )}

                {/* Map layer controls */}
                <div className="absolute bottom-4 right-4 z-[500] flex flex-col gap-2">
                  <button
                    onClick={() => setShowLandCover(v => !v)}
                    className={cn(
                      'inline-flex items-center gap-2 px-3 py-2 rounded-sm border text-[10px] font-bold uppercase tracking-widest transition-all backdrop-blur',
                      showLandCover
                        ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                        : 'bg-app-surface/90 border-app-line text-gray-300 hover:text-white'
                    )}
                    title="Toggle ESA WorldCover 2021 habitat classes"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    Land Cover
                  </button>
                </div>

                {/* Region + habitat ratios card */}
                {region && habitatRatios && (
                  <div className="absolute bottom-4 left-4 z-[500] max-w-xs bg-app-surface/90 backdrop-blur border border-app-line rounded-sm p-3">
                    <p className="text-[9px] font-mono uppercase text-gray-500 mb-1">Bioregion</p>
                    <p className="text-xs font-bold text-white">{region.displayName}</p>
                    <p className="text-[9px] font-mono uppercase text-emerald-400/70 mb-2 tracking-widest">
                      Authority: {jurisdiction.authority}
                    </p>
                    <p className="text-[9px] font-mono uppercase text-gray-500 mb-1">
                      Habitat ratios (n={habitatRatios.totalOccurrences.toLocaleString()})
                    </p>
                    <div className="flex h-2 rounded-sm overflow-hidden">
                      <div className="bg-emerald-500" style={{ width: `${habitatRatios.flora * 100}%` }} title={`Flora ${(habitatRatios.flora * 100).toFixed(0)}%`} />
                      <div className="bg-amber-500" style={{ width: `${habitatRatios.fauna * 100}%` }} title={`Fauna ${(habitatRatios.fauna * 100).toFixed(0)}%`} />
                      <div className="bg-blue-500" style={{ width: `${habitatRatios.fungi * 100}%` }} title={`Fungi ${(habitatRatios.fungi * 100).toFixed(0)}%`} />
                      <div className="bg-purple-500" style={{ width: `${habitatRatios.invertebrates * 100}%` }} title={`Other ${(habitatRatios.invertebrates * 100).toFixed(0)}%`} />
                    </div>
                    <div className="flex justify-between mt-1 text-[8px] font-mono text-gray-500">
                      <span>🌿 {(habitatRatios.flora * 100).toFixed(0)}%</span>
                      <span>🐾 {(habitatRatios.fauna * 100).toFixed(0)}%</span>
                      <span>🍄 {(habitatRatios.fungi * 100).toFixed(0)}%</span>
                      <span>🦠 {(habitatRatios.invertebrates * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                )}
              </section>

              {/* Mission Sidebar */}
              <aside className="w-full lg:w-96 bg-app-surface border-l border-app-line flex flex-col p-8 overflow-y-auto custom-scrollbar">
                {selectedMission ? (
                  <div className="space-y-6">
                    <header>
                      <div className="mb-4">
                        <span className={cn(
                          "inline-block px-2 py-0.5 rounded-sm text-[8px] font-bold uppercase tracking-[0.2em] mb-3",
                          selectedMission.priority === 'High' ? "bg-red-500/20 text-red-400 border border-red-400/20" : "bg-app-subtle text-gray-500 border border-app-line"
                        )}>
                          {selectedMission.priority} Priority · {selectedMission.category}
                        </span>
                        <h2 className="text-xl font-bold text-white mb-2">{selectedMission.title}</h2>
                        <p className="text-[10px] text-gray-500 uppercase tracking-widest">{selectedMission.location.name}</p>
                      </div>
                    </header>

                    <div className="p-4 bg-emerald-500/5 border border-emerald-500/20 rounded">
                      <p className="text-[11px] text-gray-300 leading-relaxed">{selectedMission.description}</p>
                      {selectedMission.category === 'Endangered' && (
                        <p className="text-[9px] font-mono uppercase text-emerald-400/80 mt-2 tracking-widest">
                          Source: {jurisdiction.authority}
                        </p>
                      )}
                    </div>

                    {selectedMission.targetSpecies && selectedMission.targetSpecies.length > 0 && (() => {
                      const targetName = selectedMission.targetSpecies[0];
                      const progress = inventory.filter(
                        e => e.claimedMissionId === selectedMission.id
                      ).length;
                      const required = 3;
                      return (
                        <div className="p-3 bg-app-bg border border-app-line rounded">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-[9px] font-mono uppercase text-gray-400">Mission Progress</p>
                            <p className="text-[10px] font-mono text-emerald-400">{progress}/{required}</p>
                          </div>
                          <div className="h-1.5 bg-app-line rounded-sm overflow-hidden mb-2">
                            <div
                              className="h-full bg-emerald-500 transition-all"
                              style={{ width: `${Math.min(100, (progress / required) * 100)}%` }}
                            />
                          </div>
                          <p className="text-[9px] text-gray-500 italic">
                            Capture {targetName} and claim for this mission to advance.
                          </p>
                        </div>
                      );
                    })()}

                    {coords && (
                      <div className="p-3 bg-app-bg border border-app-line rounded">
                        <p className="text-[9px] font-mono uppercase text-gray-400 mb-2">Distance</p>
                        <p className="text-lg font-bold text-emerald-400">
                          {Math.round(Math.hypot(
                            (selectedMission.location.lat - coords.lat) * 111.32,
                            (selectedMission.location.lng - coords.lng) * 111.32 * Math.cos(coords.lat * Math.PI / 180)
                          ) * 1000)} m
                        </p>
                      </div>
                    )}

                    {isLoadingData ? (
                      <div className="p-4 bg-app-bg border border-app-line rounded flex items-center justify-center gap-2 text-gray-400">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span className="text-[10px] font-mono uppercase">Loading site data...</span>
                      </div>
                    ) : (
                      <>
                        {missionSoilData[selectedMission.id] && missionSoilData[selectedMission.id].length > 0 && (
                          <div className="p-3 bg-amber-900/10 border border-amber-500/20 rounded">
                            <p className="text-[9px] font-mono uppercase text-amber-500 mb-2">Soil Profile</p>
                            <div className="space-y-1">
                              {missionSoilData[selectedMission.id].slice(0, 2).map((soil, idx) => (
                                <p key={idx} className="text-[9px] text-amber-200">
                                  {interpretSoilData([soil])}
                                </p>
                              ))}
                            </div>
                          </div>
                        )}

                        {missionSpecies[selectedMission.id] && missionSpecies[selectedMission.id].length > 0 && (
                          <div className="p-3 bg-blue-900/10 border border-blue-500/20 rounded">
                            <p className="text-[9px] font-mono uppercase text-blue-500 mb-2">
                              Species Recorded ({missionSpecies[selectedMission.id].length})
                            </p>
                            <div className="space-y-1 max-h-32 overflow-y-auto custom-scrollbar">
                              {missionSpecies[selectedMission.id].slice(0, 5).map((sp, idx) => (
                                <div key={idx} className="text-[8px]">
                                  <p className="text-blue-300 font-bold">{sp.commonName}</p>
                                  <p className="text-blue-200 italic">{sp.scientificName}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {(() => {
                          const threat = getThreatForMission(selectedMission.category, selectedMission.title);
                          if (!threat) return null;
                          const chosen = missionStrategy[selectedMission.id];
                          const simulation = simulateThreat(threat, missionSoilData[selectedMission.id] || [], {
                            strategy: chosen,
                            nativeBiomassFactor: nativeDensity,
                          });
                          return (
                            <ThreatSimulationView
                              simulation={simulation}
                              nativeDensity={nativeDensity}
                              onStrategyChange={(s) =>
                                setMissionStrategy(prev => ({ ...prev, [selectedMission.id]: s }))
                              }
                            />
                          );
                        })()}
                      </>
                    )}

                    <button
                      className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-app-bg font-bold uppercase text-[10px] tracking-widest rounded transition-all"
                      onClick={() => {}}
                    >
                      Navigate to Mission
                    </button>

                    <button
                      onClick={() => setSelectedMission(null)}
                      className="w-full py-2 text-gray-400 hover:text-white text-[10px] uppercase tracking-widest transition-colors"
                    >
                      Deselect
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <h3 className="text-[10px] font-mono uppercase tracking-[0.3em] text-gray-500">Available Missions</h3>
                    {missions.map(mission => (
                      <button
                        key={mission.id}
                        onClick={() => setSelectedMission(mission)}
                        className="w-full text-left p-4 bg-app-bg border border-app-line rounded hover:border-emerald-500 transition-all group"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <span className={cn(
                            "px-2 py-0.5 rounded-sm text-[8px] font-bold uppercase tracking-[0.2em]",
                            mission.priority === 'High' ? "bg-red-500/20 text-red-400 border border-red-400/20" : "bg-app-subtle text-gray-500 border border-app-line"
                          )}>
                            {mission.priority} Priority
                          </span>
                          <Target className="w-4 h-4 text-gray-500 group-hover:text-emerald-500 transition-colors" />
                        </div>
                        <h4 className="text-xs font-bold text-white uppercase mb-1">{mission.title}</h4>
                        <p className="text-[10px] text-gray-500 leading-relaxed line-clamp-2">{mission.description}</p>
                        <div className="flex items-center gap-2 mt-3 text-[9px] font-mono text-emerald-500/60">
                          <MapPin className="w-3 h-3" />
                          {mission.location.name}
                        </div>
                      </button>
                    ))}

                    {missions.length === 0 && (
                      <div className="text-center py-12 opacity-40">
                        <Globe className="w-8 h-8 mx-auto mb-4 animate-spin-slow" />
                        <p className="text-[10px] font-mono uppercase tracking-widest">Scanning local mesh...</p>
                      </div>
                    )}
                  </div>
                )}
              </aside>
            </motion.div>
          )}

          {activeTab === 'targets' && (
            <motion.div
              key="targets"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="h-full overflow-hidden"
            >
              <TargetDex
                targets={targets}
                inventory={inventory}
                isLoading={isLoadingTargets}
                regionLabel={region?.displayName || ''}
                onCapture={triggerCapture}
              />
            </motion.div>
          )}

          {activeTab === 'dex' && (
            <motion.div
              key="dex"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="h-full flex flex-col md:flex-row overflow-hidden"
            >
              {/* Left Side: Records List */}
              <section className="flex-1 overflow-y-auto p-6 md:p-10 custom-scrollbar border-r border-app-line bg-app-bg">
                <div className="flex items-center justify-between mb-8 border-b border-app-line pb-4">
                  <h2 className="text-sm font-mono uppercase tracking-[0.3em] text-gray-500">Specimen Archive</h2>
                  <div className="flex items-center gap-2 text-[10px] uppercase font-mono text-emerald-500/70">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    SYSTEM_STABLE
                  </div>
                </div>

                {inventory.length === 0 ? (
                  <div className="h-full border border-app-line border-dashed rounded-lg p-12 bg-white/[0.01] flex flex-col items-center justify-center text-center">
                    <Book className="w-12 h-12 text-gray-700 mb-6" />
                    <h3 className="text-lg font-serif italic text-white mb-2">Operational Archive Vacant</h3>
                    <p className="text-xs text-gray-500 max-w-xs font-mono uppercase tracking-wider mb-6">
                      Execute capture sequence to populate database with identified specimens.
                    </p>
                    <button
                      onClick={triggerCapture}
                      disabled={isAnalyzing}
                      className="inline-flex items-center gap-2 px-5 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-app-bg font-bold uppercase text-[10px] tracking-widest rounded-sm transition-all shadow-[0_0_20px_rgba(16,185,129,0.2)]"
                    >
                      {isAnalyzing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                      Initiate Capture
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {inventory.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => setSelectedSpecies(item)}
                        className={cn(
                          "group relative aspect-[4/5] rounded overflow-hidden border transition-all active:scale-95",
                          selectedSpecies?.id === item.id ? "border-emerald-500 bg-emerald-500/5 shadow-[0_0_20px_rgba(16,185,129,0.1)]" : "border-app-line bg-app-surface hover:border-gray-500"
                        )}
                      >
                        <img 
                          src={item.species.imageUrl} 
                          alt={item.species.commonName}
                          className="w-full h-full object-cover opacity-70 group-hover:opacity-100 transition-opacity"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-app-bg via-transparent to-transparent opacity-80" />
                        <div className={cn(
                          "absolute top-2 right-2 w-2 h-2 rounded-full",
                          item.reviewStatus === 'Verified' ? "bg-emerald-500" : 
                          item.reviewStatus === 'Under Review' ? "bg-blue-500" :
                          item.reviewStatus === 'Submitted' ? "bg-amber-500 animate-pulse" : "bg-gray-700"
                        )} title={item.reviewStatus}></div>
                        <div className="absolute bottom-0 left-0 right-0 p-3 text-left">
                          <p className="text-[9px] font-mono text-emerald-500 uppercase tracking-tighter mb-0.5">{item.species.category}</p>
                          <h4 className="text-xs font-bold text-white uppercase tracking-tight truncate">{item.species.commonName}</h4>
                          <p className="text-[9px] italic font-serif text-gray-500 truncate">{item.species.scientificName}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </section>

              {/* Right Side: Detailed Analysis (Desktop Context) */}
              <aside className="hidden md:flex w-96 flex-col bg-app-surface border-l border-app-line overflow-y-auto custom-scrollbar">
                {selectedSpecies ? (
                  <div className="p-8 space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                    <header>
                      <h3 className="text-[10px] font-mono uppercase tracking-widest text-gray-500 mb-6 border-b border-app-line pb-2">Analysis Protocol</h3>
                      <div className="aspect-square bg-app-void border border-app-line rounded overflow-hidden mb-6 group relative">
                        <img 
                          src={selectedSpecies.species.imageUrl} 
                          alt={selectedSpecies.species.commonName}
                          className="w-full h-full object-cover grayscale-[20%] group-hover:grayscale-0 transition-all duration-500"
                        />
                        <div className="absolute top-3 left-3 flex gap-2">
                           <span className={cn(
                             "px-2 py-0.5 rounded-sm text-[9px] font-bold uppercase tracking-widest",
                             selectedSpecies.reviewStatus === 'Verified' ? "bg-emerald-500/20 text-emerald-400 border border-emerald-400/30" : "bg-app-bg text-gray-400 border border-app-line"
                           )}>
                             {selectedSpecies.reviewStatus}
                           </span>
                        </div>
                      </div>
                      <h1 className="text-3xl font-serif italic text-white tracking-tight leading-none mb-1">{selectedSpecies.species.scientificName}</h1>
                      <p className="text-xs uppercase tracking-[0.2em] text-gray-400 font-mono">{selectedSpecies.species.commonName}</p>
                    </header>

                    <section className="space-y-6">
                      {selectedSpecies.species.hazards && selectedSpecies.species.hazards.length > 0 && (
                        <div className="p-4 bg-red-900/10 border border-red-500/20 rounded">
                           <span className="text-[9px] font-bold uppercase tracking-widest text-red-500 block mb-2 font-mono">Quarantine Risk</span>
                           <div className="space-y-1">
                             {selectedSpecies.species.hazards.map((h, i) => (
                               <p key={i} className="text-[11px] text-red-400">• {h}</p>
                             ))}
                           </div>
                        </div>
                      )}

                      {targets.length > 0 && (
                        <div>
                          <h4 className="text-[9px] font-mono uppercase tracking-widest text-gray-500 mb-2">
                            {selectedSpecies.claimedScientificName ? 'Claimed As' : 'Claim as Regional Target'}
                          </h4>
                          {selectedSpecies.claimedScientificName ? (
                            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded">
                              <p className="text-[11px] text-white font-bold">{selectedSpecies.species.commonName}</p>
                              <p className="text-[9px] italic text-emerald-300">{selectedSpecies.claimedScientificName}</p>
                              {selectedSpecies.claimedMissionId && (
                                <p className="text-[9px] font-mono uppercase text-emerald-400 mt-1">+50 XP · Mission progress</p>
                              )}
                            </div>
                          ) : (
                            <select
                              onChange={(e) => {
                                if (!e.target.value) return;
                                const [kind, taxonKeyStr, missionId] = e.target.value.split('|');
                                const taxonKey = Number(taxonKeyStr);
                                const target =
                                  kind === 'mission'
                                    ? (() => {
                                        const m = missions.find(mm => mm.id === missionId);
                                        const name = m?.targetSpecies?.[0];
                                        if (!name) return null;
                                        const existing = [...invasives, ...endangered].find(t => t.scientificName === name);
                                        if (!existing) return null;
                                        return {
                                          taxonKey: existing.taxonKey,
                                          scientificName: existing.scientificName,
                                          commonName: existing.commonName,
                                          category: existing.category,
                                          conservationStatus: 'Unknown' as const,
                                          imageUrl: existing.imageUrl,
                                        } satisfies TargetSpecies;
                                      })()
                                    : targets.find(t => t.taxonKey === taxonKey) || null;
                                if (!target) return;
                                claimCapture(target, kind === 'mission' ? missionId : undefined);
                              }}
                              defaultValue=""
                              className="w-full bg-app-subtle border border-app-line rounded p-3 text-xs text-white focus:outline-none focus:border-emerald-500"
                            >
                              <option value="" disabled>Select a match…</option>
                              {missions
                                .filter(m => m.targetSpecies && m.targetSpecies.length > 0)
                                .map(m => (
                                  <option key={`m-${m.id}`} value={`mission|0|${m.id}`}>
                                    🎯 Mission: {m.targetSpecies![0]} ({m.title})
                                  </option>
                                ))}
                              {targets.map(t => (
                                <option key={t.taxonKey} value={`target|${t.taxonKey}|`}>
                                  {t.commonName} — {t.scientificName}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      )}

                      <div>
                        <h4 className="text-[9px] font-mono uppercase tracking-widest text-gray-500 mb-2">Scientific Ledger</h4>
                        <div className="p-4 bg-app-bg border border-app-line rounded">
                          <div className="flex items-center justify-between mb-4">
                            <span className="text-[10px] font-mono uppercase text-gray-500">Review Status</span>
                            <div className="flex items-center gap-2">
                              {selectedSpecies.reviewStatus === 'Verified' ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Activity className="w-4 h-4 text-amber-500" />}
                              <span className="text-[10px] font-bold text-white uppercase">{selectedSpecies.reviewStatus}</span>
                            </div>
                          </div>
                          
                          {selectedSpecies.reviewStatus === 'Draft' ? (
                            <div className="space-y-4">
                              <textarea
                                value={userObservations}
                                onChange={(e) => setUserObservations(e.target.value)}
                                placeholder="Add field observations for scientific review..."
                                className="w-full h-24 bg-app-subtle border border-app-line rounded p-3 text-xs text-white placeholder:text-gray-700 focus:outline-none focus:border-emerald-500 transition-colors"
                              />
                              <button 
                                onClick={submitForReview}
                                disabled={isSubmittingReview}
                                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-app-bg font-bold uppercase text-[10px] tracking-widest rounded transition-all flex items-center justify-center gap-2"
                              >
                                {isSubmittingReview ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                Submit for Review
                              </button>
                            </div>
                          ) : (
                            <div className="space-y-3">
                              <div className="p-3 bg-app-subtle rounded border border-app-line">
                                <span className="text-[8px] font-mono uppercase text-gray-500 block mb-1">Your Observation</span>
                                <p className="text-[11px] text-gray-300 leading-relaxed">
                                  {selectedSpecies.userObservations || 'No observations recorded during session.'}
                                </p>
                              </div>
                              {selectedSpecies.reviewerNotes && (
                                <div className="p-3 bg-blue-500/5 rounded border border-blue-500/20">
                                  <span className="text-[8px] font-mono uppercase text-blue-400 block mb-1">Reviewer Feedback</span>
                                  <p className="text-[11px] text-blue-300 italic">{selectedSpecies.reviewerNotes}</p>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-3 bg-app-void border border-app-line rounded">
                          <span className="text-[8px] font-mono uppercase text-gray-500 block mb-1">Sector</span>
                          <span className="text-[10px] text-gray-300 uppercase tracking-tighter truncate block">{selectedSpecies.location?.areaName || 'Unknown'}</span>
                        </div>
                        <div className="p-3 bg-app-void border border-app-line rounded">
                          <span className="text-[8px] font-mono uppercase text-gray-500 block mb-1">Precision</span>
                          <span className="text-[10px] text-gray-300 uppercase tracking-tighter truncate block">± 500 meters</span>
                        </div>
                      </div>

                      <div className="pt-4 border-t border-app-line flex items-center justify-between opacity-50">
                        <span className="text-[8px] font-mono text-gray-500 uppercase tracking-widest">TS: {new Date(selectedSpecies.timestamp).getTime()}</span>
                        <span className="text-[8px] font-mono text-gray-500 uppercase">Mesh Shard: {selectedSpecies.id.slice(0, 8)}</span>
                      </div>
                    </section>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-gray-600">
                    <Search className="w-10 h-10 mb-4 opacity-20" />
                    <p className="text-[10px] font-mono uppercase tracking-widest leading-loose">
                      Select record from<br />central archive for<br />detailed diagnostics
                    </p>
                  </div>
                )}
              </aside>
            </motion.div>
          )}

          {activeTab === 'community' && (
            <motion.div
              key="community"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="h-full overflow-y-auto p-6 md:p-10"
            >
              <div className="max-w-4xl mx-auto space-y-10">
                <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-app-line pb-6">
                  <div>
                    <h2 className="text-3xl font-serif italic text-white tracking-tight">Field Intelligence</h2>
                    <p className="text-xs font-mono uppercase tracking-[0.2em] text-gray-500 mt-2">Operational mesh network data // Anonymized</p>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded text-emerald-500 font-bold uppercase tracking-tighter">
                    Data Stream: Live
                  </div>
                </header>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="p-6 bg-app-surface border border-app-line rounded-lg">
                    <span className="text-[10px] uppercase text-gray-500 tracking-widest block mb-4 font-mono">Privacy Protocol</span>
                    <div className="flex items-center gap-3">
                      <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]"></div>
                      <span className="text-sm font-bold uppercase tracking-tight text-white">CLOAKED (500m)</span>
                    </div>
                    <p className="text-[11px] text-gray-500 mt-3 leading-relaxed italic">
                      Location data is automatically obfuscated before syncing to the mesh to ensure operator safety.
                    </p>
                  </div>

                  <div className="p-6 bg-app-surface border border-app-line rounded-lg">
                    <span className="text-[10px] uppercase text-gray-500 tracking-widest block mb-4 font-mono">Mesh Hazards</span>
                    <div className="flex items-center gap-3">
                       <div className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse"></div>
                       <span className="text-sm font-bold uppercase tracking-tight text-amber-500">QUARANTINE_ACTIVE</span>
                    </div>
                    <p className="text-[11px] text-gray-500 mt-3 leading-relaxed italic">
                      Confirmed reports of Spotted Lanternfly in adjacent sectors. Vigilance advised.
                    </p>
                  </div>

                  <div className="p-6 bg-emerald-500/5 border border-emerald-500/20 rounded-lg">
                    <span className="text-[10px] uppercase text-emerald-500/60 tracking-widest block mb-4 font-mono">Science Ledger</span>
                    <div className="flex items-center gap-2">
                      <Activity className="w-5 h-5 text-emerald-500" />
                      <span className="text-sm font-bold uppercase tracking-tight text-white">+842 TOTAL SIGHTINGS</span>
                    </div>
                    <p className="text-[11px] text-emerald-500/70 mt-3 leading-relaxed italic">
                      Your observations are directly linked to world-wide conservation databases.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                   <div className="bg-app-surface border border-app-line rounded-lg overflow-hidden">
                      <div className="px-6 py-4 border-b border-app-line bg-app-bg/50">
                        <h4 className="text-[10px] font-mono uppercase tracking-widest text-[#8E9299]">Regional Activity</h4>
                      </div>
                      <div className="p-6 space-y-4">
                         {[1, 2, 3].map(i => (
                           <div key={i} className="flex items-center justify-between py-2 border-b border-app-line last:border-0 opacity-80 hover:opacity-100 transition-opacity">
                              <div className="flex items-center gap-4">
                                <div className="w-8 h-8 rounded bg-app-bg border border-app-line flex items-center justify-center">
                                  <Search className="w-4 h-4 text-gray-500" />
                                </div>
                                <div>
                                  <p className="text-xs font-bold text-white uppercase tracking-tight">Scientific Observation #{1024 + i}</p>
                                  <p className="text-[10px] text-gray-500 font-mono">Sector: Grid-ALPHA-{i}</p>
                                </div>
                              </div>
                              <span className="text-[9px] font-mono text-emerald-500 uppercase tracking-tighter">Verified</span>
                           </div>
                         ))}
                      </div>
                   </div>

                   <div className="bg-app-surface border border-app-line rounded-lg overflow-hidden">
                      <div className="px-6 py-4 border-b border-app-line bg-app-bg/50">
                        <h4 className="text-[10px] font-mono uppercase tracking-widest text-[#8E9299]">System Messages</h4>
                      </div>
                      <div className="p-6">
                         <div className="p-4 bg-app-void border border-blue-500/20 rounded-lg">
                           <p className="text-[11px] leading-relaxed text-gray-300">
                             <span className="text-blue-400 font-bold uppercase block mb-1 tracking-widest">Protocol Note:</span>
                             Mesh encryption updated to v4.2. All operator metadata is now sharded across distributed nodes for maximum operational security. Physical user interaction remains disabled by default.
                           </p>
                         </div>
                      </div>
                   </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      {/* Capture Overlay */}
      <AnimatePresence>
        {isAnalyzing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-app-bg flex flex-col items-center justify-center p-6 text-center"
          >
            <div className="relative mb-12">
              <div className="absolute inset-0 opacity-40">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] border border-emerald-500/20 rounded-full animate-pulse"></div>
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] border border-emerald-500/10 rounded-full"></div>
              </div>
              <div className="w-40 h-40 rounded-full border border-emerald-500/20 flex items-center justify-center relative">
                <div className="absolute inset-0 rounded-full border-t border-emerald-500 animate-spin" />
                <Search className="w-10 h-10 text-emerald-500 animate-pulse" />
              </div>
            </div>
            
            <div className="space-y-4 max-w-sm">
              <h2 className="text-2xl font-serif italic text-white tracking-tight uppercase">Executing Analysis</h2>
              <p className="text-[11px] text-gray-500 uppercase tracking-widest font-mono leading-relaxed">
                Correlating visual morphology with genomic biodiversity datasets. Scientific parity check in progress...
              </p>
              <div className="pt-6 flex flex-col gap-2">
                <div className="h-0.5 w-64 bg-app-line rounded-full overflow-hidden mx-auto">
                  <motion.div 
                    initial={{ x: '-100%' }}
                    animate={{ x: '100%' }}
                    transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
                    className="h-full w-1/3 bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)]" 
                  />
                </div>
                <div className="flex justify-between text-[8px] font-mono text-emerald-500/70 uppercase tracking-tighter px-2">
                  <span>Mesh Linkage</span>
                  <span>Synchronizing...</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Species Detail Panel (Mobile Fallback) */}
      <AnimatePresence>
        {selectedSpecies && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="md:hidden fixed inset-0 z-50 flex items-end justify-center bg-app-void/80 backdrop-blur-sm p-4"
            onClick={() => setSelectedSpecies(null)}
          >
            <motion.div
              initial={{ y: 100 }}
              animate={{ y: 0 }}
              exit={{ y: 100 }}
              className="w-full max-w-lg bg-app-surface border border-app-line rounded-lg overflow-hidden flex flex-col max-h-[85vh] shadow-2xl shadow-black"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="relative h-64 flex-shrink-0">
                <img 
                  src={selectedSpecies.species.imageUrl} 
                  alt={selectedSpecies.species.commonName}
                  className="w-full h-full object-cover"
                />
                <button 
                  onClick={() => setSelectedSpecies(null)}
                  className="absolute top-4 right-4 w-8 h-8 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white"
                >
                  &times;
                </button>
                <div className="absolute top-4 left-4 flex gap-2">
                  <span className={cn(
                    "px-2 py-0.5 rounded-sm text-[9px] font-bold uppercase tracking-widest",
                    selectedSpecies.species.conservationStatus === 'Least Concern' ? "bg-emerald-500/20 text-emerald-400 border border-emerald-400/30" : "bg-amber-500/20 text-amber-400 border border-amber-400/30"
                  )}>
                    {selectedSpecies.species.conservationStatus}
                  </span>
                </div>
              </div>

              <div className="p-6 overflow-y-auto custom-scrollbar">
                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="px-1.5 py-0.5 rounded-sm bg-emerald-500/10 text-emerald-500 text-[8px] uppercase font-mono font-bold border border-emerald-500/20 tracking-tighter">
                      {selectedSpecies.species.category}
                    </span>
                    <span className="text-[9px] font-mono text-gray-500 uppercase">Analysis Confidence: {(selectedSpecies.species.scientificAccuracyScore * 100).toFixed(1)}%</span>
                  </div>
                  <h2 className="text-3xl font-serif italic text-white tracking-tight mb-1">{selectedSpecies.species.scientificName}</h2>
                  <p className="text-xs font-mono uppercase tracking-widest text-gray-400">{selectedSpecies.species.commonName}</p>
                </div>

                {selectedSpecies.species.hazards && selectedSpecies.species.hazards.length > 0 && (
                  <div className="mb-6 p-4 rounded bg-red-900/10 border border-red-500/20">
                    <div className="flex items-center gap-2 text-red-500 mb-2">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span className="text-[9px] uppercase font-bold tracking-widest font-mono">Quarantine Risk</span>
                    </div>
                    <div className="space-y-1">
                      {selectedSpecies.species.hazards.map((hazard, i) => (
                        <p key={i} className="text-xs text-red-400 font-medium">• {hazard}</p>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-6">
                  <div>
                    <h5 className="text-[9px] uppercase font-bold tracking-widest text-gray-500 mb-2 font-mono">Narrative</h5>
                    <p className="text-xs text-gray-400 leading-relaxed">{selectedSpecies.species.description}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <h5 className="text-[8px] uppercase font-bold tracking-widest text-gray-500 mb-1 font-mono">Habitat</h5>
                      <p className="text-[10px] text-gray-300 uppercase tracking-tighter truncate">{selectedSpecies.species.habitat}</p>
                    </div>
                    <div>
                      <h5 className="text-[8px] uppercase font-bold tracking-widest text-gray-500 mb-1 font-mono">Timestamp</h5>
                      <p className="text-[10px] text-gray-300 font-mono tracking-tighter truncate">{new Date(selectedSpecies.timestamp).toLocaleDateString()}</p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      </main>

      {/* Upload Error Toast */}
      <AnimatePresence>
        {uploadError && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-28 md:bottom-16 left-1/2 -translate-x-1/2 z-[110] max-w-md w-[calc(100%-2rem)]"
            role="alert"
          >
            <div className="bg-app-surface border border-red-500/40 rounded-sm p-4 shadow-2xl flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-[9px] font-mono uppercase tracking-widest text-red-500 mb-1">Capture Error</p>
                <p className="text-[11px] text-gray-300 leading-relaxed break-words">{uploadError}</p>
              </div>
              <button
                onClick={() => setUploadError(null)}
                className="text-gray-500 hover:text-white transition-colors shrink-0"
                aria-label="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Status Footer */}
      <footer className="h-10 bg-app-subtle border-t border-app-line flex items-center px-6 justify-between text-[10px] text-gray-500 font-mono z-30">
        <div className="flex gap-4">
          <span className="flex items-center gap-1.5 overflow-hidden">
            <span className="w-1 h-1 rounded-full bg-emerald-500"></span>
            SYS_CONNECTED
          </span>
          <span className="hidden sm:inline">LOC: ENCRYPTED_MESH</span>
          <span className="hidden sm:inline">GPS: ACTIVE_LOCK</span>
        </div>
        <div className="text-right uppercase tracking-tighter opacity-70">
          Safety Protocol Delta-9 // 18+ Access Enforced
        </div>
      </footer>

      {/* Nav Rail / Bottom Navigation (Mobile Only Context) */}
      <nav className="md:hidden fixed bottom-10 left-0 right-0 z-40 bg-app-surface border-t border-app-line h-16 flex items-center justify-around px-4 shadow-[0_-10px_20px_rgba(0,0,0,0.5)]">
        <div className="flex items-center justify-around w-full max-w-sm mx-auto">
          <button 
            onClick={() => setActiveTab('intel')}
            className={cn(
              "flex flex-col items-center gap-1 transition-all",
              activeTab === 'intel' ? "text-emerald-500" : "text-gray-500 hover:text-white"
            )}
          >
            <Globe className="w-5 h-5" />
            <span className="text-[8px] uppercase font-bold tracking-[0.2em]">Intel</span>
          </button>

          <button
            onClick={() => setActiveTab('targets')}
            className={cn(
              "flex flex-col items-center gap-1 transition-all",
              activeTab === 'targets' ? "text-emerald-500" : "text-gray-500 hover:text-white"
            )}
          >
            <Target className="w-5 h-5 border-transparent transition-all" />
            <span className="text-[8px] uppercase font-bold tracking-[0.2em]">Targets</span>
          </button>

          <button
            onClick={() => setActiveTab('dex')}
            className={cn(
              "flex flex-col items-center gap-1 transition-all",
              activeTab === 'dex' ? "text-emerald-500" : "text-gray-500 hover:text-white"
            )}
          >
            <Book className="w-5 h-5 border-transparent transition-all" />
            <span className="text-[8px] uppercase font-bold tracking-[0.2em]">Index</span>
          </button>

          <button
            onClick={triggerCapture}
            disabled={isAnalyzing}
            className="relative w-12 h-12 -mt-10 rounded bg-emerald-600 text-app-bg flex items-center justify-center shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
            aria-label="Capture specimen"
          >
            {isAnalyzing ? <Loader2 className="w-6 h-6 animate-spin" /> : <Camera className="w-6 h-6" />}
          </button>

          <button 
            onClick={() => setActiveTab('community')}
            className={cn(
              "flex flex-col items-center gap-1 transition-all",
              activeTab === 'community' ? "text-emerald-500" : "text-gray-500 hover:text-white"
            )}
          >
            <Activity className="w-5 h-5" />
            <span className="text-[8px] uppercase font-bold tracking-[0.2em]">Mesh</span>
          </button>
        </div>
      </nav>

    </div>
  );
}
