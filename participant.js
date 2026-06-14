const fmtPts = (v) => (Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const $ = (id) => document.getElementById(id);

let currentParticipant = null;
let currentState = null;

function hashHue(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  return Math.abs(h) % 360;
}

function avatarBg(nome) {
  const hue = hashHue(nome || "?");
  return `linear-gradient(150deg, hsl(${hue} 68% 56%), hsl(${(hue + 38) % 360} 72% 42%))`;
}

function monogram(nome) {
  const parts = String(nome || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  let m = parts[0][0];
  if (parts.length > 1) m += parts[parts.length - 1][0];
  return m.toUpperCase().slice(0, 2);
}

function teamName(participant) {
  return participant.cartolaTeamName || participant.nome || "Time sem nome";
}

function ownerName(participant) {
  return participant.cartolaOwnerName || participant.nome || "Participante";
}

function scoreHistory(state, participant) {
  const rows = Array.isArray(state.history) ? state.history : [];
  const item = rows.find((row) => row.participantId === participant.id);
  if (item && Array.isArray(item.scores)) return item.scores;
  if (participant.currentRoundPoints != null && state.currentRound) {
    return [{ roundId: state.currentRound.id, points: participant.currentRoundPoints, source: participant.source }];
  }
  return [];
}

function renderAvatar(participant) {
  const avatar = $("profileAvatar");
  if (participant.escudoUrl) {
    avatar.classList.add("image-avatar");
    avatar.innerHTML = `<img src="${esc(participant.escudoUrl)}" alt="" loading="lazy" />`;
  } else {
    avatar.classList.remove("image-avatar");
    avatar.style.background = avatarBg(teamName(participant));
    avatar.textContent = monogram(teamName(participant));
  }
}

function renderBadges(participant) {
  const badges = Array.isArray(participant.badges) ? participant.badges : [];
  if (!badges.length) {
    $("profileBadges").innerHTML = '<div class="empty compact"><p>Sem conquistas publicadas ainda.</p></div>';
    return;
  }

  $("profileBadges").innerHTML = badges
    .map(
      (badge) => `
      <div class="badge-card">
        <span>${esc(badge.label)}</span>
        <strong>${esc(teamName(participant))}</strong>
      </div>`
    )
    .join("");
}

function renderHistory(state, participant) {
  const history = scoreHistory(state, participant);
  if (!history.length) {
    $("profileHistory").innerHTML = '<div class="empty compact"><p>Histórico aparece depois da primeira sincronização.</p></div>';
    return;
  }

  $("profileHistory").innerHTML = history
    .map(
      (score) => `
      <div class="history-row">
        <span>Rodada ${esc(score.roundId)}</span>
        <strong>${fmtPts(score.points)} pts</strong>
      </div>`
    )
    .join("");
}

function render(state) {
  const participants = Array.isArray(state.participants) ? state.participants : [];
  const requestedId = new URLSearchParams(location.search).get("id");
  const participant = participants.find((p) => p.id === requestedId) || participants[0];
  currentParticipant = participant;
  currentState = state;

  const cfg = state.config || {};
  $("profileFooter").textContent = cfg.titulo || "Liga Rua do Comércio";
  document.title = participant ? `${teamName(participant)} · ${cfg.titulo || "Liga Rua do Comércio"}` : cfg.titulo || "Liga Rua do Comércio";

  if (!participant) {
    $("profileApp").innerHTML = '<div class="empty"><p>Nenhum participante publicado ainda.</p></div>';
    return;
  }

  renderAvatar(participant);
  $("profileRank").textContent = participant.rank ? `#${participant.rank}` : "#";
  $("profileName").textContent = teamName(participant);
  $("profileTeam").textContent = ownerName(participant);
  $("profileTotal").textContent = fmtPts(participant.totalPoints ?? participant.pontos);
  $("profileRound").textContent = participant.currentRoundPoints == null ? "-" : fmtPts(participant.currentRoundPoints);
  $("profileAverage").textContent = participant.average == null ? "-" : fmtPts(participant.average);
  $("profileBest").textContent = participant.bestRound == null ? "-" : fmtPts(participant.bestRound);
  renderBadges(participant);
  renderHistory(state, participant);
}

async function load() {
  try {
    const r = await fetch("/api/data", { cache: "no-store" });
    if (!r.ok) throw new Error("Erro ao carregar");
    render(await r.json());
  } catch (e) {
    $("profileApp").innerHTML = '<div class="empty"><p>Não foi possível carregar o perfil agora.</p></div>';
  }
}

async function shareProfile() {
  if (!currentParticipant || !currentState) return;
  const cfg = currentState.config || {};
  const text = `${teamName(currentParticipant)} (${ownerName(currentParticipant)}) na ${cfg.titulo || "Liga Rua do Comércio"}: #${currentParticipant.rank || "-"} com ${fmtPts(currentParticipant.pontos)} pts.`;
  try {
    await navigator.clipboard.writeText(text);
    $("shareProfileNote").textContent = "Resumo copiado.";
  } catch (e) {
    $("shareProfileNote").textContent = text;
  }
}

$("shareProfileBtn").addEventListener("click", shareProfile);
load();
