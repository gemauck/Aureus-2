// Get React hooks from window
const { useState, useEffect, useRef } = React;

const MapComponent = ({ latitude, longitude, siteName = 'Site' }) => {
    const mapRef = useRef(null);
    const mapInstanceRef = useRef(null);

    useEffect(() => {
        if (!latitude || !longitude || !mapRef.current) return;

        // Clean up existing map
        if (mapInstanceRef.current) {
            mapInstanceRef.current.remove();
        }

        // Create new map
        const map = L.map(mapRef.current).setView([parseFloat(latitude), parseFloat(longitude)], 15);
        mapInstanceRef.current = map;

        // Add OpenStreetMap tiles
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19
        }).addTo(map);

        // Add marker
        L.marker([parseFloat(latitude), parseFloat(longitude)])
            .addTo(map)
            .bindPopup(siteName)
            .openPopup();

        // Cleanup function
        return () => {
            if (mapInstanceRef.current) {
                mapInstanceRef.current.remove();
            }
        };
    }, [latitude, longitude, siteName]);

    return (
        <div 
            ref={mapRef} 
            className="w-full h-32 rounded-lg border border-gray-300 overflow-hidden"
            style={{ minHeight: '128px' }}
        />
    );
};

// Make available globally
window.MapComponent = MapComponent;
