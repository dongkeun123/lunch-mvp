import { APP_CONFIG } from "../config.js";
import { LocalRoomBackend } from "./local-room-backend.js";
import { SupabaseRoomBackend } from "./supabase-room-backend.js";

/**
 * 공동주문 UI가 저장 기술을 알 필요 없도록 공급자를 한 번만 선택합니다.
 * 두 Supabase 설정값 중 하나라도 비어 있으면 기존 로컬 데모로 안전하게 동작합니다.
 */
let backendPromise;

function hasSupabaseConfig() {
  const config = APP_CONFIG.roomBackend;
  return Boolean(config?.supabaseUrl?.trim() && config?.supabasePublishableKey?.trim());
}

async function createBackend() {
  const config = APP_CONFIG.roomBackend;
  const wantsSupabase = config?.provider === "supabase" || (config?.provider === "auto" && hasSupabaseConfig());
  const backend = wantsSupabase ? new SupabaseRoomBackend(config) : new LocalRoomBackend();

  try {
    await backend.initialize();
    return backend;
  } catch (error) {
    // auto 모드에서는 외부 장애가 공동주문 화면 전체를 막지 않도록 로컬 데모로 복귀합니다.
    if (config?.provider === "auto") {
      console.warn("Supabase 연결에 실패해 로컬 공동주문 데모를 사용합니다.", error);
      return new LocalRoomBackend();
    }
    throw error;
  }
}

export function getRoomBackend() {
  if (!backendPromise) backendPromise = createBackend();
  return backendPromise;
}
