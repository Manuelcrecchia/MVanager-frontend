import AppIntents
import SwiftUI
import WidgetKit

struct ProbeEntry: TimelineEntry {
    let date: Date
    let result: String
}

struct ProbeProvider: TimelineProvider {
    func placeholder(in context: Context) -> ProbeEntry { entry() }
    func getSnapshot(in context: Context, completion: @escaping (ProbeEntry) -> Void) { completion(entry()) }
    func getTimeline(in context: Context, completion: @escaping (Timeline<ProbeEntry>) -> Void) {
        completion(Timeline(entries: [entry()], policy: .never))
    }
    private func entry() -> ProbeEntry {
        ProbeEntry(date: .now, result: UserDefaults.standard.string(forKey: ProbeNavigation.lastResultKey) ?? "Nessuna prova eseguita")
    }
}

@main
struct MapKitProbeWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "MapKitProbeWidget", provider: ProbeProvider()) { entry in
            VStack(alignment: .leading, spacing: 4) {
                Text("Navigatori · PROVA").font(.system(size: 12, weight: .bold))
                Text("Piazza Grande, Modena").font(.system(size: 9)).lineLimit(1)
                Button(intent: ProbeNavigatorIntent(navigator: "google")) { actionLabel("Google Maps") }
                Button(intent: ProbeNavigatorIntent(navigator: "apple")) { actionLabel("Mappe") }
                Button(intent: ProbeNavigatorIntent(navigator: "waze")) { actionLabel("Waze") }
                Text(entry.result).font(.system(size: 8)).foregroundStyle(.secondary).lineLimit(1)
            }
            .buttonStyle(.plain)
            .containerBackground(.background, for: .widget)
        }
        .configurationDisplayName("MapKit · Prova")
        .description("Esperimento senza dati reali: apertura Mappe dal widget, senza aprire l’app.")
        .supportedFamilies([.systemSmall])
    }

    private func actionLabel(_ title: String) -> some View {
        Text(title).font(.system(size: 11, weight: .semibold))
            .lineLimit(1).minimumScaleFactor(0.8)
            .frame(maxWidth: .infinity, minHeight: 22)
            .foregroundStyle(.blue)
            .background(.blue.opacity(0.12), in: RoundedRectangle(cornerRadius: 7))
    }
}



struct ProbeCoordinateIntent: AppIntent {
    static var title: LocalizedStringResource = "Prova navigatore con coordinate"
    static var isDiscoverable: Bool = false
    static var supportedModes: IntentModes { .background }
    @Parameter(title: "Navigatore") var navigator: String
    init() {}
    init(navigator: String) { self.navigator = navigator }
    func perform() async throws -> some IntentResult & OpensIntent {
        let url: URL
        switch navigator {
        case "google": url = ProbeNavigation.googleUniversalURL
        case "apple": url = ProbeNavigation.legacyDirectionsURL
        case "waze": url = URL(string: "https://waze.com/ul?ll=44.6458%2C10.9257&navigate=yes&utm_source=mvanager")!
        default: throw NSError(domain: "Probe", code: 1)
        }
        ProbeNavigation.record("COORD \(navigator): consegna URL al sistema")
        WidgetCenter.shared.reloadTimelines(ofKind: "MapKitProbeWidget")
        return .result(opensIntent: OpenURLIntent(url))
    }
}

struct ProbeGoogleNavigateIntent: AppIntent {
    static var title: LocalizedStringResource = "Prova avvio navigazione Google"
    static var isDiscoverable: Bool = false
    static var supportedModes: IntentModes { .background }
    func perform() async throws -> some IntentResult & OpensIntent {
        var url = URLComponents(url: AgendaNavigator.google.directionsURL(address: "Piazza Grande, Modena, Italia")!, resolvingAgainstBaseURL: false)!
        url.queryItems?.append(URLQueryItem(name: "dir_action", value: "navigate"))
        ProbeNavigation.record("GOOGLE N: consegna URL navigate al sistema")
        WidgetCenter.shared.reloadTimelines(ofKind: "MapKitProbeWidget")
        return .result(opensIntent: OpenURLIntent(url.url!))
    }
}

