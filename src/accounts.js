// Account che possono aprire la board.
//
// La password non è qui: c'è solo il risultato di PBKDF2-SHA256, che non si
// può riportare indietro. Ogni account ha un sale diverso, così due password
// uguali non producono lo stesso hash.
//
// Per aggiungere una persona o cambiare una password:
//   node scripts/hash-password.mjs email@dominio.it "Nome" "password"
// e sostituisci qui la voce che stampa.
//
// Attenzione: questo file è nel repo. Se il repo è pubblico, l'hash è
// pubblico — con una password corta o comune, indovinarla è questione di
// tempo di calcolo. Vedi la sezione "Accesso" del README.

export const ACCOUNTS = [
  {
    email: "ebkarim@quanovastudio.com",
    name: "Karim",
    salt: "85e28990a58519611a5a0552a583bd55",
    hash: "d21c239ae328b7ed509498da44a81c03a3c1fdf189b8bea12c94f5e740dce9e1",
    iterations: 310000
  },
  {
    email: "alessandro@quanovastudio.com",
    name: "Alessandro",
    salt: "5952f08c65b4c7bb3cb54b9e913ebe57",
    hash: "108142c86a955d6ac65d491d4557b2e0aa7a91156f2db48ca6bf83c0d5a10b33",
    iterations: 310000
  }
];
