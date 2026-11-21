-- 개인정보 수집·이용 동의 시각 (관리자가 직접 추가한 일정은 비어 있음)
ALTER TABLE applications ADD COLUMN consent_at TEXT;
