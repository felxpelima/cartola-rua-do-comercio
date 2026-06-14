import { spawnSync } from "node:child_process";

const env = { ...process.env };
if (!env.DATABASE_URL) {
  env.DATABASE_URL = "postgresql://user:pass@localhost:5432/cartola";
}

const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(npx, ["prisma", "validate"], {
  env,
  stdio: "inherit",
});

process.exit(result.status || 0);
