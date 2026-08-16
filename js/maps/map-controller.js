import { APP_CONFIG } from "../config.js";
import { OpenStreetMapProvider } from "./openstreetmap-provider.js";

/**
 * 지도 공급자 공통 진입점
 * 앱은 이 컨트롤러만 사용합니다. KakaoMapProvider가 준비되면 factories에 등록하고
 * config.js의 mapProvider만 변경하면 나머지 추천·저장 코드는 그대로 유지됩니다.
 */
const providerFactories = {
  openstreetmap: () => new OpenStreetMapProvider(APP_CONFIG.map),
};

export class MapController {
  constructor(providerName = APP_CONFIG.mapProvider) {
    const createProvider = providerFactories[providerName];
    if (!createProvider) throw new Error(`지원하지 않는 지도 공급자입니다: ${providerName}`);
    this.provider = createProvider();
    this.ready = false;
    this.pendingState = null;
  }

  async initialize(container, center) {
    await this.provider.initialize(container, center);
    this.ready = true;
    if (this.pendingState) {
      this.provider.render(this.pendingState);
      this.pendingState = null;
    }
  }

  render(state) {
    if (!this.ready) {
      this.pendingState = state;
      return;
    }
    this.provider.render(state);
  }

  destroy() {
    this.provider.destroy();
    this.ready = false;
  }
}

