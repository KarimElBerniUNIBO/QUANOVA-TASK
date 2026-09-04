// Persistenza. Due modalità, stessa interfaccia:
//   - "local"  → localStorage, visibile solo su questo dispositivo
//   - "shared" → database dell'artifact, condiviso in tempo reale tra chi apre il link
// La pagina parte sempre in locale e passa a condivisa quando il database risponde,
// così non resta mai bloccata ad aspettare qualcosa che potrebbe non arrivare.

import { normalizeTask, normalizeGroup, sortTasks, sortGroups } from "./model.js";

const LS_TASKS = "banco.tasks.v1";
const LS_GROUPS = "banco.groups.v1";
const LS_ME = "banco.me.v1";

const TASKS = "tasks";
const META = "board/meta";

function readLS(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

function writeLS(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    /* storage pieno o bloccato: si continua in memoria */
  }
}

export function createStore() {
  const subs = new Set();
  const tasks = new Map();
  let groups = [];
  let mode = "local";
  let statusText = "solo su questo dispositivo";
  let db = null;
  let migrated = false;
  let me = "";

  try {
    me = localStorage.getItem(LS_ME) || "";
  } catch (e) {
    me = "";
  }

  // --- caricamento iniziale dal dispositivo -------------------------------

  for (const raw of readLS(LS_TASKS, [])) {
    const t = normalizeTask(raw);
    tasks.set(t.id, t);
  }
  groups = readLS(LS_GROUPS, []).map(normalizeGroup);

  function emit() {
    for (const fn of subs) fn();
  }

  function mirror() {
    writeLS(LS_TASKS, [...tasks.values()]);
    writeLS(LS_GROUPS, groups);
  }

  function setStatus(next, text) {
    mode = next;
    statusText = text;
    emit();
  }

  function stampOf() {
    return { updatedAt: new Date().toISOString(), by: me };
  }

  // --- scritture ----------------------------------------------------------

  function fail() {
    setStatus("local", "salvataggio non riuscito");
  }

  function pushTask(task) {
    if (!db) return;
    db.doc(TASKS + "/" + task.id).set(task).catch(fail);
  }

  function pushGroups() {
    if (!db) return;
    db.doc(META).set({ groups, updatedAt: new Date().toISOString() }).catch(fail);
  }

  function saveTask(task) {
    const clean = normalizeTask(Object.assign({}, task, stampOf()), task.id);
    tasks.set(clean.id, clean);
    mirror();
    emit();
    pushTask(clean);
    return clean;
  }

  /** Scrive solo i campi toccati: due persone sulla stessa task non si
   *  sovrascrivono a vicenda tutto il documento. */
  function patchTask(id, patch) {
    const current = tasks.get(id);
    if (!current) return null;
    const next = normalizeTask(Object.assign({}, current, patch, stampOf()), id);
    tasks.set(id, next);
    mirror();
    emit();

    if (db) {
      const body = Object.assign({}, patch, stampOf());
      const ref = db.doc(TASKS + "/" + id);
      ref.update(body)
        .catch(err => {
          // update esige un documento già esistente: alla prima modifica lo si crea.
          if (err && err.code === "invalid_argument") return ref.set(next);
          throw err;
        })
        .catch(fail);
    }
    return next;
  }

  function removeTask(id) {
    tasks.delete(id);
    mirror();
    emit();
    if (db) db.doc(TASKS + "/" + id).delete().catch(fail);
  }

  function saveGroups(next) {
    groups = sortGroups(next.map(normalizeGroup));
    mirror();
    emit();
    pushGroups();
    return groups;
  }

  function replaceBoard(board) {
    const removed = [...tasks.keys()].filter(id => !board.tasks.some(t => t.id === id));
    tasks.clear();
    for (const raw of board.tasks) {
      const t = normalizeTask(raw);
      tasks.set(t.id, t);
    }
    groups = sortGroups(board.groups.map(normalizeGroup));
    mirror();
    emit();

    if (db) {
      for (const id of removed) db.doc(TASKS + "/" + id).delete().catch(fail);
      for (const t of tasks.values()) pushTask(t);
      pushGroups();
    }
  }

  function clearBoard() {
    const ids = [...tasks.keys()];
    tasks.clear();
    groups = [];
    mirror();
    emit();
    if (db) {
      for (const id of ids) db.doc(TASKS + "/" + id).delete().catch(fail);
      pushGroups();
    }
  }

  // --- connessione allo stato condiviso -----------------------------------

  function adoptTasks(snap) {
    for (const change of snap.docChanges()) {
      if (change.type === "removed") tasks.delete(change.doc.id);
      else tasks.set(change.doc.id, normalizeTask(change.doc.data(), change.doc.id));
    }
    mirror();
  }

  function migrateIfEmpty(snap) {
    // Se la board condivisa è vuota e su questo dispositivo c'è del lavoro,
    // lo si porta su una volta sola. Nessun dato altrui viene toccato: è vuota.
    if (migrated || snap.metadata.fromCache || !snap.empty) return;
    migrated = true;
    const local = [...tasks.values()];
    if (!local.length && !groups.length) return;
    for (const t of local) pushTask(t);
    if (groups.length) pushGroups();
  }

  async function connect() {
    const runtime = typeof window !== "undefined" && window.claude ? window.claude : null;
    if (!runtime || typeof runtime.use !== "function") return;

    let store;
    try {
      store = await runtime.use("db");
    } catch (e) {
      store = null;
    }
    if (!store) return;
    db = store;

    db.collection(TASKS).onSnapshot(
      snap => {
        migrateIfEmpty(snap);
        adoptTasks(snap);
        setStatus("shared", "stato condiviso");
      },
      err => {
        db = null;
        setStatus("local", err && err.code === "revoked"
          ? "accesso condiviso revocato"
          : "solo su questo dispositivo");
      }
    );

    db.doc(META).onSnapshot(
      snap => {
        const data = snap.data();
        if (data && Array.isArray(data.groups)) {
          groups = sortGroups(data.groups.map(normalizeGroup));
          mirror();
          emit();
        }
      },
      () => { /* i gruppi restano quelli locali */ }
    );
  }

  return {
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    connect,
    get mode() { return mode; },
    get statusText() { return statusText; },
    get me() { return me; },
    setMe(name) {
      me = String(name || "").trim().slice(0, 40);
      try { localStorage.setItem(LS_ME, me); } catch (e) { /* ignora */ }
    },
    tasks() { return sortTasks([...tasks.values()]); },
    task(id) { return tasks.get(id) || null; },
    groups() { return sortGroups(groups); },
    saveTask,
    patchTask,
    removeTask,
    saveGroups,
    replaceBoard,
    clearBoard
  };
}
