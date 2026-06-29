export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

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
  const groupA = ["Alice", "Bob", "Charlie", "Diana", "Evan"];
  const others = ["Fiona", "George", "Hannah", "Ivan", "Julia"];
  return {
    mode: "natural",
    venue: "cinema",
    layout: makeLayout([
      { label: "A", count: 5 },
      { label: "B", count: 5 },
    ]),
    people: [...groupA, ...others],
    groups: [
      { id: "g1", label: "Group 1", members: [...groupA] },
    ],
    wheelQueue: [],
  };
}

export function totalSeats(config) {
  return config.layout.rows.reduce((s, r) => s + r.seats.length, 0);
}

export function spin(config) {
  return config.mode === "arranged"
    ? spinArranged(config)
    : spinNatural(config);
}

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


  const groups = (config.groups || [])
    .map((g) => shuffle((g.members || []).filter((m) => peopleSet.has(m))))
    .filter((g) => g.length > 0)
    .sort((a, b) => b.length - a.length);

  const placed = placeGroups(rows, groups);

  let individuals;
  if (placed) {
    const inGroup = new Set(groups.flat());
    individuals = shuffle(config.people.filter((p) => !inGroup.has(p)));
  } else {

    individuals = shuffle(config.people);
  }

  fillEmpty(rows, individuals);
  return buildResult(rows);
}
