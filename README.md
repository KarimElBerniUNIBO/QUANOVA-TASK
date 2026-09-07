# Banco

Task board a checklist. Ogni task ha stato, priorità, effort, passi spuntabili e note; chi apre la board vede l'avanzamento aggiornato in tempo reale e le modifiche restano firmate con il nome di chi le ha fatte.

Zero dipendenze: HTML, CSS e JavaScript standard. Nessun build necessario per usarla, nessun `node_modules`.

## Provala

```bash
npm start
```

Apre un server statico su <http://localhost:4173>. Serve un server perché il codice usa i moduli ES, che il browser non carica da `file://`.

La board parte vuota. Per vedere subito com'è piena, premi **Importa** e scegli `examples/roadmap-treddi.json` — 30 task su 6 fasi, con checklist e dipendenze.

## Cosa sa fare

- **Task** con titolo, gruppo, stato (da fare / in corso / fatta / bloccata), priorità P0–P3, effort S–XL, descrizione, dipendenze e note.
- **Checklist per task**: i passi si spuntano uno a uno e il contatore `3/7` resta visibile anche a task chiusa.
- **Gruppi** con nome e periodo, per organizzare la board in fasi, sprint o aree.
- **Filtri** per stato, priorità, gruppo e ricerca testuale su tutto il contenuto.
- **Firma e cronologia**: chi scrive il proprio nome firma ogni modifica; il pannello "Ultime modifiche" mostra le cinque task toccate più di recente.
- **Import ed export JSON**, per travasare una board, salvarne una copia o versionarla in git.

## Accesso

La board si apre con email e password. Gli account stanno in `src/accounts.js`: la password non c'è, c'è solo il risultato di **PBKDF2-SHA256 con 310.000 iterazioni** e un sale casuale diverso per ogni account. La sessione dura 30 giorni e il nome dell'account firma automaticamente ogni modifica.

Per cambiare una password o aggiungere una persona:

```bash
node scripts/hash-password.mjs nome@dominio.it "Nome" "nuova password"
```

Stampa una voce da sostituire in `src/accounts.js`. Chi viene tolto dal file perde la sessione al primo caricamento successivo.

### Cosa protegge davvero

Poco, ed è importante saperlo.

Il controllo gira nel browser di chi apre la pagina. Chiunque sappia usare gli strumenti per sviluppatori può saltarlo e leggere la board: **non è una barriera di sicurezza**, è un cancello contro chi arriva per caso, più un modo per sapere chi ha fatto cosa senza doverlo digitare. La barriera vera è chi può aprire la pagina: se è pubblicata come Artifact, l'accesso è limitato ai membri dell'organizzazione.

Due conseguenze pratiche:

- **non scrivere nelle note niente che non potrebbe leggere chi ha il link**;
- se il repo è pubblico, l'hash è pubblico. Con una password corta o comune, provarla a tappeto è solo questione di tempo di calcolo. Password lunga, o repo privato:

```bash
gh repo edit --visibility private
```

## Le due modalità di salvataggio

La stessa pagina funziona in due modi e lo dice sempre nell'indicatore in alto a destra.

| Modalità | Quando | Dove finiscono i dati |
|---|---|---|
| `solo su questo dispositivo` | nessun archivio remoto raggiungibile | `localStorage` del browser |
| `stato condiviso` | `src/config.js` compilato (sito su Vercel) | Supabase, condiviso tra tutti quelli che aprono l'indirizzo |
| `stato condiviso` | pubblicata come Artifact con la capability `db` | database dell'artifact, condiviso tra tutti quelli che hanno il link |

La pagina parte sempre in locale e passa a condivisa appena l'archivio risponde, così non resta mai bloccata ad aspettare. Se l'archivio condiviso è vuoto e su quel dispositivo c'era del lavoro, viene portato su una volta sola.

I due archivi remoti espongono la stessa interfaccia dentro `src/store.js` — `setTask`, `patchTask`, `deleteTask`, `setGroups` — quindi il resto dell'app non sa quale dei due sta usando, e aggiungerne un terzo significa scrivere solo quelle quattro funzioni.

## Deploy su Vercel, con la board condivisa

Sul sito pubblicato il tempo reale arriva da **Supabase**: il database dell'artifact di Claude esiste solo dentro quel visualizzatore, quindi fuori serve un archivio vero. Senza Supabase configurato il sito funziona lo stesso, ma ogni browser ha la sua board separata.

**1. Crea il progetto Supabase** (piano gratuito). Apri *SQL Editor*, incolla `supabase/schema.sql` ed esegui: crea le due tabelle, accende gli aggiornamenti in tempo reale e imposta le regole di accesso.

