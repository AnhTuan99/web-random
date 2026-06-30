import {
  setMode,
  setVenue,
  requestSpin,
  getState,
  getConfig,
  setPeople,
  addGroup,
  clearGroups,
  removeGroup,
  setLayout,
  setWheelQueue,
  getWheelQueue,
  clearWheelQueue,
  resetPeopleToDefault,
  resetAll,
} from "./store.js";

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const API = TOKEN ? `https://api.telegram.org/bot${TOKEN}` : null;

let offset = 0;
let running = false;

const MENU_KB = {
  inline_keyboard: [
    [
      { text: "🌿 Random tự nhiên", callback_data: "mode_natural" },
      { text: "🎭 Random sắp đặt", callback_data: "mode_arranged" },
    ],
    [
      { text: "🌀 Quay", callback_data: "spin" },
      { text: "ℹ️ Trạng thái", callback_data: "status" },
    ],
    [
      { text: "🎬 Rạp phim", callback_data: "loai_cinema" },
      { text: "💼 Chỗ làm việc", callback_data: "loai_office" },
      { text: "🎡 Vòng quay", callback_data: "loai_wheel" },
    ],
    [
      { text: "♻️ Reset danh sách tên", callback_data: "resetnames" },
    ],
    [
      { text: "🗑️ Xoá toàn bộ & về mặc định", callback_data: "resetall" },
    ],
  ],
};

function fmtResult(result) {
  if (!result || result.length === 0) return "Chưa có kết quả.";
  const byRow = {};
  for (const r of result) (byRow[r.rowLabel] ||= []).push(r);
  let text = "";
  for (const [row, seats] of Object.entries(byRow)) {
    text += `\n*Hàng ${row}:*  ` + seats.map((s) => `${s.seatId}=${s.name || "—"}`).join("  ");
  }
  return text.trim();
}

async function send(chatId, text, replyMarkup) {
  if (!API) return;
  try {
    const body = { chat_id: chatId, text, parse_mode: "Markdown" };
    if (replyMarkup) body.reply_markup = replyMarkup;
    await fetch(`${API}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.error("[telegram] send error:", err.message);
  }
}

async function answerCallback(id, text) {
  if (!API) return;
  try {
    await fetch(`${API}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callback_query_id: id, text: text || "" }),
    });
  } catch (_) {}
}

const HELP = `🎯 *Bot quay random chỗ ngồi*

Bấm nút bên dưới để dùng nhanh (không cần gõ lệnh).

*Nhóm ngồi cạnh nhau (chế độ sắp đặt):*
• \`/nhom Ngọc, Trinh, Diệp\` — tạo 1 nhóm ngồi cạnh nhau
• \`/dsnhom\` — xem các nhóm
• \`/xoanhom <số>\` — xoá 1 nhóm · \`/xoanhom\` — xoá tất cả

*Danh sách người:*
• \`/dsten\` — xem danh sách
• \`/setten An, Bình, ...\` — đặt lại danh sách
• \`/xoaten\` — xoá hết & đặt lại tên mặc định

*Sơ đồ & loại quay:*
• \`/sodo A:8, B:8, C:10\` — đặt các hàng & số ghế
• \`/loai rap\` | \`/loai vanphong\` | \`/loai vongquay\`

*Vòng quay may mắn:*
• \`/sapvong Tên1, Tên2\` — sắp đặt người trúng (theo /dsten)
• \`/dsvong\` · \`/xoavong\`

*Khác:*
• \`/menu\` — mở bảng nút bấm
• \`/reset\` — xoá toàn bộ dữ liệu & về mặc định`;

function parseList(s) {
  return s.split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean);
}

function actSetMode(mode) {
  setMode(mode);
  if (mode === "arranged") {
    const cfg = getConfig();
    const groupTxt = cfg.groups.length
      ? cfg.groups.map((g) => `• ${g.members.join(", ")}`).join("\n")
      : "(chưa có nhóm — tạo bằng /nhom)";
    return `🎭 Đã bật *chế độ SẮP ĐẶT*.\nCác nhóm sẽ luôn ngồi cạnh nhau:\n${groupTxt}\n\nBấm 🌀 Quay để quay.`;
  }
  return '🌿 Đã bật *chế độ TỰ NHIÊN*.\nBấm 🌀 Quay để quay.';
}

function actSpin() {
  const result = requestSpin();
  const st = getState();
  if (st.venue === "wheel") {
    const w = st.lastWheel;
    return w && w.winner
      ? `🎡 *Vòng quay may mắn!*\n🏆 Người được chọn: *${w.winner}*`
      : "Chưa có ai trong danh sách. Thêm bằng /setten.";
  }
  const modeTxt = st.mode === "arranged" ? "THEO SẮP ĐẶT 🎭" : "TỰ NHIÊN 🌿";
  return `🌀 *Đã quay!* (${modeTxt})\n${fmtResult(result)}`;
}

