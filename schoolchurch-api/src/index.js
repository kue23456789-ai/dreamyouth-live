/* ==========================================================
   DREAMYOUTH SCHOOL CHURCH API (Cloudflare Worker + D1)

   공개
     GET   /api/schedule?month=YYYY-MM   공개 달력 (학교·날짜·시간·유형·상태만)
     POST  /api/applications             방문 신청 접수
   관리자 (Authorization: Bearer <로그인 토큰>)
     POST  /api/admin/login              비밀번호 → 12시간 토큰
     GET   /api/admin/applications       전체 신청 목록 (이름·연락처·장소 포함)
     PATCH /api/admin/applications/:id   날짜·시간·장소·상태 변경

   환경 변수
     ALLOWED_ORIGINS   공개 사이트 주소(쉼표 구분)
     ADMIN_PASSWORD    (secret) 관리자 비밀번호
     SESSION_SECRET    (secret) 토큰 서명 키
     DEV_PREVIEW       "1"이면 공개 달력에 디자인용 예시 일정을 섞어 보여줌 (개발 전용)
   ========================================================== */

const TYPES = { worship: "모임 예배", gate: "정문 기도" };
const STATUSES = ["pending", "confirmed", "cancelled"];
const TOKEN_TTL_SEC = 12 * 60 * 60;
const LOGIN_WINDOW_SEC = 15 * 60;
const LOGIN_MAX_FAILURES = 8;

/* ---------- 공통 ---------- */

function allowedOrigin(origin, env) {
  if (!origin) return null;
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin;
  const list = String(env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return list.includes(origin) ? origin : null;
}

function cors(origin, env) {
  const h = {
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  const ok = allowedOrigin(origin, env);
  if (ok) h["Access-Control-Allow-Origin"] = ok;
  return h;
}

function json(data, status, ctx) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...cors(ctx.origin, ctx.env),
    },
  });
}

/** 한국 시간 기준 오늘 (YYYY-MM-DD) */
function todayKST() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

function isValidDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function isValidTime(s) {
  if (!/^\d{2}:\d{2}$/.test(s)) return false;
  const [h, m] = s.split(":").map(Number);
  return h >= 6 && h <= 22 && m >= 0 && m < 60;
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function clean(v, max) {
  return String(v ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max + 1);
}

function normalizePhone(v) {
  const digits = String(v ?? "").replace(/\D/g, "");
  if (!/^01[016789]\d{7,8}$/.test(digits)) return null;
  return digits.length === 10
    ? `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`
    : `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

/* ---------- 공개 응답: 개인정보를 SELECT 단계에서 제외 ---------- */

const PUBLIC_COLUMNS = "id, visit_date, visit_time, school, meeting_type, status";

function toPublic(row) {
  return {
    id: row.id,
    date: row.visit_date,
    time: row.visit_time,
    school: row.school,
    type: row.meeting_type,
    typeLabel: TYPES[row.meeting_type],
    status: row.status,
  };
}

function toAdmin(row) {
  return {
    ...toPublic(row),
    name: row.applicant_name,
    phone: row.phone,
    place: row.place,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/* ---------- 개발 미리보기 전용 예시 일정 ---------- */

function demoSchedule(year, month) {
  // 시안처럼 둘째·셋째·넷째 목요일에 예시 일정을 배치
  const first = new Date(Date.UTC(year, month - 1, 1));
  const firstThu = 1 + ((4 - first.getUTCDay() + 7) % 7);
  const ymd = (day) => `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const items = [
    [firstThu + 7, "12:40", "신송고", "gate", "confirmed"],
    [firstThu + 14, "13:00", "고잔고", "worship", "pending"],
    [firstThu + 21, "12:30", "신송고", "worship", "confirmed"],
    [firstThu + 21, "16:10", "논현고", "gate", "pending"],
  ];
  return items.map(([day, time, school, type, status], i) => ({
    id: `demo-${year}${month}-${i}`,
    date: ymd(day),
    time,
    school,
    type,
    typeLabel: TYPES[type],
    status,
    demo: true,
  }));
}

/* ---------- 토큰 (HMAC-SHA256) ---------- */

const enc = new TextEncoder();

function b64url(bytes) {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(str) {
  const s = str.replace(/-/g, "+").replace(/_/g, "/");
  return atob(s + "===".slice((s.length + 3) % 4));
}

async function hmac(secret, data) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  return crypto.subtle.sign("HMAC", key, enc.encode(data));
}

/** 길이와 무관하게 상수 시간으로 비교 (양쪽을 HMAC 한 뒤 비교) */
async function safeEqual(a, b, secret) {
  const [x, y] = await Promise.all([hmac(secret, String(a)), hmac(secret, String(b))]);
  const ax = new Uint8Array(x);
  const by = new Uint8Array(y);
  let diff = 0;
  for (let i = 0; i < ax.length; i++) diff |= ax[i] ^ by[i];
  return diff === 0;
}

async function issueToken(env) {
  const payload = b64url(enc.encode(JSON.stringify({ sub: "admin", exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SEC })));
  const sig = b64url(await hmac(env.SESSION_SECRET, payload));
  return `${payload}.${sig}`;
}

async function verifyToken(request, env) {
  if (!env.SESSION_SECRET) return false;
  const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  const expected = b64url(await hmac(env.SESSION_SECRET, payload));
  if (!(await safeEqual(sig, expected, env.SESSION_SECRET))) return false;
  try {
    const data = JSON.parse(b64urlDecode(payload));
    return data.sub === "admin" && data.exp > Date.now() / 1000;
  } catch {
    return false;
  }
}

/* ---------- 핸들러 ---------- */

async function getSchedule(url, ctx) {
  const month = url.searchParams.get("month") || todayKST().slice(0, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return json({ ok: false, error: "month는 YYYY-MM 형식으로 보내 주세요." }, 400, ctx);
  const [y, m] = month.split("-").map(Number);
  const from = `${month}-01`;
  const to = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);

  const { results } = await ctx.env.DB.prepare(
    `SELECT ${PUBLIC_COLUMNS} FROM applications
     WHERE status IN ('pending','confirmed') AND visit_date BETWEEN ?1 AND ?2
     ORDER BY visit_date, visit_time`,
  )
    .bind(from, to)
    .all();

  let events = results.map(toPublic);
  const preview = ctx.env.DEV_PREVIEW === "1";
  if (preview) {
    events = events.concat(demoSchedule(y, m)).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  }
  return json({ ok: true, month, today: todayKST(), preview, events }, 200, ctx);
}

function validateApplication(body) {
  const errors = {};
  const v = {
    type: clean(body.type, 20),
    school: clean(body.school, 40),
    name: clean(body.name, 30),
    phoneRaw: clean(body.phone, 20),
    date: clean(body.date, 10),
    time: clean(body.time, 5),
    place: clean(body.place, 80),
  };
  if (!TYPES[v.type]) errors.type = "만남 유형을 골라 주세요.";
  if (!v.school) errors.school = "학교 이름을 적어 주세요.";
  else if (v.school.length > 40) errors.school = "학교 이름은 40자 안으로 적어 주세요.";
  if (!v.name) errors.name = "이름을 적어 주세요.";
  else if (v.name.length > 30) errors.name = "이름은 30자 안으로 적어 주세요.";
  v.phone = normalizePhone(v.phoneRaw);
  if (!v.phoneRaw) errors.phone = "연락받을 휴대폰 번호를 적어 주세요.";
  else if (!v.phone) errors.phone = "휴대폰 번호를 다시 확인해 주세요. (예: 010-1234-5678)";
  const today = todayKST();
  if (!v.date) errors.date = "날짜를 골라 주세요.";
  else if (!isValidDate(v.date)) errors.date = "날짜를 다시 확인해 주세요.";
  else if (v.date < today) errors.date = "오늘이나 그 이후 날짜로 골라 주세요.";
  else if (v.date > addDays(today, 366)) errors.date = "1년 안의 날짜로 골라 주세요.";
  if (!v.time) errors.time = "시간을 골라 주세요.";
  else if (!isValidTime(v.time)) errors.time = "오전 6시부터 밤 11시 전까지의 시간으로 골라 주세요.";
  if (!v.place) errors.place = "만날 장소를 적어 주세요.";
  else if (v.place.length > 80) errors.place = "장소는 80자 안으로 적어 주세요.";
  return { v, errors };
}

async function createApplication(request, ctx) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "요청을 처리할 수 없어요." }, 400, ctx);
  }
  // 봇 차단용 숨은 입력칸
  if (body.website) return json({ ok: false, error: "요청을 처리할 수 없어요." }, 400, ctx);

  const key = clean(body.idempotencyKey, 64);
  if (!/^[A-Za-z0-9-]{16,64}$/.test(key)) return json({ ok: false, error: "요청을 처리할 수 없어요." }, 400, ctx);

  const { v, errors } = validateApplication(body);
  if (Object.keys(errors).length) {
    return json({ ok: false, error: "빠졌거나 잘못 적은 칸이 있어요.", fields: errors }, 422, ctx);
  }

  const db = ctx.env.DB;
  // 같은 키로 이미 접수됐다면 새로 만들지 않고 기존 접수를 돌려줌
  await db
    .prepare(
      `INSERT INTO applications
        (idempotency_key, meeting_type, school, applicant_name, phone, visit_date, visit_time, place)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
       ON CONFLICT(idempotency_key) DO NOTHING`,
    )
    .bind(key, v.type, v.school, v.name, v.phone, v.date, v.time, v.place)
    .run();

  const row = await db.prepare(`SELECT ${PUBLIC_COLUMNS} FROM applications WHERE idempotency_key = ?1`).bind(key).first();
  if (!row) return json({ ok: false, error: "신청을 저장하지 못했어요. 조금 뒤 다시 시도해 주세요." }, 500, ctx);
  return json({ ok: true, application: toPublic(row) }, 201, ctx);
}

