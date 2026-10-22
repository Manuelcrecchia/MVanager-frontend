package it.mvtechcore.mvanager;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.core.app.ApplicationProvider;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.car.app.testing.TestCarContext;
import androidx.car.app.model.*;
import android.content.Context;
import org.json.*;
import org.junit.*;
import org.junit.runner.RunWith;
import java.time.Instant;
import static org.junit.Assert.*;

/** Run only on a disposable emulator: shares the real encrypted widget cache. */
@RunWith(AndroidJUnit4.class)
public class AgendaCarTest {
    Context context = ApplicationProvider.getApplicationContext();
    @After public void clean() { AgendaWidgetStore.clear(context); }
    JSONObject event(String id, String address, boolean hidden, long end) throws Exception {
        return new JSONObject().put("id", id).put("title", "Destinazione FITTIZIA").put("locationAddress", address).put("private", hidden)
            .put("startDate", Instant.now().toString()).put("endDate", Instant.ofEpochMilli(end).toString()).put("phone", "+390001234");
    }
    JSONObject state() throws Exception {
        long now = System.currentTimeMillis();
        return new JSONObject().put("token", "fake-test-token").put("expiresAt", now + 3600000)
            .put("feed", new JSONObject().put("validUntil", Instant.ofEpochMilli(now + 3600000).toString()).put("events", new JSONArray()
                .put(event("visible", "Via Test & Via Seconda #4", false, now + 3600000))
                .put(event("private", "Via Riservata", true, now + 3600000))
                .put(event("empty", " ", false, now + 3600000))
                .put(event("past", "Via Test", false, now - 1))));
    }
    @Test public void carOnlyExposesUnexpiredNonPrivateDestinations() throws Exception {
        JSONObject value = state();
        assertEquals(1, AgendaCarService.destinations(value, System.currentTimeMillis()).size());
        assertEquals(0, AgendaCarService.destinations(value.put("expiresAt", 0), System.currentTimeMillis()).size());
        assertEquals(0, AgendaCarService.destinations(new JSONObject(), System.currentTimeMillis()).size());
    }
    @Test public void addressIsEncodedAndDialSchemesAreRejected() {
        String address = "Via Test & Via Seconda #4";
        assertEquals("geo", AgendaCarService.destinationUri(address).getScheme());
        assertEquals("geo:0,0?q=Via%20Test%20%26%20Via%20Seconda%20%234", AgendaCarService.destinationUri(address).toString());
        assertTrue(AgendaCarService.validPhone("+390001234"));
        assertFalse(AgendaCarService.validPhone("tel:123"));
        assertFalse(AgendaCarService.validPhone("*123#"));
    }
    @Test public void actualCarTemplatesAndLogoutInvalidateOpenDetails() throws Exception {
        AgendaWidgetStore.write(context, state());
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
            TestCarContext car = TestCarContext.createCarContext(context);
            AgendaCarService.Destinations list = new AgendaCarService.Destinations(car, null, null);
            assertTrue(list.onGetTemplate() instanceof ListTemplate);
            AgendaCarService.Destinations details = new AgendaCarService.Destinations(car, "visible", "fake-test-token");
            assertTrue(details.onGetTemplate() instanceof PaneTemplate);
            AgendaWidgetStore.clear(context);
            assertTrue(details.onGetTemplate() instanceof MessageTemplate);
        });
    }
}
