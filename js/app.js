import { MENUS } from "./data.js";
import { APP_CONFIG } from "./config.js";
import { DEMO_LOCATION, requestCurrentLocation, searchRestaurantsForMenus } from "./location-service.js";
import {
  getRecommendationConditions,
  getRecommendationReason,
  isExactRecommendationMatch,
  pickMenus,
  summarizePreferences,
} from "./recommendation.js";
import {
  addHistory,
  clearHistory,
  getFavoritePlaces,
  getHistory,
  removeFavoritePlace,
  STORAGE_KEYS,
  toggleFavoritePlace,
} from "./storage.js";
import { escapeHtml, formatDateTime, formatPrice } from "./utils.js";
import { initVotingRoom, renderActiveRoom, setSuggestedCandidates } from "./voting-room.js";
import { MapController } from "./maps/map-controller.js";

/**
 * 애플리케이션 진입점
 * 화면 라우팅과 각 기능 모듈을 연결하며, 추천·위치·기록·투표의 세부 규칙은 각각의 파일에 맡깁니다.
 */
const form = document.querySelector("#recommend-form");
const results = document.querySelector("#results");
const menuList = document.querySelector("#menu-list");
const summary = document.querySelector("#result-summary");
const selectButton = document.querySelector("#select-button");
const retryButton = document.querySelector("#retry-button");
const relaxSuggestion = document.querySelector("#relax-suggestion");
const selectionMessage = document.querySelector("#selection-message");
const preferenceSummary = document.querySelector("#preference-summary");
const historyList = document.querySelector("#history-list");
const restaurantSection = document.querySelector("#restaurant-section");
const restaurantList = document.querySelector("#restaurant-list");
const restaurantSource = document.querySelector("#restaurant-source");
const locationButton = document.querySelector("#location-button");
const locationStatus = document.querySelector("#location-status");
const recommendButton = document.querySelector("#recommend-button");
const formValidationMessage = document.querySelector("#form-validation-message");
const mapContainer = document.querySelector("#restaurant-map");
const mapStatus = document.querySelector("#map-status");
const mapSummary = document.querySelector("#map-summary");
const savedPlaceList = document.querySelector("#saved-place-list");

let currentLocation = DEMO_LOCATION;
let lastShownIds = [];
let currentPicks = [];
let currentPlaces = [];
let restaurantRequestId = 0;
let retryRequestCount = 0;
let recommendationExpansion = { expandDistance: false, relaxConditions: false };
const mapController = new MapController();
let mapInitializePromise = null;

/** 외부 API가 돌려준 링크는 http/https만 허용해 안전한 새 탭 링크로 만듭니다. */
function safeExternalUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "#";
  } catch {
    return "#";
  }
}

