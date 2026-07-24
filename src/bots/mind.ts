/**
 * On-device auction mind — Monte Carlo expected-value search.
 * No API, no model download: classical AI over beliefs from private clues.
 * Playbooks only bias risk / bluff / token appetite (personality), not the core reasoning.
 */
import { ARTIFACTS } from "@/data/artifacts";
import { realizedLotValue } from "@/core/scoring";
import type { Artifact, ClaimId, Clue, PlayerState } from "@/core/types";
import type { BotPlaybook } from "@/bots/playbooks";

export interface BeliefWorld {
  artifact: Artifact;
  pGenuine: number;
  weight: number;
}

function clueMatchesArtifact(clue: Clue, a: Artifact, player: PlayerState): boolean {
  const t = clue.text.toLowerCase();
  if (clue.kind === "material") return t.includes(a.material.toLowerCase());
  if (clue.kind === "age") {
    if (t.includes("older than recorded")) return a.ageYears >= 1_000_000;
    if (t.includes("more than 500")) return a.ageYears >= 500;
    if (t.includes("century")) return a.ageYears >= 100 && a.ageYears < 500;
    if (t.includes("modern")) return a.ageYears < 100;
    return true;
  }
  if (clue.kind === "authenticity") {
    if (t.includes("probably a forgery")) return a.forgeryChance >= 0.7;
    if (t.includes("contested")) return a.forgeryChance >= 0.35 && a.forgeryChance < 0.7;
    if (t.includes("genuine")) return a.forgeryChance < 0.35;
    if (t.includes("widely trusted") || t.includes("inflated")) return true; // noisy / misleading peeks
    return true;
  }
  if (clue.kind === "synergy") return refineSynergy(clue, a);
  void player;
  return true;
}

function refineSynergy(clue: Clue, a: Artifact): boolean {
  const t = clue.text.toLowerCase();
  if (clue.kind !== "synergy") return true;
  if (t.includes("egypt")) return a.category === "egypt";
  if (t.includes("space")) return a.category === "space";
  if (t.includes("invention")) return a.category === "inventions";
  if (t.includes("mythical")) return a.category === "mythical";
  if (t.includes("royal")) return a.category === "royal";
  if (t.includes("forger")) return a.category === "forgeries";
  return true;
}

/** Posterior over catalog artifacts given private (+ peeked) clues. */
export function buildBeliefs(player: PlayerState, clues: Clue[]): BeliefWorld[] {
  const matched = ARTIFACTS.filter((a) =>
    clues.every((c) => clueMatchesArtifact(c, a, player) && refineSynergy(c, a)),
  );
  const pool = matched.length ? matched : ARTIFACTS;
  const worlds: BeliefWorld[] = pool.map((artifact) => {
    let pGenuine = 1 - artifact.forgeryChance;
    for (const c of clues) {
      if (c.kind !== "authenticity") continue;
      const t = c.text.toLowerCase();
      if (t.includes("probably a forgery")) pGenuine = Math.min(pGenuine, 0.28);
      else if (t.includes("contested")) pGenuine = Math.min(pGenuine, 0.55);
      else if (t.includes("genuine")) pGenuine = Math.max(pGenuine, 0.72);
    }
    return { artifact, pGenuine, weight: 1 / pool.length };
  });
  return worlds;
}

export function expectedLotValue(player: PlayerState, worlds: BeliefWorld[]): number {
  let sum = 0;
  for (const w of worlds) {
    const good = realizedLotValue(w.artifact, true, player).value;
    const bad = realizedLotValue(w.artifact, false, player).value;
    sum += w.weight * (w.pGenuine * good + (1 - w.pGenuine) * bad);
  }
  return sum;
}

function rivalBidPressure(
  ev: number,
  rivals: number,
  book: BotPlaybook,
  claim: ClaimId,
  reputation: number,
  rng: () => number,
): number {
  // Expected highest rival bid under a soft log-normal-ish sample
  let scare = 1;
  if (claim === "probably_fake" || claim === "you_overpay") {
    scare -= 0.08 + (reputation / 100) * 0.12;
  }
  if (claim === "extremely_valuable" || claim === "completes_collection") {
    scare += 0.06 + book.aggression * 0.08;
  }
  const base = ev * (0.28 + book.aggression * 0.35) * scare;
  let maxRival = 0;
  for (let i = 0; i < rivals; i++) {
    const sample = base * (0.55 + rng() * 0.9);
    if (sample > maxRival) maxRival = sample;
  }
  return maxRival;
}

function utilityWin(value: number, bid: number, moneyLeftNeed: number): number {
  // Winning pays (value - bid); keep a soft penalty if overpaying vs bank plan
  const over = Math.max(0, bid - value);
  return value - bid - over * 0.35 - Math.max(0, bid - moneyLeftNeed) * 0.15;
}

