package it.mvtechcore.mvanager;

import static org.junit.Assert.*;
import android.content.Context;
import android.widget.LinearLayout;
import android.widget.RemoteViews;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.concurrent.atomic.AtomicReference;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

@RunWith(AndroidJUnit4.class)
public class AgendaWidgetTest {
    private final Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
    private JSONObject config(String token) throws Exception {
        return new JSONObject().put("token", token).put("tenantId", "widget-test")
            .put("expiresAt", System.currentTimeMillis() + 60000).put("endpoint", "http://127.0.0.1:1/appointments/widget/feed");
    }
    @After public void clear() { AgendaWidgetStore.clear(context); }
    @Test public void pluginAcceptsMillisecondEpochFromJavaScript() throws Exception {
        long expiry = System.currentTimeMillis() + 3600000L;
        assertEquals(expiry, AgendaWidgetPlugin.expiryMillis(new JSONObject().put("expiresAt", expiry)));
        assertEquals(expiry, AgendaWidgetPlugin.expiryMillis(new JSONObject().put("expiresAt", (double) expiry)));
    }
    @Test public void encryptedCacheAndLogoutRejectStaleResponses() throws Exception {
        AgendaWidgetStore.write(context, config("secret-widget-only-token"));
        assertEquals("secret-widget-only-token", AgendaWidgetStore.read(context).getString("token"));
        byte[] bytes = Files.readAllBytes(new java.io.File(context.getNoBackupFilesDir(), "agenda-widget.enc").toPath());
        assertFalse(new String(bytes, StandardCharsets.UTF_8).contains("secret-widget-only-token"));
        assertTrue(AgendaWidgetStore.commit(context, "secret-widget-only-token", new JSONObject().put("title", "Cliente FITTIZIO"), false));
        AgendaWidgetStore.clear(context);
        assertFalse(AgendaWidgetStore.commit(context, "secret-widget-only-token", new JSONObject(), false));
        assertEquals(0, AgendaWidgetStore.read(context).length());
    }
    @Test public void accountRotationRejectsPreviousAccountAndExpiryClearsCache() throws Exception {
        AgendaWidgetStore.write(context, config("old-account"));
        AgendaWidgetStore.write(context, config("new-account"));
        assertFalse(AgendaWidgetStore.commit(context, "old-account", new JSONObject(), false));
        AgendaWidgetStore.invalidate(context, "old-account");
        assertEquals("new-account", AgendaWidgetStore.read(context).getString("token"));
        AgendaWidgetStore.write(context, config("expired").put("expiresAt", 0));
        AgendaWidgetProvider.refresh(context);
        assertEquals(0, AgendaWidgetStore.read(context).length());
    }
    @Test public void actualRemoteViewsLayoutsInflateOnAndroid() {
        RemoteViews widget = new RemoteViews(context.getPackageName(), R.layout.agenda_widget);
        RemoteViews event = new RemoteViews(context.getPackageName(), R.layout.agenda_widget_event);
        event.setTextViewText(R.id.agenda_event_title, "Sopralluogo FITTIZIO");
        assertNotNull(event.apply(context, new LinearLayout(context)).findViewById(R.id.agenda_event_title));
        android.view.View view = widget.apply(context, new LinearLayout(context));
        assertTrue(view.findViewById(R.id.agenda_events) instanceof android.widget.ListView);
        assertNotNull(view.findViewById(R.id.agenda_updated));
    }
    @Test public void scrollingRowsResolveTheirOwnActionsAndRejectStaleAccount() throws Exception {
        JSONObject state = config("rows-token");
        String future = java.time.Instant.now().plusSeconds(3600).toString();
        JSONObject first = new JSONObject().put("id", "one").put("startDate", java.time.Instant.now().toString()).put("endDate", future).put("phone", "+39000111").put("locationAddress", "Via Uno");
        JSONObject second = new JSONObject(first.toString()).put("id", "two").put("phone", "+39000222").put("locationAddress", "Via Due & Tre + 4, Forlì #5");
        state.put("feed", new JSONObject().put("validUntil", future).put("events", new org.json.JSONArray().put(first).put(second)));
        assertEquals(2, AgendaWidgetListService.events(state).size());
        android.content.Intent request = AgendaWidgetListService.fill(state, second, "call");
        assertEquals("tel:+39000222", AgendaWidgetActionActivity.resolve(state, request).getDataString());
        android.content.Intent navigate = AgendaWidgetActionActivity.resolve(state, AgendaWidgetListService.fill(state, second, "navigate"));
        assertEquals(android.content.Intent.ACTION_VIEW, navigate.getAction());
        assertEquals("geo", navigate.getScheme());
        assertEquals("0,0?q=Via%20Due%20%26%20Tre%20%2B%204%2C%20Forl%C3%AC%20%235", navigate.getData().getEncodedSchemeSpecificPart());
        assertNull(navigate.getPackage());
        assertNull(navigate.getComponent());
        second.put("private", true);
        assertNull(AgendaWidgetActionActivity.resolve(state, request));
        second.put("private", false).put("endDate", "2000-01-01T00:00:00Z");
        assertNull(AgendaWidgetActionActivity.resolve(state, request));
        state.put("token", "another-account");
        assertNull(AgendaWidgetActionActivity.resolve(state, request));
    }
    @Test public void nativeFetchUsesWidgetAuthorizationAndRevokedAccessClearsData() throws Exception {
        try (ServerSocket server = new ServerSocket(0)) {
            AtomicReference<String> request = new AtomicReference<>("");
            Thread responder = new Thread(() -> {
                try (Socket socket = server.accept()) {
                    BufferedReader reader = new BufferedReader(new InputStreamReader(socket.getInputStream(), StandardCharsets.UTF_8));
                    String line; StringBuilder headers = new StringBuilder();
                    while ((line = reader.readLine()) != null && !line.isEmpty()) headers.append(line).append('\n');
                    request.set(headers.toString());
                    socket.getOutputStream().write("HTTP/1.1 401 Unauthorized\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}".getBytes(StandardCharsets.UTF_8));
                } catch (Exception error) { throw new RuntimeException(error); }
            });
            responder.start();
            AgendaWidgetStore.write(context, config("test-credential").put("endpoint", "http://127.0.0.1:" + server.getLocalPort() + "/appointments/widget/feed"));
            AgendaWidgetProvider.refresh(context); responder.join(5000);
            assertTrue(request.get().contains("Authorization: Widget test-credential"));
            assertTrue(request.get().contains("X-Tenant-Id: widget-test"));
            assertEquals(0, AgendaWidgetStore.read(context).length());
        }
    }
    @Test public void backgroundJobFetchesFeedWithoutOpeningTheApp() throws Exception {
        try (ServerSocket server = new ServerSocket(0)) {
            CountDownLatch requested = new CountDownLatch(1);
            Thread responder = new Thread(() -> {
                try (Socket socket = server.accept()) {
                    BufferedReader reader = new BufferedReader(new InputStreamReader(socket.getInputStream(), StandardCharsets.UTF_8));
                    while (true) { String line = reader.readLine(); if (line == null || line.isEmpty()) break; }
                    byte[] body = "{\"version\":1,\"events\":[]}".getBytes(StandardCharsets.UTF_8);
                    socket.getOutputStream().write(("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: " + body.length + "\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.UTF_8));
                    socket.getOutputStream().write(body);
                    socket.getOutputStream().flush();
                    requested.countDown();
                } catch (Exception error) { throw new RuntimeException(error); }
            });
            responder.start();
            AgendaWidgetStore.write(context, config("background-job-token")
                .put("endpoint", "http://127.0.0.1:" + server.getLocalPort() + "/appointments/widget/feed"));
            AgendaWidgetRefreshJob.schedule(context);
            assertTrue("background job did not request the feed", requested.await(15, TimeUnit.SECONDS));
            long deadline = System.currentTimeMillis() + 3000;
            while (AgendaWidgetStore.read(context).optJSONObject("feed") == null && System.currentTimeMillis() < deadline) Thread.sleep(20);
            assertEquals(1, AgendaWidgetStore.read(context).getJSONObject("feed").getInt("version"));
            responder.join(1000);
        }
    }
}
