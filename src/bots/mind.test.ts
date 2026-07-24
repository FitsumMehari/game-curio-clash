import { describe, expect, it } from "vitest";
import { buildBeliefs, expectedLotValue, searchBestBid } from "./mind";
import { playbookById } from "./playbooks";
import { createRng } from "@/core/rng";
import { START_MONEY, START_REP, START_TOKENS, type PlayerState } from "@/core/types";

function ghost(partial?: Partial<PlayerState>): PlayerState {
  return {
    id: "bot-0",
    name: "Test",
    isHuman: false,
    money: START_MONEY,
    tokens: START_TOKENS,
    reputation: START_REP,
    collection: [],
    claimsCorrect: 0,
    claimsFalse: 0,
    playbookId: 0,
    ...partial,
  };
}

describe("on-device auction mind", () => {
  it("narrows beliefs from a gold material clue", () => {
    const worlds = buildBeliefs(ghost(), [
      { kind: "material", text: "The artifact is made of gold.", weight: 0.7 },
    ]);
    expect(worlds.length).toBeGreaterThan(0);
    expect(worlds.every((w) => w.artifact.material === "gold")).toBe(true);
  });

  it("bids near zero when clue screams forgery and EV is poor", () => {
    const player = ghost({ playbookId: 2 }); // skeptic-leaning rotation
    const book = playbookById(player.playbookId!);
    const worlds = buildBeliefs(player, [
      { kind: "authenticity", text: "The artifact is probably a forgery.", weight: 0.9 },
    ]);
    const ev = expectedLotValue(player, worlds);
    const rng = createRng("mind-fake");
    const { bid } = searchBestBid(player, worlds, book, 3, 1, 8, "probably_fake", rng);
    expect(ev).toBeLessThan(280);
    expect(bid).toBeLessThan(220);
  });

  it("will pay up when synergy + genuine clues imply a set spike", () => {
    const player = ghost({
      collection: ["scarab", "papyrus"], // egypt pair → set on third
      playbookId: 0,
    });
    const book = playbookById(0);
    const worlds = buildBeliefs(player, [
      { kind: "synergy", text: "Its value spikes if you already collect Ancient Egypt.", weight: 0.95 },
      { kind: "authenticity", text: "Experts lean toward this being genuine.", weight: 0.7 },
    ]);
    const rng = createRng("mind-set");
    const { bid, fairValue } = searchBestBid(
      player,
      worlds,
      book,
      2,
      6,
      8,
      "completes_collection",
      rng,
    );
    expect(fairValue).toBeGreaterThan(300);
    expect(bid).toBeGreaterThan(100);
  });
});
