const TOKEN_KEY = "cartola_admin_token";

let state = { participants: [], config: {}, lastSync: null, currentRound: null, automation: null, roundRanking: [] };
let pendingDeleteId = null;
let searchCache = [];
let selectedParticipantId = null;
let editedPointIds = new Set();

const $ = (id) => document.getElementById(id);
const getToken = () => localStorage.getItem(TOKEN_KEY);
const setToken = (token) => localStorage.setItem(TOKEN_KEY, token);
const clearToken = () => localStorage.removeItem(TOKEN_KEY);
const uid = () => "p" + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
const esc = (value) => String(value == null ? "" : value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

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

function fmtDate(value) {
  if (!value) return "Ainda não sincronizado";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Ainda não sincronizado";
  return date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function authHeaders(extra = {}) {
  return { ...extra, Authorization: "Bearer " + getToken() };
}

let toastTimer = null;
function toast(message, type = "ok") {
  const el = $("toast");
  el.textContent = message;
  el.className = "toast show " + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = "toast"), 2800);
}

function avatarMarkup(participant, cls = "pr-avatar") {
  if (participant.escudoUrl) {
    return `<span class="${cls} image-avatar"><img src="${esc(participant.escudoUrl)}" alt="" loading="lazy" /></span>`;
  }
  return `<span class="${cls}" style="background:${avatarBg(displayTeamName(participant))}">${esc(monogram(displayTeamName(participant)))}</span>`;
}

function displayTeamName(participant) {
  return participant.cartolaTeamName || participant.nome || "Time sem nome";
}

function displayOwnerName(participant) {
  return participant.cartolaOwnerName || participant.nome || "Participante";
}

function playedLabel(participant) {
  const played = Number(participant.playedCount);
  const total = Number(participant.lineupCount);
  if (!Number.isFinite(played) || !Number.isFinite(total) || total <= 0) return "";
  return `${played}/${total} jogaram`;
}

function currentLinkTarget() {
  return state.participants.find((participant) => participant.id === selectedParticipantId) || null;
}

async function login() {
  const password = $("pwd").value;
  $("loginErr").style.display = "none";
  $("loginBtn").disabled = true;

  try {
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    if (!response.ok) {
      $("loginErr").textContent = "Senha incorreta.";
      $("loginErr").style.display = "block";
      return;
    }

    const { token } = await response.json();
    setToken(token);
    await enterPanel();
  } catch (e) {
    $("loginErr").textContent = "Erro de conexão. Tente de novo.";
    $("loginErr").style.display = "block";
  } finally {
    $("loginBtn").disabled = false;
  }
}

function logout() {
  clearToken();
  $("panelView").style.display = "none";
  $("loginView").style.display = "flex";
  $("pwd").value = "";
}

async function enterPanel() {
  try {
    const response = await fetch("/api/data", { cache: "no-store" });
    const data = await response.json();
    state = {
      participants: Array.isArray(data.participants) ? data.participants : [],
      config: data.config || {},
      lastSync: data.lastSync || null,
      currentRound: data.currentRound || null,
      automation: data.automation || null,
      roundRanking: Array.isArray(data.roundRanking) ? data.roundRanking : [],
    };
  } catch (e) {
    state = { participants: [], config: {}, lastSync: null, currentRound: null, automation: null, roundRanking: [] };
  }

  if (selectedParticipantId && !state.participants.some((participant) => participant.id === selectedParticipantId)) {
    selectedParticipantId = null;
  }

  $("loginView").style.display = "none";
  $("panelView").style.display = "block";
  fillForm();
}

function fillForm() {
  const config = state.config || {};
  $("valor").value = config.valorPorPessoa ?? 50;
  $("pct1").value = config.pct1 ?? 50;
  $("pct2").value = config.pct2 ?? 30;
  $("pct3").value = config.pct3 ?? 20;
  $("titulo").value = config.titulo ?? "Liga Rua do Comércio";
  $("subtitulo").value = config.subtitulo ?? "Copa do Mundo 2026";
  $("ligaSlug").value = config.ligaSlug ?? "cartola-rua-do-comercio";
  $("competition").value = config.competition ?? "copa";
  $("temporada").value = config.temporada ?? 2026;
  $("adminSubtitle").textContent = config.titulo || "Liga Rua do Comércio";

  renderAutomationSummary();
  renderSyncLog();
  renderParticipants();
  updatePctNote();
}

