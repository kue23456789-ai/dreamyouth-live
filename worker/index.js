/* ==========================================================
   DREAM YOUTH ADMIN WORKER
   admin.html에서 저장 버튼을 누르면 이 Worker가 대신
   GitHub 저장소에 직접 커밋해서 사이트에 즉시 반영합니다.

   필요한 Cloudflare 시크릿 (wrangler secret put 로 설정):
     - GITHUB_TOKEN    : 이 저장소 contents 쓰기 권한을 가진
                         GitHub fine-grained personal access token
     - ADMIN_PASSWORD  : admin.html에서 입력하는 관리자 비밀번호
   ========================================================== */

const GITHUB_OWNER = "kue23456789-ai";
const GITHUB_REPO = "dreamyouth-live";
const GITHUB_BRANCH = "main";

// 이 경로들만 커밋을 허용합니다 (그 외 경로는 전부 거부)
const ALLOWED_PATH = /^(data\.json|teacher-data\.json|about-photo\.(jpg|jpeg|png|webp)|leader-[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)|\d{4}-\d{2}-\d{2}\.(jpg|jpeg|png|webp))$/;

// admin.html이 실제로 열리는 곳(들)만 CORS 허용
const ALLOWED_ORIGINS = [
  "https://kue23456789-ai.github.io",
];

function isAllowedOrigin(origin) {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  if (/^http:\/\/localhost(:\d+)?$/.test(origin)) return true; // 로컬 테스트용
  return false;
}

function corsHeaders(origin) {
  const headers = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
  if (isAllowedOrigin(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders(origin) },
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (!isAllowedOrigin(origin)) {
      return json({ ok: false, error: "허용되지 않은 출처입니다." }, 403, origin);
    }

    const url = new URL(request.url);
    if (url.pathname !== "/save" || request.method !== "POST") {
      return json({ ok: false, error: "Not found" }, 404, origin);
    }

    const auth = request.headers.get("Authorization") || "";
    const token = auth.replace(/^Bearer\s+/i, "");
    if (!env.ADMIN_PASSWORD || token !== env.ADMIN_PASSWORD) {
      return json({ ok: false, error: "비밀번호가 올바르지 않습니다." }, 401, origin);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ ok: false, error: "잘못된 요청입니다." }, 400, origin);
    }

    const { path, contentBase64, message } = body || {};
    if (!path || !ALLOWED_PATH.test(path) || !contentBase64) {
      return json({ ok: false, error: "허용되지 않은 파일 경로입니다: " + path }, 400, origin);
    }

    const apiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`;
    const ghHeaders = {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      "User-Agent": "dreamyouth-admin-worker",
      Accept: "application/vnd.github+json",
    };

    // 기존 파일의 sha 확인 (있으면 업데이트, 없으면 새 파일 생성)
    let sha;
    const getRes = await fetch(`${apiUrl}?ref=${GITHUB_BRANCH}`, { headers: ghHeaders });
    if (getRes.status === 200) {
      const existing = await getRes.json();
      sha = existing.sha;
    } else if (getRes.status !== 404) {
      const errText = await getRes.text();
      return json({ ok: false, error: "GitHub 조회 실패: " + errText }, 502, origin);
    }

    const putRes = await fetch(apiUrl, {
      method: "PUT",
      headers: { ...ghHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: message || `admin.html: update ${path}`,
        content: contentBase64,
        branch: GITHUB_BRANCH,
        ...(sha ? { sha } : {}),
      }),
    });

    if (!putRes.ok) {
      const errText = await putRes.text();
      return json({ ok: false, error: "GitHub 저장 실패: " + errText }, 502, origin);
    }

    const result = await putRes.json();
    return json({ ok: true, path, commit: result.commit && result.commit.sha }, 200, origin);
  },
};
