#!/usr/bin/env bash
# Validates the inline JS in src/wallop.html parses cleanly.
# Run this after any non-trivial edit to the game.
set -e

cd "$(dirname "$0")/.."

if [ ! -f src/wallop.html ]; then
  echo "ERROR: src/wallop.html not found" >&2
  exit 1
fi

# On Windows the App Execution Alias stub intercepts 'python3', so prefer the real install.
PYTHON3=""
for candidate in \
    "/c/Users/ruien/AppData/Local/Programs/Python/Python313/python.exe" \
    "$(command -v python3 2>/dev/null)" \
    "$(command -v python 2>/dev/null)"; do
  if [ -x "$candidate" ] && "$candidate" -c "import sys; sys.exit(0 if sys.version_info >= (3,) else 1)" 2>/dev/null; then
    PYTHON3="$candidate"
    break
  fi
done

if [ -z "$PYTHON3" ]; then
  echo "ERROR: python3 not found" >&2
  exit 1
fi

# Extract every inline <script> block into a temp file, then run node --check on it.
# Skips <script src="..."> tags.
JSFILE=$("$PYTHON3" - <<'PYEOF'
import re, tempfile, os
with open('src/wallop.html', encoding='utf-8') as f:
    html = f.read()
scripts = re.findall(r'<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>', html, re.DOTALL)
combined = '\n;\n'.join(scripts)
out = os.path.join(tempfile.gettempdir(), 'wallop-inline.js')
open(out, 'w', encoding='utf-8').write(combined)
print(out)
PYEOF
)

node --check "$JSFILE"

# Lint check: scene.remove(*.mesh) leaks GPU resources — see CLAUDE.md gotcha #1
LEAKS=$(grep -n 'scene\.remove(' src/wallop.html | grep -v 'difference between scene.remove' || true)
if [ -n "$LEAKS" ]; then
  echo ""
  echo "WARNING: scene.remove() calls found — these leak GPU resources." >&2
  echo "Use killMesh() instead. See CLAUDE.md Gotcha #1." >&2
  echo "$LEAKS" >&2
  exit 1
fi

# Lint check: MeshLambertMaterial does not support flatShading — see CLAUDE.md gotcha #2
LAMBERT=$(grep -c 'MeshLambertMaterial' src/wallop.html || true)
if [ "$LAMBERT" -gt 0 ]; then
  echo ""
  echo "WARNING: $LAMBERT MeshLambertMaterial reference(s) found." >&2
  echo "Use MeshPhongMaterial via flatPhong() or smoothPhong(). See CLAUDE.md Gotcha #2." >&2
  exit 1
fi

echo ""
echo "✓ JS syntax OK"
echo "✓ No GPU-leaking scene.remove() calls"
echo "✓ No MeshLambertMaterial references"
echo ""
echo "All checks passed."
