# Sala da Gioco — Risiko & Monopoly online

Sito statico (HTML + CSS + JS puro, nessun framework) per giocare a **Risiko** e **Monopoly**
con gli amici in tempo reale, usando **Supabase** come backend. Più partite possono
girare contemporaneamente: ogni tavolo ha un codice univoco e uno stato indipendente.

## 1. Configura Supabase (5 minuti)

1. Crea un account su [supabase.com](https://supabase.com) e crea un nuovo progetto (gratuito).
2. Apri **SQL Editor → New query**, incolla tutto il contenuto di `supabase-schema.sql`
   e premi **Run**. Questo crea le tabelle `games`, `players`, `history`, le policy di
   accesso e abilita il realtime.
3. Vai su **Project Settings → API** e copia:
   - **Project URL**
   - **anon public key**
4. Apri `js/supabaseClient.js` e incolla questi due valori al posto di
   `YOUR-PROJECT-REF` e `YOUR-ANON-PUBLIC-KEY`.

Non serve altro: niente server, niente backend da scrivere, Supabase gestisce database
e sincronizzazione realtime tra i browser di tutti i giocatori.

## 2. Metti il sito online

Il sito è composto da soli file statici, quindi puoi caricarlo ovunque:

- **Netlify / Vercel (drag & drop)**: trascina l'intera cartella nel loro pannello.
- **GitHub Pages**: crea un repository, carica i file, abilita Pages sul branch principale.
- **Qualsiasi hosting statico** (anche un semplice spazio FTP) va bene: apri `index.html`.

Non serve alcuna build (`npm install`, bundler, ecc.): sono file `.html`/`.css`/`.js`
pronti così come sono.

## 3. Come si gioca

1. Apri il sito, scegli **Risiko** o **Monopoly**, crea un tavolo con un nome e il tuo nome/colore.
2. Copia il link (bottone "Copia invito" in alto) e mandalo agli amici, oppure condividi
   il **codice a 5 caratteri** mostrato nella lista "Tavoli aperti" in home.
3. Quando tutti si sono uniti, l'host preme **Avvia partita**.
4. Si gioca a turni con le regole standard (vedi sotto). Ogni mossa importante viene
   registrata nello **storico** visibile a tutti in tempo reale.

Più tavoli possono essere aperti insieme: ognuno ha un proprio `id` di partita nell'URL
(`risiko.html?game=...` / `monopoly.html?game=...`) e uno stato completamente separato.

## 4. Regole implementate

### Risiko
- Mappa di 42 territori su 6 continenti (schematica, non geografica in scala, ma con
  tutte le adiacenze e i bonus continentali standard).
- Distribuzione casuale dei territori, posizionamento iniziale manuale delle armate,
  poi turni con **rinforzo → attacco → fortificazione**.
- Calcolo rinforzi: `max(3, territori/3) + bonus continenti interi posseduti`.
- Combattimento con dadi (fino a 3 attaccante / 2 difensore), il difensore vince i pareggi.
- Carte territorio (fanteria/cavalleria/artiglieria + jolly), tris validi e bonus
  crescente standard (4,6,8,10,12,15,+5...), +2 armate se possiedi il territorio raffigurato.
- Fortificazione: puoi spostare armate tra due tuoi territori collegati da una catena di
  territori posseduti (non solo adiacenti diretti), una volta a turno.
- Eliminazione di un giocatore quando perde l'ultimo territorio (le sue carte passano
  a chi lo elimina). Vittoria quando un giocatore controlla tutti i territori.

### Monopoly
- Plancia da 40 caselle con nomi originali (8 gruppi colore da 2-3 vie, 4 stazioni,
  2 società, imposte, Probabilità/Imprevisti, Prigione, Parcheggio Gratuito, Vai in Prigione).
- Compravendita di proprietà, affitti standard (incluso raddoppio su colore completo senza
  case, tariffe a scaglioni per stazioni, affitto = dadi×4/×10 per le società).
- Costruzione di case/hotel con regola di costruzione uniforme sul gruppo, vendita per
  metà prezzo, ipoteca automatica (e vendita automatica delle costruzioni) se un giocatore
  non ha liquidità per pagare un debito.
- Prigione con le tre opzioni classiche (pagare 50, carta "esci gratis", tentare i doppi),
  regola del terzo doppio consecutivo che manda in prigione.
- Mazzi Probabilità/Imprevisti con effetti vari (spostamenti, tasse, incassi, riparazioni,
  carte "esci di prigione gratis"...).
- Bancarotta e vittoria per ultimo giocatore rimasto in gioco.

### Semplificazioni volute (per restare un progetto gestibile)
- Niente aste quando un giocatore rifiuta di comprare una proprietà (resta semplicemente
  disponibile per chi ci passa sopra in seguito).
- Niente scambi/trattative dirette tra giocatori (si possono comunque accordare a voce).
- Risiko a 2 giocatori usa le stesse regole di piazzamento della versione "libera"
  (senza il mazzo neutrale della variante ufficiale a 2).

## 5. Struttura dei file

```
index.html              → home / lobby, crea o entra in un tavolo
risiko.html + js/risiko.js + js/risiko-data.js + css/risiko.css
monopoly.html + js/monopoly.js + js/monopoly-data.js + css/monopoly.css
style.css                → design system condiviso (feltro verde, ottone, pergamena)
js/supabaseClient.js     → configurazione e helper Supabase (⚠️ da compilare)
supabase-schema.sql      → schema del database da eseguire una tantum
```

## 6. Sicurezza

Per semplicità le policy di Row Level Security lasciano lettura/scrittura aperta a
chiunque conosca l'URL del progetto (va bene per giocare con amici fidati). Se vuoi
irrobustire il sistema in futuro puoi collegare l'autenticazione Supabase e restringere
le policy a `auth.uid()`.
