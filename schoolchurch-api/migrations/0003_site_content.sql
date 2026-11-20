-- 관리자 화면에서 바꾸는 사이트 문구·설정 (key → 값)
CREATE TABLE IF NOT EXISTS site_content (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 관리자 화면에서 올린 사진
CREATE TABLE IF NOT EXISTS site_images (
  key         TEXT PRIMARY KEY,           -- hero | classroom | gate
  mime        TEXT NOT NULL,
  data        BLOB NOT NULL,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 관리자 화면에서 바꾼 비밀번호 (없으면 ADMIN_PASSWORD 비밀값 사용)
CREATE TABLE IF NOT EXISTS admin_auth (
  id          INTEGER PRIMARY KEY CHECK (id = 1),
  salt        TEXT NOT NULL,
  hash        TEXT NOT NULL,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
