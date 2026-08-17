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

/** 결과 카드와 요약에서 정확히 일치한 후보인지 같은 기준으로 판단할 수 있게 공개합니다. */
export function isExactRecommendationMatch(menu, conditions) {
  return matchesBasicConditions(menu, conditions);
}

/** 선택 기록을 점수로 바꾸되 최근에 고른 동일 메뉴는 감점해 취향과 다양성을 함께 반영합니다. */
function preferenceScore(menu, history) {
  const categoryCount = history
    .filter((entry) => entry.category === menu.category)
    .reduce((total, entry) => total + (entry.selectionCount ?? 1), 0);
  const menuCount = history
    .filter((entry) => entry.menuId === menu.id)
    .reduce((total, entry) => total + (entry.selectionCount ?? 1), 0);
  const lastSameMenu = history.find((entry) => entry.menuId === menu.id);
  const recentlySelected = lastSameMenu
    ? Date.now() - new Date(lastSameMenu.selectedAt).getTime() < 1000 * 60 * 60 * 24 * 2
    : false;

  return categoryCount * 4 + menuCount * 2 - (recentlySelected ? 45 : 0);
}

function relaxedConditionScore(menu, conditions) {
  const budgetLimit = conditions.budget === "any" ? null : Number(conditions.budget);
  const overBudget = budgetLimit == null ? 0 : Math.max(0, menu.price - budgetLimit);
  if (overBudget > 3000) return Number.NEGATIVE_INFINITY;

  const categoryMatch = conditions.category === "any" || menu.category === conditions.category;
  const moodMatch = conditions.mood === "any" || menu.mood.includes(conditions.mood);
  const budgetMatch = budgetLimit == null || overBudget === 0;
  return (categoryMatch ? 28 : 0) + (moodMatch ? 22 : 0) + (budgetMatch ? 18 : -overBudget / 250);
}

function scoreMenus(menus, conditions, history, lastShownIds, relaxed) {
  return menus
    .map((menu) => ({
      menu,
      conditionScore: relaxed ? relaxedConditionScore(menu, conditions) : (matchesBasicConditions(menu, conditions) ? 70 : Number.NEGATIVE_INFINITY),
    }))
    .filter(({ conditionScore }) => Number.isFinite(conditionScore))
    .map((menu) => ({
      menu: menu.menu,
      score: menu.conditionScore
        + preferenceScore(menu.menu, history)
        - (lastShownIds.includes(menu.menu.id) ? 20 : 0)
        + Math.random() * 6,
    }))
    .sort((left, right) => right.score - left.score);
}

/**
 * 기본적으로 정확한 조건 후보를 우선 사용합니다.
 * 정확한 후보가 1개뿐이면 가장 가까운 대안으로 2개를 채우고, 사용자가 완화를 선택하면 전체 후보를 완화 점수순으로 봅니다.
 */
export function pickMenus({ menus, conditions, history, lastShownIds = [], limit = 3, minimum = 2, relaxConditions = false }) {
  const exact = scoreMenus(menus, conditions, history, lastShownIds, false);
  if (relaxConditions) {
    return scoreMenus(menus, conditions, history, lastShownIds, true)
      .slice(0, limit)
      .map(({ menu }) => menu);
  }

  const selected = exact.slice(0, limit);
  if (selected.length < minimum) {
    const selectedIds = new Set(selected.map(({ menu }) => menu.id));
    const nearbyAlternatives = scoreMenus(menus, conditions, history, lastShownIds, true)
      .filter(({ menu }) => !selectedIds.has(menu.id));
    selected.push(...nearbyAlternatives.slice(0, minimum - selected.length));
  }
  return selected.map(({ menu }) => menu);
}

/** 사용자가 추천 결과를 신뢰할 수 있도록 각 메뉴가 선택된 간단한 이유를 만듭니다. */
export function getRecommendationReason(menu, history, conditions) {
  if (conditions && !matchesBasicConditions(menu, conditions)) {
    const differences = [];
    if (conditions.category !== "any" && menu.category !== conditions.category) differences.push("다른 음식 종류");
    if (conditions.mood !== "any" && !menu.mood.includes(conditions.mood)) differences.push("다른 느낌");
    if (conditions.budget !== "any" && menu.price > Number(conditions.budget)) {
      differences.push(`예산 +${formatBudgetDifference(menu.price - Number(conditions.budget))}`);
    }
    return `${differences.join(" · ")}까지 넓힌 대안`;
  }
  const categorySelections = history.filter((entry) => entry.category === menu.category).length;
  if (categorySelections >= 2) return `자주 고른 ${menu.category} 취향 반영`;
  return `${menu.mood[0]} 먹기 좋은 메뉴`;
}

function formatBudgetDifference(value) {
  return `${Math.ceil(value / 1000) * 1000}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "원";
}
