/* ==========================================================
   DREAM YOUTH HOME — home.js
   data.json의 about.photo가 있으면 소개 섹션에 사진을 보여줍니다.
   ========================================================== */

(async function loadAboutPhoto() {
  try {
    const res = await fetch(`data.json?v=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    const photo = data.about && data.about.photo;
    if (!photo) return;

    const hero = document.getElementById("aboutHero");
    const img = document.getElementById("aboutPhoto");
    const textBlock = document.getElementById("aboutTextBlock");
    if (!hero || !img || !textBlock) return;
    img.src = photo;
    hero.classList.add("show");
    textBlock.classList.add("dark");
  } catch (err) {
    console.error("소개 사진을 불러오지 못했습니다:", err);
  }
})();
