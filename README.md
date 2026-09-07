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
| `solo su questo dispositivo` | aperta in locale o su un hosting statico | `localStorage` del browser |
| `stato condiviso` | pubblicata come Artifact con la capability `db` | database dell'artifact, condiviso tra tutti quelli che hanno il link |

La pagina parte sempre in locale e passa a condivisa appena il database risponde, così non resta mai bloccata ad aspettare. Se la board condivisa è vuota e su quel dispositivo c'era del lavoro, viene portato su una volta sola.

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
src/store.js             persistenza: localStorage e database condiviso
src/ui.js                rendering ed editor
src/main.js              avvio, accesso, azioni della barra in alto
src/styles.css           token di colore e stili
scripts/dev.mjs          server statico per lo sviluppo
scripts/build.mjs        impacchetta tutto in dist/artifact.html
scripts/hash-password.mjs genera la voce di un account
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
