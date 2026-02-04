import { useState, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMapEvents, CircleMarker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import cityGraph from './data/cityGraph.json';
import {
    buildAdjacencyList,
    findAccessibleRoute,
    getRouteCoordinates,
    formatDistance,
    estimateTime,
    getEdgeAccessibilityLevel
} from './utils/routing';

// Fix Leaflet default icon issue
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Custom marker icons
const createIcon = (color, label) => {
    return L.divIcon({
        className: 'custom-div-icon',
        html: `<div style="
      background: ${color};
      width: 32px;
      height: 32px;
      border-radius: 50%;
      border: 3px solid white;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: bold;
      font-size: 14px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    ">${label}</div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
    });
};

const startIcon = createIcon('#22c55e', 'А');
const endIcon = createIcon('#ef4444', 'Б');

const barrierIcons = {
    stairs: '🪜',
    curb: '⬆️',
    repair: '🚧',
    narrow: '↔️',
    slope: '⛰️',
    surface: '🔲',
    ramp: '♿',
};

// Default user profile
const defaultProfile = {
    mobilityType: 'wheelchair',
    maxCurbHeight: 5,
    maxSlope: 8,
    minWidth: 90,
    voiceEnabled: false,
};

// Map click handler component
function MapClickHandler({ onMapClick, isSelectingPoint }) {
    useMapEvents({
        click: (e) => {
            if (isSelectingPoint) {
                onMapClick(e.latlng);
            }
        },
    });
    return null;
}

// Component to fly to location
function FlyToLocation({ position }) {
    const map = useMap();
    if (position) {
        map.flyTo(position, 16, { duration: 1 });
    }
    return null;
}

// Main App component
export default function App() {
    // State
    const [profile, setProfile] = useState(defaultProfile);
    const [startPoint, setStartPoint] = useState(null);
    const [endPoint, setEndPoint] = useState(null);
    const [selectingPoint, setSelectingPoint] = useState(null); // 'start' | 'end' | null
    const [route, setRoute] = useState(null);
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [showReportModal, setShowReportModal] = useState(false);
    const [reportLocation, setReportLocation] = useState(null);
    const [userLocation, setUserLocation] = useState(null);
    const [toast, setToast] = useState(null);
    const [flyTo, setFlyTo] = useState(null);

    // Build graph once
    const graph = useMemo(() => {
        return buildAdjacencyList(cityGraph.nodes, cityGraph.edges);
    }, []);

    const nodeMap = useMemo(() => {
        return new Map(cityGraph.nodes.map(n => [n.id, n]));
    }, []);

    // Find nearest node to a location
    const findNearestNode = useCallback((latlng) => {
        let nearest = null;
        let minDist = Infinity;

        cityGraph.nodes.forEach(node => {
            const dist = Math.sqrt(
                Math.pow(node.lat - latlng.lat, 2) +
                Math.pow(node.lng - latlng.lng, 2)
            );
            if (dist < minDist) {
                minDist = dist;
                nearest = node;
            }
        });

        return nearest;
    }, []);

    // Handle map click
    const handleMapClick = useCallback((latlng) => {
        const nearestNode = findNearestNode(latlng);

        if (selectingPoint === 'start') {
            setStartPoint(nearestNode);
            setSelectingPoint(null);
            showToast('Точка отправления установлена', 'success');
        } else if (selectingPoint === 'end') {
            setEndPoint(nearestNode);
            setSelectingPoint(null);
            showToast('Точка назначения установлена', 'success');
        }
    }, [selectingPoint, findNearestNode]);

    // Show toast notification
    const showToast = (message, type = 'info') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

    // Build route
    const buildRoute = useCallback(() => {
        if (!startPoint || !endPoint) {
            showToast('Выберите точки А и Б на карте', 'warning');
            return;
        }

        const result = findAccessibleRoute(graph, cityGraph.nodes, startPoint.id, endPoint.id, profile);

        if (result.notFound || result.path.length === 0) {
            showToast('Маршрут не найден. Попробуйте изменить параметры доступности.', 'error');
            return;
        }

        const coordinates = getRouteCoordinates(result.path, nodeMap);
        setRoute({ ...result, coordinates });
        showToast('Маршрут построен!', 'success');
    }, [startPoint, endPoint, profile, graph, nodeMap]);

    // Clear route
    const clearRoute = () => {
        setStartPoint(null);
        setEndPoint(null);
        setRoute(null);
    };

    // Get user location
    const getUserLocation = () => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const loc = {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude,
                    };
                    setUserLocation(loc);
                    setFlyTo([loc.lat, loc.lng]);
                    showToast('Местоположение определено', 'success');
                },
                (error) => {
                    showToast('Не удалось определить местоположение', 'error');
                    // Default to Moscow center
                    setFlyTo([55.7558, 37.6173]);
                }
            );
        }
    };

    // Handle report submission
    const handleReportSubmit = (reportData) => {
        // In demo mode, just show success
        showToast('Спасибо! Ваше сообщение отправлено на проверку.', 'success');
        setShowReportModal(false);
        setReportLocation(null);
    };

    // Update profile
    const updateProfile = (key, value) => {
        setProfile(prev => ({ ...prev, [key]: value }));
    };

    // Get accessibility color for edge
    const getEdgeColor = (edge) => {
        const level = getEdgeAccessibilityLevel(edge, profile);
        switch (level) {
            case 'accessible': return '#22c55e';
            case 'partial': return '#eab308';
            case 'inaccessible': return '#ef4444';
            default: return '#94a3b8';
        }
    };

    return (
        <div className="app-container">
            {/* Skip link for accessibility */}
            <a href="#main-content" className="skip-link">
                Перейти к основному содержимому
            </a>

            {/* Header */}
            <header className="app-header" role="banner">
                <div className="app-logo">
                    <svg viewBox="0 0 100 100" aria-hidden="true">
                        <circle cx="50" cy="50" r="45" fill="#2563eb" />
                        <path d="M30 55 L50 35 L70 55 M50 35 L50 70" stroke="white" strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                        <circle cx="50" cy="25" r="8" fill="white" />
                    </svg>
                    <h1>Дроны доступности</h1>
                </div>

                <button
                    className="btn btn-secondary sidebar-toggle"
                    onClick={() => setSidebarOpen(!sidebarOpen)}
                    aria-expanded={sidebarOpen}
                    aria-controls="sidebar"
                    aria-label={sidebarOpen ? 'Закрыть панель' : 'Открыть панель'}
                >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        {sidebarOpen ? (
                            <path d="M18 6L6 18M6 6l12 12" />
                        ) : (
                            <path d="M4 6h16M4 12h16M4 18h16" />
                        )}
                    </svg>
                </button>
            </header>

            {/* Main content */}
            <main className="app-main" id="main-content" role="main">
                {/* Map */}
                <div className="map-wrapper">
                    <MapContainer
                        center={[55.7558, 37.6173]}
                        zoom={15}
                        className="map-container"
                        zoomControl={true}
                    >
                        <TileLayer
                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        />

                        <MapClickHandler onMapClick={handleMapClick} isSelectingPoint={!!selectingPoint} />
                        {flyTo && <FlyToLocation position={flyTo} />}

                        {/* Accessibility layer - edges */}
                        {cityGraph.edges.map((edge, idx) => {
                            const fromNode = nodeMap.get(edge.from);
                            const toNode = nodeMap.get(edge.to);
                            if (!fromNode || !toNode) return null;

                            return (
                                <Polyline
                                    key={`edge-${idx}`}
                                    positions={[[fromNode.lat, fromNode.lng], [toNode.lat, toNode.lng]]}
                                    color={getEdgeColor(edge)}
                                    weight={4}
                                    opacity={0.6}
                                />
                            );
                        })}

                        {/* Route */}
                        {route && route.coordinates.length > 0 && (
                            <Polyline
                                positions={route.coordinates}
                                color="#3b82f6"
                                weight={6}
                                opacity={0.9}
                            />
                        )}

                        {/* Start marker */}
                        {startPoint && (
                            <Marker
                                position={[startPoint.lat, startPoint.lng]}
                                icon={startIcon}
                            >
                                <Popup>
                                    <div className="popup-content">
                                        <div className="popup-title">Точка А (Старт)</div>
                                        <div className="popup-text">{startPoint.name}</div>
                                    </div>
                                </Popup>
                            </Marker>
                        )}

                        {/* End marker */}
                        {endPoint && (
                            <Marker
                                position={[endPoint.lat, endPoint.lng]}
                                icon={endIcon}
                            >
                                <Popup>
                                    <div className="popup-content">
                                        <div className="popup-title">Точка Б (Финиш)</div>
                                        <div className="popup-text">{endPoint.name}</div>
                                    </div>
                                </Popup>
                            </Marker>
                        )}

                        {/* Barriers */}
                        {cityGraph.barriers.map((barrier) => (
                            <CircleMarker
                                key={barrier.id}
                                center={[barrier.lat, barrier.lng]}
                                radius={12}
                                fillColor={barrier.severity === 'none' ? '#22c55e' : barrier.severity === 'high' ? '#ef4444' : '#eab308'}
                                fillOpacity={0.8}
                                color="white"
                                weight={2}
                            >
                                <Popup>
                                    <div className="popup-content">
                                        <div className="popup-title">
                                            {barrierIcons[barrier.type]} {barrier.type === 'stairs' ? 'Лестница' :
                                                barrier.type === 'curb' ? 'Бордюр' :
                                                    barrier.type === 'repair' ? 'Ремонт' :
                                                        barrier.type === 'narrow' ? 'Узкий проход' :
                                                            barrier.type === 'slope' ? 'Уклон' :
                                                                barrier.type === 'ramp' ? 'Пандус' : 'Барьер'}
                                        </div>
                                        <div className="popup-text">{barrier.description}</div>
                                        {barrier.severity !== 'none' && (
                                            <div className="popup-warning">
                                                ⚠️ {barrier.severity === 'high' ? 'Требуется помощь' : 'Осторожно'}
                                            </div>
                                        )}
                                    </div>
                                </Popup>
                            </CircleMarker>
                        ))}

                        {/* User location */}
                        {userLocation && (
                            <CircleMarker
                                center={[userLocation.lat, userLocation.lng]}
                                radius={10}
                                fillColor="#3b82f6"
                                fillOpacity={1}
                                color="white"
                                weight={3}
                            >
                                <Popup>Ваше местоположение</Popup>
                            </CircleMarker>
                        )}
                    </MapContainer>

                    {/* Floating action buttons */}
                    <div className="fab-container">
                        <button
                            className="btn btn-danger fab"
                            onClick={() => {
                                setShowReportModal(true);
                                setSelectingPoint(null);
                            }}
                            aria-label="Сообщить о барьере"
                            title="Сообщить о барьере"
                        >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                        </button>
                    </div>

                    {/* Location button */}
                    <button
                        className="btn btn-secondary btn-icon location-btn"
                        onClick={getUserLocation}
                        aria-label="Определить местоположение"
                        title="Мое местоположение"
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="3" />
                            <path d="M12 2v4m0 12v4M2 12h4m12 0h4" />
                        </svg>
                    </button>
                </div>

                {/* Sidebar */}
                <aside
                    id="sidebar"
                    className={`sidebar ${sidebarOpen ? 'open' : ''}`}
                    role="complementary"
                    aria-label="Панель управления"
                >
                    <div className="sidebar-header">
                        <h2 className="sidebar-title">Построение маршрута</h2>
                        <p className="sidebar-subtitle">Найдите доступный путь</p>
                    </div>

                    <div className="sidebar-content">
                        {/* Route points */}
                        <section className="sidebar-section" aria-labelledby="route-section-title">
                            <h3 className="section-title" id="route-section-title">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 1118 0z" />
                                    <circle cx="12" cy="10" r="3" />
                                </svg>
                                Маршрут
                            </h3>

                            <div className="route-points">
                                <div className="route-point">
                                    <div className="route-point-marker start">А</div>
                                    <div className="route-point-content">
                                        <span className="route-point-label">Откуда</span>
                                        <span className={`route-point-value ${!startPoint ? 'placeholder' : ''}`}>
                                            {startPoint ? startPoint.name : 'Выберите на карте'}
                                        </span>
                                    </div>
                                    <button
                                        className={`btn btn-secondary btn-icon ${selectingPoint === 'start' ? 'btn-primary' : ''}`}
                                        onClick={() => setSelectingPoint(selectingPoint === 'start' ? null : 'start')}
                                        aria-label="Выбрать точку отправления на карте"
                                        aria-pressed={selectingPoint === 'start'}
                                    >
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <circle cx="12" cy="12" r="10" />
                                            <path d="M12 8v8m-4-4h8" />
                                        </svg>
                                    </button>
                                </div>

                                <div className="route-point">
                                    <div className="route-point-marker end">Б</div>
                                    <div className="route-point-content">
                                        <span className="route-point-label">Куда</span>
                                        <span className={`route-point-value ${!endPoint ? 'placeholder' : ''}`}>
                                            {endPoint ? endPoint.name : 'Выберите на карте'}
                                        </span>
                                    </div>
                                    <button
                                        className={`btn btn-secondary btn-icon ${selectingPoint === 'end' ? 'btn-primary' : ''}`}
                                        onClick={() => setSelectingPoint(selectingPoint === 'end' ? null : 'end')}
                                        aria-label="Выбрать точку назначения на карте"
                                        aria-pressed={selectingPoint === 'end'}
                                    >
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <circle cx="12" cy="12" r="10" />
                                            <path d="M12 8v8m-4-4h8" />
                                        </svg>
                                    </button>
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: 'var(--spacing-sm)', marginTop: 'var(--spacing-md)' }}>
                                <button
                                    className="btn btn-success"
                                    style={{ flex: 1 }}
                                    onClick={buildRoute}
                                    disabled={!startPoint || !endPoint}
                                >
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l5.447 2.724A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                                    </svg>
                                    Построить маршрут
                                </button>
                                {route && (
                                    <button
                                        className="btn btn-secondary btn-icon"
                                        onClick={clearRoute}
                                        aria-label="Очистить маршрут"
                                    >
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M18 6L6 18M6 6l12 12" />
                                        </svg>
                                    </button>
                                )}
                            </div>
                        </section>

                        {/* Route info */}
                        {route && (
                            <section className="sidebar-section" aria-labelledby="route-info-title">
                                <div className="route-info">
                                    <div className="route-info-header">
                                        <h3 className="route-info-title" id="route-info-title">Информация о маршруте</h3>
                                        <span className={`route-info-badge ${route.accessibilityScore >= 80 ? 'accessible' : 'partial'}`}>
                                            {route.accessibilityScore >= 80 ? '✓ Доступен' : '⚠ Частично'}
                                        </span>
                                    </div>
                                    <div className="route-info-stats">
                                        <div className="route-stat">
                                            <div className="route-stat-value">{formatDistance(route.totalDistance)}</div>
                                            <div className="route-stat-label">Расстояние</div>
                                        </div>
                                        <div className="route-stat">
                                            <div className="route-stat-value">{estimateTime(route.totalDistance, profile)}</div>
                                            <div className="route-stat-label">Время</div>
                                        </div>
                                        <div className="route-stat">
                                            <div className="route-stat-value">{route.accessibilityScore}%</div>
                                            <div className="route-stat-label">Доступность</div>
                                        </div>
                                    </div>
                                    {route.issues.length > 0 && (
                                        <div style={{ marginTop: 'var(--spacing-md)' }}>
                                            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-warning)', marginBottom: 'var(--spacing-xs)' }}>
                                                ⚠️ Внимание: {route.issues.length} проблемных участков
                                            </div>
                                            {route.issues.slice(0, 3).map((issue, idx) => (
                                                <div key={idx} style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                                                    • {issue.reasons.join(', ')}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </section>
                        )}

                        {/* Profile settings */}
                        <section className="sidebar-section" aria-labelledby="profile-section-title">
                            <h3 className="section-title" id="profile-section-title">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                                    <circle cx="12" cy="7" r="4" />
                                </svg>
                                Профиль доступности
                            </h3>

                            <div className="form-group">
                                <label className="form-label" htmlFor="mobility-type">Способ передвижения</label>
                                <select
                                    id="mobility-type"
                                    className="form-select"
                                    value={profile.mobilityType}
                                    onChange={(e) => updateProfile('mobilityType', e.target.value)}
                                >
                                    <option value="wheelchair">♿ Инвалидная коляска</option>
                                    <option value="wheelchair_assisted">👥 Коляска с сопровождающим</option>
                                    <option value="stroller">👶 Детская коляска</option>
                                    <option value="crutches">🦯 Костыли/трость</option>
                                </select>
                            </div>

                            <div className="form-group">
                                <div className="range-container">
                                    <div className="range-header">
                                        <label className="form-label" htmlFor="curb-height">Макс. высота бордюра</label>
                                        <span className="range-value">{profile.maxCurbHeight} см</span>
                                    </div>
                                    <input
                                        type="range"
                                        id="curb-height"
                                        className="range-input"
                                        min="0"
                                        max="15"
                                        value={profile.maxCurbHeight}
                                        onChange={(e) => updateProfile('maxCurbHeight', parseInt(e.target.value))}
                                    />
                                </div>
                            </div>

                            <div className="form-group">
                                <div className="range-container">
                                    <div className="range-header">
                                        <label className="form-label" htmlFor="max-slope">Макс. уклон</label>
                                        <span className="range-value">{profile.maxSlope}%</span>
                                    </div>
                                    <input
                                        type="range"
                                        id="max-slope"
                                        className="range-input"
                                        min="0"
                                        max="15"
                                        value={profile.maxSlope}
                                        onChange={(e) => updateProfile('maxSlope', parseInt(e.target.value))}
                                    />
                                </div>
                            </div>

                            <div className="form-group">
                                <div className="range-container">
                                    <div className="range-header">
                                        <label className="form-label" htmlFor="min-width">Мин. ширина прохода</label>
                                        <span className="range-value">{profile.minWidth} см</span>
                                    </div>
                                    <input
                                        type="range"
                                        id="min-width"
                                        className="range-input"
                                        min="60"
                                        max="150"
                                        step="10"
                                        value={profile.minWidth}
                                        onChange={(e) => updateProfile('minWidth', parseInt(e.target.value))}
                                    />
                                </div>
                            </div>

                            <div className="toggle-container">
                                <span className="toggle-label">Голосовые подсказки</span>
                                <label className="toggle-switch">
                                    <input
                                        type="checkbox"
                                        className="toggle-input"
                                        checked={profile.voiceEnabled}
                                        onChange={(e) => updateProfile('voiceEnabled', e.target.checked)}
                                    />
                                    <span className="toggle-slider"></span>
                                </label>
                            </div>
                        </section>

                        {/* Legend */}
                        <section className="sidebar-section" aria-labelledby="legend-section-title">
                            <h3 className="section-title" id="legend-section-title">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <rect x="3" y="3" width="18" height="18" rx="2" />
                                    <path d="M3 9h18M9 21V9" />
                                </svg>
                                Условные обозначения
                            </h3>

                            <div className="legend">
                                <div className="legend-item">
                                    <div className="legend-color accessible"></div>
                                    <span>Доступно</span>
                                </div>
                                <div className="legend-item">
                                    <div className="legend-color partial"></div>
                                    <span>Частично</span>
                                </div>
                                <div className="legend-item">
                                    <div className="legend-color inaccessible"></div>
                                    <span>Недоступно</span>
                                </div>
                            </div>

                            <div className="legend" style={{ marginTop: 'var(--spacing-sm)' }}>
                                <div className="legend-item">
                                    <div className="legend-marker">Л</div>
                                    <span>Лестница</span>
                                </div>
                                <div className="legend-item">
                                    <div className="legend-marker">Р</div>
                                    <span>Ремонт</span>
                                </div>
                                <div className="legend-item">
                                    <div className="legend-marker">П</div>
                                    <span>Пандус</span>
                                </div>
                            </div>
                        </section>
                    </div>
                </aside>
            </main>

            {/* Report Modal */}
            {showReportModal && (
                <ReportModal
                    onClose={() => setShowReportModal(false)}
                    onSubmit={handleReportSubmit}
                />
            )}

            {/* Toast notifications */}
            {toast && (
                <div className="toast-container" role="alert" aria-live="polite">
                    <div className="toast">
                        <span className={`toast-icon ${toast.type}`}>
                            {toast.type === 'success' ? '✓' : toast.type === 'error' ? '✕' : '⚠'}
                        </span>
                        <span className="toast-message">{toast.message}</span>
                    </div>
                </div>
            )}
        </div>
    );
}

// Report Modal Component
function ReportModal({ onClose, onSubmit }) {
    const [barrierType, setBarrierType] = useState('');
    const [comment, setComment] = useState('');

    const barrierTypes = [
        { id: 'stairs', icon: '🪜', label: 'Лестница' },
        { id: 'curb', icon: '⬆️', label: 'Высокий бордюр' },
        { id: 'narrow', icon: '↔️', label: 'Узкий проход' },
        { id: 'repair', icon: '🚧', label: 'Ремонт' },
        { id: 'slope', icon: '⛰️', label: 'Крутой уклон' },
        { id: 'other', icon: '❓', label: 'Другое' },
    ];

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!barrierType) return;
        onSubmit({ barrierType, comment });
    };

    return (
        <div
            className="modal-overlay"
            onClick={(e) => e.target === e.currentTarget && onClose()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="report-modal-title"
        >
            <div className="modal">
                <div className="modal-header">
                    <h2 className="modal-title" id="report-modal-title">Сообщить о барьере</h2>
                    <button
                        className="modal-close"
                        onClick={onClose}
                        aria-label="Закрыть"
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="modal-body">
                        <div className="form-group">
                            <label className="form-label">Тип барьера</label>
                            <div className="barrier-types">
                                {barrierTypes.map((type) => (
                                    <button
                                        key={type.id}
                                        type="button"
                                        className={`barrier-type ${barrierType === type.id ? 'selected' : ''}`}
                                        onClick={() => setBarrierType(type.id)}
                                    >
                                        <span className="barrier-type-icon">{type.icon}</span>
                                        <span className="barrier-type-label">{type.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="form-group">
                            <label className="form-label" htmlFor="report-comment">Комментарий (необязательно)</label>
                            <textarea
                                id="report-comment"
                                className="form-textarea"
                                placeholder="Опишите проблему подробнее..."
                                value={comment}
                                onChange={(e) => setComment(e.target.value)}
                            />
                        </div>

                        <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>
                            💡 Нажмите на карту, чтобы указать местоположение барьера
                        </p>
                    </div>

                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={onClose}>
                            Отмена
                        </button>
                        <button
                            type="submit"
                            className="btn btn-primary"
                            disabled={!barrierType}
                        >
                            Отправить
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
