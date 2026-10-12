import React from 'react';
import { 
  Calendar, 
  MapPin, 
  UserCheck, 
  Flame, 
  Wind, 
  Clock, 
  Radio
} from 'lucide-react';

export default function HistoricalMissionView({ mission, onReturnToLive }) {
  if (!mission) return null;

  const isCompleted = mission.status === 'COMPLETED';
  const summary = mission.sensorSummary || {
    maxThermalC: 37.2,
    minThermalC: 17.5,
    maxRadarDistanceM: 3.80,
    peakCoPpm: 8.5,
    airHazardSummary: mission.hazardsDetected || 'Stable',
    opticalDetectionsCount: 4,
  };

  return (
    <div className="space-y-3.5 mb-5 animate-in fade-in slide-in-from-top-1 duration-150">
      
      {/* Top Banner: Distinct Historical Mode & Return Trigger */}
      <div className="charcoal-card rounded-lg p-3 sm:p-4 border border-amber-500/30 bg-amber-950/15 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg">
        <div className="flex items-start sm:items-center gap-3">
          <div className="w-8 h-8 rounded-md bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0 mt-0.5 sm:mt-0">
            <Clock className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono uppercase font-bold tracking-wider px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                HISTORICAL ARCHIVE VIEW • READ-ONLY
              </span>
              <span className="text-xs font-mono text-zinc-400">
                {mission.code}
              </span>
            </div>
            <h2 className="text-sm sm:text-base font-semibold text-white tracking-tight mt-0.5">
              {mission.name}
            </h2>
          </div>
        </div>

        {/* Obvious Return to Live Dashboard Button */}
        <button
          onClick={onReturnToLive}
          className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium bg-emerald-500 hover:bg-emerald-400 text-zinc-950 shadow-md transition-all duration-150 shrink-0 font-sans cursor-pointer active:scale-95"
        >
          <Radio className="w-3.5 h-3.5 animate-pulse text-zinc-950" />
          <span>Return to Live Mission</span>
        </button>
      </div>

      {/* Historical Metadata & Stored Sensor Readings Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        
        {/* Card 1: Deployment Scope */}
        <div className="charcoal-card rounded-lg p-3.5 border border-white/[0.07] flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-zinc-400 mb-2">
            <span className="font-medium">Deployment Record</span>
            <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded border ${
              isCompleted ? 'bg-zinc-800 text-zinc-300 border-white/5' : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
            }`}>
              {mission.status}
            </span>
          </div>
          <div className="space-y-1.5 text-xs">
            <div className="flex items-center gap-1.5 text-zinc-200">
              <MapPin className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
              <span className="truncate">{mission.location}</span>
            </div>
            <div className="flex items-center gap-1.5 text-zinc-400 font-mono text-[11px]">
              <Calendar className="w-3 h-3 text-zinc-500 shrink-0" />
              <span>{mission.date} • {mission.startTime} {mission.endTime ? `- ${mission.endTime}` : ''}</span>
            </div>
          </div>
        </div>

        {/* Card 2: Survivor Tally */}
        <div className="charcoal-card rounded-lg p-3.5 border border-white/[0.07] flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-zinc-400 mb-1">
            <span className="font-medium">Survivors Located</span>
            <UserCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-emerald-400 tabular-numbers">
              {mission.survivorsFound}
            </span>
            <span className="text-xs text-zinc-400">verified persons</span>
          </div>
          <p className="text-[10px] text-zinc-500 mt-1">
            Extracted via rapid response triage
          </p>
        </div>

        {/* Card 3: Environmental Hazard Record */}
        <div className="charcoal-card rounded-lg p-3.5 border border-white/[0.07] flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-zinc-400 mb-1">
            <span className="font-medium">Site Atmospheric Record</span>
            <Wind className="w-4 h-4 text-zinc-400" />
          </div>
          <div className="text-xs font-mono text-zinc-200 truncate">
            Peak CO: <span className="text-orange-400 font-semibold">{summary.peakCoPpm} PPM</span>
          </div>
          <p className="text-[10px] text-zinc-400 truncate mt-1">
            {mission.hazardsDetected || summary.airHazardSummary}
          </p>
        </div>

        {/* Card 4: Multi-Modal Sensor Summary */}
        <div className="charcoal-card rounded-lg p-3.5 border border-white/[0.07] flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-zinc-400 mb-1">
            <span className="font-medium">Peak Sensor Readings</span>
            <Flame className="w-4 h-4 text-orange-400" />
          </div>
          <div className="text-xs font-mono text-zinc-200 flex items-center justify-between">
            <span>Thermal Peak:</span>
            <span className="text-orange-400 font-semibold">{summary.maxThermalC}°C</span>
          </div>
          <div className="text-[11px] font-mono text-zinc-400 flex items-center justify-between mt-0.5">
            <span>Max Radar Range:</span>
            <span className="text-sky-400">{summary.maxRadarDistanceM}m</span>
          </div>
        </div>

      </div>

      {/* Stored Chronological Event History */}
      <div className="charcoal-card rounded-lg p-4 border border-white/[0.07]">
        <div className="flex items-center justify-between pb-2 border-b border-white/[0.05] mb-2.5">
          <div className="flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-zinc-400" />
            <h4 className="text-xs font-medium text-zinc-200">
              Archived Mission Event Timeline ({mission.code})
            </h4>
          </div>
          <span className="text-[10px] font-mono text-zinc-500">
            {mission.events?.length || 0} LOGGED EVENTS
          </span>
        </div>

        <div className="space-y-1.5 max-h-[180px] overflow-y-auto pr-1">
          {mission.events && mission.events.length > 0 ? (
            mission.events.map((ev, idx) => {
              const isCrit = ev.severity === 'critical';
              const isWarn = ev.severity === 'warning';
              return (
                <div key={ev.id || idx} className="flex items-start gap-2.5 text-xs p-1.5 rounded bg-white/[0.02]">
                  <span className="font-mono text-zinc-500 text-[11px] shrink-0 pt-0.5 tabular-numbers">
                    {ev.time}
                  </span>
                  <div className="pt-1.5 shrink-0">
                    <span className={`block w-1.5 h-1.5 rounded-full ${
                      isCrit ? 'bg-emerald-400' : isWarn ? 'bg-amber-400' : 'bg-zinc-500'
                    }`} />
                  </div>
                  <span className={isCrit ? 'text-zinc-200 font-medium' : isWarn ? 'text-zinc-300' : 'text-zinc-400'}>
                    {ev.summary}
                  </span>
                </div>
              );
            })
          ) : (
            <div className="py-4 text-center text-xs text-zinc-500">
              No recorded events for this deployment archive.
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
