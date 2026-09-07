// Persistenza. La board sta sempre nel browser; in più, quando c'è, parla con
// un archivio remoto che la rende la stessa per tutti.
//
//   locale     → solo localStorage: la board vive in questo browser
//   condivisa  → Supabase (sito pubblicato), oppure il database dell'artifact
//                di Claude quando la pagina gira lì dentro
//
// I due archivi remoti espongono la stessa interfaccia — setTask, patchTask,
// deleteTask, setGroups — così il resto del file non sa quale sta usando.

import { normalizeTask, normalizeGroup, sortTasks, sortGroups } from "./model.js";
import { supabaseConfigured } from "./config.js";
import { createSupabaseRemote } from "./remote-supabase.js";

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
  let remote = null;
  let migrated = false;
  let me = "";

  try {
    me = localStorage.getItem(LS_ME) || "";
  } catch (e) {
    me = "";
  }

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

  /** Cambia il messaggio senza toccare la modalità: un salvataggio fallito
   *  non significa che la board sia tornata locale. */
  function note(text) {
    statusText = text;
    emit();
  }

  function stampOf() {
    return { updatedAt: new Date().toISOString(), by: me };
  }

  // --- scritture ----------------------------------------------------------

  function saveTask(task) {
    const clean = normalizeTask(Object.assign({}, task, stampOf()), task.id);
    tasks.set(clean.id, clean);
    mirror();
    emit();
    if (remote) remote.setTask(clean);
    return clean;
  }

  function patchTask(id, patch) {
    const current = tasks.get(id);
    if (!current) return null;
    const next = normalizeTask(Object.assign({}, current, patch, stampOf()), id);
    tasks.set(id, next);
    mirror();
    emit();
    if (remote) remote.patchTask(id, Object.assign({}, patch, stampOf()), next);
    return next;
  }

  function removeTask(id) {
    tasks.delete(id);
    mirror();
    emit();
    if (remote) remote.deleteTask(id);
  }

  function saveGroups(next) {
    groups = sortGroups(next.map(normalizeGroup));
    mirror();
    emit();
    if (remote) remote.setGroups(groups);
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

    if (remote) {
      for (const id of removed) remote.deleteTask(id);
      for (const t of tasks.values()) remote.setTask(t);
      remote.setGroups(groups);
    }
  }

  function clearBoard() {
    const ids = [...tasks.keys()];
    tasks.clear();
    groups = [];
    mirror();
    emit();
    if (remote) {
      for (const id of ids) remote.deleteTask(id);
      remote.setGroups(groups);
    }
  }

  // --- arrivo dei dati dagli altri ----------------------------------------

  function adoptTask(raw) {
    const t = normalizeTask(raw);
    tasks.set(t.id, t);
    mirror();
    emit();
  }

  function adoptGroups(list) {
    groups = sortGroups(list.map(normalizeGroup));
    mirror();
    emit();
  }

  function dropTask(id) {
    tasks.delete(id);
    mirror();
    emit();
  }

  /** Se l'archivio condiviso è vuoto e qui c'è del lavoro, lo si porta su una
   *  volta sola. Non sovrascrive niente di nessuno: è vuoto. */
  function seedIfEmpty(remoteIsEmpty) {
    if (migrated || !remoteIsEmpty) return;
    migrated = true;
    const local = [...tasks.values()];
    if (!local.length && !groups.length) return;
    for (const t of local) remote.setTask(t);
    if (groups.length) remote.setGroups(groups);
  }

  function adoptList(list) {
    if (!list.length) return;
    tasks.clear();
    for (const raw of list) {
      const t = normalizeTask(raw);
      tasks.set(t.id, t);
    }
    mirror();
    emit();
  }

  // --- Supabase ------------------------------------------------------------

  async function connectSupabase() {
    let pending = [];
    remote = await createSupabaseRemote({
      onTasks: list => { pending = list; },
      onTask: adoptTask,
      onTaskRemoved: dropTask,
      onGroups: adoptGroups,
      onStatus: text => setStatus("shared", text),
      onError: note
    });

    adoptList(pending);
    seedIfEmpty(pending.length === 0);
    setStatus("shared", "stato condiviso");
  }

  // --- database dell'artifact ----------------------------------------------

  async function connectArtifact() {
    const runtime = typeof window !== "undefined" && window.claude ? window.claude : null;
    if (!runtime || typeof runtime.use !== "function") return;

    let db;
    try {
      db = await runtime.use("db");
    } catch (e) {
      db = null;
    }
    if (!db) return;

    remote = {
      setTask(task) {
        return db.doc(TASKS + "/" + task.id).set(task).catch(() => note("salvataggio non riuscito"));
      },
      patchTask(id, patch, merged) {
        const ref = db.doc(TASKS + "/" + id);
        return ref.update(patch)
          .catch(err => {
            // update esige un documento già esistente: alla prima modifica lo si crea.
            if (err && err.code === "invalid_argument") return ref.set(merged);
            throw err;
          })
          .catch(() => note("salvataggio non riuscito"));
      },
      deleteTask(id) {
        return db.doc(TASKS + "/" + id).delete().catch(() => note("eliminazione non riuscita"));
      },
      setGroups(list) {
        return db.doc(META).set({ groups: list, updatedAt: new Date().toISOString() })
          .catch(() => note("salvataggio dei gruppi non riuscito"));
      }
    };

    db.collection(TASKS).onSnapshot(
      snap => {
        if (!snap.metadata.fromCache) seedIfEmpty(snap.empty);
        for (const change of snap.docChanges()) {
          if (change.type === "removed") tasks.delete(change.doc.id);
          else tasks.set(change.doc.id, normalizeTask(change.doc.data(), change.doc.id));
        }
        mirror();
        setStatus("shared", "stato condiviso");
      },
      err => {
        remote = null;
        setStatus("local", err && err.code === "revoked"
          ? "accesso condiviso revocato"
          : "solo su questo dispositivo");
      }
    );

    db.doc(META).onSnapshot(
      snap => {
        const data = snap.data();
        if (data && Array.isArray(data.groups)) adoptGroups(data.groups);
      },
      () => { /* i gruppi restano quelli locali */ }
    );
  }

  async function connect() {
    if (supabaseConfigured()) {
      try {
        await connectSupabase();
        return;
      } catch (err) {
        remote = null;
        setStatus("local", "archivio condiviso non raggiungibile");
        return;
      }
    }
    await connectArtifact();
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
