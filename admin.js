/* ==========================================================
   DREAM YOUTH ADMIN — admin.js
   로그인 없이 바로 열립니다.
   현재 사이트에 있는 data.json / teacher-data.json을 불러와서 편집합니다.
   "자동 반영 설정"(Worker 주소 + 비밀번호)이 비어있으면 저장 시
   파일을 다운로드하고, 그 파일을 GitHub에 다시 업로드해야 반영됩니다.
   설정을 채우면 저장 즉시 Cloudflare Worker를 통해 GitHub에 커밋되어
   사이트에 바로 반영됩니다.
   ========================================================== */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

let data = null;         // 학생용 메인 데이터 (data.json)
let teacherData = null;  // 교육목자 자료 (teacher-data.json)
let dirty = false;       // 저장 안 된 변경사항이 있는지
let pendingImages = {};  // { weekIndex: { dataUrl, file } } 다운로드/반영 전 임시 보관
let pendingAboutPhoto = null; // { dataUrl, file } 홈페이지 소개 사진, 반영 전 임시 보관
let pendingLeaderImages = {}; // { leaderIndex: { dataUrl, file } } 섬기는 이 사진, 반영 전 임시 보관

/* ---------- 이미지 업로드 전 자동 리사이즈 (용량 최적화) ---------- */

function resizeImageFile(file, maxDim, quality) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round(height * (maxDim / width));
          width = maxDim;
        } else {
          width = Math.round(width * (maxDim / height));
          height = maxDim;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(url);
          resolve(blob || file);
        },
        "image/jpeg",
        quality
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file); // 리사이즈 실패 시 원본 그대로 사용
    };
    img.src = url;
  });
}

/* ---------- 자동 반영 (Cloudflare Worker) ---------- */

const WORKER_URL_KEY = "dy_worker_url";
const ADMIN_PW_KEY = "dy_admin_pw";

function getWorkerConfig() {
  return {
    url: (localStorage.getItem(WORKER_URL_KEY) || "").trim(),
    pw: localStorage.getItem(ADMIN_PW_KEY) || "",
  };
}

function isPublishConfigured() {
  const { url, pw } = getWorkerConfig();
  return !!(url && pw);
}