**2. Prendi le due chiavi** in *Project Settings → API*: il *Project URL* e la chiave pubblica *anon*.

**3. Collega il repo a Vercel** e aggiungi le variabili d'ambiente del progetto:

| Variabile | Valore |
|---|---|
| `SUPABASE_URL` | `https://xxxx.supabase.co` |
| `SUPABASE_ANON_KEY` | la chiave *anon* |
| `BOARD_ID` | un nome qualsiasi, es. `quanova` |

A ogni deploy Vercel esegue `scripts/config-from-env.mjs`, che genera `src/config.js` da queste variabili. **Le chiavi non entrano mai nel repo**, e se sbagli l'indirizzo il deploy si ferma con un messaggio invece di pubblicare un sito muto.

**4. Primo avvio**: apri il sito, accedi e premi *Importa* con un file JSON, oppure crea le task a mano. Se il tuo browser aveva già una board locale e su Supabase non c'è ancora niente, viene caricata su automaticamente, una volta sola.

Da quel momento tu e chi apre lo stesso indirizzo lavorate sulla stessa board: le modifiche degli altri compaiono senza ricaricare.

### Quanto è protetta

La chiave *anon* è pensata per stare nel browser, non è un segreto: a comandare sono le regole di accesso di Supabase. Quelle in `schema.sql` sono **aperte** — chi conosce indirizzo e chiave legge e scrive la board. Va bene per una board interna su un indirizzo che non pubblicizzi; per dati riservati serve Supabase Auth al posto del cancello che gira nel browser (istruzioni in coda a `schema.sql`).

## Pubblicarla come Artifact

```bash
npm run build
```

Genera `dist/artifact.html`, un unico file con CSS e JavaScript incorporati. Pubblicalo come Artifact dichiarando la capability `db`: da quel momento chi apre il link lavora sulla stessa board.

Due conseguenze da conoscere prima di condividere il link:

- una pagina con stato condiviso è **interna all'organizzazione**: chi la apre deve essere un membro connesso con il proprio account, e non è condivisibile pubblicamente;
- **chiunque abbia il link può modificare**, incluso premere *Svuota*. L'export JSON è la tua copia di sicurezza.

## Concorrenza

Le modifiche scrivono solo il campo toccato, quindi due persone che lavorano sulla stessa task nello stesso momento — una cambia lo stato, l'altra spunta un passo — non si sovrascrivono a vicenda.

Resta un caso limite dichiarato: se due persone modificano **lo stesso campo** insieme (la stessa nota, o la stessa checklist), vince l'ultima scrittura. Non ci sono transazioni né merge testuale.

## Struttura

```
index.html               pagina, schermata di accesso e finestre di dialogo
src/model.js             schema, validazione, import/export — funzioni pure
src/accounts.js          account abilitati (email, nome, hash PBKDF2)
src/auth.js              verifica della password e sessione
src/config.js            indirizzo e chiave di Supabase (vuoti = solo locale)
src/remote-supabase.js   adattatore Supabase: righe e tempo reale
src/store.js             persistenza: locale, Supabase o database dell'artifact
src/ui.js                rendering ed editor
src/main.js              avvio, accesso, azioni della barra in alto
src/styles.css           token di colore e stili
scripts/dev.mjs          server statico per lo sviluppo
scripts/build.mjs        impacchetta tutto in dist/artifact.html
scripts/hash-password.mjs genera la voce di un account
scripts/config-from-env.mjs genera src/config.js al deploy
supabase/schema.sql      tabelle, tempo reale e regole di accesso
examples/                board di esempio da importare
```

`src/model.js` non tocca il DOM e non salva niente: sono solo dati e funzioni pure, quindi è il punto da cui partire per capire il resto o per riusarlo altrove.

## Formato del file esportato

```json
{
  "schema": "banco.board",
  "version": 1,
  "exportedAt": "2026-09-04T12:00:00.000Z",
  "groups": [{ "id": "g-f0", "name": "Fondamenta", "window": "Sett. 1–6", "goal": "", "order": 100 }],
  "tasks": [{
    "id": "T-01",
    "title": "Device matrix del viewer",
    "group": "g-f0",
    "status": "todo",
    "priority": "P0",
    "effort": "L",
    "desc": "",
    "deps": [],
    "steps": [{ "text": "Definire le soglie", "done": false }],
    "note": "",
    "order": 100
  }]
}
```

In import ogni campo illeggibile viene sostituito con un valore valido, mai propagato: un file rovinato non può rompere la board. Le task che puntano a un gruppo inesistente finiscono in "Senza gruppo".

## Licenza

MIT.
