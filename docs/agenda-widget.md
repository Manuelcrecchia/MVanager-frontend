# Widget nativo «La mia agenda»

Il widget è incluso nell'app MVanager Android e nell'estensione iOS `AgendaWidget`.
Mostra i prossimi impegni dell'utente per sette giorni: lavoro assegnato e personali
di proprietà, comprese le aziende collegate da MVControlManager. Non include gli
appuntamenti dei colleghi, anche quando sono visibili nel calendario di lavoro.

## Utilizzo

In **Impostazioni dell'app → Impostazioni calendario → Widget La mia agenda**:

- abilitare o disabilitare il widget per l'account sul dispositivo;
- scegliere lavoro e personali, solo lavoro o solo personali;
- includere o escludere le aziende collegate;
- nascondere titoli, indirizzi e telefoni con la modalità riservata;
- richiedere l'aggiunta alla schermata principale su Android. Su iPhone vengono
  mostrate le istruzioni per l'aggiunta dal menu Widget del sistema.

Il tocco di un evento apre la scheda nell'app, sulla specifica occorrenza anche
per gli appuntamenti ricorrenti. Il pulsante `+` apre il nuovo evento. Il link
contiene l'account di origine e viene verificato nuovamente nell'app: un widget
rimasto sullo schermo dopo un cambio di account non apre un ID nell'altro account.

Android mostra una lista scorrevole di appuntamenti, con Naviga e Chiama in ogni riga.
Naviga invia l’indirizzo con `ACTION_VIEW` e `geo:0,0?q=…`, senza specificare un’app:
Android usa il gestore predefinito per quell’azione oppure presenta la propria scelta.
La preferenza viene risolta a ogni tocco, anche se cambia con MVanager chiusa;
non viene salvata una copia del package all’avvio. L’app scelta decide come mostrare
la destinazione e avviare il percorso. Android Auto usa già `ACTION_NAVIGATE` con `geo:`.
Ogni azione ricontrolla account, validità della cache ed evento corrente prima di aprire la destinazione. Chiama apre il compositore del
telefono senza avviare automaticamente la chiamata. iPhone supporta piccolo,
medio e grande; tutti e tre includono Naviga e Chiama per l’evento visualizzato.
Da iOS 17 le frecce precedente/successivo sfogliano un evento alla volta senza aprire l’app, con indicatore posizione/totale. La selezione viene mantenuta per account e formato; se l’evento scompare o termina si torna al primo evento disponibile. Su iOS 15–16 si visualizza il primo evento senza frecce.
Da iOS 18, Naviga esegue un intent nell’estensione che restituisce un
`OpenURLIntent` con il collegamento HTTPS del navigatore scelto: non richiede
l’apertura di MVanager. Al primo accesso iPhone senza una scelta salvata viene
chiesto quale navigatore usare: Google Maps, Mappe o Waze fra le opzioni rilevate,
anche se ce n’è una sola. Il controllo avviene dopo il login normale o biometrico,
anche su installazioni esistenti aggiornate, per gli account con accesso al calendario.
Con Più tardi si continua senza salvare e la richiesta ritorna al prossimo accesso.
La scelta rimane su questo iPhone attraverso logout e cambio azienda; si può
modificarla in Impostazioni calendario → Navigatore del widget. Prima della scelta il
pulsante è disabilitato e il widget mostra un’indicazione.
Google Maps e Waze vengono rilevati tramite i loro schemi pubblici; iOS può
segnalare Mappe disponibile anche se disinstallata, quindi la presenza di Mappe
va verificata dall’utente. Nessuna selezione automatica viene dedotta da tale dato.
La richiesta iniziale non viene mostrata su web/Android o prima dell’accesso.
Se il salvataggio fallisce, la finestra permette di riprovare senza registrare
la configurazione come completata. Una lettura nativa fallita non blocca il login.
Chiama e Naviga su iOS 15–17 mantengono il collegamento a MVanager, che lo
intercetta nativamente e apre Mappe o Telefono senza passare dalla scheda evento.
In questi casi MVanager può comparire brevemente durante il passaggio.
Il collegamento contiene account e ID evento: indirizzo e telefono vengono risolti
dalla cache corrente, verificando sessione, validità, scadenza e riservatezza.
Su CarPlay (widget da iOS 26) il nuovo Naviga non usa il link che avvia MVanager.
Le prove su iPhone USB/iOS 27 e CarPlay Simulator hanno mostrato Waze tramite
banner; Google ha mostrato il banner sia con coordinate sia con l’indirizzo
testuale di produzione, ma non in tutti i tentativi. Il banner Google scompare
rapidamente e richiede un secondo tocco. Mappe ha ricevuto
il percorso, visibile in CarPlay dopo apertura manuale della sua icona. Non è
garantito il cambio automatico di schermata sul display dell’auto. Vedere
[rapporto delle prove](../ios/Experiments/MapKitWidgetProbe/README.md).
Il 22 ottobre, dal widget di collaudo sulla Home dello stesso iPhone, tutti e tre
i navigatori hanno aperto la destinazione corretta con gli URL di produzione,
senza portare in primo piano il contenitore. Le prove usano una destinazione
pubblica isolata dai dati MVanager; non coprono autoradio fisiche, assenza di rete
o tutte le versioni iOS. Una prova successiva con telefono bloccato ha confermato
l'esecuzione dei tre intent, senza rendere costante il passaggio al navigatore
sul display CarPlay.
Dal 22 ottobre Chiama usa un App Intent diretto: il numero dell'evento
visualizzato viene ricontrollato nella cache al momento del tocco. Su iPhone
fisico con iOS 27 e CarPlay Simulator il pulsante di prova ha chiamato il 177
senza aprire MVanager; la chiamata è stata terminata dal display CarPlay.
Il comportamento di `tel:` tramite `OpenURLIntent` è osservato su questa versione,
ma non è garantito dal contratto pubblico dell'API per altre versioni iOS.
Il formato piccolo con più Link va verificato sulla versione iOS di destinazione.
Le azioni sono presenti solo quando indirizzo/telefono dell'evento sono disponibili;
non viene cercato un indirizzo di fatturazione come ripiego.

