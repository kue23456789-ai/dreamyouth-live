/* ==========================================================
   DREAM YOUTH ADMIN — admin.js
   GitHub Contents API를 이용해 data.json을 직접 읽고 씁니다.
   토큰은 로컬(localStorage)에만 저장되고, GitHub API로만 전송됩니다.
   ========================================================== */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const STORAGE_KEY = "dy_admin_conn_v1";

let conn = null;      // { owner, repo, token }
let sha = null;        // 현재 data.json의 git sha (덮어쓰기 충돌 방지용)
let data = null;       // 편집 중인 데이터 객체
let dirty = false;     // 저장 안 된 변경사항이 있는지

/* ---------- base64 <-> UTF-8 (한글 안전) ---------- */

function toBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

function fromBase64(b64) {
  const binary = atob(b64);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/* ---------- GitHub API ---------- */

const API = "https://api.github.com";

async function ghRequest(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${conn.token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.message || `GitHub API 오류 (${res.status})`);
  }
  return res.json();
}

async function fetchDataJson() {
  const result = await ghRequest(
    "GET",
    `/repos/${conn.owner}/${conn.repo}/contents/data.json`
  );
  sha = result.sha;
  return JSON.parse(fromBase64(result.content));
}

async function pushDataJson(newData, message) {
  const content = toBase64(JSON.stringify(newData, null, 2));
  const result = await ghRequest(
    "PUT",
    `/repos/${conn.owner}/${conn.repo}/contents/data.json`,
    { message, content, sha }
  );
  sha = result.content.sha; // 다음 저장을 위해 최신 sha 갱신
}

/* ---------- 연결 화면 ---------- */

function loadSavedConnection() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (saved) {
      $("#inOwner").value = saved.owner || "";
      $("#inRepo").value = saved.repo || "";
      $("#inToken").value = saved.token || "";
    }
  } catch {}
}

$("#tokenHelpBtn").addEventListener("click", () => {
  $("#tokenHelp").classList.toggle("hidden");
});

$("#btnConnect").addEventListener("click", async () => {
  const owner = $("#inOwner").value.trim();
  const repo = $("#inRepo").value.trim();
  const token = $("#inToken").value.trim();
  const remember = $("#inRemember").checked;
  const errEl = $("#connectError");
  errEl.classList.add("hidden");

  if (!owner || !repo || !token) {
    errEl.textContent = "저장소 소유자, 저장소 이름, 토큰을 모두 입력해주세요.";
    errEl.classList.remove("hidden");
    return;
  }

  const btn = $("#btnConnect");
  btn.disabled = true;
  btn.textContent = "연결 중…";

  conn = { owner, repo, token };

  try {
    data = await fetchDataJson();

    if (remember) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(conn));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }

    $("#connectView").classList.add("hidden");
    $("#editView").classList.remove("hidden");
    renderAllPanels();
  } catch (err) {
    errEl.textContent =
      "연결 실패: " + err.message + " (아이디·저장소 이름·토큰 권한을 확인해주세요)";
    errEl.classList.remove("hidden");
  } finally {
    btn.disabled = false;
    btn.textContent = "연결하고 불러오기";
  }
});

/* ---------- 탭 전환 ---------- */

$("#adminTabs").addEventListener("click", (e) => {
  const tabBtn = e.target.closest(".admin-tab");
  if (!tabBtn) return;
  $$(".admin-tab").forEach((t) => t.classList.remove("active"));
  tabBtn.classList.add("active");
  const target = tabBtn.dataset.tab;
  $$(".admin-panel").forEach((p) =>
    p.classList.toggle("hidden", p.dataset.panel !== target)
  );
});

/* ---------- 변경 감지 ---------- */

function markDirty() {
  dirty = true;
  $("#saveBar").classList.remove("hidden");
  const status = $("#saveStatus");
  status.textContent = "저장되지 않은 변경사항이 있어요";
  status.className = "save-status";
}

document.addEventListener("input", (e) => {
  if (e.target.closest("#editView")) markDirty();
});

/* ---------- 전체 렌더링 ---------- */

function renderAllPanels() {
  renderWorship();
  renderLiveButtons();
  renderOrder();
  renderSongs();
  renderNotices();
  renderServants();
}

/* ----- 예배 정보 ----- */

function renderWorship() {
  $("#wTitle").value = data.worship.title || "";
  $("#wMessage").value = data.worship.message || "";
  $("#wVerse").value = data.worship.verse || "";
  $("#wPreacher").value = data.worship.preacher || "";
}

function collectWorship() {
  data.worship.title = $("#wTitle").value.trim();
  data.worship.message = $("#wMessage").value.trim();
  data.worship.verse = $("#wVerse").value.trim();
  data.worship.preacher = $("#wPreacher").value.trim();
}

/* ----- 빠른 진행 제어 ----- */

function renderLiveButtons() {
  const wrap = $("#liveButtons");
  wrap.innerHTML = "";
  data.order.forEach((item, i) => {
    const btn = document.createElement("button");
    btn.className = "live-btn" + (data.live.currentOrder === i ? " active" : "");
    btn.innerHTML = `<span class="live-btn-time">${item.time}</span><span>${item.name}</span>`;
    btn.addEventListener("click", () => setLiveOrder(i));
    wrap.appendChild(btn);
  });
}

