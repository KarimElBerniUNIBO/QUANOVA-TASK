// Adattatore Supabase: stessa interfaccia che store.js usa per il database
// dell'artifact, così il resto dell'app non sa quale dei due sta parlando.
//
// Ogni task è una riga con il suo JSON dentro la colonna `data`: il formato
// resta quello di model.js, senza una seconda copia dello schema in SQL.

import { SUPABASE_URL, SUPABASE_ANON_KEY, BOARD_ID } from "./config.js";

const CLIENT_URL = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js";

let clientPromise = null;

function loadLibrary() {
  if (window.supabase && window.supabase.createClient) return Promise.resolve(window.supabase);
  return new Promise((resolve, reject) => {
    const tag = document.createElement("script");
    tag.src = CLIENT_URL;
    tag.async = true;
    tag.onload = () => {
      if (window.supabase && window.supabase.createClient) resolve(window.supabase);
      else reject(new Error("Libreria Supabase caricata ma incompleta"));
    };
    tag.onerror = () => reject(new Error("Impossibile caricare la libreria Supabase"));
    document.head.appendChild(tag);
  });
}

function getClient() {
  if (!clientPromise) {
    clientPromise = loadLibrary().then(lib => lib.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
      realtime: { params: { eventsPerSecond: 5 } }
    }));
  }
  return clientPromise;
}

/**
 * handlers:
 *   onTasks(list)     elenco completo delle task (al primo caricamento)
 *   onTask(task)      una task inserita o modificata da chiunque
 *   onTaskRemoved(id) una task eliminata
 *   onGroups(groups)  elenco dei gruppi
 *   onStatus(text)    messaggio da mostrare nell'indicatore
 *   onError(message)  guasto che riporta la board in locale
 */
export async function createSupabaseRemote(handlers) {
  const client = await getClient();

  const { data: rows, error } = await client
    .from("tasks")
    .select("id, data")
    .eq("board", BOARD_ID);
  if (error) throw new Error(error.message);

  handlers.onTasks(rows.map(r => r.data));

  const { data: groupRow, error: groupError } = await client
    .from("groups")
    .select("data")
    .eq("board", BOARD_ID)
    .maybeSingle();
  if (groupError) throw new Error(groupError.message);
  if (groupRow && Array.isArray(groupRow.data)) handlers.onGroups(groupRow.data);

  client
    .channel("board:" + BOARD_ID)
    .on("postgres_changes",
      { event: "*", schema: "public", table: "tasks", filter: "board=eq." + BOARD_ID },
      payload => {
        if (payload.eventType === "DELETE") handlers.onTaskRemoved(payload.old.id);
        else if (payload.new && payload.new.data) handlers.onTask(payload.new.data);
      })
    .on("postgres_changes",
      { event: "*", schema: "public", table: "groups", filter: "board=eq." + BOARD_ID },
      payload => {
        if (payload.new && Array.isArray(payload.new.data)) handlers.onGroups(payload.new.data);
      })
    .subscribe(status => {
      if (status === "SUBSCRIBED") handlers.onStatus("stato condiviso");
      else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        handlers.onStatus("riconnessione…");
      }
    });

  const fail = message => error => {
    if (error) handlers.onError(message);
  };

  return {
    async setTask(task) {
      const { error: e } = await client
        .from("tasks")
        .upsert({ id: task.id, board: BOARD_ID, data: task, updated_at: new Date().toISOString() });
      fail("salvataggio non riuscito")(e);
    },

    // Supabase non fonde i JSON lato server: si riscrive la task intera,
    // già fusa in memoria da store.js.
    async patchTask(id, _patch, merged) {
      const { error: e } = await client
        .from("tasks")
        .upsert({ id, board: BOARD_ID, data: merged, updated_at: new Date().toISOString() });
      fail("salvataggio non riuscito")(e);
    },

    async deleteTask(id) {
      const { error: e } = await client.from("tasks").delete().eq("id", id).eq("board", BOARD_ID);
      fail("eliminazione non riuscita")(e);
    },

    async setGroups(groups) {
      const { error: e } = await client
        .from("groups")
        .upsert({ board: BOARD_ID, data: groups, updated_at: new Date().toISOString() });
      fail("salvataggio dei gruppi non riuscito")(e);
    }
  };
}