## Backend e sessione

Sono necessari anche gli aggiornamenti del backend MVanager:

- `POST /appointments/widget/session`: JWT amministratore con `CALENDAR_VIEW`,
  UUID del dispositivo e filtri; genera una credenziale casuale valida 30 giorni.
- `POST /appointments/widget/revoke`: revoca del dispositivo dell'utente;
  `sessionId` impedisce a un logout ritardato di revocare una sessione successiva.
- `GET /appointments/widget/feed`: richiede `Authorization: Widget …` e tenant;
  la credenziale non è accettata dalle normali API del calendario o di modifica.

Il server conserva solo l'hash del segreto in `Settings`, con chiave per utente e
dispositivo. Non serve una nuova tabella. Ogni richiesta verifica account, email,
permessi correnti e policy di federazione. Il feed espande le ricorrenze,
considera le eccezioni e include gli eventi in corso; restituisce al massimo 64
occorrenze e non trasmette note, identificativi cliente/preventivo o destinatari.
I filtri e la modalità riservata sono applicati prima dell'invio dei dati.

Il JWT dell'app non viene passato al codice nativo. Android cifra configurazione
e cache con AndroidKeyStore e le esclude dai backup. iOS conserva la credenziale
nel Keychain condiviso; la cache protetta nell'App Group contiene solo un'impronta
del token. Logout, disabilitazione e cambio account cancellano la cache. Le risposte
in ritardo verificano la sessione prima di aggiornare i dati. Un 401/403 dal feed
invalida anche la copia locale.

## Aggiornamenti e distribuzione

### Verifica release del 22 ottobre 2026

Il widget iPhone/Android è implementato e il bundle web di produzione è stato
copiato in entrambi i progetti nativi. Build web, iOS Release e Android Release
compilate; 44 test Angular mirati e 13 test iOS del widget superati. La suite backend completa ha 711
test superati, nessun fallimento e tre salti; il test MariaDB di concorrenza
richiede il proprio ambiente isolato.
Questo prepara il codice, non una pubblicazione: l'AAB Android generato è senza
firma, la build iOS Release locale usa ancora un profilo di sviluppo, e la versione
rimane 7.3 / build 55. Prima dell'invio agli store servono numero di versione
nuovo, firma di distribuzione, installazione di una build candidata e collaudo
su dispositivi Android/iPhone con il backend di produzione aggiornato.

Le chiamate dal widget CarPlay sono state confermate soltanto su iOS 27 con
CarPlay Simulator e iPhone fisico. L'apertura del navigatore sul display CarPlay
resta intermittente. L'app CarPlay completa non ha l'entitlement Apple richiesto;
l'integrazione Android Auto richiede ancora collaudo su host e revisione Play.

Non è presente un pulsante di aggiornamento manuale. Dopo il salvataggio, la
modifica o l’eliminazione di un evento l’app scarica automaticamente il feed
aggiornato e richiede il ridisegno del widget, anche senza socket. Se un download
è già in corso, la modifica richiede una lettura successiva. iOS richiede inoltre
il ridisegno quando l’app passa in background. Le impostazioni mostrano l’ora e
il numero di impegni effettivamente scaricati oppure l’errore di sincronizzazione.

