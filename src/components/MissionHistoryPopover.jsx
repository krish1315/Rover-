import React, { useRef, useEffect, useState } from 'react';
import { MapPin, Calendar, X, UserCheck, RefreshCw, AlertCircle, Clock } from 'lucide-react';
import { apiClient } from '../services/apiClient';
import { adaptBackendMission } from '../services/telemetryAdapter';
import { MOCK_MISSIONS } from '../data/mockData';

export default function MissionHistoryPopover({ 
  isOpen, 
  onClose, 
  activeMission, 
  onSelectMission,
}) {
  const popoverRef = useRef(null);
  const [missions, setMissions] = useState(MOCK_MISSIONS);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [dataSource, setDataSource] = useState('LOCAL'); // 'API' | 'LOCAL' | 'ERROR'

  // Fetch missions from REST endpoint on open
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    async function loadMissions() {
      setIsLoading(true);
      setError(null);
      try {
        const rawMissions = await apiClient.getMissions();
        if (isMounted && Array.isArray(rawMissions)) {
          const adapted = rawMissions.map(adaptBackendMission);
          setMissions(adapted);
          setDataSource('API');
        }
      } catch (err) {
        console.warn('[Missions] REST load failed, falling back to local dataset:', err);
        if (isMounted) {
          // If in live mode and API fails, show error with option to use cached
          setMissions(MOCK_MISSIONS);
          setDataSource('LOCAL_FALLBACK');
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    loadMissions();

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  // Handle selection with full detail retrieval
  const handleMissionClick = async (mission) => {
    try {
      // Retrieve actual stored details if backend is available
      const rawDetail = await apiClient.getMission(mission.id);
      const adapted = adaptBackendMission(rawDetail) || mission;
      onSelectMission(adapted);
    } catch {
      // If single mission fetch fails, pass the item directly
      onSelectMission(mission);
    }
    onClose();
  };

  // Close on Escape or click outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (
        popoverRef.current && 
        !popoverRef.current.contains(event.target) &&
        !event.target.closest('#mission-history-btn')
      ) {
        onClose();
      }
    }

    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div 
      ref={popoverRef}
      role="dialog"
      aria-modal="true"
      aria-label="Mission History Archive"
      className="absolute right-3 sm:right-4 lg:right-5 top-14 z-50 w-80 sm:w-96 rounded-lg charcoal-card border border-white/[0.08] shadow-2xl p-0 overflow-hidden backdrop-blur-md animate-in fade-in zoom-in-95 duration-100"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-white/[0.06] bg-black/40">
        <div className="flex items-center gap-2">
          <Calendar className="w-3.5 h-3.5 text-zinc-400" />
          <h3 className="text-xs font-medium text-zinc-200">
            Mission Archive
          </h3>
          <span className="text-[9px] font-mono px-1 rounded bg-zinc-800 text-zinc-400 border border-white/5">
            {dataSource === 'API' ? 'REST API' : 'MOCK ARCHIVE'}
          </span>
        </div>
        <button 
          onClick={onClose}
          className="text-zinc-400 hover:text-zinc-200 p-1 rounded hover:bg-white/5 transition-colors"
          aria-label="Close mission history"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Content list */}
      <div className="max-h-[360px] overflow-y-auto divide-y divide-white/[0.04]">
        {isLoading ? (
          <div className="py-12 flex flex-col items-center justify-center text-zinc-500 text-xs font-mono">
            <RefreshCw className="w-4 h-4 animate-spin mb-2 text-zinc-400" />
            <span>Retrieving stored records...</span>
          </div>
        ) : error ? (
          <div className="py-8 px-4 text-center">
            <AlertCircle className="w-6 h-6 text-rose-400 mx-auto mb-2" />
            <p className="text-xs text-zinc-300 font-medium mb-1">Failed to load mission archives</p>
            <p className="text-[11px] text-zinc-500 mb-3">{error}</p>
            <button
              onClick={() => setMissions(MOCK_MISSIONS)}
              className="px-2.5 py-1 text-xs rounded bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
            >
              Load Cached Records
            </button>
          </div>
        ) : !missions || missions.length === 0 ? (
          <div className="py-12 flex flex-col items-center justify-center text-zinc-500 text-xs text-center px-4">
            <Clock className="w-5 h-5 mb-2 text-zinc-600" />
            <p>No logged missions recorded.</p>
            <span className="text-[10px] text-zinc-600 mt-1">Stored deployment logs will appear here.</span>
          </div>
        ) : (
          missions.map((mission) => {
            const isActive = activeMission?.id === mission.id;
            const isCompleted = mission.status === 'COMPLETED';

            return (
              <div
                key={mission.id}
                tabIndex={0}
                role="button"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    handleMissionClick(mission);
                  }
                }}
                onClick={() => handleMissionClick(mission)}
                className={`p-3 transition-colors cursor-pointer group focus:outline-none focus:bg-white/[0.05] ${
                  isActive 
                    ? 'bg-white/[0.04] border-l-2 border-l-emerald-500' 
                    : 'hover:bg-white/[0.02]'
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium text-zinc-200 group-hover:text-white transition-colors">
                        {mission.name}
                      </span>
                      {isActive && (
                        <span className="text-[9px] px-1 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                          ACTIVE
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] font-mono text-zinc-500 block mt-0.5">
                      {mission.code} • {mission.date}
                    </span>
                  </div>

                  <span className={`text-[10px] px-1.5 py-0.2 rounded border font-mono ${
                    isCompleted
                      ? 'bg-zinc-800/80 text-zinc-400 border-white/5'
                      : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                  }`}>
                    {mission.status}
                  </span>
                </div>

                <div className="flex items-center gap-3 text-xs text-zinc-400 mt-1.5">
                  <div className="flex items-center gap-1 truncate max-w-[190px]">
                    <MapPin className="w-3 h-3 text-zinc-500 shrink-0" />
                    <span className="truncate text-[11px]">{mission.location}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 ml-auto text-emerald-400 text-[11px]">
                    <UserCheck className="w-3 h-3 text-emerald-500" />
                    <span className="font-mono">{mission.survivorsFound} found</span>
                  </div>
                </div>

                {/* Sensor summary teaser if available */}
                {mission.sensorSummary && (
                  <div className="mt-2 pt-1.5 border-t border-white/[0.03] flex items-center justify-between text-[10px] font-mono text-zinc-500">
                    <span>Peak Heat: {mission.sensorSummary.maxThermalC}°C</span>
                    <span>Radar: {mission.sensorSummary.maxRadarDistanceM}m</span>
                    <span>CO: {mission.sensorSummary.peakCoPpm} ppm</span>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Footer summary */}
      <div className="p-2 px-3.5 bg-black/40 border-t border-white/[0.06] flex items-center justify-between text-[11px] text-zinc-500">
        <span>Stored Deployments: {missions?.length || 0}</span>
        <span className="text-zinc-400 font-mono text-[10px]">Click to inspect</span>
      </div>
    </div>
  );
}
