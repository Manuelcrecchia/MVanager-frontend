import UIKit
import Capacitor
import WidgetKit

class SceneDelegate: UIResponder, UIWindowSceneDelegate {

    var window: UIWindow?
    func sceneDidBecomeActive(_ scene: UIScene) {
        let previous = AgendaNavigationStore.state.available
        let state = AgendaNavigationStore.updateAvailable(AgendaNavigator.allCases.filter { UIApplication.shared.canOpenURL($0.detectionURL) })
        if previous != state.available { WidgetCenter.shared.reloadTimelines(ofKind: "MvanagerAgendaWidget") }
        AgendaWidgetActionRouter.performPending()
    }

    func sceneDidEnterBackground(_ scene: UIScene) {
        WidgetCenter.shared.reloadTimelines(ofKind: "MvanagerAgendaWidget")
    }

    func scene(
        _ scene: UIScene,
        willConnectTo session: UISceneSession,
        options connectionOptions: UIScene.ConnectionOptions
    ) {
        forward(URLContexts: connectionOptions.urlContexts)
        for userActivity in connectionOptions.userActivities {
            forward(userActivity: userActivity)
        }
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        forward(URLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        forward(userActivity: userActivity)
    }

    private func forward(URLContexts: Set<UIOpenURLContext>) {
        for context in URLContexts {
            if AgendaWidgetActionRouter.handle(context.url) { continue }
            _ = ApplicationDelegateProxy.shared.application(
                UIApplication.shared,
                open: context.url,
                options: [:]
            )
        }
    }

    private func forward(userActivity: NSUserActivity) {
        _ = ApplicationDelegateProxy.shared.application(
            UIApplication.shared,
            continue: userActivity,
            restorationHandler: { _ in }
        )
    }
}

// WidgetKit delivers Link URLs to the containing app. Route the action natively
// before Capacitor starts calendar navigation; no second tap in MVanager is needed.
enum AgendaWidgetActionRouter {
    private static var pending: URL?
    static func handle(_ url: URL) -> Bool {
        guard url.scheme == "mvanager", url.host == "agenda",
              URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.contains(where: { $0.name == "widgetAction" }) == true else { return false }
        pending = url
        if UIApplication.shared.applicationState == .active { performPending() }
        return true
    }
    static func performPending() {
        guard let request = pending else { return }; pending = nil
        guard let target = AgendaWidgetStore.resolveWidgetAction(request) else {
            showError("L’evento non è più disponibile oppure l’account è cambiato."); return
        }
        UIApplication.shared.open(target, options: [:]) { success in
            if !success { showError("Impossibile aprire Mappe o Telefono su questo dispositivo.") }
        }
    }
    private static func showError(_ message: String) {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        guard var view = scenes.flatMap(\.windows).first(where: \.isKeyWindow)?.rootViewController else { return }
        while let presented = view.presentedViewController { view = presented }
        let alert = UIAlertController(title: "Azione del widget", message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default)); view.present(alert, animated: true)
    }
}
