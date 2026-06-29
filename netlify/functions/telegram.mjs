// Netlify Function v2 — webhook bot Telegram
import {
  load,
  save,
  publicState,
  setMode,
  setVenue,
  setPeople,
  setLayout,
  requestSpin,
  addGroup,
  clearGroups,
  removeGroup,
} from "./shared/state.mjs";

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;

async function send(chatId, text) {
  if (!TOKEN) return;
  await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
  });
}

function fmtResult(result) {
  if (!result || !result.length) return "Chưa có kết quả.";
  const byRow = {};
  for (const r of result) (byRow[r.rowLabel] ||= []).push(r);
  return Object.entries(byRow)
    .map(
      ([row, seats]) =>
        `*Hàng ${row}:*  ` + seats.map((x) => `${x.seatId}=${x.name || "—"}`).join("  ")
    )
    .join("\n");
}

const parseList = (str) =>
  str.split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean);

const HELP = `🎯 *Bot quay random chỗ ngồi*

*Chế độ:* "random tự nhiên" · "random theo sắp đặt" · "quay" · "trạng thái"
*Nhóm ngồi cạnh nhau:* \`/nhom Tên1, Tên2\` · \`/dsnhom\` · \`/xoanhom <số>\` · \`/xoanhom\` (xoá hết)
*Người:* \`/dsten\` · \`/setten An, Bình, ...\`
*Sơ đồ:* \`/sodo A:8, B:8, C:10\`
*Loại quay:* \`/loai rap\` | \`/loai vanphong\` | \`/loai thuong\``;

async function handle(msg) {
  const chatId = msg.chat.id;
  const text = (msg.text || "").trim();
  const low = text.toLowerCase();
  const s = await load();

  const reply = async (t) => {
    await save(s);
    await send(chatId, t);
  };

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
  if (low.startsWith("/sodo")) {
    const defs = parseList(text.slice(5)).map((tok) => {
      const [label, count] = tok.split(":").map((x) => x.trim());
      return { label, count: parseInt(count, 10) };
    });
    if (!setLayout(s, defs)) return send(chatId, "Cú pháp: `/sodo A:8, B:8, C:10`");
    return reply(
      `✅ Sơ đồ: ${s.config.layout.rows.map((r) => `${r.label}(${r.seats.length})`).join(", ")}`
    );
  }
  if (low.startsWith("/loai")) {
    const map = { rap: "cinema", cinema: "cinema", phim: "cinema", vanphong: "office", office: "office", lamviec: "office", thuong: "normal", normal: "normal", binhthuong: "normal" };
    const v = map[low.slice(5).trim().replace(/\s+/g, "")];
    if (!v || !setVenue(s, v)) return send(chatId, "Cú pháp: `/loai rap` | `/loai vanphong` | `/loai thuong`");
    const name = { cinema: "Rạp phim 🎬", office: "Chỗ làm việc 💼", normal: "Bình thường ✨" }[v];
    return reply(`✅ Đã đổi loại quay: *${name}*`);
  }

  if (low.startsWith("/xoanhom")) {
    const arg = text.slice(8).trim();
    if (!arg) {
      clearGroups(s);
      return reply("🗑️ Đã xoá tất cả nhóm.");
    }
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
      return send(chatId, HELP);
    case "/dsten":
      return send(chatId, `👥 *${s.config.people.length} người:*\n${s.config.people.join(", ") || "(trống)"}`);
    case "/dsnhom":
      return send(
        chatId,
        s.config.groups.length
          ? "📌 *Các nhóm:*\n" + s.config.groups.map((g, i) => `${i + 1}. ${g.label}: ${g.members.join(", ")}`).join("\n") + "\n\n_Xoá 1 nhóm: /xoanhom <số> · Xoá tất cả: /xoanhom_"
          : "Chưa có nhóm. Tạo bằng `/nhom ...`"
      );
  }

  if (low.includes("trạng thái") || low.includes("trang thai") || low === "/trangthai") {
    const modeTxt = s.config.mode === "arranged" ? "THEO SẮP ĐẶT 🎭" : "TỰ NHIÊN 🌿";
    return send(
      chatId,
      `ℹ️ Chế độ: *${modeTxt}* · Người: ${s.config.people.length} · Nhóm: ${s.config.groups.length}\n\nKết quả gần nhất:${s.lastResult ? "\n" + fmtResult(s.lastResult) : " (chưa có)"}`
    );
  }
  if (low === "/quay" || low === "quay" || low.includes("quay random") || low.includes("quay đi")) {
    const result = requestSpin(s);
    const modeTxt = s.config.mode === "arranged" ? "THEO SẮP ĐẶT 🎭" : "TỰ NHIÊN 🌿";
    return reply(`🌀 *Đã quay!* (${modeTxt})\n${fmtResult(result)}`);
  }

  if (low.includes("sắp đặt") || low.includes("sap dat") || low.includes("sắp xếp") || low === "/sapdat") {
    setMode(s, "arranged");
    const g = s.config.groups.length ? s.config.groups.map((x) => `• ${x.members.join(", ")}`).join("\n") : "(chưa có nhóm — tạo bằng /nhom)";
    return reply(`🎭 Đã bật *chế độ SẮP ĐẶT*.\nCác nhóm luôn ngồi cạnh nhau:\n${g}\n\nGõ "quay" để quay.`);
  }
  if (low.includes("tự nhiên") || low.includes("tu nhien") || low === "/tunhien") {
    setMode(s, "natural");
    return reply('🌿 Đã bật *chế độ TỰ NHIÊN*. Gõ "quay" để quay.');
  }

  return send(chatId, "Mình chưa hiểu 🤔. Gõ /help để xem hướng dẫn.");
}

export default async (req) => {
  if (req.method !== "POST") return new Response("ok");
  try {
    const update = await req.json();
    if (update.message) await handle(update.message);
  } catch (e) {
    console.error("[telegram webhook]", e);
  }
  // Luôn trả 200 để Telegram không gửi lại
  return new Response("ok");
};

export const config = {
  path: "/telegram",
};
