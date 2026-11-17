-- 스쿨처치 방문 신청 (Cloudflare D1 / SQLite)

CREATE TABLE IF NOT EXISTS applications (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  idempotency_key  TEXT    NOT NULL UNIQUE,              -- 연속 클릭·재시도 중복 접수 방지
  meeting_type     TEXT    NOT NULL CHECK (meeting_type IN ('worship', 'gate')),
  school           TEXT    NOT NULL,
  applicant_name   TEXT    NOT NULL,                     -- 관리자 전용
  phone            TEXT    NOT NULL,                     -- 관리자 전용
  visit_date       TEXT    NOT NULL,                     -- YYYY-MM-DD (한국 시간)
  visit_time       TEXT    NOT NULL,                     -- HH:MM
  place            TEXT    NOT NULL,                     -- 관리자 전용
  status           TEXT    NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending', 'confirmed', 'cancelled')),
  created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_applications_date ON applications (visit_date, status);

-- 관리자 로그인 실패 기록 (무차별 대입 방지)
CREATE TABLE IF NOT EXISTS login_failures (
  ip  TEXT    NOT NULL,
  ts  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_login_failures ON login_failures (ip, ts);
