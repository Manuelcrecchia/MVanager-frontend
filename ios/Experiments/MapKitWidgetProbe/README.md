# Esperimento Naviga dal widget CarPlay — 21–22 ottobre 2026

## Sesta sessione: navigazione e pulsante Chiama (22 ottobre 2026)

Sul medesimo iPhone fisico collegato al CarPlay Simulator, il widget isolato ha
inviato l'indirizzo pubblico «Piazza Grande, Modena, Italia» ai tre navigatori
con gli URL prodotti da `AgendaNavigator.directionsURL`:

- Google Maps: anteprima corretta sul telefono, con «Avvia in CarPlay»; il
  display dell'auto è rimasto sul widget, senza banner in questo tentativo.
- Mappe: anteprima corretta sul telefono; il display dell'auto è rimasto sul
  widget. Non è stata avviata la guida.
- Waze: guida verso Piazza Grande avviata sul telefono; il percorso è stato
  immediatamente fermato. Il display dell'auto è rimasto sul widget in questo
  tentativo; in una sessione precedente il banner Waze aveva portato alla guida
  sul display CarPlay.

Il test conferma l'invio affidabile della destinazione dal widget alle tre app,
ma **non** l'apertura affidabile del navigatore sul display CarPlay. Per Google
Maps e Mappe occorre oggi aprire la rispettiva app sul display se il banner non
compare. MVanager non è stata aperta dai pulsanti del widget.

### Prova con iPhone bloccato

Con lo stesso iPhone fisico bloccato e lo schermo nero, sono stati toccati dal
widget CarPlay i pulsanti Mappe (17:26:18), Google Maps (17:26:39) e Waze
(17:27:03). Ogni tocco ha aggiornato l'indicatore dell'App Intent nel widget;
il display CarPlay è rimasto sul widget e non è apparso alcun banner nei tre
tentativi. Aprendo poi Waze dall'icona CarPlay, l'app era disponibile sul
display e mostrava un avviso relativo al percorso («Pass necessario»), chiuso
senza iniziare la guida. Il telefono è rimasto bloccato. Questo singolo giro di
prova esclude che lo schermo acceso fosse la causa necessaria del mancato
passaggio automatico al navigatore. Non prova che ciascuna app abbia mostrato
la destinazione sul telefono bloccato: quel controllo è stato fatto solo nella
prova precedente a telefono sbloccato.

