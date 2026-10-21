-- Wichtigkeit pro Karte oder Meldeschlüssel, vom Nutzer in der App oder über watch_feedback gesetzt:
-- 1 = später, 2 = normal, 3 = wichtig. NULL = Jarvis entscheidet. Gilt wie watch_state überhaupt:
-- ein Schlüssel ohne Zusatz ("event:12") deckt auch "event:12:vortag" ab.
ALTER TABLE watch_state ADD COLUMN IF NOT EXISTS priority smallint CHECK (priority BETWEEN 1 AND 3);