async function adminLogin(request, ctx) {
  const { env } = ctx;
  if (!env.ADMIN_PASSWORD || !env.SESSION_SECRET) {
    return json({ ok: false, error: "관리자 계정이 아직 설정되지 않았어요." }, 503, ctx);
  }
  const ip = request.headers.get("CF-Connecting-IP") || "local";
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare("DELETE FROM login_failures WHERE ts < ?1").bind(now - LOGIN_WINDOW_SEC).run();
  const recent = await env.DB.prepare("SELECT COUNT(*) AS n FROM login_failures WHERE ip = ?1").bind(ip).first();
  if (recent && recent.n >= LOGIN_MAX_FAILURES) {
    return json({ ok: false, error: "로그인을 너무 여러 번 시도했어요. 15분 뒤에 다시 해 주세요." }, 429, ctx);
  }

  let body = {};
  try {
    body = await request.json();
  } catch {}
  const ok = await safeEqual(body.password || "", env.ADMIN_PASSWORD, env.SESSION_SECRET);
  if (!ok) {
    await env.DB.prepare("INSERT INTO login_failures (ip, ts) VALUES (?1, ?2)").bind(ip, now).run();
    return json({ ok: false, error: "비밀번호가 올바르지 않아요." }, 401, ctx);
  }
  return json({ ok: true, token: await issueToken(env), expiresIn: TOKEN_TTL_SEC }, 200, ctx);
}

async function listApplications(url, ctx) {
  const status = url.searchParams.get("status");
  let sql = "SELECT * FROM applications";
  const binds = [];
  if (status && STATUSES.includes(status)) {
    sql += " WHERE status = ?1";
    binds.push(status);
  }
  sql += " ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'confirmed' THEN 1 ELSE 2 END, visit_date, visit_time LIMIT 500";
  const { results } = await ctx.env.DB.prepare(sql).bind(...binds).all();
  return json({ ok: true, applications: results.map(toAdmin) }, 200, ctx);
}

async function updateApplication(request, id, ctx) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "요청을 처리할 수 없어요." }, 400, ctx);
  }
  const sets = [];
  const binds = [];
  const fields = {};
  if (body.date !== undefined) {
    if (!isValidDate(body.date)) fields.date = "날짜를 다시 확인해 주세요.";
    else (sets.push("visit_date = ?"), binds.push(body.date));
  }
  if (body.time !== undefined) {
    if (!isValidTime(body.time)) fields.time = "오전 6시부터 밤 11시 전까지의 시간으로 적어 주세요.";
    else (sets.push("visit_time = ?"), binds.push(body.time));
  }
  if (body.place !== undefined) {
    const p = clean(body.place, 80);
    if (!p || p.length > 80) fields.place = "장소는 1~80자로 적어 주세요.";
    else (sets.push("place = ?"), binds.push(p));
  }
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) fields.status = "알 수 없는 상태예요.";
    else (sets.push("status = ?"), binds.push(body.status));
  }
  if (Object.keys(fields).length) return json({ ok: false, error: "빠졌거나 잘못 적은 칸이 있어요.", fields }, 422, ctx);
  if (!sets.length) return json({ ok: false, error: "변경할 내용이 없어요." }, 400, ctx);

  sets.push("updated_at = datetime('now')");
  const res = await ctx.env.DB.prepare(`UPDATE applications SET ${sets.join(", ")} WHERE id = ?`)
    .bind(...binds, id)
    .run();
  if (!res.meta || res.meta.changes === 0) return json({ ok: false, error: "신청을 찾을 수 없어요." }, 404, ctx);
  const row = await ctx.env.DB.prepare("SELECT * FROM applications WHERE id = ?1").bind(id).first();
  return json({ ok: true, application: toAdmin(row) }, 200, ctx);
}

/* ---------- 라우터 ---------- */

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const ctx = { env, origin };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors(origin, env) });
    }
    // 브라우저에서 오는 요청은 허용된 출처만
    if (origin && !allowedOrigin(origin, env)) {
      return json({ ok: false, error: "허용되지 않은 주소에서 온 요청이에요." }, 403, ctx);
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "");

    try {
      if (path === "/api/schedule" && request.method === "GET") return await getSchedule(url, ctx);
      if (path === "/api/applications" && request.method === "POST") return await createApplication(request, ctx);
      if (path === "/api/admin/login" && request.method === "POST") return await adminLogin(request, ctx);

      if (path.startsWith("/api/admin/")) {
        if (!(await verifyToken(request, env))) {
          return json({ ok: false, error: "로그인이 필요해요." }, 401, ctx);
        }
        if (path === "/api/admin/applications" && request.method === "GET") return await listApplications(url, ctx);
        const m = path.match(/^\/api\/admin\/applications\/(\d+)$/);
        if (m && request.method === "PATCH") return await updateApplication(request, Number(m[1]), ctx);
      }
      return json({ ok: false, error: "Not found" }, 404, ctx);
    } catch (err) {
      console.error(err);
      return json({ ok: false, error: "잠시 문제가 생겼어요. 조금 뒤 다시 시도해 주세요." }, 500, ctx);
    }
  },
};
