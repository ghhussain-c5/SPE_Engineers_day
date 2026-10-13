# COLUMN REBUILD — SPE UOB
**Bahraini Engineers Day · 20-second browser game**

## What's inside
- `index.html` — game layout, vector engineering artwork, and branding
- `styles.css` — responsive design for phones, tablets, and desktops
- `game.js` — 20-second countdown, touch/mouse interaction, sound, win/lose states, and personal best

## Test it locally
Open `index.html` in a browser. No installation, login, data connection, libraries, or paid services required.

The challenge starts with an intact distillation system. Tap **START THE REBUILD**; after a short break-apart animation, the 20-second countdown begins. Tap each part followed by its correct outline, or drag the part onto the schematic. Completing all six parts wins the round.

## Publish it for visitors to scan
1. Create a **public** GitHub repository, e.g. `spe-column-rebuild`.
2. Upload `index.html`, `styles.css`, and `game.js` to the repository root.
3. In **Settings → Pages**, choose **Deploy from a branch**, **main**, **/(root)** and save.
4. After GitHub Pages publishes it, copy the public URL. It will usually resemble `https://YOUR-USERNAME.github.io/spe-column-rebuild/`.
5. Create a QR code **from the actual published URL** and print it beside the booth.
6. **Test the QR code on an iPhone and an Android phone** before printing the final poster.

The **single-file** `Column_Rebuild_SPE_UOB.html` provided separately is useful for offline demonstrations. If uploading just that version to GitHub Pages, rename it to `index.html` first.

## Edit the game
- Main title, SPE UOB branding, game instructions and equipment SVG drawings: `index.html`
- Colors, layout and mobile breakpoints: `styles.css` (`:root` color variables at the top)
- Max play time: `DURATION_MS = 20_000` in `game.js`
- Intro animation: `PREVIEW_MS` in `game.js`

Personal best is stored *locally on each device/browser* and is not a shared leaderboard. There are no external dependencies or visitor analytics.

## Arcade music
The game includes an original looping 8-bit arcade-style soundtrack, generated locally with Web Audio (no MP3 files or network required). Music starts when the player taps Start and fades at the win/lose screen; the existing **SOUND ON / SOUND OFF** button mutes/unmutes both music and effects. Browsers require tapping Start before music can play.
