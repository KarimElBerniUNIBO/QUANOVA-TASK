// Schema della board e funzioni pure che ci lavorano sopra.
// Nessun accesso al DOM e nessuna persistenza: solo dati.

export const SCHEMA_VERSION = 1;

export const STATUSES = [
  { k: "todo", l: "Da fare" },
  { k: "doing", l: "In corso" },
  { k: "done", l: "Fatta" },
  { k: "blocked", l: "Bloccata" }
];

export const PRIORITIES = ["P0", "P1", "P2", "P3"];
export const EFFORTS = ["S", "M", "L", "XL"];

export const EFFORT_HINT = {
  S: "≈ 3 giorni",
  M: "≈ 1 settimana",
  L: "≈ 2–3 settimane",
  XL: "≈ 4+ settimane"
};

export const UNGROUPED = "__none__";

const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/** Id compatibile con la grammatica dei path del database condiviso. */
export function uid(prefix) {
  let s = "";
  const rnd = globalThis.crypto && globalThis.crypto.getRandomValues
    ? globalThis.crypto.getRandomValues(new Uint8Array(10))
    : Array.from({ length: 10 }, () => Math.floor(Math.random() * 256));
  for (const n of rnd) s += ID_ALPHABET[n % ID_ALPHABET.length];
  return (prefix || "t") + "-" + s;
}

export function statusLabel(k) {
  const found = STATUSES.find(s => s.k === k);
  return found ? found.l : k;
}

function str(v, max) {
  return typeof v === "string" ? v.slice(0, max || 4000) : "";
}

function oneOf(v, allowed, fallback) {
  return allowed.includes(v) ? v : fallback;
}

export function newTask(patch) {
  const now = new Date().toISOString();
  return Object.assign({
    id: uid("t"),
    title: "",
    group: UNGROUPED,
    status: "todo",
    priority: "P2",
    effort: "M",
    desc: "",
    deps: [],
    steps: [],
    note: "",
    order: Date.now(),
    createdAt: now,
    updatedAt: now,
    by: ""
  }, patch || {});
}

/** Accetta dati da database, localStorage o file importato e restituisce
 *  sempre una task valida. Un campo illeggibile viene sostituito, mai propagato. */
export function normalizeTask(raw, id) {
  const src = raw && typeof raw === "object" ? raw : {};
  const steps = Array.isArray(src.steps)
    ? src.steps.slice(0, 60).map(s => {
        if (typeof s === "string") return { text: s.slice(0, 500), done: false };
        return { text: str(s && s.text, 500), done: !!(s && s.done) };
      }).filter(s => s.text)
    : [];

  return {
    id: str(id || src.id, 60) || uid("t"),
    title: str(src.title, 200),
    group: str(src.group, 60) || UNGROUPED,
    status: oneOf(src.status, STATUSES.map(s => s.k), "todo"),
    priority: oneOf(src.priority, PRIORITIES, "P2"),
    effort: oneOf(src.effort, EFFORTS, "M"),
    desc: str(src.desc, 4000),
    deps: Array.isArray(src.deps) ? src.deps.map(d => str(d, 60)).filter(Boolean).slice(0, 20) : [],
    steps,
    note: str(src.note, 4000),
    order: Number.isFinite(src.order) ? src.order : 0,
    createdAt: str(src.createdAt, 40) || new Date().toISOString(),
    updatedAt: str(src.updatedAt, 40) || "",
    by: str(src.by, 40)
  };
}

export function newGroup(patch) {
  return Object.assign({
    id: uid("g"),
    name: "Nuovo gruppo",
    window: "",
    goal: "",
    order: Date.now()
  }, patch || {});
}

export function normalizeGroup(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  return {
    id: str(src.id, 60) || uid("g"),
    name: str(src.name, 120) || "Senza nome",
    window: str(src.window, 60),
    goal: str(src.goal, 1000),
    order: Number.isFinite(src.order) ? src.order : 0
  };
}

export function progress(task) {
  const total = task.steps.length;
  const done = task.steps.filter(s => s.done).length;
  return { done, total };
}

export function counts(tasks) {
  const out = { total: tasks.length, todo: 0, doing: 0, done: 0, blocked: 0 };
  for (const t of tasks) if (out[t.status] !== undefined) out[t.status] += 1;
  return out;
}

export function sortTasks(list) {
  return list.slice().sort((a, b) => (a.order - b.order) || a.createdAt.localeCompare(b.createdAt));
}

export function sortGroups(list) {
  return list.slice().sort((a, b) => (a.order - b.order) || a.name.localeCompare(b.name));
}

/** Testo di una task su cui cerca il campo di ricerca. */
export function haystack(task) {
  return [task.title, task.desc, task.note, task.deps.join(" "), task.steps.map(s => s.text).join(" ")]
    .join(" ")
    .toLowerCase();
}

export function exportBoard(tasks, groups) {
  return {
    schema: "banco.board",
    version: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    groups: sortGroups(groups),
    tasks: sortTasks(tasks)
  };
}

/** Legge un file esportato. Lancia un Error con messaggio leggibile se non lo è. */
export function importBoard(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error("Il file non è JSON valido.");
  }
  if (!data || typeof data !== "object") throw new Error("Il file non contiene una board.");
  if (!Array.isArray(data.tasks)) throw new Error("Nel file manca l'elenco delle task.");
  if (data.version && data.version > SCHEMA_VERSION) {
    throw new Error("Il file viene da una versione più recente di Banco.");
  }

  const groups = (Array.isArray(data.groups) ? data.groups : []).map(normalizeGroup);
  const known = new Set(groups.map(g => g.id));
  const tasks = data.tasks.slice(0, 2000).map(t => {
    const task = normalizeTask(t);
    if (task.group !== UNGROUPED && !known.has(task.group)) task.group = UNGROUPED;
    return task;
  });

  if (!tasks.length) throw new Error("Il file non contiene nessuna task.");
  return { tasks, groups };
}

export function ago(iso) {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const m = Math.floor((Date.now() - t) / 60000);
  if (m < 1) return "ora";
  if (m < 60) return m + " min fa";
  const h = Math.floor(m / 60);
  if (h < 24) return h + (h === 1 ? " ora fa" : " ore fa");
  const d = Math.floor(h / 24);
  if (d === 1) return "ieri";
  if (d < 14) return d + " giorni fa";
  return new Date(t).toLocaleDateString("it-IT", { day: "numeric", month: "short" });
}

export function stamp(task) {
  const when = ago(task.updatedAt);
  if (!when) return "";
  return (task.by ? task.by + " · " : "") + when;
}