function utf8ToBase64(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function publishToGitHub(path, contentBase64, message) {
  const { url, pw } = getWorkerConfig();
  const res = await fetch(url.replace(/\/$/, "") + "/save", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${pw}` },
    body: JSON.stringify({ path, contentBase64, message }),
  });
  const result = await res.json().catch(() => ({ ok: false, error: "서버 응답을 읽지 못했어요." }));
  if (!res.ok || !result.ok) throw new Error(result.error || `HTTP ${res.status}`);
  return result;
}

function updateSaveButtonLabels() {
  $("#btnSaveAll").textContent = isPublishConfigured() ? "저장하고 바로 반영" : "data.json 다운로드";
  $("#btnSaveTeacher").textContent = isPublishConfigured() ? "저장하고 바로 반영" : "teacher-data.json 다운로드";
}

$("#workerUrl") && ($("#workerUrl").value = getWorkerConfig().url);
$("#workerPw") && ($("#workerPw").value = getWorkerConfig().pw);

$("#btnSaveSettings").addEventListener("click", () => {
  localStorage.setItem(WORKER_URL_KEY, $("#workerUrl").value.trim());
  localStorage.setItem(ADMIN_PW_KEY, $("#workerPw").value);
  $("#settingsMsg").textContent = isPublishConfigured()
    ? "저장했어요! 이제부터 저장 버튼을 누르면 사이트에 바로 반영돼요."
    : "저장했어요. (Worker 주소나 비밀번호가 비어있으면 다운로드 방식으로 동작해요)";
  updateSaveButtonLabels();
});

/* ---------- 파일 다운로드 헬퍼 ---------- */

function downloadText(filename, text) {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* ---------- 데이터 불러오기 (현재 배포된 사이트에서 읽기) ---------- */

async function loadAll() {
  try {
    const [dRes, tRes] = await Promise.all([
      fetch(`data.json?v=${Date.now()}`, { cache: "no-store" }),
      fetch(`teacher-data.json?v=${Date.now()}`, { cache: "no-store" }).catch(() => null),
    ]);

    if (!dRes.ok) throw new Error("data.json을 불러오지 못했어요.");
    data = await dRes.json();
    if (!data.about) data.about = {};
    data.about.photo = data.about.photo || "";
    data.about.lead = data.about.lead || "";
    data.about.body = data.about.body || "";
    data.about.vision = data.about.vision || "";
    if (!Array.isArray(data.about.values) || data.about.values.length !== 4) {
      data.about.values = [0, 1, 2, 3].map(() => ({ title: "", titleEn: "", quote: "", desc: "" }));
    }
    if (!Array.isArray(data.leaders)) data.leaders = [];

    if (tRes && tRes.ok) {
      teacherData = await tRes.json();
    } else {
      teacherData = { weeks: [] };
    }

    $("#loadingView").classList.add("hidden");
    $("#editView").classList.remove("hidden");
    updateSaveButtonLabels();
    renderAllPanels();
  } catch (err) {
    $("#loadingMsg").textContent =
      "불러오기 실패: " + err.message + " (이 페이지를 GitHub Pages 주소로 열었는지 확인해주세요)";
  }
}

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
  status.textContent = "저장되지 않은 변경사항이 있어요 — 다운로드 후 GitHub에 올려주세요";
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
  renderAboutPhotoPreview();
  renderAbout();
  renderLeaders();
  renderTeacherWeeks();
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

function setLiveOrder(index) {
  collectAllPanels();
  data.live.currentOrder = index;
  saveDataJson(`Set current order to ${index}`);
  renderLiveButtons();
}

$("#btnLiveOff").addEventListener("click", () => {
  collectAllPanels();
  data.live.currentOrder = -1;
  saveDataJson("Reset live order");
  renderLiveButtons();
});

async function saveDataJson(message) {
  data.meta.updated = new Date().toISOString().slice(0, 10);
  const status = $("#saveStatus");
  $("#saveBar").classList.remove("hidden");
  const configured = isPublishConfigured();

  if (configured) {
    status.textContent = "반영 중…";
    status.className = "save-status";
    try {
      if (pendingAboutPhoto) {
        const ext = (pendingAboutPhoto.file.type.split("/")[1] || "jpg").replace("jpeg", "jpg");
        const filename = `about-photo.${ext}`;
        const base64 = await fileToBase64(pendingAboutPhoto.file);
        await publishToGitHub(filename, base64, "Update about photo");
        data.about.photo = filename;
        pendingAboutPhoto = null;
      }
      for (const idxStr of Object.keys(pendingLeaderImages)) {
        const idx = Number(idxStr);
        const leader = data.leaders[idx];
        if (!leader) continue;
        const img = pendingLeaderImages[idx];
        const ext = (img.file.type.split("/")[1] || "jpg").replace("jpeg", "jpg");
        const filename = `leader-${leader.id || idx}.${ext}`;
        const base64 = await fileToBase64(img.file);
        await publishToGitHub(filename, base64, `Update leader photo ${filename}`);
        leader.photo = filename;
      }
      pendingLeaderImages = {};
      await publishToGitHub("data.json", utf8ToBase64(JSON.stringify(data, null, 2)), message || "Update data.json via admin");
      dirty = false;
      status.textContent = "저장 완료! 사이트에 바로 반영됐어요.";
      status.className = "save-status ok";
      renderAboutPhotoPreview();
      renderLeaders();
    } catch (err) {
      status.textContent = "반영 실패: " + err.message;
      status.className = "save-status err";
    }
    return;
  }

  if (pendingAboutPhoto) {
    const ext = (pendingAboutPhoto.file.type.split("/")[1] || "jpg").replace("jpeg", "jpg");
    const filename = `about-photo.${ext}`;
    downloadBlob(filename, pendingAboutPhoto.file);
    data.about.photo = filename;
    pendingAboutPhoto = null;
  }
  Object.keys(pendingLeaderImages).forEach((idxStr) => {
    const idx = Number(idxStr);
    const leader = data.leaders[idx];
    if (!leader) return;
    const img = pendingLeaderImages[idx];
    const ext = (img.file.type.split("/")[1] || "jpg").replace("jpeg", "jpg");
    const filename = `leader-${leader.id || idx}.${ext}`;
    downloadBlob(filename, img.file);
    leader.photo = filename;
  });
  pendingLeaderImages = {};
  downloadText("data.json", JSON.stringify(data, null, 2));
  dirty = false;
  status.textContent = "data.json 다운로드 완료! 이 파일을 GitHub에 올려주세요.";
  status.className = "save-status ok";
  renderAboutPhotoPreview();
  renderLeaders();
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
    if (type === "leaders") {
      data.leaders.push({ id: String(Date.now()), photo: "", name: "새 섬기는 이", role: "", phone: "", instagram: "" });
      pendingLeaderImages = {};
    }
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
    if (type === "leaders") pendingLeaderImages = {};
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
  collectAbout();
  collectLeaders();
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

/* ---------- 교육목자 자료 (선생님 전용 페이지) ---------- */

function renderTeacherWeeks() {
  const wrap = $("#teacherWeeks");
  wrap.innerHTML = "";

  teacherData.weeks.forEach((week, i) => {
    const block = document.createElement("div");
    block.className = "week-block";
    const previewSrc = pendingImages[i] ? pendingImages[i].dataUrl : week.sheetImage || "";

    block.innerHTML = `
      <div class="repeat-row-head">
        <span class="repeat-row-title">${week.dateLabel || "새 주차"}</span>
        <button class="admin-btn admin-btn-del" data-delteacherweek="${i}">주차 삭제</button>
      </div>

      <div class="field-grid-2">
        <div>
          <label class="admin-label">날짜 라벨</label>
          <input class="admin-input" data-tfield="dateLabel" data-tidx="${i}" value="${escAttr(week.dateLabel)}" placeholder="예: 2026.8.2" />
        </div>
        <div>
          <label class="admin-label">결단 찬양 제목</label>
          <input class="admin-input" data-tfield="songTitle" data-tidx="${i}" value="${escAttr(week.songTitle)}" />
        </div>
      </div>

      <label class="admin-label">결단 찬양 악보 이미지</label>
      ${previewSrc ? `<div class="sheet-frame" style="max-width:220px;"><img src="${previewSrc}" style="width:100%;display:block;" /></div>` : ""}
      <input type="file" accept="image/*" class="admin-input" data-timgidx="${i}" style="padding:8px;" />
      <p class="admin-desc" style="margin:6px 0 0; font-size:12px;">
        이미지를 선택하고 아래 저장 버튼을 누르면 <b>${week.id || "날짜"}.jpg</b> 라는 이름으로 함께 반영돼요.
        (자동 반영 미설정 시엔 파일이 다운로드되니 저장소 루트에 그대로 올려주세요.)
      </p>

      <label class="admin-label">설교 제목 (핵심 메시지 요약 위 제목)</label>
      <input class="admin-input" data-tfield="messageTitle" data-tidx="${i}" value="${escAttr(week.messageTitle)}" />

      <label class="admin-label">설교 핵심 메시지 요약</label>
      <textarea class="admin-textarea" rows="2" data-tfield="messageSummary" data-tidx="${i}">${escHtml(week.messageSummary)}</textarea>

      <label class="admin-label">기도제목 (한 줄에 하나씩)</label>
      <textarea class="admin-textarea" rows="3" data-tfield="prayerPoints" data-tidx="${i}">${escHtml((week.prayerPoints || []).join("\n"))}</textarea>

      <label class="admin-label">공지사항 (한 줄에 하나씩)</label>
      <textarea class="admin-textarea" rows="4" data-tfield="notices" data-tidx="${i}">${escHtml((week.notices || []).join("\n"))}</textarea>
    `;
    wrap.appendChild(block);
  });
}

function collectTeacherWeeks() {
  $$('[data-tidx]').forEach((el) => {
    const idx = Number(el.dataset.tidx);
    const field = el.dataset.tfield;
    if (!teacherData.weeks[idx]) return;
    if (field === "prayerPoints" || field === "notices") {
      teacherData.weeks[idx][field] = el.value
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
    } else {
      teacherData.weeks[idx][field] = el.value.trim();
    }
  });
}

$("#btnAddTeacherWeek").addEventListener("click", () => {
  collectTeacherWeeks();
  const today = new Date();
  const id = today.toISOString().slice(0, 10);
  teacherData.weeks.unshift({
    id,
    dateLabel: `${today.getFullYear()}.${today.getMonth() + 1}.${today.getDate()}`,
    songTitle: "",
    sheetImage: "",
    messageTitle: "",
    messageSummary: "",
    prayerPoints: [],
    notices: [],
  });
  pendingImages = {};
  renderTeacherWeeks();
  markDirty();
});

document.addEventListener("click", (e) => {
  const delBtn = e.target.closest("[data-delteacherweek]");
  if (delBtn) {
    collectTeacherWeeks();
    const idx = Number(delBtn.dataset.delteacherweek);
    teacherData.weeks.splice(idx, 1);
    pendingImages = {};
    renderTeacherWeeks();
    markDirty();
  }
});

document.addEventListener("change", async (e) => {
  const fileInput = e.target.closest("[data-timgidx]");
  if (!fileInput || !fileInput.files[0]) return;

  const idx = Number(fileInput.dataset.timgidx);
  const file = await resizeImageFile(fileInput.files[0], 1600, 0.85);
  const reader = new FileReader();
  reader.onload = () => {
    pendingImages[idx] = { dataUrl: reader.result, file };
    markDirty();
    renderTeacherWeeks();
  };
  reader.readAsDataURL(file);
});

$("#btnSaveTeacher").addEventListener("click", async () => {
  collectTeacherWeeks();
  const msgEl = $("#teacherSaveMsg");
  const hadImages = Object.keys(pendingImages).length > 0;

  if (isPublishConfigured()) {
    msgEl.textContent = "반영 중…";
    try {
      for (const idxStr of Object.keys(pendingImages)) {
        const idx = Number(idxStr);
        const week = teacherData.weeks[idx];
        if (!week) continue;
        const img = pendingImages[idx];
        const ext = (img.file.type.split("/")[1] || "jpg").replace("jpeg", "jpg");
        const filename = `${week.id || "week" + idx}.${ext}`;
        const base64 = await fileToBase64(img.file);
        await publishToGitHub(filename, base64, `Upload sheet image ${filename}`);
        week.sheetImage = filename;
      }
      pendingImages = {};
      await publishToGitHub("teacher-data.json", utf8ToBase64(JSON.stringify(teacherData, null, 2)), "Update teacher-data.json via admin");
      dirty = false;
      msgEl.textContent = "저장 완료! 선생님 페이지에 바로 반영됐어요.";
      renderTeacherWeeks();
    } catch (err) {
      msgEl.textContent = "반영 실패: " + err.message;
    }
    return;
  }

  // 다운로드 방식: 새로 선택된 이미지들을 올바른 파일명으로 각각 다운로드
  Object.keys(pendingImages).forEach((idxStr) => {
    const idx = Number(idxStr);
    const week = teacherData.weeks[idx];
    if (!week) return;
    const img = pendingImages[idx];
    const ext = (img.file.type.split("/")[1] || "jpg").replace("jpeg", "jpg");
    const filename = `${week.id || "week" + idx}.${ext}`;
    downloadBlob(filename, img.file);
    week.sheetImage = filename;
  });
  pendingImages = {};

  downloadText("teacher-data.json", JSON.stringify(teacherData, null, 2));
  dirty = false;
  msgEl.textContent = "다운로드 완료! teacher-data.json" +
    (hadImages ? "과 이미지 파일" : "") +
    "을 GitHub 저장소 루트에 그대로 올려주세요.";
  renderTeacherWeeks();
});

/* ---------- 홈페이지 소개 ---------- */

function renderAboutPhotoPreview() {
  const wrap = $("#aboutPhotoPreviewWrap");
  if (!wrap) return;
  const src = pendingAboutPhoto ? pendingAboutPhoto.dataUrl : (data.about && data.about.photo ? data.about.photo : "");
  wrap.innerHTML = src
    ? `<div class="sheet-frame" style="max-width:220px;"><img src="${src}" style="width:100%;display:block;" /></div>`
    : `<p class="admin-desc" style="font-size:13px;">아직 등록된 사진이 없어요.</p>`;
}

document.addEventListener("change", async (e) => {
  if (e.target.id !== "aboutPhotoInput" || !e.target.files[0]) return;
  const file = await resizeImageFile(e.target.files[0], 2200, 0.78);
  const reader = new FileReader();
  reader.onload = () => {
    pendingAboutPhoto = { dataUrl: reader.result, file };
    markDirty();
    renderAboutPhotoPreview();
  };
  reader.readAsDataURL(file);
});

function renderAbout() {
  if (!$("#aboutLeadInput")) return;
  $("#aboutLeadInput").value = data.about.lead || "";
  $("#aboutBodyInput").value = data.about.body || "";
  $("#aboutVisionInput").value = data.about.vision || "";
  renderAboutValues();
}

function collectAbout() {
  if (!$("#aboutLeadInput")) return;
  data.about.lead = $("#aboutLeadInput").value.trim();
  data.about.body = $("#aboutBodyInput").value.trim();
  data.about.vision = $("#aboutVisionInput").value.trim();
  collectAboutValues();
}

function renderAboutValues() {
  const wrap = $("#aboutValueRows");
  if (!wrap) return;
  wrap.innerHTML = "";
  data.about.values.forEach((v, i) => {
    const row = document.createElement("div");
    row.className = "repeat-row";
    row.innerHTML = `
      <div class="repeat-row-head">
        <span class="repeat-row-title">${i + 1}번째 방향</span>
      </div>
      <div class="field-grid-2">
        <div>
          <label class="admin-label">제목</label>
          <input class="admin-input" data-vfield="title" data-vidx="${i}" value="${escAttr(v.title)}" />
        </div>
        <div>
          <label class="admin-label">영문 표기</label>
          <input class="admin-input" data-vfield="titleEn" data-vidx="${i}" value="${escAttr(v.titleEn)}" />
        </div>
      </div>
      <label class="admin-label">한 줄 강조 문구</label>
      <input class="admin-input" data-vfield="quote" data-vidx="${i}" value="${escAttr(v.quote)}" />
      <label class="admin-label">설명</label>
      <textarea class="admin-textarea" rows="2" data-vfield="desc" data-vidx="${i}">${escHtml(v.desc)}</textarea>
    `;
    wrap.appendChild(row);
  });
}

function collectAboutValues() {
  $$("[data-vidx]").forEach((el) => {
    const idx = Number(el.dataset.vidx);
    if (!data.about.values[idx]) return;
    data.about.values[idx][el.dataset.vfield] = el.value.trim();
  });
}

/* ---------- 섬기는 이 ---------- */

function renderLeaders() {
  const wrap = $("#leaderRows");
  if (!wrap) return;
  wrap.innerHTML = "";
  data.leaders.forEach((leader, i) => {
    const row = document.createElement("div");
    row.className = "repeat-row";
    const previewSrc = pendingLeaderImages[i] ? pendingLeaderImages[i].dataUrl : leader.photo || "";
    row.innerHTML = `
      <div class="repeat-row-head">
        <span class="repeat-row-title">${escAttr(leader.name || "새 섬기는 이")}</span>
        <button class="admin-btn admin-btn-del" data-del="leaders" data-idx="${i}">삭제</button>
      </div>

      <label class="admin-label">사진</label>
      ${previewSrc ? `<div class="sheet-frame" style="width:90px; height:90px; border-radius:50%; overflow:hidden;"><img src="${previewSrc}" style="width:100%; height:100%; object-fit:cover; display:block;" /></div>` : ""}
      <input type="file" accept="image/*" class="admin-input" data-limgidx="${i}" style="padding:8px;" />

      <div class="field-grid-2" style="margin-top:10px;">
        <div>
          <label class="admin-label">이름</label>
          <input class="admin-input" data-lfield="name" data-lidx="${i}" value="${escAttr(leader.name)}" />
        </div>
        <div>
          <label class="admin-label">직함</label>
          <input class="admin-input" data-lfield="role" data-lidx="${i}" value="${escAttr(leader.role)}" placeholder="예: 담당 전도사" />
        </div>
      </div>
      <div class="field-grid-2">
        <div>
          <label class="admin-label">전화번호 (선택)</label>
          <input class="admin-input" data-lfield="phone" data-lidx="${i}" value="${escAttr(leader.phone)}" placeholder="010-0000-0000" />
        </div>
        <div>
          <label class="admin-label">인스타그램 URL (선택)</label>
          <input class="admin-input" data-lfield="instagram" data-lidx="${i}" value="${escAttr(leader.instagram)}" placeholder="https://instagram.com/..." />
        </div>
      </div>
    `;
    wrap.appendChild(row);
  });
}

function collectLeaders() {
  $$("[data-lidx]").forEach((el) => {
    const idx = Number(el.dataset.lidx);
    if (!data.leaders[idx]) return;
    data.leaders[idx][el.dataset.lfield] = el.value.trim();
  });
}

document.addEventListener("change", async (e) => {
  const fileInput = e.target.closest("[data-limgidx]");
  if (!fileInput || !fileInput.files[0]) return;
  const idx = Number(fileInput.dataset.limgidx);
  const file = await resizeImageFile(fileInput.files[0], 800, 0.85);
  const reader = new FileReader();
  reader.onload = () => {
    pendingLeaderImages[idx] = { dataUrl: reader.result, file };
    markDirty();
    renderLeaders();
  };
  reader.readAsDataURL(file);
});

/* ---------- 전체 저장 ---------- */

$("#btnSaveAll").addEventListener("click", () => {
  collectAllPanels();
  saveDataJson("Update data.json via admin");
});

/* ---------- 시작 ---------- */

loadAll();
