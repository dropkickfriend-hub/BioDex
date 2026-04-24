import { useCallback, useEffect, useState } from 'react';
import { ipLocate } from '../services/regionService';

export type GeoStatus = 'idle' | 'prompting' | 'located' | 'denied' | 'error' | 'unsupported';

export interface GeoState {
  status: GeoStatus;
  coords: { lat: number; lng: number } | null;
  accuracy?: number;
  source: 'gps' | 'ip' | 'manual' | null;
  error?: string;
}

export function useGeolocation() {
  const [state, setState] = useState<GeoState>({ status: 'idle', coords: null, source: null });

  const requestPrecise = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setState({ status: 'unsupported', coords: null, source: null, error: 'Geolocation not available in this browser.' });
      return;
    }
    setState(s => ({ ...s, status: 'prompting', error: undefined }));
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setState({
          status: 'located',
          coords: { lat: pos.coords.latitude, lng: pos.coords.longitude },
          accuracy: pos.coords.accuracy,
          source: 'gps',
        });
      },
      async (err) => {
        // On denial or timeout, try IP-based fallback so the user still gets a map.
        const fallback = await ipLocate();
        if (fallback) {
          setState({
            status: 'located',
            coords: fallback,
            source: 'ip',
            error: err.code === err.PERMISSION_DENIED
              ? 'Precise location blocked — using IP-approximate position.'
              : err.message,
          });
        } else {
          setState({
            status: err.code === err.PERMISSION_DENIED ? 'denied' : 'error',
            coords: null,
            source: null,
            error: err.message,
          });
        }
      },
      { enableHighAccuracy: true, maximumAge: 60_000, timeout: 10_000 }
    );
  }, []);

  const setManual = useCallback((lat: number, lng: number) => {
    setState({ status: 'located', coords: { lat, lng }, source: 'manual' });
  }, []);

  // Kick off automatically on first mount.
  useEffect(() => {
    requestPrecise();
  }, [requestPrecise]);

  return { ...state, requestPrecise, setManual };
}
