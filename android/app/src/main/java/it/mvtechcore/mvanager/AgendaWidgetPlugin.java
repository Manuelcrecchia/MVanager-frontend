package it.mvtechcore.mvanager;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONObject;
import java.net.URI;

@CapacitorPlugin(name = "AgendaWidget")
public class AgendaWidgetPlugin extends Plugin {
    @PluginMethod public void configure(PluginCall call) {
        try {
            String endpoint = call.getString("endpoint", ""), token = call.getString("token", "");
            URI uri = new URI(endpoint);
            boolean debug = (getContext().getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0;
            if ((!"https".equals(uri.getScheme()) && !(debug && "http".equals(uri.getScheme()))) || uri.getHost() == null ||
                !uri.getPath().endsWith("/appointments/widget/feed") || !token.matches("[1-9][0-9]*\\.[a-fA-F0-9-]{36}\\.[a-f0-9]{64}")) {
                call.reject("Configurazione del widget non valida"); return;
            }
            JSONObject value = new JSONObject();
            value.put("endpoint", endpoint); value.put("token", token);
            value.put("tenantId", call.getString("tenantId", ""));
            value.put("expiresAt", expiryMillis(call.getData()));
            AgendaWidgetStore.write(getContext(), value); AgendaWidgetProvider.renderAll(getContext()); call.resolve();
        } catch (Exception error) { call.reject("Impossibile configurare il widget", error); }
    }
    static long expiryMillis(JSONObject data) {
        Object value = data.opt("expiresAt");
        return value instanceof Number ? ((Number) value).longValue() : 0L;
    }
    @PluginMethod public void refresh(PluginCall call) {
        AgendaWidgetProvider.EXECUTOR.execute(() -> {
            String state = AgendaWidgetProvider.refresh(getContext());
            JSONObject feed = AgendaWidgetStore.read(getContext()).optJSONObject("feed");
            JSObject result = new JSObject(); result.put("state", state);
            if (feed != null) {
                result.put("updatedAt", feed.optString("updatedAt"));
                result.put("eventCount", feed.optJSONArray("events") == null ? 0 : feed.optJSONArray("events").length());
            }
            call.resolve(result);
        });
    }
    @PluginMethod public void clear(PluginCall call) {
        AgendaWidgetStore.clear(getContext()); AgendaWidgetProvider.renderAll(getContext()); call.resolve();
    }
    @PluginMethod public void requestPin(PluginCall call) {
        AppWidgetManager manager = AppWidgetManager.getInstance(getContext());
        boolean supported = manager.isRequestPinAppWidgetSupported();
        if (supported) manager.requestPinAppWidget(new ComponentName(getContext(), AgendaWidgetProvider.class), null, null);
        JSObject result = new JSObject(); result.put("supported", supported); call.resolve(result);
    }
}
