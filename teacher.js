/* ==========================================================
   DREAM YOUTH TEACHER — teacher.js
   별도의 로그인 없이, 이름만 입력하면 바로 자료를 볼 수 있습니다.
   ========================================================== */

const $ = (sel) => document.querySelector(sel);

const NAME_KEY = "dy_teacher_name";

async function loadTeacherData() {
  const res = await fetch(`teacher-data.json?v=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error("데이터를 불러오지 못했어요.");
  return res.json();
}

function renderWeeks(data) {
  const wrap = $("#weekList");
  wrap.innerHTML = "";

  data.weeks.forEach((week) => {
    const card = document.createElement("article");
    card.className = "week-card";
    card.innerHTML = `
      <span class="week-date">${week.dateLabel}</span>
      <h2 class="week-song-title">${week.songTitle}</h2>

      ${
        week.sheetImage
          ? `<div class="sheet-frame"><img src="${week.sheetImage}" alt="${week.songTitle} 악보" loading="lazy" /></div>`
          : ""
      }

      <p class="week-block-title">설교 핵심 요약</p>
      <div class="message-box">
        <p class="msg-title">${week.messageTitle}</p>
        <p class="msg-summary">${week.messageSummary}</p>
      </div>

      <p class="week-block-title">기도제목</p>
      <ul class="bullet-list">
        ${week.prayerPoints.map((p) => `<li>${p}</li>`).join("")}
      </ul>

      <p class="week-block-title">공지사항</p>
      <ul class="bullet-list">
        ${week.notices.map((n) => `<li>${n}</li>`).join("")}
      </ul>
    `;
    wrap.appendChild(card);
  });
}

async function init() {
  let data;
  try {
    data = await loadTeacherData();
  } catch (err) {
    $("#gateView").innerHTML = `<p class="admin-error">${err.message}</p>`;
    return;
  }

  const savedName = localStorage.getItem(NAME_KEY);
  if (savedName) {
    showContent(data, savedName);
    return;
  }

  $("#btnEnter").addEventListener("click", () => enter(data));
  $("#nameInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") enter(data);
  });
}

function enter(data) {
  const name = $("#nameInput").value.trim();
  if (!name) {
    $("#nameInput").focus();
    return;
  }
  localStorage.setItem(NAME_KEY, name);
  showContent(data, name);
}

function showContent(data, name) {
  $("#gateView").classList.add("hidden");
  $("#contentView").classList.remove("hidden");
  $("#welcomeMsg").textContent = `${name} 선생님, 환영합니다 🙏`;
  renderWeeks(data);
}

init();
