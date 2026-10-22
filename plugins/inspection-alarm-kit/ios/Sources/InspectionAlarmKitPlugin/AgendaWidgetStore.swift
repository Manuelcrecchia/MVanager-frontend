import Foundation
import Security
import CryptoKit

enum AgendaNavigator: String, CaseIterable {
    case google, apple, waze
    var label: String {
        switch self { case .google: return "Google Maps"; case .apple: return "Mappe"; case .waze: return "Waze" }
    }
    var detectionURL: URL {
        let scheme: String
        switch self { case .google: scheme = "comgooglemaps"; case .apple: scheme = "maps"; case .waze: scheme = "waze" }
        return URL(string: scheme + "://")!
    }
    func directionsURL(address: String) -> URL? {
        let address = address.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !address.isEmpty else { return nil }
        var url = URLComponents(); url.scheme = "https"
        switch self {
        case .google:
            url.host = "www.google.com"; url.path = "/maps/dir/"
            url.queryItems = [URLQueryItem(name: "api", value: "1"), URLQueryItem(name: "destination", value: address), URLQueryItem(name: "travelmode", value: "driving")]
        case .apple:
            url.host = "maps.apple.com"; url.path = "/"
            url.queryItems = [URLQueryItem(name: "daddr", value: address), URLQueryItem(name: "dirflg", value: "d")]
        case .waze:
            url.host = "waze.com"; url.path = "/ul"
            url.queryItems = [URLQueryItem(name: "q", value: address), URLQueryItem(name: "navigate", value: "yes"), URLQueryItem(name: "utm_source", value: "mvanager")]
        }
        // Query-form decoders treat a literal plus as a space; preserve it in addresses.
        url.percentEncodedQuery = url.percentEncodedQuery?.replacingOccurrences(of: "+", with: "%2B")
        return url.url
    }
}

struct AgendaNavigationState {
    let available: [AgendaNavigator]
    let preferred: AgendaNavigator?
    var selected: AgendaNavigator? {
        return preferred.flatMap { available.contains($0) ? $0 : nil }
    }
    var payload: [String: Any] {
        ["available": available.map { ["id": $0.rawValue, "label": $0.label] },
         "preferred": preferred?.rawValue ?? "", "selected": selected?.rawValue ?? ""]
    }
}

// Device preference, shared with WidgetKit and intentionally independent of the
// calendar account. Only the foreground app checks installed URL handlers.
enum AgendaNavigationStore {
    private static var defaults: UserDefaults? { UserDefaults(suiteName: AgendaWidgetStore.group) }
    static var state: AgendaNavigationState {
        AgendaNavigationState(available: (defaults?.stringArray(forKey: "navigation.available") ?? []).compactMap(AgendaNavigator.init(rawValue:)),
                              preferred: defaults?.string(forKey: "navigation.preferred").flatMap(AgendaNavigator.init(rawValue:)))
    }
    @discardableResult static func updateAvailable(_ available: [AgendaNavigator]) -> AgendaNavigationState {
        let unique = AgendaNavigator.allCases.filter { available.contains($0) }
        defaults?.set(unique.map(\.rawValue), forKey: "navigation.available")
        if let previous = state.preferred, !unique.contains(previous) { defaults?.removeObject(forKey: "navigation.preferred") }
        return state
    }
    static func select(_ navigator: AgendaNavigator) throws {
        guard state.available.contains(navigator), let defaults = defaults else {
            throw NSError(domain: "AgendaNavigation", code: 1, userInfo: [NSLocalizedDescriptionKey: "Il navigatore non è più disponibile su questo iPhone."])
        }
        defaults.set(navigator.rawValue, forKey: "navigation.preferred")
    }
}

