import { deleteRoom, getRoom, saveRoom, STORAGE_KEYS } from "./storage.js";
import { createId, escapeHtml, formatDateTime } from "./utils.js";

/**
 * 공동주문 투표방 로컬 데모
 * 방 데이터는 localStorage, 현재 탭의 참여자 이름은 sessionStorage에 저장합니다.
 * 추후 Supabase를 연결할 때 이 모듈의 저장 함수만 서버 요청으로 교체할 수 있습니다.
 */
const DEMO_NAMES = ["민지", "준호", "서연", "현우", "지수", "도윤"];
let activeRoomId = null;

const elements = {};

function participantKey(roomId) {
  return `lunch-pick:participant:${roomId}`;
}

function getCurrentParticipant(roomId) {
  return sessionStorage.getItem(participantKey(roomId)) || "";
}

function setCurrentParticipant(roomId, name) {
  sessionStorage.setItem(participantKey(roomId), name);
}

function getRoomIdFromHash() {
  const match = window.location.hash.match(/^#room=([^&]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function showCreateView() {
  activeRoomId = null;
  elements.createSection.hidden = false;
  elements.roomSection.hidden = true;
}

function setVoteMessage(message, isError = false) {
  elements.voteMessage.textContent = message;
  elements.voteMessage.classList.toggle("is-error", isError);
}

/** 방의 현재 득표 상태를 막대 길이와 숫자로 함께 보여줍니다. */
function renderVoteOptions(room, participant) {
  const totalVotes = room.options.reduce((sum, option) => sum + option.voters.length, 0);
  elements.voteOptions.innerHTML = room.options.map((option, index) => {
    const checked = option.voters.includes(participant);
    const ratio = totalVotes ? Math.round((option.voters.length / totalVotes) * 100) : 0;
    return `
      <label class="vote-option">
        <input type="radio" name="room-vote" value="${escapeHtml(option.id)}" ${checked ? "checked" : ""} />
        <span class="vote-option-body">
          <span class="vote-option-row">
            <span><b>${index + 1}</b><strong>${escapeHtml(option.name)}</strong></span>
            <span>${option.voters.length}표 · ${ratio}%</span>
          </span>
          <span class="vote-progress"><span style="width: ${ratio}%"></span></span>
        </span>
      </label>
    `;
  }).join("");
}

/** 저장된 방 하나를 화면에 그리며, 다른 탭의 변경도 같은 함수로 다시 반영합니다. */
export function renderActiveRoom(roomId = getRoomIdFromHash()) {
  if (!roomId) {
    showCreateView();
    return;
  }

  const room = getRoom(roomId);
  if (!room) {
    showCreateView();
    return;
  }

  activeRoomId = roomId;
  elements.createSection.hidden = true;
  elements.roomSection.hidden = false;
  elements.roomTitle.textContent = room.title;
  elements.roomCode.textContent = `ROOM ${room.id.slice(-6).toUpperCase()}`;

  const expired = Date.now() >= new Date(room.deadlineAt).getTime();
  elements.roomDeadline.textContent = expired ? "투표가 마감됐어요" : `${formatDateTime(room.deadlineAt)} 마감`;

  const participant = getCurrentParticipant(roomId);
  elements.joinPanel.hidden = Boolean(participant);
  elements.voteForm.hidden = !participant;
  elements.voteButton.disabled = expired;
  elements.voteButton.textContent = expired ? "투표 마감" : "투표하기";

  renderVoteOptions(room, participant);
  elements.memberCount.textContent = `${room.members.length}명`;
  elements.memberList.innerHTML = room.members
    .map((member) => `<span class="member-chip${member === participant ? " is-me" : ""}">${escapeHtml(member)}${member === participant ? " · 나" : ""}</span>`)
    .join("");
}

function createRoomFromForm(event) {
  event.preventDefault();
  const data = new FormData(elements.createForm);
  const hostName = String(data.get("host-name") || "").trim();
  const candidates = data.getAll("candidate").map((name) => String(name).trim()).filter(Boolean);
  const uniqueCandidates = [...new Set(candidates)];

  if (!hostName || uniqueCandidates.length < 2) {
    window.alert("닉네임과 서로 다른 후보 메뉴를 2개 이상 입력해주세요.");
    return;
  }

  const roomId = createId("room");
  const deadlineMinutes = Number(data.get("deadline-minutes"));
  const room = {
    id: roomId,
    title: String(data.get("room-title") || "점심 투표방").trim(),
    hostName,
    createdAt: new Date().toISOString(),
    deadlineAt: new Date(Date.now() + deadlineMinutes * 60 * 1000).toISOString(),
    members: [hostName],
    options: uniqueCandidates.map((name) => ({ id: createId("option"), name, voters: [] })),
  };

  saveRoom(room);
  setCurrentParticipant(roomId, hostName);
  window.location.hash = `room=${encodeURIComponent(roomId)}`;
}

/** 링크로 방을 연 새 탭은 닉네임을 입력해 기존 방의 참여자 목록에 합류합니다. */
function joinRoom() {
  const room = getRoom(activeRoomId);
  const name = elements.participantName.value.trim();
  if (!room || !name) {
    setVoteMessage("참여할 닉네임을 입력해주세요.", true);
    return;
  }
  if (room.members.includes(name)) {
    setVoteMessage("이미 사용 중인 닉네임이에요.", true);
    return;
  }

  room.members.push(name);
  saveRoom(room);
  setCurrentParticipant(room.id, name);
  elements.participantName.value = "";
  setVoteMessage(`${name}님, 투표방에 참여했어요.`);
  renderActiveRoom(room.id);
}

/** 한 사람은 한 후보에만 투표할 수 있으며 다시 투표하면 기존 표를 이동합니다. */
function submitVote(event) {
  event.preventDefault();
  const room = getRoom(activeRoomId);
  const participant = getCurrentParticipant(activeRoomId);
  const selected = elements.voteForm.querySelector('input[name="room-vote"]:checked');
  if (!room || !participant || !selected) {
    setVoteMessage("투표할 메뉴를 선택해주세요.", true);
    return;
  }
  if (Date.now() >= new Date(room.deadlineAt).getTime()) {
    setVoteMessage("이미 투표가 마감됐어요.", true);
    return;
  }

  room.options.forEach((option) => {
    option.voters = option.voters.filter((name) => name !== participant);
    if (option.id === selected.value) option.voters.push(participant);
  });
  saveRoom(room);
  setVoteMessage(`${participant}님의 선택을 반영했어요.`);
  renderActiveRoom(room.id);
}

/** 실제 여러 사람이 없어도 득표 변화와 동률 UI를 시험할 수 있는 데모 참여자를 추가합니다. */
function addDemoMember() {
  const room = getRoom(activeRoomId);
  if (!room) return;

  const baseName = DEMO_NAMES.find((name) => !room.members.includes(name));
  const name = baseName || `게스트${room.members.length + 1}`;
  room.members.push(name);
  const option = room.options[Math.floor(Math.random() * room.options.length)];
  option.voters.push(name);
  saveRoom(room);
  setVoteMessage(`${name}님이 ${option.name}에 투표했어요.`);
  renderActiveRoom(room.id);
}

async function copyRoomLink() {
  const url = window.location.href;
  try {
    await navigator.clipboard.writeText(url);
    setVoteMessage("투표방 링크를 복사했어요. 같은 브라우저의 새 탭에서 열어보세요.");
  } catch {
    window.prompt("아래 링크를 복사해주세요.", url);
  }
}

function removeActiveRoom() {
  if (!activeRoomId || !window.confirm("이 로컬 투표방을 삭제할까요?")) return;
  deleteRoom(activeRoomId);
  sessionStorage.removeItem(participantKey(activeRoomId));
  window.location.hash = "group-order";
  showCreateView();
}

/** 추천 결과를 투표 후보 기본값에 넣어 두 기능이 자연스럽게 이어지도록 합니다. */
export function setSuggestedCandidates(names) {
  const inputs = [...elements.createForm.querySelectorAll('input[name="candidate"]')];
  names.slice(0, inputs.length).forEach((name, index) => {
    inputs[index].value = name;
  });
}

/** DOM 연결과 이벤트 등록은 앱 시작 시 한 번만 실행합니다. */
export function initVotingRoom() {
  Object.assign(elements, {
    createSection: document.querySelector("#room-create-section"),
    createForm: document.querySelector("#room-create-form"),
    roomSection: document.querySelector("#room-section"),
    roomTitle: document.querySelector("#room-title"),
    roomCode: document.querySelector("#room-code"),
    roomDeadline: document.querySelector("#room-deadline"),
    joinPanel: document.querySelector("#join-panel"),
    participantName: document.querySelector("#participant-name"),
    joinButton: document.querySelector("#join-button"),
    voteForm: document.querySelector("#vote-form"),
    voteOptions: document.querySelector("#vote-options"),
    voteButton: document.querySelector("#vote-button"),
    voteMessage: document.querySelector("#vote-message"),
    memberCount: document.querySelector("#member-count"),
    memberList: document.querySelector("#member-list"),
  });

  elements.createForm.addEventListener("submit", createRoomFromForm);
  elements.joinButton.addEventListener("click", joinRoom);
  elements.voteForm.addEventListener("submit", submitVote);
  document.querySelector("#add-demo-member-button").addEventListener("click", addDemoMember);
  document.querySelector("#copy-room-link-button").addEventListener("click", copyRoomLink);
  document.querySelector("#delete-room-button").addEventListener("click", removeActiveRoom);
  document.querySelector("#back-to-create-button").addEventListener("click", () => {
    window.location.hash = "group-order";
    showCreateView();
  });

  // 다른 탭은 storage 이벤트, 현재 탭은 커스텀 이벤트로 같은 렌더 함수를 호출합니다.
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEYS.rooms && activeRoomId) renderActiveRoom(activeRoomId);
  });
  window.addEventListener("lunch-room-updated", (event) => {
    if (activeRoomId && event.detail.roomId === activeRoomId) renderActiveRoom(activeRoomId);
  });
}

