import WidgetKit
import SwiftUI
import AppIntents

struct AgendaEntry: TimelineEntry {
    let date: Date
    let feed: AgendaWidgetFeed?
    let account: String
    let offline: Bool
    let state: String
    let message: String
}
struct AgendaProvider: TimelineProvider {
    func placeholder(in context: Context) -> AgendaEntry { AgendaEntry(date: Date(), feed: nil, account: "", offline: false, state: "unconfigured", message: "Collega il widget da Impostazioni calendario nell’app.") }
    func getSnapshot(in context: Context, completion: @escaping (AgendaEntry) -> Void) {
        completion(AgendaEntry(date: Date(), feed: AgendaWidgetStore.cached(), account: AgendaWidgetStore.configuration()?.account ?? "", offline: false, state: "idle", message: "Apri Impostazioni calendario per verificare il widget."))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<AgendaEntry>) -> Void) {
        AgendaWidgetStore.refresh { result in
            let feed = result.feed, offline = result.state == "offline"
            let now = Date(), config = AgendaWidgetStore.configuration()
            let account = config?.account ?? ""
            var dates = [now]
            // Advance the displayed appointments even when iOS postpones a fetch.
            for event in feed?.events ?? [] where event.end > now { dates.append(event.end) }
            if let config = config { dates.append(Date(timeIntervalSince1970: config.expiresAt / 1000)) }
            let entries = Array(Set(dates.filter { $0 >= now })).sorted().prefix(66).map { date in
                AgendaEntry(date: date, feed: (config?.expiresAt ?? 0) > date.timeIntervalSince1970 * 1000 ? feed : nil, account: account, offline: offline, state: result.state, message: result.message)
            }
            completion(Timeline(entries: entries, policy: .after(now.addingTimeInterval(1800))))
        }
    }
}
struct AgendaWidgetView: View {
    let entry: AgendaEntry
    @Environment(\.widgetFamily) var family
    private var familyKey: String { String(describing: family) }
    private var upcoming: [AgendaWidgetEvent] { AgendaWidgetStore.upcoming(entry.feed, now: entry.date) }
    private var selectedIndex: Int { AgendaWidgetStore.selectedIndex(events: upcoming, account: entry.account, family: familyKey) }
    private var events: [AgendaWidgetEvent] { upcoming.isEmpty ? [] : [upcoming[selectedIndex]] }
    private var agendaURL: URL { AgendaWidgetStore.link(route: "/calendarHome", account: entry.account) }
    private func time(_ event: AgendaWidgetEvent) -> String {
        let formatter = DateFormatter(); formatter.locale = Locale(identifier: "it_IT"); formatter.dateFormat = "HH:mm"
        return event.dayLong ? "Tutto il giorno" : formatter.string(from: event.start) + " – " + formatter.string(from: event.end)
    }
    private func day(_ date: Date) -> String {
        let formatter = DateFormatter(); formatter.locale = Locale(identifier: "it_IT"); formatter.dateFormat = "d MMM"
        return formatter.string(from: date)
    }
    var body: some View {
        if #available(iOSApplicationExtension 17.0, *) {
            content.containerBackground(.background, for: .widget)
        } else { content.padding().background(Color(UIColor.systemBackground)) }
    }
    private var content: some View {
        VStack(alignment: .leading, spacing: family == .systemSmall ? 2 : 7) {
            HStack {
                Link(destination: agendaURL) { Text(family == .systemSmall ? "MVanager" : "MVanager · La mia agenda").font(.system(size: 14, weight: .semibold)).foregroundStyle(Color.blue) }
                Spacer(minLength: 4)
                if family != .systemSmall {
                    Link(destination: AgendaWidgetStore.link(route: "/calendarHome?newEvent=1", account: entry.account)) { Image(systemName: "plus.circle.fill").font(.title3) }.accessibilityLabel("Nuovo evento")
                }
            }
            if events.isEmpty {
                Text(entry.feed == nil ? entry.message : AgendaWidgetStore.date(entry.feed!.validUntil) <= entry.date ? "Agenda da aggiornare" : "Nessun impegno nei prossimi 7 giorni")
                    .font(.subheadline).foregroundStyle(.secondary)
                Spacer(minLength: 0)
            } else {
                ForEach(events) { event in
                    Link(destination: AgendaWidgetStore.link(route: event.route, account: entry.account)) {
                        HStack(alignment: .top, spacing: 9) {
                            RoundedRectangle(cornerRadius: 2).fill(event.calendarScope == "personal" ? Color.purple : Color.blue).frame(width: 3)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(day(event.start) + " · " + time(event) + (family == .systemSmall ? "" : " · " + event.companyLabel)).font(.system(size: 11)).foregroundStyle(.secondary).lineLimit(1)
                                Text(event.title).font(.system(size: 14, weight: .semibold)).lineLimit(1)
                                if !event.locationAddress.isEmpty { Text(event.locationAddress).font(.system(size: 12)).foregroundStyle(.secondary).lineLimit(1) }
                            }.frame(maxWidth: .infinity, alignment: .leading)
                        }.fixedSize(horizontal: false, vertical: true)
                    }.buttonStyle(.plain).privacySensitive()
                }
                if let first = events.first, !first.private, entry.feed?.private == false {
                    HStack(spacing: 8) {
                        if AgendaWidgetStore.carActionURL(first, call: false) != nil {
                            navigationAction(first)
                        }
                        if AgendaWidgetStore.carActionURL(first, call: true) != nil {
                            callAction(first)
                        }
                    }
                    if #available(iOSApplicationExtension 18.0, *), !first.locationAddress.isEmpty, AgendaNavigationStore.state.selected == nil {
                        Text(AgendaNavigationStore.state.available.isEmpty ? "Nessun navigatore disponibile" : "Scegli il navigatore nelle impostazioni")
                            .font(.system(size: 10)).foregroundStyle(.secondary).lineLimit(2)
                    }
                }
                if #available(iOSApplicationExtension 17.0, *), let event = events.first, upcoming.count > 1 {
                    HStack {
                        Button(intent: AgendaPageIntent(account: entry.account, family: familyKey, currentID: event.id, step: -1)) {
                            Image(systemName: "chevron.left").frame(width: 32, height: 24)
                        }.disabled(selectedIndex == 0).accessibilityLabel("Appuntamento precedente")
                        Spacer(minLength: 0)
                        Text("\(selectedIndex + 1) / \(upcoming.count)").font(.system(size: 11)).foregroundStyle(.secondary)
                        Spacer(minLength: 0)
                        Button(intent: AgendaPageIntent(account: entry.account, family: familyKey, currentID: event.id, step: 1)) {
                            Image(systemName: "chevron.right").frame(width: 32, height: 24)
                        }.disabled(selectedIndex == upcoming.count - 1).accessibilityLabel("Appuntamento successivo")
                    }.buttonStyle(.plain)
                }
                Spacer(minLength: 0)
            }
            HStack(spacing: 3) {
                if let feed = entry.feed {
                    Text(entry.offline ? "Offline ·" : entry.state == "error" ? "Da aggiornare ·" : "Agg.")
                    Text(AgendaWidgetStore.date(feed.updatedAt), style: .time)
                }
                Spacer(minLength: 2)

            }.font(.system(size: 11)).foregroundStyle(.secondary)
        }.widgetURL(family == .systemSmall ? events.first.map { AgendaWidgetStore.link(route: $0.route, account: entry.account) } ?? agendaURL : agendaURL)
    }
    private func action(_ event: AgendaWidgetEvent, title: String, icon: String, call: Bool) -> some View {
        Link(destination: AgendaWidgetStore.actionLink(event: event, account: entry.account, call: call)) {
            Label(title, systemImage: icon)
                .font(.system(size: family == .systemSmall ? 11 : 13, weight: .semibold))
                .lineLimit(1).minimumScaleFactor(0.85)
                .frame(maxWidth: .infinity, minHeight: family == .systemSmall ? 26 : 36)
                .background(Color.blue.opacity(0.12), in: RoundedRectangle(cornerRadius: 8))
        }.accessibilityLabel(title + ": " + event.title)
    }
    @ViewBuilder private func navigationAction(_ event: AgendaWidgetEvent) -> some View {
        if #available(iOSApplicationExtension 18.0, *) {
            Button(intent: AgendaNavigateIntent(account: entry.account, eventID: event.id)) {
                Label("Naviga", systemImage: "location.fill")
                    .font(.system(size: family == .systemSmall ? 11 : 13, weight: .semibold))
                    .lineLimit(1).minimumScaleFactor(0.85)
                    .frame(maxWidth: .infinity, minHeight: family == .systemSmall ? 26 : 36)
                    .background(Color.blue.opacity(0.12), in: RoundedRectangle(cornerRadius: 8))
            }.buttonStyle(.plain).disabled(AgendaNavigationStore.state.selected == nil)
                .accessibilityLabel("Naviga: " + event.title)
        } else { action(event, title: "Naviga", icon: "location.fill", call: false) }
    }
    @ViewBuilder private func callAction(_ event: AgendaWidgetEvent) -> some View {
        if #available(iOSApplicationExtension 18.0, *) {
            Button(intent: AgendaCallIntent(account: entry.account, eventID: event.id)) {
                Label("Chiama", systemImage: "phone.fill")
                    .font(.system(size: family == .systemSmall ? 11 : 13, weight: .semibold))
                    .lineLimit(1).minimumScaleFactor(0.85)
                    .frame(maxWidth: .infinity, minHeight: family == .systemSmall ? 26 : 36)
                    .background(Color.blue.opacity(0.12), in: RoundedRectangle(cornerRadius: 8))
            }.buttonStyle(.plain).accessibilityLabel("Chiama: " + event.title)
        } else { action(event, title: "Chiama", icon: "phone.fill", call: true) }
    }

}

