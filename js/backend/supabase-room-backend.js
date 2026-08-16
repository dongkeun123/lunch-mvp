/**
 * 여러 기기에서 공동주문 방을 공유하기 위한 Supabase 구현입니다.
 * 데이터 변경은 공개 테이블 쓰기가 아니라 검증 로직이 포함된 Postgres RPC만 사용합니다.
 */
const SUPABASE_SDK_URL = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm";

function toFriendlyError(error, fallback) {
  const message = String(error?.message || "");
  if (message.includes("nickname_already_used")) return new Error("이미 사용 중인 닉네임이에요.");
  if (message.includes("room_expired")) return new Error("이미 투표가 마감됐어요.");
  if (message.includes("room_not_found")) return new Error("초대받은 방을 찾을 수 없습니다.");
  if (message.includes("host_only")) return new Error("방장만 방을 삭제할 수 있어요.");
  return new Error(fallback);
}

export class SupabaseRoomBackend {
  constructor({ supabaseUrl, supabasePublishableKey }) {
    this.mode = "supabase";
    this.url = supabaseUrl;
    this.publishableKey = supabasePublishableKey;
    this.client = null;
  }

  async initialize() {
    const { createClient } = await import(SUPABASE_SDK_URL);
    this.client = createClient(this.url, this.publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    });

    const { data: sessionData } = await this.client.auth.getSession();
    if (!sessionData.session) {
      const { error } = await this.client.auth.signInAnonymously();
      if (error) throw toFriendlyError(error, "익명 참여자 인증에 실패했습니다.");
    }
  }

  async call(functionName, parameters, fallbackMessage) {
    const { data, error } = await this.client.rpc(functionName, parameters);
    if (error) throw toFriendlyError(error, fallbackMessage);
    return data;
  }

  async getRoom(roomId) {
    try {
      return await this.call("get_order_room", { p_room_id: roomId }, "투표방을 불러오지 못했습니다.");
    } catch (error) {
      if (error.message.includes("찾을 수 없습니다")) return null;
      throw error;
    }
  }

  async createRoom({ title, hostName, deadlineMinutes, candidates }) {
    return this.call("create_order_room", {
      p_title: title,
      p_host_name: hostName,
      p_deadline_minutes: deadlineMinutes,
      p_candidates: candidates,
    }, "투표방을 만들지 못했습니다.");
  }

  async joinRoom(roomId, nickname) {
    return this.call("join_order_room", {
      p_room_id: roomId,
      p_nickname: nickname,
    }, "투표방에 참여하지 못했습니다.");
  }

  async castVote(roomId, optionId) {
    return this.call("cast_order_vote", {
      p_room_id: roomId,
      p_option_id: optionId,
    }, "투표를 저장하지 못했습니다.");
  }

  async deleteRoom(roomId) {
    await this.call("delete_order_room", { p_room_id: roomId }, "투표방을 삭제하지 못했습니다.");
  }

  /** 방에 관련된 네 테이블의 변경을 구독하고, UI에는 다시 조회하라는 신호만 전달합니다. */
  subscribeRoom(roomId, onChange) {
    const channel = this.client
      .channel(`order-room:${roomId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "order_rooms", filter: `id=eq.${roomId}` }, onChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "order_room_options", filter: `room_id=eq.${roomId}` }, onChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "order_room_members", filter: `room_id=eq.${roomId}` }, onChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "order_room_votes", filter: `room_id=eq.${roomId}` }, onChange)
      .subscribe();

    return () => this.client.removeChannel(channel);
  }
}
