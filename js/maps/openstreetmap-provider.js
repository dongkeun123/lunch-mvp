import { escapeHtml } from "../utils.js";

/**
 * OpenStreetMap 지도 공급자
 * Leaflet과 OSM 타일에 관한 코드는 이 파일에만 존재합니다. 앱은 공통 render 데이터만 전달하므로
 * Kakao 지도 전환 시 같은 메서드를 가진 새 공급자 파일을 추가하면 됩니다.
 */
const LEAFLET_CSS_URL = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_JS_URL = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
const LEAFLET_CSS_INTEGRITY = "sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=";
const LEAFLET_JS_INTEGRITY = "sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=";

let leafletLoader = null;

function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (leafletLoader) return leafletLoader;

  leafletLoader = new Promise((resolve, reject) => {
    if (!document.querySelector(`link[href="${LEAFLET_CSS_URL}"]`)) {
      const stylesheet = document.createElement("link");
      stylesheet.rel = "stylesheet";
      stylesheet.href = LEAFLET_CSS_URL;
      stylesheet.integrity = LEAFLET_CSS_INTEGRITY;
      stylesheet.crossOrigin = "anonymous";
      document.head.append(stylesheet);
    }

    const existingScript = document.querySelector(`script[src="${LEAFLET_JS_URL}"]`);
    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(window.L), { once: true });
      existingScript.addEventListener("error", () => reject(new Error("지도 라이브러리를 불러오지 못했습니다.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = LEAFLET_JS_URL;
    script.integrity = LEAFLET_JS_INTEGRITY;
    script.crossOrigin = "anonymous";
    script.addEventListener("load", () => resolve(window.L), { once: true });
    script.addEventListener("error", () => reject(new Error("지도 라이브러리를 불러오지 못했습니다.")), { once: true });
    document.head.append(script);
  });

  return leafletLoader;
}

function hasCoordinates(item) {
  if (item?.latitude == null || item?.longitude == null || item.latitude === "" || item.longitude === "") return false;
  return Number.isFinite(Number(item?.latitude)) && Number.isFinite(Number(item?.longitude));
}

function markerIcon(Leaflet, type) {
  const label = type === "favorite" ? "★" : type === "current" ? "" : "●";
  return Leaflet.divIcon({
    className: "map-marker-shell",
    html: `<span class="map-marker map-marker--${type}" aria-hidden="true"><span>${label}</span></span>`,
    iconSize: [30, 38],
    iconAnchor: [15, 34],
    popupAnchor: [0, -30],
  });
}

function popupContent(place, isFavorite) {
  return `
    <div class="map-popup">
      <span>${isFavorite ? "저장한 장소" : "추천 장소"}</span>
      <strong>${escapeHtml(place.name)}</strong>
      <small>${escapeHtml(place.address || place.category || "")}</small>
    </div>
  `;
}

export class OpenStreetMapProvider {
  constructor(config) {
    this.config = config;
    this.Leaflet = null;
    this.map = null;
    this.markerLayer = null;
  }

  /** 지도와 타일 계층은 최초 한 번만 만들며 OSM 저작자 표시를 항상 노출합니다. */
  async initialize(container, center) {
    this.Leaflet = await loadLeaflet();
    this.map = this.Leaflet.map(container, { scrollWheelZoom: false }).setView(
      [center.latitude, center.longitude],
      this.config.defaultZoom,
    );
    this.Leaflet.tileLayer(this.config.tileUrl, {
      attribution: this.config.attribution,
      maxZoom: 19,
    }).addTo(this.map);
    this.markerLayer = this.Leaflet.layerGroup().addTo(this.map);
  }

  /** 현재 위치, 추천 장소, 저장 장소를 합치고 동일 장소는 저장 마커로 우선 표시합니다. */
  render({ currentLocation, recommendedPlaces = [], favoritePlaces = [] }) {
    if (!this.map || !this.markerLayer) return;
    this.markerLayer.clearLayers();
    const bounds = [];

    if (hasCoordinates(currentLocation)) {
      const currentPoint = [Number(currentLocation.latitude), Number(currentLocation.longitude)];
      this.Leaflet.marker(currentPoint, {
        icon: markerIcon(this.Leaflet, "current"),
        title: currentLocation.label || "현재 위치",
      }).bindPopup(`<div class="map-popup"><strong>${escapeHtml(currentLocation.label || "현재 위치")}</strong></div>`).addTo(this.markerLayer);
      bounds.push(currentPoint);
    }

    const combinedPlaces = new Map(recommendedPlaces.map((place) => [place.id, { ...place, isFavorite: false }]));
    favoritePlaces.forEach((place) => {
      combinedPlaces.set(place.id, { ...(combinedPlaces.get(place.id) || {}), ...place, isFavorite: true });
    });

    combinedPlaces.forEach((place) => {
      if (!hasCoordinates(place)) return;
      const point = [Number(place.latitude), Number(place.longitude)];
      this.Leaflet.marker(point, {
        icon: markerIcon(this.Leaflet, place.isFavorite ? "favorite" : "recommend"),
        title: place.name,
      }).bindPopup(popupContent(place, place.isFavorite)).addTo(this.markerLayer);
      bounds.push(point);
    });

    this.map.invalidateSize();
    if (bounds.length > 1) this.map.fitBounds(bounds, { padding: [34, 34], maxZoom: 16 });
    else if (bounds.length === 1) this.map.setView(bounds[0], 15);
  }

  destroy() {
    this.map?.remove();
    this.map = null;
    this.markerLayer = null;
  }
}
