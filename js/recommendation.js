/**
 * 추천 엔진
 * UI와 저장소에서 분리되어 있어 필터 규칙이나 취향 점수만 독립적으로 시험하고 개선할 수 있습니다.
 */

/** 폼 값을 추천 엔진이 사용하는 단순한 조건 객체로 변환합니다. */
export function getRecommendationConditions(form) {
  const data = new FormData(form);
  return {
    budget: data.get("budget"),
    category: data.get("category"),
    mood: data.get("mood"),
  };
}

function matchesBasicConditions(menu, conditions) {
  const withinBudget = conditions.budget === "any" || menu.price <= Number(conditions.budget);
  const sameCategory = conditions.category === "any" || menu.category === conditions.category;
  const sameMood = conditions.mood === "any" || menu.mood.includes(conditions.mood);
  return withinBudget && sameCategory && sameMood;
}

/** 선택 기록을 점수로 바꾸되 최근에 고른 동일 메뉴는 감점해 취향과 다양성을 함께 반영합니다. */
function preferenceScore(menu, history) {
  const categoryCount = history.filter((entry) => entry.category === menu.category).length;
  const menuCount = history.filter((entry) => entry.menuId === menu.id).length;
  const lastSameMenu = history.find((entry) => entry.menuId === menu.id);
  const recentlySelected = lastSameMenu
    ? Date.now() - new Date(lastSameMenu.selectedAt).getTime() < 1000 * 60 * 60 * 24 * 2
    : false;

  return categoryCount * 4 + menuCount * 2 - (recentlySelected ? 45 : 0);
}

/** 조건을 모두 만족한 메뉴만 점수순으로 정렬하고 직전 추천과 겹치는 메뉴는 뒤로 보냅니다. */
export function pickMenus({ menus, conditions, history, lastShownIds = [], limit = 3 }) {
  return menus
    .filter((menu) => matchesBasicConditions(menu, conditions))
    .map((menu) => ({
      menu,
      score: preferenceScore(menu, history) - (lastShownIds.includes(menu.id) ? 20 : 0) + Math.random() * 6,
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map(({ menu }) => menu);
}

/** 사용자가 추천 결과를 신뢰할 수 있도록 각 메뉴가 선택된 간단한 이유를 만듭니다. */
export function getRecommendationReason(menu, history) {
  const categorySelections = history.filter((entry) => entry.category === menu.category).length;
  if (categorySelections >= 2) return `자주 고른 ${menu.category} 취향 반영`;
  return `${menu.mood[0]} 먹기 좋은 메뉴`;
}

/** 누적 선택 기록을 사람이 읽을 수 있는 한 문장으로 요약합니다. */
export function summarizePreferences(history) {
  if (!history.length) return "아직 선택 기록이 없어요. 메뉴를 고르면 취향을 기억할게요.";

  const categoryCounts = history.reduce((counts, entry) => {
    counts[entry.category] = (counts[entry.category] ?? 0) + 1;
    return counts;
  }, {});
  const [favoriteCategory, count] = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])[0];
  return `${history.length}번의 선택을 학습했어요. 지금까지 ${favoriteCategory}을(를) ${count}번 가장 자주 골랐어요.`;
}
