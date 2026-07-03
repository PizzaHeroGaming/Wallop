#!/usr/bin/env python3
"""
Build the GitHub Pages bundle.

Why this exists:
    Plain `<script type="module" src="src/js/main.js?v=hash">` only busts
    the browser cache for main.js itself.  The static `import './foo.js'`
    statements inside main.js (and transitively) use fixed URLs without
    the cache-buster, so browsers happily serve OLD cached copies of
    config.js / ui.js / entities.js / etc. when a returning user reloads.

    That's a real, ongoing bug — it broke v0.6.0 for any returning player
    because the new ui.js needed a `VERSION` named export from config.js,
    but the browser kept serving last week's config.js without it.

What this does:
    1. Read every JS module under src/js/
    2. Rewrite every `from './X.js'` to `from './X.js?v=<short-sha>'`
    3. Write the rewritten files to dist/src/js/
    4. Copy src/wallop.html → dist/index.html with the entry-point script
       src pointed at dist/src/js/main.js?v=<short-sha>

    The dist/ tree is what GitHub Pages serves.  Every push gets a fresh
    short-sha, so every module URL changes → browsers re-fetch everything
    on the first visit after a release.

Caveats:
    - Assets paths (`assets/...`) are NOT modified — GLB/PNG files are
      content-addressed by filename and don't change as often.  If you
      ever update a GLB in place without renaming, bump its filename.
    - Inline scripts inside wallop.html aren't rewritten — there's only
      a static import of main.js there.
"""

import codecs
import json
import os
import re
import shutil
import subprocess
import sys

ROOT     = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SRC_DIR  = os.path.join(ROOT, 'src', 'js')
HTML_SRC = os.path.join(ROOT, 'src', 'wallop.html')
HTML_OUT = os.path.join(ROOT, 'index.html')
CONFIG_JS = os.path.join(SRC_DIR, 'config.js')
VERSION_JSON = os.path.join(ROOT, 'version.json')

def sync_version_json():
    """Keep version.json's `web` field in lock-step with config.js VERSION so the
    in-game update check (versionCheck.js) knows the latest web build. Preserves
    the `android`/`steam` fields — those are bumped by hand when a store release
    actually goes live, so a web-only push never nags store users."""
    try:
        with codecs.open(CONFIG_JS, encoding='utf-8') as fp:
            m = re.search(r"VERSION\s*=\s*['\"]([^'\"]+)['\"]", fp.read())
        if not m:
            return None
        version = m.group(1)
        data = {}
        if os.path.exists(VERSION_JSON):
            with codecs.open(VERSION_JSON, encoding='utf-8') as fp:
                data = json.load(fp)
        if data.get('web') != version:
            data['web'] = version
            with codecs.open(VERSION_JSON, 'w', encoding='utf-8') as fp:
                json.dump(data, fp, indent=2)
                fp.write('\n')
        return version
    except Exception as e:
        print(f'  (version.json sync skipped: {e})')
        return None

def short_sha():
    out = subprocess.check_output(['git', '-C', ROOT, 'rev-parse', '--short', 'HEAD'])
    return out.decode().strip()

def rewrite_imports(src, sha):
    """
    Replace:  from './foo.js'        -> from './foo.js?v=SHA'
              import './foo.js'      -> import './foo.js?v=SHA'
              from "./foo.js"        -> from "./foo.js?v=SHA"
    Leaves already-busted imports alone (so re-running is idempotent).
    """
    pattern = re.compile(r"""(from\s+|import\s+)(['"])(\.\/[^'"?\s]+\.js)(['"])""")
    def repl(m):
        prefix, q1, path, q2 = m.groups()
        return f'{prefix}{q1}{path}?v={sha}{q2}'
    return pattern.sub(repl, src)

def main():
    sha = short_sha()
    # ── Rewrite each JS module in-place under src/js/ → write back
    js_files = [f for f in os.listdir(SRC_DIR) if f.endswith('.js')]
    rewrote = 0
    for f in js_files:
        path = os.path.join(SRC_DIR, f)
        with codecs.open(path, encoding='utf-8') as fp:
            original = fp.read()
        rewritten = rewrite_imports(original, sha)
        if rewritten != original:
            # We DON'T want to modify source files in place during a build.
            # Instead, the import rewriting happens only when building index.html.
            # So we leave src/js/ alone and only rewrite the entry script src below.
            pass
    # ── Build index.html from wallop.html
    with codecs.open(HTML_SRC, encoding='utf-8') as fp:
        html = fp.read()
    # Point the entry script at the new path with cache-buster
    html = html.replace('src="js/main.js"', f'src="src/js/main.js?v={sha}"')
    # Vendored Three.js lives under src/vendor/three/; rewrite the src-relative
    # paths in wallop.html to root-relative for the generated index.html.
    html = html.replace('src="vendor/three/', 'src="src/vendor/three/')
    # Inject no-cache meta tags if missing
    if 'http-equiv="Cache-Control"' not in html:
        nocache = ('\n  <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />'
                   '\n  <meta http-equiv="Pragma" content="no-cache" />'
                   '\n  <meta http-equiv="Expires" content="0" />')
        html = html.replace('<meta charset="UTF-8" />', '<meta charset="UTF-8" />' + nocache, 1)
    with codecs.open(HTML_OUT, 'w', encoding='utf-8') as fp:
        fp.write(html)
    # ── Now rewrite each src/js/*.js file in-place so its module imports
    # also carry the cache-buster.  Each file is read, rewritten, and written back.
    # Idempotent: re-running with the same sha leaves files unchanged; a new sha
    # updates them to point at the new version.
    for f in js_files:
        path = os.path.join(SRC_DIR, f)
        with codecs.open(path, encoding='utf-8') as fp:
            original = fp.read()
        # Strip any previous cache-buster, then add the current one
        stripped = re.sub(r"""(from\s+|import\s+)(['"])(\.\/[^'"?\s]+\.js)\?v=[a-f0-9]+(['"])""",
                          r'\1\2\3\4', original)
        rewritten = rewrite_imports(stripped, sha)
        if rewritten != original:
            with codecs.open(path, 'w', encoding='utf-8') as fp:
                fp.write(rewritten)
            rewrote += 1
    ver = sync_version_json()
    print(f'Built v={sha} (rewrote {rewrote} JS files, index.html updated, version.json web={ver})')

if __name__ == '__main__':
    main()
