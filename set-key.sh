#!/bin/bash
# Store an API key from your clipboard straight into the macOS Keychain for the
# widget. Usage: copy the key, then:
#   bash set-key.sh FAL_KEY
#   bash set-key.sh MANUS_API_KEY
# The value is never printed (only its length) and goes directly to Keychain.
set -euo pipefail
NAME="${1:?usage: bash set-key.sh <SECRET_NAME>   e.g. FAL_KEY | MANUS_API_KEY}"
VAL="$(pbpaste | tr -d '[:space:]')"
[ -n "$VAL" ] || { echo "Clipboard is empty — copy the key first, then re-run."; exit 1; }
# Guard against accidentally storing a command / path instead of a key.
case "$VAL" in
  bash*|sudo*|*set-key.sh*|*/Library/*|*/Users/*)
    echo "✋ That looks like a command/path, not an API key — did you copy the key?"
    echo "   (starts with: ${VAL:0:5}…)  Copy ONLY the key, then re-run."; exit 1;;
esac
if [ "${#VAL}" -lt 12 ]; then echo "✋ Only ${#VAL} chars — that seems too short for a key."; exit 1; fi
security add-generic-password -U -T /usr/bin/security -s "usage-glance" -a "$NAME" -w "$VAL"
echo "Stored $NAME in Keychain (length ${#VAL}, starts with '${VAL:0:3}…'). Sanity-check that prefix looks like your key."
