/**
 * 브라우저 저장소 모듈
 * 선택 기록과 로컬 투표방 데이터의 읽기/쓰기를 한곳에 모아 저장 형식 변경과 오류 확인을 쉽게 합니다.
 */
const HISTORY_KEY = "lunch-pick:history:v1";
const ROOMS_KEY = "lunch-pick:rooms:v1";
const FAVORITES_KEY = "lunch-pick:favorite-places:v1";

function readJson(key, fallback) {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
  } catch (error) {
    console.warn(`저장된 데이터(${key})를 읽지 못했습니다.`, error);
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.warn(`데이터(${key})를 저장하지 못했습니다.`, error);
    return false;
  }
}

/** 선택 삭제에 사용할 기록 ID를 만듭니다. 기존 기록에는 getHistory에서 자동으로 ID를 보완합니다. */
function createHistoryId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `history-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getStoredSelectionCount(entry) {
  const count = Number(entry?.selectionCount);
  return Number.isInteger(count) && count > 0 ? count : 1;
}

/** 최근 30개의 선택만 보관해 취향 점수가 오래된 기록에 과도하게 좌우되지 않도록 합니다. */
export function addHistory(menu) {
  const history = getHistory();
  const previousEntry = history.find((entry) => entry.menuId === menu.id);
  const latestEntry = {
    id: previousEntry?.id ?? createHistoryId(),
    menuId: menu.id,
    name: menu.name,
    category: menu.category,
    selectedAt: new Date().toISOString(),
    selectionCount: previousEntry ? getStoredSelectionCount(previousEntry) + 1 : 1,
  };

  // 같은 메뉴는 기존 행을 제거하고 최신 선택 정보 한 건만 맨 위에 둡니다.
  const nextHistory = [latestEntry, ...history.filter((entry) => entry.menuId !== menu.id)];
  writeJson(HISTORY_KEY, nextHistory.slice(0, 30));
}

export function getHistory() {
  const history = readJson(HISTORY_KEY, []);
  if (!Array.isArray(history)) return [];

  let didMigrate = false;
  const historyByMenu = new Map();
  history.forEach((entry) => {
    const menuKey = entry?.menuId || `${entry?.name ?? "unknown"}:${entry?.category ?? "unknown"}`;
    const normalizedEntry = {
      ...entry,
      id: entry?.id || createHistoryId(),
      selectionCount: getStoredSelectionCount(entry),
    };
    if (!entry?.id || entry?.selectionCount == null) didMigrate = true;

    const previousEntry = historyByMenu.get(menuKey);
    if (!previousEntry) {
      historyByMenu.set(menuKey, normalizedEntry);
      return;
    }

    // 예전 형식에 같은 메뉴가 여러 줄이면 횟수는 합치고 가장 최근 선택 정보만 남깁니다.
    didMigrate = true;
    const latestEntry = new Date(normalizedEntry.selectedAt).getTime() > new Date(previousEntry.selectedAt).getTime()
      ? normalizedEntry
      : previousEntry;
    historyByMenu.set(menuKey, {
      ...latestEntry,
      selectionCount: previousEntry.selectionCount + normalizedEntry.selectionCount,
    });
  });

  const normalizedHistory = [...historyByMenu.values()]
    .sort((left, right) => new Date(right.selectedAt).getTime() - new Date(left.selectedAt).getTime());
  if (didMigrate) writeJson(HISTORY_KEY, normalizedHistory);
  return normalizedHistory;
}

/** 체크한 기록 ID만 제거하고 실제로 삭제된 개수를 반환합니다. */
export function removeHistoryEntries(historyIds) {
  const targetIds = new Set(historyIds);
  const history = getHistory();
  const nextHistory = history.filter((entry) => !targetIds.has(entry.id));
  writeJson(HISTORY_KEY, nextHistory);
  window.dispatchEvent(new CustomEvent("lunch-history-updated"));
  return history.length - nextHistory.length;
}

/** 저장 장소는 지도 복원에 필요한 최소 정보만 보관하며 위치 권한으로 얻은 현재 좌표는 저장하지 않습니다. */
export function getFavoritePlaces() {
  const places = readJson(FAVORITES_KEY, []);
  return Array.isArray(places) ? places : [];
}

export function isFavoritePlace(placeId) {
  return getFavoritePlaces().some((place) => place.id === placeId);
}

/** 동일 장소는 한 번만 저장하며 다시 누르면 저장을 해제하는 토글 방식입니다. */
export function toggleFavoritePlace(place) {
  const places = getFavoritePlaces();
  const exists = places.some((item) => item.id === place.id);
  const nextPlaces = exists
    ? places.filter((item) => item.id !== place.id)
    : [{
        id: place.id,
        name: place.name,
        category: place.category,
        address: place.address,
        latitude: Number(place.latitude),
        longitude: Number(place.longitude),
        url: place.url,
        savedAt: new Date().toISOString(),
      }, ...places];

  writeJson(FAVORITES_KEY, nextPlaces);
  window.dispatchEvent(new CustomEvent("favorite-places-updated"));
  return !exists;
}

export function removeFavoritePlace(placeId) {
  const nextPlaces = getFavoritePlaces().filter((place) => place.id !== placeId);
  writeJson(FAVORITES_KEY, nextPlaces);
  window.dispatchEvent(new CustomEvent("favorite-places-updated"));
}

/** 투표방은 id를 키로 둔 객체로 저장해 특정 방만 빠르게 갱신합니다. */
export function getRooms() {
  const rooms = readJson(ROOMS_KEY, {});
  return rooms && typeof rooms === "object" ? rooms : {};
}

export function getRoom(roomId) {
  return getRooms()[roomId] ?? null;
}

export function saveRoom(room) {
  const rooms = getRooms();
  rooms[room.id] = room;
  writeJson(ROOMS_KEY, rooms);
  window.dispatchEvent(new CustomEvent("lunch-room-updated", { detail: { roomId: room.id } }));
}

export function deleteRoom(roomId) {
  const rooms = getRooms();
  delete rooms[roomId];
  writeJson(ROOMS_KEY, rooms);
  window.dispatchEvent(new CustomEvent("lunch-room-updated", { detail: { roomId } }));
}

export const STORAGE_KEYS = Object.freeze({ history: HISTORY_KEY, rooms: ROOMS_KEY, favorites: FAVORITES_KEY });
