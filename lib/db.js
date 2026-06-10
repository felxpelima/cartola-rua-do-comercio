import { prisma } from "./prisma.js";

const DEFAULT_STATE = {
  participants: [],
  config: {
    valorPorPessoa: 50,
    pct1: 50,
    pct2: 30,
    pct3: 20,
    titulo: "Cartola Rua do Comércio",
    subtitulo: "Copa do Mundo 2026",
  },
};

export async function getState() {
  const row = await prisma.estado.findUnique({ where: { id: 1 } });
  const d = row && row.data;
  if (!d) return DEFAULT_STATE;
  return {
    participants: Array.isArray(d.participants) ? d.participants : [],
    config: { ...DEFAULT_STATE.config, ...(d.config || {}) },
  };
}

export async function setState(state) {
  await prisma.estado.upsert({
    where: { id: 1 },
    update: { data: state },
    create: { id: 1, data: state },
  });
}
