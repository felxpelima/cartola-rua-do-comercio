import { cartolaFetch } from "../lib/cartola.js";

const competition = process.argv.includes("--brasileirao") ? "brasileirao" : "copa";
const endpoints = ["/mercado/status", "/rodadas", "/partidas"];

console.log(`Cartola probe: ${competition}`);

for (const endpoint of endpoints) {
  const started = Date.now();
  try {
    const result = await cartolaFetch(endpoint, { competition, timeoutMs: 8000 });
    const data = result.data;
    const summary = Array.isArray(data)
      ? `${data.length} itens`
      : data && typeof data === "object"
        ? Object.keys(data).slice(0, 8).join(", ")
        : "sem corpo";
    console.log(`ok ${endpoint} ${result.status} ${Date.now() - started}ms ${summary}`);
  } catch (e) {
    console.log(`erro ${endpoint} ${e.status || "timeout"} ${Date.now() - started}ms ${e.message}`);
  }
}
