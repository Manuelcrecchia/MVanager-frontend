package it.mvtechcore.mvanager;

import android.os.Bundle;

import androidx.annotation.NonNull;

import com.capacitorjs.plugins.pushnotifications.MessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

public class MvanagerMessagingService extends MessagingService {
    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        Map<String, String> data = remoteMessage.getData();
        if (InspectionAlarmNotifier.isInspectionAlarm(data)) {
            Bundle extras = InspectionAlarmNotifier.bundleFromData(data);
            InspectionAlarmNotifier.show(getApplicationContext(), extras);
            return;
        }

        super.onMessageReceived(remoteMessage);
    }
}
