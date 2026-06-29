const $ = (id) => document.getElementById(id);
const stage = $("stage");
const btnSpin = $("btnSpin");
const hint = $("hint");
const fx = $("fx");

let state = null;
let pool = [];
let lastSeenSpin = 0;
let lastConfigRev = -1;
let lastVenue = null;
let pendingVenue = null;
let isSpinning = false;

async function api(path, opts) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  return res.json();
}

/* ---------------- Venue (loại quay) ---------------- */
const VENUES = {
  cinema: { body: "venue-cinema", screen: "MÀN HÌNH", title: "Sắp xếp chỗ ngồi", kicker: "CINEMA · SEATING" },
  office: { body: "venue-office", screen: "", title: "Sắp xếp chỗ làm việc", kicker: "OFFICE · WORKSPACE" },
  wheel: { body: "venue-wheel", screen: "", title: "Vòng quay may mắn", kicker: "LUCKY · WHEEL" },
};
function applyVenue(v) {
  const cfg = VENUES[v] || VENUES.cinema;
  document.body.className = cfg.body;
  $("screenText").textContent = cfg.screen;
  $("title").textContent = cfg.title;
  $("kicker").textContent = cfg.kicker;
  [...$("venuePicker").children].forEach((b) =>
    b.classList.toggle("active", b.dataset.venue === v)
  );
  if (v === "wheel") buildWheel();
}
$("venuePicker").addEventListener("click", async (e) => {
  const btn = e.target.closest(".seg");
  if (!btn || !state || isSpinning) return;
  const v = btn.dataset.venue;
  if (v === state.venue) return;

  // Cập nhật giao diện NGAY (không chờ server) để không nhấp nháy kết quả cũ
  pendingVenue = v;
  state.venue = v;
  lastVenue = v;
  closeWinnerModal();
  applyVenue(v);
  if (v !== "wheel") {
    buildStage();
    if (state.lastResult && state.lastResultVenue === v) renderResult(state.lastResult);
    hint.textContent = "Sẵn sàng";
  } else {
    hint.textContent = "Sẵn sàng";
  }

  try {
    const r = await api("/api/venue", { method: "POST", body: JSON.stringify({ venue: v }) });
    if (r.state) {
      state = r.state;
      lastConfigRev = r.state.configRev;
      if (r.state.venue === pendingVenue) pendingVenue = null;
    }
  } catch (_) {
    pendingVenue = null;
  }
});

/* ---------------- Stage ---------------- */
function buildStage() {
  stage.innerHTML = "";
  state.layout.rows.forEach((row) => {
    const rowEl = document.createElement("div");
    rowEl.className = "row";
    const label = document.createElement("div");
    label.className = "row__label";
    label.textContent = row.label;
    const seats = document.createElement("div");
    seats.className = "row__seats";
    row.seats.forEach((s) => {
      const seat = document.createElement("div");
      seat.className = "seat";
      seat.dataset.seat = s.id;
      seat.innerHTML = `<div class="seat__id">${s.id}</div><div class="seat__name placeholder">—</div>`;
      seats.appendChild(seat);
    });
    rowEl.append(label, seats);
    stage.appendChild(rowEl);
  });
}

function setSeat(id, name, placeholder = false) {
  const seat = stage.querySelector(`.seat[data-seat="${CSS.escape(id)}"]`);
  if (!seat) return;
  const n = seat.querySelector(".seat__name");
  n.textContent = name || "—";
  n.classList.toggle("placeholder", placeholder || !name);
}

function renderResult(result) {
  if (!result) return;
  result.forEach((r) => setSeat(r.seatId, r.name, !r.name));
}

/* ---------------- Spin animation ---------------- */
const rand = (a) => a[Math.floor(Math.random() * a.length)] ?? "…";