// Resolve the event again when tapped: no stale address in the intent, and no
// foreground hop through MVanager. iOS handles the navigator's universal link.
@available(iOSApplicationExtension 18.0, *)
struct AgendaNavigateIntent: AppIntent {
    static var title: LocalizedStringResource = "Naviga all’appuntamento"
    static var openAppWhenRun: Bool = false
    static var isDiscoverable: Bool = false
    @available(iOSApplicationExtension 26.0, *)
    static var supportedModes: IntentModes { .background }
    @Parameter(title: "Account") var account: String
    @Parameter(title: "Evento") var eventID: String
    init() {}
    init(account: String, eventID: String) { self.account = account; self.eventID = eventID }
    func perform() async throws -> some IntentResult & OpensIntent {
        guard let url = AgendaWidgetStore.navigationURL(account: account, eventID: eventID) else {
            throw NSError(domain: "AgendaNavigation", code: 2, userInfo: [NSLocalizedDescriptionKey:
                "L’evento non è più disponibile oppure manca la scelta del navigatore nelle impostazioni del calendario."])
        }
        return .result(opensIntent: OpenURLIntent(url))
    }
}

// Resolve the currently displayed event at tap time, then hand its validated
// telephone URL directly to iOS. The containing app is not brought forward.
@available(iOSApplicationExtension 18.0, *)
struct AgendaCallIntent: AppIntent {
    static var title: LocalizedStringResource = "Chiama il contatto dell’appuntamento"
    static var openAppWhenRun: Bool = false
    static var isDiscoverable: Bool = false
    @available(iOSApplicationExtension 26.0, *)
    static var supportedModes: IntentModes { .background }
    @Parameter(title: "Account") var account: String
    @Parameter(title: "Evento") var eventID: String
    init() {}
    init(account: String, eventID: String) { self.account = account; self.eventID = eventID }
    func perform() async throws -> some IntentResult & OpensIntent {
        guard let url = AgendaWidgetStore.callURL(account: account, eventID: eventID) else {
            throw NSError(domain: "AgendaCall", code: 1, userInfo: [NSLocalizedDescriptionKey:
                "L’evento non è più disponibile oppure non contiene un numero valido."])
        }
        return .result(opensIntent: OpenURLIntent(url))
    }
}
@main
struct MvanagerAgendaWidget: Widget {
    let kind = "MvanagerAgendaWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: AgendaProvider()) { entry in AgendaWidgetView(entry: entry) }
            .configurationDisplayName("La mia agenda")
            .description("I tuoi prossimi impegni di lavoro e personali, anche nelle aziende collegate.")
            .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

@available(iOSApplicationExtension 17.0, *)
struct AgendaPageIntent: AppIntent {
    static var title: LocalizedStringResource = "Sfoglia agenda"
    static var openAppWhenRun: Bool = false
    @Parameter(title: "Account") var account: String
    @Parameter(title: "Formato") var family: String
    @Parameter(title: "Evento") var currentID: String
    @Parameter(title: "Direzione") var step: Int
    init() {}
    init(account: String, family: String, currentID: String, step: Int) {
        self.account = account; self.family = family; self.currentID = currentID; self.step = step
    }
    func perform() async throws -> some IntentResult {
        AgendaWidgetStore.moveSelection(account: account, family: family, currentID: currentID, step: step)
        WidgetCenter.shared.reloadTimelines(ofKind: "MvanagerAgendaWidget")
        return .result()
    }
}
