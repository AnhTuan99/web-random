import express from "express";
import { fileURLToPath } from "url";
import path from "path";
import {
  getState,
  setMode,
  setVenue,
  doSpin,
  setPeople,
  setLayout,
  setGroups,
  addGroup,
  removeGroup,
  clearGroups,
} from "./src/store.js";
import { startTelegramBot } from "./src/telegram.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/state", (req, res) => res.json(getState()));

app.post("/api/mode", (req, res) => {
  if (!setMode(req.body?.mode))
    return res.status(400).json({ error: "mode = 'natural' | 'arranged'" });
  res.json({ ok: true, state: getState() });
});

app.post("/api/venue", (req, res) => {
  if (!setVenue(req.body?.venue))
    return res.status(400).json({ error: "venue = 'cinema' | 'office' | 'normal'" });
  res.json({ ok: true, state: getState() });
});

app.post("/api/spin", (req, res) => {
  const result = doSpin();
  res.json({ ok: true, result, state: getState() });
});

app.post("/api/people", (req, res) => {
  if (!setPeople(req.body?.people))
    return res.status(400).json({ error: "people phải là mảng tên" });
  res.json({ ok: true, state: getState() });
});

app.post("/api/layout", (req, res) => {
  if (!setLayout(req.body?.rows))
    return res.status(400).json({ error: "rows = [{label, count}]" });
  res.json({ ok: true, state: getState() });
});

app.post("/api/groups", (req, res) => {
  if (!setGroups(req.body?.groups))
    return res.status(400).json({ error: "groups = [{label, members}]" });
  res.json({ ok: true, state: getState() });
});

app.post("/api/groups/add", (req, res) => {
  const r = addGroup(req.body?.members || [], req.body?.label);
  if (!r.ok) return res.status(400).json({ error: "không có thành viên hợp lệ" });
  res.json({ ok: true, group: r.group, state: getState() });
});

app.delete("/api/groups/:id", (req, res) => {
  removeGroup(req.params.id);
  res.json({ ok: true, state: getState() });
});

app.post("/api/groups/clear", (req, res) => {
  clearGroups();
  res.json({ ok: true, state: getState() });
});

app.get("/health", (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`🌐 Web chạy tại http://localhost:${PORT}`);
  startTelegramBot();
});