/** 해시를 간단한 두 화면 라우터로 사용해 새로고침과 GNB 이동 상태를 유지합니다. */
function renderRoute() {
  const isGroupOrder = window.location.hash === "#group-order" || window.location.hash.startsWith("#room=");
  const isMyLog = window.location.hash === "#my-log";
  const activeRoute = isGroupOrder ? "group-order" : isMyLog ? "my-log" : "recommend";

  document.querySelectorAll("[data-page]").forEach((page) => {
    page.hidden = page.dataset.page !== activeRoute;
  });
  document.querySelectorAll("[data-route-link]").forEach((link) => {
    const isActive = link.dataset.routeLink === activeRoute;
    link.classList.toggle("is-active", isActive);
    if (isActive) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });

  if (isGroupOrder) renderActiveRoom();
  if (isMyLog) {
    renderPreferenceAndHistory();
    renderSavedPlaces();
    window.requestAnimationFrame(ensureMapInitialized);
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/** 선택 기록과 학습된 카테고리 취향을 추천 폼 아래에 즉시 갱신합니다. */
function renderPreferenceAndHistory() {
  const history = getHistory();
  preferenceSummary.textContent = summarizePreferences(history);

  if (!history.length) {
    historyList.innerHTML = '<p class="empty-state">아직 기록이 없어요. 오늘 메뉴를 선택하면 여기에 쌓여요.</p>';
    return;
  }

  historyList.innerHTML = history.slice(0, 6).map((entry) => `
    <article class="history-item">
      <span><strong>${escapeHtml(entry.name)}</strong><small>${escapeHtml(entry.category)}</small></span>
      <time datetime="${escapeHtml(entry.selectedAt)}">${escapeHtml(formatDateTime(entry.selectedAt))}</time>
    </article>
  `).join("");
}

/** 지도에는 추천 결과와 저장 장소를 함께 전달하며 실제 지도 공급자 종류는 컨트롤러가 결정합니다. */
function renderMapState() {
  const favoritePlaces = getFavoritePlaces();
  mapSummary.textContent = `저장 ${favoritePlaces.length}`;
  mapController.render({
    currentLocation,
    recommendedPlaces: [],
    favoritePlaces,
  });
}

/** 지도 화면에 처음 들어갈 때만 공급자를 초기화해 숨겨진 컨테이너의 크기 오류와 불필요한 타일 요청을 막습니다. */
function ensureMapInitialized() {
  if (mapInitializePromise) {
    renderMapState();
    return mapInitializePromise;
  }

  mapInitializePromise = mapController.initialize(mapContainer, currentLocation)
    .then(() => {
      mapStatus.textContent = "지도를 움직여 저장한 장소를 확인할 수 있어요.";
      renderMapState();
    })
    .catch((error) => {
      console.warn("OpenStreetMap 초기화에 실패했습니다.", error);
      mapStatus.textContent = "지도를 불러오지 못했어요. 인터넷 연결을 확인한 뒤 새로고침해주세요.";
      mapContainer.classList.add("is-unavailable");
    });
  return mapInitializePromise;
}

/** 저장한 장소 목록은 지도 마커와 동일한 브라우저 저장 데이터를 사용합니다. */
function renderSavedPlaces() {
  const favorites = getFavoritePlaces();
  if (!favorites.length) {
    savedPlaceList.innerHTML = '<p class="empty-state">음식점 카드에서 저장을 누르면 지도에 별표로 표시돼요.</p>';
    return;
  }

  savedPlaceList.innerHTML = favorites.map((place) => `
    <article class="saved-place-item">
      <div>
        <strong>${escapeHtml(place.name)}</strong>
        <small>${escapeHtml(place.address || place.category)} · ${escapeHtml(formatDateTime(place.savedAt))} 저장</small>
      </div>
      <div class="saved-place-actions">
        <a href="${escapeHtml(safeExternalUrl(place.url))}" target="_blank" rel="noopener noreferrer">크게 보기</a>
        <button type="button" data-remove-favorite="${escapeHtml(place.id)}">저장 해제</button>
      </div>
    </article>
  `).join("");
}

/** 추천 음식점 카드는 저장 상태만 다시 그릴 수 있도록 API 호출과 별도 함수로 분리합니다. */
function renderRestaurantCards(places) {
  const favoriteIds = new Set(getFavoritePlaces().map((place) => place.id));
  restaurantList.innerHTML = places.map((place) => {
    const isFavorite = favoriteIds.has(place.id);
    return `
      <article class="restaurant-card">
        <div class="restaurant-copy">
          <span class="restaurant-menu">${escapeHtml(place.menuName)} 추천</span>
          <strong>${escapeHtml(place.name)}</strong>
          <small>${escapeHtml(place.category)} · ${escapeHtml(place.address)}</small>
        </div>
        <div class="restaurant-meta">
          <b>${place.distanceMeters.toLocaleString("ko-KR")}m</b>
          <div class="restaurant-actions">
            <button class="favorite-button${isFavorite ? " is-saved" : ""}" type="button" data-favorite-place="${escapeHtml(place.id)}" aria-pressed="${isFavorite}">
              ${isFavorite ? "★ 저장됨" : "☆ 저장"}
            </button>
            <a href="${escapeHtml(safeExternalUrl(place.url))}" target="_blank" rel="noopener noreferrer">크게 보기</a>
          </div>
        </div>
      </article>
    `;
  }).join("");
}

/** 음식점 API와 샘플 데이터가 같은 카드 구조를 사용하도록 결과를 표준화해 표시합니다. */
async function renderNearbyRestaurants(picks) {
  const requestId = ++restaurantRequestId;
  restaurantSection.hidden = false;
  restaurantSource.textContent = "주변 음식점을 찾는 중…";
  restaurantList.innerHTML = '<p class="empty-state">추천 메뉴와 가까운 음식점을 연결하고 있어요.</p>';

  const radiusMeters = recommendationExpansion.expandDistance
    ? APP_CONFIG.expandedRestaurantSearchRadiusMeters
    : APP_CONFIG.restaurantSearchRadiusMeters;
  const result = await searchRestaurantsForMenus(picks, currentLocation, { radiusMeters });
  if (requestId !== restaurantRequestId) return;

  const isLive = result.source === "kakao";
  const radiusLabel = `${Math.round(result.radiusMeters / 1000)}km 범위`;
  restaurantSource.textContent = `${isLive ? "카카오 실제 검색 결과" : "API 연결 전 샘플 데이터"} · ${radiusLabel}`;
  currentPlaces = result.places;
  renderRestaurantCards(currentPlaces);
  renderSavedPlaces();
  renderMapState();
}

/** 기존 추천 카드 형태를 유지하면서 취향 반영 이유를 한 줄 추가합니다. */
function renderMenuCards(picks, conditions) {
  const history = getHistory();
  if (!picks.length) {
    menuList.innerHTML = `
      <div class="empty-state empty-state--strong">
        <strong>선택한 조건에 맞는 메뉴가 없어요.</strong>
        <span>예산이나 음식 종류, 먹고 싶은 느낌을 바꿔보세요.</span>
      </div>
    `;
    summary.textContent = "0개의 메뉴";
    selectButton.disabled = true;
    restaurantSection.hidden = true;
    return;
  }

  // 추천 결과도 사용자가 직접 고르기 전까지는 선택 및 확정 버튼을 비활성 상태로 둡니다.
  selectButton.disabled = true;
  menuList.innerHTML = picks.map((menu, index) => {
    return `
      <div class="menu-option">
        <input type="radio" name="selected-menu" id="menu-${escapeHtml(menu.id)}" value="${escapeHtml(menu.id)}" />
        <label for="menu-${escapeHtml(menu.id)}">
          <span class="menu-details">
            <span class="menu-number">${index + 1}</span>
            <span class="menu-copy">
              <strong>${escapeHtml(menu.name)}</strong>
              <small>${escapeHtml(menu.category)} · ${escapeHtml(menu.mood.join(" · "))}</small>
              <em>${escapeHtml(getRecommendationReason(menu, history, conditions))}</em>
            </span>
            <span class="menu-price">${formatPrice(menu.price)}</span>
          </span>
        </label>
      </div>
    `;
  }).join("");
  const includesAlternative = picks.some((menu) => !isExactRecommendationMatch(menu, conditions));
  summary.textContent = `${picks.length}개의 메뉴${includesAlternative ? " · 가까운 조건 포함" : "를 찾았어요"}`;
}

/** 추천 실행은 필터 → 취향 점수 → 카드 표시 → 주변 음식점 검색 순서로 진행합니다. */
function renderRecommendations({ scroll = true } = {}) {
  const conditions = getRecommendationConditions(form);
  const history = getHistory();
  const picks = pickMenus({
    menus: MENUS,
    conditions,
    history,
    lastShownIds,
    limit: 3,
    minimum: 2,
    relaxConditions: recommendationExpansion.relaxConditions,
  });

  relaxSuggestion.hidden = true;
  currentPicks = picks;
  currentPlaces = [];
  lastShownIds = picks.map((menu) => menu.id);
  renderMenuCards(picks, conditions);
  setSuggestedCandidates(picks.map((menu) => menu.name));
  selectionMessage.textContent = "";
  results.hidden = false;
  if (picks.length) renderNearbyRestaurants(picks);
  else renderMapState();
  if (scroll) results.scrollIntoView({ behavior: "smooth", block: "start" });
}

/** 새로운 조건 검색을 시작하면 이전 재추천 횟수와 완화 선택을 함께 초기화합니다. */
function resetRecommendationExpansion() {
  retryRequestCount = 0;
  recommendationExpansion = { expandDistance: false, relaxConditions: false };
  relaxSuggestion.hidden = true;
}

/** 두 번째 재추천부터 검색 사이트의 연관 제안처럼 완화 선택지를 결과 바로 아래에 표시합니다. */
function showRelaxationSuggestion() {
  relaxSuggestion.hidden = false;
  relaxSuggestion.querySelector('[data-relax-action="distance"]').classList.toggle("is-active", recommendationExpansion.expandDistance);
  relaxSuggestion.querySelector('[data-relax-action="conditions"]').classList.toggle("is-active", recommendationExpansion.relaxConditions);
  relaxSuggestion.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function applyRecommendationExpansion(action) {
  if (action === "distance") recommendationExpansion.expandDistance = true;
  if (action === "conditions") recommendationExpansion.relaxConditions = true;
  if (action === "keep") recommendationExpansion = { expandDistance: false, relaxConditions: false };
  renderRecommendations({ scroll: false });
}

/** 위치 권한 요청은 사용자가 버튼을 눌렀을 때만 실행하며 실패하면 샘플 위치를 계속 사용합니다. */
async function activateCurrentLocation() {
  locationButton.disabled = true;
  locationButton.textContent = "위치 확인 중…";
  locationStatus.textContent = "브라우저의 위치 권한을 확인하고 있어요.";
  try {
    currentLocation = await requestCurrentLocation();
    locationStatus.textContent = "현재 위치를 사용 중이에요. 좌표는 저장하지 않습니다.";
    locationButton.textContent = "위치 다시 확인";
    renderMapState();
    if (currentPicks.length) renderNearbyRestaurants(currentPicks);
  } catch (error) {
    currentLocation = DEMO_LOCATION;
    locationStatus.textContent = `${error.message} 샘플 위치로 계속 이용할 수 있어요.`;
    locationButton.textContent = "다시 시도";
    renderMapState();
    if (currentPicks.length) renderNearbyRestaurants(currentPicks);
  } finally {
    locationButton.disabled = false;
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (recommendButton.disabled) return;
  lastShownIds = [];
  resetRecommendationExpansion();
  renderRecommendations();
});

/** 필수 세 조건을 모두 고른 뒤에만 추천을 실행할 수 있도록 초기 자동 선택을 대신합니다. */
function updateFormReadiness() {
  const data = new FormData(form);
  const ready = ["budget", "category", "mood"].every((name) => Boolean(data.get(name)));
  recommendButton.disabled = !ready;
  formValidationMessage.textContent = ready
    ? "선택이 완료됐어요. 추천을 받아보세요."
    : "예산, 음식 종류, 느낌을 선택해주세요.";
  formValidationMessage.classList.toggle("is-ready", ready);
}

retryButton.addEventListener("click", () => {
  retryRequestCount += 1;
  if (retryRequestCount >= 2) {
    showRelaxationSuggestion();
    return;
  }
  renderRecommendations({ scroll: false });
});
relaxSuggestion.addEventListener("click", (event) => {
  const button = event.target.closest("[data-relax-action]");
  if (button) applyRecommendationExpansion(button.dataset.relaxAction);
});
locationButton.addEventListener("click", activateCurrentLocation);
form.addEventListener("change", () => {
  resetRecommendationExpansion();
  updateFormReadiness();
});
menuList.addEventListener("change", (event) => {
  if (event.target.matches('input[name="selected-menu"]')) selectButton.disabled = false;
});

/**
 * 기본 라디오의 단일 선택 방식은 유지하면서 이미 선택된 항목의 재클릭만 해제합니다.
 * pointerdown과 keydown에서 이전 상태를 기억해 마우스·터치·키보드 입력을 같은 방식으로 처리합니다.
 */
function enableRadioDeselect(container, selector, afterToggle) {
  const wasChecked = new WeakMap();
  const findRadio = (target) => {
    if (target.matches?.(selector)) return target;
    return target.closest?.("label")?.querySelector(selector) ?? null;
  };

  const rememberState = (event) => {
    const radio = findRadio(event.target);
    if (radio) wasChecked.set(radio, radio.checked);
  };
  container.addEventListener("pointerdown", rememberState);
  container.addEventListener("keydown", (event) => {
    if (event.key === " " || event.key === "Enter") rememberState(event);
  });
  container.addEventListener("click", (event) => {
    if (!event.target.matches?.(selector)) return;
    const radio = event.target;
    if (wasChecked.get(radio)) {
      radio.checked = false;
      radio.dispatchEvent(new Event("change", { bubbles: true }));
      afterToggle?.(radio);
    }
    wasChecked.delete(radio);
  });
}

enableRadioDeselect(form, 'input[type="radio"]', updateFormReadiness);
enableRadioDeselect(menuList, 'input[name="selected-menu"]', () => {
  selectButton.disabled = !menuList.querySelector('input[name="selected-menu"]:checked');
});

restaurantList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-favorite-place]");
  if (!button) return;
  const place = currentPlaces.find((item) => item.id === button.dataset.favoritePlace);
  if (place) toggleFavoritePlace(place);
});

