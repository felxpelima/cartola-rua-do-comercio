import assert from "node:assert/strict";
import { test } from "node:test";
import cartolaSearchHandler from "../api/cartola-search.js";
import dataHandler from "../api/data.js";
import syncCartolaHandler from "../api/sync-cartola.js";

function mockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(key, value) {
      this.headers[key] = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

test("protected admin APIs reject requests without token", async () => {
  const dataRes = mockRes();
  await dataHandler({ method: "POST", headers: {}, body: { participants: [] } }, dataRes);
  assert.equal(dataRes.statusCode, 401);

  const searchRes = mockRes();
  await cartolaSearchHandler({ method: "GET", headers: {}, query: { q: "ugo" } }, searchRes);
  assert.equal(searchRes.statusCode, 401);

  const previousCronSecret = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "test-secret";
  const syncRes = mockRes();
  await syncCartolaHandler({ method: "POST", headers: {}, query: {}, body: {} }, syncRes);
  assert.equal(syncRes.statusCode, 401);
  if (previousCronSecret == null) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = previousCronSecret;
});

test("admin APIs return 405 for unsupported methods", async () => {
  const searchRes = mockRes();
  await cartolaSearchHandler({ method: "POST", headers: {}, query: {} }, searchRes);
  assert.equal(searchRes.statusCode, 405);

  const dataRes = mockRes();
  await dataHandler({ method: "PUT", headers: {}, query: {} }, dataRes);
  assert.equal(dataRes.statusCode, 405);
});