function renderAutomationSummary() {
  const linked = state.participants.filter((participant) => participant.cartolaTimeId).length;
  $("roundNote").textContent = state.currentRound ? state.currentRound.nome || `Rodada ${state.currentRound.id}` : "Aguardando";
  $("syncNote").textContent = state.lastSync ? `${fmtDate(state.lastSync.finishedAt || state.lastSync.startedAt)} · ${state.lastSync.status}` : "Ainda não sincronizado";
  $("sourceNote").textContent = linked ? `${linked}/${state.participants.length} times vinculados` : "Manual";
}

function renderSyncLog() {
  const el = $("syncLog");
  if (!el) return;

  const sync = state.lastSync;
  if (!sync) {
    el.innerHTML = '<div class="sync-log-empty">Nenhuma sincronização registrada.</div>';
    return;
  }

  const details = sync.details || {};
  const errors = Array.isArray(details.errors) ? details.errors : [];
  const skipped = Array.isArray(details.skipped) ? details.skipped : [];
  const updated = Number(sync.updatedCount) || 0;
  const errorCount = Number(sync.errorCount) || errors.length || 0;
  const skippedCount = skipped.length;
  const message = sync.message || "Sincronização registrada.";

  el.innerHTML = `
    <div class="sync-log-head">
      <strong>${esc(message)}</strong>
      <span>${updated} atualizados · ${skippedCount} sem pontos · ${errorCount} erros</span>
    </div>
    ${
      errors.length
        ? `<div class="sync-errors">${errors
            .map((err) => `<div><b>#${esc(err.cartolaTimeId || "-")}</b><span>${esc(err.error || "Erro ao consultar")}</span></div>`)
            .join("")}</div>`
        : skipped.length
          ? `<div class="sync-errors">${skipped
              .map((item) => `<div><b>#${esc(item.cartolaTimeId || "-")}</b><span>${esc(item.error || "Cartola ainda sem pontos")}</span></div>`)
              .join("")}</div>`
          : '<div class="sync-log-ok">Nenhum erro individual na última execução.</div>'
    }`;
}

function updatePctNote() {
  const sum = (Number($("pct1").value) || 0) + (Number($("pct2").value) || 0) + (Number($("pct3").value) || 0);
  const el = $("pctNote");
  el.textContent = "As porcentagens somam " + sum + "%" + (sum === 100 ? " ok" : " (o ideal é 100%)");
  el.className = "note" + (sum === 100 ? " muted" : " warn");
}

function renderParticipants() {
  const wrap = $("participants");
  if (state.participants.length === 0) {
    wrap.innerHTML = '<div class="muted" style="font-size:13px;padding:6px 2px">Nenhum participante. Adicione manualmente ou busque um time no Cartola.</div>';
    return;
  }

  wrap.innerHTML = state.participants
    .map((participant) => {
      const team = displayTeamName(participant);
      const owner = displayOwnerName(participant);
      const progress = playedLabel(participant);
      const ownerMeta = participant.cartolaTimeId ? owner + (progress ? ` · ${progress}` : "") : "Sem vínculo Cartola";
      const points = participant.currentRoundPoints ?? participant.pontos ?? participant.manualPoints ?? 0;
      const linkLabel = participant.cartolaTimeId ? "Trocar" : "Vincular";
      const activeClass = participant.id === selectedParticipantId ? " link-target-active" : "";

      return `
        <div class="participant-row participant-row-pro${activeClass}" data-id="${esc(participant.id)}">
          ${avatarMarkup(participant)}
          <div class="participant-main">
            <input class="nome-in" type="text" placeholder="Nome no ranking" value="${esc(participant.nome)}" maxlength="80" />
            <div class="team-meta"><b>${esc(team)}</b> <span>${esc(ownerMeta)}</span></div>
          </div>
          <input class="pts-in" type="number" step="0.01" placeholder="Pts manual" value="${points}" />
          <button class="mini-btn target-btn" type="button" title="Buscar e vincular time Cartola">${linkLabel}</button>
          ${participant.cartolaTimeId ? '<button class="mini-btn unlink-btn" type="button" title="Remover vínculo Cartola">Limpar</button>' : ""}
          <button class="icon-btn" type="button" title="Remover" aria-label="Remover participante">×</button>
        </div>`;
    })
    .join("");

  wrap.querySelectorAll(".participant-row").forEach((row) => {
    const id = row.getAttribute("data-id");
    const avatar = row.querySelector(".pr-avatar");

    row.querySelector(".nome-in").addEventListener("input", (event) => {
      const participant = state.participants.find((item) => item.id === id);
      if (!participant) return;
      participant.nome = event.target.value;
      if (avatar && !avatar.classList.contains("image-avatar")) {
        avatar.style.background = avatarBg(displayTeamName(participant));
        avatar.textContent = monogram(displayTeamName(participant));
      }
    });

    row.querySelector(".pts-in").addEventListener("input", (event) => {
      const participant = state.participants.find((item) => item.id === id);
      if (!participant) return;
      const value = event.target.value === "" ? 0 : parseFloat(event.target.value) || 0;
      editedPointIds.add(id);
      participant.manualPoints = value;
      participant.currentRoundPoints = value;
      participant.pontos = value;
    });

    row.querySelector(".target-btn").addEventListener("click", () => selectParticipantForLink(id));
    const unlinkBtn = row.querySelector(".unlink-btn");
    if (unlinkBtn) unlinkBtn.addEventListener("click", () => unlinkParticipant(id));
    row.querySelector(".icon-btn").addEventListener("click", () => openDeleteConfirm(id));
  });
}

