/** Curio Clash — shared types */

export type CategoryId =
  | "egypt"
  | "space"
  | "inventions"
  | "mythical"
  | "royal"
  | "forgeries";

export type ClaimId =
  | "extremely_valuable"
  | "probably_fake"
  | "completes_collection"
  | "not_bidding"
  | "you_overpay";

export type ClueKind = "material" | "age" | "authenticity" | "synergy";

export type BotId = "collector" | "shark" | "skeptic" | "copycat" | "bluffer" | "accountant";

export interface Artifact {
  id: string;
  name: string;
  category: CategoryId;
  baseValue: number;
  material: string;
  ageYears: number;
  forgeryChance: number; // 0–1
  blurb: string;
}

export interface Clue {
  kind: ClueKind;
  text: string;
  /** Soft hint strength for bots / daily scoring */
  weight: number;
}

export interface PlayerState {
  id: string;
  name: string;
  isHuman: boolean;
  botId?: BotId;
  /** Index into the 200 solo playbooks */
  playbookId?: number;
  /** Legacy alias used by older seeds */
  styleSeed?: number;
  money: number;
  tokens: number;
  reputation: number;
  collection: string[]; // artifact ids
  claimsCorrect: number;
  claimsFalse: number;
}

export interface PublicClaim {
  playerId: string;
  claim: ClaimId;
}

export interface SecretBid {
  playerId: string;
  amount: number;
}

export interface LotReveal {
  artifact: Artifact;
  genuine: boolean;
  realizedValue: number;
  winnerId: string | null;
  winningBid: number;
  bids: SecretBid[];
  claims: PublicClaim[];
  setBonus: number;
}

export interface AuctionLot {
  index: number;
  artifact: Artifact;
  genuine: boolean;
  cluesByPlayer: Record<string, Clue>;
  claims: PublicClaim[];
  bids: SecretBid[];
  inspected: Record<string, string[]>; // playerId -> extra clue texts seen
  reveal?: LotReveal;
}

export type MatchPhase =
  | "lobby"
  | "briefing"
  | "claim_bid"
  | "reveal"
  | "between"
  | "finished";

export interface MatchState {
  seed: string;
  roomCode: string;
  mode: "solo" | "private";
  phase: MatchPhase;
  lotIndex: number;
  lots: AuctionLot[];
  players: PlayerState[];
  humanId: string;
  timerEndsAt: number;
  log: string[];
  tipShown: boolean;
}

export interface DailyPuzzle {
  key: string;
  objects: Artifact[];
  genuineIndex: number;
  clues: Clue[];
  misleadingClueIndex: number;
}

export interface DailyAnswers {
  genuineIndex: number;
  mostValuableIndex: number;
  pair: [number, number];
  bids: number[];
  misleadingIndex: number;
}

export const START_MONEY = 1000;
export const START_TOKENS = 3;
export const START_REP = 50;
export const AUCTION_COUNT = 8;
export const BID_SECONDS = 9;
export const SOLO_BID_SECONDS = 14;
export const CLAIM_LABELS: Record<ClaimId, string> = {
  extremely_valuable: "This is extremely valuable.",
  probably_fake: "I think it is fake.",
  completes_collection: "It completes my collection.",
  not_bidding: "I am not bidding.",
  you_overpay: "You are overpaying.",
};

export const CATEGORY_LABELS: Record<CategoryId, string> = {
  egypt: "Ancient Egypt",
  space: "Space Exploration",
  inventions: "Lost Inventions",
  mythical: "Mythical Creatures",
  royal: "Royal Treasures",
  forgeries: "Famous Forgeries",
};
