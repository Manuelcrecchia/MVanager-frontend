package it.mvtechcore.mvanager;

import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import java.util.Map;

final class InspectionAlarmNotifier {
    static final String CHANNEL_ID = "inspection_reminder_alarm";
    static final String CATEGORY = "INSPECTION_REMINDER_ALARM";
    static final String ACTION_SNOOZE = "it.mvtechcore.mvanager.INSPECTION_ALARM_SNOOZE";
    static final String ACTION_DISMISS = "it.mvtechcore.mvanager.INSPECTION_ALARM_DISMISS";
    static final String ACTION_SHOW_SNOOZED = "it.mvtechcore.mvanager.INSPECTION_ALARM_SHOW_SNOOZED";
    static final int DEFAULT_SNOOZE_MINUTES = 10;

    private InspectionAlarmNotifier() {}

    static boolean isInspectionAlarm(Map<String, String> data) {
        return "SOPRALLUOGO_REMINDER".equals(data.get("type")) ||
            "INSPECTION_REMINDER".equals(data.get("alarmType")) ||
            "true".equalsIgnoreCase(data.get("alarm"));
    }

    static void show(Context context, Bundle extras) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            return;
        }

        createChannel(context);

        String title = getString(extras, "notificationTitle", "Promemoria appuntamento");
        String body = getString(extras, "notificationBody", "Hai un appuntamento da effettuare.");
        int notificationId = notificationId(extras);

        Intent openIntent = openAppIntent(context, extras);

        PendingIntent contentIntent = PendingIntent.getActivity(
            context,
            notificationId,
            openIntent,
            pendingIntentFlags()
        );

        Intent alarmIntent = new Intent(context, InspectionAlarmActivity.class);
        alarmIntent.addFlags(
            Intent.FLAG_ACTIVITY_NEW_TASK |
                Intent.FLAG_ACTIVITY_CLEAR_TOP |
                Intent.FLAG_ACTIVITY_SINGLE_TOP
        );
        alarmIntent.putExtras(extras);
        alarmIntent.putExtra("google.message_id", getString(extras, "notificationId", String.valueOf(notificationId)));

        PendingIntent fullScreenIntent = PendingIntent.getActivity(
            context,
            notificationId + 1,
            alarmIntent,
            pendingIntentFlags()
        );

        PendingIntent snoozeIntent = actionIntent(context, ACTION_SNOOZE, notificationId, extras);
        PendingIntent dismissIntent = actionIntent(context, ACTION_DISMISS, notificationId, extras);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setAutoCancel(false)
            .setOngoing(true)
            .setSound(alarmSound())
            .setVibrate(new long[] { 0, 700, 300, 700, 300, 700 })
            .setContentIntent(contentIntent)
            .setFullScreenIntent(fullScreenIntent, true)
            .addAction(R.mipmap.ic_launcher, "Posticipa", snoozeIntent)
            .addAction(R.mipmap.ic_launcher, "Spegni", dismissIntent);

        NotificationManagerCompat.from(context).notify(notificationId, builder.build());
    }

    static void dismiss(Context context, Bundle extras) {
        NotificationManagerCompat.from(context).cancel(notificationId(extras));
    }

    static void snooze(Context context, Bundle extras) {
        dismiss(context, extras);
        int minutes = parseInt(getString(extras, "snoozeMinutes", ""), DEFAULT_SNOOZE_MINUTES);
        Intent intent = new Intent(context, InspectionAlarmReceiver.class);
        intent.setAction(ACTION_SHOW_SNOOZED);
        intent.putExtras(extras);

        PendingIntent pendingIntent = PendingIntent.getBroadcast(
            context,
            notificationId(extras),
            intent,
            pendingIntentFlags()
        );

        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        long triggerAt = System.currentTimeMillis() + minutes * 60_000L;
        if (alarmManager == null) return;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pendingIntent);
        } else {
            alarmManager.set(AlarmManager.RTC_WAKEUP, triggerAt, pendingIntent);
        }
    }

    static Bundle bundleFromData(Map<String, String> data) {
        Bundle bundle = new Bundle();
        for (Map.Entry<String, String> entry : data.entrySet()) {
            bundle.putString(entry.getKey(), entry.getValue());
        }
        return bundle;
    }

    static void storePendingNavigation(Context context, Bundle extras) {
        String route = getString(extras, "route", "");
        if (route.isEmpty()) {
            route = routeFromPayload(extras);
        }
        if (route.isEmpty()) return;

        SharedPreferences preferences = context.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE);
        preferences.edit().putString("pendingNotificationRoute", route).apply();
    }

    static Intent openAppIntent(Context context, Bundle extras) {
        int notificationId = notificationId(extras);
        Intent intent = context.getPackageManager()
            .getLaunchIntentForPackage(context.getPackageName());
        if (intent == null) {
            intent = new Intent(context, MainActivity.class);
        }
        intent.addFlags(
            Intent.FLAG_ACTIVITY_NEW_TASK |
                Intent.FLAG_ACTIVITY_SINGLE_TOP |
                Intent.FLAG_ACTIVITY_CLEAR_TOP
        );
        intent.putExtras(extras);
        intent.putExtra("google.message_id", getString(extras, "notificationId", String.valueOf(notificationId)));
        return intent;
    }

    private static String routeFromPayload(Bundle extras) {
        String type = getString(extras, "type", "");
        String screen = getString(extras, "screen", "");
        String appointmentId = getString(extras, "appointmentId", "");
        String deadlineId = getString(extras, "deadlineId", "");
        String numeroPreventivo = getString(extras, "numeroPreventivo", "");
        String acceptanceId = getString(extras, "acceptanceId", "");

        if ("calendar".equals(screen) ||
            "SOPRALLUOGO_REMINDER".equals(type) ||
            "SOPRALLUOGO_ASSIGNED".equals(type)) {
            return appointmentId.isEmpty()
                ? "/calendarHome"
                : "/calendarHome?appointmentId=" + Uri.encode(appointmentId);
        }

        if ("employeeDeadlines".equals(screen) || "DEADLINE_EMPLOYEE_REMINDER".equals(type)) {
            return deadlineId.isEmpty()
                ? "/employee-deadlines"
                : "/employee-deadlines?deadlineId=" + Uri.encode(deadlineId);
        }

        if ("vehicleDeadlines".equals(screen) || "DEADLINE_VEHICLE_REMINDER".equals(type)) {
            return deadlineId.isEmpty()
                ? "/vehicle-deadlines"
                : "/vehicle-deadlines?deadlineId=" + Uri.encode(deadlineId);
        }

        if ("quoteReview".equals(screen) || "QUOTE_ACCEPTED_REVIEW".equals(type)) {
            String route = "/quotesHome?review=1";
            if (!numeroPreventivo.isEmpty()) {
                route += "&numeroPreventivo=" + Uri.encode(numeroPreventivo);
            }
            if (!acceptanceId.isEmpty()) {
                route += "&acceptanceId=" + Uri.encode(acceptanceId);
            }
            return route;
        }

        return "";
    }

    private static PendingIntent actionIntent(
        Context context,
        String action,
        int requestCode,
        Bundle extras
    ) {
        Intent intent = new Intent(context, InspectionAlarmReceiver.class);
        intent.setAction(action);
        intent.putExtras(extras);
        return PendingIntent.getBroadcast(context, requestCode, intent, pendingIntentFlags());
    }

    private static void createChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;

        NotificationManager manager =
            (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null || manager.getNotificationChannel(CHANNEL_ID) != null) return;

        AudioAttributes audioAttributes = new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ALARM)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build();

        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "Promemoria appuntamenti",
            NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("Promemoria appuntamento con azioni Posticipa e Spegni");
        channel.setSound(alarmSound(), audioAttributes);
        channel.enableVibration(true);
        channel.setVibrationPattern(new long[] { 0, 700, 300, 700, 300, 700 });
        channel.setLockscreenVisibility(NotificationCompat.VISIBILITY_PUBLIC);
        manager.createNotificationChannel(channel);
    }

    private static Uri alarmSound() {
        Uri alarm = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
        return alarm != null ? alarm : RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
    }

    private static int notificationId(Bundle extras) {
        String raw = getString(extras, "notificationId", "");
        if (raw.isEmpty()) raw = getString(extras, "appointmentId", "");
        if (raw.isEmpty()) raw = CATEGORY;
        return Math.abs(raw.hashCode());
    }

    private static String getString(Bundle extras, String key, String fallback) {
        Object value = extras.get(key);
        if (value == null) return fallback;
        String text = String.valueOf(value);
        return text.isEmpty() ? fallback : text;
    }

    private static int parseInt(String value, int fallback) {
        try {
            return Integer.parseInt(value);
        } catch (Exception ignored) {
            return fallback;
        }
    }

    private static int pendingIntentFlags() {
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        return flags;
    }
}
