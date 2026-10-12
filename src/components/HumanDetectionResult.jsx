import React from 'react';
import { 
  Flame, 
  Radar, 
  Camera, 
  Fingerprint,
  ShieldQuestion
} from 'lucide-react';

function EvidenceStatusBadge({ status, available }) {
  if (!available || status === 'OFFLINE') {
    return (
      <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-zinc-800 text-zinc-500 border border-white/5">
        OFFLINE
      </span>
    );
  }
  if (status === 'STALE') {
    return (
      <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
        STALE
      </span>
    );
  }
  if (status === 'POSITIVE') {
    return (
      <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
        POSITIVE
      </span>
    );
  }
  return (
    <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-zinc-800 text-zinc-400 border border-white/5">
      CLEAR
    </span>
  );
}

export default function HumanDetectionResult({ fusion }) {
  if (!fusion) return null;

  const { state, overallConfidence, fusionAlgorithm, lastDetectionTimestamp, evidence, statusReason } = fusion;

  const isConfirmed = state === 'HUMAN_CONFIRMED';
  const isUncertain = state === 'UNCERTAIN';
  const isNoHuman = state === 'NO_HUMAN_DETECTED';
  const isInsufficient = state === 'INSUFFICIENT_EVIDENCE';

  const confidenceScore = typeof overallConfidence === 'number' ? Math.round(overallConfidence * 100) : null;

  return (
    <div className="charcoal-card rounded-lg p-4 border border-white/[0.07] flex flex-col justify-between">
      
      {/* Top Header & Timestamp */}
      <div className="flex items-center justify-between pb-2.5 border-b border-white/[0.05] mb-3">
        <div className="flex items-center gap-2">
          <Fingerprint className="w-4 h-4 text-emerald-400 shrink-0" />
          <h3 className="text-xs font-medium text-zinc-200 tracking-tight">
            Human Detection Result
          </h3>
        </div>
        <span className="text-[11px] font-mono text-zinc-500 tabular-numbers">
          {lastDetectionTimestamp || '--:--:-- UTC'}
        </span>
      </div>

      {/* Primary Detection Status Banner & Calibrated Gauge */}
      <div className="p-3 rounded-md bg-black/30 border border-white/[0.04] mb-3.5">
        <div className="flex items-start justify-between gap-3 mb-2.5">
          <div>
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className={`w-2 h-2 rounded-full ${
                isConfirmed 
                  ? 'bg-emerald-500' 
                  : isUncertain 
                    ? 'bg-amber-500' 
                    : isInsufficient 
                      ? 'bg-zinc-600' 
                      : 'bg-zinc-500'
              }`} />
              <span className="text-[11px] text-zinc-400">Classification State</span>
            </div>
            
            {/* Classification Outcome Text */}
            <div className="text-base font-semibold tracking-tight text-white flex items-center gap-1.5">
              {isConfirmed && <span className="text-emerald-400">Human Detected</span>}
              {isUncertain && <span className="text-amber-400">Uncertain / Scanning</span>}
              {isNoHuman && <span className="text-zinc-400">No Human Detected</span>}
              {isInsufficient && (
                <span className="text-zinc-400 flex items-center gap-1.5">
                  <ShieldQuestion className="w-4 h-4 text-zinc-500" />
                  Insufficient Evidence (Unknown)
                </span>
              )}
            </div>

            <div className="text-[11px] text-zinc-500 mt-0.5 max-w-xs leading-snug">
              {statusReason || fusionAlgorithm}
            </div>
          </div>

          {/* Instrument Readout (Never displays 0 when score is undefined) */}
          <div className="text-right shrink-0">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider block">
              Confidence Index
            </span>
            <div className="text-2xl font-semibold font-mono text-zinc-200 tabular-numbers">
              {confidenceScore !== null ? (
                <>
                  <span className={isConfirmed ? 'text-emerald-400' : isUncertain ? 'text-amber-400' : 'text-zinc-300'}>
                    {confidenceScore}
                  </span>
                  <span className="text-xs font-normal text-zinc-500 ml-0.5">%</span>
                </>
              ) : (
                <span className="text-zinc-600 text-lg">--</span>
              )}
            </div>
            <span className="text-[10px] font-mono text-zinc-500">
              {confidenceScore !== null ? (confidenceScore >= 80 ? 'Verified' : 'Unverified') : 'Offline'}
            </span>
          </div>
        </div>

        {/* Calibrated Gauge Bar (Calibrated backend threshold marker at 80%) */}
        <div className="pt-2 border-t border-white/[0.04]">
          <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500 mb-1">
            <span>0</span>
            <span className="text-zinc-600">Threshold 80%</span>
            <span>100</span>
          </div>
          
          <div className="h-1.5 w-full bg-zinc-900 rounded-full overflow-hidden relative border border-white/5">
            <div className="absolute top-0 bottom-0 left-[80%] w-[1px] bg-zinc-600 z-10" />
            {confidenceScore !== null && (
              <div 
                className={`h-full rounded-full transition-all duration-300 ${
                  isConfirmed ? 'bg-emerald-500' : isUncertain ? 'bg-amber-500' : 'bg-zinc-600'
                }`}
                style={{ width: `${confidenceScore}%` }}
              />
            )}
          </div>
        </div>
      </div>

      {/* Tri-Modal Evidence Breakdown (Gas sensor strictly excluded!) */}
      <div className="space-y-1.5 mb-3">
        <div className="text-[11px] text-zinc-500 flex items-center justify-between px-0.5 pb-1">
          <span>Tri-Sensor Modality Evidence</span>
          <span className="font-mono text-[10px]">Model Score</span>
        </div>

        {/* 1. Thermal Evidence (Orange Accent) */}
        <div className={`p-2 rounded-md border transition-colors ${
          evidence?.thermal?.available ? 'bg-white/[0.02] border-white/[0.04]' : 'bg-black/20 border-white/[0.02] opacity-60'
        }`}>
          <div className="flex items-center justify-between text-xs mb-0.5">
            <div className="flex items-center gap-2">
              <Flame className="w-3.5 h-3.5 text-orange-400 shrink-0" />
              <span className="font-medium text-zinc-200">Thermal Evidence</span>
              <EvidenceStatusBadge status={evidence?.thermal?.status} available={evidence?.thermal?.available} />
            </div>
            <div className="flex items-center gap-2 font-mono tabular-numbers">
              <span className="text-[11px] text-orange-400 font-medium">
                {evidence?.thermal?.metric || 'Offline'}
              </span>
              <span className="text-[11px] text-zinc-500">
                {typeof evidence?.thermal?.score === 'number' ? `${(evidence.thermal.score * 100).toFixed(0)}%` : '--'}
              </span>
            </div>
          </div>
          <p className="text-[11px] text-zinc-400 pl-5.5 leading-normal">
            {evidence?.thermal?.detail}
          </p>
        </div>

        {/* 2. mmWave Evidence (Sky Blue Accent) */}
        <div className={`p-2 rounded-md border transition-colors ${
          evidence?.mmWave?.available ? 'bg-white/[0.02] border-white/[0.04]' : 'bg-black/20 border-white/[0.02] opacity-60'
        }`}>
          <div className="flex items-center justify-between text-xs mb-0.5">
            <div className="flex items-center gap-2">
              <Radar className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <span className="font-medium text-zinc-200">mmWave Radar</span>
              <EvidenceStatusBadge status={evidence?.mmWave?.status} available={evidence?.mmWave?.available} />
            </div>
            <div className="flex items-center gap-2 font-mono tabular-numbers">
              <span className="text-[11px] text-sky-400 font-medium">
                {evidence?.mmWave?.metric || 'Offline'}
              </span>
              <span className="text-[11px] text-zinc-500">
                {typeof evidence?.mmWave?.score === 'number' ? `${(evidence.mmWave.score * 100).toFixed(0)}%` : '--'}
              </span>
            </div>
          </div>
          <p className="text-[11px] text-zinc-400 pl-5.5 leading-normal">
            {evidence?.mmWave?.detail}
          </p>
        </div>

        {/* 3. Camera / YOLO Evidence (Violet Accent) */}
        <div className={`p-2 rounded-md border transition-colors ${
          evidence?.cameraYolo?.available ? 'bg-white/[0.02] border-white/[0.04]' : 'bg-black/20 border-white/[0.02] opacity-60'
        }`}>
          <div className="flex items-center justify-between text-xs mb-0.5">
            <div className="flex items-center gap-2">
              <Camera className="w-3.5 h-3.5 text-violet-400 shrink-0" />
              <span className="font-medium text-zinc-200">Camera (YOLO)</span>
              <EvidenceStatusBadge status={evidence?.cameraYolo?.status} available={evidence?.cameraYolo?.available} />
            </div>
            <div className="flex items-center gap-2 font-mono tabular-numbers">
              <span className="text-[11px] text-violet-400 font-medium">
                {evidence?.cameraYolo?.metric || 'Offline'}
              </span>
              <span className="text-[11px] text-zinc-500">
                {typeof evidence?.cameraYolo?.score === 'number' ? `${(evidence.cameraYolo.score * 100).toFixed(0)}%` : '--'}
              </span>
            </div>
          </div>
          <p className="text-[11px] text-zinc-400 pl-5.5 leading-normal">
            {evidence?.cameraYolo?.detail}
          </p>
        </div>

      </div>

      {/* Safety Compliance Footnote */}
      <div className="text-[10px] text-zinc-500 pt-2 border-t border-white/[0.04] flex items-center justify-between">
        <span>Backend Multi-Modal Decision Matrix</span>
        <span className="text-zinc-400 font-mono">
          {isInsufficient ? 'Halted' : 'Verified'}
        </span>
      </div>

    </div>
  );
}
