# Widget in auto: ricerca del 21 ottobre 2026

## Obiettivo ed esito

Mostrare gli appuntamenti MVanager in auto e usare Chiama/Naviga sull’evento
visualizzato, senza aprire l’interfaccia MVanager sul telefono, senza collegare
calendari esterni. Per Apple il requisito è il solo widget CarPlay.

Questa ricerca comprende documentazione Apple/Google, codice AndroidX,
discussioni tra sviluppatori e prodotti che dichiarano funzionalità analoghe.
La ricerca iniziale non costituiva una prova su un’autoradio. Successivamente è
stato eseguito un [esperimento isolato MapKit e Google Maps](../ios/Experiments/MapKitWidgetProbe/README.md)
su simulatore iPhone e su iPhone reale USB con CarPlay Simulator. La seconda
sessione ha trovato un percorso funzionante: un App Intent nell’estensione
restituisce `OpenURLIntent` con un universal link Google Maps. Sul display CarPlay
compare un banner Google Maps; toccandolo si apre l’anteprima del percorso, senza
attivare l’interfaccia dell’app contenitore e con Apple Mappe disinstallata.
Serve un secondo tocco sul banner. Il risultato è stato ripetuto nel prototipo,
successivamente integrato nel codice MVanager con scelta iniziale del navigatore.
Non è ancora verificato su autoradio fisica, iOS 26 o telefono bloccato. La quarta
sessione descritta sotto ha evidenziato differenze fra navigatori e richieste.

La terza sessione ha verificato separatamente il **navigatore predefinito**:
Google Maps risulta selezionato in iOS, ma `geo-navigation` aperto dal processo
app in background restituisce `false`; lo stesso URL in foreground apre il
percorso Google correttamente. I due URL Apple HTTPS restituiti dal widget via
`OpenURLIntent` aprono il browser sul telefono. Questo requisito resta quindi
irrisolto: il successo del collegamento specifico Google non va generalizzato.

La quarta sessione usa l’indirizzo testuale pubblico «Piazza Grande, Modena,
Italia» e il costruttore URL condiviso con MVanager. Waze ha mostrato un banner
CarPlay e il percorso corretto dopo il tocco; Mappe ha aperto l’anteprima sul
telefono, disponibile su CarPlay aprendo manualmente la sua icona. Google ha
aperto l’anteprima sul telefono senza il banner osservato prima con le coordinate;
anche `dir_action=navigate` ha richiesto sul telefono di aprire Google in CarPlay.
Questa variazione non consente di garantire il banner Google per ogni evento.
Le due chiamate MapKit provate restituiscono `false` anche con Mappe installata.
Il contatore foreground dell’app di prova resta a 8 durante tutti questi tentativi.
Mappe e Waze sono state installate con consenso solo per il test e poi rimosse.
La preferenza Google nelle impostazioni iOS non è stata modificata.

L’utente ha scelto **selezione iniziale sempre, poi ricordata**: iOS dichiara
disponibili gli schemi `maps`, `map` e `mapitem` anche quando Mappe è assente.
La lista è volutamente limitata a Google Maps, Mappe e Waze. Aggiungere un altro
navigatore richiede il suo collegamento pubblico e una prova, non una promessa
di compatibilità universale. La preferenza del widget è per dispositivo,
indipendente dall’account e dal navigatore predefinito del sistema.

| Percorso | Evidenza | Esito per MVanager |
| --- | --- | --- |
| Widget piccolo in CarPlay | Supporto Apple da iOS 26 | Non serve un’app CarPlay completa per mostrarlo |
| Pulsanti che eseguono App Intent | Supportati sui display CarPlay touch | Adatti a operazioni interne, come cambiare evento; non provano la possibilità di aprire altre app |
| Naviga dal solo widget CarPlay | Universal link con `OpenURLIntent`, iPhone reale USB, iOS 27 | Integrato con scelta Google/Mappe/Waze; banner Waze verificato, Google variabile fra prove, Mappe richiede apertura della sua icona; collaudo su auto ancora necessario |
| Navigatore predefinito dal widget CarPlay | Prove D/L/N con preferenza Google verificata nelle impostazioni iOS | Non riuscito: URL Apple aprono il browser; `geo-navigation` riesce in foreground ma viene rifiutato in background |
| Chiama dal solo widget CarPlay | Nessuna soluzione pubblica riproducibile trovata | Ancora irrisolto |
| Siri + azioni MVanager + Comandi Rapidi di sistema | Componenti documentati, combinazione non collaudata | Alternativa da prototipare; non equivale al pulsante sul widget |
| Naviga/Chiama dall’interfaccia Android Auto | API e codice AndroidX espliciti | Percorso supportato; resta il collaudo dell’host e la revisione della categoria |

