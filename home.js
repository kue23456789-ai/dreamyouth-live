/* ==========================================================
   DREAMYOUTH HOME — home.js
   data.json(관리자 화면 admin.html에서 수정)의 내용으로
   첫 화면 사진·소개·핵심 방향·비전·섬기는 이·이번 주 예배를 채웁니다.
   불러오지 못하면 HTML에 적힌 기본 문구가 그대로 보여요.
   ========================================================== */
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);

  // 줄바꿈(\n)은 <br>로, HTML은 글자 그대로
  function setText(el, str) {
    if (!el || !str) return;
    el.replaceChildren();
    String(str).split("\n").forEach((line, i) => {
      if (i) el.append(document.createElement("br"));
      el.append(line);
    });
  }
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  }
  const safeUrl = (u) => (/^(https?:|tel:|mailto:)/i.test(u || "") || /^[\w./-]+$/.test(u || "") ? u : "");

  async function load() {
    let data;
    try {
      const res = await fetch(`data.json?v=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) return;
      data = await res.json();
    } catch (err) {
      console.warn("data.json을 불러오지 못했어요. 기본 문구로 보여요.", err);
      return;
    }
    const about = data.about || {};

    // 첫 화면 사진
    if (about.photo && safeUrl(about.photo)) {
      document.documentElement.style.setProperty("--hero-img", `url("${about.photo}")`);
    }
    // 비전 (첫 화면 제목 + 비전 상자)
    if (about.vision) document.querySelectorAll("[data-vision]").forEach((n) => setText(n, about.vision));

    setText($("aboutLead"), about.lead);
    setText($("aboutBody"), about.body);

    // 핵심 방향
    const grid = $("valueGrid");
    const values = (about.values || []).filter((v) => v && (v.title || v.desc));
    if (grid && values.length) {
      grid.replaceChildren(...values.map((v, i) => {
        const card = el("article", "hm-value");
        card.append(el("span", "hm-value-no", String(i + 1).padStart(2, "0")));
        card.append(el("h4", "", v.title || ""));
        if (v.titleEn) card.append(el("p", "hm-value-en", v.titleEn));
        if (v.quote) card.append(el("p", "hm-value-quote", v.quote));
        if (v.desc) card.append(el("p", "hm-value-desc", v.desc));
        return card;
      }));
    }

    // 섬기는 이
    const leaders = $("leaderGrid");
    if (leaders && Array.isArray(data.leaders)) {
      leaders.replaceChildren(...data.leaders.map((l) => {
        const card = el("article", "hm-leader");
        if (l.photo && safeUrl(l.photo)) {
          const img = el("img", "hm-leader-photo");
          img.src = l.photo;
          img.alt = l.name || "";
          img.loading = "lazy";
          card.append(img);
        } else {
          const ph = el("div", "hm-leader-photo is-empty", "🙋");
          ph.setAttribute("aria-hidden", "true");
          card.append(ph);
        }
        const info = el("div");
        info.append(el("p", "hm-leader-name", l.name || ""));
        if (l.role) info.append(el("p", "hm-leader-role", l.role));
        const links = el("div", "hm-leader-links");
        if (l.phone) {
          const a = el("a", "", `전화 ${l.phone}`);
          a.href = `tel:${l.phone.replace(/[^0-9]/g, "")}`;
          links.append(a);
        }
        if (l.instagram && safeUrl(l.instagram)) {
          const a = el("a", "", "인스타그램");
          a.href = l.instagram;
          a.target = "_blank";
          a.rel = "noopener";
          links.append(a);
        }
        if (links.children.length) info.append(links);
        card.append(info);
        return card;
      }));
    }

    // 이번 주 예배
    const w = data.worship || {};
    if (w.title) $("worshipTitle").textContent = w.title;
    const meta = [w.verse, w.preacher].filter(Boolean).join(" · ");
    if (meta) $("worshipMeta").textContent = meta;
  }

  load();
})();
