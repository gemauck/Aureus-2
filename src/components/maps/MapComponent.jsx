// Get React hooks from window
const { useEffect, useRef, useMemo } = React;

const DEFAULT_CENTER = [-28.4793, 24.6727]; // Approximate center of South Africa
const DEFAULT_ZOOM = 6;
const FOCUSED_ZOOM = 15;

const MapComponent = ({
    latitude,
    longitude,
    siteName = 'Site',
    allowSelection = false,
    onLocationSelect,
    defaultCenter = DEFAULT_CENTER,
    defaultZoom = DEFAULT_ZOOM
}) => {
    const mapRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const markerRef = useRef(null);
    const clickHandlerRef = useRef(null);
    const latestCallbackRef = useRef(onLocationSelect);
    const siteNameRef = useRef(siteName || 'Selected Location');

    useEffect(() => {
        latestCallbackRef.current = onLocationSelect;
    }, [onLocationSelect]);

    useEffect(() => {
        siteNameRef.current = siteName || 'Selected Location';
    }, [siteName]);

    const sanitizedCenter = useMemo(() => {
        if (Array.isArray(defaultCenter) && defaultCenter.length === 2) {
            const lat = parseFloat(defaultCenter[0]);
            const lng = parseFloat(defaultCenter[1]);
            if (Number.isFinite(lat) && Number.isFinite(lng)) {
                return [lat, lng];
            }
        }
        return [0, 0];
    }, [defaultCenter]);

    const sanitizedDefaultZoom = useMemo(() => {
        const parsed = parseInt(defaultZoom, 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_ZOOM;
    }, [defaultZoom]);

    const parseCoordinates = (latValue, lngValue) => {
        const parsedLat = parseFloat(latValue);
        const parsedLng = parseFloat(lngValue);
        if (Number.isFinite(parsedLat) && Number.isFinite(parsedLng)) {
            return [parsedLat, parsedLng];
        }
        return null;
    };

    useEffect(() => {
        if (!mapRef.current || mapInstanceRef.current) {
            return;
        }

        const initialCoords = parseCoordinates(latitude, longitude);
        const initialCenter = initialCoords || sanitizedCenter;
        const initialZoom = initialCoords ? FOCUSED_ZOOM : sanitizedDefaultZoom;

        const map = L.map(mapRef.current).setView(initialCenter, initialZoom);
        mapInstanceRef.current = map;

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19
        }).addTo(map);

        if (initialCoords) {
            markerRef.current = L.marker(initialCoords)
                .addTo(map)
                .bindPopup(siteNameRef.current);
        }

        return () => {
            if (mapInstanceRef.current) {
                const container = mapInstanceRef.current.getContainer();
                if (container) {
                    container.classList.remove('cursor-crosshair');
                }
                mapInstanceRef.current.off();
                mapInstanceRef.current.remove();
                mapInstanceRef.current = null;
            }
            markerRef.current = null;
            clickHandlerRef.current = null;
        };
    }, [latitude, longitude, sanitizedCenter, sanitizedDefaultZoom]);

    useEffect(() => {
        const map = mapInstanceRef.current;
        if (!map) {
            return;
        }

        const coords = parseCoordinates(latitude, longitude);

        if (coords) {
            if (markerRef.current) {
                markerRef.current.setLatLng(coords);
            } else {
                markerRef.current = L.marker(coords).addTo(map);
            }

            markerRef.current.bindPopup(siteNameRef.current);

            const currentZoom = map.getZoom();
            const targetZoom = currentZoom < FOCUSED_ZOOM ? FOCUSED_ZOOM : currentZoom;
            map.setView(coords, targetZoom);
        } else if (markerRef.current) {
            map.removeLayer(markerRef.current);
            markerRef.current = null;
            map.setView(sanitizedCenter, sanitizedDefaultZoom);
        } else {
            map.setView(sanitizedCenter, sanitizedDefaultZoom);
        }
    }, [latitude, longitude, sanitizedCenter, sanitizedDefaultZoom]);

    useEffect(() => {
        const map = mapInstanceRef.current;
        if (!map) {
            return;
        }

        if (clickHandlerRef.current) {
            map.off('click', clickHandlerRef.current);
            map.getContainer().classList.remove('cursor-crosshair');
            clickHandlerRef.current = null;
        }

        if (!allowSelection) {
            return;
        }

        const handleClick = (event) => {
            const { lat, lng } = event.latlng;
            const selectedCoords = [lat, lng];

            if (markerRef.current) {
                markerRef.current.setLatLng(selectedCoords);
            } else {
                markerRef.current = L.marker(selectedCoords).addTo(map);
            }

            markerRef.current.bindPopup(siteNameRef.current);

            if (latestCallbackRef.current && typeof latestCallbackRef.current === 'function') {
                latestCallbackRef.current({
                    latitude: lat,
                    longitude: lng,
                    lat,
                    lng
                });
            }
        };

        map.getContainer().classList.add('cursor-crosshair');
        map.on('click', handleClick);
        clickHandlerRef.current = handleClick;

        return () => {
            map.off('click', handleClick);
            map.getContainer().classList.remove('cursor-crosshair');
            if (clickHandlerRef.current === handleClick) {
                clickHandlerRef.current = null;
            }
        };
    }, [allowSelection]);

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
