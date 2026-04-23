import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Camera, Book, Search, Shield, Info, Activity, User, ChevronRight, AlertTriangle, LogIn, Loader2, MapPin, Target, ShieldAlert, CheckCircle2, Globe, Navigation, Layers, Send } from 'lucide-react';
import { cn } from './lib/utils';
import { Species, CollectionEntry, ReviewStatus, FieldMission } from './types';
import { identifySpecies } from './services/geminiService';
import { auth, db, signIn, handleFirestoreError } from './services/firebase';
import { 
  collection, 
  addDoc, 
  query, 
  where, 
  getDocs, 
  onSnapshot, 
  serverTimestamp, 
  setDoc, 
  doc, 
  getDoc 
} from 'firebase/firestore';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';

export default function App() {
  const [activeTab, setActiveTab] = useState<'intel' | 'dex' | 'community'>('intel');
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [selectedSpecies, setSelectedSpecies] = useState<CollectionEntry | null>(null);
  const [inventory, setInventory] = useState<CollectionEntry[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showAgeGate, setShowAgeGate] = useState(true);
  const [showMissionBrief, setShowMissionBrief] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [coords, setCoords] = useState<{ lat: number, lng: number } | null>(null);
  const [missions, setMissions] = useState<FieldMission[]>([]);
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [userObservations, setUserObservations] = useState('');

  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition((position) => {
        setCoords({
          lat: position.coords.latitude,
          lng: position.coords.longitude
        });
      });
    }
  }, []);

  useEffect(() => {
    if (coords) {
      // Mock missions based on user location
      const mockMissions: FieldMission[] = [
        {
          id: 'm1',
          title: 'Invasive Pattern Detection',
          description: 'Spotted Lanternfly egg masses reported in your sector. Immediate confirmation required.',
          priority: 'High',
          category: 'Invasive',
          location: {
            lat: coords.lat + 0.002,
            lng: coords.lng - 0.001,
            radius: 200,
            name: 'North Sector Grid-4'
          }
        },
        {
          id: 'm2',
          title: 'Endangered Flora Survey',
          description: 'Historical records indicate rare Orchidaceae sightings here. Document current population.',
          priority: 'Medium',
          category: 'Endangered',
          location: {
            lat: coords.lat - 0.003,
            lng: coords.lng + 0.004,
            radius: 500,
            name: 'Riverbank Preserve'
          }
        }
      ];
      setMissions(mockMissions);
    }
  }, [coords]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      setIsAuthLoading(false);
      
      if (user) {
        // Check if user is already verified in BioDex system
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists() && userDoc.data()?.ageVerified) {
          setShowAgeGate(false);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setInventory([]);
      return;
    }

    // Real-time synchronization of specimen archive
    const q = query(collection(db, 'observations'), where('userId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      } as CollectionEntry));
      setInventory(items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
    }, (error) => handleFirestoreError(error, 'list', 'observations'));

    return () => unsubscribe();
  }, [user]);

  const handleLogin = async () => {
    try {
      await signIn();
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  const verifyAge = async () => {
    if (!user) return;
    
    try {
      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid,
        displayName: user.displayName || 'Anonymous Operator',
        email: user.email || 'hidden@mesh.network',
        ageVerified: true,
        observationCount: 0,
        joinedAt: new Date().toISOString()
      });
      setShowAgeGate(false);
      setShowMissionBrief(true);
    } catch (error) {
      handleFirestoreError(error, 'create', `users/${user.uid}`);
    }
  };
  
  const submitForReview = async () => {
    if (!selectedSpecies || !user) return;
    setIsSubmittingReview(true);
    try {
      await setDoc(doc(db, 'observations', selectedSpecies.id), {
        ...selectedSpecies,
        reviewStatus: 'Submitted',
        userObservations: userObservations,
        updatedAt: serverTimestamp()
      }, { merge: true });
      setIsSubmittingReview(false);
      setSelectedSpecies(prev => prev ? { ...prev, reviewStatus: 'Submitted', userObservations } : null);
      setUserObservations('');
    } catch (error) {
      handleFirestoreError(error, 'update', `observations/${selectedSpecies.id}`);
      setIsSubmittingReview(false);
    }
  };

  const handleCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setIsAnalyzing(true);
    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = (reader.result as string).split(',')[1];
        const identified = await identifySpecies(base64);
        
        // Persist to Firestore
        const newRecord: Partial<CollectionEntry> = {
          species: identified,
          userId: user.uid,
          timestamp: new Date().toISOString(),
          reviewStatus: 'Draft',
          location: coords ? {
            lat: coords.lat,
            lng: coords.lng,
            areaName: 'Current Sector'
          } : undefined
        };

        const docRef = await addDoc(collection(db, 'observations'), newRecord);
        
        setSelectedSpecies({ ...newRecord, id: docRef.id } as CollectionEntry);
        setIsAnalyzing(false);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error("Identification failed:", error);
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="min-h-screen bg-app-bg text-app-text font-sans flex flex-col selection:bg-emerald-500/30">
      {/* Header / Mission Briefing */}
      {/* Age Gate Overlay */}
      <AnimatePresence>
        {showAgeGate && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-app-bg flex items-center justify-center p-6"
          >
            <div className="max-w-md w-full space-y-10 text-center">
              <div className="flex flex-col items-center gap-6">
                <div className="w-20 h-20 bg-app-surface border border-app-line flex items-center justify-center rounded-sm">
                  <Shield className="w-10 h-10 text-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.2)]" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-3xl font-serif italic text-white tracking-tight leading-none">Personnel Verification</h2>
                  <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-gray-500">Security Access Protocol v4.2</p>
                </div>
                <p className="text-xs text-gray-400 leading-relaxed max-w-xs">
                  Biota Explorer is a specialized scientific instrument. Participation requires 
                  strict adherence to biosecurity protocols and ethical specimen observation.
                </p>
              </div>

              <div className="space-y-6">
                <div className="p-5 rounded border border-app-line bg-app-surface text-left space-y-3">
                  <div className="flex gap-3 items-start">
                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-gray-300 font-sans">User must be 18+ for field operation. All sessions are logged to the mesh ledger.</p>
                  </div>
                  <div className="flex gap-3 items-start">
                    <LogIn className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-gray-300 font-sans">Authenticated cloud profile required for data sharding and persistence.</p>
                  </div>
                </div>

                {!user ? (
                  <button 
                    onClick={handleLogin}
                    disabled={isAuthLoading}
                    className="w-full py-4 bg-white text-black font-bold uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-gray-200 active:scale-95 transition-all rounded-sm text-xs"
                  >
                    {isAuthLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <LogIn className="w-5 h-5" />}
                    Initialize Personnel Link
                  </button>
                ) : (
                  <button 
                    onClick={verifyAge}
                    className="w-full py-4 bg-emerald-600 text-app-bg font-bold uppercase tracking-widest hover:bg-emerald-500 active:scale-95 transition-all shadow-[0_0_40px_rgba(16,185,129,0.2)] rounded-sm text-xs"
                  >
                    Confirm Adult Identity (18+)
                  </button>
                )}
                
                <div className="flex flex-col gap-1 items-center">
                  <p className="text-[9px] text-gray-500 uppercase tracking-widest font-mono">
                    {user ? `Identified: ${user.email}` : 'Waiting for secure handshake...'}
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mission Briefing Overlay */}
      <AnimatePresence>
        {showMissionBrief && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[90] bg-app-void/90 backdrop-blur-md flex items-center justify-center p-6 overflow-y-auto"
          >
            <div className="max-w-xl w-full bg-app-surface border border-app-line rounded-lg overflow-hidden shadow-2xl">
              <div className="p-8 border-b border-app-line bg-app-bg/50">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-sm">
                    <Info className="w-5 h-5 text-emerald-500" />
                  </div>
                  <div>
                    <h3 className="text-xl font-serif italic text-white tracking-tight leading-none">Mission Directives</h3>
                    <p className="text-[10px] font-mono text-gray-500 uppercase tracking-widest mt-1">Status: Unread Protocol</p>
                  </div>
                </div>
              </div>

              <div className="p-8 space-y-8">
                <section>
                  <h4 className="text-[9px] uppercase font-bold tracking-widest text-emerald-500/60 mb-3 font-mono border-b border-app-line pb-1 w-fit">Primary Objective</h4>
                  <p className="text-xs text-gray-400 leading-relaxed font-sans">
                    Catalog regional biodiversity with extreme precision. Data sharded in this session aids conservation agencies in identifying quarantine hazards and migratory shifts.
                  </p>
                </section>

                <section>
                  <h4 className="text-[9px] uppercase font-bold tracking-widest text-amber-500/60 mb-3 font-mono border-b border-app-line pb-1 w-fit">Safety Protocols</h4>
                  <ul className="space-y-4">
                    <li className="flex gap-4 text-xs text-gray-400">
                      <span className="text-emerald-500 font-mono font-bold shrink-0">[PR-01]</span>
                      <span>Maintain safe distance from unidentified species. Do not disrupt local biomes.</span>
                    </li>
                    <li className="flex gap-4 text-xs text-gray-400">
                      <span className="text-emerald-500 font-mono font-bold shrink-0">[PR-02]</span>
                      <span>Rare species locations are obfuscated to prevent poaching and unauthorized tracking.</span>
                    </li>
                    <li className="flex gap-4 text-xs text-gray-400">
                      <span className="text-emerald-500 font-mono font-bold shrink-0">[PR-03]</span>
                      <span>Respect all regional exclusion zones and private territorial markers.</span>
                    </li>
                  </ul>
                </section>

                <button 
                  onClick={() => setShowMissionBrief(false)}
                  className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-app-bg font-bold tracking-[0.2em] uppercase text-[10px] transition-all rounded-sm mt-4 shadow-[0_0_20px_rgba(16,185,129,0.1)]"
                >
                  Confirm Awareness & Initialize
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
          {user ? (
            <div className="flex items-center gap-6">
              <div className="flex flex-col items-end">
                <span className="text-[10px] text-gray-400 uppercase tracking-widest leading-none mb-1">Field Operator</span>
                <span className="text-xs font-mono leading-none">{user.displayName || 'Anonymous'}</span>
                <span className="text-[8px] text-emerald-500/60 font-mono uppercase leading-none mt-1">ID: {user.uid.slice(0, 10)}</span>
              </div>
              <div className="h-8 w-px bg-app-line"></div>
              <button 
                onClick={() => auth.signOut()}
                className="p-2 hover:bg-red-500/10 rounded-full transition-colors group"
                title="Deactivate Session"
              >
                <Activity className="w-5 h-5 text-gray-500 group-hover:text-red-500" />
              </button>
            </div>
          ) : (
            <button 
              onClick={handleLogin}
              className="text-xs uppercase font-bold tracking-widest text-gray-400 hover:text-white transition-colors py-2 px-4 border border-app-line rounded hover:bg-white/5"
            >
              Sync Device
            </button>
          )}
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
              {/* Map View Section */}
              <section className="flex-1 bg-app-void relative overflow-hidden group">
                {/* Stylized Grid Map Background */}
                <div className="absolute inset-0 pattern-grid opacity-20"></div>
                <div className="absolute inset-0 bg-radial-at-center from-emerald-950/20 via-transparent to-transparent"></div>
                
                {/* Simulated Radar / Map UI */}
                <div className="absolute top-6 left-6 space-y-4">
                  <div className="bg-app-surface/60 backdrop-blur-md border border-app-line p-4 rounded-sm">
                    <h3 className="text-[10px] font-mono uppercase tracking-[0.2em] text-gray-400 mb-3 flex items-center gap-2">
                       <MapPin className="w-3 h-3 text-emerald-500" />
                       Operator Coordinates
                    </h3>
                    {coords ? (
                      <div className="space-y-1">
                        <p className="text-xs font-mono text-emerald-400">LAT: {coords.lat.toFixed(6)}</p>
                        <p className="text-xs font-mono text-emerald-400">LON: {coords.lng.toFixed(6)}</p>
                      </div>
                    ) : (
                      <p className="text-xs font-mono text-amber-500 animate-pulse uppercase">Searching Sat_Link...</p>
                    )}
                  </div>

                  <div className="bg-app-surface/60 backdrop-blur-md border border-app-line p-3 rounded-sm flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></div>
                    <span className="text-[9px] font-mono uppercase tracking-widest text-emerald-500">Mesh Sync: Active</span>
                  </div>
                </div>

                {/* Map Markers (Simulated) */}
                <div className="absolute inset-0 flex items-center justify-center">
                   {/* Center Point */}
                   <div className="relative">
                      <div className="w-4 h-4 bg-emerald-500/20 border border-emerald-500 rounded-full animate-pulse shadow-[0_0_20px_rgba(16,185,129,0.4)]"></div>
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 border border-emerald-500/10 rounded-full"></div>
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 border border-emerald-500/5 rounded-full"></div>
                   </div>

                   {/* Mission Hotspots */}
                   {missions.map((mission, idx) => (
                      <motion.div
                        key={mission.id}
                        initial={{ opacity: 0, scale: 0 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.5 + idx * 0.2 }}
                        className="absolute"
                        style={{
                          top: `${40 + (idx * 20)}%`,
                          left: `${30 + (idx * 30)}%`
                        }}
                      >
                         <div className="group relative">
                            <div className={cn(
                              "w-3 h-3 rounded-full animate-pulse",
                              mission.priority === 'High' ? "bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.5)]" : "bg-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.5)]"
                            )}></div>
                            <div className="absolute left-6 top-1/2 -translate-y-1/2 w-48 opacity-0 group-hover:opacity-100 transition-all pointer-events-none">
                               <div className="bg-app-surface border border-app-line p-3 rounded shadow-2xl">
                                  <p className="text-[9px] font-mono text-emerald-500 uppercase tracking-widest mb-1">{mission.category} // {mission.priority}</p>
                                  <h4 className="text-xs font-bold text-white uppercase">{mission.title}</h4>
                               </div>
                            </div>
                         </div>
                      </motion.div>
                   ))}
                </div>

                <div className="absolute bottom-6 left-6 right-6 flex justify-between items-end">
                   <div className="max-w-xs space-y-2">
                      <h2 className="text-2xl font-serif italic text-white leading-tight">Sector Briefing</h2>
                      <p className="text-[11px] text-gray-500 leading-relaxed uppercase tracking-wider font-mono">
                         Algorithm has sharded local biodiversity gaps. Red pulses indicate priority field missions for regional scientific stabilization.
                      </p>
                   </div>
                   <div className="flex gap-2">
                      <button className="p-3 bg-app-surface border border-app-line rounded hover:bg-white/5 transition-all">
                        <Layers className="w-5 h-5 text-gray-400" />
                      </button>
                      <button className="p-3 bg-app-surface border border-app-line rounded hover:bg-white/5 transition-all">
                        <Navigation className="w-5 h-5 text-gray-400" />
                      </button>
                   </div>
                </div>
              </section>

              {/* Mission Sidebar */}
              <aside className="w-full lg:w-96 bg-app-surface border-l border-app-line flex flex-col p-8 overflow-y-auto custom-scrollbar">
                <header className="mb-8">
                  <h3 className="text-[10px] font-mono uppercase tracking-[0.3em] text-gray-500 mb-6 border-b border-app-line pb-2">Mesh Directives</h3>
                  <div className="p-4 bg-emerald-500/5 border border-emerald-500/20 rounded mb-4">
                    <p className="text-[11px] text-emerald-500 leading-relaxed font-sans">
                      <span className="font-bold block mb-1">LOCAL PROBLEM DETECTED:</span>
                      Increasing reports of Invasive Emerald Ash Borer in your 5km radius. 
                      Cataloging Fraxinus species is highly encouraged today.
                    </p>
                  </div>
                </header>

                <div className="space-y-4">
                  <h4 className="text-[9px] font-mono uppercase tracking-widest text-gray-500 mb-2">Available Missions</h4>
                  {missions.map(mission => (
                    <button 
                      key={mission.id}
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

                <div className="mt-auto pt-8 border-t border-app-line">
                   <div className="text-center">
                      <p className="text-[10px] font-mono text-gray-500 uppercase tracking-widest mb-4">Science Ledger Progress</p>
                      <div className="h-1 bg-app-void rounded-full overflow-hidden mb-2">
                        <div className="h-full w-2/3 bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]"></div>
                      </div>
                      <div className="flex justify-between text-[8px] font-mono text-gray-600 uppercase tracking-widest">
                        <span>Lvl 12 Technician</span>
                        <span>840 / 1200 DP</span>
                      </div>
                   </div>
                </div>
              </aside>
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
                    <p className="text-xs text-gray-500 max-w-xs font-mono uppercase tracking-wider">
                      Execute capture sequence to populate database with identified specimens.
                    </p>
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
            onClick={() => setActiveTab('dex')}
            className={cn(
              "flex flex-col items-center gap-1 transition-all",
              activeTab === 'dex' ? "text-emerald-500" : "text-gray-500 hover:text-white"
            )}
          >
            <Book className="w-5 h-5 border-transparent transition-all" />
            <span className="text-[8px] uppercase font-bold tracking-[0.2em]">Index</span>
          </button>

          <div className="relative">
            <input 
              type="file" 
              accept="image/*" 
              onChange={handleCapture}
              className="absolute inset-0 opacity-0 cursor-pointer z-10"
            />
            <button className="relative w-12 h-12 -mt-10 rounded bg-emerald-600 text-app-bg flex items-center justify-center shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:scale-105 active:scale-95 transition-all">
              <Camera className="w-6 h-6" />
            </button>
          </div>

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
