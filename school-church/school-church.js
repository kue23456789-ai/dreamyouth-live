/* ==========================================================
   DREAMYOUTH · SCHOOL CHURCH — 공개 페이지
   달력 → 만남 유형 → 신청서 → 접수
   ========================================================== */
(() => {
  "use strict";

  /* ---------- 설정 ---------- */

  const isLocal = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  const metaBase = document.querySelector('meta[name="sc-api-base"]')?.content || "";
  const API_BASE = (isLocal ? `${location.protocol}//${location.hostname}:8787` : metaBase).replace(/\/+$/, "");

  const TYPE_LABEL = { worship: "학교 안 모임 예배", gate: "학교 정문 앞 기도" };
  const TYPE_SHORT = { worship: "모임 예배", gate: "정문 기도" };
  const STATUS_LABEL = { pending: "조율 중", confirmed: "방문 확정", cancelled: "취소" };
  const GATE_PLACE = "학교 정문 앞";
  const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const pad = (n) => String(n).padStart(2, "0");

  /* ---------- 날짜 (한국 시간) ---------- */

  function todayKST() {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  }
  function parseYMD(s) {
    const [y, m, d] = s.split("-").map(Number);
    return { y, m, d, dow: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
  }
  function formatDate(s, withYear = false) {
    const { y, m, d, dow } = parseYMD(s);
    return `${withYear ? `${y}년 ` : ""}${m}월 ${d}일 (${WEEKDAYS[dow]})`;
  }

  /* ---------- 상태 ---------- */

  const today = todayKST();
  const t0 = parseYMD(today);
  const state = {
    year: t0.y,
    month: t0.m,
    selected: null,       // 선택한 날짜 YYYY-MM-DD
    activeEvent: null,    // 달력에서 눌러본 일정 id
    events: {},           // date -> [event]
    preview: false,
    pickedType: null,
    reqSeq: 0,
  };

  /* ---------- 캘린더 ---------- */

  const calBody = $("#calBody");
  const calTitle = $("#calTitle");
  const calMsg = $("#calMsg");

  async function loadMonth() {
    const seq = ++state.reqSeq;
    const month = `${state.year}-${pad(state.month)}`;
    calTitle.textContent = `${state.year}년 ${state.month}월`;
    renderGrid(); // 일단 빈 달력부터 그림
    try {
      const res = await fetch(`${API_BASE}/api/schedule?month=${month}`, { cache: "no-store" });
      const data = await res.json();
      if (seq !== state.reqSeq) return;
      if (!res.ok || !data.ok) throw new Error(data.error || res.status);
      state.events = {};
      for (const ev of data.events) (state.events[ev.date] ||= []).push(ev);
      for (const list of Object.values(state.events)) list.sort((a, b) => a.time.localeCompare(b.time));
      state.preview = !!data.preview;
      $("#previewBadge").classList.toggle("hidden", !state.preview);
      calMsg.classList.add("hidden");
    } catch (err) {
      if (seq !== state.reqSeq) return;
      console.error(err);
      state.events = {};
      calMsg.textContent = "방문 일정을 불러오지 못했어요. 잠시 뒤 새로고침해 주세요.";
      calMsg.classList.remove("hidden");
    }
    renderGrid();
    renderDay();
  }

  function renderGrid() {
    const { year, month } = state;
    const firstDow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
    const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const total = Math.ceil((firstDow + days) / 7) * 7;
    const frag = document.createDocumentFragment();

    for (let i = 0; i < total; i++) {
      const day = i - firstDow + 1;
      if (day < 1 || day > days) {
        const blank = document.createElement("div");
        blank.className = "sc-cal-cell is-empty";
        blank.setAttribute("aria-hidden", "true");
        frag.appendChild(blank);
        continue;
      }
      const date = `${year}-${pad(month)}-${pad(day)}`;
      const dow = (firstDow + day - 1) % 7;
      const list = state.events[date] || [];
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "sc-cal-cell";
      btn.dataset.date = date;
      if (dow === 0) btn.classList.add("sun");
      if (date === today) btn.classList.add("is-today");
      if (date < today) btn.classList.add("is-past");
      btn.setAttribute("aria-selected", String(date === state.selected));
      btn.setAttribute(
        "aria-label",
        `${formatDate(date)}${date === today ? ", 오늘" : ""}, ${list.length ? `방문 일정 ${list.length}건` : "일정 없음"}`,
      );

      const num = document.createElement("span");
      num.className = "sc-date";
      num.textContent = day;
      btn.appendChild(num);

      if (list.length) {
        // PC: 시간 · 학교 · 유형
        const ul = document.createElement("span");
        ul.className = "sc-ev-list";
        ul.setAttribute("aria-hidden", "true");
        list.slice(0, 2).forEach((ev) => {
          const chip = document.createElement("span");
          chip.className = `sc-ev ${ev.status}${String(ev.id) === String(state.activeEvent) ? " is-active" : ""}`;
          chip.dataset.eventId = ev.id;
          chip.title = `${ev.time} ${ev.school} · ${TYPE_SHORT[ev.type]} (${STATUS_LABEL[ev.status]})`;
          const top = document.createElement("span");
          top.className = "sc-ev-top";
          const tm = document.createElement("b");
          tm.textContent = ev.time;
          const st = document.createElement("span");
          st.className = "sc-ev-status";
          st.textContent = STATUS_LABEL[ev.status];
          top.append(tm, st);
          const nm = document.createElement("span");
          nm.className = "sc-ev-name";
          nm.textContent = `${ev.school} · ${TYPE_SHORT[ev.type]}`;
          chip.append(top, nm);
          ul.appendChild(chip);
        });
        btn.appendChild(ul);
        if (list.length > 2) {
          const more = document.createElement("span");
          more.className = "sc-ev-more";
          more.setAttribute("aria-hidden", "true");
          more.textContent = `외 ${list.length - 2}건`;
          btn.appendChild(more);
        }
        // 휴대폰: 개수만
        const count = document.createElement("span");
        const allConfirmed = list.every((e) => e.status === "confirmed");
        count.className = `sc-count ${allConfirmed ? "confirmed" : "pending"}`;
        count.setAttribute("aria-hidden", "true");
        count.textContent = `${list.length}건`;
        btn.appendChild(count);
      }
      frag.appendChild(btn);
    }
    calBody.replaceChildren(frag);
  }

  calBody.addEventListener("click", (e) => {
    const cell = e.target.closest("button.sc-cal-cell");
    if (!cell) return;
    const chip = e.target.closest("[data-event-id]");
    state.activeEvent = chip ? chip.dataset.eventId : null;   // 일정 하나 살펴보기
    state.selected = cell.dataset.date;
    renderGrid();
    renderDay();
    const fresh = calBody.querySelector(`[data-date="${state.selected}"]`);
    fresh && fresh.focus({ preventScroll: true });
  });

  function renderDay() {
    const panel = $("#dayPanel");
    if (!state.selected || !state.selected.startsWith(`${state.year}-${pad(state.month)}`)) {
      panel.hidden = true;
      return;
    }
    const list = state.events[state.selected] || [];
    panel.hidden = false;
    $("#dayTitle").textContent = formatDate(state.selected);
    $("#dayCount").textContent = list.length ? `방문 일정 ${list.length}건` : "";
    $("#dayEmpty").classList.toggle("hidden", list.length > 0);

    const ul = $("#dayList");
    ul.replaceChildren(
      ...list.map((ev) => {
        const li = document.createElement("li");
        li.className = `sc-day-item${String(ev.id) === String(state.activeEvent) ? " is-active" : ""}`;
        li.innerHTML = `
          <span class="sc-day-time"></span>
          <span><span class="sc-day-school"></span> <span class="sc-day-type"></span></span>
          <span class="sc-status ${ev.status}"></span>`;
        li.querySelector(".sc-day-time").textContent = ev.time;
        li.querySelector(".sc-day-school").textContent = ev.school;
        li.querySelector(".sc-day-type").textContent = `· ${TYPE_LABEL[ev.type]}`;
        li.querySelector(".sc-status").textContent = STATUS_LABEL[ev.status];
        if (ev.demo) {
          const tag = document.createElement("span");
          tag.className = "sc-demo-tag";
          tag.textContent = "예시";
          li.querySelector(".sc-day-school").after(tag);
        }
        return li;
      }),
    );

    const past = state.selected < today;
    const btn = $("#applyThisDay");
    btn.disabled = past;
    $("#dayHint").textContent = past
      ? "지난 날짜는 신청할 수 없어요. 다른 날짜를 골라 주세요."
      : list.length
        ? "이미 일정이 있는 날도 다른 시간으로 신청할 수 있어요."
        : "이날 우리 학교로 초대해 보세요.";
  }

  function shiftMonth(delta) {
    const d = new Date(Date.UTC(state.year, state.month - 1 + delta, 1));
    state.year = d.getUTCFullYear();
    state.month = d.getUTCMonth() + 1;
    state.activeEvent = null;
    loadMonth();
  }
  $("#calPrev").addEventListener("click", () => shiftMonth(-1));
  $("#calNext").addEventListener("click", () => shiftMonth(1));
  $("#calToday").addEventListener("click", () => {
    state.year = t0.y;
    state.month = t0.m;
    state.selected = today;
    state.activeEvent = null;
    loadMonth();
  });

  /* ---------- 날짜 → 유형 → 신청서 연결 ---------- */

  const form = $("#applyForm");
  const f = {
    type: () => form.querySelector('input[name="type"]:checked')?.value || "",
    school: $("#school"),
    name: $("#name"),
    phone: $("#phone"),
    date: $("#date"),
    time: $("#time"),
    place: $("#place"),
  };
  f.date.min = today;
  {
    const max = new Date(Date.UTC(t0.y + 1, t0.m - 1, t0.d));
    f.date.max = max.toISOString().slice(0, 10);
  }
  // 희망 시간: 07:00 ~ 20:00, 10분 단위
  for (let m = 7 * 60; m <= 20 * 60; m += 10) {
    const v = `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
    f.time.add(new Option(v, v));
  }

  function setPickedDateBanner() {
    const el = $("#pickedDate");
    const v = f.date.value;
    if (v && !f.type()) {
      el.textContent = `📅 ${formatDate(v)} · 이제 아래에서 어떤 만남이 좋을지 골라 주세요.`;
      el.classList.remove("hidden");
    } else {
      el.classList.add("hidden");
    }
  }

  $("#applyThisDay").addEventListener("click", () => {
    if (!state.selected || state.selected < today) return;
    f.date.value = state.selected;
    clearError("date");
    if (f.type()) {
      goToForm();
    } else {
      setPickedDateBanner();
      $("#intro").scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });

  let placeAuto = false; // 장소가 자동 입력된 값인지
  function applyType(type) {
    const radio = form.querySelector(`input[name="type"][value="${type}"]`);
    if (radio) radio.checked = true;
    syncPlaceWithType();
    clearError("type");
    setPickedDateBanner();
  }
  const teacherBox = $("#teacherBox");
  const teacherOk = $("#teacherOk");
  function syncTeacherBox() {
    const show = f.type() === "worship";
    teacherBox.classList.toggle("hidden", !show);
    if (!show) clearTeacherError();
  }
  function clearTeacherError() {
    teacherBox.classList.remove("has-error");
    $("#err-teacher").textContent = "";
  }
  teacherOk.addEventListener("change", clearTeacherError);

  function syncPlaceWithType() {
    syncTeacherBox();
    const type = f.type();
    if (type === "gate" && (!f.place.value.trim() || placeAuto)) {
      f.place.value = GATE_PLACE;
      placeAuto = true;
      clearError("place");
    } else if (type === "worship" && placeAuto && f.place.value === GATE_PLACE) {
      f.place.value = "";
      placeAuto = false;
    }
  }
  f.place.addEventListener("input", () => { placeAuto = false; });
  $$('input[name="type"]').forEach((r) => r.addEventListener("change", () => {
    syncPlaceWithType();
    clearError("type");
    setPickedDateBanner();
  }));

  $$("[data-pick-type]").forEach((btn) =>
    btn.addEventListener("click", () => {
      applyType(btn.dataset.pickType);
      goToForm();
    }),
  );

  function goToForm() {
    showForm();
    $("#apply").scrollIntoView({ behavior: "smooth", block: "start" });
    const firstEmpty = [f.school, f.name, f.date, f.time, f.place, f.phone].find((el) => !el.value);
    if (firstEmpty) setTimeout(() => firstEmpty.focus({ preventScroll: true }), 450);
  }

  /* ---------- 신청서 검증 ---------- */

  const PHONE_RE = /^01[016789]\d{7,8}$/;

  function formatPhone(v) {
    const d = v.replace(/\D/g, "").slice(0, 11);
    if (d.length < 4) return d;
    if (d.length < 8) return `${d.slice(0, 3)}-${d.slice(3)}`;
    if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
    return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  }
  f.phone.addEventListener("input", () => {
    const end = f.phone.selectionStart === f.phone.value.length;
    f.phone.value = formatPhone(f.phone.value);
    if (end) f.phone.setSelectionRange(f.phone.value.length, f.phone.value.length);
  });

  function values() {
    return {
      type: f.type(),
      school: f.school.value.trim(),
      name: f.name.value.trim(),
      phone: f.phone.value.trim(),
      date: f.date.value,
      time: f.time.value,
      place: f.place.value.trim(),
      teacherOk: teacherOk.checked,
      website: form.website.value,
    };
  }

  function validate(v) {
    const e = {};
    if (!v.type) e.type = "만남 유형을 골라 주세요.";
    if (!v.school) e.school = "학교 이름을 적어 주세요.";
    if (!v.name) e.name = "이름을 적어 주세요.";
    if (!v.phone) e.phone = "연락받을 휴대폰 번호를 적어 주세요.";
    else if (!PHONE_RE.test(v.phone.replace(/\D/g, ""))) e.phone = "휴대폰 번호를 다시 확인해 주세요. (예: 010-1234-5678)";
    if (!v.date) e.date = "날짜를 골라 주세요.";
    else if (v.date < today) e.date = "오늘이나 그 이후 날짜로 골라 주세요.";
    else if (f.date.max && v.date > f.date.max) e.date = "1년 안의 날짜로 골라 주세요.";
    if (!v.time) e.time = "시간을 골라 주세요.";
    if (!v.place) e.place = "만날 장소를 적어 주세요.";
    if (v.type === "worship" && !v.teacherOk) e.teacher = "담당 선생님과 이야기를 마친 뒤 체크해 주세요.";
    return e;
  }

  function fieldWrap(name) {
    return name === "type" ? $("#f-type") : f[name].closest(".sc-field");
  }
  function showError(name, msg) {
    const wrap = fieldWrap(name);
    wrap.classList.add("has-error");
    $(`#err-${name}`).textContent = msg;
    if (name !== "type") f[name].setAttribute("aria-invalid", "true");
  }
  function clearError(name) {
    const wrap = fieldWrap(name);
    wrap.classList.remove("has-error");
    $(`#err-${name}`).textContent = "";
    if (name !== "type") f[name].removeAttribute("aria-invalid");
  }
  function showErrors(errors) {
    if (errors.teacher) {
      teacherBox.classList.add("has-error");
      $("#err-teacher").textContent = errors.teacher;
    } else clearTeacherError();
    ["type", "school", "name", "date", "time", "place", "phone"].forEach((n) => (errors[n] ? showError(n, errors[n]) : clearError(n)));
    const first = ["type", "school", "name", "date", "time", "place", "phone"].find((n) => errors[n]);
    if (!first && errors.teacher) teacherOk.focus();
    if (first) {
      const el = first === "type" ? form.querySelector('input[name="type"]') : f[first];
      el.focus();
    }
  }

  // 입력하면 해당 오류 지우기 + 실패 후 내용이 바뀌면 새 접수 키 발급
  ["school", "name", "phone", "date", "time", "place"].forEach((n) => {
    const ev = f[n].tagName === "SELECT" || f[n].type === "date" ? "change" : "input";
    f[n].addEventListener(ev, () => {
      if (fieldWrap(n).classList.contains("has-error")) clearError(n);
      idemKey = null;
      if (n === "date") setPickedDateBanner();
    });
  });
  form.addEventListener("change", (e) => { if (e.target.name === "type") idemKey = null; });

  /* ---------- 접수 ---------- */

  let idemKey = null;
  let submitting = false;
  const submitBtn = $("#submitBtn");
  const formError = $("#formError");

  function newKey() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (submitting) return; // 연속 클릭 방지
    formError.classList.add("hidden");

    const v = values();
    const errors = validate(v);
    showErrors(errors);
    if (Object.keys(errors).length) return;

    submitting = true;
    idemKey ||= newKey();
    submitBtn.disabled = true;
    submitBtn.setAttribute("aria-busy", "true");
    const label = submitBtn.innerHTML;
    submitBtn.textContent = "보내는 중…";

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    try {
      const res = await fetch(`${API_BASE}/api/applications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...v, idempotencyKey: idemKey }),
        signal: ctrl.signal,
      });
      let data = {};
      try { data = await res.json(); } catch {}
      if (res.ok && data.ok && data.application) {
        showDone(data.application);
        idemKey = null;
        return;
      }
      if (res.status === 422 && data.fields) {
        showErrors(data.fields);
        idemKey = null;
      }
      throw new Error(data.error || "신청을 보내지 못했어요.");
    } catch (err) {
      // 실패하면 입력 내용은 그대로 두고 안내만
      formError.textContent =
        err.name === "AbortError" || err instanceof TypeError
          ? "인터넷 연결이 불안정해서 신청을 보내지 못했어요. 적은 내용은 그대로 있으니 버튼을 한 번 더 눌러 주세요."
          : `${err.message} 적은 내용은 그대로 남아 있어요.`;
      formError.classList.remove("hidden");
    } finally {
      clearTimeout(timer);
      submitting = false;
      submitBtn.disabled = false;
      submitBtn.removeAttribute("aria-busy");
      submitBtn.innerHTML = label;
    }
  });

  function showDone(app) {
    $("#doneSchool").textContent = app.school;
    $("#doneDate").textContent = formatDate(app.date, true);
    $("#doneTime").textContent = app.time;
    $("#doneType").textContent = TYPE_LABEL[app.type];
    form.classList.add("hidden");
    const done = $("#doneView");
    done.classList.remove("hidden");
    done.focus({ preventScroll: true });
    $("#apply").scrollIntoView({ behavior: "smooth", block: "start" });

    // 공개 달력 새로고침 (접수한 달로 이동)
    const d = parseYMD(app.date);
    state.year = d.y;
    state.month = d.m;
    state.selected = app.date;
    state.activeEvent = app.id;
    loadMonth();
  }

  function showForm() {
    if (!form.classList.contains("hidden")) return;
    $("#doneView").classList.add("hidden");
    form.classList.remove("hidden");
  }

  $("#newApply").addEventListener("click", () => {
    form.reset();
    syncTeacherBox();
    placeAuto = false;
    idemKey = null;
    ["type", "school", "name", "date", "time", "place", "phone"].forEach(clearError);
    setPickedDateBanner();
    showForm();
    $("#schedule").scrollIntoView({ behavior: "smooth", block: "start" });
  });

  /* ---------- 시작 ---------- */

  loadMonth();
})();