async function setLiveOrder(index) {
  collectAllPanels(); // 다른 탭에서 편집 중이던 내용도 함께 저장
  data.live.currentOrder = index;
  await quickSave(`Set current order to ${index}`);
  renderLiveButtons();
}

$("#btnLiveOff").addEventListener("click", async () => {
  collectAllPanels();
  data.live.currentOrder = -1;
  await quickSave("Reset live order");
  renderLiveButtons();
});

async function quickSave(message) {
  const status = $("#saveStatus");
  $("#saveBar").classList.remove("hidden");
  status.textContent = "저장 중…";
  status.className = "save-status";
  try {
    await pushDataJson(data, message);
    dirty = false;
    status.textContent = "저장 완료! 30초 안에 학생들 화면에 반영돼요.";
    status.className = "save-status ok";
  } catch (err) {
    status.textContent = "저장 실패: " + err.message;
    status.className = "save-status err";
  }
}

/* ----- 예배 순서 ----- */

function renderOrder() {
  const wrap = $("#orderRows");
  wrap.innerHTML = "";
  data.order.forEach((item, i) => {
    const row = document.createElement("div");
    row.className = "repeat-row";
    row.innerHTML = `
      <div class="repeat-row-head">
        <span class="repeat-row-title">순서 ${i + 1}</span>
        <button class="admin-btn admin-btn-del" data-del="order" data-idx="${i}">삭제</button>
      </div>
      <div class="field-grid-2">
        <div>
          <label class="admin-label">시간</label>
          <input class="admin-input" data-field="time" data-arr="order" data-idx="${i}" value="${escAttr(item.time)}" />
        </div>
        <div>
          <label class="admin-label">이름</label>
          <input class="admin-input" data-field="name" data-arr="order" data-idx="${i}" value="${escAttr(item.name)}" />
        </div>
      </div>
      <label class="admin-label">설명</label>
      <input class="admin-input" data-field="detail" data-arr="order" data-idx="${i}" value="${escAttr(item.detail)}" />
    `;
    wrap.appendChild(row);
  });
}

/* ----- 찬양 리스트 ----- */

function renderSongs() {
  const wrap = $("#songRows");
  wrap.innerHTML = "";
  data.songs.forEach((s, i) => {
    const row = document.createElement("div");
    row.className = "repeat-row";
    row.innerHTML = `
      <div class="repeat-row-head">
        <span class="repeat-row-title">찬양 ${i + 1}</span>
        <button class="admin-btn admin-btn-del" data-del="songs" data-idx="${i}">삭제</button>
      </div>
      <label class="admin-label">제목</label>
      <input class="admin-input" data-field="title" data-arr="songs" data-idx="${i}" value="${escAttr(s.title)}" />
      <div class="field-grid-2">
        <div>
          <label class="admin-label">가사 한 줄 (선택)</label>
          <input class="admin-input" data-field="line" data-arr="songs" data-idx="${i}" value="${escAttr(s.line || "")}" />
        </div>
        <div>
          <label class="admin-label">키 (선택)</label>
          <input class="admin-input" data-field="key" data-arr="songs" data-idx="${i}" value="${escAttr(s.key || "")}" />
        </div>
      </div>
      <label class="admin-checkbox">
        <input type="checkbox" data-field="final" data-arr="songs" data-idx="${i}" ${s.final ? "checked" : ""} />
        결단 찬양으로 강조하기
      </label>
    `;
    wrap.appendChild(row);
  });
}

/* ----- 공지사항 ----- */

function renderNotices() {
  const wrap = $("#noticeRows");
  wrap.innerHTML = "";
  data.notices.forEach((n, i) => {
    const row = document.createElement("div");
    row.className = "repeat-row";
    row.innerHTML = `
      <div class="repeat-row-head">
        <span class="repeat-row-title">공지 ${i + 1}</span>
        <button class="admin-btn admin-btn-del" data-del="notices" data-idx="${i}">삭제</button>
      </div>
      <div class="field-grid-2">
        <div>
          <label class="admin-label">배지</label>
          <input class="admin-input" data-field="badge" data-arr="notices" data-idx="${i}" value="${escAttr(n.badge)}" />
        </div>
        <div>
          <label class="admin-label">제목</label>
          <input class="admin-input" data-field="title" data-arr="notices" data-idx="${i}" value="${escAttr(n.title)}" />
        </div>
      </div>
      <label class="admin-label">설명</label>
      <textarea class="admin-textarea" rows="2" data-field="desc" data-arr="notices" data-idx="${i}">${escHtml(n.desc)}</textarea>
      <label class="admin-checkbox">
        <input type="checkbox" data-field="highlight" data-arr="notices" data-idx="${i}" ${n.highlight ? "checked" : ""} />
        강조 카드로 표시 (파란 배경)
      </label>
    `;
    wrap.appendChild(row);
  });
}

/* ----- 섬김 명단 ----- */

