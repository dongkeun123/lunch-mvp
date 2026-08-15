/**
 * 외부 서비스 설정
 *
 * kakaoRestApiKey가 비어 있으면 위치 기반 음식점 기능은 샘플 데이터를 사용합니다.
 * 실제 연결 시 카카오 개발자 콘솔에서 허용 도메인을 제한한 REST API 키를 입력하세요.
 * 운영 서비스에서는 키 노출과 호출량 보호를 위해 서버리스 프록시 사용을 권장합니다.
 */
export const APP_CONFIG = Object.freeze({
  kakaoRestApiKey: "",
  restaurantSearchRadiusMeters: 3000,
  // 지도 공급자는 앱 코드와 분리되어 추후 "kakao" 어댑터로 교체할 수 있습니다.
  mapProvider: "openstreetmap",
  map: Object.freeze({
    tileUrl: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
    defaultZoom: 14,
  }),
});