function actStatus() {
  const st = getState();
  const modeTxt = st.mode === "arranged" ? "THEO SẮP ĐẶT 🎭" : "TỰ NHIÊN 🌿";
  const venueTxt = { cinema: "Rạp phim 🎬", office: "Chỗ làm việc 💼", wheel: "Vòng quay 🎡" }[st.venue] || st.venue;
  return `ℹ️ Chế độ: *${modeTxt}* · Loại: *${venueTxt}*\nGhế: ${st.totalSeats} · Người: ${st.people.length} · Nhóm: ${st.groups.length}\n\nKết quả gần nhất:${
    st.lastResult ? "\n" + fmtResult(st.lastResult) : " (chưa có)"
  }`;
}

function actVenue(v) {
  if (!setVenue(v)) return "Loại quay không hợp lệ.";
  const name = { cinema: "Rạp phim 🎬", office: "Chỗ làm việc 💼", wheel: "Vòng quay may mắn 🎡" }[v];
  return `✅ Đã đổi loại quay: *${name}*`;
}

function actResetNames() {
  const p = resetPeopleToDefault();
  return `♻️ Đã xoá danh sách cũ và đặt lại tên mặc định (${p.length} người):\n${p.join(", ")}`;
}

function actResetAll() {
  resetAll();
  return "🗑️ Đã xoá *TOÀN BỘ* dữ liệu và đặt lại mặc định.\nKhông còn nhóm/sắp đặt vòng quay nào nữa.";
}

async function handleCallback(cb) {
  const chatId = cb.message?.chat?.id;
  const data = cb.data || "";
  let toast = "";
  if (data === "mode_natural") { await send(chatId, actSetMode("natural")); toast = "Đã bật Tự nhiên 🌿"; }
  else if (data === "mode_arranged") { await send(chatId, actSetMode("arranged")); toast = "Đã bật Sắp đặt 🎭"; }
  else if (data === "spin") { await send(chatId, actSpin()); toast = "Đã quay 🌀"; }
  else if (data === "status") { await send(chatId, actStatus()); }
  else if (data.startsWith("loai_")) { await send(chatId, actVenue(data.slice(5))); toast = "Đã đổi loại quay"; }
  else if (data === "resetnames") { await send(chatId, actResetNames()); toast = "Đã reset danh sách tên ♻️"; }
  else if (data === "resetall") { await send(chatId, actResetAll()); toast = "Đã xoá toàn bộ 🗑️"; }
  await answerCallback(cb.id, toast);
}