// Compiled into both the Capacitor plugin and the WidgetKit extension.
struct AgendaWidgetConfiguration: Codable {
    let endpoint: String
    let tenantId: String
    let token: String
    let expiresAt: Double
    var account: String { tenantId + ":" + (token.split(separator: ".").first.map(String.init) ?? "") }
}
struct AgendaWidgetEvent: Codable, Identifiable {
    let id: String
    let appointmentId: String
    let startDate: String
    let endDate: String
    let dayLong: Bool
    let calendarScope: String
    let sourceTenantId: String
    let companyLabel: String
    let title: String
    let locationAddress: String
    let phone: String
    let route: String
    let `private`: Bool
    var start: Date { AgendaWidgetStore.date(startDate) }
    var end: Date { AgendaWidgetStore.date(endDate) }
}
struct AgendaWidgetFeed: Codable {
    let version: Int
    let updatedAt: String
    let validUntil: String
    let timezone: String
    let `private`: Bool
    let events: [AgendaWidgetEvent]
}
struct AgendaWidgetRefreshResult {
    let feed: AgendaWidgetFeed?
    let state: String
    let message: String
    var payload: [String: Any] {
        var value: [String: Any] = ["state": state, "message": message,
            "eventCount": feed?.events.filter { $0.end > Date() }.count ?? 0]
        if let feed = feed { value["updatedAt"] = feed.updatedAt }
        return value
    }
}
enum AgendaWidgetStore {
    static let group = "group.it.mvtechcore.mvanager.agenda"
    private static let service = "it.mvtechcore.mvanager.agenda.widget"
    private static func fingerprint(_ token: String) -> String { SHA256.hash(data: Data(token.utf8)).map { String(format: "%02x", $0) }.joined() }
    private static var container: URL? { FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group) }
    private static func cacheURL(_ token: String) -> URL? { container?.appendingPathComponent("agenda-v1-" + fingerprint(token) + ".json") }
    private static var query: [String: Any]? {
        guard let access = Bundle.main.object(forInfoDictionaryKey: "AgendaKeychainGroup") as? String, !access.isEmpty else { return nil }
        return [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service,
                kSecAttrAccount as String: "configuration", kSecAttrAccessGroup as String: access]
    }
    static func configuration() -> AgendaWidgetConfiguration? {
        guard var q = query else { return nil }
        q[kSecReturnData as String] = true; q[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary, &result) == errSecSuccess, let data = result as? Data else { return nil }
        return try? JSONDecoder().decode(AgendaWidgetConfiguration.self, from: data)
    }
    static func configure(_ config: AgendaWidgetConfiguration) throws {
        guard var q = query, container != nil else { throw NSError(domain: service, code: 1, userInfo: [NSLocalizedDescriptionKey: "App Group del widget non disponibile"]) }
        clear()
        q[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        q[kSecValueData as String] = try JSONEncoder().encode(config)
        let status = SecItemAdd(q as CFDictionary, nil)
        guard status == errSecSuccess else { throw NSError(domain: NSOSStatusErrorDomain, code: Int(status)) }
    }
    static func clear() {
        if let q = query { SecItemDelete(q as CFDictionary) }
        if let directory = container, let files = try? FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil) {
            for file in files where file.lastPathComponent.hasPrefix("agenda-v1-") { try? FileManager.default.removeItem(at: file) }
        }
    }
    static func clear(ifToken token: String) { if configuration()?.token == token { clear() } }
    static func cached() -> AgendaWidgetFeed? {
        guard let config = configuration(), config.expiresAt > Date().timeIntervalSince1970 * 1000,
              let url = cacheURL(config.token), let data = try? Data(contentsOf: url),
              let envelope = try? JSONDecoder().decode(Cache.self, from: data), envelope.fingerprint == fingerprint(config.token) else { return nil }
        return envelope.feed
    }
    private struct Cache: Codable { let fingerprint: String; let feed: AgendaWidgetFeed }
    static func carDestinations(_ feed: AgendaWidgetFeed?, now: Date = Date()) -> [AgendaWidgetEvent] {
        guard let feed = feed, date(feed.validUntil) > now else { return [] }
        return feed.events.filter { $0.end > now && !$0.private && !$0.locationAddress.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
            .sorted { $0.start < $1.start }
    }
    static func carActionURL(_ event: AgendaWidgetEvent, call: Bool) -> URL? {
        guard !event.private else { return nil }
        var components = URLComponents()
        if call {
            guard event.phone.range(of: "^\\+?[0-9]{3,20}$", options: .regularExpression) != nil else { return nil }
            components.scheme = "tel"; components.path = event.phone
        } else {
            guard !event.locationAddress.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
            components.scheme = "https"; components.host = "maps.apple.com"; components.path = "/"
            components.queryItems = [URLQueryItem(name: "daddr", value: event.locationAddress), URLQueryItem(name: "dirflg", value: "d")]
        }
        return components.url
    }
    static func date(_ value: String) -> Date {
        let formatter = ISO8601DateFormatter(); formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: value) { return date }
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: value) ?? .distantPast
    }
    static func link(route: String, account: String) -> URL {
        var result = URLComponents(); result.scheme = "mvanager"; result.host = "agenda"
        result.queryItems = (URLComponents(string: route)?.queryItems ?? []) + [URLQueryItem(name: "account", value: account)]
        return result.url!
    }
    static func upcoming(_ feed: AgendaWidgetFeed?, now: Date = Date()) -> [AgendaWidgetEvent] {
        guard let feed = feed, date(feed.validUntil) > now else { return [] }
        return feed.events.filter { $0.end > now }.sorted { $0.start < $1.start }
    }
    static func selectedIndex(events: [AgendaWidgetEvent], account: String, family: String) -> Int {
        let id = UserDefaults(suiteName: group)?.string(forKey: "selection.\(account).\(family)")
        return events.firstIndex { $0.id == id } ?? 0
    }
    static func moveSelection(account: String, family: String, currentID: String, step: Int) {
        guard configuration()?.account == account else { return }
        let events = upcoming(cached())
        guard !events.isEmpty else { return }
        let current = events.firstIndex { $0.id == currentID } ?? 0
        let next = max(0, min(events.count - 1, current + (step < 0 ? -1 : 1)))
        UserDefaults(suiteName: group)?.set(events[next].id, forKey: "selection.\(account).\(family)")
    }
    static func actionLink(event: AgendaWidgetEvent, account: String, call: Bool) -> URL {
        var result = URLComponents(); result.scheme = "mvanager"; result.host = "agenda"
        result.queryItems = [URLQueryItem(name: "account", value: account), URLQueryItem(name: "eventKey", value: event.id),
                             URLQueryItem(name: "widgetAction", value: call ? "call" : "navigate")]
        return result.url!
    }
    static func resolveWidgetAction(_ url: URL, now: Date = Date()) -> URL? {
        guard url.scheme == "mvanager", url.host == "agenda",
              let config = configuration(), config.expiresAt > now.timeIntervalSince1970 * 1000,
              let feed = cached(), date(feed.validUntil) > now else { return nil }
        let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        func value(_ key: String) -> String? {
            let matches = items.filter { $0.name == key }
            return matches.count == 1 ? matches.first?.value : nil
        }
        guard value("account") == config.account, let action = value("widgetAction"), ["call", "navigate"].contains(action),
              let event = feed.events.first(where: { $0.id == value("eventKey") && $0.end > now && !$0.private }) else { return nil }
        return carActionURL(event, call: action == "call")
    }
    static func navigationURL(account: String, eventID: String, now: Date = Date()) -> URL? {
        guard let config = configuration(), config.account == account, config.expiresAt > now.timeIntervalSince1970 * 1000,
              let feed = cached(), !feed.private, date(feed.validUntil) > now,
              let event = feed.events.first(where: { $0.id == eventID && $0.end > now && !$0.private }),
              let navigator = AgendaNavigationStore.state.selected else { return nil }
        return navigator.directionsURL(address: event.locationAddress)
    }
    static func callURL(account: String, eventID: String, now: Date = Date()) -> URL? {
        guard let config = configuration(), config.account == account, config.expiresAt > now.timeIntervalSince1970 * 1000,
              let feed = cached(), !feed.private, date(feed.validUntil) > now,
              let event = feed.events.first(where: { $0.id == eventID && $0.end > now && !$0.private }) else { return nil }
        return carActionURL(event, call: true)
    }
    static func allowsEndpoint(_ url: URL) -> Bool {
        guard url.host != nil, url.user == nil, url.password == nil,
              url.path.hasSuffix("/appointments/widget/feed") else { return false }
        #if DEBUG
        return url.scheme == "https" || url.scheme == "http"
        #else
        return url.scheme == "https"
        #endif
    }
    static func refresh(sessionConfiguration: URLSessionConfiguration = .ephemeral, completion: @escaping (AgendaWidgetRefreshResult) -> Void) {
        guard let config = configuration() else {
            completion(AgendaWidgetRefreshResult(feed: nil, state: "unconfigured", message: "Collega il widget da Impostazioni calendario nell’app.")); return
        }
        guard config.expiresAt > Date().timeIntervalSince1970 * 1000 else {
            clear(ifToken: config.token)
            completion(AgendaWidgetRefreshResult(feed: nil, state: "expired", message: "Apri MVanager per ricollegare il widget.")); return
        }
        guard let url = URL(string: config.endpoint), allowsEndpoint(url) else {
            completion(AgendaWidgetRefreshResult(feed: cached(), state: "error", message: "L’indirizzo del server non è valido per il widget.")); return
        }
        var request = URLRequest(url: url); request.timeoutInterval = 8
        request.setValue("Widget " + config.token, forHTTPHeaderField: "Authorization")
        request.setValue(config.tenantId, forHTTPHeaderField: "X-Tenant-Id")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        let session = URLSession(configuration: sessionConfiguration, delegate: AgendaNoRedirect(), delegateQueue: nil)
        session.dataTask(with: request) { data, response, error in
            defer { session.finishTasksAndInvalidate() }
            guard configuration()?.token == config.token else {
                completion(AgendaWidgetRefreshResult(feed: nil, state: "unconfigured", message: "Account del widget cambiato.")); return
            }
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            if status == 401 || status == 403 {
                clear(ifToken: config.token)
                completion(AgendaWidgetRefreshResult(feed: nil, state: "unauthorized", message: "Apri MVanager per verificare l’accesso al calendario.")); return
            }
            guard error == nil, status == 200, let data = data, data.count <= 524288,
                  let feed = try? JSONDecoder().decode(AgendaWidgetFeed.self, from: data), feed.version == 1 else {
                let previous = cached()
                let message = status == 404 ? "Il server deve essere aggiornato per supportare il widget."
                    : error == nil && status == 200 ? "Il server ha restituito un’agenda non valida."
                    : "Impossibile scaricare l’agenda. Controlla la connessione e riprova."
                completion(AgendaWidgetRefreshResult(feed: previous, state: previous == nil ? "error" : "offline", message: message)); return
            }
            do {
                guard let url = cacheURL(config.token) else { throw CocoaError(.fileWriteNoPermission) }
                let encoded = try JSONEncoder().encode(Cache(fingerprint: fingerprint(config.token), feed: feed))
                try encoded.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
                // Logout/configuration changes may race a response in the other process.
                if configuration()?.token != config.token {
                    try? FileManager.default.removeItem(at: url)
                    completion(AgendaWidgetRefreshResult(feed: nil, state: "unconfigured", message: "Account del widget cambiato.")); return
                }
                completion(AgendaWidgetRefreshResult(feed: feed, state: "updated", message: "Agenda scaricata e aggiornamento del widget richiesto."))
            } catch {
                completion(AgendaWidgetRefreshResult(feed: cached(), state: "error", message: "Impossibile salvare l’agenda condivisa con il widget. Controlla la configurazione App Group."))
            }
        }.resume()
    }
}
private final class AgendaNoRedirect: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
}
