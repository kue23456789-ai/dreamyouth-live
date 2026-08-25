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
        card.className = "value-card";
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
  }
})();
