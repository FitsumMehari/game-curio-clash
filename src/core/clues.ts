import type { Artifact, CategoryId, Clue, ClueKind, PlayerState } from "@/core/types";
import { CATEGORY_LABELS } from "@/core/types";
import { pick } from "@/core/rng";

function materialClue(a: Artifact): Clue {
  return {
    kind: "material",
    text: `The artifact is made of ${a.material}.`,
    weight: 0.7,
  };
}

function ageClue(a: Artifact): Clue {
  if (a.ageYears >= 1_000_000) {
    return { kind: "age", text: "The artifact is older than recorded civilization.", weight: 0.8 };
  }
  if (a.ageYears >= 500) {
    return { kind: "age", text: "The artifact is more than 500 years old.", weight: 0.75 };
  }
  if (a.ageYears >= 100) {
    return { kind: "age", text: "The artifact is roughly a century old or older.", weight: 0.55 };
  }
  return { kind: "age", text: "The artifact is relatively modern (under 100 years).", weight: 0.6 };
}

function authenticityClue(a: Artifact): Clue {
  if (a.forgeryChance >= 0.7) {
    return { kind: "authenticity", text: "The artifact is probably a forgery.", weight: 0.9 };
  }
  if (a.forgeryChance >= 0.35) {
    return { kind: "authenticity", text: "Authenticity is contested — treat with caution.", weight: 0.65 };
  }
  return { kind: "authenticity", text: "Experts lean toward this being genuine.", weight: 0.7 };
}

function synergyClue(a: Artifact, player: PlayerState, catalog: Artifact[]): Clue {
  const ownedCats = player.collection
    .map((id) => catalog.find((x) => x.id === id)?.category)
    .filter(Boolean) as CategoryId[];
  const has = ownedCats.includes(a.category);
  const label = CATEGORY_LABELS[a.category];
  if (has) {
    return {
      kind: "synergy",
      text: `Its value spikes if you already collect ${label}.`,
      weight: 0.95,
    };
  }
  return {
    kind: "synergy",
    text: `Its value increases if you own another ${label} item.`,
    weight: 0.85,
  };
}

const BUILDERS: Record<ClueKind, (a: Artifact, p: PlayerState, c: Artifact[]) => Clue> = {
  material: (a) => materialClue(a),
  age: (a) => ageClue(a),
  authenticity: (a) => authenticityClue(a),
  synergy: (a, p, c) => synergyClue(a, p, c),
};

/** Every clue is truthful; each player gets a different kind. */
export function assignPrivateClues(
  artifact: Artifact,
  players: PlayerState[],
  catalog: Artifact[],
  rng: () => number,
): Record<string, Clue> {
  const kinds: ClueKind[] = ["material", "age", "authenticity", "synergy"];
  const out: Record<string, Clue> = {};
  const rotated = [...kinds];
  // rotate so seats don't always get the same clue type
  const offset = Math.floor(rng() * kinds.length);
  for (let i = 0; i < players.length; i++) {
    const kind = rotated[(i + offset) % kinds.length]!;
    // if more players than kinds, re-pick with variation
    const k = i < kinds.length ? kind : pick(rng, kinds);
    out[players[i]!.id] = BUILDERS[k](artifact, players[i]!, catalog);
  }
  return out;
}

export function allClueTexts(artifact: Artifact, player: PlayerState, catalog: Artifact[]): Clue[] {
  return (Object.keys(BUILDERS) as ClueKind[]).map((k) => BUILDERS[k](artifact, player, catalog));
}
