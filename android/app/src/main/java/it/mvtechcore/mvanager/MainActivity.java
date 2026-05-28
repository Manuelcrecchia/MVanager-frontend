package it.mvtechcore.mvanager;

import android.content.Intent;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        storeNotificationNavigation(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        storeNotificationNavigation(intent);
    }

    private void storeNotificationNavigation(Intent intent) {
        if (intent == null || intent.getExtras() == null) return;
        InspectionAlarmNotifier.storePendingNavigation(this, intent.getExtras());
    }
}
