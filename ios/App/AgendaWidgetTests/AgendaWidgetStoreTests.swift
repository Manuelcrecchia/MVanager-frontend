import XCTest
import Foundation

// Run only on a dedicated simulator: the host is the real App, so these tests
// exercise its Keychain group and the shared App Group cache, not a fake store.
final class AgendaWidgetStoreTests: XCTestCase {
    override func setUp() { super.setUp(); AgendaWidgetStore.clear(); AgendaNavigationStore.updateAvailable([]) }
    override func tearDown() { AgendaWidgetStore.clear(); AgendaNavigationStore.updateAvailable([]); super.tearDown() }
    func testNavigatorSelectionPersistsAcrossAccountsAndHandlesUninstall() throws {
        XCTAssertNil(AgendaNavigationStore.state.selected)
        XCTAssertNil(AgendaNavigationStore.updateAvailable([.google]).selected)
        try AgendaNavigationStore.select(.google)
        XCTAssertEqual(AgendaNavigationStore.state.selected, .google)
        AgendaNavigationStore.updateAvailable([])
        XCTAssertNil(AgendaNavigationStore.updateAvailable([.google, .waze]).selected)
        try AgendaNavigationStore.select(.waze)
        try configure(); AgendaWidgetStore.clear()
        XCTAssertEqual(AgendaNavigationStore.state.selected, .waze)
        XCTAssertEqual(AgendaNavigationStore.updateAvailable([.google, .waze, .apple]).selected, .waze)
        XCTAssertNil(AgendaNavigationStore.updateAvailable([.google, .apple]).selected)
        XCTAssertThrowsError(try AgendaNavigationStore.select(.waze))
        XCTAssertNil(AgendaNavigationStore.updateAvailable([.apple]).selected)
        try AgendaNavigationStore.select(.apple)
        XCTAssertEqual(AgendaNavigationStore.state.selected, .apple)
        XCTAssertNil(AgendaNavigationStore.updateAvailable([]).selected)
    }
    func testNavigatorLinksPreserveAddressWithoutParameterInjection() throws {
        let address = "Via Città & Seconda #4 + interno? / Modena"
        for (navigator, host, parameter) in [(AgendaNavigator.google, "www.google.com", "destination"), (.apple, "maps.apple.com", "daddr"), (.waze, "waze.com", "q")] {
            let url = try XCTUnwrap(navigator.directionsURL(address: address))
            XCTAssertEqual(url.scheme, "https"); XCTAssertEqual(url.host, host)
            XCTAssertFalse(url.absoluteString.contains("+"))
            XCTAssertTrue(url.absoluteString.contains("%2B"))
            XCTAssertEqual(URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first { $0.name == parameter }?.value, address)
            XCTAssertNil(navigator.directionsURL(address: "  \n"))
        }
    }
    func testDirectNavigationResolvesSelectedEventAndRejectsStalePrivateOrForeignData() throws {
        try configure(); AgendaNavigationStore.updateAvailable([.google]); try AgendaNavigationStore.select(.google)
        var object = try JSONSerialization.jsonObject(with: data()) as! [String: Any]
        var first = (object["events"] as! [[String: Any]])[0]
        first["locationAddress"] = "Prima destinazione"
        var second = first; second["id"] = "second"; second["locationAddress"] = "Piazza Grande, Modena"
        object["events"] = [first, second]
        _ = refresh(status: 200, body: try JSONSerialization.data(withJSONObject: object))
        let account = try XCTUnwrap(AgendaWidgetStore.configuration()?.account)
        func destination(_ now: Date = Date()) -> URL? { AgendaWidgetStore.navigationURL(account: account, eventID: "second", now: now) }
        XCTAssertEqual(URLComponents(url: try XCTUnwrap(destination()), resolvingAgainstBaseURL: false)?.queryItems?.first { $0.name == "destination" }?.value, "Piazza Grande, Modena")
        XCTAssertNil(AgendaWidgetStore.navigationURL(account: "other", eventID: "second"))
        XCTAssertNil(destination(Date().addingTimeInterval(7200)))
        AgendaNavigationStore.updateAvailable([.google, .waze]); XCTAssertEqual(destination()?.host, "www.google.com")
        try AgendaNavigationStore.select(.waze); XCTAssertEqual(destination()?.host, "waze.com")
        second["locationAddress"] = "Indirizzo aggiornato"; object["events"] = [first, second]
        _ = refresh(status: 200, body: try JSONSerialization.data(withJSONObject: object))
        XCTAssertEqual(URLComponents(url: try XCTUnwrap(destination()), resolvingAgainstBaseURL: false)?.queryItems?.first { $0.name == "q" }?.value, "Indirizzo aggiornato")
        second["private"] = true; object["events"] = [second]
        _ = refresh(status: 200, body: try JSONSerialization.data(withJSONObject: object)); XCTAssertNil(destination())
        object["events"] = []; _ = refresh(status: 200, body: try JSONSerialization.data(withJSONObject: object)); XCTAssertNil(destination())
        object["events"] = [first]; object["private"] = true
        _ = refresh(status: 200, body: try JSONSerialization.data(withJSONObject: object))
        XCTAssertNil(AgendaWidgetStore.navigationURL(account: account, eventID: first["id"] as! String))
        AgendaWidgetStore.clear(); XCTAssertNil(destination())
    }
    func testDirectCallResolvesCurrentPhoneAndRejectsStalePrivateOrForeignData() throws {
        try configure()
        var object = try JSONSerialization.jsonObject(with: data()) as! [String: Any]
        var event = (object["events"] as! [[String: Any]])[0]
        event["phone"] = "177"; object["events"] = [event]
        _ = refresh(status: 200, body: try JSONSerialization.data(withJSONObject: object))
        let account = try XCTUnwrap(AgendaWidgetStore.configuration()?.account)
        let id = event["id"] as! String
        XCTAssertEqual(AgendaWidgetStore.callURL(account: account, eventID: id)?.absoluteString, "tel:177")
        XCTAssertNil(AgendaWidgetStore.callURL(account: "other", eventID: id))
        XCTAssertNil(AgendaWidgetStore.callURL(account: account, eventID: id, now: Date().addingTimeInterval(7200)))
        event["phone"] = "+390001234"; object["events"] = [event]
        _ = refresh(status: 200, body: try JSONSerialization.data(withJSONObject: object))
        XCTAssertEqual(AgendaWidgetStore.callURL(account: account, eventID: id)?.absoluteString, "tel:+390001234")
        event["phone"] = "*123#"; object["events"] = [event]
        _ = refresh(status: 200, body: try JSONSerialization.data(withJSONObject: object))
        XCTAssertNil(AgendaWidgetStore.callURL(account: account, eventID: id))
        event["phone"] = "177"; event["private"] = true; object["events"] = [event]
        _ = refresh(status: 200, body: try JSONSerialization.data(withJSONObject: object))
        XCTAssertNil(AgendaWidgetStore.callURL(account: account, eventID: id))
        event["private"] = false; object["events"] = [event]; object["private"] = true
        _ = refresh(status: 200, body: try JSONSerialization.data(withJSONObject: object))
        XCTAssertNil(AgendaWidgetStore.callURL(account: account, eventID: id))
        AgendaWidgetStore.clear(); XCTAssertNil(AgendaWidgetStore.callURL(account: account, eventID: id))
    }
    private func configure() throws {
        try AgendaWidgetStore.configure(AgendaWidgetConfiguration(endpoint: "http://127.0.0.1:5001/appointments/widget/feed", tenantId: "widget-test",
            token: "1.aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa." + String(repeating: "a", count: 64), expiresAt: Date().addingTimeInterval(3600).timeIntervalSince1970 * 1000))
    }
    private func data() -> Data {
        let now = ISO8601DateFormatter().string(from: Date())
        let later = ISO8601DateFormatter().string(from: Date().addingTimeInterval(3600))
        return try! JSONSerialization.data(withJSONObject: ["version": 1, "updatedAt": now, "validUntil": later, "timezone": "Europe/Rome", "private": false,
            "events": [["id": "test@now", "appointmentId": "7", "startDate": now, "endDate": later, "dayLong": false, "calendarScope": "personal",
                "sourceTenantId": "widget-test", "companyLabel": "Azienda FITTIZIA", "title": "Evento personale FITTIZIO", "locationAddress": "", "phone": "", "route": "/calendarHome?appointmentId=7", "private": false]]])
    }
    private func refresh(status: Int, body: Data? = nil, delay: TimeInterval = 0) -> AgendaWidgetRefreshResult {
        let done = expectation(description: "native widget refresh")
        var result: AgendaWidgetRefreshResult!
        WidgetTestURLProtocol.response = (status, body ?? data(), delay)
        let configuration = URLSessionConfiguration.ephemeral; configuration.protocolClasses = [WidgetTestURLProtocol.self]
        AgendaWidgetStore.refresh(sessionConfiguration: configuration) { value in result = value; done.fulfill() }
        wait(for: [done], timeout: 5)
        return result
    }
    func testCarDestinationsRespectPrivacyExpiryAndAddress() throws {
        var object = try JSONSerialization.jsonObject(with: data()) as! [String: Any]
        var event = (object["events"] as! [[String: Any]])[0]
        event["locationAddress"] = "Via Test & Seconda #4"; event["phone"] = "+390001234"
        var hidden = event; hidden["private"] = true
        var past = event; past["endDate"] = "2000-01-01T00:00:00Z"
        var empty = event; empty["locationAddress"] = " "
        object["events"] = [event, hidden, past, empty]
        let feed = try JSONDecoder().decode(AgendaWidgetFeed.self, from: JSONSerialization.data(withJSONObject: object))
        let entries = AgendaWidgetStore.carDestinations(feed)
        XCTAssertEqual(entries.count, 1)
        XCTAssertTrue(AgendaWidgetStore.carDestinations(feed, now: Date().addingTimeInterval(7200)).isEmpty)
        let url = AgendaWidgetStore.carActionURL(entries[0], call: false)!
        XCTAssertEqual(url.host, "maps.apple.com")
        XCTAssertEqual(URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first?.value, "Via Test & Seconda #4")
        XCTAssertEqual(AgendaWidgetStore.carActionURL(entries[0], call: true)?.scheme, "tel")
        XCTAssertNil(AgendaWidgetStore.carActionURL(feed.events[1], call: false))
        event["phone"] = "*123#"; object["events"] = [event]
        let invalid = try JSONDecoder().decode(AgendaWidgetFeed.self, from: JSONSerialization.data(withJSONObject: object))
        XCTAssertNil(AgendaWidgetStore.carActionURL(invalid.events[0], call: true))
    }
    func testWidgetActionsResolveCurrentEventAndRejectStaleLinks() throws {
        try configure()
        var object = try JSONSerialization.jsonObject(with: data()) as! [String: Any]
        var event = (object["events"] as! [[String: Any]])[0]
        event["locationAddress"] = "Via Test & Seconda #4"; event["phone"] = "+390001234"
        object["events"] = [event]
        _ = refresh(status: 200, body: try JSONSerialization.data(withJSONObject: object))
        let cached = try XCTUnwrap(AgendaWidgetStore.cached()?.events.first)
        let account = try XCTUnwrap(AgendaWidgetStore.configuration()?.account)
        let navigate = AgendaWidgetStore.actionLink(event: cached, account: account, call: false)
        let call = AgendaWidgetStore.actionLink(event: cached, account: account, call: true)
        XCTAssertEqual(AgendaWidgetStore.resolveWidgetAction(navigate)?.host, "maps.apple.com")
        XCTAssertEqual(AgendaWidgetStore.resolveWidgetAction(call)?.absoluteString, "tel:+390001234")
        XCTAssertNil(AgendaWidgetStore.resolveWidgetAction(AgendaWidgetStore.actionLink(event: cached, account: "another-account", call: true)))
        XCTAssertNil(AgendaWidgetStore.resolveWidgetAction(URL(string: call.absoluteString + "&widgetAction=navigate")!))
        XCTAssertNil(AgendaWidgetStore.resolveWidgetAction(call, now: Date().addingTimeInterval(7200)))
        event["phone"] = "+390009999"; object["events"] = [event]
        _ = refresh(status: 200, body: try JSONSerialization.data(withJSONObject: object))
        XCTAssertEqual(AgendaWidgetStore.resolveWidgetAction(call)?.absoluteString, "tel:+390009999")
        event["private"] = true; object["events"] = [event]
        _ = refresh(status: 200, body: try JSONSerialization.data(withJSONObject: object))
        XCTAssertNil(AgendaWidgetStore.resolveWidgetAction(call))
        object["events"] = []
        _ = refresh(status: 200, body: try JSONSerialization.data(withJSONObject: object))
        XCTAssertNil(AgendaWidgetStore.resolveWidgetAction(navigate))
        AgendaWidgetStore.clear()
        XCTAssertNil(AgendaWidgetStore.resolveWidgetAction(call))
    }
    func testPagingKeepsActionsOnSelectedEventAndHandlesDeletion() throws {
        try configure()
        var object = try JSONSerialization.jsonObject(with: data()) as! [String: Any]
        var first = (object["events"] as! [[String: Any]])[0]
        first["phone"] = "+39000111"
        var second = first; second["id"] = "second"; second["phone"] = "+39000222"
        second["startDate"] = ISO8601DateFormatter().string(from: Date().addingTimeInterval(60))
        object["events"] = [first, second]
        _ = refresh(status: 200, body: try JSONSerialization.data(withJSONObject: object))
        let account = try XCTUnwrap(AgendaWidgetStore.configuration()?.account)
        let events = AgendaWidgetStore.upcoming(AgendaWidgetStore.cached())
        AgendaWidgetStore.moveSelection(account: account, family: "test", currentID: events[0].id, step: 1)
        let index = AgendaWidgetStore.selectedIndex(events: events, account: account, family: "test")
        XCTAssertEqual(index, 1)
        XCTAssertEqual(AgendaWidgetStore.resolveWidgetAction(AgendaWidgetStore.actionLink(event: events[index], account: account, call: true))?.absoluteString, "tel:+39000222")
        AgendaWidgetStore.moveSelection(account: account, family: "test", currentID: events[1].id, step: 1)
        XCTAssertEqual(AgendaWidgetStore.selectedIndex(events: events, account: account, family: "test"), 1)
        AgendaWidgetStore.moveSelection(account: account, family: "test", currentID: events[1].id, step: -1)
        XCTAssertEqual(AgendaWidgetStore.selectedIndex(events: events, account: account, family: "test"), 0)
        XCTAssertEqual(AgendaWidgetStore.selectedIndex(events: [events[1]], account: account, family: "test"), 0)
        XCTAssertTrue(AgendaWidgetStore.upcoming(AgendaWidgetStore.cached(), now: Date().addingTimeInterval(7200)).isEmpty)
    }
    func testDebugLocalEndpointAndProductionTransportPolicy() {
        let local = URL(string: "http://192.168.1.92:5001/appointments/widget/feed")!
        #if DEBUG
        XCTAssertTrue(AgendaWidgetStore.allowsEndpoint(local))
        #else
        XCTAssertFalse(AgendaWidgetStore.allowsEndpoint(local))
        #endif
        XCTAssertTrue(AgendaWidgetStore.allowsEndpoint(URL(string: "https://example.test/appointments/widget/feed")!))
        XCTAssertFalse(AgendaWidgetStore.allowsEndpoint(URL(string: "https://example.test/other")!))
        XCTAssertFalse(AgendaWidgetStore.allowsEndpoint(URL(string: "https://user:secret@example.test/appointments/widget/feed")!))
    }
    func testPersonalEventIsDownloadedAndWrittenToTheActualSharedCache() throws {
        try configure()
        let result = refresh(status: 200)
        XCTAssertEqual(result.state, "updated")
        XCTAssertEqual(result.payload["eventCount"] as? Int, 1)
        XCTAssertEqual(AgendaWidgetStore.cached()?.events.first?.title, "Evento personale FITTIZIO")
        XCTAssertEqual(WidgetTestURLProtocol.lastRequest?.value(forHTTPHeaderField: "X-Tenant-Id"), "widget-test")
        XCTAssertTrue(WidgetTestURLProtocol.lastRequest?.value(forHTTPHeaderField: "Authorization")?.hasPrefix("Widget 1.") == true)
    }
    func testNetworkErrorPreservesCacheAndReportsOffline() throws {
        try configure(); XCTAssertEqual(refresh(status: 200).state, "updated")
        let result = refresh(status: 503)
        XCTAssertEqual(result.state, "offline")
        XCTAssertEqual(result.feed?.events.count, 1)
        XCTAssertEqual(AgendaWidgetStore.cached()?.events.count, 1)
    }
    func testRevocationClearsTheRealCacheAndKeychainCredential() throws {
        try configure(); _ = refresh(status: 200)
        XCTAssertEqual(refresh(status: 401).state, "unauthorized")
        XCTAssertNil(AgendaWidgetStore.configuration()); XCTAssertNil(AgendaWidgetStore.cached())
    }
    func testMissingConfigurationIsReportedInsteadOfClaimingAnEmptyCalendar() {
        let result = refresh(status: 200)
        XCTAssertEqual(result.state, "unconfigured"); XCTAssertNil(result.feed)
        XCTAssertFalse(result.message.isEmpty)
    }
    func testLateResponseCannotRepopulateCacheAfterLogout() throws {
        try configure()
        let done = expectation(description: "late response")
        WidgetTestURLProtocol.response = (200, data(), 0.15)
        let configuration = URLSessionConfiguration.ephemeral; configuration.protocolClasses = [WidgetTestURLProtocol.self]
        AgendaWidgetStore.refresh(sessionConfiguration: configuration) { result in
            XCTAssertEqual(result.state, "unconfigured"); done.fulfill()
        }
        AgendaWidgetStore.clear()
        wait(for: [done], timeout: 5)
        XCTAssertNil(AgendaWidgetStore.cached()); XCTAssertNil(AgendaWidgetStore.configuration())
    }
}
private final class WidgetTestURLProtocol: URLProtocol {
    static var response: (Int, Data, TimeInterval) = (200, Data(), 0)
    static var lastRequest: URLRequest?
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        Self.lastRequest = request
        let (status, body, delay) = Self.response
        DispatchQueue.global().asyncAfter(deadline: .now() + delay) {
            self.client?.urlProtocol(self, didReceive: HTTPURLResponse(url: self.request.url!, statusCode: status, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "application/json"])!, cacheStoragePolicy: .notAllowed)
            self.client?.urlProtocol(self, didLoad: body)
            self.client?.urlProtocolDidFinishLoading(self)
        }
    }
    override func stopLoading() {}
}