/** Search bid ladder; return EV-maximizing bid under Monte Carlo rival samples. */
export function searchBestBid(
  player: PlayerState,
  worlds: BeliefWorld[],
  book: BotPlaybook,
  rivalCount: number,
  lotIndex: number,
  totalLots: number,
  claim: ClaimId,
  rng: () => number,
): { bid: number; ev: number; fairValue: number } {
  const fairValue = expectedLotValue(player, worlds) * book.valueMul;
  const afford = player.money;
  const progress = lotIndex / Math.max(1, totalLots - 1);
  const bankCap =
    lotIndex < totalLots - 2
      ? afford * (0.32 + book.aggression * 0.38)
      : afford * (0.55 + book.aggression * 0.4);
  const moneyLeftNeed = book.conserveLate ? afford * (0.25 * (1 - progress)) : 0;

  const step = book.roundTo;
  const candidates: number[] = [0];
  const maxBid = Math.min(afford, Math.max(step, Math.round(bankCap)));
  for (let b = step; b <= maxBid; b += step) candidates.push(b);
  // denser around fair value
  for (const mul of [0.45, 0.6, 0.75, 0.9, 1.05]) {
    const b = Math.round((fairValue * mul) / step) * step;
    if (b > 0 && b <= maxBid) candidates.push(b);
  }
  const uniq = [...new Set(candidates)].sort((a, b) => a - b);

  const SAMPLES = 24;
  let bestBid = 0;
  let bestEv = 0;

  for (const bid of uniq) {
    let total = 0;
    for (let s = 0; s < SAMPLES; s++) {
      const rival = rivalBidPressure(fairValue, rivalCount, book, claim, player.reputation, rng);
      const win = bid > rival || (bid === rival && bid > 0 && rng() < 0.5);
      if (!win || bid === 0) {
        total += 0;
        continue;
      }
      // sample a world for realized value
      let r = rng();
      let pick = worlds[0]!;
      for (const w of worlds) {
        r -= w.weight;
        if (r <= 0) {
          pick = w;
          break;
        }
      }
      const genuine = rng() < pick.pGenuine;
      const value = realizedLotValue(pick.artifact, genuine, player).value;
      total += utilityWin(value, bid, moneyLeftNeed);
    }
    const ev = total / SAMPLES;
    // sniper preference: slight boost mid-band
    const sniperBoost =
      book.sniper && fairValue > 150 && fairValue < 320 && bid > fairValue * 0.7 && bid < fairValue * 1.05
        ? 8
        : 0;
    const score = ev + sniperBoost + (rng() * 2 - 1) * book.bidNoise * 12;
    if (score > bestEv || (score === bestEv && bid < bestBid)) {
      bestEv = score;
      bestBid = bid;
    }
  }

  if (fairValue < book.passThreshold * (1.05 - book.aggression * 0.35) && bestEv < 12) {
    return { bid: 0, ev: 0, fairValue };
  }
  return { bid: bestBid, ev: bestEv, fairValue };
}

export function chooseClaim(
  book: BotPlaybook,
  fairValue: number,
  clues: Clue[],
  player: PlayerState,
  lotIndex: number,
  totalLots: number,
  rng: () => number,
): ClaimId {
  const text = clues.map((c) => c.text.toLowerCase()).join(" ");
  const fakeish = /forgery|contested/.test(text);
  const setish = /spikes|increases|collection/.test(text);
  const valuable = fairValue >= 260;
  const late = lotIndex >= totalLots - 2;
  const wantBluff =
    rng() < book.bluffRate || (player.reputation > 70 && rng() < 0.32) || book.claimBias === "invert";

  // Strategic bluff: look weak when value is high (and we plan to bid)
  if (wantBluff && valuable && book.claimBias !== "hype") {
    return rng() < 0.55 ? "probably_fake" : "you_overpay";
  }
  if (wantBluff && fakeish && book.claimBias !== "bash") {
    return "extremely_valuable";
  }

  if (book.claimBias === "hype") return valuable ? "extremely_valuable" : "completes_collection";
  if (book.claimBias === "bash") return fakeish || !valuable ? "probably_fake" : "you_overpay";
  if (book.claimBias === "pass") return fairValue < book.passThreshold + 50 ? "not_bidding" : "you_overpay";
  if (book.claimBias === "set" || (book.archetype === "collector" && setish)) return "completes_collection";

  if (book.archetype === "skeptic" && (fakeish || fairValue < 200)) return "probably_fake";
  if (!valuable && fairValue < book.passThreshold) return "not_bidding";
  if (fakeish) return "probably_fake";
  if (valuable) return "extremely_valuable";
  if (late) return "you_overpay";
  return setish ? "completes_collection" : "you_overpay";
}

export function shouldInspect(
  book: BotPlaybook,
  tokens: number,
  beliefEntropy: number,
  rng: () => number,
): boolean {
  if (tokens <= 0) return false;
  // Buy info when uncertain
  const p = book.tokenRate * 0.5 + beliefEntropy * 0.55;
  return rng() < Math.min(0.85, p);
}

export function beliefEntropy(worlds: BeliefWorld[]): number {
  if (worlds.length <= 1) return 0;
  return Math.min(1, Math.log2(worlds.length) / 5);
}

export function parseClueKind(text: string): Clue {
  const t = text.toLowerCase();
  if (t.includes("made of")) return { kind: "material", text, weight: 0.7 };
  if (t.includes("years") || t.includes("century") || t.includes("modern") || t.includes("older")) {
    return { kind: "age", text, weight: 0.7 };
  }
  if (t.includes("forgery") || t.includes("genuine") || t.includes("contested") || t.includes("authent")) {
    return { kind: "authenticity", text, weight: 0.8 };
  }
  return { kind: "synergy", text, weight: 0.8 };
}
