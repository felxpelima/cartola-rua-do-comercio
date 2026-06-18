import assert from "node:assert/strict";
import { test } from "node:test";
import { buildRanking } from "../lib/db.js";

test("buildRanking computes movement during the first synced round", () => {
  const participants = [
    { id: "p1", nome: "Ana", manualPoints: 0, active: true },
    { id: "p2", nome: "Bruno", manualPoints: 0, active: true },
    { id: "p3", nome: "Caio", manualPoints: 0, active: true },
  ];
  const scores = [
    { participantId: "p1", roundId: 1, finalPoints: 10, manualPoints: null, source: "cartola" },
    { participantId: "p2", roundId: 1, finalPoints: 30, manualPoints: null, source: "cartola" },
    { participantId: "p3", roundId: 1, finalPoints: 20, manualPoints: null, source: "cartola" },
  ];

  const { ranking } = buildRanking(participants, scores, 1);

  assert.deepEqual(
    ranking.map((participant) => ({ id: participant.id, rank: participant.rank, delta: participant.delta })),
    [
      { id: "p2", rank: 1, delta: 1 },
      { id: "p3", rank: 2, delta: 1 },
      { id: "p1", rank: 3, delta: -2 },
    ]
  );
});

test("buildRanking compares later rounds against the previous round table", () => {
  const participants = [
    { id: "p1", nome: "Ana", manualPoints: 0, active: true },
    { id: "p2", nome: "Bruno", manualPoints: 0, active: true },
  ];
  const scores = [
    { participantId: "p1", roundId: 1, finalPoints: 50, manualPoints: null, source: "cartola" },
    { participantId: "p2", roundId: 1, finalPoints: 20, manualPoints: null, source: "cartola" },
    { participantId: "p1", roundId: 2, finalPoints: 1, manualPoints: null, source: "cartola" },
    { participantId: "p2", roundId: 2, finalPoints: 80, manualPoints: null, source: "cartola" },
  ];

  const { ranking } = buildRanking(participants, scores, 2);

  assert.equal(ranking[0].id, "p2");
  assert.equal(ranking[0].delta, 1);
  assert.equal(ranking[1].id, "p1");
  assert.equal(ranking[1].delta, -1);
});
