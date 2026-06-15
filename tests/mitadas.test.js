import assert from "node:assert/strict";
import { test } from "node:test";
import { buildMitadas } from "../lib/db.js";

test("buildMitadas returns the top scorer for each round newest first", () => {
  const participants = [
    { id: "p1", nome: "Felipe", cartolaTeamName: "PredestinadoSC", cartolaOwnerName: "Felipe", escudoUrl: "https://example.com/p1.png" },
    { id: "p2", nome: "Ugo", cartolaTeamName: "Tricolorugorei brabuu", cartolaOwnerName: "ugo", escudoUrl: "https://example.com/p2.png" },
  ];
  const rounds = [
    { id: 1, nome: "Rodada 1", status: "fechado" },
    { id: 2, nome: "Rodada 2", status: "fechado" },
    { id: 3, nome: "Rodada 3", status: "fechado" },
  ];
  const scores = [
    { participantId: "p1", roundId: 1, finalPoints: 65.1, manualPoints: null, source: "cartola" },
    { participantId: "p2", roundId: 1, finalPoints: 72.4, manualPoints: null, source: "cartola" },
    { participantId: "p1", roundId: 2, finalPoints: 81.2, manualPoints: 88.3, source: "mixed", playedCount: 8, lineupCount: 11 },
    { participantId: "p2", roundId: 2, finalPoints: 83.2, manualPoints: null, source: "cartola" },
    { participantId: "p1", roundId: 3, finalPoints: 91.9, manualPoints: null, source: "cartola" },
    { participantId: "p2", roundId: 3, finalPoints: 79.5, manualPoints: null, source: "cartola" },
  ];

  const mitadas = buildMitadas(participants, rounds, scores);

  assert.equal(mitadas.length, 3);
  assert.equal(mitadas[0].roundId, 3);
  assert.equal(mitadas[0].participantId, "p1");
  assert.equal(mitadas[0].mitadasCount, 2);
  assert.equal(mitadas[1].roundId, 2);
  assert.equal(mitadas[1].points, 88.3);
  assert.equal(mitadas[1].source, "mixed");
  assert.equal(mitadas[1].runnerUp.diff, 5.1);
  assert.equal(mitadas[2].participantId, "p2");
});
