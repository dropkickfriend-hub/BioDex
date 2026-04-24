import { RestorationPlan } from '../services/restorationPlanner';
import { Leaf } from 'lucide-react';

interface RestorationPlanViewProps {
  plan: RestorationPlan;
}

export default function RestorationPlanView({ plan }: RestorationPlanViewProps) {
  if (!plan.stages.length) return null;

  return (
    <div className="space-y-3">
      <div className="p-3 bg-gradient-to-r from-green-900/20 to-emerald-900/20 border border-green-500/30 rounded">
        <div className="flex items-start justify-between mb-2">
          <div>
            <p className="text-[9px] font-mono uppercase text-green-500">Restoration Plan</p>
            <p className="text-xs font-bold text-white mt-1">{plan.threatName} Recovery</p>
          </div>
          <div className="text-right">
            <p className="text-[8px] font-mono uppercase text-gray-500">Success</p>
            <p className="text-xs font-bold text-green-400">{Math.round(plan.estimatedSuccess * 100)}%</p>
          </div>
        </div>
        <p className="text-[9px] text-gray-300">
          {plan.totalSpecies} species across {plan.years}-year timeline
        </p>
      </div>

      <div className="space-y-2">
        {plan.stages.map((stage, idx) => (
          <div key={idx} className="p-3 bg-app-bg border border-app-line rounded">
            <p className="text-[9px] font-mono uppercase text-emerald-500 mb-2">Year {stage.year}</p>
            <ul className="space-y-1 mb-2">
              {stage.actions.map((action, i) => (
                <li key={i} className="text-[8px] text-gray-300 flex gap-2">
                  <span className="text-emerald-500">•</span>
                  <span>{action}</span>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-1 mb-2">
              {stage.plants.slice(0, 3).map(plant => (
                <span key={plant.id} className="text-[7px] px-1.5 py-0.5 bg-app-subtle rounded border border-app-line text-gray-400">
                  {plant.commonName}
                </span>
              ))}
              {stage.plants.length > 3 && (
                <span className="text-[7px] px-1.5 py-0.5 bg-app-subtle rounded border border-app-line text-gray-500">
                  +{stage.plants.length - 3} more
                </span>
              )}
            </div>
            <div className="w-full bg-app-subtle rounded-full h-1 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-600 to-green-500"
                style={{ width: `${stage.targetCoverage * 100}%` }}
              />
            </div>
            <p className="text-[7px] text-gray-500 mt-1">Coverage: {Math.round(stage.targetCoverage * 100)}%</p>
          </div>
        ))}
      </div>

      <div className="p-3 bg-blue-900/10 border border-blue-500/20 rounded">
        <p className="text-[9px] font-mono uppercase text-blue-500 mb-2 flex items-center gap-1">
          <Leaf className="w-3 h-3" />
          Key Benefits
        </p>
        <ul className="space-y-1">
          {plan.keyBenefits.map((benefit, i) => (
            <li key={i} className="text-[8px] text-blue-300">{benefit}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
