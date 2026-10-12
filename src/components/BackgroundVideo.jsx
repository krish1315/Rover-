import React, { memo, useRef, useEffect, useState } from 'react';

/**
 * Animated Gradient Video Background Component
 * 
 * Layering Architecture:
 * 1. Bottom Layer: Continuously looping background video (opacity ~25%, 6px blur, object-fit cover)
 * 2. Middle Layer: Restrained charcoal/black translucent overlay preserving glassmorphic contrast
 * 3. Top Layer: Existing Rescue Rover Dashboard UI (pointer-events pass-through)
 * 
 * Respects prefers-reduced-motion with static fallback and handles autoplay safely.
 */
const BackgroundVideo = memo(function BackgroundVideo() {
  const videoRef = useRef(null);
  const [hasError, setHasError] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

    const handleChange = (e) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener?.('change', handleChange);
    return () => mediaQuery.removeEventListener?.('change', handleChange);
  }, []);

  useEffect(() => {
    if (videoRef.current && !prefersReducedMotion && !hasError) {
      videoRef.current.play().catch((err) => {
        // Autoplay policy note: muted videos are allowed by browsers
        console.debug('[BackgroundVideo] Autoplay playback deferred:', err?.message || err);
      });
    }
  }, [prefersReducedMotion, hasError]);

  return (
    <div 
      className="fixed inset-0 overflow-hidden pointer-events-none select-none z-0"
      aria-hidden="true"
    >
      {/* Layer 1: Animated Video Background */}
      {!prefersReducedMotion && !hasError && (
        <video
          ref={videoRef}
          autoPlay
          loop
          muted
          playsInline
          onError={() => setHasError(true)}
          className="absolute inset-0 w-full h-full object-cover opacity-45 filter blur-[4px] scale-105 transform-gpu pointer-events-none"
          style={{ willChange: 'transform, opacity' }}
        >
          <source src="/background/back.mp4" type="video/mp4" />
        </video>
      )}

      {/* Layer 2: Subtle Charcoal Vignette Overlay (preserves high contrast for cards) */}
      <div className="absolute inset-0 bg-black/20 bg-[radial-gradient(ellipse_at_top,transparent_20%,rgba(11,13,18,0.55)_90%)] pointer-events-none" />
    </div>
  );
});

export default BackgroundVideo;
