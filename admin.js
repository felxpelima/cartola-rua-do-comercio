const TOKEN_KEY = "cartola_admin_token";
let state = { participants: [], config: {} };

const $ = (id) => document.getElementById(id);
const getToken = () => localStorage.getItem(TOKEN_KEY);
const setToken = (t) => localStorage.setItem(TOKEN_KEY, t);
const clearToken = () => localStorage.removeItem(TOKEN_KEY);
const uid = () => "p" + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function hashHue(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  return Math.abs(h) % 360;
}
const avatarBg = (nome) => {
  const hue = hashHue(nome || "?");
  return `linear-gradient(150deg, hsl(${hue} 68% 56%), hsl(${(hue + 38) % 360} 72% 42%))`;
};
function monogram(nome) {
  const parts = String(nome || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  let m = parts[0][0];
  if (parts.length > 1) m += parts[parts.length - 1][0];
  return m.toUpperCase().slice(0, 2);
}

let toastTimer = null;
function toast(msg, type = "ok") {
  const t = $("toast");
  t.textContent = msg;
  t.className = "toast show " + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = "toast"), 2600);
}

/* ---------- LOGIN ---------- */
async function login() {
  const pwd = $("pwd").value;
  $("loginErr").style.display = "none";
  $("loginBtn").disabled = true;
  try {
    const r = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pwd }),
    });
    if (r.ok) {
      const { token } = await r.json();
      setToken(token);
      await enterPanel();
    } else {
      $("loginErr").textContent = "Senha incorreta.";
      $("loginErr").style.display = "block";
    }
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

/* ---------- CARREGAR PAINEL ---------- */
async function enterPanel() {
  try {
    const r = await fetch("/api/data", { cache: "no-store" });
    const s = await r.json();
    state = {
      participants: Array.isArray(s.participants) ? s.participants : [],
      config: s.config || {},
    };
  } catch (e) {
    state = { participants: [], config: {} };
  }
  $("loginView").style.display = "none";
  $("panelView").style.display = "block";
  fillForm();
}

function fillForm() {
  const c = state.config;
  $("valor").value = c.valorPorPessoa ?? 50;
  $("pct1").value = c.pct1 ?? 50;
  $("pct2").value = c.pct2 ?? 30;
  $("pct3").value = c.pct3 ?? 20;
  $("titulo").value = c.titulo ?? "Cartola Rua do Comércio";
  $("subtitulo").value = c.subtitulo ?? "Copa do Mundo 2026";
  renderParticipants();
  updatePctNote();
}

function updatePctNote() {
  const sum = (Number($("pct1").value) || 0) + (Number($("pct2").value) || 0) + (Number($("pct3").value) || 0);
  const el = $("pctNote");
  el.textContent = "As porcentagens somam " + sum + "%" + (sum === 100 ? " ✓" : " (o ideal é 100%)");
  el.className = "note" + (sum === 100 ? " muted" : " warn");
}

function renderParticipants() {
  const wrap = $("participants");
  if (state.participants.length === 0) {
    wrap.innerHTML = '<div class="muted" style="font-size:13px;padding:6px 2px">Nenhum participante. Clique em “Adicionar”.</div>';
    return;
  }
  wrap.innerHTML = state.participants
    .map(
      (p) => `
      <div class="participant-row" data-id="${p.id}">
        <span class="pr-avatar" style="background:${avatarBg(p.nome)}">${esc(monogram(p.nome))}</span>
        <input class="nome-in" type="text" placeholder="Nome" value="${esc(p.nome)}" maxlength="80" />
        <input class="pts-in" type="number" step="0.01" placeholder="Pontos" value="${p.pontos}" />
        <button class="icon-btn" title="Remover">🗑️</button>
      </div>`
    )
    .join("");

  wrap.querySelectorAll(".participant-row").forEach((row) => {
    const id = row.getAttribute("data-id");
    const avatar = row.querySelector(".pr-avatar");
    row.querySelector(".nome-in").addEventListener("input", (e) => {
      const p = state.participants.find((x) => x.id === id);
      if (p) p.nome = e.target.value;
      avatar.style.background = avatarBg(e.target.value);
      avatar.textContent = monogram(e.target.value);
    });
    row.querySelector(".pts-in").addEventListener("input", (e) => {
      const p = state.participants.find((x) => x.id === id);
      if (p) p.pontos = e.target.value === "" ? 0 : parseFloat(e.target.value) || 0;
    });
    row.querySelector(".icon-btn").addEventListener("click", () => {
      state.participants = state.participants.filter((x) => x.id !== id);
      renderParticipants();
    });
  });
}

function addParticipant() {
  state.participants.push({ id: uid(), nome: "", pontos: 0 });
  renderParticipants();
  const inputs = $("participants").querySelectorAll(".nome-in");
  if (inputs.length) inputs[inputs.length - 1].focus();
}

/* ---------- SALVAR ---------- */
async function save() {
  const payload = {
    participants: state.participants.map((p) => ({
      id: p.id,
      nome: (p.nome || "").trim(),
      pontos: Number(p.pontos) || 0,
    })),
    config: {
      valorPorPessoa: Number($("valor").value) || 0,
      pct1: Number($("pct1").value) || 0,
      pct2: Number($("pct2").value) || 0,
      pct3: Number($("pct3").value) || 0,
      titulo: $("titulo").value.trim() || "Cartola Rua do Comércio",
      subtitulo: $("subtitulo").value.trim() || "Copa do Mundo 2026",
    },
  };

  $("saveBtn").disabled = true;
  $("saveBtn").textContent = "Salvando…";
  try {
    const r = await fetch("/api/data", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + getToken() },
      body: JSON.stringify(payload),
    });
    if (r.status === 401) {
      toast("Sessão expirada. Faça login de novo.", "err");
      setTimeout(logout, 1200);
      return;
    }
    if (!r.ok) throw new Error("erro");
    state.config = payload.config;
    toast("Publicado! Os membros já veem a atualização.", "ok");
    const now = new Date();
    $("savedAt").textContent = "Salvo às " + now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  } catch (e) {
    toast("Não foi possível salvar. Tente de novo.", "err");
  } finally {
    $("saveBtn").disabled = false;
    $("saveBtn").textContent = "Salvar e publicar";
  }
}

/* ---------- EVENTOS ---------- */
$("loginBtn").addEventListener("click", login);
$("pwd").addEventListener("keydown", (e) => e.key === "Enter" && login());
$("logoutBtn").addEventListener("click", logout);
$("addBtn").addEventListener("click", addParticipant);
$("saveBtn").addEventListener("click", save);
["pct1", "pct2", "pct3"].forEach((id) => $(id).addEventListener("input", updatePctNote));

if (getToken()) {
  enterPanel();
} else {
  $("loginView").style.display = "flex";
}
