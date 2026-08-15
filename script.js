const menus = [
  { name: "김치찌개", category: "한식", mood: ["든든하게", "매콤하게"], price: 8000 },
  { name: "제육덮밥", category: "한식", mood: ["든든하게", "매콤하게"], price: 8500 },
  { name: "비빔밥", category: "한식", mood: ["든든하게", "가볍게"], price: 8000 },
  { name: "순두부찌개", category: "한식", mood: ["가볍게", "매콤하게"], price: 8000 },
  { name: "국밥", category: "한식", mood: ["든든하게"], price: 9500 },
  { name: "짜장면", category: "중식", mood: ["든든하게"], price: 7000 },
  { name: "짬뽕", category: "중식", mood: ["든든하게", "매콤하게"], price: 9000 },
  { name: "마파두부 덮밥", category: "중식", mood: ["든든하게", "매콤하게"], price: 9000 },
  { name: "볶음밥", category: "중식", mood: ["든든하게"], price: 8000 },
  { name: "토마토 달걀 덮밥", category: "중식", mood: ["가볍게"], price: 8000 },
  { name: "탄탄면", category: "중식", mood: ["든든하게", "매콤하게"], price: 8000 },
  { name: "돈가스", category: "일식", mood: ["든든하게"], price: 10000 },
  { name: "규동", category: "일식", mood: ["든든하게"], price: 9000 },
  { name: "냉모밀", category: "일식", mood: ["가볍게"], price: 8500 },
  { name: "회덮밥", category: "일식", mood: ["가볍게", "매콤하게"], price: 10000 },
  { name: "삼각김밥 세트", category: "일식", mood: ["가볍게"], price: 6000 },
  { name: "매운 카레", category: "일식", mood: ["든든하게", "매콤하게"], price: 8000 },
  { name: "토마토 파스타", category: "양식", mood: ["든든하게"], price: 11000 },
  { name: "샌드위치", category: "양식", mood: ["가볍게"], price: 7000 },
  { name: "치킨 샐러드", category: "양식", mood: ["가볍게"], price: 9000 },
  { name: "미트소스 파스타", category: "양식", mood: ["든든하게"], price: 8000 },
  { name: "매콤 치킨 샌드위치", category: "양식", mood: ["가볍게", "매콤하게"], price: 8000 },
  { name: "매콤 크림 파스타", category: "양식", mood: ["든든하게", "매콤하게"], price: 12000 },
];

const form = document.querySelector("#recommend-form");
const results = document.querySelector("#results");
const menuList = document.querySelector("#menu-list");
const summary = document.querySelector("#result-summary");
const selectButton = document.querySelector("#select-button");
const retryButton = document.querySelector("#retry-button");
const selectionMessage = document.querySelector("#selection-message");

let lastShownNames = [];

function getConditions() {
  const data = new FormData(form);
  return { budget: data.get("budget"), category: data.get("category"), mood: data.get("mood") };
}

function matches(menu, conditions) {
  const withinBudget = conditions.budget === "any" || menu.price <= Number(conditions.budget);
  const sameCategory = conditions.category === "any" || menu.category === conditions.category;
  const sameMood = conditions.mood === "any" || menu.mood.includes(conditions.mood);
  return withinBudget && sameCategory && sameMood;
}

function shuffle(items) {
  return [...items].sort(() => Math.random() - 0.5);
}

function pickMenus(conditions) {
  const exact = shuffle(menus.filter((menu) => matches(menu, conditions)));
  const unusedExact = exact.filter((menu) => !lastShownNames.includes(menu.name));
  const orderedExact = [...unusedExact, ...exact.filter((menu) => lastShownNames.includes(menu.name))];

  return orderedExact.slice(0, 3);
}

function renderRecommendations({ scroll = true } = {}) {
  const conditions = getConditions();
  const picks = pickMenus(conditions);
  lastShownNames = picks.map((menu) => menu.name);

  menuList.innerHTML = picks.map((menu, index) => `
    <div class="menu-option">
      <input type="radio" name="selected-menu" id="menu-${index}" value="${menu.name}" ${index === 0 ? "checked" : ""} />
      <label for="menu-${index}">
        <span class="menu-details">
          <span class="menu-number">${index + 1}</span>
          <span class="menu-copy">
            <strong>${menu.name}</strong>
            <small>${menu.category} · ${menu.mood.join(" · ")}</small>
          </span>
          <span class="menu-price">${menu.price.toLocaleString("ko-KR")}원</span>
        </span>
      </label>
    </div>
  `).join("");

  summary.textContent = `${picks.length}개의 메뉴를 찾았어요`;
  selectionMessage.textContent = "";
  results.hidden = false;
  if (scroll) results.scrollIntoView({ behavior: "smooth", block: "start" });
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  lastShownNames = [];
  renderRecommendations();
});

retryButton.addEventListener("click", () => renderRecommendations({ scroll: false }));

selectButton.addEventListener("click", () => {
  const selected = document.querySelector('input[name="selected-menu"]:checked');
  if (!selected) return;
  selectionMessage.textContent = `좋아요! 오늘 점심은 ${selected.value}로 결정했어요.`;
});
