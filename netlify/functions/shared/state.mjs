// Trạng thái dùng chung cho Netlify Functions, lưu bằng Netlify Blobs.
import { getStore } from "@netlify/blobs";
import {
  defaultConfig,
  spin,
  spinWheel,
  makeLayout,
  totalSeats,
} from "../../../src/seating.js";

const STORE = "seatspin";
const KEY = "state";

function blank() {
  return {
    config: defaultConfig(),
    lastResult: null,
    lastWheel: null,
    lastSpinAt: null,
    spinRequestId: 0,
    configRev: 0,
  };
}

export async function load() {
  const store = getStore(STORE);
  const s = await store.get(KEY, { type: "json" });
  if (s && s.config) return s;
  const init = blank();
  await store.setJSON(KEY, init);
  return init;
}

export async function save(s) {
  const store = getStore(STORE);
  await store.setJSON(KEY, s);
}

export function publicState(s) {
  return {
    mode: s.config.mode,
    venue: s.config.venue || "cinema",
    layout: s.config.layout,
    people: s.config.people,
    groups: s.config.groups,
    totalSeats: totalSeats(s.config),
    lastResult: s.lastResult,
    lastWheel: s.lastWheel,
    lastSpinAt: s.lastSpinAt,
    spinRequestId: s.spinRequestId,
    configRev: s.configRev,
  };
}

/* ---- thao tác cấu hình (mutate + trả về s) ---- */
export function setMode(s, mode) {
  if (mode !== "natural" && mode !== "arranged") return false;
  s.config.mode = mode;
  return true;
}

export function setVenue(s, venue) {
  if (!["cinema", "office", "normal", "wheel"].includes(venue)) return false;
  s.config.venue = venue;
  s.configRev++;
  return true;
}

export function setPeople(s, list) {
  if (!Array.isArray(list)) return false;
  const clean = [...new Set(list.map((x) => String(x).trim()).filter(Boolean))];
  s.config.people = clean;
  const set = new Set(clean);
  s.config.groups = (s.config.groups || []).map((g) => ({
    ...g,
    members: g.members.filter((m) => set.has(m)),
  }));
  s.configRev++;
  return true;
}

export function removePerson(s, name) {
  const n = String(name || "").trim();
  if (!n) return false;
  const before = s.config.people.length;
  s.config.people = s.config.people.filter((p) => p !== n);
  if (s.config.people.length === before) return false;
  s.config.groups = (s.config.groups || []).map((g) => ({
    ...g,
    members: g.members.filter((m) => m !== n),
  }));
  s.config.wheelQueue = (s.config.wheelQueue || []).filter((m) => m !== n);
  s.configRev++;
  return true;
}

export function setWheelQueue(s, list) {
  if (!Array.isArray(list)) return [];
  const set = new Set(s.config.people);
  const valid = list.map((x) => String(x).trim()).filter((m) => m && set.has(m));
  s.config.wheelQueue = valid;
  return valid;
}

export function clearWheelQueue(s) {
  s.config.wheelQueue = [];
}

export function setLayout(s, rowDefs) {
  if (!Array.isArray(rowDefs)) return false;
  const defs = rowDefs
    .map((r) => ({
      label: String(r.label || "").trim(),
      count: Math.max(0, parseInt(r.count, 10) || 0),
    }))
    .filter((r) => r.label && r.count > 0);
  if (!defs.length) return false;
  s.config.layout = makeLayout(defs);
  s.configRev++;
  return true;
}

export function doSpin(s) {
  if ((s.config.venue || "cinema") === "wheel") {
    s.lastWheel = nextWheelResult(s);
    s.lastSpinAt = new Date().toISOString();
    return s.lastWheel;
  }
  s.lastResult = spin(s.config);
  s.lastSpinAt = new Date().toISOString();
  return s.lastResult;
}

function nextWheelResult(s) {
  s.config.wheelQueue = s.config.wheelQueue || [];
  while (s.config.wheelQueue.length) {
    const name = s.config.wheelQueue.shift();
    const idx = s.config.people.indexOf(name);
    if (idx >= 0) return { winner: name, winnerIndex: idx };
  }
  return spinWheel(s.config);
}

export function requestSpin(s) {
  s.spinRequestId++;
  return doSpin(s);
}

let seq = 1;
export function addGroup(s, members, label) {
  const set = new Set(s.config.people);
  const valid = [...new Set(members.map((x) => String(x).trim()).filter(Boolean))].filter(
    (m) => set.has(m)
  );
  if (valid.length === 0) return null;
  const group = {
    id: `g${Date.now().toString(36)}${seq++}`,
    label: label || `Nhóm ${(s.config.groups?.length || 0) + 1}`,
    members: valid,
  };
  s.config.groups = s.config.groups || [];
  s.config.groups.push(group);
  s.configRev++;
  return group;
}

export function clearGroups(s) {
  s.config.groups = [];
  s.configRev++;
}

export function removeGroup(s, id) {
  s.config.groups = (s.config.groups || []).filter((g) => g.id !== id);
  s.configRev++;
}