function addParticipant() {
  const participant = { id: uid(), nome: "", pontos: 0, manualPoints: 0, cartolaTimeId: null };
  state.participants.push(participant);
  selectedParticipantId = null;
  renderParticipants();
  renderAutomationSummary();
  const inputs = $("participants").querySelectorAll(".nome-in");
  if (inputs.length) inputs[inputs.length - 1].focus();
}

function selectParticipantForLink(id) {
  const participant = state.participants.find((item) => item.id === id);
  if (!participant) return;
  selectedParticipantId = id;
  $("teamSearch").value = participant.cartolaTeamName || participant.nome || "";
  $("teamSearch").focus();
  renderParticipants();
  renderSearchResults();
  toast(`Busque o time e clique em Trocar para atualizar ${participant.nome || "este participante"}.`, "ok");
}

function unlinkParticipant(id) {
  const participant = state.participants.find((item) => item.id === id);
  if (!participant) return;
  participant.cartolaTimeId = null;
  participant.cartolaSlug = null;
  participant.cartolaTeamName = null;
  participant.cartolaOwnerName = null;
  participant.escudoUrl = null;
  if (selectedParticipantId === id) selectedParticipantId = null;
  renderParticipants();
  renderAutomationSummary();
  toast("Vínculo Cartola removido. Clique em salvar para publicar.", "ok");
}

function participantName(id) {
  const participant = state.participants.find((item) => item.id === id);
  return ((participant && participant.nome) || participant?.cartolaTeamName || "").trim() || "este participante";
}

function openDeleteConfirm(id) {
  pendingDeleteId = id;
  $("confirmName").textContent = participantName(id);
  $("confirmDelete").classList.add("show");
  $("confirmDelete").setAttribute("aria-hidden", "false");
  $("confirmCancelBtn").focus();
}

function closeDeleteConfirm() {
  pendingDeleteId = null;
  $("confirmDelete").classList.remove("show");
  $("confirmDelete").setAttribute("aria-hidden", "true");
}

function confirmDeleteParticipant() {
  if (!pendingDeleteId) {
    closeDeleteConfirm();
    return;
  }
  const removedName = participantName(pendingDeleteId);
  state.participants = state.participants.filter((item) => item.id !== pendingDeleteId);
  if (selectedParticipantId === pendingDeleteId) selectedParticipantId = null;
  closeDeleteConfirm();
  renderParticipants();
  renderAutomationSummary();
  toast(removedName + " removido. Clique em salvar para publicar.", "ok");
}

function competitionValue() {
  return $("competition").value.trim() === "brasileirao" ? "brasileirao" : "copa";
}

async function searchTeams() {
  const query = $("teamSearch").value.trim();
  const box = $("teamResults");
  if (query.length < 2) {
    box.innerHTML = '<div class="muted">Digite pelo menos 2 caracteres.</div>';
    return;
  }

  $("teamSearchBtn").disabled = true;
  $("teamSearchBtn").textContent = "Buscando...";
  box.innerHTML = '<div class="muted">Consultando Cartola...</div>';

  try {
    const response = await fetch(`/api/cartola-search?q=${encodeURIComponent(query)}&competition=${encodeURIComponent(competitionValue())}`, {
      headers: authHeaders(),
      cache: "no-store",
    });

    if (response.status === 401) {
      toast("Sessão expirada. Faça login de novo.", "err");
      setTimeout(logout, 1200);
      return;
    }

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Erro ao buscar");
    searchCache = Array.isArray(data.teams) ? data.teams : [];
    renderSearchResults();
  } catch (e) {
    box.innerHTML = `<div class="muted">${esc(e.message || "Não foi possível buscar agora.")}</div>`;
  } finally {
    $("teamSearchBtn").disabled = false;
    $("teamSearchBtn").textContent = "Buscar";
  }
}

