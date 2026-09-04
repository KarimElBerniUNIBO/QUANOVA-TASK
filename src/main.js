// Avvio: collega store, interfaccia ed editor, e gestisce le azioni della
// barra in alto (import, export, gruppi, svuota).

import { createStore } from "./store.js";
import { createUI, createEditor } from "./ui.js";
import { exportBoard, importBoard, newGroup, UNGROUPED } from "./model.js";

const store = createStore();
const noteTimers = new Map();

const actions = {
  create(groupId) {
    editor.open(null, groupId);
  },
  edit(task) {
    editor.open(task);
  },
  remove(task) {
    const label = task.title ? "«" + task.title + "»" : "questa task";
    if (!window.confirm("Eliminare " + label + "? L'operazione non si annulla.")) return;
    store.removeTask(task.id);
  },
  move(task, siblings, direction) {
    const index = siblings.findIndex(t => t.id === task.id);
    const target = siblings[index + direction];
    if (!target) return;
    const a = task.order;
    const b = target.order;
    // Se due task hanno finito con lo stesso ordine, si ridistribuisce il gruppo.
    if (a === b) {
      siblings.forEach((t, i) => store.patchTask(t.id, { order: (i + 1) * 100 }));
      return;
    }
    store.patchTask(task.id, { order: b });
    store.patchTask(target.id, { order: a });
  },
  toggleStep(task, index, checked) {
    const steps = task.steps.map((s, i) => (i === index ? { text: s.text, done: checked } : s));
    store.patchTask(task.id, { steps });
  },
  setStatus(task, status) {
    store.patchTask(task.id, { status });
  },
  setNote(task, note) {
    clearTimeout(noteTimers.get(task.id));
    noteTimers.set(task.id, setTimeout(() => store.patchTask(task.id, { note }), 600));
  },
  importFile() {
    document.getElementById("import-file").click();
  }
};

const ui = createUI(store, actions);
const editor = createEditor(store, task => {
  store.saveTask(task);
  ui.openTask(task.id);
  ui.render();
});

// --- barra in alto ---------------------------------------------------------

document.getElementById("btn-new").addEventListener("click", () => actions.create());
document.getElementById("btn-import").addEventListener("click", () => actions.importFile());
document.getElementById("btn-export").addEventListener("click", exportJson);
document.getElementById("btn-groups").addEventListener("click", openGroups);
document.getElementById("btn-clear").addEventListener("click", clearBoard);

document.getElementById("me").addEventListener("input", e => {
  store.setMe(e.target.value);
});

document.getElementById("import-file").addEventListener("change", async event => {
  const file = event.target.files && event.target.files[0];
  event.target.value = "";
  if (!file) return;
  try {
    const board = importBoard(await file.text());
    const current = store.tasks().length;
    if (current && !window.confirm(
      "Importare " + board.tasks.length + " task? Le " + current + " attuali verranno sostituite."
    )) return;
    store.replaceBoard(board);
    ui.render();
    toast(board.tasks.length + " task importate.");
  } catch (err) {
    toast(err.message || "Import non riuscito.", true);
  }
});

async function exportJson() {
  const data = JSON.stringify(exportBoard(store.tasks(), store.groups()), null, 2);
  const filename = "board-" + new Date().toISOString().slice(0, 10) + ".json";

  // Nel viewer degli artifact i download partono solo dalla capability:
  // un <a download> resta inerte. Fuori, il link è la via normale.
  const runtime = typeof window !== "undefined" && window.claude ? window.claude : null;
  if (runtime && typeof runtime.use === "function") {
    try {
      const downloads = await runtime.use("downloads");
      if (downloads) {
        await downloads.save({ filename, data });
        toast("Board esportata.");
        return;
      }
    } catch (err) {
      if (err && err.code === "declined") return;
      /* si prova con il link */
    }
  }

  const url = URL.createObjectURL(new Blob([data], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast("Board esportata.");
}

function clearBoard() {
  const n = store.tasks().length;
  if (!n && !store.groups().length) return;
  if (!window.confirm(
    "Svuotare la board? " + n + " task e tutti i gruppi verranno eliminati" +
    (store.mode === "shared" ? " per tutti quelli che hanno il link." : ".") +
    "\n\nEsporta prima un JSON se vuoi conservarli."
  )) return;
  store.clearBoard();
  ui.render();
  toast("Board svuotata.");
}

// --- gruppi ----------------------------------------------------------------

const groupsDialog = document.getElementById("groups");

function openGroups() {
  renderGroups();
  groupsDialog.showModal();
}

function renderGroups() {
  const list = document.getElementById("groups-list");
  list.innerHTML = "";
  const groups = store.groups();

  if (!groups.length) {
    const p = document.createElement("p");
    p.className = "none";
    p.textContent = "Nessun gruppo. Le task senza gruppo restano in fondo alla board.";
    list.appendChild(p);
  }

  for (const g of groups) {
    const row = document.createElement("div");
    row.className = "grow";

    const name = document.createElement("input");
    name.type = "text";
    name.value = g.name;
    name.placeholder = "Nome";
    name.addEventListener("change", () => {
      store.saveGroups(store.groups().map(x => (x.id === g.id ? Object.assign({}, x, { name: name.value }) : x)));
      ui.render();
    });

    const win = document.createElement("input");
    win.type = "text";
    win.value = g.window;
    win.placeholder = "Periodo";
    win.addEventListener("change", () => {
      store.saveGroups(store.groups().map(x => (x.id === g.id ? Object.assign({}, x, { window: win.value }) : x)));
      ui.render();
    });

    const del = document.createElement("button");
    del.type = "button";
    del.className = "ibtn danger";
    del.textContent = "✕";
    del.title = "Elimina gruppo";
    del.setAttribute("aria-label", "Elimina il gruppo " + g.name);
    del.addEventListener("click", () => {
      const inside = store.tasks().filter(t => t.group === g.id);
      if (!window.confirm(inside.length
        ? "Eliminare «" + g.name + "»? Le sue " + inside.length + " task restano, senza gruppo."
        : "Eliminare «" + g.name + "»?")) return;
      for (const t of inside) store.patchTask(t.id, { group: UNGROUPED });
      store.saveGroups(store.groups().filter(x => x.id !== g.id));
      renderGroups();
      ui.render();
    });

    row.append(name, win, del);
    list.appendChild(row);
  }
}

document.getElementById("groups-add").addEventListener("click", () => {
  store.saveGroups(store.groups().concat(newGroup({ order: Date.now() })));
  renderGroups();
  ui.render();
});

document.getElementById("groups-close").addEventListener("click", () => groupsDialog.close());

// --- avvisi ----------------------------------------------------------------

let toastTimer = null;

function toast(message, isError) {
  const box = document.getElementById("toast");
  box.textContent = message;
  box.className = "toast on" + (isError ? " err" : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { box.className = "toast"; }, 4000);
}

// --- avvio -----------------------------------------------------------------

store.subscribe(() => {
  if (!ui.focusedInTextarea()) ui.render();
});

ui.render();
store.connect();

// Tiene veri i "2 ore fa" senza interrompere chi sta scrivendo una nota.
setInterval(() => {
  if (!ui.focusedInTextarea()) ui.render();
}, 60000);
