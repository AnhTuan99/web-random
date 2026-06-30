import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { defaultConfig, spin, spinWheel, makeLayout, totalSeats } from "./seating.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, "..", "data.json");

let config = load() ?? defaultConfig();

if (!["cinema", "office", "wheel"].includes(config.venue)) config.venue = "cinema";

let lastResult = null;
let lastResultVenue = null;
let lastWheel = null;
let lastSpinAt = null;
let spinRequestId = 0;
let configRev = 0;

function load() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
      return raw.config ?? null;
    }
  } catch (e) {
    console.warn("[store] không đọc được data.json:", e.message);
  }
  return null;
}

function persist() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ config }, null, 2));
  } catch (e) {
    console.warn("[store] không lưu được data.json:", e.message);
  }
}

function bumpConfig() {
  configRev += 1;
  persist();
}

export function getConfig() {
  return config;
}

export function getState() {
  return {
    mode: config.mode,
    venue: config.venue || "cinema",
    layout: config.layout,
    people: config.people,
    groups: config.groups,
    totalSeats: totalSeats(config),
    lastResult,
    lastResultVenue,
    lastWheel,
    lastSpinAt,
    spinRequestId,
    configRev,
  };
}

export function setMode(mode) {
  if (mode !== "natural" && mode !== "arranged") return false;
  config.mode = mode;
  persist();
  return true;
}

export function setVenue(venue) {
  if (!["cinema", "office", "wheel"].includes(venue)) return false;
  config.venue = venue;
  bumpConfig();
  return true;
}

export function doSpin() {
  if ((config.venue || "cinema") === "wheel") {
    lastWheel = nextWheelResult();
    lastSpinAt = new Date().toISOString();
    return lastWheel;
  }
  lastResult = spin(config);
  lastResultVenue = config.venue || "cinema";
  lastSpinAt = new Date().toISOString();
  return lastResult;
}

function nextWheelResult() {
  config.wheelQueue = config.wheelQueue || [];
  while (config.wheelQueue.length) {
    const name = config.wheelQueue.shift();
    const idx = config.people.indexOf(name);
    if (idx >= 0) {
      persist();
      return { winner: name, winnerIndex: idx };
    }

    persist();
  }
  return spinWheel(config);
}

export function requestSpin() {
  spinRequestId += 1;
  return doSpin();
}

export function setPeople(list) {
  if (!Array.isArray(list)) return false;
  const clean = [...new Set(list.map((s) => String(s).trim()).filter(Boolean))];
  config.people = clean;

  const set = new Set(clean);
  config.groups = (config.groups || []).map((g) => ({
    ...g,
    members: g.members.filter((m) => set.has(m)),
  }));
  bumpConfig();
  return true;
}

export function addPerson(name) {
  const n = String(name).trim();
  if (!n) return false;
  if (!config.people.includes(n)) config.people.push(n);
  bumpConfig();
  return true;
}

export function removePerson(name) {
  const n = String(name).trim();
  if (!n) return false;
  const before = config.people.length;
  config.people = config.people.filter((p) => p !== n);
  if (config.people.length === before) return false;
  config.groups = (config.groups || []).map((g) => ({
    ...g,
    members: g.members.filter((m) => m !== n),
  }));
  config.wheelQueue = (config.wheelQueue || []).filter((m) => m !== n);
  bumpConfig();
  return true;
}

export function setWheelQueue(list) {
  if (!Array.isArray(list)) return false;
  const set = new Set(config.people);
  const valid = list.map((s) => String(s).trim()).filter((m) => m && set.has(m));
  config.wheelQueue = valid;
  persist();
  return valid;
}

export function getWheelQueue() {
  return config.wheelQueue || [];
}

export function clearWheelQueue() {
  config.wheelQueue = [];
  persist();
  return true;
}

export function setLayout(rowDefs) {
  if (!Array.isArray(rowDefs) || rowDefs.length === 0) return false;
  const defs = rowDefs
    .map((r) => ({
      label: String(r.label || "").trim(),
      count: Math.max(0, parseInt(r.count, 10) || 0),
    }))
    .filter((r) => r.label && r.count > 0);
  if (defs.length === 0) return false;
  config.layout = makeLayout(defs);
  bumpConfig();
  return true;
}

let groupSeq = 1;
function nextGroupId() {
  return `g${Date.now().toString(36)}${groupSeq++}`;
}

export function addGroup(members, label) {
  const set = new Set(config.people);
  const valid = [...new Set(members.map((s) => String(s).trim()).filter(Boolean))]
    .filter((m) => set.has(m));
  if (valid.length === 0) return { ok: false, reason: "no-valid-members" };
  const group = {
    id: nextGroupId(),
    label: label || `Nhóm ${(config.groups?.length || 0) + 1}`,
    members: valid,
  };
  config.groups = config.groups || [];
  config.groups.push(group);
  bumpConfig();
  return { ok: true, group };
}

export function removeGroup(id) {
  config.groups = (config.groups || []).filter((g) => g.id !== id);
  bumpConfig();
  return true;
}

export function clearGroups() {
  config.groups = [];
  bumpConfig();
  return true;
}

export function resetPeopleToDefault() {
  const d = defaultConfig();
  config.people = [...d.people];
  const set = new Set(config.people);
  config.groups = (config.groups || []).map((g) => ({
    ...g,
    members: g.members.filter((m) => set.has(m)),
  }));
  config.wheelQueue = (config.wheelQueue || []).filter((m) => set.has(m));
  bumpConfig();
  return config.people;
}

export function resetAll() {
  config = defaultConfig();
  lastResult = null;
  lastResultVenue = null;
  lastWheel = null;
  lastSpinAt = null;
  bumpConfig();
  return true;
}

export function setGroups(groups) {
  if (!Array.isArray(groups)) return false;
  const set = new Set(config.people);
  config.groups = groups
    .map((g, i) => ({
      id: g.id || nextGroupId(),
      label: g.label || `Nhóm ${i + 1}`,
      members: [...new Set((g.members || []).map((m) => String(m).trim()))].filter(
        (m) => m && set.has(m)
      ),
    }))
    .filter((g) => g.members.length > 0);
  bumpConfig();
  return true;
}
