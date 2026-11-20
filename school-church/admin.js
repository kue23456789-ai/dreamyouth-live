/* 스쿨처치 관리 화면 — 권한 확인은 모두 서버에서 */
(() => {
  "use strict";

  const isLocal = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  const metaBase = document.querySelector('meta[name="sc-api-base"]')?.content || "";
  const API_BASE = (isLocal ? `${location.protocol}//${location.hostname}:8787` : metaBase).replace(/\/+$/, "");
  const TOKEN_KEY = "sc-admin-token";
  const STATUS_LABEL = { pending: "조율 중", confirmed: "방문 확정", cancelled: "취소" };
  const TYPE_LABEL = { worship: "학교 안 모임 예배", gate: "학교 정문 앞 기도" };
  const SLOT_LABEL = { lunch: "점심시간", club: "동아리·모임 시간" };
  const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  let token = null;
  try { token = sessionStorage.getItem(TOKEN_KEY); } catch {}

  let all = [];
  let filter = "";
  let query = "";
  let content = {};     // 서버에 저장된 값
  let images = {};
  let defaults = {};    // 사이트 페이지에 들어 있는 기본 문구

  /* ---------- 서버 요청 ---------- */

  async function api(path, opts = {}) {
    const headers = { ...(opts.body instanceof Blob ? {} : { "Content-Type": "application/json" }), ...(opts.headers || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(API_BASE + path, { ...opts, headers });
    let data = {};
    try { data = await res.json(); } catch {}
    if (res.status === 401 && path !== "/api/admin/login") {
      logout("로그인 시간이 지났어요. 다시 로그인해 주세요.");
      throw new Error(data.error || "로그인이 필요해요.");
    }
    if (!res.ok || !data.ok) {
      const err = new Error(data.error || `처리하지 못했어요. 잠시 뒤 다시 해 주세요. (${res.status})`);
      err.fields = data.fields;
      throw err;
    }
    return data;
  }

  function setMsg(el, text, isError = false) {
    el.textContent = text;
    el.classList.toggle("is-error", isError);
  }

  /* ---------- 로그인 ---------- */

  $("#loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("#loginBtn");
    const pw = $("#password").value;
    $("#loginError").textContent = "";
    if (!pw) { $("#loginError").textContent = "비밀번호를 적어 주세요."; return; }
    btn.disabled = true;
    try {
      const data = await api("/api/admin/login", { method: "POST", body: JSON.stringify({ password: pw }) });
      saveToken(data.token);
      $("#password").value = "";
      await start();
    } catch (err) {
      $("#loginError").textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  });

  function saveToken(t) {
    token = t;
    try { sessionStorage.setItem(TOKEN_KEY, t); } catch {}
  }

  function logout(msg) {
    token = null;
    try { sessionStorage.removeItem(TOKEN_KEY); } catch {}
    $("#appView").classList.add("hidden");
    $("#logoutBtn").classList.add("hidden");
    $("#viewSite").classList.add("hidden");
    $("#loginView").classList.remove("hidden");
    $("#loginError").textContent = msg || "";
  }
  $("#logoutBtn").addEventListener("click", () => logout());

  async function start() {
    await Promise.all([loadApps(), loadContent(), loadDefaults()]);
    $("#loginView").classList.add("hidden");
    $("#appView").classList.remove("hidden");
    $("#logoutBtn").classList.remove("hidden");
    $("#viewSite").classList.remove("hidden");
    renderApps();
    renderTexts();
    renderPhotos();
    renderSettings();
  }

  /* ---------- 탭 ---------- */

  $(".ad-tabs").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-tab]");
    if (!btn) return;
    $$(".ad-tabs [data-tab]").forEach((b) => b.setAttribute("aria-selected", String(b === btn)));
    $$(".ad-panel").forEach((p) => p.classList.toggle("hidden", p.id !== `tab-${btn.dataset.tab}`));
    try { sessionStorage.setItem("sc-admin-tab", btn.dataset.tab); } catch {}
  });
  try {
    const t = sessionStorage.getItem("sc-admin-tab");
    if (t) $(`.ad-tabs [data-tab="${t}"]`)?.click();
  } catch {}

  /* ==========================================================
     ① 신청 관리
     ========================================================== */

  async function loadApps() {
    const data = await api("/api/admin/applications");
    all = data.applications;
  }

  function fmtDate(s) {
    const [y, m, d] = s.split("-").map(Number);
    return `${m}월 ${d}일 (${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]})`;
  }
  // DB 시각(UTC) → 한국 시간
  function fmtCreated(s) {
    const d = new Date(s.replace(" ", "T") + "Z");
    if (Number.isNaN(d.getTime())) return s;
    const k = new Date(d.getTime() + 9 * 3600 * 1000);
    return `${k.getUTCMonth() + 1}월 ${k.getUTCDate()}일 ${String(k.getUTCHours()).padStart(2, "0")}:${String(k.getUTCMinutes()).padStart(2, "0")}`;
  }

  function contactName() {
    return content["contact.name"] ?? defaults["contact.name"] ?? "";
  }

  function smsToStudent(a) {
    const num = (a.phone || "").replace(/\D/g, "");
    if (!num) return "";
    const head = a.status === "confirmed" ? "방문이 확정됐어요." : "신청을 잘 받았어요.";
    const text = [
      `[드림유스 스쿨처치] ${head}`,
      `${a.school} · ${TYPE_LABEL[a.type]}`,
      `${fmtDate(a.date)} ${a.time} (${SLOT_LABEL[a.slot] || "점심시간"})`,
      `장소: ${a.place}`,
      contactName() ? `- ${contactName()}` : "",
    ].filter(Boolean).join("\n");
    const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    return `sms:${num}${ios ? "&" : "?"}body=${encodeURIComponent(text)}`;
  }

  function renderApps() {
    $$("[data-count]").forEach((el) => {
      const k = el.dataset.count;
      el.textContent = (k ? all.filter((a) => a.status === k) : all).length;
    });
    const q = query.trim().toLowerCase();
    const items = all.filter((a) => (!filter || a.status === filter) &&
      (!q || [a.school, a.name, a.phone, a.place].some((v) => (v || "").toLowerCase().includes(q))));
    $("#emptyMsg").classList.toggle("hidden", items.length > 0);
    $("#list").replaceChildren(...items.map(renderRow));
  }

  function renderRow(a) {
    const li = $("#rowTpl").content.firstElementChild.cloneNode(true);
    li.dataset.id = a.id;
    li.classList.toggle("is-cancelled", a.status === "cancelled");
    const k = (key) => li.querySelector(`[data-k="${key}"]`);
    k("statusLabel").textContent = STATUS_LABEL[a.status];
    k("statusLabel").classList.add(a.status);
    k("school").textContent = a.school;
    k("typeLabel").textContent = `${TYPE_LABEL[a.type]} · ${fmtDate(a.date)} ${a.time} (${a.slotLabel || "점심시간"})`;
    k("created").textContent = `${fmtCreated(a.createdAt)} 접수`;
    k("name").textContent = a.name || "—";
    if (a.phone) {
      k("phone").textContent = a.phone;
      k("phone").href = `tel:${a.phone.replace(/\D/g, "")}`;
    } else {
      k("phone").replaceWith(document.createTextNode("—"));
    }
    const sms = smsToStudent(a);
    if (sms) k("sms").href = sms;
    else k("sms").hidden = true;

    const form = li.querySelector("form");
    form.date.value = a.date;
    form.time.value = a.time;
    form.slot.value = a.slot || "lunch";
    form.place.value = a.place;
    li.querySelector('[data-action="confirmed"]').hidden = a.status === "confirmed";
    li.querySelector('[data-action="cancelled"]').hidden = a.status === "cancelled";
    li.querySelector('[data-action="pending"]').hidden = a.status === "pending";

    const msg = li.querySelector(".ad-row-msg");
    const buttons = () => form.querySelectorAll("button");
    async function run(fn, okText) {
      buttons().forEach((b) => (b.disabled = true));
      setMsg(msg, "저장 중…");
      try {
        await fn();
        renderApps();
        const row = document.querySelector(`.ad-item[data-id="${a.id}"] .ad-row-msg`);
        if (row) setMsg(row, okText);
      } catch (err) {
        setMsg(msg, err.fields ? Object.values(err.fields).join(" ") : err.message, true);
        buttons().forEach((b) => (b.disabled = false));
      }
    }
    async function patch(body, okText) {
      if (body.status === "cancelled" && !confirm(`${a.school} ${fmtDate(a.date)} 방문을 취소할까요?\n취소하면 달력에서도 사라져요.`)) return;
      await run(async () => {
        const data = await api(`/api/admin/applications/${a.id}`, { method: "PATCH", body: JSON.stringify(body) });
        all = all.map((x) => (x.id === a.id ? data.application : x));
      }, okText);
    }

    const edits = () => ({ date: form.date.value, time: form.time.value.slice(0, 5), slot: form.slot.value, place: form.place.value });
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      patch(edits(), "저장했어요. 달력에도 바로 반영됐어요.");
    });
    form.querySelectorAll("[data-action]:not([data-action='save'])").forEach((btn) =>
      btn.addEventListener("click", async () => {
        const action = btn.dataset.action;
        if (action === "delete") {
          if (!confirm(`${a.school} ${fmtDate(a.date)} 신청을 완전히 지울까요?\n지우면 되돌릴 수 없어요. 기록을 남기려면 ‘취소’를 써 주세요.`)) return;
          await run(async () => {
            await api(`/api/admin/applications/${a.id}`, { method: "DELETE" });
            all = all.filter((x) => x.id !== a.id);
          }, "");
          return;
        }
        const text = { confirmed: "방문을 확정했어요. 달력에 ‘방문 확정’으로 보여요.", cancelled: "방문을 취소했어요. 달력에서도 빠졌어요.", pending: "다시 ‘조율 중’으로 바꿨어요." }[action];
        // 확정할 때 수정한 날짜·시간도 함께 저장
        patch(action === "cancelled" ? { status: action } : { ...edits(), status: action }, text);
      }),
    );
    return li;
  }

  $(".ad-filters").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-filter]");
    if (!btn) return;
    filter = btn.dataset.filter;
    $$(".ad-filters [data-filter]").forEach((b) => b.setAttribute("aria-selected", String(b === btn)));
    renderApps();
  });
  $("#search").addEventListener("input", (e) => {
    query = e.target.value;
    renderApps();
  });

  // 일정 직접 추가
  const addForm = $("#addForm");
  $("#addToggle").addEventListener("click", () => {
    addForm.classList.toggle("hidden");
    if (!addForm.classList.contains("hidden")) addForm.school.focus();
  });
  $("#addCancel").addEventListener("click", () => addForm.classList.add("hidden"));
  addForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(addForm));
    body.time = (body.time || "").slice(0, 5);
    const msg = $("#addMsg");
    const btn = addForm.querySelector('button[type="submit"]');
    btn.disabled = true;
    setMsg(msg, "추가하는 중…");
    try {
      const data = await api("/api/admin/applications", { method: "POST", body: JSON.stringify(body) });
      all = [data.application, ...all];
      renderApps();
      addForm.reset();
      setMsg(msg, `${data.application.school} ${fmtDate(data.application.date)} 일정을 추가했어요. 달력에도 바로 보여요.`);
    } catch (err) {
      setMsg(msg, err.fields ? Object.values(err.fields).join(" ") : err.message, true);
    } finally {
      btn.disabled = false;
    }
  });

  /* ==========================================================
     ② 사이트 문구
     ========================================================== */

  const GROUPS = [
    { title: "첫 화면", fields: [
      ["hero.title", "큰 제목"], ["hero.lead", "제목 아래 문장"], ["hero.sub", "작은 설명"], ["hero.cta", "버튼"],
    ] },
    { title: "방문 일정 (달력)", fields: [
      ["schedule.title", "제목"], ["schedule.desc", "오른쪽 설명", true], ["schedule.empty", "일정이 없는 날 문구"], ["schedule.note", "달력 아래 안내", true],
    ] },
    { title: "스쿨처치 소개", fields: [
      ["intro.title", "제목"], ["intro.desc", "오른쪽 설명", true], ["intro.divider", "카드 아래 한 줄"],
    ] },
    { title: "카드 ① 학교 안 모임 예배", fields: [
      ["card.worship.pill", "위 작은 표시"], ["card.worship.title", "제목"], ["card.worship.desc", "설명", true], ["card.worship.note", "✓ 안내"], ["card.worship.button", "버튼"],
    ] },
    { title: "카드 ② 학교 정문 앞 기도", fields: [
      ["card.gate.pill", "위 작은 표시"], ["card.gate.title", "제목"], ["card.gate.desc", "설명", true], ["card.gate.note", "✓ 안내"], ["card.gate.button", "버튼"],
    ] },
    { title: "신청서", fields: [
      ["apply.title", "제목"], ["apply.desc", "제목 아래 설명", true], ["apply.teacherNote", "모임 예배 선택 시 안내", true],
      ["apply.teacherCheck", "선생님 확인 체크 문구"], ["apply.submitNote", "신청 버튼 위 안내"],
    ] },
    { title: "접수 완료 · 문자 안내", fields: [
      ["done.title", "완료 제목"], ["done.note", "완료 안내", true], ["sms.inline", "완료 화면 문자 안내", true],
      ["sms.title", "안내창 제목"], ["sms.body", "안내창 설명", true],
    ] },
    { title: "신청 마감 안내 (설정에서 신청 받기를 끈 경우)", fields: [
      ["closed.title", "제목"], ["closed.desc", "설명", true],
    ] },
    { title: "맨 아래", fields: [["footer.org", "단체 이름"]] },
  ];

  // 사이트 페이지의 기본 문구를 읽어 옴
  async function loadDefaults() {
    try {
      const res = await fetch(`school-church.html?v=${Date.now()}`, { cache: "no-store" });
      const doc = new DOMParser().parseFromString(await res.text(), "text/html");
      doc.querySelectorAll("[data-c]").forEach((el) => { defaults[el.dataset.c] = serialize(el); });
      defaults["contact.name"] = doc.querySelector('meta[name="sc-contact-name"]')?.content || "";
      defaults["contact.phone"] = doc.querySelector('meta[name="sc-contact-phone"]')?.content || "";
    } catch (err) {
      console.warn(err);
    }
    Object.assign(defaults, { "time.lunchFrom": "11:00", "time.lunchTo": "14:00", "time.clubFrom": "07:00", "time.clubTo": "20:00" });
  }
  function serialize(el) {
    let out = "";
    el.childNodes.forEach((n) => {
      if (n.nodeType === 3) out += n.textContent;
      else if (n.nodeName === "BR") out += n.classList.contains("br-pc") ? " " : "\n";
      else if (n.nodeName === "B") out += `**${n.textContent}**`;
      else if (n.getAttribute?.("aria-hidden") !== "true") out += n.textContent;
    });
    return out.replace(/[ \t]+/g, " ").replace(/ ?\n ?/g, "\n").trim();
  }

  async function loadContent() {
    const res = await fetch(`${API_BASE}/api/content?v=${Date.now()}`, { cache: "no-store" });
    const data = await res.json();
    content = data.content || {};
    images = data.images || {};
  }

  function renderTexts() {
    const box = $("#textGroups");
    box.replaceChildren();
    GROUPS.forEach((g, gi) => {
      const det = document.createElement("details");
      det.className = "ad-group";
      if (gi === 0) det.open = true;
      const sum = document.createElement("summary");
      sum.textContent = g.title;
      const cnt = document.createElement("span");
      cnt.className = "ad-group-count";
      sum.append(cnt);
      det.append(sum);
      for (const [key, label, multi] of g.fields) {
        const wrap = document.createElement("div");
        wrap.className = "ad-field";
        wrap.dataset.key = key;
        const head = document.createElement("div");
        head.className = "ad-field-head";
        const lab = document.createElement("label");
        lab.htmlFor = `f-${key}`;
        const span = document.createElement("span");
        span.textContent = label;
        lab.append(span);
        const reset = document.createElement("button");
        reset.type = "button";
        reset.className = "ad-reset";
        reset.textContent = "기본 문구로";
        head.append(lab, reset);
        const input = document.createElement(multi ? "textarea" : "input");
        input.id = `f-${key}`;
        input.maxLength = 1000;
        if (multi) input.rows = 2;
        input.value = content[key] ?? defaults[key] ?? "";
        input.placeholder = defaults[key] || "";
        const sync = () => {
          const changed = input.value.trim() !== (defaults[key] || "").trim();
          wrap.classList.toggle("is-changed", changed);
          reset.hidden = !changed;
          const n = det.querySelectorAll(".ad-field.is-changed").length;
          cnt.textContent = n ? `고친 문구 ${n}개` : "";
        };
        input.addEventListener("input", sync);
        reset.addEventListener("click", () => { input.value = defaults[key] || ""; sync(); input.focus(); });
        wrap.append(head, input);
        det.append(wrap);
        queueMicrotask(sync);
      }
      box.append(det);
    });
  }

  $("#textSave").addEventListener("click", async () => {
    const set = {};
    const reset = [];
    $$("#textGroups .ad-field").forEach((w) => {
      const key = w.dataset.key;
      const v = $("input, textarea", w).value.trim();
      if (!v || v === (defaults[key] || "").trim()) { if (key in content) reset.push(key); }
      else if (v !== content[key]) set[key] = v;
    });
    const msg = $("#textMsg");
    if (!Object.keys(set).length && !reset.length) { setMsg(msg, "바뀐 문구가 없어요."); return; }
    const btn = $("#textSave");
    btn.disabled = true;
    setMsg(msg, "저장 중…");
    try {
      const data = await api("/api/admin/content", { method: "PUT", body: JSON.stringify({ set, reset }) });
      content = data.content;
      setMsg(msg, "저장했어요. 사이트를 새로고침하면 바로 보여요.");
    } catch (err) {
      setMsg(msg, err.message, true);
    } finally {
      btn.disabled = false;
    }
  });

  /* ==========================================================
     ③ 사진
     ========================================================== */

  const PHOTOS = [
    { key: "hero", title: "첫 화면 학교 전경", hint: "가로 사진 · 1920px로 줄여서 올려요", file: "school-church/images/school-hero.jpg", max: 1920 },
    { key: "classroom", title: "카드 ① 교실", hint: "가로 사진 · 1400px로 줄여서 올려요", file: "", max: 1400 },
    { key: "gate", title: "카드 ② 학교 정문", hint: "가로 사진 · 1400px로 줄여서 올려요", file: "", max: 1400 },
  ];

  function renderPhotos() {
    $("#photos").replaceChildren(...PHOTOS.map((p) => {
      const card = document.createElement("div");
      card.className = "ad-photo";
      const img = document.createElement("div");
      img.className = "ad-photo-img";
      const src = images[p.key] ? API_BASE + images[p.key] : p.file;
      if (src) img.style.backgroundImage = `url("${src}")`;
      const body = document.createElement("div");
      body.className = "ad-photo-body";
      body.innerHTML = `<h3></h3><p></p><div class="ad-actions"><label class="sc-btn sc-btn-dark ad-file">사진 바꾸기<input type="file" accept="image/jpeg,image/png,image/webp,image/heic" /></label><button type="button" class="sc-btn ad-btn-link">기본 사진으로</button></div><p class="ad-row-msg" role="status"></p>`;
      $("h3", body).textContent = p.title;
      $("p", body).textContent = images[p.key] ? `${p.hint} · 직접 올린 사진 사용 중` : `${p.hint} · ${p.file ? "기본 사진" : "사진 없음 (색 배경)"}`;
      const msg = $(".ad-row-msg", body);
      const resetBtn = $("button", body);
      resetBtn.hidden = !images[p.key];
      $("input", body).addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setMsg(msg, "사진을 줄이는 중…");
        try {
          const blob = await shrink(file, p.max);
          setMsg(msg, "올리는 중…");
          await api(`/api/admin/images/${p.key}`, { method: "PUT", body: blob, headers: { "Content-Type": "image/jpeg" } });
          await loadContent();
          renderPhotos();
        } catch (err) {
          setMsg(msg, err.message || "사진을 올리지 못했어요.", true);
        }
      });
      resetBtn.addEventListener("click", async () => {
        if (!confirm("올린 사진을 지우고 기본 사진으로 돌릴까요?")) return;
        try {
          await api(`/api/admin/images/${p.key}`, { method: "DELETE" });
          await loadContent();
          renderPhotos();
        } catch (err) {
          setMsg(msg, err.message, true);
        }
      });
      card.append(img, body);
      return card;
    }));
  }

  // 브라우저에서 사진 크기를 줄여 JPG로 (1.4MB 아래가 될 때까지 화질 조정)
  async function shrink(file, max) {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" }).catch(() => null);
    if (!bmp) throw new Error("이 사진 형식은 열 수 없어요. JPG나 PNG로 올려 주세요.");
    const scale = Math.min(1, max / bmp.width);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d").drawImage(bmp, 0, 0, canvas.width, canvas.height);
    for (const q of [0.85, 0.75, 0.65, 0.55]) {
      const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", q));
      if (blob && blob.size < 1_400_000) return blob;
    }
    throw new Error("사진이 너무 커요. 더 작은 사진으로 올려 주세요.");
  }

  /* ==========================================================
     ④ 설정
     ========================================================== */

  const sf = $("#settingsForm");
  const val = (k) => content[k] ?? defaults[k] ?? "";
  function renderSettings() {
    sf.applyOpen.checked = content["apply.open"] !== "off";
    sf.contactName.value = val("contact.name");
    sf.contactPhone.value = val("contact.phone");
    sf.lunchFrom.value = val("time.lunchFrom");
    sf.lunchTo.value = val("time.lunchTo");
    sf.clubFrom.value = val("time.clubFrom");
    sf.clubTo.value = val("time.clubTo");
  }
  sf.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = $("#settingsMsg");
    const t = (x) => x.slice(0, 5);
    const lf = t(sf.lunchFrom.value), lt = t(sf.lunchTo.value), cf = t(sf.clubFrom.value), ct = t(sf.clubTo.value);
    if (!lf || !lt || lf >= lt) return setMsg(msg, "점심시간은 시작이 끝보다 빨라야 해요.", true);
    if (!cf || !ct || cf >= ct) return setMsg(msg, "동아리·모임 시간은 시작이 끝보다 빨라야 해요.", true);
    const phone = sf.contactPhone.value.replace(/\D/g, "");
    if (phone && !/^01[016789]\d{7,8}$|^0\d{8,10}$/.test(phone)) return setMsg(msg, "전화번호를 다시 확인해 주세요.", true);
    const set = {
      "apply.open": sf.applyOpen.checked ? "on" : "off",
      "contact.name": sf.contactName.value.trim(),
      "contact.phone": sf.contactPhone.value.trim(),
      "time.lunchFrom": lf, "time.lunchTo": lt, "time.clubFrom": cf, "time.clubTo": ct,
    };
    try {
      setMsg(msg, "저장 중…");
      const data = await api("/api/admin/content", { method: "PUT", body: JSON.stringify({ set }) });
      content = data.content;
      setMsg(msg, "저장했어요. 사이트를 새로고침하면 바로 보여요.");
    } catch (err) {
      setMsg(msg, err.message, true);
    }
  });

  const pf = $("#pwForm");
  pf.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = $("#pwMsg");
    if (pf.next.value.length < 8) return setMsg(msg, "새 비밀번호는 8자 이상으로 정해 주세요.", true);
    if (pf.next.value !== pf.next2.value) return setMsg(msg, "새 비밀번호 두 칸이 서로 달라요.", true);
    try {
      setMsg(msg, "바꾸는 중…");
      const data = await api("/api/admin/password", { method: "POST", body: JSON.stringify({ current: pf.current.value, next: pf.next.value }) });
      saveToken(data.token);
      pf.reset();
      setMsg(msg, "비밀번호를 바꿨어요. 다음부터 새 비밀번호로 로그인해 주세요.");
    } catch (err) {
      setMsg(msg, err.fields ? Object.values(err.fields).join(" ") : err.message, true);
    }
  });

  if (token) start().catch(() => {});
})();
