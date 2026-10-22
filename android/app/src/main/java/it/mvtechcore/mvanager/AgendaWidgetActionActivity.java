package it.mvtechcore.mvanager;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import org.json.JSONObject;

/** Resolves the tapped row against the current account/cache before opening another app. */
public class AgendaWidgetActionActivity extends Activity {
    static Intent resolve(JSONObject state, Intent request) {
        if (!AgendaWidgetListService.account(state).equals(request.getStringExtra("account"))) return null;
        for (JSONObject event : AgendaWidgetListService.events(state)) {
            if (!event.optString("id").equals(request.getStringExtra("eventKey"))) continue;
            String action = request.getStringExtra("widgetAction");
            if ("detail".equals(action)) {
                Uri source = Uri.parse(event.optString("route", "/calendarHome"));
                Uri.Builder uri = new Uri.Builder().scheme("mvanager").authority("agenda");
                for (String name : source.getQueryParameterNames()) uri.appendQueryParameter(name, source.getQueryParameter(name));
                return new Intent(Intent.ACTION_VIEW, uri.appendQueryParameter("account", AgendaWidgetListService.account(state)).build());
            }
            if (event.optBoolean("private")) return null;
            if ("call".equals(action) && event.optString("phone").matches("\\+?[0-9]{3,20}")) return new Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + event.optString("phone")));
            // Let Android resolve the current default on every tap, including changes made
            // while MVanager is closed. A provider URL would bypass the user's map choice.
            if ("navigate".equals(action) && !event.optString("locationAddress").trim().isEmpty()) return new Intent(Intent.ACTION_VIEW, Uri.parse("geo:0,0?q=" + Uri.encode(event.optString("locationAddress"))));
        }
        return null;
    }
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        Intent target = resolve(AgendaWidgetStore.read(this), getIntent());
        if (target != null) {
            if ("mvanager".equals(target.getScheme())) target.setClass(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            try { startActivity(target); } catch (android.content.ActivityNotFoundException ignored) { android.widget.Toast.makeText(this, "Nessuna app disponibile per questa azione", android.widget.Toast.LENGTH_SHORT).show(); }
        }
        finish();
    }
}
