import { artifactById } from "@/data/artifacts";
import type { Artifact, CategoryId, PlayerState } from "@/core/types";
import { CATEGORY_LABELS } from "@/core/types";

const SET_SIZE = 3;
const SET_BONUS = 500;
const PAIR_BONUS = 180;

export function categoryCounts(player: PlayerState): Record<CategoryId, number> {
  const counts = {
    egypt: 0,
    space: 0,
    inventions: 0,
    mythical: 0,
    royal: 0,
    forgeries: 0,
  } as Record<CategoryId, number>;
  for (const id of player.collection) {
    const a = artifactById(id);
    if (a) counts[a.category] += 1;
  }
  return counts;
}

export function collectionBonusForGain(
  player: PlayerState,
  artifact: Artifact,
): { pair: number; set: number; label: string } {
  const counts = categoryCounts(player);
  const next = counts[artifact.category] + 1;
  let pair = 0;
  let set = 0;
  if (next === 2) pair = PAIR_BONUS;
  if (next === SET_SIZE) set = SET_BONUS;
  return { pair, set, label: CATEGORY_LABELS[artifact.category] };
}

export function realizedLotValue(
  artifact: Artifact,
  genuine: boolean,
  buyer: PlayerState | null,
): { value: number; setBonus: number } {
  if (!genuine) {
    // Famous forgeries still have street value; accidental fakes collapse
    const salvage = artifact.category === "forgeries" ? Math.round(artifact.baseValue * 0.85) : Math.round(artifact.baseValue * 0.2);
    return { value: salvage, setBonus: 0 };
  }
  let setBonus = 0;
  let value = artifact.baseValue;
  if (buyer) {
    const b = collectionBonusForGain(buyer, artifact);
    setBonus = b.pair + b.set;
    value += setBonus;
  }
  return { value, setBonus };
}

/** Final score: collection realized values are already paid for; leftover cash counts 1:1. */
export function finalScore(player: PlayerState, lotValues: Map<string, number>): number {
  let art = 0;
  for (const id of player.collection) art += lotValues.get(id) ?? artifactById(id)?.baseValue ?? 0;
  return art + player.money;
}

export function visibleFocusCategories(player: PlayerState): CategoryId[] {
  const counts = categoryCounts(player);
  return (Object.entries(counts) as [CategoryId, number][])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([c]) => c)
    .slice(0, 2);
}
