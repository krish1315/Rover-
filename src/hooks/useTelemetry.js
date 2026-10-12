import { useState, useEffect } from 'react';
import { telemetryService } from '../services/telemetryService';

export function useTelemetry() {
  const [telemetry, setTelemetry] = useState(telemetryService.state);

  useEffect(() => {
    const unsubscribe = telemetryService.subscribe((newState) => {
      setTelemetry({ ...newState });
    });
    return unsubscribe;
  }, []);

  return {
    telemetry,
    setScenario: (scenarioId) => telemetryService.setScenario(scenarioId),
    setMode: (mode) => telemetryService.setMode(mode),
  };
}
