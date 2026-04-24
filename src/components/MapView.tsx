import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { FieldMission } from '../types';

interface MapViewProps {
  userCoords: { lat: number; lng: number } | null;
  missions: FieldMission[];
  selectedMission: FieldMission | null;
  onMissionSelect: (mission: FieldMission) => void;
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

export default function MapView({ userCoords, missions, selectedMission, onMissionSelect }: MapViewProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const missionMarkersRef = useRef<{ [key: string]: L.Marker }>({});

  // Initialize map once
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const map = L.map(mapRef.current).setView([20, 0], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    mapInstanceRef.current = map;
  }, []);

  // Update user marker and map view when userCoords changes
  useEffect(() => {
    if (!mapInstanceRef.current || !userCoords) return;

    if (userMarkerRef.current) {
      userMarkerRef.current.setLatLng([userCoords.lat, userCoords.lng]);
    } else {
      userMarkerRef.current = L.marker([userCoords.lat, userCoords.lng], { icon: userIcon })
        .bindPopup('Your location')
        .addTo(mapInstanceRef.current);
    }

    mapInstanceRef.current.setView([userCoords.lat, userCoords.lng], 13);
  }, [userCoords]);

  // Update mission markers
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    const currentMissionIds = new Set(missions.map(m => m.id));
    const existingMissionIds = new Set(Object.keys(missionMarkersRef.current));

    // Remove markers for missions no longer in the list
    existingMissionIds.forEach(id => {
      if (!currentMissionIds.has(id)) {
        mapInstanceRef.current!.removeLayer(missionMarkersRef.current[id]);
        delete missionMarkersRef.current[id];
      }
    });

    // Add or update mission markers
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
