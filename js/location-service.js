import { APP_CONFIG } from "./config.js";
import { DEMO_LOCATION } from "./data.js";

/**
 * 위치 및 음식점 검색 서비스
 * 카카오 API 연결 여부를 이 모듈에서만 판단해 추천 UI는 실제 데이터와 샘플 데이터를 구분하지 않아도 됩니다.
 */

/** 브라우저 권한을 요청해 현재 위치를 한 번만 가져오며, 정밀 좌표는 저장소에 보관하지 않습니다. */
export function requestCurrentLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("이 브라우저는 위치 기능을 지원하지 않습니다."));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        label: "현재 위치",
        mode: "device",
      }),
      () => reject(new Error("위치 권한을 허용하면 현재 위치 주변의 음식점을 찾을 수 있어요.")),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  });
}

async function searchOneMenuWithKakao(menu, location, radiusMeters) {
  const params = new URLSearchParams({
    query: `${menu.name} 음식점`,
    category_group_code: "FD6",
    x: String(location.longitude),
    y: String(location.latitude),
    radius: String(radiusMeters),
    sort: "distance",
    size: "5",
  });
  const response = await fetch(`https://dapi.kakao.com/v2/local/search/keyword.json?${params}`, {
    headers: { Authorization: `KakaoAK ${APP_CONFIG.kakaoRestApiKey}` },
  });

  if (!response.ok) throw new Error(`카카오 음식점 검색 실패: ${response.status}`);
  const data = await response.json();
  const place = data.documents?.[0];
  if (!place) return null;

  return {
    id: place.id,
    menuId: menu.id,
    menuName: menu.name,
    name: place.place_name,
    category: place.category_name,
    address: place.road_address_name || place.address_name,
    distanceMeters: Number(place.distance || 0),
    latitude: Number(place.y),
    longitude: Number(place.x),
    url: place.place_url,
    isDemo: false,
  };
}

/** API 키가 없을 때도 위치·거리·링크 UI를 확인할 수 있도록 현재 좌표 주변의 샘플 매장을 만듭니다. */
function createDemoPlaces(menus, location, radiusMeters) {
  const isExpanded = radiusMeters > APP_CONFIG.restaurantSearchRadiusMeters;
  const distances = isExpanded ? [1200, 2800, 5200] : [180, 430, 760];
  const prefixes = ["정다운", "오늘의", "동네"];
  const offsets = isExpanded
    ? [
        { latitude: 0.008, longitude: 0.009 },
        { latitude: -0.017, longitude: 0.021 },
        { latitude: 0.033, longitude: -0.035 },
      ]
    : [
        { latitude: 0.0012, longitude: 0.0014 },
        { latitude: -0.0021, longitude: 0.0028 },
        { latitude: 0.003, longitude: -0.0024 },
      ];
  return menus.map((menu, index) => {
    const offset = offsets[index] ?? { latitude: 0.004, longitude: 0.001 };
    const latitude = location.latitude + offset.latitude;
    const longitude = location.longitude + offset.longitude;
    return {
      id: `demo-${menu.id}`,
      menuId: menu.id,
      menuName: menu.name,
      name: `${prefixes[index] ?? "가까운"} ${menu.name}`,
      category: `${menu.category} · 샘플 음식점`,
      address: `${location.label} 주변 샘플 매장`,
      distanceMeters: distances[index] ?? 900,
      latitude,
      longitude,
      url: `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=18/${latitude}/${longitude}`,
      isDemo: true,
    };
  });
}

/** 카카오 연결 실패 시에도 추천 전체가 멈추지 않도록 샘플 데이터로 안전하게 되돌립니다. */
export async function searchRestaurantsForMenus(
  menus,
  location = DEMO_LOCATION,
  { radiusMeters = APP_CONFIG.restaurantSearchRadiusMeters } = {},
) {
  if (!APP_CONFIG.kakaoRestApiKey) {
    return { places: createDemoPlaces(menus, location, radiusMeters), source: "demo", radiusMeters };
  }

  try {
    const places = (await Promise.all(menus.map((menu) => searchOneMenuWithKakao(menu, location, radiusMeters)))).filter(Boolean);
    if (!places.length) throw new Error("주변 검색 결과가 없습니다.");
    return { places, source: "kakao", radiusMeters };
  } catch (error) {
    console.warn("카카오 API 대신 샘플 음식점을 표시합니다.", error);
    return { places: createDemoPlaces(menus, location, radiusMeters), source: "demo-fallback", radiusMeters };
  }
}

export { DEMO_LOCATION };
