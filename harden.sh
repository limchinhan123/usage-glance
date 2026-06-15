#!/bin/bash
# Usage Glance — move secrets out of plaintext config.json into the macOS login
# Keychain (encrypted at rest), then blank the plaintext copies. Run once:
#   bash harden.sh
# Secret VALUES are never printed (only their length). Idempotent — safe to re-run.
set -euo pipefail
CFG="$HOME/.config/usage-glance/config.json"
[ -f "$CFG" ] || { echo "no config at $CFG"; exit 1; }

read_secret() {
  python3 -c "import json;print((json.load(open('$CFG')).get('secrets') or {}).get('$1','') or '')"
}

migrate() {
  local name="$1" val
  val="$(read_secret "$name")"
  if [ -n "$val" ]; then
    # -U update if present; -T trusts /usr/bin/security so the collector reads w/o prompts
    security add-generic-password -U -T /usr/bin/security -s "usage-glance" -a "$name" -w "$val"
    echo "  ✓ $name  →  Keychain (length ${#val})"
  elif security find-generic-password -s usage-glance -a "$name" -w >/dev/null 2>&1; then
    echo "  • $name  already in Keychain"
  else
    echo "  – $name  not set, skipped"
  fi
}

echo "Migrating secrets to Keychain (service 'usage-glance')…"
migrate CLAUDE_CODE_OAUTH_TOKEN
migrate DEEPSEEK_API_KEY

python3 - <<'PY'
import json, os
p = os.path.expanduser("~/.config/usage-glance/config.json")
c = json.load(open(p)); s = c.get("secrets", {})
for k in ("CLAUDE_CODE_OAUTH_TOKEN", "DEEPSEEK_API_KEY"):
    if s.get(k): s[k] = ""
json.dump(c, open(p, "w"), indent=2); os.chmod(p, 0o600)
print("Cleared plaintext copies in config.json — now sourced from Keychain.")
PY

echo "Done. Verify:  node collect.mjs | python3 -m json.tool"
