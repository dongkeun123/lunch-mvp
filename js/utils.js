/** 동적 텍스트를 HTML에 넣을 때 마크업으로 실행되지 않도록 이스케이프합니다. */
export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/** 원화 가격을 한글 로케일로 통일해 표시합니다. */
export function formatPrice(price) {
  return `${Number(price).toLocaleString("ko-KR")}원`;
}

/** 날짜를 짧고 읽기 쉬운 한국어 형식으로 표시합니다. */
export function formatDateTime(dateValue) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(dateValue));
}

/** 방 코드와 DOM id에 사용할 짧은 임의 식별자를 만듭니다. */
export function createId(prefix = "id") {
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${random}`;
}

