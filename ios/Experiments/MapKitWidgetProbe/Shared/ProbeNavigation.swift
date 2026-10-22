import Foundation
import MapKit
import OSLog
import AppIntents
#if PROBE_APP
import UIKit
#endif

enum ProbeNavigation {
    static let logger = Logger(subsystem: "it.mvtechcore.mvanager.mapkitprobe", category: "MapKitProbe")
    static let lastResultKey = "probe.lastResult"
    static let googleUniversalURL = URL(string: "https://www.google.com/maps/dir/?api=1&destination=44.6458%2C10.9257&travelmode=driving")!
    // Public Apple directions URLs, handed to iOS rather than a chosen third-party
    // app. Whether they honor the default navigation app is the subject of D/L.
    static let systemDirectionsURL = URL(string: "https://maps.apple.com/directions?destination=44.6458%2C10.9257&mode=driving")!
    static let legacyDirectionsURL = URL(string: "https://maps.apple.com/?daddr=44.6458%2C10.9257&dirflg=d")!
    static let geoNavigationURL = URL(string: "geo-navigation:///directions?destination=44.6458%2C10.9257")!

    static func record(_ message: String) {
        let time = Date().formatted(date: .omitted, time: .standard)
        let line = "\(time) · \(message)"
        UserDefaults.standard.set(line, forKey: lastResultKey)
        var history = UserDefaults.standard.stringArray(forKey: "probe.history") ?? []
        history.append("\(line) [\(ProcessInfo.processInfo.processName)]")
        UserDefaults.standard.set(Array(history.suffix(100)), forKey: "probe.history")
        logger.notice("\(line, privacy: .public) process=\(ProcessInfo.processInfo.processName, privacy: .public) pid=\(ProcessInfo.processInfo.processIdentifier)")
    }

    @MainActor static func destination() -> MKMapItem {
        // Public square, unrelated to any MVanager account or customer.
        let item = MKMapItem(location: CLLocation(latitude: 44.6458, longitude: 10.9257), address: nil)
        item.name = "PROVA · Piazza Grande, Modena"
        return item
    }

    @MainActor static func openSynchronously() {
        record("A: richiesta MapKit")
        let accepted = destination().openInMaps(launchOptions: [MKLaunchOptionsDirectionsModeKey: MKLaunchOptionsDirectionsModeDriving])
        record("A: MapKit restituisce \(accepted)")
    }

    @MainActor static func openWithCompletion() async {
        record("B: richiesta MapKit, scena nil")
        let accepted: Bool = await withCheckedContinuation { continuation in
            destination().openInMaps(launchOptions: [MKLaunchOptionsDirectionsModeKey: MKLaunchOptionsDirectionsModeDriving], from: nil) { success in
                continuation.resume(returning: success)
            }
        }
        record("B: callback MapKit restituisce \(accepted)")
    }

#if PROBE_APP
    @MainActor static func detectNavigators() {
        for navigator in AgendaNavigator.allCases {
            record("RILEVA \(navigator.rawValue): \(UIApplication.shared.canOpenURL(navigator.detectionURL))")
        }
        for scheme in ["map", "mapitem"] {
            record("RILEVA \(scheme): \(UIApplication.shared.canOpenURL(URL(string: scheme + "://")!))")
        }
    }
    @MainActor static func openDefaultNavigation() async {
        let state = UIApplication.shared.applicationState
        record("N: richiesta geo-navigation, stato app=\(state.rawValue)")
        let accepted = await UIApplication.shared.open(geoNavigationURL, options: [:])
        let result = "N: geo-navigation restituisce \(accepted), stato iniziale=\(state.rawValue)"
        UserDefaults.standard.set(result, forKey: "probe.defaultResult")
        record(result)
    }

    @MainActor static func openSystemDirections() async {
        let state = UIApplication.shared.applicationState
        record("D HOST: richiesta indicazioni, stato app=\(state.rawValue)")
        let accepted = await UIApplication.shared.open(systemDirectionsURL, options: [:])
        let result = "D HOST: apertura restituisce \(accepted), stato iniziale=\(state.rawValue)"
        UserDefaults.standard.set(result, forKey: "probe.defaultResult")
        record(result)
    }

    @MainActor static func openGoogleMaps() async {
        let state = UIApplication.shared.applicationState
        record("G: richiesta Google Maps, stato app=\(state.rawValue)")
        let url = URL(string: "comgooglemaps://?daddr=44.6458,10.9257&directionsmode=driving")!
        let accepted = await UIApplication.shared.open(url, options: [:])
        let result = "G: Google Maps restituisce \(accepted), stato iniziale=\(state.rawValue)"
        UserDefaults.standard.set(result, forKey: "probe.googleResult")
        record(result)
    }
#endif
}

// OpenURLIntent requires universal links, so the documented geo-navigation
// scheme is tested through UIApplication in the main process, without UI.
@available(iOS 27.0, *)
struct ProbeDefaultBackgroundIntent: AppIntent {
    static var title: LocalizedStringResource = "Prova navigatore predefinito in background"
    static var isDiscoverable: Bool = false
    static var supportedModes: IntentModes { .background }
    static var allowedExecutionTargets: IntentExecutionTargets { .main }

    @MainActor func perform() async throws -> some IntentResult {
#if PROBE_APP
        await ProbeNavigation.openDefaultNavigation()
#else
        ProbeNavigation.record("N: ERRORE target widget invece di main")
#endif
        return .result()
    }
}

// iOS 27 experiment: run in the main process, explicitly in background.
// This does not request foreground, a CarPlay scene, or any extra entitlement.
@available(iOS 27.0, *)
struct ProbeGoogleBackgroundIntent: AppIntent {
    static var title: LocalizedStringResource = "Prova Google Maps in background"
    static var isDiscoverable: Bool = false
    static var supportedModes: IntentModes { .background }
    static var allowedExecutionTargets: IntentExecutionTargets { .main }

    @MainActor func perform() async throws -> some IntentResult {
#if PROBE_APP
        await ProbeNavigation.openGoogleMaps()
#else
        ProbeNavigation.record("G: ERRORE target widget invece di main")
#endif
        return .result()
    }
}
