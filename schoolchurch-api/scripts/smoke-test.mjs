// API 점검: `npm run dev` 실행 중에 `npm test`
// API_BASE, ADMIN_PASSWORD 환경 변수로 대상 변경 가능
import assert from "node:assert/strict";

const BASE = process.env.API_BASE || "http://localhost:8787";
const PASSWORD = process.env.ADMIN_PASSWORD || "dev-admin-1234";
const ORIGIN = { Origin: "http://localhost:8000" };

const call = async (path, opts = {}) => {
  const res = await fetch(BASE + path, { ...opts, headers: { "Content-Type": "application/json", ...ORIGIN, ...(opts.headers || {}) } });
  return { status: res.status, body: await res.json() };
};
const ymd = (offset) => new Date(Date.now() + 9 * 3600e3 + offset * 86400e3).toISOString().slice(0, 10);

const date = ymd(3);
const key = `smoke-${Date.now()}-abcdefgh`;
const payload = { type: "gate", school: "테스트고", name: "홍길동", phone: "01012345678", date, time: "12:40", place: "학교 정문 앞", idempotencyKey: key };

// 1. 검증 오류
let r = await call("/api/applications", { method: "POST", body: JSON.stringify({ ...payload, phone: "123", date: ymd(-1), idempotencyKey: key + "x" }) });
assert.equal(r.status, 422);
assert.ok(r.body.fields.phone && r.body.fields.date);

// 1-1. 학교 안 모임 예배는 담당 선생님 확인 필수
r = await call("/api/applications", { method: "POST", body: JSON.stringify({ ...payload, type: "worship", idempotencyKey: key + "w" }) });
assert.equal(r.status, 422);
assert.ok(r.body.fields.teacher);

// 2. 접수 + 같은 키로 재전송해도 1건
r = await call("/api/applications", { method: "POST", body: JSON.stringify(payload) });
assert.equal(r.status, 201);
const id = r.body.application.id;
assert.equal(r.body.application.status, "pending");
assert.equal(r.body.application.phone, undefined);
const again = await call("/api/applications", { method: "POST", body: JSON.stringify(payload) });
assert.equal(again.body.application.id, id);

// 3. 공개 달력에는 개인정보가 없음
r = await call(`/api/schedule?month=${date.slice(0, 7)}`);
const ev = r.body.events.find((e) => e.id === id);
assert.ok(ev, "공개 달력에 표시");
assert.deepEqual(Object.keys(ev).sort(), ["date", "id", "school", "status", "time", "type", "typeLabel"].sort());
assert.ok(!JSON.stringify(r.body).includes("01012345678") && !JSON.stringify(r.body).includes("홍길동"));

// 4. 관리자 권한은 서버에서 확인
assert.equal((await call("/api/admin/applications")).status, 401);
assert.equal((await call("/api/admin/applications", { headers: { Authorization: "Bearer forged.token" } })).status, 401);
assert.equal((await call("/api/admin/login", { method: "POST", body: JSON.stringify({ password: "wrong" }) })).status, 401);
r = await call("/api/admin/login", { method: "POST", body: JSON.stringify({ password: PASSWORD }) });
assert.equal(r.status, 200);
const auth = { Authorization: `Bearer ${r.body.token}` };
r = await call("/api/admin/applications", { headers: auth });
const mine = r.body.applications.find((a) => a.id === id);
assert.equal(mine.phone, "010-1234-5678");
assert.equal(mine.name, "홍길동");

// 5. 날짜 변경 + 확정 → 공개 달력 반영
const moved = ymd(4);
r = await call(`/api/admin/applications/${id}`, { method: "PATCH", headers: auth, body: JSON.stringify({ date: moved, time: "13:10", status: "confirmed" }) });
assert.equal(r.body.application.status, "confirmed");
r = await call(`/api/schedule?month=${moved.slice(0, 7)}`);
const ev2 = r.body.events.find((e) => e.id === id);
assert.equal(ev2.date, moved);
assert.equal(ev2.time, "13:10");
assert.equal(ev2.status, "confirmed");

// 6. 취소 → 공개 달력에서 제외
await call(`/api/admin/applications/${id}`, { method: "PATCH", headers: auth, body: JSON.stringify({ status: "cancelled" }) });
r = await call(`/api/schedule?month=${moved.slice(0, 7)}`);
assert.ok(!r.body.events.some((e) => e.id === id));

// 7. 허용되지 않은 출처 차단
const bad = await fetch(BASE + "/api/schedule", { headers: { Origin: "https://evil.example" } });
assert.equal(bad.status, 403);

console.log("✓ API smoke test passed");
