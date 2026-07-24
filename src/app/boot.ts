import { allBotDecisions } from "@/bots/ai";
import {
  advanceAfterReveal,
  applyBotActions,
  beginLot,
  createMatch,
  humanReady,
  resolveLot,
  spendTokenInspect,
  submitHumanBid,
  submitHumanClaim,
  type NewMatchOpts,
} from "@/core/auction";
import { createRng, roomCodeFromSeed } from "@/core/rng";
import type { ClaimId, DailyAnswers, MatchState } from "@/core/types";
import { CATEGORY_LABELS } from "@/core/types";
import { buildDailyPuzzle, gradeDaily, loadDailyBest, saveDailyBest } from "@/daily/daily";
import { dailyScreen, escapeHtml, homeScreen, howScreen, matchScreen } from "@/app/screens";

const NICK_KEY = "curio-nickname";

type AppMode = "home" | "how" | "match" | "daily" | "daily-result";

export function boot(root: HTMLElement): void {
  let mode: AppMode = "home";
  let match: MatchState | null = null;
  let nickname = localStorage.getItem(NICK_KEY) || "Guest";
  let tickTimer: number | null = null;
  let daily = buildDailyPuzzle();
  let dailyResultHtml = "";
  let resolving = false;

  const roomFromUrl = new URLSearchParams(location.search).get("room")?.toUpperCase() ?? "";

  const render = () => {
    if (mode === "home") root.innerHTML = homeScreen(nickname, roomFromUrl);
    else if (mode === "how") root.innerHTML = howScreen();
    else if (mode === "match" && match) root.innerHTML = matchScreen(match, Date.now());
    else if (mode === "daily") root.innerHTML = dailyScreen(dailyForm(daily));
    else if (mode === "daily-result") root.innerHTML = dailyScreen(dailyResultHtml);
    wire();
  };

  const readNick = () => {
    const el = root.querySelector<HTMLInputElement>("#nickname");
    if (el) {
      nickname = el.value.trim() || "Guest";
      localStorage.setItem(NICK_KEY, nickname);
    }
    return nickname;
  };

  const readBotCount = () => {
    const el = root.querySelector<HTMLSelectElement>("#solo-bots");
    return Math.max(1, Math.min(5, Number(el?.value || 3)));
  };

  const startMatch = (opts: NewMatchOpts) => {
    resolving = false;
    match = beginLot(createMatch(opts));
    mode = "match";
    startTicker();
    render();
  };

  const startSolo = () => {
    const nick = readNick();
    const bots = readBotCount();
    const seed = `solo:${Date.now()}:${nick}:${bots}`;
    startMatch({ seed, humanName: nick, botCount: bots, mode: "solo" });
    history.replaceState({}, "", `?room=${roomCodeFromSeed(seed)}`);
  };

  const startTicker = () => {
    if (tickTimer) window.clearInterval(tickTimer);
    tickTimer = window.setInterval(() => {
      if (!match || mode !== "match") return;
      if (match.phase === "claim_bid") {
        const now = Date.now();
        if (now >= match.timerEndsAt) resolveCurrentLot();
        else {
          const t = root.querySelector(".timer");
          if (t) t.textContent = `${Math.max(0, Math.ceil((match.timerEndsAt - now) / 1000))}s`;
        }
      }
    }, 250);
  };

  const syncBidFromInput = () => {
    if (!match) return;
    const input = root.querySelector<HTMLInputElement>("#bid-input");
    if (input) match = submitHumanBid(match, Number(input.value || 0));
  };

  const resolveCurrentLot = () => {
    if (!match || match.phase !== "claim_bid" || resolving) return;
    resolving = true;
    syncBidFromInput();
    if (!match.lots[match.lotIndex]!.claims.some((c) => c.playerId === match!.humanId)) {
      match = submitHumanClaim(match, "not_bidding");
    }
    if (!match.lots[match.lotIndex]!.bids.some((b) => b.playerId === match!.humanId)) {
      match = submitHumanBid(match, 0);
    }
    const rng = createRng(`${match.seed}:lot:${match.lotIndex}:bots:${Date.now() % 997}`);
    const bots = allBotDecisions(match, rng);
    match = applyBotActions(match, bots);
    match = resolveLot(match);
    resolving = false;
    render();
  };

  const wire = () => {
    root.querySelectorAll<HTMLButtonElement>("[data-act]").forEach((btn) => {
      btn.onclick = () => {
        const act = btn.dataset.act;
        if (act === "home") {
          mode = "home";
          match = null;
          render();
        } else if (act === "how") {
          mode = "how";
          render();
        } else if (act === "solo" || act === "bot-market" || act === "rematch") {
          startSolo();
        } else if (act === "private" || act === "join-room") {
          const nick = readNick();
          const input = root.querySelector<HTMLInputElement>("#room-code");
          let code = (input?.value || roomFromUrl || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
          if (!code) code = roomCodeFromSeed(`priv:${Date.now()}`);
          startMatch({ seed: `room:${code}`, humanName: nick, botCount: 3, mode: "private" });
          history.replaceState({}, "", `?room=${code}`);
        } else if (act === "daily") {
          daily = buildDailyPuzzle();
          mode = "daily";
          render();
        } else if (act === "lock-bid" && match) {
          syncBidFromInput();
          render();
        } else if (act === "submit-lot" && match) {
          syncBidFromInput();
          if (!humanReady(match)) {
            if (!match.lots[match.lotIndex]!.claims.some((c) => c.playerId === match!.humanId)) {
              match = submitHumanClaim(match, "not_bidding");
            }
            syncBidFromInput();
          }
          resolveCurrentLot();
        } else if (act === "inspect" && match) {
          const rivals = match.players.filter((p) => p.id !== match!.humanId);
          const pick = rivals[Math.floor(Math.random() * rivals.length)];
          if (pick) match = spendTokenInspect(match, pick.id);
          render();
        } else if (act === "next-lot" && match) {
          match = advanceAfterReveal(match);
          resolving = false;
          render();
        } else if (act === "copy-challenge" && match) {
          const lot = [...match.lots].reverse().find((l) => l.reveal && l.reveal.winningBid > 0) ?? match.lots[0];
          const text = lot?.reveal
            ? `Would you have paid ₡${lot.reveal.winningBid} for ${lot.reveal.artifact.name}? Play Curio Clash: ${location.origin}${location.pathname}?room=${match.roomCode}`
            : location.href;
          void navigator.clipboard?.writeText(text);
          btn.textContent = "Copied!";
        } else if (act === "grade-daily") {
          gradeDailyForm();
        }
      };
    });

    root.querySelectorAll<HTMLButtonElement>("[data-claim]").forEach((btn) => {
      btn.onclick = () => {
        if (!match) return;
        syncBidFromInput();
        match = submitHumanClaim(match, btn.dataset.claim as ClaimId);
        render();
      };
    });

    root.querySelectorAll<HTMLButtonElement>("[data-bid-set]").forEach((btn) => {
      btn.onclick = () => {
        if (!match) return;
        const human = match.players.find((p) => p.id === match!.humanId)!;
        const raw = Number(btn.dataset.bidSet || 0);
        match = submitHumanBid(match, Math.min(human.money, raw));
        render();
      };
    });

    root.querySelectorAll<HTMLButtonElement>("[data-bid-frac]").forEach((btn) => {
      btn.onclick = () => {
        if (!match) return;
        const human = match.players.find((p) => p.id === match!.humanId)!;
        const frac = Number(btn.dataset.bidFrac || 0);
        match = submitHumanBid(match, Math.round((human.money * frac) / 5) * 5);
        render();
      };
    });
  };

  const gradeDailyForm = () => {
    const genuineIndex = Number(root.querySelector<HTMLSelectElement>("#d-genuine")?.value ?? 0);
    const mostValuableIndex = Number(root.querySelector<HTMLSelectElement>("#d-value")?.value ?? 0);
    const pairA = Number(root.querySelector<HTMLSelectElement>("#d-pair-a")?.value ?? 0);
    const pairB = Number(root.querySelector<HTMLSelectElement>("#d-pair-b")?.value ?? 1);
    const misleadingIndex = Number(root.querySelector<HTMLSelectElement>("#d-mislead")?.value ?? 0);
    const bids = daily.objects.map((_, i) => Number(root.querySelector<HTMLInputElement>(`#d-bid-${i}`)?.value || 0));
    const answers: DailyAnswers = {
      genuineIndex,
      mostValuableIndex,
      pair: [pairA, pairB],
      bids,
      misleadingIndex,
    };
    const graded = gradeDaily(daily, answers);
    saveDailyBest(daily.key, graded.score);
    const best = loadDailyBest(daily.key);
    dailyResultHtml = `
      <button type="button" class="linkish" data-act="home">← Lobby</button>
      <p class="eyebrow">Daily ${daily.key}</p>
      <h2>Appraiser score: ${graded.score}/${graded.max}</h2>
      <p class="fine">Personal best today: ${best ?? graded.score}</p>
      <ul class="rules">${graded.breakdown.map((b) => `<li>${escapeHtml(b)}</li>`).join("")}</ul>
      <p class="lede">Genuine lot was <strong>${escapeHtml(daily.objects[daily.genuineIndex]!.name)}</strong>.</p>
      <button type="button" class="btn primary" data-act="home">Done</button>
    `;
    mode = "daily-result";
    render();
  };

  render();
}

function dailyForm(daily: ReturnType<typeof buildDailyPuzzle>): string {
  const opts = daily.objects
    .map((o, i) => `<option value="${i}">Lot ${i + 1}: ${escapeHtml(o.name)}</option>`)
    .join("");
  const clueOpts = daily.clues.map((_, i) => `<option value="${i}">Clue ${i + 1}</option>`).join("");
  return `
    <button type="button" class="linkish" data-act="home">← Lobby</button>
    <p class="eyebrow">Daily Appraiser · ${daily.key}</p>
    <h2>Five sealed lots. Limited clues.</h2>
    <div class="daily-lots">
      ${daily.objects
        .map(
          (o, i) => `
        <article class="mini-lot">
          <h3>Lot ${i + 1}</h3>
          <p>${escapeHtml(o.blurb)}</p>
          <p class="fine">${CATEGORY_LABELS[o.category]} · base ₡${o.baseValue}</p>
          <label class="field">Your bid
            <input id="d-bid-${i}" type="number" min="0" step="10" value="${Math.round(o.baseValue * 0.5)}" />
          </label>
        </article>`,
        )
        .join("")}
    </div>
    <section class="card">
      <h3>Clues</h3>
      <ul class="rules">${daily.clues.map((c) => `<li>${escapeHtml(c.text)}</li>`).join("")}</ul>
      <label class="field">Which lot is genuine?
        <select id="d-genuine">${opts}</select>
      </label>
      <label class="field">Which is most valuable today?
        <select id="d-value">${opts}</select>
      </label>
      <div class="room-row">
        <label class="field grow">Collection pair A
          <select id="d-pair-a">${opts}</select>
        </label>
        <label class="field grow">Pair B
          <select id="d-pair-b">${opts}</select>
        </label>
      </div>
      <label class="field">Which clue is misleading?
        <select id="d-mislead">${clueOpts}</select>
      </label>
      <button type="button" class="btn primary" data-act="grade-daily">Submit appraisal</button>
    </section>
  `;
}
