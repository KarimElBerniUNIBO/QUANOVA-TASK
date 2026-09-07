// Rendering. Costruisce il DOM a partire dallo stato dello store: nessuna
// libreria, nessun template in stringa, niente innerHTML su dati dell'utente.

import {
  STATUSES, PRIORITIES, EFFORTS, EFFORT_HINT, UNGROUPED,
  statusLabel, progress, counts, sortTasks, sortGroups, haystack, ago, stamp, newTask, newGroup
} from "./model.js";

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

export function createUI(store, actions) {
  const filters = { status: "all", priority: "all", q: "", group: "all" };
  const open = new Set();

  const nodes = {
    main: document.getElementById("main"),
    groupNav: document.getElementById("group-nav"),
    recent: document.getElementById("recent"),
    sync: document.getElementById("sync"),
    meterAll: document.getElementById("meter-all"),
    statDone: document.getElementById("stat-done"),
    statDoing: document.getElementById("stat-doing"),
    statBlocked: document.getElementById("stat-blocked")
  };

  // --- filtri ------------------------------------------------------------

  function matches(task) {
    if (filters.status === "open" && task.status === "done") return false;
    if (filters.status !== "all" && filters.status !== "open" && task.status !== filters.status) return false;
    if (filters.priority === "P0" && task.priority !== "P0") return false;
    if (filters.priority === "P0P1" && task.priority !== "P0" && task.priority !== "P1") return false;
    if (filters.group !== "all" && task.group !== filters.group) return false;
    if (filters.q && !haystack(task).includes(filters.q)) return false;
    return true;
  }

  // --- una task ----------------------------------------------------------

  function buildTask(task, siblings) {
    const wrap = el("article", "task" + (open.has(task.id) ? " open" : ""));
    wrap.dataset.status = task.status;
    wrap.dataset.pri = task.priority;

    const p = progress(task);
    const row = el("div", "row");

    const toggle = el("button", "rowbtn");
    toggle.type = "button";
    toggle.setAttribute("aria-expanded", open.has(task.id) ? "true" : "false");

    const main = el("span", "tmain");
    const title = el("span", "tt");
    title.appendChild(el("span", "tt-text", task.title || "Senza titolo"));
    if (task.priority === "P0") title.appendChild(el("span", "tag p0", "P0"));
    main.appendChild(title);

    const meta = el("span", "tmeta");
    const bits = [task.priority, "effort " + task.effort];
    if (task.deps.length) bits.push("dopo " + task.deps.join(" + "));
    for (const b of bits) meta.appendChild(el("span", null, b));
    const st = stamp(task);
    if (st) meta.appendChild(el("span", "stamp", st));
    main.appendChild(meta);

    const right = el("span", "tright");
    if (p.total) right.appendChild(el("span", "frac", p.done + "/" + p.total));
    const pill = el("span", "pill", statusLabel(task.status));
    pill.dataset.s = task.status;
    right.appendChild(pill);
    right.appendChild(el("span", "chev", "▶"));

    toggle.append(main, right);
    toggle.addEventListener("click", () => {
      if (open.has(task.id)) open.delete(task.id); else open.add(task.id);
      render();
    });

    const tools = el("span", "rowtools");
    const up = iconButton("↑", "Sposta su", () => actions.move(task, siblings, -1));
    const down = iconButton("↓", "Sposta giù", () => actions.move(task, siblings, 1));
    const edit = iconButton("✎", "Modifica", () => actions.edit(task));
    const del = iconButton("✕", "Elimina", () => actions.remove(task));
    del.classList.add("danger");
    tools.append(up, down, edit, del);

    row.append(toggle, tools);
    wrap.appendChild(row);

    if (!open.has(task.id)) return wrap;

    const body = el("div", "body");

    if (task.desc) body.appendChild(el("p", "why", task.desc));

    if (task.steps.length) {
      const steps = el("div", "steps");
      task.steps.forEach((step, i) => {
        const label = el("label", "step" + (step.done ? " on" : ""));
        const box = document.createElement("input");
        box.type = "checkbox";
        box.checked = step.done;
        box.addEventListener("change", () => actions.toggleStep(task, i, box.checked));
        label.append(box, el("span", null, step.text));
        steps.appendChild(label);
      });
      body.appendChild(steps);
    }

    const bar = el("div", "statusbtns");
    for (const s of STATUSES) {
      const b = el("button", "sbtn", s.l);
      b.type = "button";
      b.dataset.s = s.k;
      b.setAttribute("aria-pressed", task.status === s.k ? "true" : "false");
      b.addEventListener("click", () => actions.setStatus(task, s.k));
      bar.appendChild(b);
    }
    body.appendChild(bar);

    const noteRow = el("div", "noterow");
    noteRow.appendChild(el("span", null, "Note"));
    const note = document.createElement("textarea");
    note.value = task.note;
    note.placeholder = "Decisioni prese, blocchi, link…";
    note.addEventListener("input", () => actions.setNote(task, note.value));
    noteRow.appendChild(note);
    body.appendChild(noteRow);

    wrap.appendChild(body);
    return wrap;
  }

  function iconButton(glyph, label, onClick) {
    const b = el("button", "ibtn", glyph);
    b.type = "button";
    b.title = label;
    b.setAttribute("aria-label", label);
    b.addEventListener("click", onClick);
    return b;
  }

  // --- stato vuoto -------------------------------------------------------

  function buildEmpty() {
    const box = el("div", "blank");
    box.appendChild(el("h2", null, "La board è vuota"));
    box.appendChild(el("p", null,
      "Crea la prima task, oppure importa un file JSON esportato da un'altra board."));
    const row = el("div", "blankrow");
    const create = el("button", "primary", "Nuova task");
    create.type = "button";
    create.addEventListener("click", () => actions.create());
    const imp = el("button", "ghost", "Importa JSON");
    imp.type = "button";
    imp.addEventListener("click", () => actions.importFile());
    row.append(create, imp);
    box.appendChild(row);
    return box;
  }

  // --- board -------------------------------------------------------------

  function buildGroupSection(group, list) {
    const sec = el("section", "group");
    sec.id = "g-" + group.id;

    const head = el("div", "group-head");
    head.appendChild(el("h2", null, group.name));
    const doneCount = list.filter(t => t.status === "done").length;
    const right = el("span", "group-right");
    if (group.window) right.appendChild(el("span", "win", group.window));
    right.appendChild(el("span", "win", doneCount + "/" + list.length));
    const add = iconButton("+", "Aggiungi task in " + group.name, () => actions.create(group.id));
    right.appendChild(add);
    head.appendChild(right);
    sec.appendChild(head);

    if (group.goal) sec.appendChild(el("p", "group-goal", group.goal));

    const visible = list.filter(matches);
    const holder = el("div", "tasks");
    for (const t of visible) holder.appendChild(buildTask(t, list));
    if (!visible.length) holder.appendChild(el("p", "none", "Nessuna task che corrisponda ai filtri."));
    sec.appendChild(holder);
    return sec;
  }

  function render() {
    const all = store.tasks();
    const groups = store.groups();

    nodes.main.innerHTML = "";

    if (!all.length && !groups.length) {
      nodes.main.appendChild(buildEmpty());
    } else {
      const byGroup = new Map(groups.map(g => [g.id, []]));
      const loose = [];
      for (const t of all) {
        if (byGroup.has(t.group)) byGroup.get(t.group).push(t);
        else loose.push(t);
      }

      let shown = 0;
      for (const g of groups) {
        const list = sortTasks(byGroup.get(g.id));
        if (filters.group !== "all" && filters.group !== g.id) continue;
        shown += list.filter(matches).length;
        nodes.main.appendChild(buildGroupSection(g, list));
      }

      if (loose.length && (filters.group === "all" || filters.group === UNGROUPED)) {
        const list = sortTasks(loose);
        shown += list.filter(matches).length;
        nodes.main.appendChild(buildGroupSection(
          { id: UNGROUPED, name: "Senza gruppo", window: "", goal: "" }, list));
      }

      if (!shown && all.length) {
        nodes.main.appendChild(el("p", "empty", "Nessuna task corrisponde ai filtri."));
      }
    }

    renderStats(all);
    renderNav(all, groups);
    renderRecent(all);
    renderSync();
  }

  function renderStats(all) {
    const c = counts(all);
    nodes.statDone.textContent = c.done + "/" + c.total;
    nodes.statDoing.textContent = String(c.doing);
    nodes.statBlocked.textContent = String(c.blocked);
    nodes.meterAll.style.width = (c.total ? Math.round((c.done / c.total) * 100) : 0) + "%";
  }

  function renderSync() {
    nodes.sync.innerHTML = "";
    const dot = el("i", "dot " + (store.mode === "shared" ? "live" : "local"));
    nodes.sync.append(dot, document.createTextNode(store.statusText));
  }

  function renderNav(all, groups) {
    nodes.groupNav.innerHTML = "";

    const entries = [{ id: "all", name: "Tutte", list: all }];
    for (const g of groups) entries.push({ id: g.id, name: g.name, list: all.filter(t => t.group === g.id) });
    const loose = all.filter(t => !groups.some(g => g.id === t.group));
    if (loose.length) entries.push({ id: UNGROUPED, name: "Senza gruppo", list: loose });

    for (const entry of entries) {
      const b = el("button", "group-link" + (filters.group === entry.id ? " on" : ""));
      b.type = "button";
      b.append(el("span", "nm", entry.name));
      const done = entry.list.filter(t => t.status === "done").length;
      b.append(el("span", "ct mono", done + "/" + entry.list.length));
      b.addEventListener("click", () => {
        filters.group = entry.id;
        render();
      });
      nodes.groupNav.appendChild(b);
    }
  }

  function renderRecent(all) {
    nodes.recent.innerHTML = "";
    const touched = all
      .filter(t => t.updatedAt)
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
      .slice(0, 5);

    if (!touched.length) {
      nodes.recent.appendChild(el("p", "none", "Ancora nessuna modifica."));
      return;
    }

    for (const t of touched) {
      const b = el("button", "rec");
      b.type = "button";
      b.append(el("span", "rtitle", t.title || "Senza titolo"));
      const line = el("span", "rline");
      line.append(el("span", "rwho", t.by || "qualcuno"), el("span", "rwhen", " " + ago(t.updatedAt)));
      b.appendChild(line);
      b.addEventListener("click", () => {
        open.add(t.id);
        filters.group = "all";
        render();
        const node = document.getElementById("g-" + t.group);
        if (node) node.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      nodes.recent.appendChild(b);
    }
  }

  // --- filtri: eventi ----------------------------------------------------

  document.getElementById("f-status").addEventListener("change", e => {
    filters.status = e.target.value;
    render();
  });
  document.getElementById("f-priority").addEventListener("change", e => {
    filters.priority = e.target.value;
    render();
  });
  document.getElementById("f-q").addEventListener("input", e => {
    filters.q = e.target.value.trim().toLowerCase();
    render();
  });

  return {
    render,
    openTask(id) { open.add(id); },
    focusedInTextarea() {
      const a = document.activeElement;
      return !!a && a.tagName === "TEXTAREA";
    }
  };
}

// --- editor della task (dialog nativo) ------------------------------------

export function createEditor(store, onSave) {
  const dialog = document.getElementById("editor");
  const form = document.getElementById("editor-form");
  const fields = {
    title: document.getElementById("e-title"),
    group: document.getElementById("e-group"),
    status: document.getElementById("e-status"),
    priority: document.getElementById("e-priority"),
    effort: document.getElementById("e-effort"),
    desc: document.getElementById("e-desc"),
    deps: document.getElementById("e-deps"),
    steps: document.getElementById("e-steps"),
    hint: document.getElementById("e-effort-hint"),
    heading: document.getElementById("editor-title")
  };

  let current = null;

  function fillSelect(select, values, labels) {
    select.innerHTML = "";
    values.forEach((v, i) => {
      const o = document.createElement("option");
      o.value = v;
      o.textContent = labels ? labels[i] : v;
      select.appendChild(o);
    });
  }

  fillSelect(fields.status, STATUSES.map(s => s.k), STATUSES.map(s => s.l));
  fillSelect(fields.priority, PRIORITIES);
  fillSelect(fields.effort, EFFORTS);

  fields.effort.addEventListener("change", () => {
    fields.hint.textContent = EFFORT_HINT[fields.effort.value] || "";
  });

  function refreshGroups(selected) {
    const groups = store.groups();
    fields.group.innerHTML = "";
    const none = document.createElement("option");
    none.value = UNGROUPED;
    none.textContent = "Senza gruppo";
    fields.group.appendChild(none);
    for (const g of groups) {
      const o = document.createElement("option");
      o.value = g.id;
      o.textContent = g.name;
      fields.group.appendChild(o);
    }
    const add = document.createElement("option");
    add.value = "__new__";
    add.textContent = "＋ Nuovo gruppo…";
    fields.group.appendChild(add);
    fields.group.value = selected && groups.some(g => g.id === selected) ? selected : UNGROUPED;
  }

  fields.group.addEventListener("change", () => {
    if (fields.group.value !== "__new__") return;
    const name = window.prompt("Nome del nuovo gruppo");
    if (!name || !name.trim()) {
      refreshGroups(current ? current.group : UNGROUPED);
      return;
    }
    const groups = store.groups();
    const created = newGroup({ name: name.trim(), order: Date.now() });
    store.saveGroups(groups.concat(created));
    refreshGroups(created.id);
  });

  form.addEventListener("submit", event => {
    event.preventDefault();
    const steps = fields.steps.value
      .split("\n")
      .map(s => s.trim())
      .filter(Boolean)
      .map(text => {
        const before = current && current.steps.find(s => s.text === text);
        return { text, done: before ? before.done : false };
      });

    const patch = {
      title: fields.title.value.trim(),
      group: fields.group.value === "__new__" ? UNGROUPED : fields.group.value,
      status: fields.status.value,
      priority: fields.priority.value,
      effort: fields.effort.value,
      desc: fields.desc.value.trim(),
      deps: fields.deps.value.split(",").map(d => d.trim()).filter(Boolean),
      steps
    };

    if (!patch.title) {
      fields.title.focus();
      return;
    }

    onSave(current ? Object.assign({}, current, patch) : newTask(patch));
    dialog.close();
  });

  document.getElementById("editor-cancel").addEventListener("click", () => dialog.close());

  return {
    open(task, groupId) {
      current = task || null;
      fields.heading.textContent = task ? "Modifica task" : "Nuova task";
      fields.title.value = task ? task.title : "";
      fields.status.value = task ? task.status : "todo";
      fields.priority.value = task ? task.priority : "P2";
      fields.effort.value = task ? task.effort : "M";
      fields.hint.textContent = EFFORT_HINT[fields.effort.value] || "";
      fields.desc.value = task ? task.desc : "";
      fields.deps.value = task ? task.deps.join(", ") : "";
      fields.steps.value = task ? task.steps.map(s => s.text).join("\n") : "";
      refreshGroups(task ? task.group : groupId);
      dialog.showModal();
      fields.title.focus();
    }
  };
}