// Uses the production URL builder, with a fixed public address and no account.
struct ProbeNavigatorIntent: AppIntent {
    static var title: LocalizedStringResource = "Prova navigatore specifico"
    static var isDiscoverable: Bool = false
    static var supportedModes: IntentModes { .background }
    @Parameter(title: "Navigatore") var navigator: String
    init() {}
    init(navigator: String) { self.navigator = navigator }
    func perform() async throws -> some IntentResult & OpensIntent {
        guard let provider = AgendaNavigator(rawValue: navigator),
              let url = provider.directionsURL(address: "Piazza Grande, Modena, Italia") else {
            throw NSError(domain: "Probe", code: 1)
        }
        ProbeNavigation.record("PROVIDER \(navigator): consegna URL al sistema")
        WidgetCenter.shared.reloadTimelines(ofKind: "MapKitProbeWidget")
        return .result(opensIntent: OpenURLIntent(url))
    }
}

// These experiments use universal links supported by OpenURLIntent. The
// geo-navigation custom scheme is not accepted by that system intent's contract.
struct ProbeSystemDirectionsIntent: AppIntent {
    static var title: LocalizedStringResource = "Prova navigatore di sistema D"
    static var isDiscoverable: Bool = false
    static var supportedModes: IntentModes { .background }

    func perform() async throws -> some IntentResult & OpensIntent {
        ProbeNavigation.record("D: consegna indicazioni al sistema")
        WidgetCenter.shared.reloadTimelines(ofKind: "MapKitProbeWidget")
        return .result(opensIntent: OpenURLIntent(ProbeNavigation.systemDirectionsURL))
    }
}

struct ProbeLegacyDirectionsIntent: AppIntent {
    static var title: LocalizedStringResource = "Prova navigatore di sistema L"
    static var isDiscoverable: Bool = false
    static var supportedModes: IntentModes { .background }

    func perform() async throws -> some IntentResult & OpensIntent {
        ProbeNavigation.record("L: consegna indicazioni legacy al sistema")
        WidgetCenter.shared.reloadTimelines(ofKind: "MapKitProbeWidget")
        return .result(opensIntent: OpenURLIntent(ProbeNavigation.legacyDirectionsURL))
    }
}

// The system receives the universal link as a follow-up intent. No UIApplication
// call, foreground request, custom scheme or redirect through the app is used.
struct ProbeGoogleResultIntent: AppIntent {
    static var title: LocalizedStringResource = "Prova Google Maps con risultato OpenURLIntent"
    static var isDiscoverable: Bool = false
    static var supportedModes: IntentModes { .background }

    func perform() async throws -> some IntentResult & OpensIntent {
        ProbeNavigation.record("R: consegna URL Google al sistema")
        WidgetCenter.shared.reloadTimelines(ofKind: "MapKitProbeWidget")
        return .result(opensIntent: OpenURLIntent(ProbeNavigation.googleUniversalURL))
    }
}

// These intents belong ONLY to the extension. No URL, foreground request,
// CarPlay scene, entitlement or fallback through the containing app is used.
struct ProbeSyncIntent: AppIntent {
    static var title: LocalizedStringResource = "Prova MapKit A"
    static var openAppWhenRun: Bool = false
    static var isDiscoverable: Bool = false
    @MainActor func perform() async throws -> some IntentResult {
        ProbeNavigation.openSynchronously()
        WidgetCenter.shared.reloadTimelines(ofKind: "MapKitProbeWidget")
        return .result()
    }
}

struct ProbeCompletionIntent: AppIntent {
    static var title: LocalizedStringResource = "Prova MapKit B"
    static var openAppWhenRun: Bool = false
    static var isDiscoverable: Bool = false
    @MainActor func perform() async throws -> some IntentResult {
        await ProbeNavigation.openWithCompletion()
        WidgetCenter.shared.reloadTimelines(ofKind: "MapKitProbeWidget")
        return .result()
    }
}

struct ProbeControlIntent: AppIntent {
    static var title: LocalizedStringResource = "Verifica esecuzione nel widget"
    static var openAppWhenRun: Bool = false
    static var isDiscoverable: Bool = false
    func perform() async throws -> some IntentResult {
        ProbeNavigation.record("CONTROLLO: azione widget eseguita")
        WidgetCenter.shared.reloadTimelines(ofKind: "MapKitProbeWidget")
        return .result()
    }
}
