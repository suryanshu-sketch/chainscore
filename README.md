# ChainScore — Personal Cyber Risk Score Calculator

One score for device settings, browsing habits, and password hygiene — built on cited
research, not a hidden vendor formula. A BCSE410L Cyber Security course project.

Live demo (hosted on Claude Render): https://chainscore-vb9b.onrender.com/

## What this is

A working single-page application (not a static mockup) that:

- Runs a real, rule-based weighted scoring formula across three pillars — device
  settings, browsing habits, and password hygiene
- Detects password reuse and weighs the penalty by **blast radius**: reusing a
  password across a throwaway account and a Critical-tagged account (email/recovery)
  scores far worse than reuse among low-sensitivity accounts only
- Includes a **live what-if simulator** — toggle any setting and the score recomputes
  instantly using the exact same formula, before anything is saved
- Generates a plain-language **attack-path narrative** describing the single most
  realistic way the user could be compromised (AI-generated when available, with an
  automatic rule-based fallback — see "AI narrative" below)
- Exports a real downloadable **PDF report** (jsPDF) and a real scannable **QR code**
  (QRCode.js) linking to a shareable summary
- Persists **score history** across sessions and renders a real trend chart (Chart.js)

## Folder structure

```
chainscore/
├── index.html      # page structure only
├── css/
│   └── style.css   # all styling (dark theme, hover/glow effects, layout)
└── js/
    └── app.js       # scoring engine, UI logic, PDF/QR/chart integration
```

## Running it

This is a static site — no build step, no server required for the core experience.

**Locally:** open `index.html` directly in a browser, or serve the folder with
any static file server (e.g. `npx serve chainscore`). Chart.js, jsPDF, and
QRCode.js load from cdnjs, so an internet connection is needed for those three
features; the checklist, scoring, blast-radius detection, and what-if simulator
all work fully offline.

**On Claude Artifacts** (how the live demo runs): publishing this HTML as a
Claude Artifact additionally unlocks three optional platform capabilities the
code checks for and gracefully falls back without:

| Capability | Used for | Fallback if unavailable |
|---|---|---|
| `db` + `user` | Persisting score history per signed-in viewer | Browser `localStorage` |
| `sample` | AI-generated attack-path narrative via Claude | Rule-based narrative templates |
| `downloads` | Native "save file" confirmation for the PDF | Standard browser download link |

None of these are required to run the app — they only improve the experience
where available.

## Tech stack

| Layer | Technology |
|---|---|
| Structure/Styling | Plain HTML5 + CSS3 (no framework, no build step) |
| Scoring logic | Vanilla JavaScript — deterministic, rule-based (see `js/app.js`) |
| Charts | [Chart.js](https://www.chartjs.org/) 4.4.4 |
| PDF export | [jsPDF](https://github.com/parallax/jsPDF) 2.5.1 |
| QR generation | [QRCode.js](https://github.com/davidshimjs/qrcodejs) 1.0.0 |
| Breach check | [HIBP Pwned Passwords API](https://haveibeenpwned.com/API/v3#PwnedPasswords) (k-anonymity — only a hash prefix is ever sent) |

The original project brief targeted a React + Express + PostgreSQL stack to
match the author's other full-stack projects. This build consolidates that
into a single static frontend so it can run entirely client-side as a Claude
Artifact, with the platform's `db` capability standing in for PostgreSQL and
`sample` standing in for a server-side LLM call. The scoring logic in
`js/app.js` is written as pure functions and would port to an Express API
layer with minimal changes if a server-backed version is built later.

## Scoring model (summary)

- **Device (35% of composite):** 7 yes/no checks (firewall, disk encryption,
  updates, backups, etc.), each independently weighted
- **Browsing (25% of composite):** 6 yes/no checks (URL verification, link
  hygiene, tracker blocking, etc.)
- **Password (40% of composite):** average per-password strength (length +
  character variety, penalized for common patterns and known-breached values),
  minus a reuse penalty scaled by the most sensitive account sharing that
  password (Critical/Important/Low)

All weights are documented in `js/app.js` (`DEVICE_ITEMS`, `BROWSING_ITEMS`,
`PILLAR_WEIGHT`) and were calibrated against the risk factors identified in
the accompanying literature survey (Review-I report), not chosen arbitrarily.

## Privacy notes

- Passwords are never stored in plaintext or transmitted in full
- The optional breach check sends only a 5-character SHA-1 hash prefix
  (k-anonymity), matching HIBP's own recommended integration pattern
- The AI narrative (when enabled) receives only abstracted boolean flags
  (e.g. "password reused between a Low and a Critical account") — never
  real passwords, emails, or account names
- QR-shared reports contain only aggregate scores — never passwords or
  account labels

## Known limitations

- Login is a styled demo screen (no backend account system) — this is
  disclosed directly in the UI
- The HIBP breach check attempts a live API call first and falls back to a
  small local list of well-known leaked passwords if that call is blocked
  or unavailable
- Score history is per-browser (`localStorage`) unless run inside an
  environment that grants the `db`/`user` capabilities described above
