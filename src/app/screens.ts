import type { ClaimId, MatchState, PlayerState } from "@/core/types";
import { CATEGORY_LABELS, CLAIM_LABELS } from "@/core/types";
import { finalScore, visibleFocusCategories } from "@/core/scoring";
import { artifactById } from "@/data/artifacts";

export type Screen =
  | "home"
  | "match"
  | "daily"
  | "daily-result"
  | "how"
  | "finished";

export function shell(html: string): string {
  return `<div class="shell">${html}</div>`;
}

export function homeScreen(nickname: string, roomFromUrl: string): string {
  return shell(`
    <header class="hero">
      <p class="eyebrow">Auction house · Bluff table</p>
      <h1>Curio Clash</h1>
      <p class="lede">Everyone sees a different clue. Everyone can lie. Only one player wins the lot.</p>
    </header>
    <section class="card play-card">
      <label class="field">Dealer name
        <input id="nickname" maxlength="18" value="${escapeAttr(nickname)}" placeholder="Guest" autocomplete="nickname" />
      </label>
      <div class="actions">
        <button type="button" class="btn primary" data-act="bot-market">Play as Guest — Bot Market</button>
        <button type="button" class="btn" data-act="private">Private Table</button>
        <button type="button" class="btn" data-act="daily">Daily Appraiser</button>
      </div>
      <div class="room-row">
        <label class="field grow">Room code
          <input id="room-code" maxlength="6" value="${escapeAttr(roomFromUrl)}" placeholder="ABC123" />
        </label>
        <button type="button" class="btn" data-act="join-room">Join</button>
      </div>
      <p class="fine">Private tables use the room code as a shared seed. Empty seats fill with AI dealers until live multiplayer arrives.</p>
    </section>
    <section class="modes">
      <article><h3>Bot Market</h3><p>Eight rapid auctions against rule-based personalities.</p></article>
      <article><h3>Daily Appraiser</h3><p>One global puzzle. Rank your deduction, not your reflexes.</p></article>
      <article><h3>Challenge later</h3><p>Share a dramatic lot: would you have paid that bid?</p></article>
    </section>
    <button type="button" class="linkish" data-act="how">How it works</button>
  `);
}

export function howScreen(): string {
  return shell(`
    <button type="button" class="linkish" data-act="home">← Back</button>
    <h2>How Curio Clash works</h2>
    <ol class="rules">
      <li>Each lot is sealed. You get one private clue — truthful, incomplete.</li>
      <li>In ~9 seconds: make a public claim (you may lie), bid in secret, optionally spend a token to peek.</li>
      <li>Highest bid wins the artifact. Identity, authenticity, and value are revealed.</li>
      <li>Sets pay bonuses. Leftover money still scores. Winning every lot usually loses.</li>
      <li>Reputation rises when claims prove right — spend that trust on a late bluff.</li>
    </ol>
  `);
}

export function matchScreen(state: MatchState, now: number): string {
  if (state.phase === "finished") return finishedScreen(state);
  const lot = state.lots[state.lotIndex]!;
  const human = state.players.find((p) => p.id === state.humanId)!;
  const clue = lot.cluesByPlayer[state.humanId]!;
  const peeked = lot.inspected[state.humanId] ?? [];
  const secs = Math.max(0, Math.ceil((state.timerEndsAt - now) / 1000));
  const myClaim = lot.claims.find((c) => c.playerId === state.humanId)?.claim;
  const myBid = lot.bids.find((b) => b.playerId === state.humanId)?.amount;

  if (state.phase === "reveal" && lot.reveal) {
    return revealScreen(state);
  }

  return shell(`
    <div class="match-top">
      <div>
        <p class="eyebrow">Room ${state.roomCode} · Lot ${state.lotIndex + 1}/${state.lots.length}</p>
        <h2>Unknown object — Lot #${state.lotIndex + 1}</h2>
      </div>
      <div class="timer" aria-live="polite">${secs}s</div>
    </div>
    <div class="lot-stage">
      <div class="sealed" aria-hidden="true"></div>
      <p class="clue"><span>Your clue</span>${escapeHtml(clue.text)}</p>
      ${peeked.length ? `<ul class="peeked">${peeked.map((t) => `<li>${escapeHtml(t)}</li>`).join("")}</ul>` : ""}
    </div>
    <div class="status-bar">
      <span>₡${human.money}</span>
      <span>Tokens ${human.tokens}</span>
      <span>Rep ${human.reputation}</span>
      <span>${focusLine(human)}</span>
    </div>
    <section class="claims">
      <h3>Public claim</h3>
      <div class="claim-grid">
        ${(Object.keys(CLAIM_LABELS) as ClaimId[])
          .map(
            (id) =>
              `<button type="button" class="btn claim${myClaim === id ? " selected" : ""}" data-claim="${id}">${CLAIM_LABELS[id]}</button>`,
          )
          .join("")}
      </div>
    </section>
    <section class="bid-panel">
      <h3>Secret bid</h3>
      <div class="bid-row">
        <input id="bid-input" type="number" min="0" max="${human.money}" step="10" value="${myBid ?? 0}" />
        <button type="button" class="btn primary" data-act="lock-bid">Lock bid</button>
      </div>
      <div class="token-row">
        <button type="button" class="btn" data-act="inspect" ${human.tokens <= 0 ? "disabled" : ""}>Spend token — peek a rival clue</button>
      </div>
    </section>
    <aside class="table-side">
      <h3>Table</h3>
      <ul class="players">
        ${state.players
          .map((p) => {
            const claimed = lot.claims.find((c) => c.playerId === p.id);
            return `<li><strong>${escapeHtml(p.name)}</strong> · ₡${p.money} · ${claimed ? CLAIM_LABELS[claimed.claim] : "…"}</li>`;
          })
          .join("")}
      </ul>
    </aside>
  `);
}