function animateSpin(finalResult) {
  if (isSpinning || !finalResult) return;
  isSpinning = true;
  btnSpin.disabled = true;
  hint.textContent = "Đang quay…";

  const seatEls = [...stage.querySelectorAll(".seat")];
  seatEls.forEach((s) => {
    s.classList.remove("landed");
    s.classList.add("rolling");
    s.style.boxShadow = "";
  });

  const rollPool = pool.length ? pool : ["…"];
  const roll = setInterval(() => {
    seatEls.forEach((s) => {
      const n = s.querySelector(".seat__name");
      n.classList.remove("placeholder");
      n.textContent = rand(rollPool);
    });
  }, 60);

  const ordered = [...finalResult].sort((a, b) =>
    a.seatId.localeCompare(b.seatId, undefined, { numeric: true })
  );

  setTimeout(() => {
    clearInterval(roll);
    let i = 0;
    const step = Math.max(55, Math.min(150, 1400 / Math.max(1, ordered.length)));
    const landNext = () => {
      if (i >= ordered.length) return finishSpin();
      const r = ordered[i++];
      const seat = stage.querySelector(`.seat[data-seat="${CSS.escape(r.seatId)}"]`);
      if (seat) {
        seat.classList.remove("rolling");
        setSeat(r.seatId, r.name, !r.name);
        if (r.name) seat.classList.add("landed");
      }
      setTimeout(landNext, step);
    };
    landNext();
  }, 1100);
}

function finishSpin() {
  isSpinning = false;
  btnSpin.disabled = false;
  hint.textContent = "Đã có kết quả. Chúc vui vẻ!";
  burst();
  setTimeout(() => {
    stage.querySelectorAll(".seat.landed").forEach((s) => (s.style.boxShadow = "none"));
  }, 2600);
}

/* ---------------- Confetti ---------------- */
let parts = [], fxOn = false;
const ctx = fx.getContext("2d");
function sizeFx() { fx.width = innerWidth * devicePixelRatio; fx.height = innerHeight * devicePixelRatio; }
addEventListener("resize", sizeFx); sizeFx();
function burst() {
  const colors = ["#7c5cff", "#ff5d9e", "#ffca61", "#3ad0ff", "#fff"];
  const cx = fx.width / 2, cy = fx.height * 0.3;
  for (let i = 0; i < 170; i++) {
    const a = Math.random() * Math.PI * 2, sp = (4 + Math.random() * 9) * devicePixelRatio;
    parts.push({ x: cx + (Math.random() - .5) * 220 * devicePixelRatio, y: cy,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 6 * devicePixelRatio, g: .22 * devicePixelRatio,
      s: (4 + Math.random() * 5) * devicePixelRatio, c: colors[(Math.random() * colors.length) | 0],
      r: Math.random() * Math.PI, vr: (Math.random() - .5) * .3, life: 1 });
  }
  if (!fxOn) { fxOn = true; requestAnimationFrame(stepFx); }
}
function stepFx() {
  ctx.clearRect(0, 0, fx.width, fx.height);
  parts.forEach((p) => { p.vy += p.g; p.x += p.vx; p.y += p.vy; p.r += p.vr; p.life -= .008;
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * .6); ctx.restore(); });
  parts = parts.filter((p) => p.life > 0 && p.y < fx.height + 40);
  if (parts.length) requestAnimationFrame(stepFx);
  else { ctx.clearRect(0, 0, fx.width, fx.height); fxOn = false; }
}

/* ---------------- Wheel of names ---------------- */
const WSIZE = 520;
const wheelCanvas = $("wheel");
const wctx = wheelCanvas.getContext("2d");
const WHEEL_COLORS = [
  "#7c5cff", "#ff5d9e", "#ffca61", "#3ad0ff", "#5cffb1",
  "#ff8a5c", "#b388ff", "#ff6b6b", "#4dd4ac", "#ffd166",
];
let wheelNames = [];
let wheelRotation = 0;

function sizeWheel() {
  const dpr = window.devicePixelRatio || 1;
  wheelCanvas.width = WSIZE * dpr;
  wheelCanvas.height = WSIZE * dpr;
  wctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
sizeWheel();
addEventListener("resize", () => { sizeWheel(); drawWheel(wheelRotation); });

function buildWheel() {
  wheelNames = [...(state?.people || [])];
  drawWheel(wheelRotation);
}

function drawWheel(rot) {
  const ctx = wctx, R = WSIZE / 2 - 6, cx = WSIZE / 2, cy = WSIZE / 2;
  ctx.clearRect(0, 0, WSIZE, WSIZE);
  const N = wheelNames.length;
  if (!N) {
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,.06)"; ctx.fill();
    ctx.fillStyle = "#a6a2c4"; ctx.font = '600 18px "Be Vietnam Pro"';
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("Chưa có tên", cx, cy);
    return;
  }
  const seg = (Math.PI * 2) / N;
  const fontSize = Math.max(11, Math.min(22, 360 / N));
  for (let i = 0; i < N; i++) {
    const a0 = i * seg + rot, a1 = a0 + seg;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, a0, a1); ctx.closePath();
    ctx.fillStyle = WHEEL_COLORS[i % WHEEL_COLORS.length];
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,.12)"; ctx.lineWidth = 1; ctx.stroke();
    // tên
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(a0 + seg / 2);
    ctx.textAlign = "right"; ctx.textBaseline = "middle";
    ctx.fillStyle = "#160f2e";
    ctx.font = `700 ${fontSize}px "Be Vietnam Pro"`;
    let name = wheelNames[i];
    if (name.length > 16) name = name.slice(0, 15) + "…";
    ctx.fillText(name, R - 16, 0);
    ctx.restore();
  }
  // tâm
  ctx.beginPath(); ctx.arc(cx, cy, R * 0.16, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(15,11,31,.9)"; ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,.85)"; ctx.lineWidth = 4; ctx.stroke();
}

