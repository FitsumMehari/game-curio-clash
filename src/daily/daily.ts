import { ARTIFACTS } from "@/data/artifacts";
import { allClueTexts } from "@/core/clues";
import { createRng, dailyKey, shuffle } from "@/core/rng";
import type { DailyAnswers, DailyPuzzle, PlayerState } from "@/core/types";
import { START_MONEY, START_REP, START_TOKENS } from "@/core/types";

export function buildDailyPuzzle(date = new Date()): DailyPuzzle {
  const key = dailyKey(date);
  const rng = createRng(`daily:${key}`);
  const objects = shuffle(rng, ARTIFACTS).slice(0, 5);
  const genuineIndex = Math.floor(rng() * objects.length);
  // Force authenticity: pick which are "market genuine" for the puzzle
  const ghost: PlayerState = {
    id: "daily",
    name: "Appraiser",
    isHuman: true,
    money: START_MONEY,
    tokens: START_TOKENS,
    reputation: START_REP,
    collection: [],
    claimsCorrect: 0,
    claimsFalse: 0,
  };
  const clues = objects.flatMap((a, i) => {
    const pool = allClueTexts(a, ghost, ARTIFACTS);
    const c = pool[Math.floor(rng() * pool.length)]!;
    // tag which object
    return [{ ...c, text: `Lot ${i + 1}: ${c.text}` }];
  });
  // one misleading because of "market conditions" — flip authenticity wording
  const misleadingClueIndex = Math.floor(rng() * clues.length);
  const bad = clues[misleadingClueIndex]!;
  clues[misleadingClueIndex] = {
    ...bad,
    text: bad.text.includes("forgery")
      ? bad.text.replace("probably a forgery", "widely trusted today")
      : `${bad.text} (rumor: prices inflated)`,
    weight: 0.2,
  };
  return { key, objects, genuineIndex, clues, misleadingClueIndex };
}

export function gradeDaily(puzzle: DailyPuzzle, answers: DailyAnswers): {
  score: number;
  max: number;
  breakdown: string[];
} {
  const breakdown: string[] = [];
  let score = 0;
  const max = 100;

  if (answers.genuineIndex === puzzle.genuineIndex) {
    score += 25;
    breakdown.push("+25 correctly named the genuine lot");
  } else breakdown.push("+0 genuine lot");

  const values = puzzle.objects.map((o, i) =>
    i === puzzle.genuineIndex ? o.baseValue : Math.round(o.baseValue * 0.2),
  );
  const best = values.indexOf(Math.max(...values));
  if (answers.mostValuableIndex === best) {
    score += 20;
    breakdown.push("+20 most valuable pick");
  } else breakdown.push("+0 most valuable");

  const [a, b] = answers.pair;
  const sameCat =
    puzzle.objects[a]?.category && puzzle.objects[a]?.category === puzzle.objects[b]?.category && a !== b;
  if (sameCat) {
    score += 20;
    breakdown.push("+20 collection pair");
  } else breakdown.push("+0 collection pair");

  if (answers.misleadingIndex === puzzle.misleadingClueIndex) {
    score += 20;
    breakdown.push("+20 spotted the misleading clue");
  } else breakdown.push("+0 misleading clue");

  // bidding: reward bids near realized value within 30%
  let bidPts = 0;
  answers.bids.forEach((bid, i) => {
    const target = values[i] ?? 0;
    const err = Math.abs(bid - target) / Math.max(40, target);
    if (err <= 0.3) bidPts += 3;
  });
  bidPts = Math.min(15, bidPts);
  score += bidPts;
  breakdown.push(`+${bidPts} bid accuracy`);

  return { score: Math.min(max, score), max, breakdown };
}

export function loadDailyBest(key: string): number | null {
  try {
    const raw = localStorage.getItem("curio-daily-best");
    if (!raw) return null;
    const j = JSON.parse(raw) as { key: string; score: number };
    return j.key === key ? j.score : null;
  } catch {
    return null;
  }
}

export function saveDailyBest(key: string, score: number): void {
  const prev = loadDailyBest(key) ?? -1;
  if (score >= prev) localStorage.setItem("curio-daily-best", JSON.stringify({ key, score }));
}