function renderSearchResults() {
  const box = $("teamResults");
  if (!searchCache.length) {
    box.innerHTML = "";
    return;
  }

  const target = currentLinkTarget();
  box.innerHTML = searchCache
    .map((team, index) => {
      const existing = state.participants.find((participant) => Number(participant.cartolaTimeId) === Number(team.timeId));
      const canReplace = target && (!existing || existing.id === target.id);
      const replaceLabel = existing && target && existing.id === target.id ? "Atualizar" : "Trocar";
      return `
        <div class="team-result" data-index="${index}">
          ${team.escudoUrl ? `<span class="team-crest"><img src="${esc(team.escudoUrl)}" alt="" loading="lazy" /></span>` : `<span class="team-crest">${esc(monogram(team.nome))}</span>`}
          <span class="team-result-main">
            <strong>${esc(team.nome)}</strong>
            <small>${esc(team.nomeCartola || "Cartoleiro")} · #${esc(team.timeId)}</small>
          </span>
          <span class="team-result-actions">
            <button class="mini-btn add-team-btn" type="button" ${existing ? "disabled" : ""}>${existing ? "Já vinculado" : "Adicionar"}</button>
            ${target ? `<button class="mini-btn replace-team-btn" type="button" ${canReplace ? "" : "disabled"}>${replaceLabel}</button>` : ""}
          </span>
        </div>`;
    })
    .join("");

  box.querySelectorAll(".team-result").forEach((button) => {
    const team = searchCache[Number(button.dataset.index)];
    button.querySelector(".add-team-btn").addEventListener("click", () => addTeamFromSearch(team));
    const replaceButton = button.querySelector(".replace-team-btn");
    if (replaceButton) replaceButton.addEventListener("click", () => replaceTeamFromSearch(team));
  });
}

function addTeamFromSearch(team) {
  if (!team || !team.timeId) return;

  const existing = state.participants.find((participant) => Number(participant.cartolaTimeId) === Number(team.timeId));
  selectedParticipantId = null;

  if (existing) {
    renderParticipants();
    renderSearchResults();
    toast(`Esse time já está vinculado a ${existing.nome || existing.cartolaTeamName || "este participante"}.`, "ok");
    return;
  }

  const participant = { id: uid(), nome: team.nomeCartola || team.nome, manualPoints: 0, pontos: 0 };
  state.participants.push(participant);

  linkTeamToParticipant(participant, team);
  renderParticipants();
  renderAutomationSummary();
  renderSearchResults();
  toast(`${team.nome} vinculado a ${displayOwnerName(participant)}. Salve para publicar.`, "ok");
}

function replaceTeamFromSearch(team) {
  if (!team || !team.timeId) return;

  const target = currentLinkTarget();
  if (!target) {
    renderSearchResults();
    toast("Escolha um participante antes de trocar o time.", "err");
    return;
  }

  const existing = state.participants.find((participant) => Number(participant.cartolaTimeId) === Number(team.timeId));
  if (existing && existing.id !== target.id) {
    toast(`Esse time já está vinculado a ${existing.nome || existing.cartolaTeamName || "outro participante"}.`, "err");
    return;
  }

  linkTeamToParticipant(target, team);
  selectedParticipantId = null;
  renderParticipants();
  renderAutomationSummary();
  renderSearchResults();
  toast(`${team.nome} vinculado a ${displayOwnerName(target)}. Salve para publicar.`, "ok");
}

function linkTeamToParticipant(participant, team) {
  participant.nome = team.nomeCartola || participant.nome || team.nome;
  participant.cartolaTimeId = team.timeId;
  participant.cartolaSlug = team.slug;
  participant.cartolaTeamName = team.nome;
  participant.cartolaOwnerName = team.nomeCartola;
  participant.escudoUrl = team.escudoUrl;
}

