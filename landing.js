const REDUCED = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const fmtBRL = (v) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const fmtBRLc = (v) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtPts = (v) => (Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function hashHue(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  return Math.abs(h) % 360;
}
function avatarBg(nome) {
  const hue = hashHue(nome || "?");
  return `background:linear-gradient(150deg, hsl(${hue} 68% 56%), hsl(${(hue + 38) % 360} 72% 42%))`;
}
function monogram(nome) {
  const parts = String(nome || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  let m = parts[0][0];
  if (parts.length > 1) m += parts[parts.length - 1][0];
  return m.toUpperCase().slice(0, 2);
}

// Animação de contagem
function countUp(el, to, fmt, dur = 1100) {
  if (REDUCED) { el.textContent = fmt(to); return; }
  const start = performance.now();
  function frame(now) {
    const t = Math.min(1, (now - start) / dur);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = fmt(to * eased);
    if (t < 1) requestAnimationFrame(frame);
    else el.textContent = fmt(to);
  }
  requestAnimationFrame(frame);
}

async function load() {
  try {
    const r = await fetch("/api/data", { cache: "no-store" });
    if (!r.ok) throw new Error("erro");
    render(await r.json());
  } catch (e) {
    document.getElementById("lista").innerHTML = '<div class="empty"><div class="e-ico">📡</div><p>Não foi possível carregar os dados agora. Tente recarregar a página.</p></div>';
  }
}

let firstRender = true;

function render(s) {
  const cfg = s.config || {};
  const participants = Array.isArray(s.participants) ? s.participants : [];

  document.getElementById("titulo").textContent = cfg.titulo || "Cartola Rua do Comércio";
  document.getElementById("subtitulo").textContent = cfg.subtitulo || "Copa do Mundo 2026";
  document.getElementById("footer").innerHTML = 'Atualizado pelo organizador <span class="dot">•</span> ' + esc(cfg.titulo || "");
  document.title = (cfg.titulo || "Cartola") + " · " + (cfg.subtitulo || "");

  const n = participants.length;
  const valor = Number(cfg.valorPorPessoa) || 0;
  const total = n * valor;
  const pcts = [Number(cfg.pct1) || 0, Number(cfg.pct2) || 0, Number(cfg.pct3) || 0];
  const maxPct = Math.max(1, ...pcts);

  // Total + chips
  const totalEl = document.getElementById("total");
  if (firstRender) countUp(totalEl, total, fmtBRL); else totalEl.textContent = fmtBRL(total);
  document.getElementById("chipN").textContent = n;
  document.getElementById("chipValor").textContent = fmtBRL(valor);

  // Prêmios
  const labels = ["Campeão", "Vice", "Terceiro"];
  const prizesEl = document.getElementById("prizes");
  prizesEl.innerHTML = [0, 1, 2]
    .map(
      (i) => `
      <div class="prize-card glass m${i + 1}">
        <div class="blob"></div>
        <div class="prize-top">
          <div class="medal">${i + 1}</div>
          <div class="prize-place">${i + 1}º Lugar<small>${labels[i]}</small></div>
        </div>
        <div class="prize-value" data-val="${(total * pcts[i]) / 100}">${fmtBRL((total * pcts[i]) / 100)}</div>
        <div class="prize-foot">
          <span class="prize-pct">${pcts[i]}% do bolão</span>
          <span class="pct-bar"><i style="width:${(pcts[i] / maxPct) * 100}%"></i></span>
        </div>
      </div>`
    )
    .join("");
  if (firstRender) {
    prizesEl.querySelectorAll(".prize-value").forEach((el) => countUp(el, Number(el.dataset.val), fmtBRL));
  }

  // Ranking
  const ranked = [...participants].sort((a, b) => (Number(b.pontos) || 0) - (Number(a.pontos) || 0));
  const podiumEl = document.getElementById("podium");
  const listaEl = document.getElementById("lista");
  const maxPts = Math.max(1, ...ranked.map((p) => Number(p.pontos) || 0));

  if (n === 0) {
    podiumEl.style.display = "none";
    listaEl.innerHTML = '<div class="empty"><div class="e-ico">⚽</div><p>A classificação ainda não foi publicada.</p></div>';
    firstRender = false;
    return;
  }

  const crownSVG =
    '<svg class="crown" viewBox="0 0 24 24"><defs><linearGradient id="cg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe9a6"/><stop offset="1" stop-color="#caa12f"/></linearGradient></defs><path d="M2 7l4.5 3.2L12 3l5.5 7.2L22 7l-2 11H4L2 7z" fill="url(#cg)" stroke="#8a6a18" stroke-width="0.6" stroke-linejoin="round"/></svg>';

  let restStart = 0;
  let rest = ranked;

  if (n >= 3) {
    const order = [ranked[1], ranked[0], ranked[2]];
    const place = [2, 1, 3];
    const heights = [120, 158, 96];
    podiumEl.style.display = "flex";
    podiumEl.innerHTML = order
      .map((p, idx) => {
        const pl = place[idx];
        const first = pl === 1;
        return `
        <div class="podium-col m${pl} ${first ? "first" : ""}">
          ${first ? crownSVG : ""}
          <div class="pod-avatar" style="${avatarBg(p.nome)}">${esc(monogram(p.nome))}<span class="pod-badge">${pl}</span></div>
          <div class="pod-name">${esc(p.nome)}</div>
          <div class="pod-pts">${fmtPts(p.pontos)}<span>pts</span></div>
          <div class="pod-block" style="height:${heights[idx]}px;animation-delay:${idx * 90}ms"><b>${pl}</b></div>
        </div>`;
      })
      .join("");
    restStart = 3;
    rest = ranked.slice(3);
  } else {
    podiumEl.style.display = "none";
    podiumEl.innerHTML = "";
  }

  listaEl.innerHTML = rest
    .map((p, i) => {
      const rank = restStart + i + 1;
      const w = ((Number(p.pontos) || 0) / maxPts) * 100;
      return `
      <div class="row" style="animation-delay:${i * 45}ms">
        <span class="rank">${rank}</span>
        <span class="row-avatar" style="${avatarBg(p.nome)}">${esc(monogram(p.nome))}</span>
        <div class="row-mid">
          <div class="name">${esc(p.nome)}</div>
          <div class="bar"><i style="width:${w}%"></i></div>
        </div>
        <div class="pts">${fmtPts(p.pontos)}<span>pts</span></div>
      </div>`;
    })
    .join("");

  firstRender = false;
}

load();
document.addEventListener("visibilitychange", () => { if (!document.hidden) load(); });
setInterval(load, 60000);
