/* ==========================================================
   DREAM YOUTH LIVE — app.js
   data.json 하나만 수정하면 화면 전체가 바뀝니다.
   30초마다 data.json을 다시 읽어와 "현재 진행 중" 순서를
   학생들 화면에 자동 반영합니다. (새로고침 불필요)
   ========================================================== */

const POLL_INTERVAL = 30 * 1000; // 30초마다 갱신
let lastRenderedJSON = "";
let isFirstRender = true;

/* ---------- 유틸 ---------- */

const $ = (sel) => document.querySelector(sel);

function todayString() {
  const d = new Date();
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]}) 주일예배`;
}

/* ---------- 데이터 로드 ---------- */

async function loadData() {
  try {
    // 캐시를 피하기 위해 timestamp를 붙여서 요청
    const res = await fetch(`data.json?v=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();

    // 내용이 바뀐 경우에만 다시 그리기 (불필요한 깜빡임 방지)
    const raw = JSON.stringify(data);
    if (raw !== lastRenderedJSON) {
      lastRenderedJSON = raw;
      renderAll(data);
    }
  } catch (err) {
    console.error("data.json을 불러오지 못했습니다:", err);
    // 최초 로드 실패 시 안내
    if (!lastRenderedJSON) {
      $("#worshipMessage").textContent =
        "데이터를 불러오지 못했어요. 잠시 후 자동으로 다시 시도합니다.";
    }
  }
}

/* ---------- 렌더링 ---------- */

function renderAll(data) {
  renderHero(data);
  renderOrder(data);
  renderSongs(data.songs);
  renderNotices(data.notices);
  renderServants(data.servants);
  $("#updatedAt").textContent = `콘텐츠 업데이트: ${data.meta.updated}`;
  isFirstRender = false;
}

function renderHero(data) {
  const w = data.worship;
  $("#todayDate").textContent = todayString();
  $("#worshipTitle").textContent = w.title;
  $("#worshipMessage").textContent = w.message;
  $("#worshipVerse").textContent = w.verse;
  $("#worshipPreacher").textContent = w.preacher;

  // 예배 전(currentOrder < 0)에는 LIVE 배지를 끔
  const live = data.live.currentOrder >= 0;
  const badge = $("#liveBadge");
  badge.classList.toggle("off", !live);
  badge.innerHTML = live
    ? '<span class="dot"></span>LIVE'
    : "SOON";
}

function renderOrder(data) {
  const current = data.live.currentOrder;
  const list = $("#orderList");
  list.innerHTML = "";

  data.order.forEach((item, i) => {
    const li = document.createElement("li");
    li.className = "order-item";
    if (current >= 0 && i < current) li.classList.add("done");
    if (i === current) li.classList.add("now");

    li.innerHTML = `
      <span class="order-time">${item.time}</span>
      <div>
        <div class="order-name">${item.name}</div>
        <div class="order-detail">${item.detail}</div>
      </div>
      ${i === current ? '<span class="now-chip"><span class="dot"></span>NOW</span>' : ""}
    `;
    list.appendChild(li);
  });

  // 현재 순서로 부드럽게 스크롤 (예배 중일 때만, 최초 렌더 제외)
  const nowEl = list.querySelector(".order-item.now");
  if (nowEl && !isFirstRender) {
    // 사용자가 다른 곳을 보고 있을 수 있으므로 화면 안에 있을 때만
    const rect = $("#orderSection").getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) {
      nowEl.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }
}

function renderSongs(songs) {
  const list = $("#songList");
  list.innerHTML = "";

  songs.forEach((s) => {
    const li = document.createElement("li");
    li.className = "track" + (s.final ? " final" : "");
    li.innerHTML = `
      <span class="track-no">${String(s.no).padStart(2, "0")}</span>
      <div>
        ${s.final ? '<span class="final-tag">결단 찬양</span>' : ""}
        <div class="track-title">${s.title}</div>
        ${s.line ? `<span class="track-line">${s.line}</span>` : ""}
      </div>
      ${s.key ? `<span class="track-key">${s.key}</span>` : ""}
    `;
    list.appendChild(li);
  });
}

function renderNotices(notices) {
  const grid = $("#noticeGrid");
  grid.innerHTML = "";

  notices.forEach((n) => {
    const card = document.createElement("article");
    card.className = "notice-card" + (n.highlight ? " highlight" : "");
    card.innerHTML = `
      <span class="notice-badge">${n.badge}</span>
      <h3 class="notice-title">${n.title}</h3>
      <p class="notice-desc">${n.desc}</p>
    `;
    grid.appendChild(card);
  });
}

function renderServants(weeks) {
  const tabs = $("#servantTabs");
  tabs.innerHTML = "";

  weeks.forEach((week, i) => {
    const btn = document.createElement("button");
    btn.className = "servant-tab";
    btn.textContent = week.label;
    btn.setAttribute("role", "tab");
    btn.setAttribute("aria-selected", i === 0 ? "true" : "false");
    btn.addEventListener("click", () => {
      tabs.querySelectorAll(".servant-tab")
          .forEach((t) => t.setAttribute("aria-selected", "false"));
      btn.setAttribute("aria-selected", "true");
      renderServantTable(week);
    });
    tabs.appendChild(btn);
  });

  if (weeks.length) renderServantTable(weeks[0]);
}

function renderServantTable(week) {
  const body = $("#servantBody");
  body.innerHTML = "";
  week.roles.forEach((r) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<th scope="row">${r.role}</th><td>${r.name}</td>`;
    body.appendChild(tr);
  });
}

/* ---------- 시작 ---------- */

loadData();
setInterval(loadData, POLL_INTERVAL);
