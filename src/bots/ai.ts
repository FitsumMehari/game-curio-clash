import type { AuctionLot, ClaimId, MatchState, PlayerState } from "@/core/types";
import { collectionBonusForGain } from "@/core/scoring";

export interface BotDecision {
  playerId: string;
  claim: ClaimId;
  bid: number;
  inspect?: string;
}

function estimateValue(lot: AuctionLot, player: PlayerState, clueText: string): number {
  const a = lot.artifact;
  let est = a.baseValue;
  const bonus = collectionBonusForGain(player, a);
  if (clueText.toLowerCase().includes("increases") || clueText.toLowerCase().includes("spikes")) {
    est += bonus.pair + bonus.set * 0.5;
  }
  if (clueText.toLowerCase().includes("forgery") || clueText.toLowerCase().includes("contested")) {
    est *= 0.55;
  }
  if (clueText.toLowerCase().includes("genuine")) est *= 1.12;
  if (clueText.toLowerCase().includes("gold") || clueText.toLowerCase().includes("platinum")) est *= 1.08;
  return Math.round(est);
}

function claimFor(
  bot: PlayerState,
  est: number,
  clueText: string,
  bluff: boolean,
): ClaimId {
  const fakeish = /forgery|contested|fake/i.test(clueText);
  const valuable = est >= 280;
  if (bot.botId === "bluffer" || bluff) {
    if (valuable) return "probably_fake";
    if (fakeish) return "extremely_valuable";
    return "you_overpay";
  }
  if (bot.botId === "skeptic" && (fakeish || est < 200)) return "probably_fake";
  if (bot.botId === "collector" && /increases|spikes|collection/i.test(clueText)) {
    return "completes_collection";
  }
  if (!valuable) return "not_bidding";
  if (fakeish) return "probably_fake";
  return "extremely_valuable";
}

export function decideBotAction(state: MatchState, bot: PlayerState, rng: () => number): BotDecision {
  const lot = state.lots[state.lotIndex]!;
  const clue = lot.cluesByPlayer[bot.id]!;
  const est = estimateValue(lot, bot, clue.text);
  const human = state.players.find((p) => p.isHuman)!;
  const humanRep = human.reputation;

  let bid = 0;
  const afford = bot.money;
  const want = Math.min(afford, Math.round(est * (0.45 + rng() * 0.4)));

  switch (bot.botId) {
    case "collector":
      bid = /increases|spikes/i.test(clue.text) ? Math.min(afford, want + 80) : Math.round(want * 0.7);
      break;
    case "shark":
      bid = Math.min(afford, want + Math.round(40 + rng() * 90));
      // often withdraws by bidding 0 late-feeling — here random pullback
      if (rng() < 0.22) bid = Math.min(afford, 20 + Math.round(rng() * 40));
      break;
    case "skeptic":
      bid = /forgery|contested/i.test(clue.text) ? Math.round(want * 0.25) : Math.round(want * 0.75);
      break;
    case "copycat":
      bid = Math.min(afford, Math.round(est * (0.5 + humanRep / 250)));
      break;
    case "bluffer":
      bid = Math.min(afford, Math.round(est * (0.55 + rng() * 0.5)));
      break;
    case "accountant":
    default: {
      const ev = est * (1 - lot.artifact.forgeryChance * 0.5);
      bid = Math.min(afford, Math.max(0, Math.round(ev * 0.62 - 15)));
      break;
    }
  }

  bid = Math.max(0, Math.min(afford, Math.round(bid / 10) * 10));
  const bluff = bot.botId === "bluffer" || (bot.reputation > 70 && rng() < 0.35);
  const claim = claimFor(bot, est, clue.text, bluff);

  let inspect: string | undefined;
  if (bot.tokens > 0 && rng() < 0.35) {
    const others = state.players.filter((p) => p.id !== bot.id);
    inspect = others[Math.floor(rng() * others.length)]?.id;
  }

  return { playerId: bot.id, claim, bid, inspect };
}

export function allBotDecisions(state: MatchState, rng: () => number): BotDecision[] {
  return state.players.filter((p) => !p.isHuman).map((b) => decideBotAction(state, b, rng));
}
