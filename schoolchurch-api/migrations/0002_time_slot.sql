-- 희망 시간 기준: 점심시간(lunch) 또는 동아리·모임 시간(club)
ALTER TABLE applications ADD COLUMN time_slot TEXT NOT NULL DEFAULT 'lunch' CHECK (time_slot IN ('lunch', 'club'));