async function syncCartola() {
  $("syncBtn").disabled = true;
  $("syncBtn").textContent = "Sincronizando...";

  try {
    const response = await fetch(`/api/sync-cartola?competition=${encodeURIComponent(competitionValue())}`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({}),
    });
    const data = await response.json();

    if (response.status === 401) {
      toast("Sessão expirada. Faça login de novo.", "err");
      setTimeout(logout, 1200);
      return;
    }

    if (!response.ok) throw new Error(data.detail || data.error || "Erro ao sincronizar");
    toast((data.sync && data.sync.message) || "Rodada sincronizada.", "ok");
    await enterPanel();
  } catch (e) {
    toast(e.message || "Não foi possível sincronizar agora.", "err");
  } finally {
    $("syncBtn").disabled = false;
    $("syncBtn").textContent = "Sincronizar rodada";
  }
}

async function save() {
  const participantPayload = state.participants.map((participant) => {
    const pointsWereEdited = editedPointIds.has(participant.id);
    const totalPoints = pointsWereEdited
      ? Number(participant.manualPoints) || 0
      : Number(participant.pontos ?? participant.currentRoundPoints ?? participant.manualPoints) || 0;
    const roundPoints = pointsWereEdited
      ? Number(participant.manualPoints) || 0
      : participant.currentRoundPoints == null
        ? null
        : Number(participant.currentRoundPoints) || 0;

    return {
      id: participant.id,
      nome: (participant.nome || participant.cartolaOwnerName || participant.cartolaTeamName || "").trim(),
      apelido: participant.apelido || null,
      pontos: totalPoints,
      manualPoints: pointsWereEdited || !participant.cartolaTimeId ? Number(participant.manualPoints ?? totalPoints) || 0 : Number(participant.manualPoints) || 0,
      currentRoundPoints: roundPoints,
      manualOverride: pointsWereEdited || !participant.cartolaTimeId,
      cartolaTimeId: participant.cartolaTimeId || null,
      cartolaSlug: participant.cartolaSlug || null,
      cartolaTeamName: participant.cartolaTeamName || null,
      cartolaOwnerName: participant.cartolaOwnerName || null,
      escudoUrl: participant.escudoUrl || null,
    };
  });

  const payload = {
    participants: participantPayload,
    config: {
      valorPorPessoa: Number($("valor").value) || 0,
      pct1: Number($("pct1").value) || 0,
      pct2: Number($("pct2").value) || 0,
      pct3: Number($("pct3").value) || 0,
      titulo: $("titulo").value.trim() || "Liga Rua do Comércio",
      subtitulo: $("subtitulo").value.trim() || "Copa do Mundo 2026",
      ligaSlug: $("ligaSlug").value.trim() || "cartola-rua-do-comercio",
      competition: competitionValue(),
      temporada: Number($("temporada").value) || 2026,
    },
  };

  $("saveBtn").disabled = true;
  $("saveBtn").textContent = "Salvando...";

  try {
    const response = await fetch("/api/data", {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });

    if (response.status === 401) {
      toast("Sessão expirada. Faça login de novo.", "err");
      setTimeout(logout, 1200);
      return;
    }

    if (!response.ok) throw new Error("erro");
    editedPointIds = new Set();
    toast("Publicado. A página pública já pode ler a atualização.", "ok");
    $("savedAt").textContent = "Salvo às " + new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    await enterPanel();
  } catch (e) {
    toast("Não foi possível salvar. Tente de novo.", "err");
  } finally {
    $("saveBtn").disabled = false;
    $("saveBtn").textContent = "Salvar e publicar";
  }
}

$("loginBtn").addEventListener("click", login);
$("pwd").addEventListener("keydown", (event) => event.key === "Enter" && login());
$("logoutBtn").addEventListener("click", logout);
$("addBtn").addEventListener("click", addParticipant);
$("saveBtn").addEventListener("click", save);
$("teamSearchBtn").addEventListener("click", searchTeams);
$("teamSearch").addEventListener("keydown", (event) => event.key === "Enter" && searchTeams());
$("syncBtn").addEventListener("click", syncCartola);
$("confirmCancelBtn").addEventListener("click", closeDeleteConfirm);
$("confirmDeleteBtn").addEventListener("click", confirmDeleteParticipant);
$("confirmDelete").addEventListener("click", (event) => event.target.id === "confirmDelete" && closeDeleteConfirm());
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && pendingDeleteId) closeDeleteConfirm();
});
["pct1", "pct2", "pct3"].forEach((id) => $(id).addEventListener("input", updatePctNote));

if (getToken()) {
  enterPanel();
} else {
  $("loginView").style.display = "flex";
}
