import React from 'react';
import { Flame, Radar, Wind, AlertCircle, AlertTriangle } from 'lucide-react';

// Precision Sparkline: Clean 1.5px stroke, displays empty state baseline when data is unavailable
function Sparkline({ data, strokeColor, minVal, maxVal, height = 32 }) {
  const width = 160;

  if (!data || data.length < 2) {
    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-8 overflow-visible" preserveAspectRatio="none">
        <line x1="0" y1={height / 2} x2={width} y2={height / 2} stroke="rgba(255,255,255,0.08)" strokeWidth="1" strokeDasharray="3,3" />
        <text x={width / 2} y={height / 2 + 3} fill="rgba(255,255,255,0.2)" fontSize="8" fontFamily="Inter" textAnchor="middle">
          TELEMETRY OFFLINE
        </text>
      </svg>
    );
  }

  const min = minVal !== undefined ? minVal : Math.min(...data);
  const max = maxVal !== undefined ? maxVal : Math.max(...data);
  const range = max - min || 1;
  
  const points = data.map((val, idx) => {
    const x = (idx / (data.length - 1)) * width;
    const y = height - ((val - min) / range) * (height - 6) - 3;
    return `${x},${y}`;
  });

  const linePath = `M ${points.join(' L ')}`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-8 overflow-visible" preserveAspectRatio="none">
      <line x1="0" y1={height - 2} x2={width} y2={height - 2} stroke="rgba(255,255,255,0.05)" strokeWidth="1" strokeDasharray="2,3" />
      <path 
        d={linePath} 
        fill="none" 
        stroke={strokeColor} 
        strokeWidth="1.5" 
        strokeLinecap="round" 
        strokeLinejoin="round" 
      />
      {points.length > 0 && (
        <circle 
          cx={points[points.length - 1].split(',')[0]} 
          cy={points[points.length - 1].split(',')[1]} 
          r="2" 
          fill={strokeColor} 
        />
      )}
    </svg>
  );
}

function StatusPill({ status, errorMessage }) {
  if (status === 'CONNECTED') {
    return (
      <span className="text-[11px] text-zinc-400 flex items-center gap-1.5 font-sans">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
        Online
      </span>
    );
  }
  if (status === 'STALE') {
    return (
      <span className="text-[11px] text-amber-400 flex items-center gap-1 font-sans">
        <AlertTriangle className="w-3 h-3 text-amber-400" />
        Stale Data
      </span>
    );
  }
  if (status === 'ERROR') {
    return (
      <span className="text-[11px] text-rose-400 flex items-center gap-1 font-sans" title={errorMessage || 'Sensor fault'}>
        <AlertCircle className="w-3 h-3 text-rose-400" />
        Fault
      </span>
    );
  }
  return (
    <span className="text-[11px] text-zinc-500 flex items-center gap-1 font-sans">
      <span className="w-1.5 h-1.5 rounded-full bg-zinc-600"></span>
      Offline
    </span>
  );
}