## Apple: cosa è supportato

Apple documenta la presenza dei widget `systemSmall` in CarPlay e il funzionamento
di Button/Toggle sui display touch. Su quelli senza touch le interazioni non sono
disponibili. Il collegamento che apre l’app contenitore richiede un’esperienza
CarPlay dell’app; la sola presenza del widget non concede tale integrazione.
Fonte: [WidgetKit: StandBy e CarPlay](https://developer.apple.com/documentation/widgetkit/adding-standby-and-carplay-support-to-your-widget).

Il percorso ordinario `Link`/`widgetURL` è documentato come attivazione dell’app
contenitore. I collegamenti MVanager di Chiama e di Naviga su iOS 15–17 vengono risolti dal codice nativo
dell’app, che poi apre Mappe o il telefono. Questo evita la ricerca manuale
dell’evento, ma non soddisfa di per sé il requisito del solo widget in CarPlay.
Fonte: [Collegamenti da widget e Live Activity](https://developer.apple.com/documentation/widgetkit/linking-to-specific-app-scenes-from-your-widget-or-live-activity).

La documentazione corrente di `OpenURLIntent` descrive un intent di sistema che
apre un universal link, usabile su un pulsante widget o come risultato di un altro
App Intent. Non dice che il link debba appartenere all’app contenitore: la precedente
lettura in tal senso era troppo restrittiva. Esclude gli schemi URL personalizzati,
quindi non documenta l’apertura generica di `tel:`. La variante R verificata usa
il risultato di un altro intent; la variante U direttamente sul pulsante non ha
prodotto un’apertura osservabile nella prova effettuata. L’esito positivo R riguarda
le precise condizioni di test, non una garanzia generale per ogni versione iOS.
Fonti: [OpenURLIntent](https://developer.apple.com/documentation/appintents/openurlintent),
[Esecuzione degli App Intent](https://developer.apple.com/documentation/appintents/configuring-the-runtime-behavior-of-your-app-intents).

## La pista più interessante: NextStop e MapKit

Il sito dello sviluppatore di **NextStop** dichiara widget iOS e CarPlay che
passano percorsi salvati ad Apple Maps o Google Maps. È un caso molto vicino al
requisito Naviga di MVanager. La scheda App Store italiana consultata nella seconda
sessione menziona anch’essa CarPlay, mentre quella statunitense consultata inizialmente
descriveva solo Home Screen. Non ho trovato codice pubblico né collaudato NextStop.
Non possiamo dedurre dal testo commerciale quale API o entitlement usi il prodotto,
né attribuirgli la tecnica poi verificata indipendentemente nel prototipo R.
Fonti: [NextStop, sito dello sviluppatore](https://potatostudios.dev/nextstop/nextstop),
[Scheda App Store italiana](https://apps.apple.com/it/app/nextstop-map-widgets/id6762166724).

`MKMapItem.openInMaps` è un’API pubblica che apre Mappe e può richiedere indicazioni.
La dichiarazione nel SDK locale non presenta lo stesso divieto per estensioni di
`UIApplication.shared`: questo rende sensato un esperimento, non certifica il
funzionamento da un widget CarPlay. La documentazione non promette tale uso.
Fonte: [MKMapItem.openInMaps](https://developer.apple.com/documentation/mapkit/mkmapitem/openinmaps%28launchoptions%3Acompletionhandler%3A%29).

Una discussione Apple del 2019–2022 segnala che aprire Mappe da un’app CarPlay
poteva attivare solo l’iPhone. Una risposta suggerisce la variante che riceve la
scena CarPlay; un’altra segnala ancora problemi. È un’esperienza di sviluppatori
su un’app CarPlay completa, non una soluzione verificata per widget.
Fonte: [Apple Developer Forums, thread 123638](https://developer.apple.com/forums/thread/123638).

Questo esperimento isolato è stato eseguito: A/B MapKit e G con apertura UIKit in
background non hanno aperto il navigatore nelle condizioni provate. La variante R
con universal link ha invece aperto il percorso Google su CarPlay tramite banner,
senza Apple Mappe. Non è stato richiesto un entitlement CarPlay né introdotta una
scena CarPlay nel prototipo. Google documenta i universal link per aprire indicazioni
nella propria app iOS installata; il passaggio attraverso il banner CarPlay è
un’osservazione della prova, non una promessa della documentazione Google.
Fonte: [Google Maps URLs](https://developers.google.com/maps/documentation/urls/get-started).

## Navigatore predefinito: verifica sul dispositivo

Apple documenta `geo-navigation://` e i parametri delle destinazioni per le app
che ricevono la navigazione predefinita. Nel prototipo, il controllo N usa
`geo-navigation:///directions?destination=44.6458%2C10.9257`: seleziona Google Maps
senza un URL Google, coerentemente con la preferenza letta nelle impostazioni,
e visualizza le coordinate corrette. L’apertura tramite `UIApplication` in
background dal comando del widget viene invece rifiutata (`false`, stato app 2),
senza nuove aperture dell’interfaccia dell’app. `OpenURLIntent` documenta i soli
universal link, quindi non è stato trattato come apertura generica dello schema.

I collegamenti HTTPS Apple `/directions?destination=…` e `/?daddr=…`, passati
invece a `OpenURLIntent`, non hanno scelto il navigatore predefinito: hanno aperto
Brave sul telefono. Il secondo ha poi richiesto conferma per `maps://…` e iOS ha
mostrato «Nessuna app di navigazione installata». Non possiamo attribuire questo
messaggio all’assenza di Google Maps, che era installata, selezionata e funzionante
nel controllo N. La causa interna non è stata determinata.

Nessuna preferenza cambiata, nessun navigatore aggiunto, nessun entitlement
richiesto. Test su iOS 27.0 e CarPlay Simulator con iPhone USB, non su autoradio
fisica. Prima di aggiungere una scelta manuale in MVanager, rimane da valutare
una via supportata che soddisfi entrambi i vincoli: usare la preferenza del
telefono e non portare MVanager in primo piano.
Fonti: [Apple: navigatore predefinito](https://developer.apple.com/documentation/mapkit/preparing-your-app-to-be-the-default-navigation-app),
[Apple: OpenURLIntent](https://developer.apple.com/documentation/appintents/openurlintent).

## Chiama: cosa mostrano forum e tentativi

La domanda specifica sull’avvio di una telefonata da App Intent come nel widget
Contatti Apple è presente nei forum Apple senza una soluzione pubblicata.
Su Stack Overflow uno sviluppatore descrive `tel:` che apre prima l’app
contenitore e l’impossibilità di usare `UIApplication.shared` nell’estensione.
Sono riscontri utili, ma precedenti a iOS 26: non provano un’impossibilità
universale nelle versioni attuali.
Fonti: [Apple Developer Forums, thread 739920](https://developer.apple.com/forums/thread/739920),
[Esperimento con URL in widget](https://stackoverflow.com/questions/78330258/swiftui-widget-is-it-possible-to-open-an-arbitrary-url-when-the-user-taps-on-a).

Non ho trovato un’implementazione pubblica di Google Calendar che dimostri il
percorso richiesto. Il comportamento di un’app Apple o di un calendario integrato
non identifica automaticamente un’API disponibile a MVanager.

Non propongo di dichiarare falsamente un’app audio, Live Activity o VoIP per
ottenere permessi diversi. Il requisito è una normale chiamata al contatto
dell’appuntamento, non una chiamata VoIP gestita da MVanager.

## Alternativa da costruire: comandi vocali

Una possibile architettura usa un’azione MVanager di sola lettura, eseguibile in
background, che restituisce l’indirizzo operativo o il telefono dell’appuntamento.
Due Comandi Rapidi possono passarli alle azioni di sistema per indicazioni e
chiamata. L’utente li richiama con Siri, anche dal pulsante sul volante.

Frasi proposte: «Vai al prossimo sopralluogo» e «Chiama il contatto del sopralluogo».
La selezione deve essere esplicita: prossimo evento, oppure evento attualmente
mostrato nel widget, senza scambiare le due cose silenziosamente.

Apple documenta sia il passaggio di valori tra azioni sia l’esecuzione dei comandi
tramite Siri. La combinazione MVanager va ancora realizzata e verificata. Occorrono
configurazione iniziale dei comandi, verifiche dei permessi e prove a telefono
bloccato: Apple avverte che un comando che apre un’app può richiedere lo sblocco.
Questa alternativa non è equivalente a toccare Chiama/Naviga sul widget.
Fonti: [ReturnsValue](https://developer.apple.com/documentation/appintents/returnsvalue),
[Eseguire Comandi Rapidi con Siri](https://support.apple.com/en-nz/guide/shortcuts/apd07c25bb38/ios),
[Siri in auto](https://support.apple.com/guide/iphone/use-siri-in-your-car-iph0aa8c80e6/ios).

## Android Auto

Il codice ufficiale AndroidX documenta `CarContext.startCarApp` con destinazioni
`geo:` e intent telefonici. Sono passaggi gestiti dall’host dell’auto: la strada
tecnica esiste senza aprire il calendario MVanager sul telefono. Il prototipo
MVanager usa questo meccanismo. La conferma della chiamata segue il comportamento
del dialer e dell’host, non una promessa di composizione automatica.
Fonte: [CarContext, sorgente ufficiale AndroidX](https://github.com/androidx/androidx/blob/androidx-main/car/app/app/src/main/java/androidx/car/app/CarContext.java).

Questa esperienza usa l’interfaccia per auto e la categoria POI; non consiste nel
trasferire semplicemente il widget Android Home Screen. L’ammissione del caso
d’uso MVanager resta soggetta alla revisione Google: avere API compatibili non
equivale all’approvazione della distribuzione.
Fonti: [App POI](https://developer.android.com/training/cars/apps/poi),
[Requisiti di qualità per auto](https://developer.android.com/docs/quality-guidelines/car-app-quality).

Esiste anche AAWidget, che dichiara di portare widget Android sull’autoradio.
Il suo sito dichiara però l’assenza da Google Play per incompatibilità con le
regole di design Android Auto e descrive installazioni particolari. Non è una
base verificata per distribuire la funzione ai clienti MVanager.
Fonte: [AAWidget](https://aawidget.com/).

Il passo di verifica è il [Desktop Head Unit ufficiale](https://developer.android.com/training/cars/testing/dhu),
seguito da una vettura reale. I test locali già esistenti sui template non
dimostrano che il navigatore o il telefono dell’host ricevano correttamente
l’azione.

## Ordine consigliato delle prove

1. CarPlay: collaudare l’integrazione nell’azione Naviga dell’evento visualizzato
   su autoradio reale, iOS 26, telefono bloccato, primo consenso e app terminata.
   Verificare Google con indirizzi diversi e dopo cambio navigatore: l’anteprima
   sul telefono non dimostra l’apertura del display CarPlay. L’eventuale secondo
   tocco sul banner o sull’icona del navigatore va comunicato.
2. Android Auto: provare il prototipo sul DHU con dati fittizi, poi sull’auto.
3. Siri: prototipo delle azioni di lettura e dei due comandi come alternativa
   alla pressione sul widget, con limiti di blocco schermo esplicitamente misurati.

Per ogni prova annotare versione OS, app in foreground/background/terminata,
telefono bloccato/sbloccato, display touch/non touch, account attivo e evento
selezionato. Includere evento rimosso o terminato, cache scaduta, logout, assenza
rete e assenza di indirizzo o telefono. Non effettuare chiamate a clienti reali.

Nessun nuovo entitlement Apple è stato richiesto e nessun contatto con
sviluppatori o supporto è stato inviato durante questa ricerca.

## Verifica del navigatore predefinito all’avvio (22 ottobre 2026)

Ricontrollati la documentazione Apple e gli header pubblici di UIKit/MapKit
nell’SDK iPhoneOS 27.1 installato. Non è stata trovata un’API pubblica che
restituisca a MVanager l’identità del navigatore predefinito. `UIApplication.isDefault(_:)`
risponde soltanto se l’app chiamante è predefinita; `UIApplication.Category` espone
solo `webBrowser`. Non è una query sulle altre app né una query sulla navigazione.
`canOpenURL` verifica un gestore di URL e non consente di distinguere la preferenza
del sistema. Il controllo già eseguito in `sceneDidBecomeActive` aggiorna quindi
solo le opzioni disponibili e mantiene la scelta esplicita, senza dedurre un default.

`geo-navigation://` delega l’apertura al sistema, ma non restituisce quale app
sia stata scelta. Le prove precedenti lo hanno aperto in foreground e visto
rifiutare in background da CarPlay: eseguirlo all’avvio non permette di ricavare
silenziosamente il nome da salvare per il successivo `OpenURLIntent` del widget.
Non sono state aggiunte API private o entitlement per aggirare il limite.

Su Android il widget ora usa `ACTION_VIEW` con l’indirizzo codificato in `geo:`
invece di un URL Google Maps. Il sistema risolve il gestore a ogni azione, usa la
preferenza applicabile oppure mostra la scelta, senza una copia locale che possa
diventare obsoleta. Questo apre la destinazione: l’avvio del percorso dipende dal
navigatore ricevente. Android Auto usa già `CarContext.ACTION_NAVIGATE` con `geo:`.

Verifica: build APK debug e APK test riuscite; otto test strumentali agenda
superati sull’emulatore dedicato API 36, inclusa la destinazione della riga
selezionata con caratteri speciali e l’assenza di un package imposto. Nessuna
nuova build installata sul telefono reale; il resolver con navigatori di terzi
e l’autoradio reale restano da collaudare.

Fonti: [Apple isDefault](https://developer.apple.com/documentation/uikit/uiapplication/isdefault(_:)),
[Apple Category](https://developer.apple.com/documentation/uikit/uiapplication/category),
[Apple geonavigation](https://developer.apple.com/documentation/mapkit/preparing-your-app-to-be-the-default-navigation-app),
[Android map intents](https://developer.android.com/guide/components/intents-common#Maps).
