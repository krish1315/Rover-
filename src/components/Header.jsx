import React, { useState, useRef, useEffect } from 'react';
import { 
  ShieldAlert, 
  Battery, 
  History, 
  ChevronDown, 
  Layers, 
  Radio, 
  Clock,
  Server
} from 'lucide-react';

export default function Header({ 
  telemetry, 
  onSelectScenario, 
  onToggleMode,
  activeMission, 
  isViewingHistorical = false,
  onReturnToLive,
  onToggleHistory, 
  isHistoryOpen 
}) {
  const [isScenarioDropdownOpen, setIsScenarioDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  const { 
    system, 
    mode, 
    backendStatus, 
    isMock, 
    scenarioId, 
    scenarioLabel, 
    telemetryAgeSeconds,
    lastReceivedSeq 
  } = telemetry;

  const isBackendConnected = backendStatus === 'CONNECTED';
  const isBackendReconnecting = backendStatus === 'RECONNECTING';
  const isRoverConnected = system.roverConnection === 'CONNECTED';
  const isCameraStreaming = system.cameraConnection === 'STREAMING';

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsScenarioDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="charcoal-card sticky top-0 z-30 px-3.5 sm:px-5 py-2.5 rounded-lg border border-white/[0.07] backdrop-blur-md mb-3.5">
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        
        {/* Left: Brand, Callsign, Mode Badge & Backend Link */}
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-md bg-zinc-900 border border-white/10 text-zinc-300 shrink-0">
            <ShieldAlert className="w-4 h-4 text-emerald-400" />
          </div>
          
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm tracking-tight text-zinc-100">
                Rescue Rover
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-zinc-800/90 text-zinc-400 border border-white/5">
                {system.roverId}
              </span>

              {/* Mode Badge: Live Backend Stream vs Mock Data */}
              {isMock ? (
                <span className="text-[9px] font-mono font-semibold px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 tracking-wider">
                  MOCK DATA
                </span>
              ) : (
                <span className="text-[9px] font-mono font-semibold px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 tracking-wider flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                  LIVE STREAM
                </span>
              )}
            </div>
            <p className="text-[11px] text-zinc-400 font-normal">
              AI Disaster Response Telemetry Console
            </p>
          </div>
        </div>

        {/* Middle: Connectivity Strip (Distinguishing Backend, Rover, and Camera Links) */}
        <div className="flex flex-wrap items-center justify-between sm:justify-center gap-3 sm:gap-4 py-1 px-3 rounded-md bg-black/25 border border-white/[0.04] text-xs">
          
          {/* 1. FastAPI Backend Link */}
          <div className="flex items-center gap-1.5" title="FastAPI REST & WebSocket Service link">
            <Server className="w-3.5 h-3.5 text-zinc-500" />
            <span className="text-zinc-400 text-xs">Backend:</span>
            <div className="flex items-center gap-1">
              <span className={`w-1.5 h-1.5 rounded-full ${
                isBackendConnected 
                  ? 'bg-emerald-500' 
                  : isBackendReconnecting 
                    ? 'bg-amber-400 animate-pulse' 
                    : 'bg-rose-500'
              }`} />
              <span className={`font-medium text-xs ${
                isBackendConnected ? 'text-zinc-200' : isBackendReconnecting ? 'text-amber-400' : 'text-rose-400'
              }`}>
                {isBackendConnected ? 'Connected' : isBackendReconnecting ? 'Reconnecting' : 'Offline'}
              </span>
            </div>
          </div>

          <span className="hidden sm:inline-block text-zinc-800">|</span>

          {/* 2. Rover Hardware Link */}
          <div className="flex items-center gap-1.5" title="Rover on-board computer link">
            <Radio className="w-3.5 h-3.5 text-zinc-500" />
            <span className="text-zinc-400 text-xs">Rover:</span>
            <span className="text-zinc-200 font-medium text-xs">
              {isRoverConnected ? 'Online' : system.roverConnection === 'STALE' ? 'Stale' : 'Offline'}
            </span>
          </div>

          <span className="hidden sm:inline-block text-zinc-800">|</span>

          {/* 3. Camera Stream Link */}
          <div className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${
              isCameraStreaming ? 'bg-violet-400' : 'bg-zinc-600'
            }`} />
            <span className="text-zinc-400 text-xs">Camera:</span>
            <span className="text-zinc-200 font-medium text-xs">
              {isCameraStreaming ? 'Streaming' : 'Offline'}
            </span>
          </div>

          <span className="hidden md:inline-block text-zinc-800">|</span>

          {/* 4. Telemetry Age & Sequence Number */}
          <div className="hidden md:flex items-center gap-3 text-zinc-400 text-xs font-mono">
            <div className="flex items-center gap-1" title="Age of latest received telemetry frame">
              <Clock className="w-3 h-3 text-zinc-500" />
              <span>
                {telemetryAgeSeconds !== null ? `Age: ${telemetryAgeSeconds}s` : 'Age: --'}
              </span>
            </div>
            {lastReceivedSeq !== null && (
              <span className="text-zinc-500">#{lastReceivedSeq}</span>
            )}
            <div className="flex items-center gap-1.5 text-zinc-300">
              <Battery className="w-3.5 h-3.5 text-zinc-400" />
              <span className="tabular-numbers">
                {system.batteryLevel !== null ? `${system.batteryLevel}%` : '--'}
              </span>
            </div>
          </div>
        </div>

        {/* Right: Mode & Scenario Controls */}
        <div className="flex items-center justify-end gap-2">
          
          {/* Mode Switcher / Scenario Dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setIsScenarioDropdownOpen(!isScenarioDropdownOpen)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-sans border border-white/[0.08] bg-zinc-900/90 text-zinc-300 hover:bg-zinc-800 transition-colors"
              title="Switch between Live FastAPI stream and Mock Scenarios"
            >
              <Layers className="w-3.5 h-3.5 text-zinc-400" />
              <span className="text-[11px] max-w-[140px] truncate">{scenarioLabel}</span>
              <ChevronDown className="w-3 h-3 text-zinc-500" />
            </button>

            {/* Dropdown Menu */}
            {isScenarioDropdownOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-64 rounded-md charcoal-card border border-white/10 shadow-xl z-50 p-1 divide-y divide-white/[0.04]">
                <div className="px-2 py-1.5 text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                  Data Stream Mode
                </div>
                
                {/* Live Backend Option */}
                <div className="py-1">
                  <button
                    onClick={() => { onToggleMode('LIVE'); setIsScenarioDropdownOpen(false); }}
                    className={`w-full text-left px-2.5 py-1.5 rounded text-xs transition-colors flex items-center justify-between ${
                      mode === 'LIVE' ? 'bg-white/10 text-white font-medium' : 'text-zinc-300 hover:bg-white/5'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <Server className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Live Backend (FastAPI)</span>
                    </div>
                    <span className={`w-1.5 h-1.5 rounded-full ${isBackendConnected ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                  </button>
                </div>

                {/* Local Mock Scenarios */}
                <div className="py-1">
                  <div className="px-2 py-1 text-[9px] font-mono uppercase tracking-wider text-zinc-500">
                    Offline Mock Scenarios
                  </div>
                  <button
                    onClick={() => { onSelectScenario('DEMO_CONFIRMED'); setIsScenarioDropdownOpen(false); }}
                    className={`w-full text-left px-2.5 py-1.5 rounded text-xs transition-colors flex items-center justify-between ${
                      mode === 'MOCK' && scenarioId === 'DEMO_CONFIRMED' ? 'bg-white/10 text-white font-medium' : 'text-zinc-300 hover:bg-white/5'
                    }`}
                  >
                    <span>Demo: Human Confirmed</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  </button>
                  <button
                    onClick={() => { onSelectScenario('INSUFFICIENT_EVIDENCE'); setIsScenarioDropdownOpen(false); }}
                    className={`w-full text-left px-2.5 py-1.5 rounded text-xs transition-colors flex items-center justify-between ${
                      mode === 'MOCK' && scenarioId === 'INSUFFICIENT_EVIDENCE' ? 'bg-white/10 text-white font-medium' : 'text-zinc-300 hover:bg-white/5'
                    }`}
                  >
                    <span>State: Insufficient Evidence</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                  </button>
                  <button
                    onClick={() => { onSelectScenario('STALE_DATA'); setIsScenarioDropdownOpen(false); }}
                    className={`w-full text-left px-2.5 py-1.5 rounded text-xs transition-colors flex items-center justify-between ${
                      mode === 'MOCK' && scenarioId === 'STALE_DATA' ? 'bg-white/10 text-white font-medium' : 'text-zinc-300 hover:bg-white/5'
                    }`}
                  >
                    <span>State: Stale Telemetry</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                  </button>
                  <button
                    onClick={() => { onSelectScenario('DISCONNECTED'); setIsScenarioDropdownOpen(false); }}
                    className={`w-full text-left px-2.5 py-1.5 rounded text-xs transition-colors flex items-center justify-between ${
                      mode === 'MOCK' && scenarioId === 'DISCONNECTED' ? 'bg-white/10 text-white font-medium' : 'text-zinc-300 hover:bg-white/5'
                    }`}
                  >
                    <span>State: Hardware Offline</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-600"></span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Obvious Return to Live Button if in Historical Mode */}
          {isViewingHistorical && (
            <button
              onClick={onReturnToLive}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-sans bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-medium transition-colors shadow-sm"
              title="Return to active live mission"
            >
              <Radio className="w-3.5 h-3.5 text-zinc-950 animate-pulse" />
              <span>Live Mission</span>
            </button>
          )}

          {/* Missions History Trigger */}
          <button
            id="mission-history-btn"
            onClick={onToggleHistory}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors border ${
              isHistoryOpen 
                ? 'bg-zinc-800 text-white border-white/20' 
                : isViewingHistorical
                  ? 'bg-amber-950/40 text-amber-300 border-amber-500/30'
                  : 'bg-zinc-900/90 text-zinc-300 border-white/[0.08] hover:bg-zinc-800 hover:text-white'
            }`}
          >
            <History className="w-3.5 h-3.5 text-zinc-400" />
            <span>Missions</span>
            <span className="text-[10px] font-mono px-1 rounded bg-zinc-800 text-zinc-400 border border-white/5">
              {activeMission?.code?.split('-')[2] || '09'}
            </span>
          </button>

        </div>

      </div>
    </header>
  );
}