export default function SensorOverviewRow({ thermal, mmWave, gas }) {
  const isThermalConnected = thermal?.status === 'CONNECTED';
  const isMmWaveConnected = mmWave?.status === 'CONNECTED';
  const isGasConnected = gas?.status === 'CONNECTED';

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 mb-3.5">
      
      {/* CARD 1: Thermal Sensor */}
      <div className="charcoal-card rounded-lg p-4 border border-white/[0.07] flex flex-col justify-between transition-colors duration-150 hover:border-white/[0.12]">
        <div>
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Flame className="w-4 h-4 text-orange-400 shrink-0" />
              <div>
                <h3 className="text-xs font-medium text-zinc-200 tracking-tight">Thermal Sensor</h3>
                <span className="text-[11px] text-zinc-500 font-mono block">{thermal?.sensorId || 'FLIR-LEPTON'}</span>
              </div>
            </div>
            <StatusPill status={thermal?.status} errorMessage={thermal?.errorMessage} />
          </div>

          {/* Metric Reading */}
          <div className="flex items-baseline justify-between mb-2">
            <div>
              <div className="flex items-baseline gap-1 font-mono tabular-numbers">
                <span className="text-2xl sm:text-3xl font-semibold text-zinc-100">
                  {typeof thermal?.targetTemp === 'number' ? thermal.targetTemp.toFixed(1) : '--.-'}
                </span>
                <span className="text-sm font-medium text-orange-400">°C</span>
              </div>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                {isThermalConnected && typeof thermal?.ambientTemp === 'number'
                  ? `Target signature (Ambient: ${thermal.ambientTemp.toFixed(1)}°C)`
                  : thermal?.errorMessage || 'Thermal telemetry unavailable'}
              </p>
            </div>

            <div className="text-right">
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider block">Raw Score</span>
              <span className="text-xs font-mono font-medium text-zinc-300 tabular-numbers">
                {typeof thermal?.rawConfidence === 'number' ? `${(thermal.rawConfidence * 100).toFixed(0)}%` : '--'}
              </span>
            </div>
          </div>
        </div>

        {/* Sparkline */}
        <div className="pt-2.5 mt-1 border-t border-white/[0.04]">
          <div className="flex items-center justify-between text-[11px] text-zinc-500 mb-1">
            <span>Historical Temperature Delta</span>
            <span className="text-orange-400 font-mono text-[11px]">
              {thermal?.deltaText || '--'}
            </span>
          </div>
          <Sparkline 
            data={thermal?.history} 
            strokeColor="#f97316" 
            minVal={15} 
            maxVal={40} 
          />
        </div>
      </div>

      {/* CARD 2: mmWave Radar */}
      <div className="charcoal-card rounded-lg p-4 border border-white/[0.07] flex flex-col justify-between transition-colors duration-150 hover:border-white/[0.12]">
        <div>
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Radar className="w-4 h-4 text-sky-400 shrink-0" />
              <div>
                <h3 className="text-xs font-medium text-zinc-200 tracking-tight">mmWave Radar</h3>
                <span className="text-[11px] text-zinc-500 font-mono block">{mmWave?.sensorId || 'TI-IWR6843'}</span>
              </div>
            </div>
            <StatusPill status={mmWave?.status} errorMessage={mmWave?.errorMessage} />
          </div>

          {/* Metric Reading */}
          <div className="flex items-baseline justify-between mb-2">
            <div>
              <div className="flex items-baseline gap-1 font-mono tabular-numbers">
                <span className="text-2xl sm:text-3xl font-semibold text-zinc-100">
                  {typeof mmWave?.distanceMeters === 'number' ? mmWave.distanceMeters.toFixed(2) : '--.--'}
                </span>
                <span className="text-sm font-medium text-sky-400">m</span>
              </div>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                {isMmWaveConnected
                  ? `Target distance • Respiration: ${mmWave?.microDopplerRate || 'Analyzing'}`
                  : mmWave?.errorMessage || 'Radar telemetry offline'}
              </p>
            </div>

            <div className="text-right">
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider block">Raw Score</span>
              <span className="text-xs font-mono font-medium text-zinc-300 tabular-numbers">
                {typeof mmWave?.rawConfidence === 'number' ? `${(mmWave.rawConfidence * 100).toFixed(0)}%` : '--'}
              </span>
            </div>
          </div>
        </div>

        {/* Sparkline */}
        <div className="pt-2.5 mt-1 border-t border-white/[0.04]">
          <div className="flex items-center justify-between text-[11px] text-zinc-500 mb-1">
            <span>Biometric Chest Displacement</span>
            <span className="text-sky-400 font-mono text-[11px]">
              {mmWave?.microDopplerRate || '--'}
            </span>
          </div>
          <Sparkline 
            data={mmWave?.history} 
            strokeColor="#0ea5e9" 
            minVal={0} 
            maxVal={1.0} 
          />
        </div>
      </div>

      {/* CARD 3: Gas & Air Quality (Independent Environmental Safety) */}
      <div className="charcoal-card rounded-lg p-4 border border-white/[0.07] flex flex-col justify-between transition-colors duration-150 hover:border-white/[0.12]">
        <div>
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Wind className="w-4 h-4 text-zinc-400 shrink-0" />
              <div>
                <h3 className="text-xs font-medium text-zinc-200 tracking-tight">Gas & Air Quality</h3>
                <span className="text-[11px] text-zinc-500 font-mono block">{gas?.sensorId || 'MQ-ARRAY-01'}</span>
              </div>
            </div>
            <StatusPill status={gas?.status} errorMessage={gas?.errorMessage} />
          </div>

          {/* Metric Reading */}
          <div className="flex items-baseline justify-between mb-2">
            <div>
              <div className="flex items-baseline gap-1 font-mono tabular-numbers">
                <span className="text-2xl sm:text-3xl font-semibold text-zinc-100">
                  {typeof gas?.coPpm === 'number' ? gas.coPpm.toFixed(1) : '--.-'}
                </span>
                <span className="text-sm font-medium text-zinc-400">PPM CO</span>
              </div>
              <p className={`text-[11px] mt-0.5 ${
                !isGasConnected 
                  ? 'text-zinc-500' 
                  : gas?.hazardLevel === 'NOMINAL' 
                    ? 'text-emerald-400' 
                    : 'text-rose-400 font-medium'
              }`}>
                {/* NEVER claim safe when disconnected! */}
                {!isGasConnected
                  ? 'Atmosphere Unknown • Sensor Offline'
                  : gas?.hazardLevel === 'NOMINAL'
                    ? 'Atmosphere nominal • Safe for respiration'
                    : 'Hazard warning • Elevated combustible/toxic gas'}
              </p>
            </div>

            <div className="text-right">
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider block">O2 Level</span>
              <span className="text-xs font-mono font-medium text-zinc-300 tabular-numbers">
                {typeof gas?.oxygenPercent === 'number' ? `${gas.oxygenPercent}%` : '--%'}
              </span>
            </div>
          </div>
        </div>

        {/* Technical readings & Isolation disclaimer */}
        <div className="pt-2.5 mt-1 border-t border-white/[0.04]">
          <div className="flex items-center justify-between text-[11px] text-zinc-500 mb-1">
            <span>
              LEL: {typeof gas?.combustibleLel === 'number' ? `${gas.combustibleLel}%` : '--%'} • VOC: {typeof gas?.vocPpb === 'number' ? `${gas.vocPpb} ppb` : '--'}
            </span>
            <span className="text-zinc-400 font-mono text-[11px]">
              {isGasConnected ? (gas?.hazardLevel === 'NOMINAL' ? 'Nominal' : 'Warning') : 'Offline'}
            </span>
          </div>
          <div className="text-[10px] text-zinc-500 font-sans flex items-center gap-1 pt-0.5">
            <span>Environmental monitor • Independent of human detection</span>
          </div>
        </div>
      </div>

    </div>
  );
}