Per Chiama era stato compilato e installato temporaneamente un widget di prova
con `Link(tel:+12025550100)` e un App Intent separato. Il tocco sul `Link`
dal display CarPlay non aveva prodotto alcun effetto visibile. Il controllo
automatico aveva fermato il test dell'App Intent per il rischio di una chiamata
reale non autorizzata. L'utente ha poi autorizzato esplicitamente una chiamata
al **177**. Il 22 ottobre alle 17:33:49, il widget di prova ha consegnato
`tel:177` tramite `OpenURLIntent`: sul display CarPlay si è aperta direttamente
l'interfaccia Telefono, con numero 177 e timer della chiamata. La chiamata è
stata terminata dal display dopo circa 30 secondi; MVanager non è stata aperta.
È un risultato empirico su iOS 27 e CarPlay Simulator con iPhone fisico:
[OpenURLIntent](https://developer.apple.com/documentation/appintents/openurlintent)
documenta i link universali, non promette che `tel:` funzioni su tutte le
versioni iOS. Il pulsante Chiama di MVanager usa ora lo stesso App Intent, con
numero risolto dal cache dell'evento selezionato al momento del tocco.

**Esito aggiornato: la variante Google R apre Google Maps in CarPlay senza
portare in primo piano l’app contenitore e con Apple Mappe disinstallata.**
Il pulsante del widget genera un banner Google Maps; toccando il banner si apre
l’anteprima del percorso sul display CarPlay. Occorre quindi un secondo tocco:
non è un passaggio automatico a Google Maps con la sola pressione sul widget.
Risultato riprodotto su iPhone reale con CarPlay Simulator, non su autoradio fisica.
Il percorso è ora integrato nel codice MVanager per iOS 18+, con scelta iniziale
del navigatore ricordata per dispositivo. Il 22 ottobre il banner Google è stato
osservato anche con l’indirizzo testuale di produzione, dopo aver chiuso l’anteprima
precedente. Il banner resta transitorio e non è comparso in tutti i tentativi.
Il risultato non garantisce il cambio di schermata CarPlay a ogni tocco.

**Navigatore predefinito del telefono: prova successiva negativa.** Con Google
Maps selezionato nelle impostazioni iOS, `geo-navigation` apre correttamente Google
nel controllo in foreground, ma restituisce `false` dal comando CarPlay eseguito
in background. I collegamenti Apple HTTPS provati aprono il browser sul telefono.
Il successo Google R non dimostra quindi il supporto automatico al navigatore
predefinito. Vedere la terza sessione sotto.

## Ricerca successiva e confronto NextStop, 22 ottobre 2026

Obiettivo ancora aperto: portare Google Maps o Mappe in primo piano sul display
CarPlay con il solo tocco del widget, senza aprire MVanager e senza dipendere da
un banner transitorio. La consegna del percorso al telefono e l'apertura della
schermata auto sono due risultati distinti.

- [NextStop](https://potatostudios.dev/nextstop) dichiara widget iPhone e CarPlay
  per inviare percorsi ad Apple Maps e Google Maps. Il produttore specifica anche
  che non controlla il comportamento delle app di navigazione, di iOS o CarPlay.
  Questa dichiarazione non costituisce una prova di apertura automatica del
  display auto. Installata temporaneamente la versione 1.1.1 (build 1), bundle
  `com.potato.nextstop.mapwidgets`, con consenso dell'utente. Usati esclusivamente
  i percorsi dimostrativi incorporati, senza selezionare contatti personali.
- Aggiunto il widget «NextStop · Prossimo», indicato dalla sua descrizione come
  quello da usare per CarPlay. Presente nella raccolta salvata nelle impostazioni
  iPhone, ma non visualizzato sul display del simulatore, anche dopo la riapertura
  del simulatore e la disattivazione/riattivazione di «Mostra widget». Il controllo
  remoto ha inoltre restituito `windowNotFoundAtPosition` e `noWindowsAvailable`.
  Non è stato possibile effettuare un tocco valido sul widget NextStop in CarPlay:
  il confronto dell'apertura è **inconclusivo**, non un risultato negativo
  dell'app. NextStop disinstallato al termine della prova temporanea e rimosso
  dalla raccolta. Reinserito MV MapKit Probe; resta in ultima posizione perché
  il trascinamento per ripristinare la prima posizione è bloccato dal controllo
  remoto. Gli altri quattro widget conservano il proprio ordine relativo.
  Waze e Mappe lasciati installati come richiesto dall'utente.
- Una [segnalazione di uno sviluppatore sui forum Apple](https://developer.apple.com/forums/thread/836595)
  descrive passaggi intermittenti a Mappe anche da un'app con entitlement
  `carplay-fueling`. L'autore riferisce tentativi con URL, API MapKit legate alla
  scena, ritardi e fallback senza risolvere il problema. È una testimonianza,
  non una diagnosi Apple né la dimostrazione della causa del nostro caso.
- Le API pubbliche esaminate non forniscono al nostro widget un parametro per
  scegliere il display CarPlay dell'app destinataria. `OpenURLIntent` documenta
  l'apertura di universal link; le API MapKit legate a una scena richiedono una
  scena dell'app chiamante. Il widget autonomo non possiede una scena CarPlay
  del navigatore. Non introdotte API private, entitlement non concessi o un
  fallback che porti MVanager in primo piano.

Fonti tecniche: [OpenURLIntent](https://developer.apple.com/documentation/appintents/openurlintent),
[MapKit e scena chiamante](https://developer.apple.com/documentation/mapkit/mkmapitem/openinmaps(launchoptions:from:completionhandler:)),
[supporto widget CarPlay](https://developer.apple.com/documentation/widgetkit/adding-standby-and-carplay-support-to-your-widget),
[Google Maps URL scheme](https://developers.google.com/maps/documentation/urls/ios-urlscheme).

## Quinta sessione: ripetizione controllata, 22 ottobre 2026

iPhone 17 Pro Max USB, iOS 27.0 (24A5380h), Device Hub / CarPlay Simulator di
Xcode 27.1. Google Maps 26.41.1, Waze 5.26.0, Mappe build 2972.30.6.12.16.
Waze e Mappe restano installate per richiesta esplicita dell’utente; nessuna
modifica al navigatore predefinito iOS. Prototipo isolato, indirizzo pubblico
Piazza Grande, Modena, Italia e URL generati dal codice di produzione.

| Ora | Azione dal widget CarPlay | Risultato osservato |
| --- | --- | --- |
| 11:46:03 | Google, indirizzo | Intent registrato; nessun banner osservato |
| 11:46:45 | Google, coordinate | Intent registrato; percorso corretto visibile aprendo manualmente Google in CarPlay |
| 11:48:17 | Google, coordinate, dopo chiusura anteprima e Home | Banner «Vuoi indicazioni in Maps?» osservato; scomparso prima di un tocco utile |
| 11:52:39 | Waze, indirizzo | Banner Waze; tocco sul banner apre Waze CarPlay con guida attiva; destinazione corretta confermata sul telefono, poi Stop |
| 11:56:45 | Mappe, indirizzo | Anteprima corretta sul telefono; nessun cambio di schermata CarPlay; chiuso avviso informativo iniziale di Mappe |
| 11:57:59 | Mappe, nuovo `/directions?destination=…&mode=driving`, dopo chiusura anteprima e Home | Coordinate corrette sul telefono, nessun cambio di schermata CarPlay |
| 12:00:10 | Google, indirizzo, dopo chiusura anteprima e Home | Banner osservato anche senza coordinate; scomparso prima di un tocco utile |

Il contatore del contenitore resta **9** per tutti i comandi CarPlay. Sale a 10
solo all’apertura manuale delle 12:03 durante la preparazione della prova Home.
Gli intent sono registrati nel processo `MapKitProbeWidget`. La distinzione
indirizzo/coordinate non spiega da sola il banner Google: non viene introdotta
una geocodifica aggiuntiva né una sostituzione dell’indirizzo con coordinate stimate.
I collegamenti Apple aggiornati non hanno risolto l’apertura della schermata auto.

### Controllo dalla Home dell’iPhone, CarPlay disconnesso

Il widget di collaudo è stato ridotto a tre pulsanti visibili nel formato piccolo,
uno per navigatore. L’apertura manuale del prototipo dopo l’installazione delle
12:10 porta il contatore a **11**; resta **11** dopo tutti e tre i comandi seguenti.

| Ora | Pulsante | Risultato osservato |
| --- | --- | --- |
| 12:11:24 | Google Maps | Anteprima del percorso verso Piazza Grande, Modena, con pulsante Avvia; anteprima poi chiusa |
| 12:15:35 | Mappe | Indicazioni verso «Piazza Grande, Modena, Italia», con pulsante Vai; anteprima poi chiusa |
| 12:16:19 | Waze | Guida attiva; riepilogo «Verso Piazza Grande, Modena, Emilia-Romagna» verificato, poi Stop |

Tutti e tre gli intent sono registrati in `MapKitProbeWidget`, senza una nuova
scena active nel contenitore. Questo verifica l’apertura tramite gli stessi URL
e la stessa restituzione di `OpenURLIntent` usati in produzione; non è una prova
completa di login, evento e selezione navigatore nel widget MVanager reale.
La build MVanager aggiornata è stata installata prima del collaudo. Le prove
automatiche della scelta al login e la build iOS erano già passate; in questa
sessione non sono stati creati eventi, contattati clienti o inviate notifiche.

Evidenze: `output/navigation-reliability-2026-10-22/` nella cartella superiore
al repository frontend: `google-address-banner.png`, `waze-address-banner.png`,
`waze-address-destination.png`, `apple-address-phone.png`, `apple-unified-phone.png`,
`host-start.plist`, `host-before-home-tests.plist`, `extension-carplay.plist`,
`google-home-widget.png`, `apple-home-widget.png`, `waze-home-destination.png`,
`host-after-home-tests.plist`, `extension-after-home-tests.plist`.
Le prove sono su iPhone fisico con display CarPlay simulato: non costituiscono
un collaudo su autoradio reale, con telefono bloccato o offline.

## Quarta sessione: tre navigatori e scelta esplicita (22:37–23:04)

Stesso iPhone USB, iOS 27.0 (24A5380h), CarPlay Simulator di Xcode 27.1.
Google Maps 26.41.1; Waze 5.26.0 e Mappe build 2972.30.6.12.16 installate
temporaneamente con autorizzazione, primo avvio completato dall’utente. Destinazione
pubblica «Piazza Grande, Modena, Italia», senza account o eventi MVanager.

Il prototipo compila anche `AgendaWidgetStore.swift` della produzione e usa
`AgendaNavigator.directionsURL` per confrontare esattamente gli stessi URL.
Il costruttore non legge account o App Group nel prototipo. I pulsanti restituiscono
`OpenURLIntent` dall’estensione; non richiedono il foreground del contenitore.

| Ora | Prova | Risultato osservato |
| --- | --- | --- |
| 22:37–22:40 | Rilevamento prima delle installazioni | Google true, Waze false, Mappe true anche da disinstallata; anche `map` e `mapitem` true |
| 22:48:00 | Controllo dopo riapertura della finestra CarPlay | Intent dell’estensione eseguito; prima della riapertura i pulsanti non rispondevano dopo reinstallazione |
| 22:48:10 / 22:52:20 | Mappe HTTPS | Tentativi interferiti dal primo avvio; avviso facoltativo di miglioramento Mappe rifiutato |
| 22:53:23 | Mappe HTTPS dopo primo avvio | Percorso corretto sul telefono; CarPlay resta sul widget, nessun banner osservato |
| 22:53:51 | Waze HTTPS | Banner CarPlay con istruzione; toccandolo Waze mostra la navigazione sul display, destinazione Piazza Grande confermata sul telefono |
| 22:54 | Fine Waze | Percorso di prova terminato con Stop; `navigate=yes` aveva avviato la guida automaticamente |
| 22:55:15 | Google HTTPS con indirizzo testuale | Anteprima corretta sul telefono, senza banner CarPlay osservato |
| 22:56 | Apertura manuale icona Mappe su CarPlay | Anteprima Piazza Grande già disponibile; nessun Avvia/Vai premuto |
| 22:57:05 | Mappe HTTPS dopo attivazione schermata CarPlay | Ancora nessun cambio automatico di schermata |
| 22:58:30 | Google dopo attivazione della sua schermata CarPlay | Ancora anteprima sul telefono, nessun banner osservato |
| 23:00:50 | Google con parametro ufficiale `dir_action=navigate` | Sul telefono «Apri Google Maps in CarPlay per continuare»; nessuna apertura automatica CarPlay |
| 23:01:07 / 23:01:13 | MapKit A e B con Mappe installata | Entrambe restituiscono `false`; CarPlay rimane sul widget |

Il contatore `probe.foregroundCount` resta **8**, con ultima attivazione 22:40:27
e background 22:41:27, per tutta la sessione. I log riportano gli intent nel
processo `MapKitProbeWidget`. Non equivale a una prova con processo principale
terminato o telefono bloccato. Non sono state effettuate chiamate.

Conclusione: i tre collegamenti consegnano l’indirizzo al navigatore senza aprire
l’app contenitore. La visualizzazione su CarPlay è diversa: Waze ha funzionato
tramite banner, Mappe richiede l’apertura della propria icona; Google con indirizzo
testuale non ha riprodotto il banner ottenuto prima con coordinate. Non è stata
isolata la causa di questa differenza. `dir_action=navigate` resta una variante
del solo prototipo; la produzione mantiene l’anteprima Google.

L’utente ha scelto **scelta iniziale sempre, poi ricordata**, senza deduzioni
automatiche dal numero di app rilevate. La preferenza vale per questo iPhone,
anche dopo cambio azienda/logout. Waze e Mappe sono state rimosse al termine;
verifica `devicectl` mostra solo Google Maps fra i tre navigatori. La preferenza
di navigazione iOS non è stata modificata.

Implementazione verificata con 12 test nativi (cache corrente, evento selezionato,
sessione/privacy/scadenza, preferenza e URL con caratteri speciali), 11 test Angular,
build mobile e build iPhone firmata. Build MVanager installata sul telefono;
il collaudo dei collegamenti sopra resta effettuato con il prototipo isolato,
non con un appuntamento reale. Evidenze nella cartella output: `providers-*.png`,
`providers-final-host.plist`, `providers-final-extension.plist` e log build/test.
Alle 23:05–23:07, dopo accesso effettuato dall’utente, verificata anche la UI
MVanager reale: scelta iniziale vuota, Waze assente dopo rimozione, Google Maps
selezionato e salvato, poi ritrovato uscendo e riaprendo Impostazioni calendario.
Evidenze `navigation-setting-saved.png` e `navigation-setting-restored.png`.
Il feed reale aveva zero impegni futuri; non sono stati creati appuntamenti né
inviate notifiche per questa verifica.

Fonti per i collegamenti: [Google Maps URLs](https://developers.google.com/maps/documentation/urls/get-started),
[Waze Deep Links](https://developers.google.com/waze/deeplinks),
[Apple Map Links](https://developer.apple.com/library/archive/featuredarticles/iPhoneURLScheme_Reference/MapLinks/MapLinks.html).
Queste fonti documentano i collegamenti; i risultati CarPlay sono osservazioni
del test, non garanzie dei fornitori.

## Isolamento

App e widget SwiftUI autonomi, senza dipendenze dal calendario, account, API
MVanager, notifiche o dati clienti. Destinazione di prova: Piazza Grande, Modena,
coordinate 44.6458, 10.9257. Nessuna nuova capability CarPlay, App Group o modalità
audio/VoIP/Live Activity. Bundle distinti:

- `it.mvtechcore.mvanager.mapkitprobe`
- `it.mvtechcore.mvanager.mapkitprobe.widget`

Il progetto principale MVanager non è stato modificato per queste prove.

## Varianti

| Pulsante | Implementazione | Processo richiesto |
| --- | --- | --- |
| Naviga A | `MKMapItem.openInMaps(launchOptions:)`, modalità driving | Estensione widget, `openAppWhenRun = false` |
| Naviga B | `openInMaps(launchOptions:from:completionHandler:)`, scena `nil` | Estensione widget, `openAppWhenRun = false` |
| Controllo | Scrittura di un risultato e reload timeline | Estensione widget |
| Google G | `comgooglemaps://?daddr=44.6458,10.9257&directionsmode=driving` | iOS 27: `.main` con `supportedModes = .background` |
| Google U | `Button(intent: OpenURLIntent(googleUniversalURL))` | Intent di sistema direttamente sul pulsante |
| Google R | App Intent che restituisce `.result(opensIntent: OpenURLIntent(googleUniversalURL))` | Intent dell’estensione, `supportedModes = .background`; apertura delegata al sistema |
| Sistema D | `OpenURLIntent` come risultato, URL Apple `/directions?destination=…&mode=driving` | Estensione widget, background |
| Sistema L | `OpenURLIntent` come risultato, URL Apple `/?daddr=…&dirflg=d` | Estensione widget, background |
| Geo N | `UIApplication.open(geoNavigationURL)` | iOS 27: `.main` con `supportedModes = .background` |

La revisione corrente mostra N, A, Controllo e R; su iOS 26 mostra D al posto di N.
Le prove D/L sono state eseguite con la revisione intermedia che mostrava quei due
pulsanti. Le altre implementazioni restano nel sorgente come riferimento; U era
un `Button(intent: OpenURLIntent(ProbeNavigation.googleUniversalURL))` direttamente
nella vista della revisione precedente.
U e R usano lo stesso universal link Google:
`https://www.google.com/maps/dir/?api=1&destination=44.6458%2C10.9257&travelmode=driving`.
R non usa MapKit, `UIApplication`, uno schema personalizzato o un’apertura
dell’app contenitore. Le API usate da R sono compatibili con il deployment target
iOS 26; il comportamento CarPlay è stato verificato solo su iOS 27.

Google G e Geo N verificano alternative a MapKit. La loro implementazione UIKit è
compilata **solo nell’app**, tramite `PROBE_APP`. L’intent è dichiarato in entrambi
i target e `allowedExecutionTargets` limita l’esecuzione al processo principale,
senza richiederne l’interfaccia. Nessun fallback porta l’app in foreground.

L’esito G è conservato nel contenitore dell’app (`probe.googleResult` e
`probe.history`), non nel testo del widget: i due target hanno contenitori separati.
Il testo sotto i pulsanti mostra l’ultimo esito dell’estensione, incluso R.
N usa allo stesso modo `probe.defaultResult` e `probe.history` nel contenitore app:
non aggiorna il risultato visualizzato nel widget.

## Prove eseguite

Xcode 27.1, build 27A9275. Build simulatore iniziale e build dispositivo, inclusa
la variante Google, completate correttamente.

### Simulatore iPhone 17 Pro, iOS 26.5, Home Screen

- Controllo dall’app: MapKit restituisce `true` e apre Apple Mappe.
- Pulsante Controllo del widget: eseguito nel processo dell’estensione.
- Naviga A: `false`; Naviga B: callback `false`.
- Nessuna attivazione dell’interfaccia contenitore durante le pressioni A/B.
- Nessun percorso avviato. Permesso posizione non concesso sul simulatore.

Questo risultato riguarda il widget Home Screen e non dimostra da solo il
comportamento di CarPlay.

### iPhone 17 Pro Max reale, iOS 27.0, USB + CarPlay Simulator di Device Hub

Telefono sbloccato, interazione touch emulata dal Mac, profilo **CarPlay Simulator**
(nessuna modifica ai profili delle auto reali). Aggiunto il widget di prova in cima
alla raccolta del solo simulatore. App contenitore già avviata e poi in background.

| Ora locale | Prova | Esito osservato |
| --- | --- | --- |
| 19:52:24 | Controllo dal widget CarPlay | Testo aggiornato: azione eseguita |
| 19:52:31 | Naviga A dal widget CarPlay | `false`, CarPlay resta sul widget |
| 19:52:41 | Naviga B dal widget CarPlay | callback `false`, CarPlay resta sul widget |
| 19:53–19:56 | Verifica prerequisito MapKit | Apple Mappe assente; iOS mostra «Nessuna app di navigazione installata» |
| 19:56:23–19:56:34 | Controllo Google Maps dall’app | Dopo conferma «Apri», `true`; Google Maps mostra sul telefono il percorso verso le coordinate di prova |
| 19:57:03 | Google G dal widget CarPlay | Intent eseguito nel processo app con `applicationState = 2` (background); apertura URL restituisce `false` |

Dopo Google G il display CarPlay è rimasto sul widget e il telefono sulla Home.
`probe.foregroundCount` è rimasto **3**, identico al valore prima della pressione.
Il registro prova quindi che G è arrivato al processo giusto senza mostrare
l’interfaccia, ma non è riuscito ad aprire Google Maps. Il controllo in foreground
aveva `applicationState = 0` e restituiva `true` con lo stesso URL.

Non è stata avviata navigazione reale. L’anteprima Google del controllo è stata
chiusa prima del test dal widget. Non sono state effettuate chiamate.

**Limite essenziale:** il risultato MapKit sul dispositivo fisico è confuso
dall’assenza di Apple Mappe; non prova un divieto assoluto MapKit/CarPlay. Apple
Mappe non è stata reinstallata perché l’utente vuole usare solo Google Maps.
Il test Google G invece ha un controllo positivo sulla stessa installazione.
Non identifica il motivo interno del rifiuto oltre al risultato `false`.
Non sono stati testati un’autoradio fisica, telefono bloccato o app terminata;
G richiede iOS 27 e non è una soluzione verificata per iOS 26.

### Seconda sessione: universal link Google senza Apple Mappe

Stesso iPhone e collegamento USB, Google Maps installata, Apple Mappe ancora
assente. Build firmata U/R completata correttamente. Dopo l’installazione è stato
necessario riaprire la sessione CarPlay Simulator: prima non rispondeva nemmeno
il pulsante Controllo. Questi tentativi iniziali non sono stati valutati come
fallimenti di U/R. L’app è stata aperta manualmente una volta per inizializzare
la nuova versione, poi lasciata in background: baseline `probe.foregroundCount = 4`.

| Ora locale | Prova | Esito osservato |
| --- | --- | --- |
| 22:03:50 | Controllo | Log e testo widget aggiornati |
| circa 22:04 | Google U | Nessuna apertura osservata, telefono ancora sulla Home; nessuna diagnosi interna disponibile |
| 22:04:53 | Google R | Log nell’estensione, banner Google Maps «Vuoi indicazioni in Maps?» su CarPlay |
| 22:05–22:07 | Tocco sul banner R | Google Maps CarPlay mostra Piazza Grande, 41121 Modena MO, percorso e pulsante Avvia; anche il telefono mostra Google Maps |
| 22:08:17 | Ripetizione R, dopo chiusura anteprima e ritorno alla Home | Banner nuovamente presente; al controllo successivo era scomparso e CarPlay era ancora sul widget |
| 22:09:00 | Ripetizione R e tocco tempestivo sul banner | Nuovamente aperta l’anteprima verso Piazza Grande su CarPlay |

Le preferenze dell’app esportate dopo le prove mantengono il contatore a **4**,
senza nuove transizioni della scena in `active`. R è eseguito nel processo
dell’estensione. Non c’è un passaggio attraverso l’interfaccia dell’app di prova.
Il banner è transitorio: non va descritto come un’apertura automatica del display
Google Maps. Nessun pulsante Avvia è stato premuto, nessuna telefonata effettuata.

Restano da verificare integrazione con l’evento effettivamente mostrato dal widget
MVanager, iOS 26, telefono bloccato, app terminata, primo consenso all’apertura di
Google Maps e autoradio fisica. Il consenso del controllo Google precedente era
già stato concesso su questo dispositivo. Il risultato non prova il comportamento
in assenza di Google Maps o senza rete e non risolve il pulsante Chiama.

### Terza sessione: navigatore predefinito del telefono

Stesso iPhone, iOS 27.0, collegamento USB e CarPlay Simulator. In Impostazioni →
App → App di default → Navigazione, **Google Maps è già selezionato ed è l’unica
opzione disponibile**. Preferenza letta senza modificarla; Apple Mappe non
reinstallata e nessun altro navigatore installato per il test.

Due varianti usano i collegamenti HTTPS Apple invece del link specifico Google.
La terza usa lo schema che Apple documenta per le app di navigazione predefinite:
`geo-navigation:///directions?destination=44.6458%2C10.9257`. Non viene passato a
`OpenURLIntent`, che documenta il supporto dei soli universal link; N lo apre con
`UIApplication` nel processo principale in background. Non sono stati richiesti
entitlement da navigatore e non viene registrato `geo-navigation` come schema
ricevuto dall’app di prova: MVanager deve inviare la destinazione, non diventare
un navigatore.

| Ora locale | Prova | Esito osservato |
| --- | --- | --- |
| 22:17 | Lettura impostazioni iOS | Google Maps selezionato come navigatore di default |
| 22:17:49 | D dall’app, foreground | Apertura `true`, ma viene mostrato Brave su `maps.apple.com`, non il navigatore |
| 22:18:52 | Controllo CarPlay | Esecuzione nell’estensione confermata |
| 22:19:14 | D dal widget | CarPlay resta sul widget; sul telefono si apre Brave su `maps.apple.com` |
| 22:20:42 | L dal widget | CarPlay resta sul widget; Brave chiede sul telefono di aprire `maps://maps.apple.com/?daddr=…` |
| circa 22:22 | Conferma del passaggio L sul telefono | iOS mostra «Nessuna app di navigazione installata», nonostante la preferenza Google verificata |
| 22:23:17–22:23:44 | N dall’app, foreground | Dopo consenso Apri Google Maps: `true`, percorso verso `44.6458,10.9257` visualizzato |
| 22:25:14 | Controllo CarPlay dopo aggiornamento N | Esecuzione nell’estensione confermata |
| 22:25:32 | N dal widget CarPlay | Intent eseguito nel processo principale con stato `2` (background), apertura `false` |

Prima di N dal widget, l’anteprima del controllo è stata chiusa e il telefono
riportato alla Home, verificata visivamente. Dopo N, telefono ancora sulla Home,
CarPlay ancora sul widget e `probe.foregroundCount` invariato a **6**. Anche tra
D/L e la successiva apertura manuale della nuova build non sono registrate
attivazioni della scena (contatore **5**). Sono quindi distinti il controllo
positivo N in foreground e il suo rifiuto in background; non si tratta di una
destinazione malformata o di assenza di Google Maps.

L’esito non identifica la causa interna del rifiuto e non dimostra impossibilità
su ogni configurazione iOS. Non sono stati provati cambio del navigatore di
default, Waze, iOS 26, telefono bloccato o autoradio fisica. La configurazione di
sistema dell’utente è rimasta invariata. Nessuna integrazione in produzione:
questa sessione non ha soddisfatto il requisito del navigatore predefinito dal
widget CarPlay senza mostrare l’app.

Evidenze aggiuntive nella cartella output: `default-navigation-setting.png`,
`carplay-default-D.png`, `carplay-default-L.png`, `default-L-no-navigation-app.png`,
`default-N-host-google.png`, `carplay-default-N.png`, preferenze prima/dopo N e log
`device-default-build.log` e `device-default-geo-build.log` (entrambi build riuscite).

## Riproduzione

Aprire `MapKitWidgetProbe.xcodeproj`, schema `MapKitProbe`. Il generatore Ruby usa
la gemma `xcodeproj` e serve solo a ricreare il progetto quando quello generato non
esiste. Non sovrascrive un progetto esistente. Deployment target iOS 26; G e N
richiedono iOS 27. Per dispositivo selezionare il proprio Development Team.

```sh
xcodebuild -project MapKitWidgetProbe.xcodeproj -scheme MapKitProbe \
  -configuration Debug -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath /tmp/mapkit-probe-build CODE_SIGNING_ALLOWED=NO build
```

Per CarPlay, collegare un iPhone via USB e aprire CarPlay Simulator da Device Hub.
Su iPhone: Impostazioni → Generali → CarPlay → CarPlay Simulator → Widget.
Aggiungere **MV MapKit Probe / MapKit · Prova**. Aprire l’app una volta, annotare il
contatore, lasciarla in background, quindi premere prima Controllo e poi la variante.
Nel simulatore CarPlay il controllo direzionale sinistro dalla dashboard consente
di raggiungere la pagina widget. Valutare entrambi i display, non solo il booleano.

Per i log usare il sottosistema `it.mvtechcore.mvanager.mapkitprobe`; per G è
possibile esportare il solo file delle preferenze del bundle di prova con
`devicectl device copy from`, dominio `appDataContainer`.
Lo stesso vale per N. Per D/L/R esportare le preferenze del bundle dell’estensione.

Artefatti locali della sessione, fuori dal repository frontend:
`../../../../output/mapkit-widget-probe-2026-10-21/` (dalla radice frontend usare
`../output/mapkit-widget-probe-2026-10-21/`). Include build log, log simulatore,
screenshot CarPlay A/B, banner e percorso R, preferenze dell’app prima/dopo G e R,
preferenze dell’estensione e `device-universal-build.log`. I percorsi DerivedData
sono temporanei; il progetto qui è la sorgente riproducibile.

## Riferimenti

- [Apple: OpenURLIntent, utilizzabile come risultato di un altro intent; richiede universal link](https://developer.apple.com/documentation/appintents/openurlintent)
- [Google: Maps URLs e parametri delle indicazioni](https://developers.google.com/maps/documentation/urls/get-started)
- [Google: URL scheme iOS e parametri direzioni](https://developers.google.com/maps/documentation/urls/ios-urlscheme)
- [Apple: allowedExecutionTargets](https://developer.apple.com/documentation/appintents/appintent/allowedexecutiontargets)
- [Apple: comportamento runtime App Intent](https://developer.apple.com/documentation/appintents/configuring-the-runtime-behavior-of-your-app-intents)
- [Apple: supporto widget CarPlay](https://developer.apple.com/documentation/widgetkit/adding-standby-and-carplay-support-to-your-widget)
- [Apple: navigatore predefinito](https://developer.apple.com/documentation/mapkit/preparing-your-app-to-be-the-default-navigation-app)

La scelta del navigatore predefinito esiste nelle regioni supportate, ma non
dimostra che un widget possa aprirlo: tale impostazione è stata verificata senza
cambiarla. Google G/R usano esplicitamente collegamenti Google; N verifica invece
la richiesta al navigatore predefinito.
