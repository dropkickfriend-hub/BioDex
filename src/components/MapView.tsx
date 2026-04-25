import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import { FieldMission } from '../types';

export type SatelliteLayer = 'none' | 'truecolor' | 'ndvi' | 'landcover';

interface MapViewProps {
  userCoords: { lat: number; lng: number } | null;
  missions: FieldMission[];
  selectedMission: FieldMission | null;
  onMissionSelect: (mission: FieldMission) => void;
  satelliteLayer?: SatelliteLayer;
  scanRadiusKm?: number;
}

const userIcon = L.icon({
  iconUrl: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%2310b981"%3E%3Ccircle cx="12" cy="12" r="8" fill="%2310b981"/%3E%3Ccircle cx="12" cy="12" r="5" fill="white"/%3E%3C/svg%3E',
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

const missionIcon = (priority: string) =>
  L.icon({
    iconUrl: `data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"%3E%3Cpath d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" fill="${priority === 'High' ? '%23ef4444' : '%23f59e0b'}"%3E%3C/path%3E%3C/svg%3E`,
    iconSize: [40, 40],
    iconAnchor: [20, 40],
    popupAnchor: [0, -40],
  });

// NASA GIBS — free, no key. Daily MODIS / VIIRS imagery.
// Date is yesterday in UTC because GIBS has ~24h latency.
function yesterdayISO() {
  const d = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

const GIBS_TRUECOLOR = (date: string) =>
  `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/${date}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`;

// MODIS Terra NDVI (Normalized Difference Vegetation Index) - the actual
// satellite proxy for native plant vigor used in conservation modeling.
// Available at 8-day rolling composite.
const GIBS_NDVI =
  'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_NDVI_8Day/default/2024-09-01/GoogleMapsCompatible_Level9/{z}/{y}/{x}.png';

// ESA WorldCover 2021 (categorical landcover).
const GIBS_LANDCOVER =
  'https://services.terrascope.be/wmts/v2?layer=WORLDCOVER_2021_MAP&style=default&tilematrixset=EPSG%3A3857&Service=WMTS&Request=GetTile&Version=1.0.0&Format=image%2Fpng&TileMatrix={z}&TileCol={x}&TileRow={y}';

export default function MapView({
  userCoords,
  missions,
  selectedMission,
  onMissionSelect,
  satelliteLayer = 'none',
  scanRadiusKm = 10,
}: MapViewProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const scanCircleRef = useRef<L.Circle | null>(null);
  const overlayRef = useRef<L.TileLayer | null>(null);
  const missionMarkersRef = useRef<{ [key: string]: L.Marker }>({});
  const trueColorDate = useMemo(() => yesterdayISO(), []);

  // Initialize map once
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const map = L.map(mapRef.current).setView([20, 0], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap · NASA GIBS · ESA WorldCover',
      maxZoom: 19,
    }).addTo(map);

    mapInstanceRef.current = map;

    // Leaflet doesn't auto-recalculate size if its container was hidden or
    // resized after mount. Re-invalidate once the DOM settles.
    const t = setTimeout(() => map.invalidateSize(), 50);
    const onResize = () => map.invalidateSize();
    window.addEventListener('resize', onResize);

    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  // Satellite / habitat overlay swap
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (overlayRef.current) {
      map.removeLayer(overlayRef.current);
      overlayRef.current = null;
    }

    if (satelliteLayer === 'none') return;

    let url: string;
    let attribution: string;
    let opacity = 0.85;
    if (satelliteLayer === 'truecolor') {
      url = GIBS_TRUECOLOR(trueColorDate);
      attribution = `NASA GIBS VIIRS True Color · ${trueColorDate}`;
    } else if (satelliteLayer === 'ndvi') {
      url = GIBS_NDVI;
      attribution = 'NASA GIBS MODIS NDVI 8-Day';
      opacity = 0.7;
    } else {
      url = GIBS_LANDCOVER;
      attribution = 'ESA WorldCover 2021';
      opacity = 0.55;
    }

    overlayRef.current = L.tileLayer(url, {
      opacity,
      attribution,
      maxZoom: 18,
    }).addTo(map);
  }, [satelliteLayer, trueColorDate]);

  // Update user marker and map view when userCoords changes
  useEffect(() => {
    if (!mapInstanceRef.current || !userCoords) return;

    if (userMarkerRef.current) {
      userMarkerRef.current.setLatLng([userCoords.lat, userCoords.lng]);
    } else {
      userMarkerRef.current = L.marker([userCoords.lat, userCoords.lng], { icon: userIcon })
        .bindPopup('You are here')
        .addTo(mapInstanceRef.current);
    }

    if (scanCircleRef.current) {
      scanCircleRef.current.setLatLng([userCoords.lat, userCoords.lng]);
      scanCircleRef.current.setRadius(scanRadiusKm * 1000);
    } else {
      scanCircleRef.current = L.circle([userCoords.lat, userCoords.lng], {
        radius: scanRadiusKm * 1000,
        color: '#10b981',
        weight: 1,
        opacity: 0.45,
        fillColor: '#10b981',
        fillOpacity: 0.05,
      }).addTo(mapInstanceRef.current);
    }

    mapInstanceRef.current.setView([userCoords.lat, userCoords.lng], 13);
    setTimeout(() => mapInstanceRef.current?.invalidateSize(), 60);
  }, [userCoords, scanRadiusKm]);

  // Update mission markers
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    const currentMissionIds = new Set(missions.map(m => m.id));
    const existingMissionIds = new Set(Object.keys(missionMarkersRef.current));

    existingMissionIds.forEach(id => {
      if (!currentMissionIds.has(id)) {
        mapInstanceRef.current!.removeLayer(missionMarkersRef.current[id]);
        delete missionMarkersRef.current[id];
      }
    });

    missions.forEach(mission => {
      if (missionMarkersRef.current[mission.id]) {
        missionMarkersRef.current[mission.id].setLatLng([mission.location.lat, mission.location.lng]);
      } else {
        const marker = L.marker([mission.location.lat, mission.location.lng], {
          icon: missionIcon(mission.priority),
        })
          .bindPopup(`
            <div class="text-sm">
              <p class="font-bold">${mission.title}</p>
              <p class="text-xs text-gray-600">${mission.priority} Priority</p>
            </div>
          `)
          .on('click', () => onMissionSelect(mission))
          .addTo(mapInstanceRef.current!);

        missionMarkersRef.current[mission.id] = marker;
      }
    });
  }, [missions, onMissionSelect]);

  // Highlight selected mission marker
  useEffect(() => {
    Object.values(missionMarkersRef.current).forEach(marker => {
      const element = marker.getElement();
      if (element) {
        element.classList.remove('ring-2', 'ring-offset-2', 'ring-blue-500');
      }
    });

    if (selectedMission && missionMarkersRef.current[selectedMission.id]) {
      const element = missionMarkersRef.current[selectedMission.id].getElement();
      if (element) {
        element.classList.add('ring-2', 'ring-offset-2', 'ring-blue-500');
      }
    }
  }, [selectedMission]);

  return <div ref={mapRef} className="h-full w-full" />;
}
