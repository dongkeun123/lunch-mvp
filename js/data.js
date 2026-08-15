/**
 * 메뉴 원본 데이터
 * 새 메뉴를 추가할 때 이 파일만 수정하면 추천과 투표 후보 자동 채우기에서 함께 사용할 수 있습니다.
 */
export const MENUS = [
  { id: "kimchi-stew", name: "김치찌개", category: "한식", mood: ["든든하게", "매콤하게"], price: 8000 },
  { id: "spicy-pork-rice", name: "제육덮밥", category: "한식", mood: ["든든하게", "매콤하게"], price: 8500 },
  { id: "bibimbap", name: "비빔밥", category: "한식", mood: ["든든하게", "가볍게"], price: 8000 },
  { id: "soft-tofu-stew", name: "순두부찌개", category: "한식", mood: ["가볍게", "매콤하게"], price: 8000 },
  { id: "gukbap", name: "국밥", category: "한식", mood: ["든든하게"], price: 9500 },
  { id: "jjajangmyeon", name: "짜장면", category: "중식", mood: ["든든하게"], price: 7000 },
  { id: "jjamppong", name: "짬뽕", category: "중식", mood: ["든든하게", "매콤하게"], price: 9000 },
  { id: "mapo-tofu", name: "마파두부 덮밥", category: "중식", mood: ["든든하게", "매콤하게"], price: 9000 },
  { id: "fried-rice", name: "볶음밥", category: "중식", mood: ["든든하게"], price: 8000 },
  { id: "tomato-egg-rice", name: "토마토 달걀 덮밥", category: "중식", mood: ["가볍게"], price: 8000 },
  { id: "tantan-noodles", name: "탄탄면", category: "중식", mood: ["든든하게", "매콤하게"], price: 8000 },
  { id: "pork-cutlet", name: "돈가스", category: "일식", mood: ["든든하게"], price: 10000 },
  { id: "gyudon", name: "규동", category: "일식", mood: ["든든하게"], price: 9000 },
  { id: "cold-soba", name: "냉모밀", category: "일식", mood: ["가볍게"], price: 8500 },
  { id: "sashimi-rice", name: "회덮밥", category: "일식", mood: ["가볍게", "매콤하게"], price: 10000 },
  { id: "triangle-kimbap", name: "삼각김밥 세트", category: "일식", mood: ["가볍게"], price: 6000 },
  { id: "spicy-curry", name: "매운 카레", category: "일식", mood: ["든든하게", "매콤하게"], price: 8000 },
  { id: "tomato-pasta", name: "토마토 파스타", category: "양식", mood: ["든든하게"], price: 11000 },
  { id: "sandwich", name: "샌드위치", category: "양식", mood: ["가볍게"], price: 7000 },
  { id: "chicken-salad", name: "치킨 샐러드", category: "양식", mood: ["가볍게"], price: 9000 },
  { id: "meat-pasta", name: "미트소스 파스타", category: "양식", mood: ["든든하게"], price: 8000 },
  { id: "spicy-chicken-sandwich", name: "매콤 치킨 샌드위치", category: "양식", mood: ["가볍게", "매콤하게"], price: 8000 },
  { id: "spicy-cream-pasta", name: "매콤 크림 파스타", category: "양식", mood: ["든든하게", "매콤하게"], price: 12000 },
];

/** API 키가 없거나 위치 권한을 주지 않았을 때 사용하는 기본 좌표입니다. */
export const DEMO_LOCATION = Object.freeze({
  latitude: 37.5665,
  longitude: 126.978,
  label: "서울시청 샘플 위치",
  mode: "demo",
});
