package it.mvtechcore.mvanager;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;

public class InspectionAlarmReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || intent.getAction() == null) return;

        Bundle extras = intent.getExtras();
        if (extras == null) {
            extras = new Bundle();
        }

        switch (intent.getAction()) {
            case InspectionAlarmNotifier.ACTION_SNOOZE:
                InspectionAlarmNotifier.snooze(context, extras);
                break;
            case InspectionAlarmNotifier.ACTION_DISMISS:
                InspectionAlarmNotifier.dismiss(context, extras);
                break;
            case InspectionAlarmNotifier.ACTION_SHOW_SNOOZED:
                InspectionAlarmNotifier.show(context, extras);
                break;
            default:
                break;
        }
    }
}
