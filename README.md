# Curio Clash

**Everyone sees a different clue. Everyone can lie. Only one player wins the auction.**

A fast competitive browser game about sealed artifacts, private information, structured bluffing, and collection bonuses. Matches run about five minutes across eight simultaneous-bid auctions.

## Design (solidified MVP)

Curio Clash leans on auction-game tension from titles like *For Sale* (scarce money, painful tradeoffs) and browser party UX from room-code games like *Codenames Online*, then adds:

| Pillar | Implementation |
| --- | --- |
| Asymmetric truth | Each seat gets a different **truthful** clue (material / age / authenticity / synergy) |
| Structured bluff | Five preset public claims — no chat required |
| Simultaneous bids | Everyone locks a secret bid; highest pays and takes the lot |
| Soft economy | Leftover cash scores; set bonuses reward focus; tokens buy peeks |
| Reputation | Correct claims raise trust you can later burn on a big lie |
| Solo depth | **Daily Appraiser** is deduction + valuation, not a bot mirror |

### Modes shipping now

1. **Solo vs Computer** — guest nickname, 1–5 AI dealers. Each draws a playbook personality, then decides with an **on-device Monte Carlo EV mind** (no API, no model download): beliefs from private clues → bid search → strategic bluffs.
2. **Private Table** — shareable `?room=CODE` seed; empty seats filled with dealers
3. **Daily Appraiser** — one UTC seed puzzle with shareable score

### Modes designed, not built yet

Ranked Duel, Grand Auction, Team Dealers, Ghost Market, Collection Run campaign, Cloudflare Durable Object tables, cosmetics shop.

## Stack

- Vite + TypeScript (static client)
- Local / seeded simulation (no server required for MVP)
- Ready path for Cloudflare Pages + Workers + Durable Objects later

## Deploy

### GitHub Pages

Workflow: `.github/workflows/pages.yml`

1. Repo **Settings → Pages → Source: GitHub Actions**
2. Push to `main` (or run **Deploy to GitHub Pages** manually)
3. Site base path is `/game-curio-clash/`

### Android APK

Workflow: `.github/workflows/apk.yml`

1. Push to `main` or run **Build Android APK**
2. Download the `curio-clash-debug-apk` artifact (`app-debug.apk`)
3. Locally: `npm run build:android` then open `android/` in Android Studio / `./gradlew assembleDebug`

The APK wraps the same Vite web client with Capacitor (`com.fitsummehari.curioclash`).

## How a lot works

1. Sealed lot appears
2. Private clue dealt
3. ~9 seconds to claim, bid, optional token peek
4. Reveal bids → winner pays → artifact identity / forgery / value shown
5. Repeat for 8 lots → museum scoreboard

## Content MVP

- 24 artifacts
- 6 categories (Egypt, Space, Lost Inventions, Mythical, Royal, Forgeries)
- 4 clue kinds
- Rule-based bot personalities
- Brass-and-ink auction-house UI (mobile + desktop)

## Why this is the “easy deploy” game

A full lot only needs a handful of small messages (`claim`, `bid`, `inspect`). No physics tick, no rewind netcode — ideal for free-tier Workers later while the MVP stays fully playable offline against bots.
