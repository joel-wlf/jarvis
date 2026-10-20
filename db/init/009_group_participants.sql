-- Gruppenteilnehmer mit beiden ID-Formen (Telefonnummer und LID), damit gemeinsame Gruppen zuverlässig gefunden werden. Idempotent.
ALTER TABLE group_participants ADD COLUMN IF NOT EXISTS lid text;
CREATE INDEX IF NOT EXISTS group_participants_jid ON group_participants (jid);
CREATE INDEX IF NOT EXISTS group_participants_lid ON group_participants (lid) WHERE lid IS NOT NULL;
