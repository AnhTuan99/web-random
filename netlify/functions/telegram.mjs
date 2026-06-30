import {
  load,
  save,
  setMode,
  setVenue,
  setPeople,
  setLayout,
  requestSpin,
  addGroup,
  clearGroups,
  removeGroup,
  setWheelQueue,
  clearWheelQueue,
  resetPeopleToDefault,
  resetAll,
} from "./shared/state.mjs";

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;

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
    [{ text: "♻️ Reset danh sách tên", callback_data: "resetnames" }],
    [{ text: "🗑️ Xoá toàn bộ & về mặc định", callback_data: "resetall" }],
  ],
};

async function send(chatId, text, replyMarkup) {
  if (!TOKEN) return;
  const body = { chat_id: chatId, text, parse_mode: "Markdown" };
  if (replyMarkup) body.reply_markup = replyMarkup;
  await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function answerCallback(id, text) {
  if (!TOKEN) return;
  await fetch(`https://api.telegram.org/bot${TOKEN}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: id, text: text || "" }),
  });
}

function fmtResult(result) {
  if (!result || !result.length) return "Chưa có kết quả.";
  const byRow = {};
  for (const r of result) (byRow[r.rowLabel] ||= []).push(r);
  return Object.entries(byRow)
    .map(([row, seats]) => `*Hàng ${row}:*  ` + seats.map((x) => `${x.seatId}=${x.name || "—"}`).join("  "))
    .join("\n");
}

const parseList = (str) => str.split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean);

const HELP = `🎯 *Bot quay random chỗ ngồi*

Bấm nút bên dưới để dùng nhanh (không cần gõ lệnh).

*Nhóm:* \`/nhom Tên1, Tên2\` · \`/dsnhom\` · \`/xoanhom <số>\` · \`/xoanhom\`
*Người:* \`/dsten\` · \`/setten An, Bình, ...\` · \`/xoaten\` (đặt lại mặc định)
*Sơ đồ & loại:* \`/sodo A:8, B:8\` · \`/loai rap|vanphong|vongquay\`
*Vòng quay:* \`/sapvong Tên1, Tên2\` · \`/dsvong\` · \`/xoavong\`
*Khác:* \`/menu\` · \`/reset\` (xoá toàn bộ & về mặc định)`;

function actSetMode(s, mode) {
  setMode(s, mode);
  if (mode === "arranged") {
    const g = s.config.groups.length
      ? s.config.groups.map((x) => `• ${x.members.join(", ")}`).join("\n")
      : "(chưa có nhóm — tạo bằng /nhom)";
    return `🎭 Đã bật *chế độ SẮP ĐẶT*.\nCác nhóm luôn ngồi cạnh nhau:\n${g}\n\nBấm 🌀 Quay để quay.`;
  }
  return '🌿 Đã bật *chế độ TỰ NHIÊN*.\nBấm 🌀 Quay để quay.';
}

function actSpin(s) {
  const result = requestSpin(s);
  if ((s.config.venue || "cinema") === "wheel") {
    const w = s.lastWheel;
    return w && w.winner
      ? `🎡 *Vòng quay may mắn!*\n🏆 Người được chọn: *${w.winner}*`
      : "Chưa có ai trong danh sách. Thêm bằng /setten.";
  }
  const modeTxt = s.config.mode === "arranged" ? "THEO SẮP ĐẶT 🎭" : "TỰ NHIÊN 🌿";
  return `🌀 *Đã quay!* (${modeTxt})\n${fmtResult(result)}`;
}

function actStatus(s) {
  const modeTxt = s.config.mode === "arranged" ? "THEO SẮP ĐẶT 🎭" : "TỰ NHIÊN 🌿";
  const venueTxt = { cinema: "Rạp phim 🎬", office: "Chỗ làm việc 💼", wheel: "Vòng quay 🎡" }[s.config.venue] || s.config.venue;
  return `ℹ️ Chế độ: *${modeTxt}* · Loại: *${venueTxt}*\nNgười: ${s.config.people.length} · Nhóm: ${s.config.groups.length}\n\nKết quả gần nhất:${s.lastResult ? "\n" + fmtResult(s.lastResult) : " (chưa có)"}`;
}

function actVenue(s, v) {
  if (!setVenue(s, v)) return "Loại quay không hợp lệ.";
  const name = { cinema: "Rạp phim 🎬", office: "Chỗ làm việc 💼", wheel: "Vòng quay may mắn 🎡" }[v];
  return `✅ Đã đổi loại quay: *${name}*`;
}

function actResetNames(s) {
  const p = resetPeopleToDefault(s);
  return `♻️ Đã xoá danh sách cũ và đặt lại tên mặc định (${p.length} người):\n${p.join(", ")}`;
}

function actResetAll(s) {
  resetAll(s);
  return "🗑️ Đã xoá *TOÀN BỘ* dữ liệu và đặt lại mặc định.\nKhông còn nhóm/sắp đặt vòng quay nào nữa.";
}

async function handleCallback(cb) {
  const chatId = cb.message?.chat?.id;
  const data = cb.data || "";
  const s = await load();
  let toast = "";
  let msg = null;
  if (data === "mode_natural") { msg = actSetMode(s, "natural"); toast = "Đã bật Tự nhiên 🌿"; }
  else if (data === "mode_arranged") { msg = actSetMode(s, "arranged"); toast = "Đã bật Sắp đặt 🎭"; }
  else if (data === "spin") { msg = actSpin(s); toast = "Đã quay 🌀"; }
  else if (data === "status") { msg = actStatus(s); }
  else if (data.startsWith("loai_")) { msg = actVenue(s, data.slice(5)); toast = "Đã đổi loại quay"; }
  else if (data === "resetnames") { msg = actResetNames(s); toast = "Đã reset danh sách tên ♻️"; }
  else if (data === "resetall") { msg = actResetAll(s); toast = "Đã xoá toàn bộ 🗑️"; }
  await save(s);
  if (msg) await send(chatId, msg);
  await answerCallback(cb.id, toast);
}

async function handle(msg) {
  const chatId = msg.chat.id;
  const text = (msg.text || "").trim();
  const low = text.toLowerCase();
  const s = await load();
  const reply = async (t) => { await save(s); await send(chatId, t); };

  if (low.startsWith("/nhom")) {
    const members = parseList(text.slice(5));
    if (members.length < 2) return send(chatId, "Cú pháp: `/nhom Tên1, Tên2, ...`");
    const g = addGroup(s, members);
    if (!g) return send(chatId, "Các tên phải có trong danh sách (xem /dsten).");
    return reply(`✅ Đã tạo *${g.label}* ngồi cạnh nhau: ${g.members.join(", ")}`);
  }
  if (low.startsWith("/setten")) {
    const list = parseList(text.slice(7));
    if (!list.length) return send(chatId, "Cú pháp: `/setten An, Bình, ...`");
    setPeople(s, list);
    return reply(`✅ Đã đặt ${list.length} người:\n${list.join(", ")}`);
  }
  if (low.startsWith("/sapvong")) {
    const list = parseList(text.slice(8));
    if (!list.length)
      return send(chatId, "Cú pháp: `/sapvong Tên1, Tên2, ...` — tên phải có trong /dsten. Xem: /dsvong · Xoá: /xoavong");
    const valid = setWheelQueue(s, list);
    const skipped = list.filter((n) => !valid.includes(n));
    let m = `✅ Đã sắp đặt người trúng vòng quay:\n${valid.map((n, i) => `${i + 1}. ${n}`).join("\n")}`;
    if (skipped.length) m += `\n\n⚠️ Bỏ qua (không có trong /dsten): ${skipped.join(", ")}`;
    return reply(m);
  }
  if (low.startsWith("/sodo")) {
    const defs = parseList(text.slice(5)).map((tok) => {
      const [label, count] = tok.split(":").map((x) => x.trim());
      return { label, count: parseInt(count, 10) };
    });
    if (!setLayout(s, defs)) return send(chatId, "Cú pháp: `/sodo A:8, B:8, C:10`");
    return reply(`✅ Sơ đồ: ${s.config.layout.rows.map((r) => `${r.label}(${r.seats.length})`).join(", ")}`);
  }
  if (low.startsWith("/loai")) {
    const map = { rap: "cinema", cinema: "cinema", phim: "cinema", vanphong: "office", office: "office", lamviec: "office", vongquay: "wheel", wheel: "wheel", vong: "wheel", mayman: "wheel" };
    const v = map[low.slice(5).trim().replace(/\s+/g, "")];
    if (!v) return send(chatId, "Cú pháp: `/loai rap` | `/loai vanphong` | `/loai vongquay`");
    return reply(actVenue(s, v));
  }
  if (low.startsWith("/xoanhom")) {
    const arg = text.slice(8).trim();
    if (!arg) { clearGroups(s); return reply("🗑️ Đã xoá tất cả nhóm."); }
    if (!s.config.groups.length) return send(chatId, "Chưa có nhóm nào để xoá.");
    const idx = parseInt(arg, 10);
    if (!Number.isInteger(idx) || idx < 1 || idx > s.config.groups.length)
      return send(chatId, `Số nhóm không hợp lệ. Gõ /dsnhom để xem (1..${s.config.groups.length}).`);
    const g = s.config.groups[idx - 1];
    removeGroup(s, g.id);
    return reply(`🗑️ Đã xoá *${g.label}*: ${g.members.join(", ")}`);
  }

  switch (low) {
    case "/start":
    case "/help":
    case "/menu":
      return send(chatId, HELP, MENU_KB);
    case "/dsten":
      return send(chatId, `👥 *${s.config.people.length} người:*\n${s.config.people.join(", ") || "(trống)"}`);
    case "/xoaten":
    case "/resetten":
      return reply(actResetNames(s));
    case "/reset":
    case "/xoatatca":
      return reply(actResetAll(s));
    case "/dsnhom":
      return send(
        chatId,
        s.config.groups.length
          ? "📌 *Các nhóm:*\n" + s.config.groups.map((g, i) => `${i + 1}. ${g.label}: ${g.members.join(", ")}`).join("\n") + "\n\n_Xoá 1 nhóm: /xoanhom <số> · Xoá tất cả: /xoanhom_"
          : "Chưa có nhóm. Tạo bằng `/nhom ...`"
      );
    case "/dsvong":
      return send(
        chatId,
        (s.config.wheelQueue || []).length
          ? "🎡 *Người trúng vòng quay đã sắp đặt:*\n" + s.config.wheelQueue.map((n, i) => `${i + 1}. ${n}`).join("\n") + "\n\n_Xoá: /xoavong_"
          : "Chưa sắp đặt. Vòng quay đang NGẪU NHIÊN. Đặt bằng `/sapvong Tên1, Tên2`"
      );
    case "/xoavong":
      clearWheelQueue(s);
      return reply("🗑️ Đã xoá sắp đặt vòng quay. Giờ chạy ngẫu nhiên.");
  }

  if (low.includes("trạng thái") || low.includes("trang thai") || low === "/trangthai")
    return send(chatId, actStatus(s));
  if (low === "/quay" || low === "quay" || low.includes("quay random") || low.includes("quay đi"))
    return reply(actSpin(s));
  if (low.includes("sắp đặt") || low.includes("sap dat") || low.includes("sắp xếp") || low === "/sapdat")
    return reply(actSetMode(s, "arranged"));
  if (low.includes("tự nhiên") || low.includes("tu nhien") || low === "/tunhien")
    return reply(actSetMode(s, "natural"));

  return send(chatId, "Mình chưa hiểu 🤔. Gõ /menu để mở bảng nút bấm hoặc /help.");
}

export default async (req) => {
  if (req.method !== "POST") return new Response("ok");
  try {
    const update = await req.json();
    if (update.message) await handle(update.message);
    else if (update.callback_query) await handleCallback(update.callback_query);
  } catch (e) {
    console.error("[telegram webhook]", e);
  }
  return new Response("ok");
};

export const config = { path: "/telegram" };
