package it.mvtechcore.mvanager;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.widget.RemoteViews;
import org.json.JSONArray;
import org.json.JSONObject;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class AgendaWidgetProvider extends AppWidgetProvider {
    static final ExecutorService EXECUTOR = Executors.newSingleThreadExecutor();
    private static final String REFRESH = "it.mvtechcore.mvanager.AGENDA_REFRESH";
    @Override public void onReceive(Context context, Intent intent) {
        if (REFRESH.equals(intent.getAction()) || AppWidgetManager.ACTION_APPWIDGET_UPDATE.equals(intent.getAction())) {
            renderAll(context);
            final PendingResult pending = goAsync();
            EXECUTOR.execute(() -> { try { refresh(context); } finally { pending.finish(); } });
        } else super.onReceive(context, intent);
    }
    @Override public void onAppWidgetOptionsChanged(Context c, AppWidgetManager manager, int id, Bundle options) { renderAll(c); }

    static String refresh(Context context) {
        JSONObject state = AgendaWidgetStore.read(context); String token = state.optString("token");
        if (token.isEmpty() || state.optDouble("expiresAt") <= System.currentTimeMillis()) {
            AgendaWidgetStore.clear(context); renderAll(context); return token.isEmpty() ? "unconfigured" : "expired";
        }
        String result = "error";
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(state.getString("endpoint")).openConnection();
            connection.setInstanceFollowRedirects(false); connection.setConnectTimeout(3000); connection.setReadTimeout(4000);
            connection.setRequestProperty("Authorization", "Widget " + token);
            connection.setRequestProperty("X-Tenant-Id", state.getString("tenantId"));
            connection.setRequestProperty("Accept", "application/json");
            int status = connection.getResponseCode();
            if (status != 200) Log.w("AgendaWidget", "Feed HTTP " + status);
            if (status == 401 || status == 403) { AgendaWidgetStore.invalidate(context, token); result = "unauthorized"; }
            else if (status == 200) {
                byte[] bytes;
                try (java.io.InputStream stream = connection.getInputStream(); java.io.ByteArrayOutputStream output = new java.io.ByteArrayOutputStream()) {
                    byte[] buffer = new byte[8192]; int read;
                    while ((read = stream.read(buffer)) != -1) {
                        output.write(buffer, 0, read);
                        if (output.size() > 524288) throw new IllegalStateException("Risposta troppo grande");
                    }
                    bytes = output.toByteArray();
                }
                if (bytes.length > 524288) throw new IllegalStateException("Risposta troppo grande");
                JSONObject feed = new JSONObject(new String(bytes, StandardCharsets.UTF_8));
                if (feed.optInt("version") != 1 || feed.optJSONArray("events") == null) throw new IllegalStateException("Agenda non valida");
                result = AgendaWidgetStore.commit(context, token, feed, false) ? "updated" : "unconfigured";
            } else throw new IllegalStateException("Agenda non disponibile");
        } catch (Exception error) {
            Log.w("AgendaWidget", "Feed unavailable: " + error.getClass().getSimpleName());
            result = state.optJSONObject("feed") == null ? "error" : "offline";
            try { AgendaWidgetStore.commit(context, token, null, true); } catch (Exception ignoredWrite) { }
        } finally { if (connection != null) connection.disconnect(); renderAll(context); }
        return result;
    }
    static long timestamp(String value) { try { return Instant.parse(value).toEpochMilli(); } catch (Exception ignored) { return 0; } }
    static String format(String value, String pattern) {
        try { return DateTimeFormatter.ofPattern(pattern, Locale.ITALIAN).withZone(ZoneId.systemDefault()).format(Instant.parse(value)); }
        catch (Exception ignored) { return ""; }
    }
    private static PendingIntent launch(Context c, String route, JSONObject state, int id) {
        Uri.Builder uri = new Uri.Builder().scheme("mvanager").authority("agenda");
        Uri source = Uri.parse(route);
        for (String name : source.getQueryParameterNames()) uri.appendQueryParameter(name, source.getQueryParameter(name));
        uri.appendQueryParameter("account", state.optString("tenantId") + ":" + state.optString("token").split("\\.")[0]);
        Intent intent = new Intent(Intent.ACTION_VIEW, uri.build(), c, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(c, id, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
    static void renderAll(Context c) {
        AppWidgetManager manager = AppWidgetManager.getInstance(c);
        JSONObject state = AgendaWidgetStore.read(c);
        if (state.optDouble("expiresAt") <= System.currentTimeMillis()) { AgendaWidgetStore.clear(c); state = new JSONObject(); }
        for (int id : manager.getAppWidgetIds(new ComponentName(c, AgendaWidgetProvider.class))) {
            RemoteViews view = new RemoteViews(c.getPackageName(), R.layout.agenda_widget);
            view.setOnClickPendingIntent(R.id.agenda_title, launch(c, "/calendarHome", state, id));
            view.setOnClickPendingIntent(R.id.agenda_add, launch(c, "/calendarHome?newEvent=1", state, id + 10000));
            view.setTextViewText(R.id.agenda_date, DateTimeFormatter.ofPattern("EEEE d MMMM", Locale.ITALIAN).format(java.time.LocalDate.now()));
            Intent adapter = new Intent(c, AgendaWidgetListService.class);
            adapter.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id);
            adapter.setData(Uri.parse("mvanager-widget-list://" + id));
            view.setRemoteAdapter(R.id.agenda_events, adapter);
            Intent action = new Intent(c, AgendaWidgetActionActivity.class).setData(Uri.parse("mvanager-widget-action://" + id));
            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (android.os.Build.VERSION.SDK_INT >= 31) flags |= PendingIntent.FLAG_MUTABLE;
            view.setPendingIntentTemplate(R.id.agenda_events, PendingIntent.getActivity(c, id, action, flags));
            view.setEmptyView(R.id.agenda_events, R.id.agenda_empty);
            JSONObject feed = state.optJSONObject("feed");
            int count = AgendaWidgetListService.events(state).size();
            String message = state.optString("token").isEmpty() ? "Apri MVanager e accedi per attivare il widget" : feed == null ? "Agenda non disponibile · sincronizzazione in attesa" : timestamp(feed.optString("validUntil")) <= System.currentTimeMillis() ? "Agenda da aggiornare" : "Nessun impegno nei prossimi 7 giorni";
            view.setTextViewText(R.id.agenda_empty, message); view.setViewVisibility(R.id.agenda_empty, count == 0 ? View.VISIBLE : View.GONE);
            view.setTextViewText(R.id.agenda_updated, feed == null ? "" : (state.optBoolean("offline") ? "Offline · " : "Aggiornato ") + format(feed.optString("updatedAt"), "d MMM HH:mm"));
            manager.updateAppWidget(id, view);
            manager.notifyAppWidgetViewDataChanged(id, R.id.agenda_events);
        }
    }
}
