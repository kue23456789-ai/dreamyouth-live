/* ==========================================================
   DREAM YOUTH HOME — home.js
   data.json의 about 정보(사진/소개글/핵심 방향/비전)를
   불러와서 소개 섹션을 채웁니다.
   ========================================================== */

(async function loadAbout() {
  try {
    const res = await fetch(`data.json?v=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    const about = data.about || {};

    const leadEl = document.getElementById("aboutLead");
    if (leadEl) leadEl.textContent = about.lead || "";

    const bodyEl = document.getElementById("aboutBody");
    if (bodyEl) bodyEl.textContent = about.body || "";

    const grid = document.getElementById("valueGrid");
    if (grid && Array.isArray(about.values)) {
      grid.innerHTML = "";
      about.values.forEach((v, i) => {
        const card = document.createElement("article");
        card.className = "value-card reveal";
        card.innerHTML = `
          <span class="value-no">${String(i + 1).padStart(2, "0")}</span>
          <h4 class="value-title">${v.title || ""} <span class="value-en">${v.titleEn || ""}</span></h4>
          <p class="value-quote">${v.quote || ""}</p>
          <p class="value-desc">${v.desc || ""}</p>
        `;
        grid.appendChild(card);
      });
    }

    const visionEl = document.getElementById("visionText");
    if (visionEl && about.vision) {
      visionEl.innerHTML = String(about.vision)
        .split("\n")
        .map((line) => line.replace(/&/g, "&amp;").replace(/</g, "&lt;"))
        .join("<br />");
    }

    const leaderGrid = document.getElementById("leaderGrid");
    if (leaderGrid && Array.isArray(data.leaders)) {
      leaderGrid.innerHTML = "";
      data.leaders.forEach((leader) => {
        const card = document.createElement("article");
        card.className = "leader-card reveal";
        card.innerHTML = `
          <div class="leader-photo-wrap">
            ${leader.photo ? `<img src="${leader.photo}" class="leader-photo" alt="${leader.name || ""}" />` : `<div class="leader-photo-placeholder" aria-hidden="true">🙋</div>`}
            <div class="leader-overlay">
              <p class="leader-name">${leader.name || ""}</p>
              <p class="leader-role">${leader.role || ""}</p>
              <div class="leader-links">
                ${leader.phone ? `<a class="leader-link" href="tel:${leader.phone.replace(/-/g, "")}">📞 ${leader.phone}</a>` : ""}
                ${leader.instagram ? `<a class="leader-link" href="${leader.instagram}" target="_blank" rel="noopener">📷 인스타그램</a>` : ""}
              </div>
            </div>
          </div>
        `;
        leaderGrid.appendChild(card);
      });
    }

    if (about.photo) {
      const hero = document.getElementById("aboutHero");
      const img = document.getElementById("aboutPhoto");
      const textBlock = document.getElementById("aboutTextBlock");
      if (hero && img && textBlock) {
        img.src = about.photo;
        hero.classList.add("show");
        textBlock.classList.add("dark");
      }
    }
  } catch (err) {
    console.error("소개 데이터를 불러오지 못했습니다:", err);
  } finally {
    initScrollReveal();
  }
})();

/* ---------- 스크롤 인 애니메이션 ---------- */

function initScrollReveal() {
  const targets = document.querySelectorAll(".reveal");
  if (!targets.length) return;

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) {
    targets.forEach((el) => el.classList.add("in"));
    return;
  }

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("in");
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
  );
  targets.forEach((el) => io.observe(el));
}

/* ---------- 상단 네비게이션 스크롤 스타일 ---------- */

(function initNavScroll() {
  const nav = document.querySelector(".site-nav");
  if (!nav) return;
  const onScroll = () => nav.classList.toggle("scrolled", window.scrollY > 8);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });
})();
