import { ARTIFACTS } from "@/data/artifacts";
import { assignPrivateClues } from "@/core/clues";
import { createRng, roomCodeFromSeed, shuffle } from "@/core/rng";
import { realizedLotValue } from "@/core/scoring";
import {
  AUCTION_COUNT,
  BID_SECONDS,
  START_MONEY,
  START_REP,
  START_TOKENS,
  type AuctionLot,
  type ClaimId,
  type MatchState,
  type PlayerState,
  type PublicClaim,
  type SecretBid,
} from "@/core/types";

export interface NewMatchOpts {
  seed: string;
  humanName: string;
  botCount?: number;
  botIds?: PlayerState["botId"][];
}

function makeHuman(name: string): PlayerState {
  return {
    id: "you",
    name: name.trim() || "Guest",
    isHuman: true,
    money: START_MONEY,
    tokens: START_TOKENS,
    reputation: START_REP,
    collection: [],
    claimsCorrect: 0,
    claimsFalse: 0,
  };
}

function makeBot(id: string, name: string, botId: PlayerState["botId"]): PlayerState {
  return {
    id,
    name,
    isHuman: false,
    botId,
    money: START_MONEY,
    tokens: START_TOKENS,
    reputation: START_REP,
    collection: [],
    claimsCorrect: 0,
    claimsFalse: 0,
  };
}

const DEFAULT_BOTS: { botId: NonNullable<PlayerState["botId"]>; name: string }[] = [
  { botId: "collector", name: "The Collector" },
  { botId: "shark", name: "The Shark" },
  { botId: "skeptic", name: "The Skeptic" },
  { botId: "accountant", name: "The Accountant" },
  { botId: "bluffer", name: "The Bluffer" },
];

export function createMatch(opts: NewMatchOpts): MatchState {
  const rng = createRng(opts.seed);
  const human = makeHuman(opts.humanName);
  const nBots = Math.max(1, Math.min(5, opts.botCount ?? 3));
  const bots = DEFAULT_BOTS.slice(0, nBots).map((b, i) => makeBot(`bot-${i}`, b.name, opts.botIds?.[i] ?? b.botId));
  const players = [human, ...bots];
  const deck = shuffle(rng, ARTIFACTS).slice(0, AUCTION_COUNT);
  const lots: AuctionLot[] = deck.map((artifact, index) => {
    const genuine = rng() >= artifact.forgeryChance;
    return {
      index,
      artifact,
      genuine,
      cluesByPlayer: assignPrivateClues(artifact, players, ARTIFACTS, rng),
      claims: [],
      bids: [],
      inspected: Object.fromEntries(players.map((p) => [p.id, [] as string[]])),
    };
  });

  return {
    seed: opts.seed,
    roomCode: roomCodeFromSeed(opts.seed),
    phase: "briefing",
    lotIndex: 0,
    lots,
    players,
    humanId: human.id,
    timerEndsAt: 0,
    log: [`Table ${roomCodeFromSeed(opts.seed)} opens. Eight lots. Spend carefully.`],
  };
}

export function beginLot(state: MatchState, now = Date.now()): MatchState {
  const lot = state.lots[state.lotIndex];
  if (!lot) return { ...state, phase: "finished" };
  return {
    ...state,
    phase: "claim_bid",
    timerEndsAt: now + BID_SECONDS * 1000,
    log: [
      ...state.log,
      `Lot #${state.lotIndex + 1}: Unknown object sealed. Private clues dealt.`,
    ],
  };
}

export function submitHumanClaim(state: MatchState, claim: ClaimId): MatchState {
  if (state.phase !== "claim_bid") return state;
  const lot = state.lots[state.lotIndex]!;
  if (lot.claims.some((c) => c.playerId === state.humanId)) return state;
  const claims = [...lot.claims, { playerId: state.humanId, claim }];
  const lots = state.lots.map((l, i) => (i === state.lotIndex ? { ...l, claims } : l));
  return { ...state, lots };
}

export function submitHumanBid(state: MatchState, amount: number): MatchState {
  if (state.phase !== "claim_bid") return state;
  const human = state.players.find((p) => p.id === state.humanId)!;
  const capped = Math.max(0, Math.min(human.money, Math.round(amount)));
  const lot = state.lots[state.lotIndex]!;
  const bids = [...lot.bids.filter((b) => b.playerId !== state.humanId), { playerId: state.humanId, amount: capped }];
  const lots = state.lots.map((l, i) => (i === state.lotIndex ? { ...l, bids } : l));
  return { ...state, lots };
}

export function spendTokenInspect(state: MatchState, targetPlayerId: string): MatchState {
  if (state.phase !== "claim_bid") return state;
  const human = state.players.find((p) => p.id === state.humanId)!;
  if (human.tokens <= 0) return state;
  const lot = state.lots[state.lotIndex]!;
  const clue = lot.cluesByPlayer[targetPlayerId];
  if (!clue) return state;
  const already = lot.inspected[state.humanId] ?? [];
  if (already.includes(clue.text)) return state;
  const players = state.players.map((p) => (p.id === state.humanId ? { ...p, tokens: p.tokens - 1 } : p));
  const inspected = {
    ...lot.inspected,
    [state.humanId]: [...already, clue.text],
  };
  const lots = state.lots.map((l, i) => (i === state.lotIndex ? { ...l, inspected } : l));
  return {
    ...state,
    players,
    lots,
    log: [...state.log, `You spent a token to peek at ${targetPlayerId === state.humanId ? "your own" : "another"} clue.`],
  };
}

