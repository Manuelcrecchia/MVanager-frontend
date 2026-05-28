import UIKit
import Capacitor
import FirebaseCore
import FirebaseMessaging
import UserNotifications

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate, UNUserNotificationCenterDelegate {

    var window: UIWindow?
    private let inspectionAlarmCategory = "INSPECTION_REMINDER_ALARM"
    private let inspectionAlarmSnoozeAction = "SNOOZE"
    private let inspectionAlarmDismissAction = "DISMISS"
    private let inspectionAlarmSnoozeMinutes = 10

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        FirebaseApp.configure()
        configureInspectionAlarmNotifications()
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        Messaging.messaging().apnsToken = deviceToken
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
        UNUserNotificationCenter.current().delegate = self
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

    private func configureInspectionAlarmNotifications() {
        let snooze = UNNotificationAction(
            identifier: inspectionAlarmSnoozeAction,
            title: "Posticipa",
            options: []
        )
        let dismiss = UNNotificationAction(
            identifier: inspectionAlarmDismissAction,
            title: "Spegni",
            options: [.destructive]
        )
        let category = UNNotificationCategory(
            identifier: inspectionAlarmCategory,
            actions: [snooze, dismiss],
            intentIdentifiers: [],
            options: [.customDismissAction]
        )

        let center = UNUserNotificationCenter.current()
        center.setNotificationCategories([category])
        center.delegate = self
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        if response.notification.request.content.categoryIdentifier == inspectionAlarmCategory {
            if response.actionIdentifier == inspectionAlarmSnoozeAction {
                scheduleSnoozedInspectionAlarm(from: response.notification.request.content)
                completionHandler()
                return
            }

            if response.actionIdentifier == inspectionAlarmDismissAction ||
                response.actionIdentifier == UNNotificationDismissActionIdentifier {
                completionHandler()
                return
            }

            storePendingNotificationNavigation(response.notification.request.content.userInfo)
            forwardNotificationResponseToCapacitor(response)
            completionHandler()
            return
        }

        storePendingNotificationNavigation(response.notification.request.content.userInfo)
        forwardNotificationResponseToCapacitor(response)
        completionHandler()
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        if notification.request.content.categoryIdentifier == inspectionAlarmCategory {
            if #available(iOS 14.0, *) {
                completionHandler([.banner, .list, .sound])
            } else {
                completionHandler([.alert, .sound])
            }
            return
        }

        if let options = forwardWillPresentToCapacitor(notification) {
            completionHandler(options)
            return
        }

        if #available(iOS 14.0, *) {
            completionHandler([.banner, .list, .sound])
        } else {
            completionHandler([.alert, .sound])
        }
    }

    private func forwardNotificationResponseToCapacitor(_ response: UNNotificationResponse) {
        guard
            let bridgeViewController = window?.rootViewController as? CAPBridgeViewController,
            let bridge = bridgeViewController.bridge
        else {
            return
        }

        bridge.notificationRouter.userNotificationCenter(
            UNUserNotificationCenter.current(),
            didReceive: response,
            withCompletionHandler: {}
        )
    }

    private func forwardWillPresentToCapacitor(_ notification: UNNotification) -> UNNotificationPresentationOptions? {
        guard
            let bridgeViewController = window?.rootViewController as? CAPBridgeViewController,
            let bridge = bridgeViewController.bridge
        else {
            return nil
        }

        var forwardedOptions: UNNotificationPresentationOptions?
        bridge.notificationRouter.userNotificationCenter(
            UNUserNotificationCenter.current(),
            willPresent: notification
        ) { options in
            forwardedOptions = options
        }
        return forwardedOptions
    }

    private func scheduleSnoozedInspectionAlarm(from content: UNNotificationContent) {
        let nextContent = UNMutableNotificationContent()
        nextContent.title = content.title
        nextContent.body = content.body
        nextContent.sound = content.sound ?? .default
        nextContent.categoryIdentifier = inspectionAlarmCategory
        nextContent.threadIdentifier = inspectionAlarmCategory
        nextContent.userInfo = content.userInfo

        if #available(iOS 15.0, *) {
            nextContent.interruptionLevel = .timeSensitive
            nextContent.relevanceScore = 1
        }

        let trigger = UNTimeIntervalNotificationTrigger(
            timeInterval: TimeInterval(inspectionAlarmSnoozeMinutes * 60),
            repeats: false
        )
        let request = UNNotificationRequest(
            identifier: "inspection-reminder-snooze-\(UUID().uuidString)",
            content: nextContent,
            trigger: trigger
        )

        UNUserNotificationCenter.current().add(request) { error in
            if let error = error {
                print("[InspectionAlarm] Errore snooze iOS: \(error.localizedDescription)")
            }
        }
    }

    private func storePendingNotificationNavigation(_ userInfo: [AnyHashable: Any]) {
        guard let route = routeFromNotificationPayload(userInfo), !route.isEmpty else {
            return
        }

        UserDefaults.standard.set(route, forKey: "CapacitorStorage.pendingNotificationRoute")
    }

    private func routeFromNotificationPayload(_ userInfo: [AnyHashable: Any]) -> String? {
        if let route = userInfo["route"] as? String, !route.isEmpty {
            return normalizeNotificationRoute(route)
        }

        let type = userInfo["type"] as? String ?? ""
        let screen = userInfo["screen"] as? String ?? ""
        let appointmentId = stringValue(userInfo["appointmentId"])
        let deadlineId = stringValue(userInfo["deadlineId"])
        let numeroPreventivo = stringValue(userInfo["numeroPreventivo"])
        let acceptanceId = stringValue(userInfo["acceptanceId"])

        if screen == "calendar" || type == "SOPRALLUOGO_REMINDER" || type == "SOPRALLUOGO_ASSIGNED" {
            return appointmentId.isEmpty
                ? "/calendarHome"
                : "/calendarHome?appointmentId=\(urlEncode(appointmentId))"
        }

        if screen == "employeeDeadlines" || type == "DEADLINE_EMPLOYEE_REMINDER" {
            return deadlineId.isEmpty
                ? "/employee-deadlines"
                : "/employee-deadlines?deadlineId=\(urlEncode(deadlineId))"
        }

        if screen == "vehicleDeadlines" || type == "DEADLINE_VEHICLE_REMINDER" {
            return deadlineId.isEmpty
                ? "/vehicle-deadlines"
                : "/vehicle-deadlines?deadlineId=\(urlEncode(deadlineId))"
        }

        if screen == "quoteReview" || type == "QUOTE_ACCEPTED_REVIEW" {
            var route = "/quotesHome?review=1"
            if !numeroPreventivo.isEmpty {
                route += "&numeroPreventivo=\(urlEncode(numeroPreventivo))"
            }
            if !acceptanceId.isEmpty {
                route += "&acceptanceId=\(urlEncode(acceptanceId))"
            }
            return route
        }

        return nil
    }

    private func normalizeNotificationRoute(_ route: String) -> String {
        var normalized = route

        if let url = URL(string: route), url.scheme != nil {
            normalized = url.path
            if let query = url.query, !query.isEmpty {
                normalized += "?\(query)"
            }
        }

        if !normalized.hasPrefix("/") {
            normalized = "/\(normalized)"
        }

        if normalized.hasPrefix("/calendar?") || normalized == "/calendar" {
            return normalized.replacingOccurrences(of: "/calendar", with: "/calendarHome", options: [], range: normalized.startIndex..<normalized.index(normalized.startIndex, offsetBy: "/calendar".count))
        }

        if normalized.hasPrefix("/deadlines/employees") {
            return normalized.replacingOccurrences(of: "/deadlines/employees", with: "/employee-deadlines")
        }

        if normalized.hasPrefix("/deadlines/vehicles") {
            return normalized.replacingOccurrences(of: "/deadlines/vehicles", with: "/vehicle-deadlines")
        }

        if normalized.hasPrefix("/quotes?") || normalized == "/quotes" {
            return normalized.replacingOccurrences(of: "/quotes", with: "/quotesHome", options: [], range: normalized.startIndex..<normalized.index(normalized.startIndex, offsetBy: "/quotes".count))
        }

        return normalized
    }

    private func stringValue(_ value: Any?) -> String {
        if let text = value as? String {
            return text
        }
        if let number = value as? NSNumber {
            return number.stringValue
        }
        return ""
    }

    private func urlEncode(_ value: String) -> String {
        value.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? value
    }

}
