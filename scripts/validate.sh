#!/usr/bin/env bash
# Validates the inline JS in src/wallop.html parses cleanly.
# Run this after any non-trivial edit to the game.
set -e

cd "$(dirname "$0")/.."

if [ ! -f src/wallop.html ]; then
  echo "ERROR: src/wallop.html not found" >&2
  exit 1
fi

# Extract every inline <script> block into a single concatenated file,
# then run node --check on it. Skips <script src="..."> tags.
python3 - <<'PYEOF'
import re, sys
with open('src/wallop.html') as f:
    html = f.read()
scripts = re.findall(r'<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>', html, re.DOTALL)
combined = '\n;\n'.join(scripts)
open('/tmp/wallop-inline.js', 'w').write(combined)
PYEOF

node --check /tmp/wallop-inline.js

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
