-- Umfrage-Stimmen aus dem Verlauf nachtragen.
-- Der History-Sync liefert die Stimmen bereits entschlüsselt in raw->'pollUpdates' (selectedOptions = SHA-256 der Optionsnamen, base64).
-- Idempotent: neuere Stimmen gewinnen, leere Auswahl löscht die Stimme.
WITH polls AS (
  SELECT m.chat_jid, m.id AS poll_id, m.raw,
         coalesce(m.raw->'message'->'pollCreationMessageV3', m.raw->'message'->'pollCreationMessageV2', m.raw->'message'->'pollCreationMessage') AS pc
  FROM messages m
  WHERE m.type = 'poll' AND jsonb_typeof(m.raw->'pollUpdates') = 'array'
),
opts AS (
  SELECT p.chat_jid, p.poll_id, encode(sha256(convert_to(o->>'optionName', 'UTF8')), 'base64') AS h, o->>'optionName' AS name
  FROM polls p, jsonb_array_elements(p.pc->'options') o
),
upd AS (
  SELECT p.chat_jid, p.poll_id,
         CASE WHEN (u->'pollUpdateMessageKey'->>'fromMe')::boolean
              THEN (SELECT value FROM meta WHERE key = 'self_jid')
              ELSE coalesce(u->'pollUpdateMessageKey'->>'participant', p.chat_jid) END AS voter,
         to_timestamp((u->>'senderTimestampMs')::numeric / 1000) AS ts,
         ARRAY(SELECT jsonb_array_elements_text(u->'vote'->'selectedOptions')) AS hashes
  FROM polls p, jsonb_array_elements(p.raw->'pollUpdates') u
),
votes AS (
  SELECT DISTINCT ON (u.chat_jid, u.poll_id, u.voter)
         u.chat_jid, u.poll_id, u.voter, u.ts,
         ARRAY(SELECT o.name FROM opts o WHERE o.chat_jid = u.chat_jid AND o.poll_id = u.poll_id AND o.h = ANY (u.hashes)) AS chosen
  FROM upd u
  WHERE u.voter IS NOT NULL
  ORDER BY u.chat_jid, u.poll_id, u.voter, u.ts DESC
)
INSERT INTO poll_votes (chat_jid, poll_msg_id, voter_jid, options, ts)
SELECT chat_jid, poll_id, voter, chosen, ts FROM votes WHERE cardinality(chosen) > 0
ON CONFLICT (chat_jid, poll_msg_id, voter_jid) DO UPDATE SET options = excluded.options, ts = excluded.ts
WHERE excluded.ts >= poll_votes.ts;
