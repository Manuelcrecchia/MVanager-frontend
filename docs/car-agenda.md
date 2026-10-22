# MVanager in auto

## Blocco verificato nel modulo Apple il 21 ottobre 2026

Il CarPlay Entitlement Addendum mostrato dal modulo ufficiale
https://developer.apple.com/contact/request/carplay/ (Rev. 06-08-2026),
sezione 3.10, esclude dalla categoria Driving Task le app progettate
principalmente come elenco di POI o località. L’attuale schermata Destinazioni
rientra in questa descrizione: la precedente proposta di richiedere Driving Task
non è quindi una strada verificata e non va inviata come dichiarazione di conformità.
Il codice CarPlay resta un prototipo non abilitato per distribuzione.
Non selezionare CarPlay.entitlements né inviare il testo proposto più sotto
senza prima un chiarimento esplicito di Apple sull’ammissibilità dell’esperienza.
Il modulo richiede l’accettazione dell’accordo prima dei successivi campi:
nessun accordo è stato accettato e nessuna richiesta è stata inviata.
Questo blocco riguarda l’app CarPlay completa, non il widget piccolo di iOS 26
né la distinta valutazione Android Auto.


## Funzioni implementate

Le schermate native «Destinazioni» per Android Auto e CarPlay mostrano fino a sei
prossimi appuntamenti con indirizzo operativo, nei sette giorni del feed.
Comprendono lavoro assegnato e personali di proprietà, anche nelle aziende
collegate secondo le autorizzazioni già esistenti. Nessuna sincronizzazione con
Google Calendar o Apple Calendario.

Selezionare una destinazione apre la scheda con data, indirizzo, Naviga e Chiama
(quando il telefono è presente e valido). Android delega alla navigazione scelta
dall’host e al compositore telefonico; iOS apre Apple Mappe e il collegamento tel.
La chiamata parte soltanto su azione esplicita dell’utente, con il flusso previsto
dal sistema. Non si implementa un navigatore turn-by-turn in MVanager.

La cache e la credenziale sono quelle del widget. I filtri del widget valgono
quindi anche per l’auto. Eventi riservati, senza indirizzo, terminati e cache oltre
l’orizzonte di validità non sono esposti come destinazioni. Non sono mostrati note,
dati di fatturazione o dettagli dei colleghi. Credenziali e account sono ricontrollati
prima di ogni azione; logout e cancellazione invalidano anche una scheda aperta.
Le schermate rileggono la cache ogni cinque secondi e scaricano il feed ogni minuto
mentre sono attive; Android interrompe il ciclo quando la schermata si ferma,
iOS alla disconnessione da CarPlay. Nessun pulsante Aggiorna.

## Android Auto: integrazione da collaudare sull’host

Il manifest dichiara un CarAppService nella categoria POI, con AndroidX Car App
1.7.0. L’esperienza è limitata alle destinazioni raggiungibili, senza creazione o
modifica del calendario durante la guida. La categoria è una proposta tecnica:
l’ammissione alla distribuzione dipende dalla revisione Google Play per auto;
non è garantita per un gestionale con appuntamenti.

L’host è verificato tramite l’allowlist di firme fornita da AndroidX, anche in debug.
Non è stato introdotto un validatore che accetta qualsiasi app chiamante.
Non sono richiesti permessi calendario, contatti, posizione o chiamata diretta.

Per il collaudo completo usare Android Auto Desktop Head Unit o una vettura con
un dispositivo di test. Provare lista e dettaglio, Naviga, Chiama, assenza rete,
eliminazione, cambio filtri e logout. I test Android strumentali costruiscono i
veri template con TestCarContext ma non simulano il sistema di navigazione auto.
Per una prova su un'auto reale, questa app basata su Car App Library deve essere
installata da una fonte attendibile, ad esempio Google Play Internal App Sharing
o Internal Testing: l'opzione sviluppatore «Origini sconosciute» di Android Auto
non si applica alle app Car App Library. L'APK installato via ADB è adatto al
collaudo con Desktop Head Unit, non basta per far comparire l'app sull'auto.
Riferimenti: https://developer.android.com/training/cars/testing e
https://developer.android.com/training/cars/distribute.

## CarPlay: abilitazione Apple necessaria

Sono compilati la scena AgendaCarPlayScene e i template Apple per lista e scheda.
La normale App.entitlements resta invariata. Il file App/CarPlay.entitlements
contiene anche com.apple.developer.carplay-driving-task ed è predisposto per
l’attivazione dopo autorizzazione Apple. Non selezionarlo prima per la build
sull’iPhone: un profilo privo della capability farebbe fallire la firma.

Richiedere la categoria Driving Task per il bundle it.mvtechcore.mvanager dal
portale Apple CarPlay. Solo dopo l’approvazione, rigenerare il provisioning e
impostare CODE_SIGN_ENTITLEMENTS del solo target App su App/CarPlay.entitlements.
La concessione non è garantita. Nessuna richiesta è stata inviata da questo lavoro.

Bozza precedente NON DA INVIARE: categoria incompatibile con il requisito rilevato sopra.

> MVanager helps field staff reach the destinations of their assigned site visits
> and their own appointments. The CarPlay experience is limited to a short list
> of upcoming destinations and a detail screen with address, time, navigation
> handoff to Apple Maps, and a phone action. It uses CPListTemplate and
> CPInformationTemplate, with at most two levels. It does not expose calendar
> editing, customer administration, billing, or account setup in the vehicle.
> Authentication and preferences are managed on the phone while parked.
> Private events and events without destinations are excluded. No external
> calendar account is required.

Il widget systemSmall già disponibile resta separato: può essere aggiunto a
CarPlay da iOS 26 anche senza l’abilitazione dell’app completa. La presenza del
widget non certifica navigazione o chiamata dal display auto. Le azioni delle
nuove schermate richiedono il collaudo con CarPlay e il profilo abilitato.
Il widget non richiede l'entitlement CarPlay dell'app completa. In Impostazioni
su iPhone: Generali → CarPlay → veicolo → Widget → Aggiungi widget → MVanager,
«La mia agenda». La selezione è associata al veicolo: il CarPlay Simulator e
l'auto reale vanno configurati separatamente. I pulsanti del widget funzionano
solo con un display touch; senza touch Apple li disattiva. Riferimenti:
https://developer.apple.com/documentation/widgetkit/adding-standby-and-carplay-support-to-your-widget
e https://support.apple.com/guide/iphone/customize-widgets-in-carplay-iphb4d6a0bbb/ios.

## Fonti

- https://developer.apple.com/carplay/
- https://developer.apple.com/videos/play/wwdc2025/216/
- https://developer.android.com/training/cars/apps/poi
- https://developer.android.com/training/cars/apps/library
- https://developer.android.com/jetpack/androidx/releases/car-app

## Verifica locale

Usare simulatori/emulatori dedicati: i test puliscono la cache condivisa del widget.
Android: AgendaCarTest e AgendaWidgetTest. iOS: schema AgendaWidgetTests.
La compilazione e i test dei template/dati non equivalgono al collaudo in auto
né all’approvazione degli store. Non sono state pubblicate nuove build.

Verifica del 21 ottobre 2026: 7 test iOS e 7 test Android superati su dispositivi
virtuali dedicati. Build Android debug e test APK riuscite. Nessuna chiamata reale,
invio email o modifica di eventi reali.
