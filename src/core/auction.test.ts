import { describe, expect, it } from "vitest";
import { beginLot, createMatch, resolveLot, submitHumanBid, submitHumanClaim, applyBotActions } from "../core/auction";
import { allBotDecisions } from "../bots/ai";
import { createRng } from "../core/rng";
import { buildDailyPuzzle, gradeDaily } from "../daily/daily";
import { ARTIFACTS } from "../data/artifacts";

describe("catalog", () => {
  it("has 24 artifacts across 6 categories", () => {
    expect(ARTIFACTS).toHaveLength(24);
    const cats = new Set(ARTIFACTS.map((a) => a.category));
    expect(cats.size).toBe(6);
  });
});

describe("match loop", () => {
  it("runs eight lots and produces a winner bid path", () => {
    let state = beginLot(createMatch({ seed: "test-seed", humanName: "Ada", botCount: 2 }));
    expect(state.lots).toHaveLength(8);
    expect(state.phase).toBe("claim_bid");
    const clue = state.lots[0]!.cluesByPlayer[state.humanId];
    expect(clue?.text.length).toBeGreaterThan(10);

    state = submitHumanClaim(state, "extremely_valuable");
    state = submitHumanBid(state, 120);
    const bots = allBotDecisions(state, createRng("bots"));
    state = applyBotActions(state, bots);
    state = resolveLot(state);
    expect(state.phase).toBe("reveal");
    expect(state.lots[0]!.reveal).toBeTruthy();
  });
});

describe("daily", () => {
  it("is deterministic per day key", () => {
    const a = buildDailyPuzzle(new Date("2026-07-24T12:00:00Z"));
    const b = buildDailyPuzzle(new Date("2026-07-24T23:00:00Z"));
    expect(a.key).toBe(b.key);
    expect(a.objects.map((o) => o.id)).toEqual(b.objects.map((o) => o.id));
    const graded = gradeDaily(a, {
      genuineIndex: a.genuineIndex,
      mostValuableIndex: 0,
      pair: [0, 1],
      bids: a.objects.map((o) => o.baseValue),
      misleadingIndex: a.misleadingClueIndex,
    });
    expect(graded.score).toBeGreaterThanOrEqual(45);
  });
});
