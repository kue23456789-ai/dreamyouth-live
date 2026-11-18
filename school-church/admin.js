/* 스쿨처치 신청 관리 — 권한 확인은 모두 서버에서 */
(() => {
  "use strict";

  const isLocal = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  const metaBase = document.querySelector('meta[name="sc-api-base"]')?.content || "";
  const API_BASE = (isLocal ? `${location.protocol}//${location.hostname}:8787` : metaBase).replace(/\/+$/, "");
  const TOKEN_KEY = "sc-admin-token";
  const STATUS_LABEL = { pending: "조율 중", confirmed: "방문 확정", cancelled: "취소" };
  const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

  const $ = (s, r = document) => r.querySelector(s);
  let token = null;
  try { token = sessionStorage.getItem(TOKEN_KEY); } catch {}
  let all = [];
  let filter = "";

  async function api(path, opts = {}) {
    const res = await fetch(API_BASE + path, {
      ...opts,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
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
      token = data.token;
      try { sessionStorage.setItem(TOKEN_KEY, token); } catch {}
      $("#password").value = "";
      await showList();
    } catch (err) {
      $("#loginError").textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  });

  function logout(msg) {
    token = null;
    try { sessionStorage.removeItem(TOKEN_KEY); } catch {}
    $("#listView").classList.add("hidden");
    $("#logoutBtn").classList.add("hidden");
    $("#loginView").classList.remove("hidden");
    $("#loginError").textContent = msg || "";
  }
  $("#logoutBtn").addEventListener("click", () => logout());

  /* ---------- 목록 ---------- */

  async function showList() {
    const data = await api("/api/admin/applications");
    all = data.applications;
    $("#loginView").classList.add("hidden");
    $("#listView").classList.remove("hidden");
    $("#logoutBtn").classList.remove("hidden");
    render();
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

  function render() {
    document.querySelectorAll("[data-count]").forEach((el) => {
      const k = el.dataset.count;
      el.textContent = (k ? all.filter((a) => a.status === k) : all).length;
    });
    const items = filter ? all.filter((a) => a.status === filter) : all;
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
    k("typeLabel").textContent = `${a.type === "gate" ? "학교 정문 앞 기도" : "학교 안 모임 예배"} · ${fmtDate(a.date)} ${a.time}`;
    k("created").textContent = `${fmtCreated(a.createdAt)} 접수`;
    k("name").textContent = a.name;
    k("phone").textContent = a.phone;
    k("phone").href = `tel:${a.phone.replace(/\D/g, "")}`;

    const form = li.querySelector("form");
    form.date.value = a.date;
    form.time.value = a.time;
    form.place.value = a.place;
    li.querySelector('[data-action="confirmed"]').hidden = a.status === "confirmed";
    li.querySelector('[data-action="cancelled"]').hidden = a.status === "cancelled";
    li.querySelector('[data-action="pending"]').hidden = a.status === "pending";

    const msg = li.querySelector(".ad-row-msg");
    async function patch(body, okText) {
      if (body.status === "cancelled" && !confirm(`${a.school} ${fmtDate(a.date)} 방문을 취소할까요?\n취소하면 달력에서도 사라져요.`)) return;
      const buttons = form.querySelectorAll("button");
      buttons.forEach((b) => (b.disabled = true));
      msg.className = "ad-row-msg";
      msg.textContent = "저장 중…";
      try {
        const data = await api(`/api/admin/applications/${a.id}`, { method: "PATCH", body: JSON.stringify(body) });
        all = all.map((x) => (x.id === a.id ? data.application : x));
        render();
        const row = document.querySelector(`.ad-item[data-id="${a.id}"] .ad-row-msg`);
        if (row) row.textContent = okText;
      } catch (err) {
        msg.classList.add("is-error");
        msg.textContent = err.fields ? Object.values(err.fields).join(" ") : err.message;
        buttons.forEach((b) => (b.disabled = false));
      }
    }

    const edits = () => ({ date: form.date.value, time: form.time.value.slice(0, 5), place: form.place.value });
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      patch(edits(), "저장했어요. 달력에도 바로 반영됐어요.");
    });
    form.querySelectorAll("[data-action]:not([data-action='save'])").forEach((btn) =>
      btn.addEventListener("click", () => {
        const status = btn.dataset.action;
        const text = { confirmed: "방문을 확정했어요. 달력에 ‘방문 확정’으로 보여요.", cancelled: "방문을 취소했어요. 달력에서도 빠졌어요.", pending: "다시 ‘조율 중’으로 바꿨어요." }[status];
        // 확정할 때 수정한 날짜·시간도 함께 저장
        patch(status === "cancelled" ? { status } : { ...edits(), status }, text);
      }),
    );
    return li;
  }

  document.querySelector(".ad-filters").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-filter]");
    if (!btn) return;
    filter = btn.dataset.filter;
    document.querySelectorAll(".ad-filters [data-filter]").forEach((b) => b.setAttribute("aria-selected", String(b === btn)));
    render();
  });

  if (token) showList().catch(() => {});
})();
