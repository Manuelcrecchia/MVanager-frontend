import Foundation
import Capacitor
import WidgetKit
import UIKit

@objc(AgendaWidgetPlugin)
public class AgendaWidgetPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AgendaWidgetPlugin"
    public let jsName = "AgendaWidget"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "configure", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "refresh", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clear", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestPin", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "navigationPreferences", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setNavigator", returnType: CAPPluginReturnPromise)
    ]
    @objc func configure(_ call: CAPPluginCall) {
        guard let endpoint = call.getString("endpoint"), let url = URL(string: endpoint), AgendaWidgetStore.allowsEndpoint(url), let tenantId = call.getString("tenantId"),
              let token = call.getString("token"), let expiresAt = call.getDouble("expiresAt"),
              token.range(of: "^[1-9][0-9]*\\.[a-fA-F0-9-]{36}\\.[a-f0-9]{64}$", options: .regularExpression) != nil else {
            call.reject("Configurazione del widget non valida"); return
        }
        do {
            try AgendaWidgetStore.configure(AgendaWidgetConfiguration(endpoint: endpoint, tenantId: tenantId, token: token, expiresAt: expiresAt))
            WidgetCenter.shared.reloadAllTimelines(); call.resolve()
        } catch {
            call.reject("Impossibile condividere i dati con il widget. Verifica App Group e Keychain Sharing di app ed estensione.", nil, error)
        }
    }
    @objc func refresh(_ call: CAPPluginCall) {
        AgendaWidgetStore.refresh { result in
            WidgetCenter.shared.reloadTimelines(ofKind: "MvanagerAgendaWidget")
            call.resolve(result.payload)
        }
    }
    @objc func clear(_ call: CAPPluginCall) { AgendaWidgetStore.clear(); WidgetCenter.shared.reloadAllTimelines(); call.resolve() }
    @objc func requestPin(_ call: CAPPluginCall) { call.resolve(["supported": false]) }
    @objc func navigationPreferences(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let state = AgendaNavigationStore.updateAvailable(AgendaNavigator.allCases.filter { UIApplication.shared.canOpenURL($0.detectionURL) })
            WidgetCenter.shared.reloadTimelines(ofKind: "MvanagerAgendaWidget")
            call.resolve(state.payload)
        }
    }
    @objc func setNavigator(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            _ = AgendaNavigationStore.updateAvailable(AgendaNavigator.allCases.filter { UIApplication.shared.canOpenURL($0.detectionURL) })
            guard let raw = call.getString("navigator"), let navigator = AgendaNavigator(rawValue: raw) else {
                call.reject("Scegli un navigatore disponibile."); return
            }
            do {
                try AgendaNavigationStore.select(navigator)
                WidgetCenter.shared.reloadTimelines(ofKind: "MvanagerAgendaWidget")
                call.resolve(AgendaNavigationStore.state.payload)
            } catch { call.reject(error.localizedDescription) }
        }
    }
}