function spinWheelTo(index) {
  if (isSpinning) return;
  const N = wheelNames.length;
  if (index == null || index < 0 || index >= N) return;
  isSpinning = true;
  btnSpin.disabled = true;
  $("wheelCenter").disabled = true;
  closeWinnerModal();
  hint.textContent = "Đang quay…";

  const seg = (Math.PI * 2) / N;
  const pointer = -Math.PI / 2;
  const offset = (Math.random() - 0.5) * seg * 0.6; // lệch nhẹ trong ô cho tự nhiên
  const twoPi = Math.PI * 2;
  const targetMod = pointer - (index * seg + seg / 2) - offset;

  const curMod = ((wheelRotation % twoPi) + twoPi) % twoPi;
  const tgtMod = ((targetMod % twoPi) + twoPi) % twoPi;
  let delta = tgtMod - curMod; if (delta < 0) delta += twoPi;
  const final = wheelRotation + twoPi * 6 + delta;

  const start = wheelRotation, dur = 4200, t0 = performance.now();
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  const frame = (now) => {
    const t = Math.min(1, (now - t0) / dur);
    wheelRotation = start + (final - start) * ease(t);
    drawWheel(wheelRotation);
    if (t < 1) requestAnimationFrame(frame);
    else { wheelRotation = final % twoPi; drawWheel(wheelRotation); finishWheel(index); }
  };
  requestAnimationFrame(frame);
}

function finishWheel(index) {
  isSpinning = false;
  btnSpin.disabled = false;
  $("wheelCenter").disabled = false;
  const name = wheelNames[index];
  hint.textContent = "";
  burst();
  // hiện popup kết quả
  lastWinnerName = name;
  $("winnerName").textContent = name;
  openWinnerModal();
}

const winnerModal = $("winnerModal");
function openWinnerModal() { winnerModal.classList.add("open"); winnerModal.setAttribute("aria-hidden", "false"); }
function closeWinnerModal() { winnerModal.classList.remove("open"); winnerModal.setAttribute("aria-hidden", "true"); }

let lastWinnerName = null;
$("removeWinner").addEventListener("click", async () => {
  if (!lastWinnerName) return;
  const removed = lastWinnerName;
  await api("/api/people/remove", {
    method: "POST",
    body: JSON.stringify({ name: removed }),
  });
  closeWinnerModal();
  hint.textContent = `Đã xoá ${removed} khỏi vòng quay.`;
  lastWinnerName = null;
  await sync();
  buildWheel();
});
$("keepWinner").addEventListener("click", closeWinnerModal);
// đóng popup khi bấm nền tối
winnerModal.addEventListener("click", (e) => { if (e.target === winnerModal) closeWinnerModal(); });

/* ---------------- Sync ---------------- */
async function sync() {
  try {
    const st = await api("/api/state");
    // Đang đổi venue mà server chưa cập nhật kịp -> bỏ qua nhịp này để không nhấp nháy
    if (pendingVenue && st.venue !== pendingVenue) return;
    pendingVenue = null;
    state = st;
    pool = [...(st.people || [])];

    if (st.venue !== lastVenue) { lastVenue = st.venue; applyVenue(st.venue); }

    if (st.configRev !== lastConfigRev) {
      lastConfigRev = st.configRev;
      buildStage();
      if (st.venue === "wheel") buildWheel();
      if (drawerOpen) refreshSettings();
    }

    if (st.spinRequestId > lastSeenSpin) {
      lastSeenSpin = st.spinRequestId;
      if (st.venue === "wheel") spinWheelTo(st.lastWheel ? st.lastWheel.winnerIndex : -1);
      else animateSpin(st.lastResult);
    } else if (!isSpinning && st.venue !== "wheel" && st.lastResult && st.lastResultVenue === st.venue) {
      renderResult(st.lastResult);
    }
  } catch (_) {}
}

