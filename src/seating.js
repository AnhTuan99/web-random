// Engine quay random chỗ ngồi (phiên bản nâng cấp)
// - Sơ đồ tuỳ biến: nhiều hàng, số ghế mỗi hàng tuỳ ý (kiểu rạp phim)
// - Nhóm "ngồi cạnh nhau": ở chế độ sắp đặt, mỗi nhóm chiếm các ghế LIỀN KỀ trong cùng 1 hàng
// - 2 chế độ: "natural" (ngẫu nhiên hoàn toàn) | "arranged" (theo nhóm sắp đặt)

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Tạo layout từ định nghĩa hàng: [{label:"A", count:8}, ...] */
export function makeLayout(rowDefs) {
  return {
    rows: rowDefs.map((rd) => ({
      label: rd.label,
      seats: Array.from({ length: rd.count }, (_, i) => ({
        id: `${rd.label}${i + 1}`,
      })),
    })),
  };
}

export function defaultConfig() {
  const women = ["C.Ngọc", "C.Quỳnh Anh", "Trinh", "C.Diệp", "Oanh"];
  const others = ["A.TA", "A.Nhật", "Ngô", "Đào"];
  return {
    mode: "natural", // "natural" | "arranged"
    venue: "cinema", // "cinema" | "office" | "normal"
    layout: makeLayout([
      { label: "A", count: 5 },
      { label: "B", count: 5 },
    ]),
    people: [...women, ...others],
    groups: [
      { id: "g1", label: "Nhóm cố định", members: [...women] },
    ],
    wheelQueue: [], // (ẩn) danh sách người được sắp đặt sẽ trúng ở các lượt vòng quay kế tiếp
  };
}

/** Tổng số ghế trong layout */
export function totalSeats(config) {
  return config.layout.rows.reduce((s, r) => s + r.seats.length, 0);
}

/** Quay 1 lần -> [{ seatId, rowLabel, name }] */
export function spin(config) {
  return config.mode === "arranged"
    ? spinArranged(config)
    : spinNatural(config);
}

/** Vòng quay may mắn: chọn ngẫu nhiên 1 người trúng */
export function spinWheel(config) {
  const people = config.people || [];
  if (!people.length) return { winner: null, winnerIndex: -1 };
  const i = Math.floor(Math.random() * people.length);
  return { winner: people[i], winnerIndex: i };
}

function freshRows(config) {
  return config.layout.rows.map((r) => ({
    label: r.label,
    seats: r.seats.map((s) => ({ id: s.id, name: null })),
  }));
}

function buildResult(rows) {
  const out = [];
  rows.forEach((row) =>
    row.seats.forEach((s) =>
      out.push({ seatId: s.id, rowLabel: row.label, name: s.name ?? "" })
    )
  );
  return out;
}

/** Lấp các ghế trống bằng danh sách người (ghế được xáo ngẫu nhiên) */
function fillEmpty(rows, people) {
  const empty = [];
  rows.forEach((row, ri) =>
    row.seats.forEach((s, si) => {
      if (s.name === null) empty.push([ri, si]);
    })
  );
  const seats = shuffle(empty);
  let idx = 0;
  for (const [ri, si] of seats) {
    rows[ri].seats[si].name = people[idx++] ?? null;
  }
}

function spinNatural(config) {
  const rows = freshRows(config);
  fillEmpty(rows, shuffle(config.people));
  return buildResult(rows);
}

/** Đặt 1 lượt tất cả nhóm vào các ghế liền kề. Trả về true nếu xếp được hết. */
function placeGroupsOnce(rows, groups) {
  for (const members of groups) {
    const need = members.length;
    const candidates = [];
    rows.forEach((row, ri) => {
      const seats = row.seats;
      let run = 0;
      for (let i = 0; i < seats.length; i++) {
        if (seats[i].name === null) {
          run++;
          if (run >= need) candidates.push([ri, i - need + 1]);
        } else {
          run = 0;
        }
      }
    });
    if (candidates.length === 0) return false;
    const [ri, start] = candidates[Math.floor(Math.random() * candidates.length)];
    for (let k = 0; k < need; k++) {
      rows[ri].seats[start + k].name = members[k];
    }
  }
  return true;
}

/** Thử nhiều lần để xếp được tất cả nhóm vào ghế liền kề */
function placeGroups(rows, groups) {
  const clear = () => rows.forEach((r) => r.seats.forEach((s) => (s.name = null)));
  for (let attempt = 0; attempt < 400; attempt++) {
    clear();
    if (placeGroupsOnce(rows, groups)) return true;
  }
  clear();
  return false;
}

function spinArranged(config) {
  const rows = freshRows(config);
  const peopleSet = new Set(config.people);

  // Chỉ giữ thành viên hợp lệ (có trong danh sách người), xáo thứ tự trong nhóm
  const groups = (config.groups || [])
    .map((g) => shuffle((g.members || []).filter((m) => peopleSet.has(m))))
    .filter((g) => g.length > 0)
    .sort((a, b) => b.length - a.length); // nhóm lớn xếp trước cho dễ vừa

  const placed = placeGroups(rows, groups);

  let individuals;
  if (placed) {
    const inGroup = new Set(groups.flat());
    individuals = shuffle(config.people.filter((p) => !inGroup.has(p)));
  } else {
    // Không xếp được hết nhóm (thiếu chỗ liền kề) -> fallback random toàn bộ
    individuals = shuffle(config.people);
  }

  fillEmpty(rows, individuals);
  return buildResult(rows);
}