function renderServants() {
  const wrap = $("#servantWeeks");
  wrap.innerHTML = "";
  data.servants.forEach((week, wi) => {
    const block = document.createElement("div");
    block.className = "week-block";
    block.innerHTML = `
      <div class="week-block-head">
        <input class="admin-input" data-field="label" data-week="${wi}" value="${escAttr(week.label)}" placeholder="예: 8월 2일 (다음 주)" />
        <button class="admin-btn admin-btn-del" data-delweek="${wi}">주차 삭제</button>
      </div>
      <div data-rolewrap="${wi}"></div>
      <button class="admin-btn admin-btn-add" data-addrole="${wi}" style="margin-top:4px;">+ 역할 추가</button>
    `;
    wrap.appendChild(block);

    const roleWrap = block.querySelector(`[data-rolewrap="${wi}"]`);
    week.roles.forEach((r, ri) => {
      const roleRow = document.createElement("div");
      roleRow.className = "role-row";
      roleRow.innerHTML = `
        <input class="admin-input" data-field="role" data-week="${wi}" data-role="${ri}" value="${escAttr(r.role)}" placeholder="역할" style="flex:1" />
        <input class="admin-input" data-field="name" data-week="${wi}" data-role="${ri}" value="${escAttr(r.name)}" placeholder="이름" style="flex:1" />
        <button class="admin-btn admin-btn-del" data-delrole="${wi}:${ri}">삭제</button>
      `;
      roleWrap.appendChild(roleRow);
    });
  });
}

/* ---------- 추가/삭제 이벤트 (위임) ---------- */

document.addEventListener("click", (e) => {
  const addBtn = e.target.closest("[data-add]");
  if (addBtn) {
    collectAllPanels();
    const type = addBtn.dataset.add;
    if (type === "order") data.order.push({ time: "", name: "새 순서", detail: "", type: "" });
    if (type === "songs") data.songs.push({ no: data.songs.length + 1, title: "새 찬양", key: "", line: "", final: false });
    if (type === "notices") data.notices.push({ badge: "공지", title: "새 공지", desc: "", highlight: false });
    if (type === "servants") data.servants.push({ label: "새 주차", roles: [{ role: "대표기도", name: "" }] });
    renderAllPanels();
    markDirty();
    return;
  }

  const delBtn = e.target.closest("[data-del]");
  if (delBtn) {
    collectAllPanels();
    const type = delBtn.dataset.del;
    const idx = Number(delBtn.dataset.idx);
    data[type].splice(idx, 1);
    renderAllPanels();
    markDirty();
    return;
  }

  const addRoleBtn = e.target.closest("[data-addrole]");
  if (addRoleBtn) {
    collectAllPanels();
    const wi = Number(addRoleBtn.dataset.addrole);
    data.servants[wi].roles.push({ role: "", name: "" });
    renderServants();
    markDirty();
    return;
  }

  const delRoleBtn = e.target.closest("[data-delrole]");
  if (delRoleBtn) {
    collectAllPanels();
    const [wi, ri] = delRoleBtn.dataset.delrole.split(":").map(Number);
    data.servants[wi].roles.splice(ri, 1);
    renderServants();
    markDirty();
    return;
  }

  const delWeekBtn = e.target.closest("[data-delweek]");
  if (delWeekBtn) {
    collectAllPanels();
    const wi = Number(delWeekBtn.dataset.delweek);
    data.servants.splice(wi, 1);
    renderServants();
    markDirty();
    return;
  }
});

/* ---------- 폼 -> data 객체로 값 수집 ---------- */

function escAttr(str) {
  return String(str ?? "").replace(/"/g, "&quot;");
}
function escHtml(str) {
  return String(str ?? "").replace(/</g, "&lt;");
}

function collectAllPanels() {
  collectWorship();
  collectArrayPanel("order");
  collectArrayPanel("songs");
  collectArrayPanel("notices");
  collectServants();
}

function collectArrayPanel(type) {
  $$(`[data-arr="${type}"]`).forEach((el) => {
    const idx = Number(el.dataset.idx);
    const field = el.dataset.field;
    if (!data[type][idx]) return;
    if (el.type === "checkbox") {
      data[type][idx][field] = el.checked;
    } else {
      data[type][idx][field] = el.value.trim();
    }
  });
}

function collectServants() {
  $$('[data-week]').forEach((el) => {
    const wi = Number(el.dataset.week);
    if (!data.servants[wi]) return;
    if (el.dataset.role !== undefined) {
      const ri = Number(el.dataset.role);
      if (!data.servants[wi].roles[ri]) return;
      data.servants[wi].roles[ri][el.dataset.field] = el.value.trim();
    } else {
      data.servants[wi][el.dataset.field] = el.value.trim();
    }
  });
}

/* ---------- 전체 저장 ---------- */

$("#btnSaveAll").addEventListener("click", async () => {
  collectAllPanels();
  data.meta.updated = new Date().toISOString().slice(0, 10);
  const btn = $("#btnSaveAll");
  btn.disabled = true;
  await quickSave("Update via admin page");
  btn.disabled = false;
});

/* ---------- 시작 ---------- */

loadSavedConnection();
