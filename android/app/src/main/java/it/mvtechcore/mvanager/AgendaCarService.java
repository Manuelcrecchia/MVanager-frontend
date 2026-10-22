package it.mvtechcore.mvanager;

import android.content.Intent;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import androidx.annotation.NonNull;
import androidx.car.app.*;
import androidx.car.app.model.*;
import androidx.car.app.validation.HostValidator;
import androidx.lifecycle.*;
import org.json.*;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.*;

/** Upcoming destinations from the same account-scoped, read-only widget feed. */
public class AgendaCarService extends CarAppService {
    @NonNull @Override public HostValidator createHostValidator() {
        if ((getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            return HostValidator.ALLOW_ALL_HOSTS_VALIDATOR;
        }
        return new HostValidator.Builder(this)
            .addAllowedHosts(androidx.car.app.R.array.hosts_allowlist_sample).build();
    }
    @NonNull @Override public Session onCreateSession() {
        return new Session() {
            @NonNull @Override public Screen onCreateScreen(@NonNull Intent intent) {
                return new Destinations(getCarContext(), null, null);
            }
        };
    }
    static List<JSONObject> destinations(JSONObject state, long now) {
        List<JSONObject> result = new ArrayList<>();
        JSONObject feed = state.optJSONObject("feed");
        if (state.optString("token").isEmpty() || state.optDouble("expiresAt") <= now || feed == null
            || time(feed.optString("validUntil")) <= now) return result;
        JSONArray events = feed.optJSONArray("events");
        if (events != null) for (int i = 0; i < events.length(); i++) {
            JSONObject e = events.optJSONObject(i);
            if (e != null && !e.optBoolean("private") && !e.optString("locationAddress").trim().isEmpty()
                && time(e.optString("endDate")) > now) result.add(e);
        }
        result.sort(Comparator.comparingLong(e -> time(e.optString("startDate"))));
        return result;
    }
    static long time(String value) { try { return Instant.parse(value).toEpochMilli(); } catch (Exception e) { return 0; } }
    static Uri destinationUri(String address) { return Uri.parse("geo:0,0?q=" + Uri.encode(address)); }
    static boolean validPhone(String phone) { return phone.matches("\\+?[0-9]{3,20}"); }
    static String when(JSONObject e) {
        try { return DateTimeFormatter.ofPattern(e.optBoolean("dayLong") ? "d MMM · 'Tutto il giorno'" : "d MMM · HH:mm", Locale.ITALIAN)
            .withZone(ZoneId.of("Europe/Rome")).format(Instant.parse(e.getString("startDate"))); }
        catch (Exception ignored) { return ""; }
    }
    static final class Destinations extends Screen implements DefaultLifecycleObserver {
        private final Handler handler = new Handler(Looper.getMainLooper());
        private final String eventId, accountToken;
        private boolean active, loading;
        private long fetched;
        private String lastState = "";
        private final Runnable tick = new Runnable() { public void run() {
            if (!active) return;
            JSONObject state = AgendaWidgetStore.read(getCarContext());
            String current = state.toString() + destinations(state, System.currentTimeMillis()).stream().map(e -> e.optString("id")).collect(java.util.stream.Collectors.joining("|"));
            if (!current.equals(lastState)) { lastState = current; invalidate(); }
            if (!loading && System.currentTimeMillis() - fetched >= 60000) {
                loading = true; fetched = System.currentTimeMillis();
                AgendaWidgetProvider.EXECUTOR.execute(() -> {
                    AgendaWidgetProvider.refresh(getCarContext());
                    handler.post(() -> { loading = false; if (active) invalidate(); });
                });
            }
            handler.postDelayed(this, 5000);
        }};
        Destinations(CarContext context, String id, String token) {
            super(context); eventId = id; accountToken = token; getLifecycle().addObserver(this);
        }
        @Override public void onStart(@NonNull LifecycleOwner owner) { active = true; handler.post(tick); }
        @Override public void onStop(@NonNull LifecycleOwner owner) { active = false; handler.removeCallbacks(tick); }
        @NonNull @Override public Template onGetTemplate() {
            JSONObject state = AgendaWidgetStore.read(getCarContext());
            List<JSONObject> entries = destinations(state, System.currentTimeMillis());
            if (eventId != null) {
                JSONObject event = accountToken.equals(state.optString("token")) ? entries.stream()
                    .filter(e -> eventId.equals(e.optString("id"))).findFirst().orElse(null) : null;
                if (event == null) return new MessageTemplate.Builder("Destinazione non più disponibile")
                    .setHeaderAction(Action.BACK).setTitle("MVanager").build();
                Pane.Builder pane = new Pane.Builder().addRow(new Row.Builder().setTitle(event.optString("title"))
                    .addText(when(event)).addText(event.optString("locationAddress")).build());
                pane.addAction(new Action.Builder().setTitle("Naviga").setOnClickListener(() -> act(false)).build());
                if (validPhone(event.optString("phone"))) pane.addAction(new Action.Builder().setTitle("Chiama").setOnClickListener(() -> act(true)).build());
                return new PaneTemplate.Builder(pane.build()).setTitle("Destinazione").setHeaderAction(Action.BACK).build();
            }
            ItemList.Builder list = new ItemList.Builder();
            list.setNoItemsMessage(state.optString("token").isEmpty() ? "Accedi a MVanager sul telefono, da fermo"
                : state.optJSONObject("feed") == null ? "Agenda non disponibile. Verifica la connessione"
                : "Nessuna destinazione disponibile nei prossimi 7 giorni");
            for (JSONObject e : entries.subList(0, Math.min(6, entries.size()))) {
                list.addItem(new Row.Builder().setTitle(e.optString("title")).addText(when(e))
                    .addText(e.optString("locationAddress")).setBrowsable(true)
                    .setOnClickListener(() -> getScreenManager().push(new Destinations(getCarContext(), e.optString("id"), state.optString("token")))).build());
            }
            return new ListTemplate.Builder().setTitle(state.optBoolean("offline") ? "Destinazioni · offline" : "MVanager · Destinazioni")
                .setHeaderAction(Action.APP_ICON).setSingleList(list.build()).build();
        }
        private void act(boolean call) {
            JSONObject state = AgendaWidgetStore.read(getCarContext());
            if (!accountToken.equals(state.optString("token"))) { invalidate(); return; }
            JSONObject e = destinations(state, System.currentTimeMillis()).stream()
                .filter(item -> eventId.equals(item.optString("id"))).findFirst().orElse(null);
            if (e == null || (call && !validPhone(e.optString("phone")))) { invalidate(); return; }
            try {
                getCarContext().startCarApp(new Intent(call ? Intent.ACTION_DIAL : CarContext.ACTION_NAVIGATE,
                    call ? Uri.parse("tel:" + e.optString("phone")) : destinationUri(e.optString("locationAddress"))));
            } catch (RuntimeException error) {
                CarToast.makeText(getCarContext(), "Azione non disponibile su questo sistema auto", CarToast.LENGTH_LONG).show();
            }
        }
    }
}