Android richiede gli aggiornamenti periodici ogni 30 minuti; i messaggi push
ricevuti e gli aggiornamenti dell’app aggiornano il feed.
iOS usa WidgetKit, con richiesta di aggiornamento a 30 minuti e timeline che fa
avanzare la lista quando terminano gli eventi. Il sistema decide i tempi effettivi;
non è garantito un aggiornamento immediato con l'app chiusa. Senza rete rimangono
i dati scaricati e l'ora dell'ultima sincronizzazione; quando l'orizzonte scade il
widget non presenta l'assenza di dati come disponibilità verificata.

Prima della firma iOS sul portale Apple occorre abilitare per app ed estensione:

- App Group `group.it.mvtechcore.mvanager.agenda`;
- Keychain Sharing `$(AppIdentifierPrefix)it.mvtechcore.mvanager.agenda`;
- bundle dell'estensione `it.mvtechcore.mvanager.AgendaWidget`.

Gli entitlement e il target incorporato sono già nel progetto Xcode. Il target
del widget non richiede l'entitlement globale `com.apple.developer.default-data-protection`:
la protezione della cache è applicata esplicitamente in scrittura, e la credenziale
usa il livello Keychain `AfterFirstUnlockThisDeviceOnly`. Questo evita un conflitto
con il livello Data Protection previsto dal profilo di provisioning automatico.
Il target
minimo dell'app e dei pod è allineato a iOS 15, come il Podfile, per compilare con
l'SDK Xcode installato. Il feed richiede HTTPS nelle build distribuite; Android e iOS
ammettono HTTP soltanto nelle build debug. Non sono stati modificati collegamenti
reali tra aziende, firmate build per dispositivi o pubblicate nuove versioni.

## Verifiche del 20 ottobre 2026

- build Angular, Android debug e app/estensione iOS per simulatore riuscite;
- 46 test Angular mirati passati, inclusi sessione dedicata, logout durante la
  creazione della credenziale e link da un account precedente;
- 21 test backend di widget, federazione, personali e contatti passati;
- 5 verifiche API su due database tenant temporanei passate: filtri, isolamento,
  credenziali inutilizzabili sulle normali API, revoca identità e permessi;
- 4 test strumentali Android passati su emulatore dedicato API 36: cifratura,
  pulizia e risposte obsolete, inflazione delle vere RemoteViews, richiesta HTTP
  con credenziale dedicata e cancellazione su 401.

I collaudi hanno usato dati fittizi e invii email/notifiche bloccati. Resta da
verificare l'aggiunta e l'interazione dalla schermata principale su telefoni
fisici, inclusi launcher Android diversi e i link esterni del widget iOS. La
compilazione iOS non certifica firma, provisioning o aggiornamenti sul dispositivo.
Il widget piccolo può essere aggiunto a CarPlay da iOS 26. Per le schermate
auto con destinazioni, navigazione e chiamata vedere `car-agenda.md`.

## Verifiche del 21 ottobre 2026

- 52 test Angular passati dopo la correzione della sincronizzazione automatica,
  inclusi eventi personali salvati senza socket e aggiornamenti concorrenti.
- 6 test nativi iOS passati su simulatore dedicato con firma locale: download
  personale e scrittura nel vero App Group, Keychain, cache offline, revoca,
  risposta dopo logout e ammissione dell’endpoint HTTP nella build debug.
  Le risposte di rete sono simulate con URLProtocol; nessun cliente reale.
- Bundle mobileLocal ricompilato e copiato nei progetti nativi mantenendo il
  server locale configurato. Nessun comando di aggiornamento manuale.

I test iOS richiedono un simulatore dedicato e la firma locale del test host
(`CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=-`), perché App Group e Keychain
non sono disponibili in un’app senza entitlement. Schema: AgendaWidgetTests.
Non eseguire i test con l’account reale: puliscono la configurazione del widget.
Rimane da confermare il comportamento visivo sulla schermata Home dell’iPhone
fisico dopo l’installazione della nuova build.

### Verifica sfogliamento e lista scorrevole (21 ottobre 2026)

Build iOS/Android riuscite. Nove test iOS superati sul simulatore dedicato;
otto test agenda Android superati sull’emulatore (widget e auto). La suite Android
completa include anche il test di esempio Capacitor preesistente, che fallisce
perché si aspetta `com.getcapacitor.app` invece del package MVanager.
I controlli includono selezione del secondo evento, numero/indirizzo della riga,
scadenza, riservatezza e cambio account. Il tocco delle frecce nel vero host
WidgetKit e lo scorrimento nei diversi launcher restano da provare su dispositivo.
