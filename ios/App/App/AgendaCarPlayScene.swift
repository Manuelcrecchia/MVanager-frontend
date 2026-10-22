import CarPlay
import UIKit

/// Uses only the existing read-only agenda credential, never the app JWT.
/// Device activation requires Apple's driving-task entitlement (see docs/car-agenda.md).
class AgendaCarPlayScene: UIResponder, CPTemplateApplicationSceneDelegate {
    private var controller: CPInterfaceController?
    private var timer: Timer?
    private var downloading = false
    private var lastFetch = Date.distantPast
    private var signature = ""
    private var syncState = "idle"
    private var selectedID: String?
    private var selectedToken: String?

    func templateApplicationScene(_ scene: CPTemplateApplicationScene, didConnect interfaceController: CPInterfaceController) {
        controller = interfaceController
        tick()
        timer = Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { [weak self] _ in self?.tick() }
    }
    func templateApplicationScene(_ scene: CPTemplateApplicationScene, didDisconnectInterfaceController interfaceController: CPInterfaceController) {
        timer?.invalidate(); timer = nil; controller = nil; signature = ""; selectedID = nil; selectedToken = nil
    }
    private func tick() {
        render()
        guard !downloading, Date().timeIntervalSince(lastFetch) >= 60 else { return }
        downloading = true; lastFetch = Date()
        AgendaWidgetStore.refresh { [weak self] result in
            DispatchQueue.main.async { self?.syncState = result.state; self?.downloading = false; self?.render() }
        }
    }
    private func currentEvents() -> [AgendaWidgetEvent] {
        return AgendaWidgetStore.carDestinations(AgendaWidgetStore.cached())
    }
    private func when(_ event: AgendaWidgetEvent) -> String {
        let f = DateFormatter(); f.locale = Locale(identifier: "it_IT"); f.timeZone = TimeZone(identifier: "Europe/Rome")
        f.dateFormat = event.dayLong ? "d MMM · 'Tutto il giorno'" : "d MMM · HH:mm"
        return f.string(from: event.start)
    }
    private func render() {
        guard let controller = controller else { return }
        let events = currentEvents(), config = AgendaWidgetStore.configuration(), feed = AgendaWidgetStore.cached()
        let next = (config?.token ?? "") + (feed?.updatedAt ?? "") + syncState + events.map(\.id).joined(separator: "|")
        guard signature != next || controller.rootTemplate == nil else { return }
        signature = next
        let items: [CPListItem] = Array(events.prefix(6)).map { event in
            let item = CPListItem(text: event.title, detailText: when(event) + " · " + event.locationAddress)
            item.handler = { [weak self] _, complete in self?.show(event, expectedToken: config?.token); complete() }
            return item
        }
        let template = CPListTemplate(title: "MVanager · Destinazioni", sections: [CPListSection(items: items, header: syncState == "offline" ? "Offline · ultima agenda scaricata" : nil, sectionIndexTitle: nil)])
        template.emptyViewTitleVariants = [config == nil ? "Accedi a MVanager" : "Nessuna destinazione"]
        template.emptyViewSubtitleVariants = [config == nil ? "Dal telefono, quando sei fermo" : feed == nil ? "Agenda non disponibile. Verifica la connessione" : "Nessun evento con indirizzo nei prossimi 7 giorni"]
        if let root = controller.rootTemplate as? CPListTemplate {
            root.updateSections(template.sections)
            root.emptyViewTitleVariants = template.emptyViewTitleVariants
            root.emptyViewSubtitleVariants = template.emptyViewSubtitleVariants
            if let detail = controller.topTemplate as? CPInformationTemplate {
                if selectedToken == config?.token, let event = events.first(where: { $0.id == selectedID }), let token = config?.token {
                    let fresh = details(event, token: token)
                    detail.title = fresh.title; detail.items = fresh.items; detail.actions = fresh.actions
                } else {
                    detail.title = "Destinazione non disponibile"; detail.items = []; detail.actions = []
                    controller.popToRootTemplate(animated: false, completion: nil)
                    selectedID = nil; selectedToken = nil
                }
            }
        } else { controller.setRootTemplate(template, animated: false, completion: nil) }
    }
    private func show(_ event: AgendaWidgetEvent, expectedToken: String?) {
        guard let token = AgendaWidgetStore.configuration()?.token, token == expectedToken,
              let current = currentEvents().first(where: { $0.id == event.id }) else { render(); return }
        selectedID = current.id; selectedToken = token
        controller?.pushTemplate(details(current, token: token), animated: true, completion: nil)
    }
    private func details(_ current: AgendaWidgetEvent, token: String) -> CPInformationTemplate {
        var actions = [CPTextButton(title: "Naviga", textStyle: .normal) { [weak self] _ in self?.open(id: current.id, token: token, call: false) }]
        if current.phone.range(of: "^\\+?[0-9]{3,20}$", options: .regularExpression) != nil {
            actions.append(CPTextButton(title: "Chiama", textStyle: .normal) { [weak self] _ in self?.open(id: current.id, token: token, call: true) })
        }
        return CPInformationTemplate(title: current.title, layout: .leading,
            items: [CPInformationItem(title: "Quando", detail: when(current)), CPInformationItem(title: "Indirizzo", detail: current.locationAddress)], actions: actions)
    }
    private func open(id: String, token: String, call: Bool) {
        guard AgendaWidgetStore.configuration()?.token == token,
              let event = currentEvents().first(where: { $0.id == id }) else { signature = ""; render(); return }
        guard let url = AgendaWidgetStore.carActionURL(event, call: call) else { return }
        UIApplication.shared.open(url, options: [:]) { [weak self] success in
            guard !success else { return }
            let alert = CPAlertTemplate(titleVariants: ["Azione non disponibile su questo sistema auto"],
                actions: [CPAlertAction(title: "OK", style: .cancel) { _ in self?.controller?.dismissTemplate(animated: true, completion: nil) }])
            self?.controller?.presentTemplate(alert, animated: true, completion: nil)
        }
    }
}
