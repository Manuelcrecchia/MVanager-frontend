import SwiftUI

@main
struct MapKitProbeApp: App {
    @Environment(\.scenePhase) private var scenePhase
    @AppStorage("probe.foregroundCount") private var foregroundCount = 0
    @AppStorage("probe.googleResult") private var googleResult = "Google: nessuna prova"
    @AppStorage("probe.defaultResult") private var defaultResult = "Sistema: nessuna prova"

    init() { ProbeNavigation.record("HOST: processo avviato") }

    var body: some Scene {
        WindowGroup {
            VStack(alignment: .leading, spacing: 20) {
                Text("MV MapKit Probe").font(.title)
                Text("Prova isolata, senza login o dati clienti. Aggiungi il widget “MapKit · Prova” alla Home e a CarPlay.")
                Text("Aperture dell’interfaccia: \(foregroundCount)").monospacedDigit()
                Text("La prova riesce solo se dal widget si apre Mappe sul display auto e questa interfaccia non compare.")
                Button("Controllo MapKit dall’app") { ProbeNavigation.openSynchronously() }
                    .buttonStyle(.borderedProminent)
                Button("Controllo Google Maps dall’app") {
                    Task { await ProbeNavigation.openGoogleMaps() }
                }.buttonStyle(.bordered)
                Text(googleResult).font(.footnote)
                Button("Controllo indicazioni di sistema D") {
                    Task { await ProbeNavigation.openSystemDirections() }
                }.buttonStyle(.bordered)
                Text(defaultResult).font(.footnote)
                Button("Controllo navigatore predefinito N") {
                    Task { await ProbeNavigation.openDefaultNavigation() }
                }.buttonStyle(.bordered)
                Text("Destinazione fittizia: Piazza Grande, Modena. Il pulsante nell’app serve solo come controllo di confronto.")
                    .font(.footnote).foregroundStyle(.secondary)
            }.padding(24)
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { foregroundCount += 1; ProbeNavigation.detectNavigators() }
            ProbeNavigation.record("HOST: scena \(String(describing: phase)), aperture=\(foregroundCount)")
        }
    }
}
