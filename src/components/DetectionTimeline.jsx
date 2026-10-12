import React from 'react';
import { Clock } from 'lucide-react';

export default function DetectionTimeline({ events }) {
  return (
    <div className="charcoal-card rounded-lg p-3.5 border border-white/[0.07] mt-3.5">
      <div className="flex items-center justify-between pb-2 border-b border-white/[0.05] mb-2.5">
        <div className="flex items-center gap-2">
          <Clock className="w-3.5 h-3.5 text-zinc-400" />
          <h4 className="text-xs font-medium text-zinc-200 tracking-tight">
            Detection Timeline
          </h4>
        </div>
        <span className="text-[10px] font-mono text-zinc-500">1Hz Sync</span>
      </div>

      <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1">
        {events && events.length > 0 ? (
          events.map((event, idx) => {
            const isCritical = event.severity === 'critical';
            const isWarning = event.severity === 'warning';
            
            return (
              <div 
                key={event.id || idx}
                className="flex items-start gap-2.5 text-xs p-1.5 rounded transition-colors hover:bg-white/[0.02]"
              >
                {/* Timestamp */}
                <span className="text-zinc-500 font-mono text-[11px] pt-0.5 shrink-0 tabular-numbers">
                  {event.time}
                </span>

                {/* Status indicator dot */}
                <div className="pt-1.5 shrink-0">
                  <span className={`block w-1.5 h-1.5 rounded-full ${
                    isCritical 
                      ? 'bg-emerald-400' 
                      : isWarning 
                        ? 'bg-amber-400' 
                        : 'bg-zinc-500'
                  }`} />
                </div>

                {/* Summary text */}
                <div className="flex-1 leading-relaxed">
                  <span className={
                    isCritical 
                      ? 'text-zinc-200 font-medium' 
                      : isWarning 
                        ? 'text-zinc-300' 
                        : 'text-zinc-400'
                  }>
                    {event.summary}
                  </span>
                </div>
              </div>
            );
          })
        ) : (
          <div className="py-4 text-center text-xs text-zinc-500">
            No recent detection events.
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="mt-2 pt-2 border-t border-white/[0.04] flex items-center justify-between text-[11px] text-zinc-500">
        <span>Chronological Event Stream</span>
        <span className="text-zinc-400 font-mono text-[10px]">Active</span>
      </div>
    </div>
  );
}
