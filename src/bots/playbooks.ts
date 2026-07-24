import type { BotId, ClaimId } from "@/core/types";

/** One of 200 distinct dealer playbooks — combo of archetype + timing + bluff + money habits. */
export interface BotPlaybook {
  id: number;
  codename: string;
  archetype: BotId;
  /** 0 timid … 1 reckless */
  aggression: number;
  bluffRate: number;
  tokenRate: number;
  valueMul: number;
  conserveLate: boolean;
  /** How much to shadow the human's reputation / last bids */
  mirrorHuman: number;
  claimBias: "honest" | "invert" | "hype" | "bash" | "pass" | "set";
  bidNoise: number;
  passThreshold: number;
  roundTo: 5 | 10 | 25;
  sniper: boolean;
  tagline: string;
}

const ARCHETYPES: BotId[] = ["collector", "shark", "skeptic", "copycat", "bluffer", "accountant"];

const CODENAMES = [
  "Ivory", "Gilt", "Ash", "Cinder", "Relic", "Vault", "Ledger", "Fang", "Quill", "Mirage",
  "Amber", "Obsidian", "Pearl", "Rust", "Silk", "Copper", "Jade", "Onyx", "Flint", "Harbor",
  "Nova", "Drift", "Cipher", "Echo", "Warden", "Sparrow", "Viper", "Lotus", "Marble", "Forge",
  "Tide", "Crown", "Needle", "Glass", "Smoke", "Cedar", "Raven", "Orchid", "Anvil", "Prism",
  "Sable", "Cobalt", "Ember", "Frost", "Hearth", "Lantern", "Mosaic", "Nimbus", "Opal", "Quartz",
];

const TAGS = [
  "Pays for sets, ignores noise.",
  "Pushes the price, then vanishes.",
  "Treats every lot as a trap.",
  "Copies whoever looks confident.",
  "Lies early to cash trust later.",
  "Bids expected value, nothing more.",
  "Hoards cash until the final lots.",
  "Snipes mid-value bargains.",
  "Burns tokens on rival clues.",
  "Talks big, bids small.",
  "Quiet claim, sharp bid.",
  "Hates forgeries more than poverty.",
];

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/** Build exactly 200 unique playbooks (ids 0–199). */
export function buildPlaybooks(): BotPlaybook[] {
  const books: BotPlaybook[] = [];
  for (let id = 0; id < 200; id++) {
    const archetype = ARCHETYPES[id % ARCHETYPES.length]!;
    const aggression = clamp01(0.15 + ((id * 17) % 85) / 100);
    const bluffRate = clamp01(0.05 + ((id * 29) % 90) / 100);
    const tokenRate = clamp01(0.05 + ((id * 13) % 80) / 100);
    const valueMul = 0.7 + ((id * 11) % 70) / 100; // 0.7–1.39
    const conserveLate = id % 3 !== 0;
    const mirrorHuman = clamp01(((id * 19) % 100) / 100);
    const biases: BotPlaybook["claimBias"][] = ["honest", "invert", "hype", "bash", "pass", "set"];
    const claimBias = biases[Math.floor(id / 6) % biases.length]!;
    const bidNoise = 0.02 + ((id * 7) % 28) / 100;
    const passThreshold = 80 + ((id * 23) % 160);
    const roundTo = ([5, 10, 25] as const)[id % 3]!;
    const sniper = id % 5 === 0;
    const codename = `${CODENAMES[id % CODENAMES.length]}-${String(id).padStart(3, "0")}`;
    const tagline = TAGS[(id * 3) % TAGS.length]!;
    books.push({
      id,
      codename,
      archetype,
      aggression,
      bluffRate,
      tokenRate,
      valueMul,
      conserveLate,
      mirrorHuman,
      claimBias,
      bidNoise,
      passThreshold,
      roundTo,
      sniper,
      tagline,
    });
  }
  return books;
}

export const PLAYBOOKS: readonly BotPlaybook[] = buildPlaybooks();

export function playbookById(id: number): BotPlaybook {
  return PLAYBOOKS[((id % 200) + 200) % 200]!;
}

export function pickPlaybookIds(rng: () => number, count: number): number[] {
  const pool = [...Array(200).keys()];
  const picked: number[] = [];
  for (let i = 0; i < count && pool.length; i++) {
    const j = Math.floor(rng() * pool.length);
    picked.push(pool.splice(j, 1)[0]!);
  }
  return picked;
}

export function dealerDisplayName(book: BotPlaybook): string {
  const titles: Record<BotId, string> = {
    collector: "Collector",
    shark: "Shark",
    skeptic: "Skeptic",
    copycat: "Copycat",
    bluffer: "Bluffer",
    accountant: "Accountant",
  };
  return `${titles[book.archetype]} ${book.codename}`;
}

export type { ClaimId };