export function applyBotActions(
  state: MatchState,
  botActions: { playerId: string; claim: ClaimId; bid: number; inspect?: string }[],
): MatchState {
  let next = state;
  const lot = next.lots[next.lotIndex]!;
  let claims = [...lot.claims];
  let bids = [...lot.bids];
  let players = [...next.players];
  let inspected = { ...lot.inspected };

  for (const act of botActions) {
    if (!claims.some((c) => c.playerId === act.playerId)) {
      claims.push({ playerId: act.playerId, claim: act.claim });
    }
    const p = players.find((x) => x.id === act.playerId)!;
    const amount = Math.max(0, Math.min(p.money, Math.round(act.bid)));
    bids = [...bids.filter((b) => b.playerId !== act.playerId), { playerId: act.playerId, amount }];
    if (act.inspect && p.tokens > 0) {
      const clue = lot.cluesByPlayer[act.inspect];
      if (clue) {
        players = players.map((x) => (x.id === act.playerId ? { ...x, tokens: x.tokens - 1 } : x));
        inspected = {
          ...inspected,
          [act.playerId]: [...(inspected[act.playerId] ?? []), clue.text],
        };
      }
    }
  }

  const lots = next.lots.map((l, i) =>
    i === next.lotIndex ? { ...l, claims, bids, inspected } : l,
  );
  return { ...next, players, lots };
}

function claimWasCorrect(claim: ClaimId, lot: AuctionLot, winnerId: string | null, playerId: string): boolean | null {
  const art = lot.artifact;
  if (claim === "probably_fake") return !lot.genuine;
  if (claim === "extremely_valuable") return art.baseValue >= 300 && lot.genuine;
  if (claim === "not_bidding") {
    const bid = lot.bids.find((b) => b.playerId === playerId)?.amount ?? 0;
    return bid === 0;
  }
  if (claim === "completes_collection") return winnerId === playerId;
  if (claim === "you_overpay") {
    if (!winnerId) return null;
    const winBid = lot.bids.find((b) => b.playerId === winnerId)?.amount ?? 0;
    const { value } = realizedLotValue(art, lot.genuine, null);
    return winBid > value;
  }
  return null;
}

export function resolveLot(state: MatchState): MatchState {
  const lot = state.lots[state.lotIndex]!;
  const bids = [...lot.bids];
  // ensure everyone has a bid (0) and claim
  for (const p of state.players) {
    if (!bids.some((b) => b.playerId === p.id)) bids.push({ playerId: p.id, amount: 0 });
  }
  const sorted = [...bids].sort((a, b) => b.amount - a.amount || a.playerId.localeCompare(b.playerId));
  const top = sorted[0];
  const winnerId = top && top.amount > 0 ? top.playerId : null;
  const winningBid = winnerId ? top!.amount : 0;

  let players = state.players.map((p) => ({ ...p, collection: [...p.collection] }));
  let setBonus = 0;
  let realizedValue = 0;

  if (winnerId) {
    const buyer = players.find((p) => p.id === winnerId)!;
    const rv = realizedLotValue(lot.artifact, lot.genuine, buyer);
    realizedValue = rv.value;
    setBonus = rv.setBonus;
    players = players.map((p) => {
      if (p.id !== winnerId) return p;
      return {
        ...p,
        money: p.money - winningBid,
        collection: [...p.collection, lot.artifact.id],
      };
    });
  } else {
    realizedValue = realizedLotValue(lot.artifact, lot.genuine, null).value;
  }

  // reputation from claims
  players = players.map((p) => {
    const claim = lot.claims.find((c) => c.playerId === p.id)?.claim;
    if (!claim) return p;
    const ok = claimWasCorrect(claim, { ...lot, bids }, winnerId, p.id);
    if (ok === null) return p;
    if (ok) {
      return {
        ...p,
        reputation: Math.min(100, p.reputation + 8),
        claimsCorrect: p.claimsCorrect + 1,
      };
    }
    return {
      ...p,
      reputation: Math.max(0, p.reputation - 10),
      claimsFalse: p.claimsFalse + 1,
    };
  });

  const reveal = {
    artifact: lot.artifact,
    genuine: lot.genuine,
    realizedValue,
    winnerId,
    winningBid,
    bids,
    claims: lot.claims as PublicClaim[],
    setBonus,
  };

  const lots = state.lots.map((l, i) => (i === state.lotIndex ? { ...l, bids, reveal } : l));
  const winnerName = winnerId ? players.find((p) => p.id === winnerId)?.name : "No one";
  const log = [
    ...state.log,
    `Sold: ${lot.artifact.name} (${lot.genuine ? "genuine" : "forgery"}) → ${winnerName} for ${winningBid}. Value ${realizedValue}.`,
  ];

  return { ...state, phase: "reveal", players, lots, log };
}

export function advanceAfterReveal(state: MatchState, now = Date.now()): MatchState {
  const nextIndex = state.lotIndex + 1;
  if (nextIndex >= state.lots.length) {
    return { ...state, phase: "finished", lotIndex: nextIndex };
  }
  const next: MatchState = { ...state, lotIndex: nextIndex, phase: "between" };
  return beginLot(next, now);
}

export function humanReady(state: MatchState): boolean {
  const lot = state.lots[state.lotIndex];
  if (!lot) return false;
  return (
    lot.claims.some((c) => c.playerId === state.humanId) &&
    lot.bids.some((b) => b.playerId === state.humanId)
  );
}

export type { SecretBid };
