#!/bin/bash
# Live-Übersicht über den Fortschritt. Aufruf: watch -n 5 ~/jarvis/scripts/progress.sh
cd "$(dirname "$0")/.."
q() { docker compose exec -T postgres psql -U jarvis -d jarvis -Atc "$1" 2>/dev/null; }
bar() { # bar <fertig> <gesamt>
  local d=${1:-0} t=${2:-0} w=30 f=0
  [ "$t" -gt 0 ] && f=$(( d * w / t ))
  printf '['; printf '%*s' "$f" '' | tr ' ' '#'; printf '%*s' $((w - f)) '' | tr ' ' '.'; printf '] %s/%s (%s%%)' "$d" "$t" "$([ "$t" -gt 0 ] && echo $(( d * 100 / t )) || echo 0)"
}
echo "JARVIS  $(date '+%H:%M:%S')   Pi: $(vcgencmd measure_temp 2>/dev/null | cut -d= -f2)  Last: $(cut -d' ' -f1 /proc/loadavg)"
echo
read -r IMG_DONE IMG_OPEN IMG_FAIL <<<"$(q "select count(*) filter (where media_status='done'), count(*) filter (where media_status is null and raw is not null and media_attempts<3), count(*) filter (where media_status='failed' or (media_status is null and media_attempts>=3)) from messages where type='image'" | tr '|' ' ')"
echo "Bilder          $(bar "$IMG_DONE" $((IMG_DONE + IMG_OPEN + IMG_FAIL)))  nicht ladbar: $IMG_FAIL"
read -r EMB_DONE EMB_OPEN <<<"$(q "select count(*) filter (where embedding is not null), count(*) filter (where embedding is null and body is not null and length(body)>=3) from messages" | tr '|' ' ')"
echo "Embeddings      $(bar "$EMB_DONE" $((EMB_DONE + EMB_OPEN)))"
read -r AUD_DONE AUD_OPEN <<<"$(q "select count(*) filter (where transcript_status='done'), count(*) filter (where transcript_status='pending') from messages where type='audio'" | tr '|' ' ')"
echo "Sprachnachr.    erledigt: $AUD_DONE   offen: $AUD_OPEN"
read -r MSG_ALL MSG_ORG <<<"$(q "select count(*), count(*) filter (where organized_at is not null) from messages where body is not null and length(btrim(body))>0" | tr '|' ' ')"
echo "Sortiert (Chat) $(bar "$MSG_ORG" "$MSG_ALL")"
read -r TH TH_LINK TP <<<"$(q "select (select count(*) from threads), (select count(*) from threads where linked_at is not null), (select count(*) from topics)" | tr '|' ' ')"
echo "Threads: $TH (verknüpft: $TH_LINK)   Themen (chatübergreifend): $TP"
echo "Token heute:    $(q "select coalesce(sum(input_tokens+output_tokens),0) || ' (' || coalesce(sum(calls),0) || ' Aufrufe)' from organizer_usage where day=current_date")"
echo
echo "Dienste:"; docker compose --profile organizer ps --format '  {{.Name}}  {{.Status}}' 2>/dev/null
echo
echo "Letzte Organizer-Meldungen:"; docker compose --profile organizer logs --tail 4 organizer 2>/dev/null | cut -c1-140 | sed 's/^organizer-1  | /  /'
echo; echo "Enable-Skript: $(tail -1 ~/organizer-enable.log 2>/dev/null | cut -c1-100)"
