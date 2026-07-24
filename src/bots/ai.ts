import { dealerDisplayName, playbookById } from "@/bots/playbooks";
import {
  beliefEntropy,
  buildBeliefs,
  chooseClaim,
  parseClueKind,
  searchBestBid,
  shouldInspect,
} from "@/bots/mind";
import type { ClaimId, Clue, MatchState, PlayerState } from "@/core/types";

export interface BotDecision {
  playerId: string;
  claim: ClaimId;
  bid: number;
  inspect?: string;
}

function gatherClues(state: MatchState, bot: PlayerState): Clue[] {
  const lot = state.lots[state.lotIndex]!;
  const primary = lot.cluesByPlayer[bot.id];
  const clues: Clue[] = primary ? [primary] : [];
  for (const text of lot.inspected[bot.id] ?? []) {
    clues.push(parseClueKind(text));
  }
  return clues;
}

/**
 * Free on-device AI: Monte Carlo EV search over clue-consistent artifact beliefs.
 * Playbooks remain as personality priors (risk, bluff, tokens) — not the whole brain.
 */
export function decideBotAction(state: MatchState, bot: PlayerState, rng: () => number): BotDecision {
  const book = playbookById(bot.playbookId ?? bot.styleSeed ?? 0);
  const clues = gatherClues(state, bot);
  const worlds = buildBeliefs(bot, clues);
  const rivals = state.players.filter((p) => p.id !== bot.id).length;

  // Claim first (affects rival-pressure model), then optimize bid under that table talk
  const fairProbe = searchBestBid(
    bot,
    worlds,
    book,
    rivals,
    state.lotIndex,
    state.lots.length,
    "not_bidding",
    rng,
  ).fairValue;

  const claim = chooseClaim(book, fairProbe, clues, bot, state.lotIndex, state.lots.length, rng);
  const { bid } = searchBestBid(
    bot,
    worlds,
    book,
    rivals,
    state.lotIndex,
    state.lots.length,
    claim,
    rng,
  );

  // Shark sometimes posts a fake-low bid after a loud claim (table theater)
  let finalBid = bid;
  if (book.archetype === "shark" && claim === "extremely_valuable" && rng() < 0.18) {
    finalBid = Math.min(bot.money, book.roundTo * (1 + Math.floor(rng() * 3)));
  }

  let inspect: string | undefined;
  if (shouldInspect(book, bot.tokens, beliefEntropy(worlds), rng)) {
    const human = state.players.find((p) => p.isHuman);
    const others = state.players.filter((p) => p.id !== bot.id);
    if (human && rng() < 0.55 + book.mirrorHuman * 0.35) inspect = human.id;
    else inspect = others[Math.floor(rng() * others.length)]?.id;
  }

  return { playerId: bot.id, claim, bid: finalBid, inspect };
}

export function allBotDecisions(state: MatchState, rng: () => number): BotDecision[] {
  return state.players.filter((p) => !p.isHuman).map((b) => decideBotAction(state, b, rng));
}

export function describeDealer(bot: PlayerState): string {
  const book = playbookById(bot.playbookId ?? 0);
  return `${dealerDisplayName(book)} — ${book.tagline}`;
}
