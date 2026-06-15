#!/bin/bash
# Store an API key from your clipboard into the widget's config.json (plaintext,
# chmod 600) — NO keychain, so NO password prompt. Usage:
#   bash set-key-config.sh MANUS_API_KEY
# The value is never printed (only length + first 3 chars for a sanity check).
set -euo pipefail
NAME="${1:?usage: bash set-key-config.sh <SECRET_NAME>}"
VAL="$(pbpaste | tr -d '[:space:]')"
[ -n "$VAL" ] || { echo "Clipboard is empty — copy the key first, then re-run."; exit 1; }
case "$VAL" in
  bash*|sudo*|*set-key*|*/Library/*|*/Users/*)
    echo "✋ That looks like a command/path, not a key (starts '${VAL:0:5}…'). Copy ONLY the key."; exit 1;;
esac
[ "${#VAL}" -ge 12 ] || { echo "✋ Only ${#VAL} chars — too short for a key."; exit 1; }
python3 - "$NAME" "$VAL" <<'PY'
import json, os, sys
name, val = sys.argv[1], sys.argv[2]
p = os.path.expanduser("~/.config/usage-glance/config.json")
c = json.load(open(p)) if os.path.exists(p) else {}
c.setdefault("secrets", {})[name] = val
json.dump(c, open(p, "w"), indent=2); os.chmod(p, 0o600)
print(f"Stored {name} in config.json (length {len(val)}, starts '{val[:3]}…').")
PY