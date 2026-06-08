import Foundation
import Capacitor
import SwiftUI

#if canImport(AlarmKit)
import AlarmKit
import ActivityKit
#endif

#if canImport(AlarmKit)
@available(iOS 26.0, *)
struct InspectionAlarmMetadata: AlarmMetadata {
    let appointmentId: String
    let occurrenceStart: String
    let route: String
}
#endif

@objc(InspectionAlarmKitPlugin)
public class InspectionAlarmKitPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "InspectionAlarmKitPlugin"
    public let jsName = "InspectionAlarmKit"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getAuthorizationState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAuthorization", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "replaceInspectionAlarms", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancelAllInspectionAlarms", returnType: CAPPluginReturnPromise)
    ]

    private let storedAlarmIdsKey = "mvanager.inspectionAlarmKit.ids"

    @objc func isAvailable(_ call: CAPPluginCall) {
        if #available(iOS 26.0, *) {
            call.resolve(["available": true])
        } else {
            call.resolve(["available": false])
        }
    }

    @objc func getAuthorizationState(_ call: CAPPluginCall) {
        guard #available(iOS 26.0, *) else {
            call.resolve(["state": "unsupported"])
            return
        }

        #if canImport(AlarmKit)
        call.resolve(["state": authorizationStateString(AlarmManager.shared.authorizationState)])
        #else
        call.resolve(["state": "unsupported"])
        #endif
    }

    @objc func requestAuthorization(_ call: CAPPluginCall) {
        guard #available(iOS 26.0, *) else {
            print("[InspectionAlarmKit] AlarmKit non disponibile: iOS < 26")
            call.resolve(["state": "unsupported"])
            return
        }

        #if canImport(AlarmKit)
        Task { @MainActor in
            do {
                print("[InspectionAlarmKit] Richiesta permesso sveglie. Stato iniziale: \(self.authorizationStateString(AlarmManager.shared.authorizationState))")
                let state = try await AlarmManager.shared.requestAuthorization()
                print("[InspectionAlarmKit] Stato permesso sveglie dopo richiesta: \(self.authorizationStateString(state))")
                call.resolve(["state": self.authorizationStateString(state)])
            } catch {
                print("[InspectionAlarmKit] Errore richiesta permesso sveglie: \(error)")
                call.reject("Impossibile richiedere il permesso sveglie", nil, error)
            }
        }
        #else
        print("[InspectionAlarmKit] AlarmKit non importabile in questa build")
        call.resolve(["state": "unsupported"])
        #endif
    }

    @objc func replaceInspectionAlarms(_ call: CAPPluginCall) {
        guard #available(iOS 26.0, *) else {
            call.resolve([
                "available": false,
                "authorizationState": "unsupported",
                "scheduled": 0,
                "skipped": 0
            ])
            return
        }

        #if canImport(AlarmKit)
        let rawAlarms = call.getArray("alarms", JSObject.self) ?? []

        Task { @MainActor in
            do {
                var state = AlarmManager.shared.authorizationState
                print("[InspectionAlarmKit] Sync sveglie richiesta. Sveglie ricevute: \(rawAlarms.count). Stato: \(self.authorizationStateString(state))")
                if state == .notDetermined {
                    state = try await AlarmManager.shared.requestAuthorization()
                    print("[InspectionAlarmKit] Stato permesso sveglie dopo richiesta sync: \(self.authorizationStateString(state))")
                }

                guard state == .authorized else {
                    print("[InspectionAlarmKit] Sync saltata: permesso sveglie \(self.authorizationStateString(state))")
                    call.resolve([
                        "available": true,
                        "authorizationState": self.authorizationStateString(state),
                        "scheduled": 0,
                        "skipped": rawAlarms.count
                    ])
                    return
                }

                let activeIds = Set(rawAlarms.compactMap { $0["id"] as? String })
                let previousIds = Set(self.storedAlarmIds())
                var cancelled = 0

                for idString in previousIds where !activeIds.contains(idString) {
                    if let id = UUID(uuidString: idString) {
                        try? AlarmManager.shared.cancel(id: id)
                        cancelled += 1
                    }
                }

                var scheduled = 0
                var skipped = 0

                for rawAlarm in rawAlarms {
                    guard
                        let alarmIdString = rawAlarm["id"] as? String,
                        let alarmId = UUID(uuidString: alarmIdString),
                        let title = rawAlarm["title"] as? String,
                        let fireDateString = rawAlarm["fireDate"] as? String,
                        let fireDate = self.parseDate(fireDateString),
                        fireDate > Date().addingTimeInterval(5)
                    else {
                        skipped += 1
                        continue
                    }

                    try? AlarmManager.shared.cancel(id: alarmId)

                    let body = rawAlarm["body"] as? String ?? ""
                    let appointmentId = String(describing: rawAlarm["appointmentId"] ?? "")
                    let occurrenceStart = rawAlarm["occurrenceStart"] as? String ?? fireDateString
                    let route = rawAlarm["route"] as? String ?? "/calendarHome"
                    let snoozeMinutes = max(1, rawAlarm["snoozeMinutes"] as? Int ?? 10)

                    let stopButton = AlarmButton(
                        text: "Spegni",
                        textColor: .white,
                        systemImageName: "stop.fill"
                    )
                    let snoozeButton = AlarmButton(
                        text: "Posticipa",
                        textColor: .white,
                        systemImageName: "clock.arrow.circlepath"
                    )
                    let alert = AlarmPresentation.Alert(
                        title: LocalizedStringResource(stringLiteral: title),
                        stopButton: stopButton,
                        secondaryButton: snoozeButton,
                        secondaryButtonBehavior: .countdown
                    )
                    let presentation = AlarmPresentation(alert: alert)
                    let metadata = InspectionAlarmMetadata(
                        appointmentId: appointmentId,
                        occurrenceStart: occurrenceStart,
                        route: route
                    )
                    let attributes = AlarmAttributes(
                        presentation: presentation,
                        metadata: metadata,
                        tintColor: .orange
                    )
                    let schedule = Alarm.Schedule.fixed(fireDate)
                    let countdown = Alarm.CountdownDuration(
                        preAlert: nil,
                        postAlert: TimeInterval(snoozeMinutes * 60)
                    )
                    let finalConfiguration = AlarmManager.AlarmConfiguration(
                        countdownDuration: countdown,
                        schedule: schedule,
                        attributes: attributes,
                        sound: .default
                    )

                    _ = try await AlarmManager.shared.schedule(
                        id: alarmId,
                        configuration: finalConfiguration
                    )
                    print("[InspectionAlarmKit] Sveglia sopralluogo schedulata: \(alarmIdString) \(fireDate)")
                    scheduled += 1

                    if !body.isEmpty {
                        print("[InspectionAlarmKit] \(body)")
                    }
                }

                self.storeAlarmIds(Array(activeIds))
                call.resolve([
                    "available": true,
                    "authorizationState": self.authorizationStateString(state),
                    "scheduled": scheduled,
                    "skipped": skipped,
                    "cancelled": cancelled
                ])
            } catch {
                call.reject("Errore sincronizzazione sveglie sopralluogo", nil, error)
            }
        }
        #else
        call.resolve([
            "available": false,
            "authorizationState": "unsupported",
            "scheduled": 0,
            "skipped": 0
        ])
        #endif
    }

    @objc func cancelAllInspectionAlarms(_ call: CAPPluginCall) {
        guard #available(iOS 26.0, *) else {
            call.resolve(["cancelled": 0])
            return
        }

        #if canImport(AlarmKit)
        var cancelled = 0
        for idString in storedAlarmIds() {
            if let id = UUID(uuidString: idString) {
                try? AlarmManager.shared.cancel(id: id)
                cancelled += 1
            }
        }
        storeAlarmIds([])
        call.resolve(["cancelled": cancelled])
        #else
        call.resolve(["cancelled": 0])
        #endif
    }

    private func storedAlarmIds() -> [String] {
        UserDefaults.standard.stringArray(forKey: storedAlarmIdsKey) ?? []
    }

    private func storeAlarmIds(_ ids: [String]) {
        UserDefaults.standard.set(ids.sorted(), forKey: storedAlarmIdsKey)
    }

    private func parseDate(_ value: String) -> Date? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: value) {
            return date
        }

        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: value)
    }

    #if canImport(AlarmKit)
    @available(iOS 26.0, *)
    private func authorizationStateString(_ state: AlarmManager.AuthorizationState) -> String {
        switch state {
        case .notDetermined:
            return "notDetermined"
        case .denied:
            return "denied"
        case .authorized:
            return "authorized"
        @unknown default:
            return "unknown"
        }
    }
    #endif
}
