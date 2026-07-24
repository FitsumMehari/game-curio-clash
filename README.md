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

1. **Solo vs Computer** — guest nickname, 1–5 AI dealers drawn from **200 playbooks** (aggression, bluffs, snipes, late-game hoarding, claim biases)
2. **Private Table** — shareable `?room=CODE` seed; empty seats filled with dealers
3. **Daily Appraiser** — one UTC seed puzzle with shareable score

### Modes designed, not built yet

Ranked Duel, Grand Auction, Team Dealers, Ghost Market, Collection Run campaign, Cloudflare Durable Object tables, cosmetics shop.

## Stack

- Vite + TypeScript (static client)
- Local / seeded simulation (no server required for MVP)
- Ready path for Cloudflare Pages + Workers + Durable Objects later

## Run

```bash
cd curio-clash
npm install
npm run dev
```

Open the printed local URL (port **5174**).

```bash
npm run check   # typecheck + tests + production build
```

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