savedPlaceList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-favorite]");
  if (button) removeFavoritePlace(button.dataset.removeFavorite);
});

function syncFavoritePlaces() {
  renderRestaurantCards(currentPlaces);
  renderSavedPlaces();
  renderMapState();
}

window.addEventListener("favorite-places-updated", syncFavoritePlaces);
window.addEventListener("storage", (event) => {
  if (event.key === STORAGE_KEYS.favorites) syncFavoritePlaces();
});

/** 최종 선택 시 기록을 저장하고 다음 추천부터 학습 점수에 반영합니다. */
selectButton.addEventListener("click", () => {
  const selected = document.querySelector('input[name="selected-menu"]:checked');
  const menu = MENUS.find((item) => item.id === selected?.value);
  if (!menu) return;
  addHistory(menu);
  selectionMessage.textContent = `좋아요! 오늘 점심은 ${menu.name}로 결정했어요. 다음 추천에 취향을 반영할게요.`;
  renderPreferenceAndHistory();
});

document.querySelector("#clear-history-button").addEventListener("click", () => {
  if (!getHistory().length || !window.confirm("저장된 점심 선택 기록을 모두 지울까요?")) return;
  clearHistory();
  renderPreferenceAndHistory();
});

initVotingRoom();
renderPreferenceAndHistory();
renderSavedPlaces();
updateFormReadiness();
window.addEventListener("hashchange", renderRoute);
if (!window.location.hash) window.history.replaceState(null, "", "#recommend");
renderRoute();