async function handle(msg) {
  const chatId = msg.chat.id;
  const text = (msg.text || "").trim();
  const low = text.toLowerCase();

  if (low.startsWith("/nhom")) {
    const members = parseList(text.slice(5));
    if (members.length < 2)
      return send(chatId, "Cú pháp: `/nhom Tên1, Tên2, ...` (ít nhất 2 người).");
    const r = addGroup(members);
    if (!r.ok)
      return send(chatId, "Không tạo được nhóm. Các tên phải có trong danh sách (gõ /dsten).");
    return send(chatId, `✅ Đã tạo *${r.group.label}* ngồi cạnh nhau: ${r.group.members.join(", ")}`);
  }

  if (low.startsWith("/setten")) {
    const list = parseList(text.slice(7));
    if (list.length === 0) return send(chatId, "Cú pháp: `/setten An, Bình, Cường, ...`");
    setPeople(list);
    return send(chatId, `✅ Đã đặt ${list.length} người:\n${list.join(", ")}`);
  }

  if (low.startsWith("/loai")) {
    const arg = low.slice(5).trim();
    const map = {
      rap: "cinema", cinema: "cinema", phim: "cinema",
      vanphong: "office", office: "office", lamviec: "office",
      vongquay: "wheel", wheel: "wheel", vong: "wheel", mayman: "wheel",
    };
    const v = map[arg.replace(/\s+/g, "")];
    if (!v) return send(chatId, "Cú pháp: `/loai rap` | `/loai vanphong` | `/loai vongquay`");
    return send(chatId, actVenue(v));
  }

  if (low.startsWith("/sapvong")) {
    const list = parseList(text.slice(8));
    if (!list.length)
      return send(chatId, "Cú pháp: `/sapvong Tên1, Tên2, ...` — tên phải có trong /dsten. Xem: /dsvong · Xoá: /xoavong");
    const valid = setWheelQueue(list);
    const skipped = list.filter((n) => !valid.includes(n));
    let msg = `✅ Đã sắp đặt người trúng vòng quay (theo thứ tự):\n${valid.map((n, i) => `${i + 1}. ${n}`).join("\n")}`;
    if (skipped.length) msg += `\n\n⚠️ Bỏ qua (không có trong /dsten): ${skipped.join(", ")}`;
    return send(chatId, msg);
  }

  if (low.startsWith("/sodo")) {
    const defs = parseList(text.slice(5)).map((tok) => {
      const [label, count] = tok.split(":").map((x) => x.trim());
      return { label, count: parseInt(count, 10) };
    });
    if (!setLayout(defs)) return send(chatId, "Cú pháp: `/sodo A:8, B:8, C:10` (Hàng:SốGhế).");
    const st = getState();
    return send(chatId, `✅ Đã đặt sơ đồ: ${st.layout.rows.map((r) => `${r.label}(${r.seats.length})`).join(", ")} — tổng ${st.totalSeats} ghế.`);
  }

  if (low.startsWith("/xoanhom")) {
    const arg = text.slice(8).trim();
    const st = getState();
    if (!arg) { clearGroups(); return send(chatId, "🗑️ Đã xoá tất cả nhóm."); }
    if (!st.groups.length) return send(chatId, "Chưa có nhóm nào để xoá.");
    const idx = parseInt(arg, 10);
    if (!Number.isInteger(idx) || idx < 1 || idx > st.groups.length)
      return send(chatId, `Số nhóm không hợp lệ. Gõ /dsnhom để xem (1..${st.groups.length}).`);
    const g = st.groups[idx - 1];
    removeGroup(g.id);
    return send(chatId, `🗑️ Đã xoá *${g.label}*: ${g.members.join(", ")}`);
  }

  switch (low) {
    case "/start":
    case "/help":
    case "/menu":
      return send(chatId, HELP, MENU_KB);

    case "/dsten": {
      const st = getState();
      return send(chatId, `👥 *${st.people.length} người:*\n${st.people.join(", ") || "(trống)"}`);
    }

    case "/xoaten":
    case "/resetten":
      return send(chatId, actResetNames());

    case "/reset":
    case "/xoatatca":
      return send(chatId, actResetAll());

    case "/dsnhom": {
      const st = getState();
      if (!st.groups.length) return send(chatId, "Chưa có nhóm nào. Tạo bằng `/nhom ...`");
      return send(
        chatId,
        "📌 *Các nhóm ngồi cạnh nhau:*\n" +
          st.groups.map((g, i) => `${i + 1}. ${g.label}: ${g.members.join(", ")}`).join("\n") +
          "\n\n_Xoá 1 nhóm: /xoanhom <số> · Xoá tất cả: /xoanhom_"
      );
    }

    case "/dsvong": {
      const q = getWheelQueue();
      return send(
        chatId,
        q.length
          ? "🎡 *Người trúng vòng quay đã sắp đặt:*\n" + q.map((n, i) => `${i + 1}. ${n}`).join("\n") + "\n\n_Xoá: /xoavong_"
          : "Chưa sắp đặt. Vòng quay đang NGẪU NHIÊN. Đặt bằng `/sapvong Tên1, Tên2`"
      );
    }

    case "/xoavong":
      clearWheelQueue();
      return send(chatId, "🗑️ Đã xoá sắp đặt vòng quay. Giờ chạy ngẫu nhiên.");
  }

  if (low.includes("trạng thái") || low.includes("trang thai") || low === "/trangthai")
    return send(chatId, actStatus());

  if (low === "/quay" || low === "quay" || low.includes("quay random") || low.includes("quay đi"))
    return send(chatId, actSpin());

  if (low.includes("sắp đặt") || low.includes("sap dat") || low.includes("sắp xếp") || low === "/sapdat")
    return send(chatId, actSetMode("arranged"));
  if (low.includes("tự nhiên") || low.includes("tu nhien") || low === "/tunhien")
    return send(chatId, actSetMode("natural"));

  return send(chatId, "Mình chưa hiểu 🤔. Gõ /menu để mở bảng nút bấm hoặc /help.");
}

async function poll() {
  if (!API) return;
  try {
    const res = await fetch(`${API}/getUpdates?timeout=30&offset=${offset}`, {
      signal: AbortSignal.timeout(35000),
    });
    const data = await res.json();
    if (data.ok && Array.isArray(data.result)) {
      for (const update of data.result) {
        offset = update.update_id + 1;
        if (update.message) await handle(update.message);
        else if (update.callback_query) await handleCallback(update.callback_query);
      }
    }
  } catch (err) {
    if (err.name !== "TimeoutError" && err.name !== "AbortError") {
      console.error("[telegram] poll error:", err.message);
    }
  } finally {
    if (running) setTimeout(poll, 400);
  }
}

export function startTelegramBot() {
  if (!TOKEN) {
    console.warn("[telegram] TELEGRAM_BOT_TOKEN chưa đặt — bot TẮT. Web vẫn chạy.");
    return;
  }
  if (running) return;
  running = true;
  console.log("[telegram] Bot đã khởi động (long polling).");
  poll();
}

export function stopTelegramBot() {
  running = false;
}
