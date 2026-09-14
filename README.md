# Clothing Tracker

Track how many times you've worn each piece of clothing and when it needs washing.
Static site on GitHub Pages; data + photos are saved as files in a GitHub repo via the GitHub API.

## Features
- **+ Add**: photo (phone camera or library), name, category, wears-before-washing.
- **Log wear**: pick a date (defaults to today), tap what you wore, Save. Re-open a date to fix mistakes.
- **Needs washing**: everything worn ≥ its limit. Select → "Mark selected washed" resets the counter.
- **Closet**: all items with wear counts. Tap one to edit, mark washed, or delete.

Data lives in `data/items.json`; photos in `photos/` (resized to ~800px JPEG).

## Setup (one time)

1. **Create repo** on github.com → New repository, e.g. `clothing-tracker`.
   GitHub Pages on a free account requires a **public** repo, so your clothes photos will be public.
   Want them private? Make a second **private** repo (e.g. `clothing-data`) and enter that one in Settings instead — the app reads/writes whichever repo you enter.
2. **Push this code**:
   ```bash
   git remote add origin https://github.com/<you>/clothing-tracker.git
   git push -u origin main
   ```
3. **Enable Pages**: repo → Settings → Pages → Source: *Deploy from a branch* → `main` / `(root)` → Save.
   Site appears at `https://<you>.github.io/clothing-tracker/` in ~1 minute.
4. **Make a token**: github.com → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate.
   - Repository access: *Only select repositories* → the repo holding your data.
   - Permissions → Repository → **Contents: Read and write**.
   - Pick an expiration you're OK with (you'll paste a new one when it expires).
5. **Open the site** on your phone → Settings → fill owner / repo / token → Save & connect. Repeat once per device.
   Tip: "Add to Home Screen" for an app-like icon.

The token is stored only in that browser's localStorage. Anyone with the token can edit that repo, so don't share it.

## Tests
```bash
node --test test/logic.test.js
```

## Files
- `logic.js` — pure wear/wash logic (tested)
- `github.js` — GitHub Contents API wrapper
- `app.js` — UI; saves retry automatically if another device saved first
- `index.html`, `style.css`
