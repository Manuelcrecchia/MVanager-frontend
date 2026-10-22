package it.mvtechcore.mvanager;

import android.content.Intent;
import android.view.View;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;
import org.json.*;
import java.util.*;

public class AgendaWidgetListService extends RemoteViewsService {
    static String account(JSONObject state) { return state.optString("tenantId") + ":" + state.optString("token").split("\\.")[0]; }
    static List<JSONObject> events(JSONObject state) {
        List<JSONObject> result = new ArrayList<>();
        long now = System.currentTimeMillis();
        JSONObject feed = state.optJSONObject("feed");
        if (state.optString("token").isEmpty() || state.optDouble("expiresAt") <= now || feed == null || AgendaWidgetProvider.timestamp(feed.optString("validUntil")) <= now) return result;
        JSONArray events = feed.optJSONArray("events");
        if (events != null) for (int i = 0; i < events.length(); i++) {
            JSONObject event = events.optJSONObject(i);
            if (event != null && AgendaWidgetProvider.timestamp(event.optString("endDate")) > now) result.add(event);
        }
        result.sort(Comparator.comparingLong(e -> AgendaWidgetProvider.timestamp(e.optString("startDate"))));
        return result;
    }
    static Intent fill(JSONObject state, JSONObject event, String action) {
        return new Intent().putExtra("account", account(state)).putExtra("eventKey", event.optString("id")).putExtra("widgetAction", action);
    }
    @Override public RemoteViewsFactory onGetViewFactory(Intent intent) { return new RemoteViewsFactory() {
        List<JSONObject> items = new ArrayList<>(); JSONObject state = new JSONObject();
        public void onCreate() { onDataSetChanged(); }
        public void onDataSetChanged() { state = AgendaWidgetStore.read(AgendaWidgetListService.this); items = events(state); }
        public void onDestroy() { items.clear(); }
        public int getCount() { return items.size(); }
        public RemoteViews getViewAt(int position) {
            if (position < 0 || position >= items.size()) return null;
            JSONObject event = items.get(position);
            RemoteViews row = new RemoteViews(getPackageName(), R.layout.agenda_widget_event);
            String time = event.optBoolean("dayLong") ? "Tutto il giorno" : AgendaWidgetProvider.format(event.optString("startDate"), "HH:mm") + " – " + AgendaWidgetProvider.format(event.optString("endDate"), "HH:mm");
            row.setTextViewText(R.id.agenda_event_time, AgendaWidgetProvider.format(event.optString("startDate"), "d MMM") + " · " + time + " · " + event.optString("companyLabel"));
            row.setTextViewText(R.id.agenda_event_title, event.optString("title", "Evento"));
            row.setTextViewText(R.id.agenda_event_address, event.optString("locationAddress"));
            row.setViewVisibility(R.id.agenda_event_address, event.optString("locationAddress").isEmpty() ? View.GONE : View.VISIBLE);
            row.setOnClickFillInIntent(R.id.agenda_event_row, fill(state, event, "detail"));
            row.setViewVisibility(R.id.agenda_navigate, !event.optBoolean("private") && !event.optString("locationAddress").trim().isEmpty() ? View.VISIBLE : View.GONE);
            row.setViewVisibility(R.id.agenda_call, !event.optBoolean("private") && event.optString("phone").matches("\\+?[0-9]{3,20}") ? View.VISIBLE : View.GONE);
            row.setOnClickFillInIntent(R.id.agenda_navigate, fill(state, event, "navigate"));
            row.setOnClickFillInIntent(R.id.agenda_call, fill(state, event, "call"));
            return row;
        }
        public RemoteViews getLoadingView() { return null; }
        public int getViewTypeCount() { return 1; }
        public long getItemId(int position) { return position; }
        public boolean hasStableIds() { return false; }
    }; }
}
