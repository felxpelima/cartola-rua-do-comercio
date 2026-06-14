import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { after, before, test } from "node:test";

const fixture = {
  config: {
    titulo: "Liga Rua do Comércio",
    subtitulo: "Copa do Mundo 2026",
    valorPorPessoa: 50,
    pct1: 50,
    pct2: 30,
    pct3: 20,
  },
  currentRound: { id: 1, nome: "Rodada 1" },
  lastSync: { status: "success", finishedAt: "2026-06-10T18:00:00.000Z" },
  participants: [{ id: "p1", nome: "UGO Comércio FC", pontos: 92.13, badges: [{ label: "Líder da Rua" }] }],
  roundRanking: [{ id: "p1", nome: "UGO Comércio FC", pontos: 92.13, roundRank: 1 }],
};

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

let server;
let baseUrl;

before(async () => {
  server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    if (url.pathname === "/api/data") {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(fixture));
      return;
    }

    const file = url.pathname === "/" ? "index.html" : url.pathname === "/admin" ? "admin.html" : url.pathname === "/participant" ? "participant.html" : url.pathname.slice(1);
    try {
      const data = await readFile(join(process.cwd(), file));
      res.writeHead(200, { "Content-Type": mime[extname(file)] || "application/octet-stream" });
      res.end(data);
    } catch (e) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("not found");
    }
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
});

test("fixture server serves public/admin shells and data API", async () => {
  const [home, admin, profile, data, css] = await Promise.all([
    fetch(`${baseUrl}/`),
    fetch(`${baseUrl}/admin`),
    fetch(`${baseUrl}/participant?id=p1`),
    fetch(`${baseUrl}/api/data`),
    fetch(`${baseUrl}/styles.css`),
  ]);

  assert.equal(home.status, 200);
  assert.match(await home.text(), /Liga Rua do Comércio/);

  assert.equal(admin.status, 200);
  assert.match(await admin.text(), /Painel do Organizador/);

  assert.equal(profile.status, 200);
  assert.match(await profile.text(), /Perfil/);

  assert.equal(data.status, 200);
  assert.equal((await data.json()).participants[0].nome, "UGO Comércio FC");

  assert.equal(css.status, 200);
  assert.match(await css.text(), /\.admin-status-grid/);
});
