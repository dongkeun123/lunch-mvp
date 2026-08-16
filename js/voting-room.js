import { getRoomBackend } from "./backend/room-backend.js";
import { escapeHtml, formatDateTime } from "./utils.js";

/**
 * 공동주문 투표방 UI
 * 화면은 저장 기술을 직접 다루지 않고 room-backend의 공통 메서드만 호출합니다.
 * 따라서 Supabase 연결 여부와 관계없이 같은 UI와 초대 링크 형식을 유지합니다.
 */
let activeRoomId = null;
let backend = null;
let subscribedRoomId = null;
let unsubscribeRoom = null;
let renderSequence = 0;

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

function stopRoomSubscription() {
  unsubscribeRoom?.();
  unsubscribeRoom = null;
  subscribedRoomId = null;
}

function showCreateView() {
  activeRoomId = null;
  stopRoomSubscription();
  elements.createSection.hidden = false;
  elements.roomSection.hidden = true;
}

function setVoteMessage(message, isError = false) {
  elements.voteMessage.textContent = message;
  elements.voteMessage.classList.toggle("is-error", isError);
}

async function ensureBackend() {
  if (!backend) backend = await getRoomBackend();
  return backend;
}

function updateBackendNotice(activeBackend) {
  const title = elements.backendNotice.querySelector("strong");
  const description = elements.backendNotice.querySelector("span");
  const isOnline = activeBackend.mode === "supabase";
  title.textContent = isOnline ? "온라인 초대" : "로컬 데모";
  description.textContent = isOnline
    ? "초대 링크를 받은 사람이 다른 기기에서도 참여하고 투표할 수 있습니다."
    : "같은 브라우저의 새 탭까지 동기화됩니다. Supabase 설정 후 다른 기기 초대가 활성화됩니다.";
  elements.addDemoMemberButton.hidden = isOnline;
}

