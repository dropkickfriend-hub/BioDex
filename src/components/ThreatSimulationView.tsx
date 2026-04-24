import { CounterStrategy, SimulationResult } from '../services/threatSimulation';

interface ThreatSimulationViewProps {
  simulation: SimulationResult;
  onStrategyChange?: (strategy: CounterStrategy) => void;
  nativeDensity?: number;
}

export default function ThreatSimulationView({ simulation, onStrategyChange, nativeDensity }: ThreatSimulationViewProps) {
  const { threat, baseline, withIntervention, recommendedStrategy, soilSuitability } = simulation;
  const maxYear = baseline[baseline.length - 1].year;

  const baselineAt50 = baseline.find(p => p.year === 50) || baseline[baseline.length - 1];
  const interventionAt50 = withIntervention.find(p => p.year === 50) || withIntervention[withIntervention.length - 1];
  const baselineAt100 = baseline[baseline.length - 1];

  const chartWidth = 280;
  const chartHeight = 100;
  const padding = 4;

  const toX = (year: number) => padding + (year / maxYear) * (chartWidth - padding * 2);
  const toY = (val: number) => chartHeight - padding - val * (chartHeight - padding * 2);

  const baselinePath = baseline
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(p.year)} ${toY(p.invaderCoverage)}`)
    .join(' ');

  const interventionPath = withIntervention
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(p.year)} ${toY(p.invaderCoverage)}`)
    .join(' ');

  const nativePath = baseline
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(p.year)} ${toY(p.nativeBiomass)}`)
    .join(' ');

  return (
    <div className="p-3 bg-red-900/10 border border-red-500/20 rounded space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[9px] font-mono uppercase text-red-500">Threat Projection</p>
          <p className="text-xs font-bold text-white mt-0.5">{threat.name}</p>
          <p className="text-[9px] italic text-gray-400">{threat.scientificName}</p>
        </div>
        <div className="text-right">
          <p className="text-[8px] font-mono uppercase text-gray-500">Soil Suitability</p>
          <p className={`text-xs font-bold ${soilSuitability > 0.7 ? 'text-red-400' : soilSuitability > 0.4 ? 'text-amber-400' : 'text-emerald-400'}`}>
            {Math.round(soilSuitability * 100)}%
          </p>
          {nativeDensity !== undefined && (
            <>
              <p className="text-[8px] font-mono uppercase text-gray-500 mt-1">Native Density</p>
              <p className="text-xs font-bold text-emerald-400">{Math.round(nativeDensity * 100)}%</p>
            </>
          )}
        </div>
      </div>

      <p className="text-[9px] text-gray-400 leading-relaxed">{threat.description}</p>

      <div className="bg-app-bg rounded p-2">
        <div className="flex items-center justify-between mb-1 text-[8px] font-mono uppercase text-gray-500">
          <span>Coverage over 100 years</span>
          <div className="flex gap-3">
            <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-red-500"></span>No action</span>
            <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-emerald-500"></span>Intervention</span>
          </div>
        </div>
        <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-auto">
          {[0.25, 0.5, 0.75].map(v => (
            <line
              key={v}
              x1={padding}
              y1={toY(v)}
              x2={chartWidth - padding}
              y2={toY(v)}
              stroke="#2D333B"
              strokeWidth="0.5"
              strokeDasharray="2 2"
            />
          ))}
          <path d={nativePath} stroke="#10B981" strokeWidth="1" fill="none" strokeDasharray="3 2" opacity="0.4" />
          <path d={baselinePath} stroke="#EF4444" strokeWidth="1.5" fill="none" />
          <path d={interventionPath} stroke="#10B981" strokeWidth="1.5" fill="none" />
          <text x={padding} y={chartHeight - 1} fill="#6B7280" fontSize="6" fontFamily="monospace">0y</text>
          <text x={toX(50) - 4} y={chartHeight - 1} fill="#6B7280" fontSize="6" fontFamily="monospace">50y</text>
          <text x={chartWidth - 14} y={chartHeight - 1} fill="#6B7280" fontSize="6" fontFamily="monospace">100y</text>
        </svg>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="p-2 bg-app-bg rounded">
          <p className="text-[8px] font-mono uppercase text-gray-500">@50y Baseline</p>
          <p className="text-xs font-bold text-red-400">{Math.round(baselineAt50.invaderCoverage * 100)}%</p>
        </div>
        <div className="p-2 bg-app-bg rounded">
          <p className="text-[8px] font-mono uppercase text-gray-500">@50y Treated</p>
          <p className="text-xs font-bold text-emerald-400">{Math.round(interventionAt50.invaderCoverage * 100)}%</p>
        </div>
        <div className="p-2 bg-app-bg rounded">
          <p className="text-[8px] font-mono uppercase text-gray-500">Spread @100y</p>
          <p className="text-xs font-bold text-amber-400">{Math.round(baselineAt100.spreadRadiusKm)}km</p>
        </div>
      </div>

      <div className="p-2 bg-emerald-500/5 border border-emerald-500/20 rounded">
        <div className="flex items-center justify-between mb-2 gap-2">
          <p className="text-[9px] font-mono uppercase text-emerald-500">Counter-Strategy Testbed</p>
          {threat.counterStrategies.length > 1 && onStrategyChange && (
            <select
              value={recommendedStrategy.name}
              onChange={(e) => {
                const next = threat.counterStrategies.find(s => s.name === e.target.value);
                if (next) onStrategyChange(next);
              }}
              className="bg-app-bg border border-app-line text-[9px] text-emerald-300 rounded-sm px-2 py-0.5 font-mono uppercase tracking-wider focus:outline-none focus:border-emerald-500"
            >
              {threat.counterStrategies.map(s => (
                <option key={s.name} value={s.name}>{s.name}</option>
              ))}
            </select>
          )}
        </div>
        <p className="text-xs font-bold text-white">{recommendedStrategy.name}</p>
        <p className="text-[9px] italic text-gray-400 mb-1">{recommendedStrategy.scientificName}</p>
        <p className="text-[9px] text-gray-300 leading-relaxed mb-2">{recommendedStrategy.mechanism}</p>
        <div className="flex justify-between text-[8px] font-mono uppercase text-gray-500">
          <span>Type: <span className="text-emerald-400">{recommendedStrategy.type}</span></span>
          <span>Effective: <span className="text-emerald-400">{Math.round(recommendedStrategy.effectiveness * 100)}%</span></span>
          <span>Est: <span className="text-emerald-400">{recommendedStrategy.establishmentYears}y</span></span>
        </div>
      </div>
    </div>
  );
}
