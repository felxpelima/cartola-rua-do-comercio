import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(file) {
  return readFileSync(file, "utf8");
}

test("public page exposes the IDs required by landing.js", () => {
  const html = read("index.html");
  for (const id of ["titulo", "subtitulo", "total", "chipN", "chipValor", "prizes", "podium", "lista", "roundList", "badgeList"]) {
    assert.match(html, new RegExp(`id="${id}"`), `${id} must exist in index.html`);
  }
});

test("admin page exposes the IDs required by admin.js", () => {
  const html = read("admin.html");
  for (const id of ["teamSearch", "teamSearchBtn", "syncBtn", "roundNote", "syncNote", "sourceNote", "syncLog", "participants", "saveBtn", "ligaSlug", "competition", "temporada"]) {
    assert.match(html, new RegExp(`id="${id}"`), `${id} must exist in admin.html`);
  }
});

test("admin participant editor keeps Cartola ID internal", () => {
  const js = read("admin.js");
  const css = read("styles.css");
  assert.doesNotMatch(js, /cartola-id-in|ID Cartola|Cartola #/);
  assert.doesNotMatch(css, /cartola-id-in/);
});

test("admin Cartola search separates add and replace actions", () => {
  const js = read("admin.js");
  assert.match(js, /function addTeamFromSearch\(team\)/);
  assert.match(js, /function replaceTeamFromSearch\(team\)/);
  assert.match(js, /add-team-btn/);
  assert.match(js, /replace-team-btn/);
  assert.doesNotMatch(js, /Vincular em/);
});

test("admin assets use a cache-busting version after sync fixes", () => {
  const html = read("admin.html");
  assert.match(html, /styles\.css\?v=reserve-sync-fix/);
  assert.match(html, /admin\.js\?v=reserve-sync-fix/);
});

test("admin sync log reports teams without released Cartola points", () => {
  const js = read("admin.js");
  assert.match(js, /details\.skipped/);
  assert.match(js, /sem pontos/);
});

test("participant page exposes the IDs required by participant.js", () => {
  const html = read("participant.html");
  for (const id of ["profileApp", "profileAvatar", "profileRank", "profileName", "profileTeam", "profileTotal", "profileRound", "profileAverage", "profileBest", "profileBadges", "profileHistory", "shareProfileBtn", "shareProfileNote"]) {
    assert.match(html, new RegExp(`id="${id}"`), `${id} must exist in participant.html`);
  }
});

test("source files do not contain common mojibake markers", () => {
  const files = ["index.html", "admin.html", "participant.html", "landing.js", "admin.js", "participant.js", "README.md", "ROADMAP.md", "lib/db.js", "api/data.js", "prisma/schema.prisma"];
  for (const file of files) {
    assert.doesNotMatch(read(file), /Ã|Â|ð|�/, `${file} contains mojibake-looking text`);
  }
});
