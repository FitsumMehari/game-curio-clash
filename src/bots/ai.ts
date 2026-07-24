import { dealerDisplayName, playbookById, type BotPlaybook } from "@/bots/playbooks";
import { collectionBonusForGain } from "@/core/scoring";
import type { AuctionLot, ClaimId, MatchState, PlayerState } from "@/core/types";

export interface BotDecision {
  playerId: string;
  claim: ClaimId;
  bid: number;
  inspect?: string;
}

function estimateValue(lot: AuctionLot, player: PlayerState, clueText: string, book: BotPlaybook): number {
  const a = lot.artifact;
  let est = a.baseValue * book.valueMul;
  const bonus = collectionBonusForGain(player, a);
  if (/increases|spikes/i.test(clueText)) est += (bonus.pair + bonus.set * 0.55) * (0.7 + book.aggression);
  if (/forgery|contested/i.test(clueText)) est *= 0.45 + (1 - book.aggression) * 0.25;
  if (/genuine/i.test(clueText)) est *= 1.05 + book.aggression * 0.12;
  if (/gold|platinum|crystal/i.test(clueText)) est *= 1.04 + book.aggression * 0.08;
  if (book.archetype === "skeptic") est *= 0.9;
  if (book.archetype === "collector" && /increases|spikes/i.test(clueText)) est *= 1.18;
  return Math.round(est);
}

function pickClaim(
  book: BotPlaybook,
  est: number,
  clueText: string,
  bluffing: boolean,
  lotIndex: number,
  totalLots: number,
): ClaimId {
  const fakeish = /forgery|contested/i.test(clueText);
  const valuable = est >= 260;
  const late = lotIndex >= totalLots - 2;

  if (bluffing || book.claimBias === "invert") {
    if (valuable) return "probably_fake";
    if (fakeish) return "extremely_valuable";
    return late ? "you_overpay" : "completes_collection";
  }
  if (book.claimBias === "hype") return valuable || !fakeish ? "extremely_valuable" : "completes_collection";
  if (book.claimBias === "bash") return fakeish || !valuable ? "probably_fake" : "you_overpay";
  if (book.claimBias === "pass") return est < book.passThreshold + 40 ? "not_bidding" : "you_overpay";
  if (book.claimBias === "set" || book.archetype === "collector") {
    if (/increases|spikes/i.test(clueText)) return "completes_collection";
  }
  // honest-ish
  if (book.archetype === "skeptic" && (fakeish || est < 200)) return "probably_fake";
  if (!valuable && est < book.passThreshold) return "not_bidding";
  if (fakeish) return "probably_fake";
  if (valuable) return "extremely_valuable";
  return "you_overpay";
}

function roundBid(n: number, step: number): number {
  return Math.max(0, Math.round(n / step) * step);
}

export function decideBotAction(state: MatchState, bot: PlayerState, rng: () => number): BotDecision {
  const book = playbookById(bot.playbookId ?? bot.styleSeed ?? 0);
  const lot = state.lots[state.lotIndex]!;
  const clue = lot.cluesByPlayer[bot.id]!;
  const est = estimateValue(lot, bot, clue.text, book);
  const human = state.players.find((p) => p.isHuman);
  const afford = bot.money;
  const progress = state.lotIndex / Math.max(1, state.lots.length - 1);
  const bluffing = rng() < book.bluffRate || (bot.reputation > 72 && rng() < 0.28);

  let bid = est * (0.35 + book.aggression * 0.55);
  bid *= 1 + (rng() * 2 - 1) * book.bidNoise;

  if (book.sniper && est > 150 && est < 320) bid *= 1.12;
  if (book.conserveLate && progress > 0.55) bid *= 0.72 + (1 - book.aggression) * 0.15;
  if (book.archetype === "shark") {
    bid *= 1.15;
    if (rng() < 0.2 + book.aggression * 0.15) bid = Math.min(bid, 30 + rng() * 50); // withdraw bluff
  }
  if (book.archetype === "accountant") {
    const ev = est * (1 - lot.artifact.forgeryChance * 0.55);
    bid = ev * (0.5 + book.aggression * 0.25);
  }
  if (book.archetype === "copycat" && human) {
    bid = est * (0.4 + human.reputation / 200) * (0.7 + book.mirrorHuman * 0.5);
  }
  if (est < book.passThreshold * (1.1 - book.aggression * 0.4)) bid = rng() < 0.7 ? 0 : bid * 0.25;

  // Mirror: nudge toward what a “confident” table might do
  if (human && book.mirrorHuman > 0.55 && human.reputation > 60) {
    bid *= 1 + book.mirrorHuman * 0.12;
  }

  bid = Math.min(afford, Math.max(0, bid));
  // Keep powder dry: never dump entire bank early
  if (state.lotIndex < 5) bid = Math.min(bid, afford * (0.35 + book.aggression * 0.35));
  bid = roundBid(bid, book.roundTo);
  if (bid > 0 && bid < book.roundTo) bid = book.roundTo;

  const claim = pickClaim(book, est, clue.text, bluffing, state.lotIndex, state.lots.length);

  let inspect: string | undefined;
  if (bot.tokens > 0 && rng() < book.tokenRate) {
    const others = state.players.filter((p) => p.id !== bot.id);
    // Prefer human clue when curious
    if (human && rng() < 0.55 + book.mirrorHuman * 0.3) inspect = human.id;
    else inspect = others[Math.floor(rng() * others.length)]?.id;
  }

  return { playerId: bot.id, claim, bid, inspect };
}

export function allBotDecisions(state: MatchState, rng: () => number): BotDecision[] {
  return state.players.filter((p) => !p.isHuman).map((b) => decideBotAction(state, b, rng));
}

export function describeDealer(bot: PlayerState): string {
  const book = playbookById(bot.playbookId ?? 0);
  return `${dealerDisplayName(book)} — ${book.tagline}`;
}
