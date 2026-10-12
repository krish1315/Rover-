import React, { useState } from 'react';
import Header from './components/Header';
import MissionHistoryPopover from './components/MissionHistoryPopover';
import HistoricalMissionView from './components/HistoricalMissionView';
import SensorOverviewRow from './components/SensorOverviewRow';
import CameraFeed from './components/CameraFeed';
import HumanDetectionResult from './components/HumanDetectionResult';
import DetectionTimeline from './components/DetectionTimeline';
import BackgroundVideo from './components/BackgroundVideo';
import { useTelemetry } from './hooks/useTelemetry';
import { MOCK_MISSIONS } from './data/mockData';

export default function App() {
  const { telemetry, setScenario, setMode } = useTelemetry();
  const [activeMission, setActiveMission] = useState(MOCK_MISSIONS[0]);
  const [isViewingHistorical, setIsViewingHistorical] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [missionNotification, setMissionNotification] = useState(null);

  const handleSelectMission = (mission) => {
    setActiveMission(mission);
    const isPast = mission.status === 'COMPLETED';
    setIsViewingHistorical(isPast);

    setMissionNotification(
      isPast 
        ? `Loaded archive: ${mission.code} (${mission.name}) [Historical View]`
        : `Switched to active deployment: ${mission.code} (${mission.name})`
    );

    setTimeout(() => {
      setMissionNotification(null);
    }, 4500);
  };

  const handleReturnToLive = () => {
    setActiveMission(MOCK_MISSIONS[0]);
    setIsViewingHistorical(false);
    setMissionNotification(`Returned to Live Mission: ${MOCK_MISSIONS[0].code} (${MOCK_MISSIONS[0].name})`);
    setTimeout(() => {
      setMissionNotification(null);
    }, 3500);
  };

  return (
    <div className="min-h-screen text-[#e2e8f0] font-sans antialiased relative selection:bg-zinc-700 selection:text-white">
      
      {/* Animated Gradient Video Background & Charcoal Depth Overlay */}
      <BackgroundVideo />

      {/* Main Dashboard Container */}
      <div className="relative z-10 max-w-[1560px] mx-auto px-3 sm:px-4 lg:px-5 py-3">
        
        {/* Top Header */}
        <Header 
          telemetry={telemetry}
          onSelectScenario={setScenario}
          onToggleMode={(mode) => setMode(mode)}
          activeMission={activeMission}
          isViewingHistorical={isViewingHistorical}
          onReturnToLive={handleReturnToLive}
          onToggleHistory={() => setIsHistoryOpen(!isHistoryOpen)}
          isHistoryOpen={isHistoryOpen}
        />

        {/* Mission History Floating Popover */}
        <MissionHistoryPopover 
          isOpen={isHistoryOpen}
          onClose={() => setIsHistoryOpen(false)}
          activeMission={activeMission}
          onSelectMission={handleSelectMission}
        />

        {/* Notification Toast if switched */}
        {missionNotification && (
          <div className="mb-3.5 px-3.5 py-2 rounded-md charcoal-card border border-white/[0.08] text-xs flex items-center justify-between animate-in fade-in slide-in-from-top-1">
            <div className="flex items-center gap-2">
              <span className={`w-1.5 h-1.5 rounded-full ${isViewingHistorical ? 'bg-amber-400' : 'bg-emerald-400'}`}></span>
              <span className="text-zinc-200">{missionNotification}</span>
            </div>
            <button 
              onClick={() => setMissionNotification(null)}
              className="text-zinc-500 hover:text-zinc-300 text-xs ml-4"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Historical Mission View (Prominent Stored Record Inspection Mode) */}
        {isViewingHistorical ? (
          <HistoricalMissionView 
            mission={activeMission} 
            onReturnToLive={handleReturnToLive} 
          />
        ) : (
          /* Live Operational Dashboard View */
          <>
            {/* Sensor Overview Row (3 Cards: Thermal, mmWave, Gas) */}
            <SensorOverviewRow 
              thermal={telemetry.thermal}
              mmWave={telemetry.mmWave}
              gas={telemetry.gas}
            />

            {/* Main Content (Two Columns) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-stretch">
              
              {/* Left Column: Camera Feed */}
              <div className="lg:col-span-7 flex flex-col">
                <CameraFeed 
                  camera={telemetry.camera} 
                  yoloDetections={telemetry.yoloDetections}
                  isMock={telemetry.isMock}
                />
              </div>

              {/* Right Column: Multi-Modal Human Detection Fusion & Timeline */}
              <div className="lg:col-span-5 flex flex-col justify-between">
                <HumanDetectionResult fusion={telemetry.fusion} />
                <DetectionTimeline events={activeMission?.events || telemetry.timeline} />
              </div>

            </div>
          </>
        )}

        {/* Engineering System Status Bar */}
        <footer className="mt-4 pt-2.5 border-t border-white/[0.04] flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-zinc-500 font-sans">
          <div className="flex items-center gap-2">
            <span className={`w-1.5 h-1.5 rounded-full ${
              isViewingHistorical ? 'bg-amber-400' : (telemetry.system.systemStatus === 'OPTIMAL' ? 'bg-emerald-500' : 'bg-amber-400')
            }`}></span>
            <span className="text-zinc-400">ARES Rescue Rover Survivor Locator</span>
            <span className="text-zinc-700">•</span>
            <span>
              {isViewingHistorical ? `Archive Mode: ${activeMission.name}` : `Active Deployment: ${activeMission.name}`}
            </span>
          </div>
          <div className="flex items-center gap-3 font-mono text-[10px] text-zinc-500">
            <span>UPTIME 03:48:12</span>
            <span>LATENCY {telemetry.system.hardwareLatencyMs !== null ? `${telemetry.system.hardwareLatencyMs}MS` : '--'}</span>
            <span className="text-zinc-400">
              {isViewingHistorical ? 'ARCHIVE_PLAYBACK' : (telemetry.mode === 'LIVE' ? 'FASTAPI_WS_ONLINE' : 'LOCAL_MOCK')}
            </span>
          </div>
        </footer>

      </div>
    </div>
  );
}
