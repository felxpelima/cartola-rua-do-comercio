const REDUCED = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const fmtBRL = (value) => (Number(value) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const fmtPts = (value) => (Number(value) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = (value) => String(value == null ? "" : value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));

function hashHue(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  return Math.abs(h) % 360;
}

function teamName(participant) {
  return participant.cartolaTeamName || participant.nome || "Time sem nome";
}

function ownerName(participant) {
  return participant.cartolaOwnerName || participant.nome || "Participante";
}

function avatarBg(nome) {
  const hue = hashHue(nome || "?");
  return `background:linear-gradient(150deg, hsl(${hue} 68% 56%), hsl(${(hue + 38) % 360} 72% 42%))`;
}

function monogram(nome) {
  const parts = String(nome || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  let result = parts[0][0];
  if (parts.length > 1) result += parts[parts.length - 1][0];
  return result.toUpperCase().slice(0, 2);
}

function avatarMarkup(participant, cls) {
  if (participant.escudoUrl) {
    return `<span class="${cls} image-avatar"><img src="${esc(participant.escudoUrl)}" alt="" loading="lazy" /></span>`;
  }
  const name = teamName(participant);
  return `<span class="${cls}" style="${avatarBg(name)}">${esc(monogram(name))}</span>`;
}

function profileHref(participant) {
  return `/participant?id=${encodeURIComponent(participant.id)}`;
}

function countUp(el, to, formatter, duration = 1100) {
  if (REDUCED) {
    el.textContent = formatter(to);
    return;
  }
  const start = performance.now();
  function frame(now) {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = formatter(to * eased);
    if (t < 1) requestAnimationFrame(frame);
    else el.textContent = formatter(to);
  }
  requestAnimationFrame(frame);
}

function deltaMarkup(delta) {
  const value = Number(delta) || 0;
  if (value > 0) return `<span class="delta up">↑ ${value}</span>`;
  if (value < 0) return `<span class="delta down">↓ ${Math.abs(value)}</span>`;
  return '<span class="delta flat">=</span>';
}

async function load() {
  try {
    const response = await fetch("/api/data", { cache: "no-store" });
    if (!response.ok) throw new Error("erro");
    render(await response.json());
  } catch (e) {
    document.getElementById("lista").innerHTML = '<div class="empty"><div class="e-ico">!</div><p>Não foi possível carregar os dados agora. Tente recarregar a página.</p></div>';
  }
}

let firstRender = true;

function renderPrizes(config, participants) {
  const count = participants.length;
  const entryValue = Number(config.valorPorPessoa) || 0;
  const total = count * entryValue;
  const percentages = [Number(config.pct1) || 0, Number(config.pct2) || 0, Number(config.pct3) || 0];
  const maxPct = Math.max(1, ...percentages);

  const totalEl = document.getElementById("total");
  if (firstRender) countUp(totalEl, total, fmtBRL);
  else totalEl.textContent = fmtBRL(total);
  document.getElementById("chipN").textContent = count;
  document.getElementById("chipValor").textContent = fmtBRL(entryValue);

  const labels = ["Campeão", "Vice", "Terceiro"];
  const prizesEl = document.getElementById("prizes");
  prizesEl.innerHTML = [0, 1, 2]
    .map(
      (index) => `
      <div class="prize-card glass m${index + 1}">
        <div class="blob"></div>
        <div class="prize-top">
          <div class="medal">${index + 1}</div>
          <div class="prize-place">${index + 1}º Lugar<small>${labels[index]}</small></div>
        </div>
        <div class="prize-value" data-val="${(total * percentages[index]) / 100}">${fmtBRL((total * percentages[index]) / 100)}</div>
        <div class="prize-foot">
          <span class="prize-pct">${percentages[index]}% do bolão</span>
          <span class="pct-bar"><i style="width:${(percentages[index] / maxPct) * 100}%"></i></span>
        </div>
      </div>`
    )
    .join("");
  if (firstRender) {
    prizesEl.querySelectorAll(".prize-value").forEach((el) => countUp(el, Number(el.dataset.val), fmtBRL));
  }
}

function renderRanking(participants) {
  const ranked = [...participants].sort((a, b) => (Number(b.pontos) || 0) - (Number(a.pontos) || 0));
  const podiumEl = document.getElementById("podium");
  const listEl = document.getElementById("lista");
  const maxPts = Math.max(1, ...ranked.map((participant) => Number(participant.pontos) || 0));

  if (participants.length === 0) {
    podiumEl.style.display = "none";
    podiumEl.innerHTML = "";
    listEl.innerHTML = '<div class="empty"><div class="e-ico">0</div><p>A classificação ainda não foi publicada.</p></div>';
    return;
  }

  const crownSVG =
    '<svg class="crown" viewBox="0 0 24 24"><defs><linearGradient id="cg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe9a6"/><stop offset="1" stop-color="#caa12f"/></linearGradient></defs><path d="M2 7l4.5 3.2L12 3l5.5 7.2L22 7l-2 11H4L2 7z" fill="url(#cg)" stroke="#8a6a18" stroke-width="0.6" stroke-linejoin="round"/></svg>';

  let restStart = 0;
  let rest = ranked;

  if (participants.length >= 3) {
    const order = [ranked[1], ranked[0], ranked[2]];
    const places = [2, 1, 3];
    const heights = [120, 158, 96];
    podiumEl.style.display = "flex";
    podiumEl.innerHTML = order
      .map((participant, index) => {
        const place = places[index];
        const first = place === 1;
        return `
        <div class="podium-col m${place} ${first ? "first" : ""}">
          ${first ? crownSVG : ""}
          <a class="pod-profile" href="${profileHref(participant)}">
            <div class="pod-avatar-wrap">
              ${avatarMarkup(participant, "pod-avatar")}
              <span class="pod-badge">${place}</span>
            </div>
            <div class="pod-name">${esc(teamName(participant))}</div>
            <div class="pod-meta">${esc(ownerName(participant))}</div>
          </a>
          <div class="pod-pts">${fmtPts(participant.pontos)}<span>pts</span></div>
          <div class="pod-block" style="height:${heights[index]}px;animation-delay:${index * 90}ms"><b>${place}</b></div>
        </div>`;
      })
      .join("");
    restStart = 3;
    rest = ranked.slice(3);
  } else {
    podiumEl.style.display = "none";
    podiumEl.innerHTML = "";
  }

  listEl.innerHTML = rest
    .map((participant, index) => {
      const rank = restStart + index + 1;
      const width = ((Number(participant.pontos) || 0) / maxPts) * 100;
      return `
      <div class="row" style="animation-delay:${index * 45}ms">
        <span class="rank">${rank}</span>
        <a class="row-profile" href="${profileHref(participant)}">
          ${avatarMarkup(participant, "row-avatar")}
          <div class="row-mid">
            <div class="name-line">
              <span class="name">${esc(teamName(participant))}</span>
              ${deltaMarkup(participant.delta)}
            </div>
            <div class="row-meta">${esc(ownerName(participant))}</div>
            <div class="bar"><i style="width:${width}%"></i></div>
          </div>
        </a>
        <div class="pts">${fmtPts(participant.pontos)}<span>pts</span></div>
      </div>`;
    })
    .join("");
}

function renderRoundRanking(roundRanking) {
  const el = document.getElementById("roundList");
  const list = Array.isArray(roundRanking) ? roundRanking : [];
  if (!list.length) {
    el.innerHTML = '<div class="empty compact"><p>A rodada ainda não tem pontuação sincronizada.</p></div>';
    return;
  }

  el.innerHTML = list
    .slice(0, 8)
    .map(
      (participant, index) => `
      <div class="row round-row" style="animation-delay:${index * 45}ms">
        <span class="rank">${participant.roundRank || index + 1}</span>
        <a class="row-profile" href="${profileHref(participant)}">
          ${avatarMarkup(participant, "row-avatar")}
          <div class="row-mid">
            <div class="name-line"><span class="name">${esc(teamName(participant))}</span></div>
            <div class="row-meta">${esc(ownerName(participant))}</div>
          </div>
        </a>
        <div class="pts">${fmtPts(participant.pontos)}<span>rodada</span></div>
      </div>`
    )
    .join("");
}

function renderBadges(participants) {
  const el = document.getElementById("badgeList");
  const badges = [];
  for (const participant of participants) {
    for (const badge of participant.badges || []) {
      if (badge.code === "manual") continue;
      badges.push({ participant: teamName(participant), label: badge.label, code: badge.code });
    }
  }

  if (!badges.length) {
    el.innerHTML = '<div class="empty compact"><p>As conquistas aparecem depois das primeiras rodadas.</p></div>';
    return;
  }

  el.innerHTML = badges
    .slice(0, 9)
    .map(
      (badge) => `
      <div class="badge-card">
        <span>${esc(badge.label)}</span>
        <strong>${esc(badge.participant)}</strong>
      </div>`
    )
    .join("");
}

function render(state) {
  const config = state.config || {};
  const participants = Array.isArray(state.participants) ? state.participants : [];

  document.getElementById("titulo").textContent = config.titulo || "Liga Rua do Comércio";
  document.getElementById("subtitulo").textContent = config.subtitulo || "Copa do Mundo 2026";
  document.getElementById("footer").innerHTML = 'Atualizado pelo organizador <span class="dot">•</span> ' + esc(config.titulo || "");
  document.title = (config.titulo || "Liga Rua do Comércio") + " · " + (config.subtitulo || "");

  renderPrizes(config, participants);
  renderRanking(participants);
  renderRoundRanking(state.roundRanking);
  renderBadges(participants);

  firstRender = false;
}

load();
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) load();
});
setInterval(load, 60000);
