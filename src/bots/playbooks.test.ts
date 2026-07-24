import { describe, expect, it } from "vitest";
import {
  advanceAfterReveal,
  applyBotActions,
  beginLot,
  createMatch,
  resolveLot,
  submitHumanBid,
  submitHumanClaim,
} from "../core/auction";
import { allBotDecisions } from "../bots/ai";
import { PLAYBOOKS, buildPlaybooks, pickPlaybookIds } from "../bots/playbooks";
import { createRng } from "../core/rng";
import { finalScore } from "../core/scoring";

describe("playbooks", () => {
  it("exposes 200 unique dealer minds", () => {
    expect(PLAYBOOKS).toHaveLength(200);
    expect(buildPlaybooks()).toHaveLength(200);
    const ids = new Set(PLAYBOOKS.map((p) => p.id));
    expect(ids.size).toBe(200);
    const codes = new Set(PLAYBOOKS.map((p) => p.codename));
    expect(codes.size).toBe(200);
    const fingerprints = new Set(
      PLAYBOOKS.map(
        (p) =>
          `${p.archetype}|${p.aggression.toFixed(2)}|${p.bluffRate.toFixed(2)}|${p.claimBias}|${p.roundTo}|${p.sniper}|${p.passThreshold}`,
      ),
    );
    expect(fingerprints.size).toBeGreaterThanOrEqual(180);
  });

  it("picks distinct playbooks for a table", () => {
    const ids = pickPlaybookIds(createRng("table"), 5);
    expect(ids).toHaveLength(5);
    expect(new Set(ids).size).toBe(5);
  });
});

describe("solo user simulation", () => {
  it("plays a full solo match like a guest without crashing", () => {
    let state = beginLot(createMatch({ seed: "playtest-guest", humanName: "Guest", botCount: 3, mode: "solo" }));
    expect(state.mode).toBe("solo");
    expect(state.players.filter((p) => !p.isHuman)).toHaveLength(3);
    expect(state.players.filter((p) => !p.isHuman).every((p) => typeof p.playbookId === "number")).toBe(true);

    for (let lot = 0; lot < 8; lot++) {
      expect(state.phase).toBe("claim_bid");
      const claim = lot % 2 === 0 ? "extremely_valuable" : "probably_fake";
      state = submitHumanClaim(state, claim);
      state = submitHumanBid(state, 80 + lot * 20);
      const bots = allBotDecisions(state, createRng(`pt-${lot}`));
      expect(bots).toHaveLength(3);
      // bids should vary across playbooks
      const amounts = new Set(bots.map((b) => b.bid));
      expect(amounts.size).toBeGreaterThanOrEqual(1);
      state = applyBotActions(state, bots);
      state = resolveLot(state);
      expect(state.phase).toBe("reveal");
      state = advanceAfterReveal(state, Date.now());
    }
    expect(state.phase).toBe("finished");
    const values = new Map<string, number>();
    for (const l of state.lots) {
      if (l.reveal?.winnerId) values.set(l.artifact.id, l.reveal.realizedValue);
    }
    const scores = state.players.map((p) => finalScore(p, values));
    expect(scores.every((s) => s >= 0)).toBe(true);
  });

  it("produces varied bids across many playbooks on one lot", () => {
    const state = beginLot(createMatch({ seed: "variety", humanName: "Ada", botCount: 5, mode: "solo" }));
    let stamped = submitHumanClaim(state, "not_bidding");
    stamped = submitHumanBid(stamped, 0);
    const decisions = allBotDecisions(stamped, createRng("variety-bots"));
    const claims = new Set(decisions.map((d) => d.claim));
    const bids = decisions.map((d) => d.bid);
    expect(decisions).toHaveLength(5);
    expect(claims.size).toBeGreaterThanOrEqual(2);
    expect(Math.max(...bids) - Math.min(...bids)).toBeGreaterThanOrEqual(0);
  });
});
