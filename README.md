# WALLOP — Pizza Hero Gaming

A 3D bullet-heaven roguelike. Pizza-themed. Built as a single-file HTML5 game.

![icon](assets/icons/icon.svg)

## Quick start

```bash
# Open the game directly in a browser
open src/wallop.html
# (or just double-click it from your file manager)
```

For mobile testing on the same network:

```bash
python3 -m http.server -d src 8000
# Then on your phone, visit http://<your-laptop-ip>:8000/wallop.html
```

## Project structure

```
wallop/
├── CLAUDE.md                       ← Read this first if you're using Claude Code
├── README.md                       ← This file
├── .claude/settings.json           ← Pre-approved Claude Code permissions
├── .gitignore
├── scripts/
│   └── validate.sh                 ← JS syntax + lint checks (run after edits)
├── src/
│   ├── wallop.html                 ← THE GAME — single source of truth (~8000 lines)
│   └── splash/
│       └── pizza-hero-splash.html  ← Studio bumper (integrated into wallop.html)
├── assets/
│   └── icons/
│       └── icon.svg                ← 512×512 maskable app icon
└── docs/
    └── icon-preview.html           ← Preview the icon at every install size
```

## Validate edits

After any change to `src/wallop.html`, run:

```bash
./scripts/validate.sh
```

This checks:
- JS syntax parses (extracts inline `<script>` blocks and runs `node --check`)
- No `scene.remove(*.mesh)` calls (they leak GPU memory — use `killMesh()`)
- No `MeshLambertMaterial` (doesn't support `flatShading` in Three.js r128)

## Working with Claude Code

This project is set up for [Claude Code](https://docs.claude.com/en/docs/claude-code).
Install with:

```bash
npm install -g @anthropic-ai/claude-code
```

Then from the project root:

```bash
claude
```

The first prompt to run: **"Read CLAUDE.md and confirm you understand the
project's constraints and conventions."**

`CLAUDE.md` contains the full architectural briefing — major systems,
critical gotchas, mobile concerns, code conventions, and the roadmap.

## Roadmap

See the **Roadmap** section in `CLAUDE.md`. Short version:
- Wire up placeholder boost effects (currently buyable, no-op)
- Implement placeholder characters (Frost Baker / Oven Knight / Crust Runner)
- Capacitor wrapper for Google Play launch
- AdMob integration for the rewarded-ad reroll (already wired with simulation)

## License

TBD — depends on your distribution plans (Steam, Play Store, etc.).
