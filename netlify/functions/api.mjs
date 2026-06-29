import {
  load,
  save,
  publicState,
  setMode,
  setVenue,
  setPeople,
  removePerson,
  setLayout,
  doSpin,
} from "./shared/state.mjs";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export default async (req) => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, ""); // bỏ dấu / cuối
  const method = req.method;
  const body = method === "POST" ? await req.json().catch(() => ({})) : {};

  const s = await load();


  if (path.endsWith("/state") && method === "GET") {
    return json(publicState(s));
  }

  if (path.endsWith("/spin") && method === "POST") {
    const result = doSpin(s);
    await save(s);
    return json({ ok: true, result, state: publicState(s) });
  }

  if (path.endsWith("/mode") && method === "POST") {
    if (!setMode(s, body.mode)) return json({ error: "mode invalid" }, 400);
    await save(s);
    return json({ ok: true, state: publicState(s) });
  }

  if (path.endsWith("/venue") && method === "POST") {
    if (!setVenue(s, body.venue)) return json({ error: "venue invalid" }, 400);
    await save(s);
    return json({ ok: true, state: publicState(s) });
  }

  if (path.endsWith("/people") && method === "POST") {
    if (!setPeople(s, body.people)) return json({ error: "people invalid" }, 400);
    await save(s);
    return json({ ok: true, state: publicState(s) });
  }

  if (path.endsWith("/people/remove") && method === "POST") {
    const ok = removePerson(s, body.name);
    await save(s);
    return json({ ok, state: publicState(s) });
  }

  if (path.endsWith("/layout") && method === "POST") {
    if (!setLayout(s, body.rows)) return json({ error: "rows invalid" }, 400);
    await save(s);
    return json({ ok: true, state: publicState(s) });
  }

  return json({ error: "not found", path }, 404);
};

export const config = {
  path: "/api/*",
};
