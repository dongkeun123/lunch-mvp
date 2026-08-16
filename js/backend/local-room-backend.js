import { deleteRoom, getRoom, saveRoom, STORAGE_KEYS } from "../storage.js";
import { createId } from "../utils.js";

/**
 * 별도 계정이나 API 없이 작동하는 로컬 공동주문 저장소입니다.
 * Supabase 설정이 없을 때 기존 MVP 동작을 그대로 유지하는 폴백 역할도 합니다.
 */
const DEMO_NAMES = ["민지", "준호", "서연", "현우", "지수", "예린"];

export class LocalRoomBackend {
  constructor() {
    this.mode = "local";
  }

  async initialize() {}

  async getRoom(roomId) {
    return getRoom(roomId);
  }

  async createRoom({ title, hostName, deadlineMinutes, candidates }) {
    const room = {
      id: createId("room"),
      title,
      hostName,
      createdAt: new Date().toISOString(),
      deadlineAt: new Date(Date.now() + deadlineMinutes * 60 * 1000).toISOString(),
      members: [hostName],
      options: candidates.map((name) => ({ id: createId("option"), name, voters: [] })),
    };
    saveRoom(room);
    return room;
  }

  async joinRoom(roomId, nickname) {
    const room = getRoom(roomId);
    if (!room) throw new Error("초대받은 방을 찾을 수 없습니다.");
    if (room.members.some((name) => name.toLowerCase() === nickname.toLowerCase())) {
      throw new Error("이미 사용 중인 닉네임이에요.");
    }
    room.members.push(nickname);
    saveRoom(room);
    return room;
  }

  async castVote(roomId, optionId, nickname) {
    const room = getRoom(roomId);
    if (!room) throw new Error("투표방을 찾을 수 없습니다.");
    if (Date.now() >= new Date(room.deadlineAt).getTime()) throw new Error("이미 투표가 마감됐어요.");

    room.options.forEach((option) => {
      option.voters = option.voters.filter((name) => name !== nickname);
      if (option.id === optionId) option.voters.push(nickname);
    });
    saveRoom(room);
    return room;
  }

  async deleteRoom(roomId) {
    deleteRoom(roomId);
  }

  async addDemoMember(roomId) {
    const room = getRoom(roomId);
    if (!room) throw new Error("투표방을 찾을 수 없습니다.");
    const nickname = DEMO_NAMES.find((name) => !room.members.includes(name)) || `게스트 ${room.members.length + 1}`;
    room.members.push(nickname);
    const option = room.options[Math.floor(Math.random() * room.options.length)];
    option.voters.push(nickname);
    saveRoom(room);
    return { room, nickname, optionName: option.name };
  }

  /** 같은 브라우저의 탭과 현재 탭에서 발생한 변경을 동일한 콜백으로 전달합니다. */
  subscribeRoom(roomId, onChange) {
    const handleStorage = (event) => {
      if (event.key === STORAGE_KEYS.rooms) onChange();
    };
    const handleCustom = (event) => {
      if (event.detail.roomId === roomId) onChange();
    };
    window.addEventListener("storage", handleStorage);
    window.addEventListener("lunch-room-updated", handleCustom);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("lunch-room-updated", handleCustom);
    };
  }
}