function subscribeToRoom(roomId) {
  if (!backend || subscribedRoomId === roomId) return;
  stopRoomSubscription();
  subscribedRoomId = roomId;
  unsubscribeRoom = backend.subscribeRoom(roomId, () => {
    if (activeRoomId === roomId) renderActiveRoom(roomId, { keepSubscription: true });
  });
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

/** 저장 공급자에서 방을 다시 읽어 로컬 탭과 다른 기기의 변경을 동일한 방식으로 렌더링합니다. */
export async function renderActiveRoom(roomId = getRoomIdFromHash(), { keepSubscription = false } = {}) {
  const sequence = ++renderSequence;
  if (!roomId) {
    showCreateView();
    return;
  }

  activeRoomId = roomId;
  elements.createSection.hidden = true;
  elements.roomSection.hidden = false;
  setVoteMessage("방 정보를 불러오는 중이에요.");

  try {
    const activeBackend = await ensureBackend();
    if (!keepSubscription) subscribeToRoom(roomId);
    const room = await activeBackend.getRoom(roomId);
    if (sequence !== renderSequence) return;
    if (!room) {
      window.alert("초대받은 방을 찾을 수 없습니다.");
      window.location.hash = "group-order";
      showCreateView();
      return;
    }

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
    setVoteMessage(backend.mode === "supabase" ? "다른 기기의 참여와 투표가 실시간으로 반영됩니다." : "로컬 데모 모드입니다.");
  } catch (error) {
    console.error("투표방을 불러오지 못했습니다.", error);
    setVoteMessage(error.message || "투표방을 불러오지 못했습니다.", true);
  }
}

async function createRoomFromForm(event) {
  event.preventDefault();
  const data = new FormData(elements.createForm);
  const hostName = String(data.get("host-name") || "").trim();
  const candidates = data.getAll("candidate").map((name) => String(name).trim()).filter(Boolean);
  const uniqueCandidates = [...new Map(candidates.map((name) => [name.toLowerCase(), name])).values()];

  if (!hostName || uniqueCandidates.length < 2) {
    window.alert("닉네임과 서로 다른 후보 메뉴를 2개 이상 입력해주세요.");
    return;
  }

  const submitButton = elements.createForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  try {
    const activeBackend = await ensureBackend();
    const room = await activeBackend.createRoom({
      title: String(data.get("room-title") || "점심 투표방").trim(),
      hostName,
      deadlineMinutes: Number(data.get("deadline-minutes")),
      candidates: uniqueCandidates,
    });
    setCurrentParticipant(room.id, hostName);
    window.location.hash = `room=${encodeURIComponent(room.id)}`;
  } catch (error) {
    window.alert(error.message || "투표방을 만들지 못했습니다.");
  } finally {
    submitButton.disabled = false;
  }
}

/** 초대 링크로 들어온 사용자의 닉네임을 현재 방의 참여자 목록에 추가합니다. */
async function joinRoom() {
  const nickname = elements.participantName.value.trim();
  if (!activeRoomId || !nickname) {
    setVoteMessage("참여할 닉네임을 입력해주세요.", true);
    return;
  }

  elements.joinButton.disabled = true;
  try {
    const activeBackend = await ensureBackend();
    await activeBackend.joinRoom(activeRoomId, nickname);
    setCurrentParticipant(activeRoomId, nickname);
    elements.participantName.value = "";
    setVoteMessage(`${nickname}님이 투표방에 참여했어요.`);
    await renderActiveRoom(activeRoomId, { keepSubscription: true });
  } catch (error) {
    setVoteMessage(error.message || "투표방에 참여하지 못했습니다.", true);
  } finally {
    elements.joinButton.disabled = false;
  }
}

/** 한 사람은 한 후보에만 투표하며 다시 투표하면 백엔드에서 기존 표를 교체합니다. */
async function submitVote(event) {
  event.preventDefault();
  const participant = getCurrentParticipant(activeRoomId);
  const selected = elements.voteForm.querySelector('input[name="room-vote"]:checked');
  if (!activeRoomId || !participant || !selected) {
    setVoteMessage("투표할 메뉴를 선택해주세요.", true);
    return;
  }

  elements.voteButton.disabled = true;
  try {
    const activeBackend = await ensureBackend();
    await activeBackend.castVote(activeRoomId, selected.value, participant);
    setVoteMessage(`${participant}님의 선택이 반영됐어요.`);
    await renderActiveRoom(activeRoomId, { keepSubscription: true });
  } catch (error) {
    setVoteMessage(error.message || "투표를 저장하지 못했습니다.", true);
  } finally {
    elements.voteButton.disabled = false;
  }
}

/** 로컬 모드에서만 가상 참여자를 추가해 득표 UI를 빠르게 시험합니다. */
async function addDemoMember() {
  if (!activeRoomId || backend?.mode !== "local") return;
  try {
    const result = await backend.addDemoMember(activeRoomId);
    setVoteMessage(`${result.nickname}님이 ${result.optionName}에 투표했어요.`);
    await renderActiveRoom(activeRoomId, { keepSubscription: true });
  } catch (error) {
    setVoteMessage(error.message, true);
  }
}

async function copyRoomLink() {
  const url = window.location.href;
  try {
    await navigator.clipboard.writeText(url);
    setVoteMessage("초대 링크를 복사했어요. 참여할 사람에게 전달해보세요.");
  } catch {
    window.prompt("아래 링크를 복사해주세요.", url);
  }
}

async function removeActiveRoom() {
  if (!activeRoomId || !window.confirm("이 투표방을 삭제할까요?")) return;
  try {
    const activeBackend = await ensureBackend();
    await activeBackend.deleteRoom(activeRoomId);
    sessionStorage.removeItem(participantKey(activeRoomId));
    window.location.hash = "group-order";
    showCreateView();
  } catch (error) {
    setVoteMessage(error.message || "투표방을 삭제하지 못했습니다.", true);
  }
}

/** 추천 결과를 투표 후보 기본값에 넣어 두 기능이 자연스럽게 이어지도록 합니다. */
export function setSuggestedCandidates(names) {
  const inputs = [...elements.createForm.querySelectorAll('input[name="candidate"]')];
  names.slice(0, inputs.length).forEach((name, index) => {
    inputs[index].value = name;
  });
}

/** DOM 연결, 백엔드 선택, 이벤트 등록은 앱 시작 시 한 번만 실행합니다. */
export function initVotingRoom() {
  Object.assign(elements, {
    backendNotice: document.querySelector("#room-backend-notice"),
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
    addDemoMemberButton: document.querySelector("#add-demo-member-button"),
  });

  elements.createForm.addEventListener("submit", createRoomFromForm);
  elements.joinButton.addEventListener("click", joinRoom);
  elements.voteForm.addEventListener("submit", submitVote);
  elements.addDemoMemberButton.addEventListener("click", addDemoMember);
  document.querySelector("#copy-room-link-button").addEventListener("click", copyRoomLink);
  document.querySelector("#delete-room-button").addEventListener("click", removeActiveRoom);
  document.querySelector("#back-to-create-button").addEventListener("click", () => {
    window.location.hash = "group-order";
    showCreateView();
  });

  ensureBackend()
    .then(updateBackendNotice)
    .catch((error) => {
      console.error("공동주문 백엔드를 초기화하지 못했습니다.", error);
      elements.backendNotice.querySelector("strong").textContent = "연결 오류";
      elements.backendNotice.querySelector("span").textContent = error.message;
    });
}
