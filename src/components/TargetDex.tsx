import { useMemo, useState } from 'react';
import { Camera, Leaf, PawPrint, Bug, Circle } from 'lucide-react';
import { cn } from '../lib/utils';
import { CollectionEntry } from '../types';
import { TargetSpecies } from '../services/gbifService';

interface TargetDexProps {
  targets: TargetSpecies[];
  inventory: CollectionEntry[];
  isLoading: boolean;
  regionLabel: string;
  onCapture: () => void;
}

type Filter = 'all' | 'Flora' | 'Fauna' | 'Fungi';

const ICONS = {
  Flora: Leaf,
  Fauna: PawPrint,
  Fungi: Circle,
  Invertebrate: Bug,
};

export default function TargetDex({ targets, inventory, isLoading, regionLabel, onCapture }: TargetDexProps) {
  const [filter, setFilter] = useState<Filter>('all');

  const capturedNames = useMemo(
    () => new Set(inventory.map(e => e.species.scientificName.toLowerCase())),
    [inventory]
  );

  const filtered = useMemo(
    () => targets.filter(t => filter === 'all' || t.category === filter),
    [targets, filter]
  );

  const progress = useMemo(() => {
    const total = targets.length;
    const caught = targets.filter(t => capturedNames.has(t.scientificName.toLowerCase())).length;
    return { total, caught, pct: total ? caught / total : 0 };
  }, [targets, capturedNames]);

  return (
    <div className="h-full overflow-y-auto custom-scrollbar p-6 md:p-10 bg-app-bg">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-app-line pb-4">
          <div>
            <h2 className="text-sm font-mono uppercase tracking-[0.3em] text-gray-500">Field Targets · Bioregion</h2>
            <p className="text-2xl font-serif italic text-white tracking-tight mt-1">{regionLabel || 'Locating…'}</p>
            <p className="text-[11px] text-gray-500 mt-1">
              Top documented flora, fauna, and fungi within 25 km. Capture each to calibrate local biodiversity.
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-mono uppercase text-gray-500">Catalog Progress</p>
            <p className="text-2xl font-bold text-emerald-400 font-mono">
              {progress.caught} / {progress.total}
            </p>
            <div className="w-48 h-1 bg-app-line rounded mt-2 overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-all"
                style={{ width: `${Math.round(progress.pct * 100)}%` }}
              />
            </div>
          </div>
        </header>

        <div className="flex items-center gap-2 flex-wrap">
          {(['all', 'Flora', 'Fauna', 'Fungi'] as Filter[]).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] rounded-sm border transition-all',
                filter === f
                  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40'
                  : 'bg-app-surface text-gray-500 border-app-line hover:text-white'
              )}
            >
              {f === 'all' ? 'All' : f}
            </button>
          ))}
          <button
            onClick={onCapture}
            className="ml-auto inline-flex items-center gap-2 px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-app-bg font-bold uppercase text-[10px] tracking-widest rounded-sm transition-all"
          >
            <Camera className="w-3.5 h-3.5" />
            Capture
          </button>
        </div>

        {isLoading && targets.length === 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="aspect-[3/4] rounded bg-app-surface border border-app-line animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-500 text-xs font-mono uppercase tracking-widest">
            No regional targets found. Try enabling precise location.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {filtered.map(t => {
              const caught = capturedNames.has(t.scientificName.toLowerCase());
              const Icon = ICONS[t.category] || Circle;
              return (
                <div
                  key={t.taxonKey}
                  className={cn(
                    'relative aspect-[3/4] rounded overflow-hidden border transition-all',
                    caught
                      ? 'border-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.15)]'
                      : 'border-app-line bg-app-surface'
                  )}
                  title={`${t.commonName} · ${t.scientificName}`}
                >
                  {t.imageUrl ? (
                    <img
                      src={t.imageUrl}
                      alt={t.commonName}
                      className={cn(
                        'w-full h-full object-cover transition-all',
                        caught ? '' : 'grayscale brightness-[0.35] contrast-150'
                      )}
                    />
                  ) : (
                    <div className="w-full h-full bg-app-void flex items-center justify-center">
                      <Icon className={cn('w-10 h-10', caught ? 'text-emerald-400' : 'text-gray-700')} />
                    </div>
                  )}
                  <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-app-bg to-transparent">
                    <p className="text-[9px] font-mono uppercase text-emerald-500 tracking-tight">
                      {caught ? 'Captured' : '???'}
                    </p>
                    <p className={cn('text-[11px] font-bold truncate', caught ? 'text-white' : 'text-gray-400')}>
                      {caught ? t.commonName : '—'}
                    </p>
                    <p className="text-[9px] italic text-gray-500 truncate">
                      {caught ? t.scientificName : '—'}
                    </p>
                  </div>
                  {t.conservationStatus !== 'Unknown' && t.conservationStatus !== 'Least Concern' && (
                    <div className="absolute top-1.5 right-1.5">
                      <span className="px-1.5 py-0.5 bg-red-500/90 text-white text-[8px] font-bold uppercase tracking-widest rounded-sm">
                        {t.conservationStatus === 'Critically Endangered' ? 'CR' : t.conservationStatus === 'Endangered' ? 'EN' : 'VU'}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
