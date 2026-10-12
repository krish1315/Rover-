import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { 
  Maximize2, 
  Minimize2, 
  Crosshair, 
  VideoOff,
  RefreshCw,
  Info
} from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export default function CameraFeed({ camera, yoloDetections = [], isMock = false }) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showYolo, setShowYolo] = useState(true);
  const [showThermalOverlay, setShowThermalOverlay] = useState(true);
  const [showGrid, setShowGrid] = useState(false);
  
  // Stream connection state: 'STREAMING' | 'LOADING' | 'ERROR' | 'OFFLINE'
  const [streamError, setStreamError] = useState(false);
  const [streamKey, setStreamKey] = useState(0); // For forcing stream reload
  const [lastFrameTime, setLastFrameTime] = useState(null);

  // Content viewport dimensions for letterbox-aware bounding box scaling
  const containerRef = useRef(null);
  const imgRef = useRef(null);
  const [contentRect, setContentRect] = useState({ left: 0, top: 0, width: 0, height: 0 });

  // Stream URL calculation
  const streamEndpoint = camera?.streamUrl || '/api/camera/stream';
  const fullStreamUrl = streamEndpoint.startsWith('http') 
    ? streamEndpoint 
    : `${API_BASE_URL}${streamEndpoint}`;

  // Aspect Ratio Aware Math: compute exact rendered image box inside container
  const updateContentRect = useCallback(() => {
    if (!containerRef.current) return;

    const containerWidth = containerRef.current.clientWidth;
    const containerHeight = containerRef.current.clientHeight;

    // Use natural image dimensions (default 1280x720 if not yet loaded)
    const naturalWidth = imgRef.current?.naturalWidth || camera?.naturalWidth || 1280;
    const naturalHeight = imgRef.current?.naturalHeight || camera?.naturalHeight || 720;

    const naturalAspect = naturalWidth / naturalHeight;
    const containerAspect = containerWidth / containerHeight;

    let renderedWidth, renderedHeight, offsetX, offsetY;

    if (containerAspect > naturalAspect) {
      // Pillarboxed (black bars on left/right)
      renderedHeight = containerHeight;
      renderedWidth = containerHeight * naturalAspect;
      offsetX = (containerWidth - renderedWidth) / 2;
      offsetY = 0;
    } else {
      // Letterboxed (black bars on top/bottom)
      renderedWidth = containerWidth;
      renderedHeight = containerWidth / naturalAspect;
      offsetX = 0;
      offsetY = (containerHeight - renderedHeight) / 2;
    }

    setContentRect({
      left: offsetX,
      top: offsetY,
      width: renderedWidth,
      height: renderedHeight,
    });
  }, [camera?.naturalWidth, camera?.naturalHeight]);

  // Track window resizing and fullscreen changes
  useEffect(() => {
    updateContentRect();
    window.addEventListener('resize', updateContentRect);
    return () => window.removeEventListener('resize', updateContentRect);
  }, [updateContentRect]);

  // Fullscreen change listener
  useEffect(() => {
    function handleFullscreenChange() {
      setIsFullscreen(!!document.fullscreenElement);
      setTimeout(updateContentRect, 50);
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [updateContentRect]);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch((err) => {
        console.error('Fullscreen request failed:', err);
      });
    } else {
      document.exitFullscreen().catch((err) => {
        console.error('Exit fullscreen failed:', err);
      });
    }
  };

  const handleRetryStream = () => {
    setStreamError(false);
    setStreamKey((k) => k + 1);
  };

  const [currentTime, setCurrentTime] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Stale detection expiration (clear boxes older than 1.5s)
  const activeDetections = useMemo(() => {
    if (isMock) return yoloDetections;
    return yoloDetections.filter((det) => {
      if (!det.receivedAt) return true;
      return currentTime - det.receivedAt < 1500;
    });
  }, [yoloDetections, isMock, currentTime]);

  const isStreamActive = !isMock && !streamError && camera?.status === 'STREAMING';

  return (
    <div 
      ref={containerRef}
      className={`charcoal-card rounded-lg border border-white/[0.07] flex flex-col overflow-hidden relative ${
        isFullscreen ? 'fixed inset-0 z-50 rounded-none bg-[#08090c]' : 'h-full min-h-[480px] lg:min-h-[530px]'
      }`}
    >
      {/* Header Bar */}
      <div className="flex items-center justify-between px-3.5 py-2 bg-black/40 border-b border-white/[0.06] z-30">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${
              isStreamActive || isMock ? 'bg-emerald-500' : 'bg-rose-500'
            }`} />
            <span className="text-xs font-medium text-zinc-200">
              {isMock ? 'Mock Optical Feed' : `Live MJPEG // ${camera?.cameraId || 'ESP32S3-CAM'}`}
            </span>
          </div>

          <span className="text-[11px] text-zinc-500 font-mono">
            {camera?.resolution || '1280x720'} • {camera?.fps ? `${camera.fps} FPS` : '25 FPS'}
          </span>

          <span className="hidden sm:inline-block text-[11px] text-violet-400 font-mono">
            YOLOv11x {activeDetections.length > 0 ? `(${activeDetections.length} target)` : '(0 targets)'}
          </span>
        </div>

        {/* Video stream controls & fullscreen */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowYolo(!showYolo)}
            title="Toggle YOLO Bounding Boxes"
            className={`px-2 py-1 rounded text-xs transition-colors border ${
              showYolo 
                ? 'bg-violet-950/40 text-violet-300 border-violet-500/30' 
                : 'bg-zinc-900/60 text-zinc-500 border-white/[0.05] hover:text-zinc-300'
            }`}
          >
            <span className="text-[11px]">BBox</span>
          </button>

          <button
            onClick={() => setShowThermalOverlay(!showThermalOverlay)}
            title="Toggle Radiometric Heatmap Marker"
            className={`px-2 py-1 rounded text-xs transition-colors border ${
              showThermalOverlay 
                ? 'bg-orange-950/40 text-orange-300 border-orange-500/30' 
                : 'bg-zinc-900/60 text-zinc-500 border-white/[0.05] hover:text-zinc-300'
            }`}
          >
            <span className="text-[11px]">Heat</span>
          </button>

          <button
            onClick={() => setShowGrid(!showGrid)}
            title="Toggle Optical Reticle"
            className={`p-1.5 rounded transition-colors border ${
              showGrid 
                ? 'bg-zinc-800 text-zinc-300 border-white/10' 
                : 'bg-zinc-900/60 text-zinc-500 border-white/[0.05] hover:text-zinc-300'
            }`}
          >
            <Crosshair className="w-3.5 h-3.5" />
          </button>

          <div className="w-[1px] h-3.5 bg-white/10 mx-1"></div>

          <button
            onClick={toggleFullscreen}
            className="p-1.5 rounded bg-zinc-900/80 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-white/[0.06] transition-colors"
            title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Main Viewport Container */}
      <div className="relative flex-1 w-full bg-[#08090c] flex items-center justify-center overflow-hidden">
        
        {/* CASE 1: Live MJPEG Camera Stream */}
        {!isMock && !streamError ? (
          <div className="relative w-full h-full flex items-center justify-center">
            <img
              ref={imgRef}
              key={streamKey}
              src={`${fullStreamUrl}?t=${streamKey}`}
              alt="Rover Optical Feed"
              className="w-full h-full object-contain select-none"
              onLoad={() => {
                setStreamError(false);
                updateContentRect();
                setLastFrameTime(new Date().toLocaleTimeString());
              }}
              onError={() => {
                console.warn('[Camera] MJPEG stream unavailable at:', fullStreamUrl);
                setStreamError(true);
              }}
            />
          </div>
        ) : isMock ? (
          /* CASE 2: Mock Demonstration Feed */
          <div className="relative w-full h-full flex items-center justify-center select-none pointer-events-none">
            <svg 
              className="w-full h-full object-contain" 
              viewBox="0 0 1280 720" 
              preserveAspectRatio="xMidYMid meet"
              onLoad={updateContentRect}
            >
              <defs>
                <linearGradient id="mockBgGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#08090d" />
                  <stop offset="60%" stopColor="#0f1118" />
                  <stop offset="100%" stopColor="#06070a" />
                </linearGradient>
                <radialGradient id="mockHeadlight" cx="48%" cy="54%" r="48%">
                  <stop offset="0%" stopColor="#cbd5e1" stopOpacity="0.14" />
                  <stop offset="50%" stopColor="#1e293b" stopOpacity="0.05" />
                  <stop offset="100%" stopColor="#000000" stopOpacity="0.5" />
                </radialGradient>
                <radialGradient id="mockThermalHotspot" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#f97316" stopOpacity="0.4" />
                  <stop offset="60%" stopColor="#ea580c" stopOpacity="0.2" />
                  <stop offset="100%" stopColor="#000000" stopOpacity="0" />
                </radialGradient>
              </defs>

              <rect width="1280" height="720" fill="url(#mockBgGrad)" />
              <path d="M 0 0 L 440 320 L 440 480 L 0 720 Z" fill="#0c0e14" opacity="0.9" />
              <path d="M 1280 0 L 840 320 L 840 480 L 1280 720 Z" fill="#0b0d12" opacity="0.9" />
              <path d="M 440 320 L 840 320 L 840 480 L 440 480 Z" fill="#12151f" />

              {/* Structural rubble */}
              <line x1="120" y1="180" x2="420" y2="350" stroke="#1f2330" strokeWidth="3" />
              <line x1="1150" y1="140" x2="860" y2="360" stroke="#1c202c" strokeWidth="4" />
              <line x1="890" y1="420" x2="1240" y2="630" stroke="#191c26" strokeWidth="5" />

              {/* Survivor Silhouette at (x=590, y=365) */}
              <g transform="translate(560, 335)">
                <circle cx="35" cy="30" r="16" fill="#191d28" />
                <path d="M 10 54 C 10 45, 60 45, 60 54 L 70 120 L 0 120 Z" fill="#1b202e" />
                <polygon points="-40,120 110,120 90,85 -20,90" fill="#12151e" />
              </g>

              <rect width="1280" height="720" fill="url(#mockHeadlight)" />

              {showThermalOverlay && (
                <g transform="translate(555, 340)">
                  <ellipse cx="40" cy="40" rx="38" ry="46" fill="url(#mockThermalHotspot)" />
                  <circle cx="40" cy="30" r="12" fill="#f97316" opacity="0.3" />
                  <text x="64" y="30" fill="#fb923c" fontSize="11" fontFamily="JetBrains Mono" fontWeight="600">
                    36.8°C
                  </text>
                </g>
              )}
            </svg>
          </div>
        ) : (
          /* CASE 3: Camera Disconnected / Unavailable Troubleshooting Placeholder */
          <div className="flex flex-col items-center justify-center p-6 text-center text-zinc-400 max-w-md animate-in fade-in">
            <div className="w-12 h-12 rounded-full bg-zinc-900 border border-white/10 flex items-center justify-center mb-3 text-rose-400">
              <VideoOff className="w-5 h-5" />
            </div>
            <h4 className="text-sm font-medium text-zinc-200 mb-1">
              Optical Stream Unavailable
            </h4>
            <p className="text-xs text-zinc-500 mb-3 leading-relaxed">
              Unable to establish MJPEG HTTP stream from <span className="font-mono text-zinc-400">{fullStreamUrl}</span>.
            </p>

            {/* Troubleshooting Checklist */}
            <div className="text-left w-full p-3 rounded-md bg-zinc-950/70 border border-white/5 text-[11px] text-zinc-400 space-y-1.5 mb-4">
              <div className="flex items-start gap-1.5 font-medium text-zinc-300">
                <Info className="w-3.5 h-3.5 text-zinc-500 shrink-0 mt-0.5" />
                <span>Troubleshooting checklist:</span>
              </div>
              <ul className="list-disc list-inside pl-1 space-y-1 text-zinc-500 text-[10px]">
                <li>Verify the Python FastAPI backend is active on port 8000.</li>
                <li>Check the ESP32-S3 Wi-Fi connection and camera ribbon cable.</li>
                <li>Ensure no firewall is blocking HTTP MJPEG streaming.</li>
                <li>Switch to <span className="text-zinc-300 font-mono">Demo Mode</span> in the header to view mock telemetry.</li>
              </ul>
            </div>

            <button
              onClick={handleRetryStream}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-sans bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-white/10 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry Stream</span>
            </button>
          </div>
        )}

        {/* Optical Crosshair Grid */}
        {showGrid && (
          <div className="absolute inset-0 pointer-events-none opacity-20 z-20">
            <div className="w-full h-full grid grid-cols-6 grid-rows-4">
              {Array.from({ length: 24 }).map((_, idx) => (
                <div key={idx} className="border border-white/5" />
              ))}
            </div>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-12 h-12 border border-white/20 rounded-full flex items-center justify-center">
                <div className="w-1 h-1 bg-white/40 rounded-full"></div>
              </div>
            </div>
          </div>
        )}

        {/* Aspect-Ratio-Preserving YOLO Bounding Boxes */}
        {showYolo && (isStreamActive || isMock) && activeDetections.map((det) => {
          // Precise coordinate calculation mapped strictly to the rendered contentRect
          const boxLeft = contentRect.left + (det.normXMin * contentRect.width);
          const boxTop = contentRect.top + (det.normYMin * contentRect.height);
          const boxWidth = det.normWidth * contentRect.width;
          const boxHeight = det.normHeight * contentRect.height;

          return (
            <div 
              key={det.trackId}
              className="absolute z-25 pointer-events-none transition-all duration-150"
              style={{
                left: `${boxLeft}px`,
                top: `${boxTop}px`,
                width: `${boxWidth}px`,
                height: `${boxHeight}px`,
              }}
            >
              {/* Violet Bounding Box */}
              <div className="w-full h-full border border-violet-400/80 bg-violet-500/[0.05] rounded-[2px] relative shadow-[0_0_8px_rgba(167,139,250,0.2)]">
                {/* Corner Tick Brackets */}
                <span className="absolute -top-[1px] -left-[1px] w-2 h-2 border-t-2 border-l-2 border-violet-400"></span>
                <span className="absolute -top-[1px] -right-[1px] w-2 h-2 border-t-2 border-r-2 border-violet-400"></span>
                <span className="absolute -bottom-[1px] -left-[1px] w-2 h-2 border-b-2 border-l-2 border-violet-400"></span>
                <span className="absolute -bottom-[1px] -right-[1px] w-2 h-2 border-b-2 border-r-2 border-violet-400"></span>
                
                {/* Tag Label with Class and Model Confidence */}
                <div className="absolute -top-5 left-0 flex items-center gap-1 bg-zinc-950/90 border border-violet-400/40 px-1.5 py-0.2 rounded text-[10px] font-mono text-violet-200 shadow-md">
                  <span className="font-medium">{det.classLabel}</span>
                  <span className="text-zinc-400 font-semibold">{det.confidence.toFixed(2)}</span>
                </div>

                {/* Distance Label if supported */}
                {det.distanceEstimate && (
                  <div className="absolute -bottom-5 right-0 bg-zinc-950/90 border border-white/10 px-1 py-0.2 rounded text-[9px] font-mono text-zinc-400 shadow-sm">
                    {det.distanceEstimate.toFixed(2)}m
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Live OSD HUD Metadata Badges */}
        {(isStreamActive || isMock) && (
          <>
            <div className="absolute bottom-2.5 left-2.5 z-20 flex items-center gap-2 pointer-events-none text-[10px] font-mono text-zinc-400">
              <div className="px-2 py-0.5 rounded bg-black/60 border border-white/10 backdrop-blur-sm">
                IR: 65%
              </div>
              <div className="px-2 py-0.5 rounded bg-black/60 border border-white/10 backdrop-blur-sm">
                ISO: 1600
              </div>
              {lastFrameTime && (
                <div className="px-2 py-0.5 rounded bg-black/60 border border-white/10 backdrop-blur-sm">
                  FRAME: {lastFrameTime}
                </div>
              )}
            </div>

            <div className="absolute top-2.5 right-2.5 z-20 pointer-events-none font-mono text-[10px] text-zinc-400 bg-black/60 px-2 py-0.5 rounded border border-white/10 backdrop-blur-sm">
              PITCH +2.4° • ROLL -0.8°
            </div>
          </>
        )}

      </div>

      {/* Footer Info Strip */}
      <div className="px-3.5 py-1.5 bg-black/40 border-t border-white/[0.06] flex items-center justify-between text-[11px] text-zinc-500 font-mono">
        <div className="flex items-center gap-2">
          <span>{isMock ? 'SIMULATION FEED' : camera?.codec || 'MJPEG / HTTP Stream'}</span>
          <span>•</span>
          <span className="text-zinc-400">
            {activeDetections.length === 0 ? 'NO DETECTIONS IN FRAME' : `${activeDetections.length} TARGET TRACKED`}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span>SYNC: OK</span>
          <span>•</span>
          <span className="tabular-numbers">
            {camera?.packetLossPercent !== null ? `Loss: ${camera?.packetLossPercent?.toFixed(2)}%` : 'Loss: 0.00%'}
          </span>
        </div>
      </div>
    </div>
  );
}