async function spinFromWeb() {
  if (isSpinning) return;
  const r = await api("/api/spin", { method: "POST" });
  if (!r.state) return;
  lastSeenSpin = r.state.spinRequestId;
  if (r.state.venue === "wheel") {
    spinWheelTo(r.state.lastWheel ? r.state.lastWheel.winnerIndex : -1);
  } else if (r.result) {
    animateSpin(r.result);
  }
}
btnSpin.addEventListener("click", spinFromWeb);
$("wheelCenter").addEventListener("click", spinFromWeb);

/* ---------------- Settings drawer (chỉ tên + sơ đồ) ---------------- */
let drawerOpen = false;
const drawer = $("drawer"), overlay = $("overlay");
function openDrawer() { drawerOpen = true; drawer.classList.add("open"); overlay.classList.add("open"); refreshSettings(); }
function closeDrawer() { drawerOpen = false; drawer.classList.remove("open"); overlay.classList.remove("open"); }
$("btnSettings").addEventListener("click", openDrawer);
$("btnClose").addEventListener("click", closeDrawer);
overlay.addEventListener("click", closeDrawer);

function refreshSettings() {
  if (!state) return;
  $("peopleInput").value = (state.people || []).join("\n");
  updatePeopleCount();
  renderLayoutEditor();
  updateSeatSummary();
}

/* People */
function parseLines(v) {
  return [...new Set(v.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean))];
}
function updatePeopleCount() {
  $("peopleCount").textContent = `${parseLines($("peopleInput").value).length} người`;
}
$("peopleInput").addEventListener("input", () => { updatePeopleCount(); updateSeatSummary(); });
$("savePeople").addEventListener("click", async () => {
  const people = parseLines($("peopleInput").value);
  await api("/api/people", { method: "POST", body: JSON.stringify({ people }) });
  await sync(); refreshSettings();
  hint.textContent = `Đã lưu ${people.length} người.`;
});

/* Layout editor */
function renderLayoutEditor() {
  const wrap = $("layoutRows");
  wrap.innerHTML = "";
  (state.layout.rows || []).forEach((r) => addLayoutRowEl(r.label, r.seats.length));
  if (!state.layout.rows.length) addLayoutRowEl("A", 8);
}
function addLayoutRowEl(label = "", count = 8) {
  const div = document.createElement("div");
  div.className = "layout-row";
  div.innerHTML = `
    <input class="text-input lbl" maxlength="3" value="${label}" placeholder="A" />
    <input class="num-input cnt" type="number" min="1" max="50" value="${count}" />
    <button class="del" title="Xoá hàng">🗑</button>`;
  div.querySelector(".del").addEventListener("click", () => { div.remove(); updateSeatSummary(); });
  div.querySelectorAll("input").forEach((i) => i.addEventListener("input", updateSeatSummary));
  $("layoutRows").appendChild(div);
}
function readLayoutEditor() {
  return [...$("layoutRows").querySelectorAll(".layout-row")].map((d) => ({
    label: d.querySelector(".lbl").value.trim(),
    count: parseInt(d.querySelector(".cnt").value, 10) || 0,
  })).filter((r) => r.label && r.count > 0);
}
function updateSeatSummary() {
  const rows = readLayoutEditor();
  const seats = rows.reduce((s, r) => s + r.count, 0);
  const people = parseLines($("peopleInput").value).length;
  $("seatSummary").textContent = `${rows.length} hàng · ${seats} ghế · ${people} người`;
}
$("addRow").addEventListener("click", () => {
  addLayoutRowEl(String.fromCharCode(65 + $("layoutRows").children.length), 8);
  updateSeatSummary();
});
$("saveLayout").addEventListener("click", async () => {
  const rows = readLayoutEditor();
  if (!rows.length) return;
  await api("/api/layout", { method: "POST", body: JSON.stringify({ rows }) });
  await sync(); refreshSettings();
  hint.textContent = "Đã lưu sơ đồ chỗ ngồi.";
});

/* ---------------- boot ---------------- */
sync();
setInterval(sync, 1500);
