// Telegram bot (long polling) - không cần thư viện ngoài (Node >= 18 có sẵn fetch).
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
} from "./store.js";

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const API = TOKEN ? `https://api.telegram.org/bot${TOKEN}` : null;

let offset = 0;
let running = false;

function fmtResult(result) {
  if (!result || result.length === 0) return "Chưa có kết quả.";
  const byRow = {};
  for (const r of result) (byRow[r.rowLabel] ||= []).push(r);
  let text = "";
  for (const [row, seats] of Object.entries(byRow)) {
    text += `\n*Hàng ${row}:*  ` +
      seats.map((s) => `${s.seatId}=${s.name || "—"}`).join("  ");
  }
  return text.trim();
}

async function send(chatId, text) {
  if (!API) return;
  try {
    await fetch(`${API}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
    });
  } catch (err) {
    console.error("[telegram] send error:", err.message);
  }
}

const HELP = `🎯 *Bot quay random chỗ ngồi*

*Chế độ:*
• "random tự nhiên" — xếp ngẫu nhiên hoàn toàn
• "random theo sắp đặt" — các nhóm luôn ngồi cạnh nhau
• "quay" — quay 1 lần
• "trạng thái" — xem chế độ & kết quả

*Nhóm ngồi cạnh nhau (chế độ sắp đặt):*
• \`/nhom Ngọc, Trinh, Diệp\` — tạo 1 nhóm ngồi cạnh nhau
• \`/dsnhom\` — xem các nhóm
• \`/xoanhom <số>\` — xoá 1 nhóm theo số · \`/xoanhom\` — xoá tất cả

*Danh sách người:*
• \`/dsten\` — xem danh sách
• \`/setten An, Bình, Cường, ...\` — đặt lại danh sách

*Sơ đồ chỗ ngồi:*
• \`/sodo A:8, B:8, C:10\` — đặt các hàng & số ghế
• \`/loai rap\` | \`/loai vanphong\` | \`/loai thuong\` | \`/loai vongquay\` — đổi loại quay

*Vòng quay may mắn:*
• \`/sapvong Tên1, Tên2\` — sắp đặt người trúng các lượt kế tiếp
• \`/dsvong\` — xem sắp đặt · \`/xoavong\` — xoá sắp đặt (về ngẫu nhiên)

Mở web để xem quay trực tiếp 🌀`;

function parseList(s) {
  return s
    .split(/[,;\n]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

async function handle(msg) {
  const chatId = msg.chat.id;
  const text = (msg.text || "").trim();
  const low = text.toLowerCase();

  // ----- Lệnh có tham số -----
  if (low.startsWith("/nhom")) {
    const members = parseList(text.slice(5));
    if (members.length < 2)
      return send(chatId, "Cú pháp: `/nhom Tên1, Tên2, ...` (ít nhất 2 người).");
    const r = addGroup(members);
    if (!r.ok)
      return send(
        chatId,
        "Không tạo được nhóm. Hãy chắc các tên này đã có trong danh sách (gõ /dsten để xem)."
      );
    return send(
      chatId,
      `✅ Đã tạo *${r.group.label}* ngồi cạnh nhau: ${r.group.members.join(", ")}`
    );
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
      thuong: "normal", normal: "normal", binhthuong: "normal",
      vongquay: "wheel", wheel: "wheel", vong: "wheel", mayman: "wheel",
    };
    const v = map[arg.replace(/\s+/g, "")];
    if (!v || !setVenue(v))
      return send(chatId, "Cú pháp: `/loai rap` | `/loai vanphong` | `/loai thuong` | `/loai vongquay`");
    const name = { cinema: "Rạp phim 🎬", office: "Chỗ làm việc 💼", normal: "Bình thường ✨", wheel: "Vòng quay may mắn 🎡" }[v];
    return send(chatId, `✅ Đã đổi loại quay: *${name}*`);
  }

  if (low.startsWith("/sapvong")) {
    const list = parseList(text.slice(8));
    if (!list.length)
      return send(
        chatId,
        "Cú pháp: `/sapvong Tên1, Tên2, ...` — đặt người trúng cho các lượt quay kế tiếp (theo thứ tự).\nXem: /dsvong · Xoá: /xoavong"
      );
    const valid = setWheelQueue(list);
    const skipped = list.filter((n) => !valid.includes(n));
    let msg = `✅ Đã sắp đặt người trúng vòng quay (theo thứ tự):\n${valid
      .map((n, i) => `${i + 1}. ${n}`)
      .join("\n")}`;
    if (skipped.length) msg += `\n\n⚠️ Bỏ qua (không có trong danh sách): ${skipped.join(", ")}`;
    return send(chatId, msg);
  }

  if (low.startsWith("/sodo")) {
    const defs = parseList(text.slice(5)).map((tok) => {
      const [label, count] = tok.split(":").map((x) => x.trim());
      return { label, count: parseInt(count, 10) };
    });
    if (!setLayout(defs))
      return send(chatId, "Cú pháp: `/sodo A:8, B:8, C:10` (Hàng:SốGhế).");
    const st = getState();
    return send(
      chatId,
      `✅ Đã đặt sơ đồ: ${st.layout.rows
        .map((r) => `${r.label}(${r.seats.length})`)
        .join(", ")} — tổng ${st.totalSeats} ghế.`
    );
  }

  if (low.startsWith("/xoanhom")) {
    const arg = text.slice(8).trim();
    const st = getState();
    if (!arg) {
      clearGroups();
      return send(chatId, "🗑️ Đã xoá tất cả nhóm.");
    }
    if (!st.groups.length) return send(chatId, "Chưa có nhóm nào để xoá.");
    const idx = parseInt(arg, 10);
    if (!Number.isInteger(idx) || idx < 1 || idx > st.groups.length)
      return send(
        chatId,
        `Số nhóm không hợp lệ. Gõ /dsnhom để xem (hợp lệ: 1..${st.groups.length}).`
      );
    const g = st.groups[idx - 1];
    removeGroup(g.id);
    return send(chatId, `🗑️ Đã xoá *${g.label}*: ${g.members.join(", ")}`);
  }

  // ----- Lệnh không tham số -----
  switch (low) {
    case "/start":
    case "/help":
      return send(chatId, HELP);

    case "/dsten": {
      const st = getState();
      return send(
        chatId,
        `👥 *${st.people.length} người:*\n${st.people.join(", ") || "(trống)"}`
      );
    }

    case "/dsnhom": {
      const st = getState();
      if (!st.groups.length) return send(chatId, "Chưa có nhóm nào. Tạo bằng `/nhom ...`");
      return send(
        chatId,
        "📌 *Các nhóm ngồi cạnh nhau:*\n" +
          st.groups
            .map((g, i) => `${i + 1}. ${g.label}: ${g.members.join(", ")}`)
            .join("\n") +
          "\n\n_Xoá 1 nhóm: /xoanhom <số> · Xoá tất cả: /xoanhom_"
      );
    }

    case "/dsvong": {
      const q = getWheelQueue();
      return send(
        chatId,
        q.length
          ? "🎡 *Người trúng vòng quay đã sắp đặt (theo thứ tự):*\n" +
              q.map((n, i) => `${i + 1}. ${n}`).join("\n") +
              "\n\n_Xoá sắp đặt: /xoavong_"
          : "Chưa sắp đặt người trúng nào. Vòng quay đang chạy NGẪU NHIÊN.\nĐặt bằng: `/sapvong Tên1, Tên2`"
      );
    }

    case "/xoavong":
      clearWheelQueue();
      return send(chatId, "🗑️ Đã xoá sắp đặt vòng quay. Giờ vòng quay chạy ngẫu nhiên.");
  }

  // ----- Ngôn ngữ tự nhiên -----
  if (low.includes("trạng thái") || low.includes("trang thai") || low === "/trangthai") {
    const st = getState();
    const modeTxt = st.mode === "arranged" ? "THEO SẮP ĐẶT 🎭" : "TỰ NHIÊN 🌿";
    return send(
      chatId,
      `ℹ️ Chế độ: *${modeTxt}*\nGhế: ${st.totalSeats} · Người: ${st.people.length} · Nhóm: ${st.groups.length}\n\nKết quả gần nhất:${
        st.lastResult ? "\n" + fmtResult(st.lastResult) : " (chưa có)"
      }`
    );
  }

  if (low === "/quay" || low === "quay" || low.includes("quay random") || low.includes("quay đi")) {
    const result = requestSpin();
    const st = getState();
    if (st.venue === "wheel") {
      const w = st.lastWheel;
      return send(
        chatId,
        w && w.winner
          ? `🎡 *Vòng quay may mắn!*\n🏆 Người được chọn: *${w.winner}*`
          : "Chưa có ai trong danh sách. Thêm bằng /setten."
      );
    }
    const modeTxt = st.mode === "arranged" ? "THEO SẮP ĐẶT 🎭" : "TỰ NHIÊN 🌿";
    return send(chatId, `🌀 *Đã quay!* (${modeTxt})\n${fmtResult(result)}`);
  }

  const wantsArranged =
    low.includes("sắp đặt") || low.includes("sap dat") || low.includes("sắp xếp") || low === "/sapdat";
  const wantsNatural =
    low.includes("tự nhiên") || low.includes("tu nhien") || low === "/tunhien";

  if (wantsArranged) {
    setMode("arranged");
    const cfg = getConfig();
    const groupTxt = cfg.groups.length
      ? cfg.groups.map((g) => `• ${g.members.join(", ")}`).join("\n")
      : "(chưa có nhóm — tạo bằng /nhom)";
    return send(
      chatId,
      `🎭 Đã bật *chế độ SẮP ĐẶT*.\nCác nhóm sẽ luôn ngồi cạnh nhau:\n${groupTxt}\n\nGõ "quay" để quay.`
    );
  }
  if (wantsNatural) {
    setMode("natural");
    return send(chatId, '🌿 Đã bật *chế độ TỰ NHIÊN*. Gõ "quay" để quay.');
  }

  return send(chatId, "Mình chưa hiểu 🤔. Gõ /help để xem hướng dẫn.");
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