function focusLine(human: PlayerState): string {
  const cats = visibleFocusCategories(human);
  if (!cats.length) return "No set yet";
  return cats.map((c) => CATEGORY_LABELS[c]).join(" · ");
}

function revealScreen(state: MatchState): string {
  const lot = state.lots[state.lotIndex]!;
  const r = lot.reveal!;
  const winner = state.players.find((p) => p.id === r.winnerId);
  return shell(`
    <p class="eyebrow">Reveal · Lot ${state.lotIndex + 1}</p>
    <h2>${escapeHtml(r.artifact.name)}</h2>
    <p class="lede">${escapeHtml(r.artifact.blurb)}</p>
    <div class="reveal-grid">
      <div><span>Category</span><strong>${CATEGORY_LABELS[r.artifact.category]}</strong></div>
      <div><span>Authenticity</span><strong>${r.genuine ? "Genuine" : "Forgery"}</strong></div>
      <div><span>Realized value</span><strong>₡${r.realizedValue}</strong></div>
      <div><span>Set bonus</span><strong>₡${r.setBonus}</strong></div>
      <div><span>Winner</span><strong>${winner ? escapeHtml(winner.name) : "Passed in"}</strong></div>
      <div><span>Winning bid</span><strong>₡${r.winningBid}</strong></div>
    </div>
    <h3>Bids</h3>
    <ul class="bid-list">
      ${[...r.bids]
        .sort((a, b) => b.amount - a.amount)
        .map((b) => {
          const p = state.players.find((x) => x.id === b.playerId)!;
          return `<li>${escapeHtml(p.name)} — ₡${b.amount}</li>`;
        })
        .join("")}
    </ul>
    <h3>Claims</h3>
    <ul class="bid-list">
      ${r.claims
        .map((c) => {
          const p = state.players.find((x) => x.id === c.playerId)!;
          return `<li>${escapeHtml(p.name)} — “${CLAIM_LABELS[c.claim]}”</li>`;
        })
        .join("")}
    </ul>
    <button type="button" class="btn primary" data-act="next-lot">${state.lotIndex + 1 >= state.lots.length ? "Final standings" : "Next lot"}</button>
  `);
}

export function finishedScreen(state: MatchState): string {
  const values = new Map<string, number>();
  for (const lot of state.lots) {
    if (lot.reveal?.winnerId) {
      values.set(lot.artifact.id, lot.reveal.realizedValue);
    }
  }
  const ranked = [...state.players]
    .map((p) => ({ p, score: finalScore(p, values) }))
    .sort((a, b) => b.score - a.score);

  return shell(`
    <p class="eyebrow">Grand total · Room ${state.roomCode}</p>
    <h2>Museum closed</h2>
    <ol class="standings">
      ${ranked
        .map(
          (r, i) =>
            `<li class="${r.p.isHuman ? "you" : ""}"><span>${i + 1}. ${escapeHtml(r.p.name)}</span><strong>₡${r.score}</strong></li>`,
        )
        .join("")}
    </ol>
    <p class="fine">Score = collection value + leftover cash. Sets paid during the night.</p>
    <div class="actions">
      <button type="button" class="btn primary" data-act="home">Back to lobby</button>
      <button type="button" class="btn" data-act="rematch">Rematch (new seed)</button>
      <button type="button" class="btn" data-act="copy-challenge">Copy challenge link</button>
    </div>
  `);
}

export function dailyScreen(htmlBody: string): string {
  return shell(htmlBody);
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}

export function collectionSummary(state: MatchState): string {
  const human = state.players.find((p) => p.id === state.humanId)!;
  return human.collection.map((id) => artifactById(id)?.name ?? id).join(", ") || "empty";
}
