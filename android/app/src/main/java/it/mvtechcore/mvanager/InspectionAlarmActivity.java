package it.mvtechcore.mvanager;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

public class InspectionAlarmActivity extends Activity {
    private Bundle extras = new Bundle();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        readExtras(getIntent());
        configureWindow();
        setContentView(buildContent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        readExtras(intent);
        setContentView(buildContent());
    }

    private void readExtras(Intent intent) {
        extras = intent != null && intent.getExtras() != null
            ? new Bundle(intent.getExtras())
            : new Bundle();
    }

    private void configureWindow() {
        Window window = getWindow();
        window.addFlags(
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON |
                WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD |
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED |
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
        );

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        }
    }

    private View buildContent() {
        FrameLayout root = new FrameLayout(this);
        root.setBackground(makeBackground());
        root.setClickable(true);
        root.setFocusable(true);

        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setGravity(Gravity.CENTER_HORIZONTAL);
        content.setPadding(dp(28), dp(44), dp(28), dp(32));

        FrameLayout.LayoutParams contentParams = new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT
        );
        root.addView(content, contentParams);

        ImageView icon = new ImageView(this);
        icon.setImageResource(R.mipmap.ic_launcher);
        icon.setBackground(circle(Color.WHITE));
        icon.setPadding(dp(12), dp(12), dp(12), dp(12));
        LinearLayout.LayoutParams iconParams = new LinearLayout.LayoutParams(dp(86), dp(86));
        iconParams.setMargins(0, 0, 0, dp(28));
        content.addView(icon, iconParams);

        TextView eyebrow = new TextView(this);
        eyebrow.setText("MVANAGER");
        eyebrow.setTextColor(Color.rgb(148, 163, 184));
        eyebrow.setTextSize(13);
        eyebrow.setTypeface(Typeface.DEFAULT_BOLD);
        eyebrow.setGravity(Gravity.CENTER);
        content.addView(eyebrow, matchWrap());

        TextView title = new TextView(this);
        title.setText(getStringExtra("notificationTitle", "Promemoria appuntamento"));
        title.setTextColor(Color.WHITE);
        title.setTextSize(29);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setGravity(Gravity.CENTER);
        title.setPadding(0, dp(12), 0, dp(12));
        content.addView(title, matchWrap());

        TextView body = new TextView(this);
        body.setText(getStringExtra("notificationBody", "Hai un appuntamento da effettuare."));
        body.setTextColor(Color.rgb(226, 232, 240));
        body.setTextSize(18);
        body.setGravity(Gravity.CENTER);
        body.setLineSpacing(dp(2), 1.0f);
        content.addView(body, matchWrap());

        View spacer = new View(this);
        content.addView(spacer, new LinearLayout.LayoutParams(1, 0, 1));

        Button snooze = button("Posticipa", Color.rgb(241, 245, 249), Color.rgb(15, 23, 42));
        snooze.setOnClickListener(v -> {
            InspectionAlarmNotifier.snooze(this, extras);
            closeAlarm();
        });
        content.addView(snooze, buttonParams());

        Button dismiss = button("Spegni", Color.rgb(34, 197, 94), Color.WHITE);
        dismiss.setOnClickListener(v -> {
            InspectionAlarmNotifier.dismiss(this, extras);
            closeAlarm();
        });
        content.addView(dismiss, buttonParams());

        Button open = button("Spegni e apri appuntamento", Color.rgb(56, 189, 248), Color.rgb(8, 47, 73));
        open.setOnClickListener(v -> {
            InspectionAlarmNotifier.dismiss(this, extras);
            InspectionAlarmNotifier.storePendingNavigation(this, extras);
            Intent intent = InspectionAlarmNotifier.openAppIntent(this, extras);
            startActivity(intent);
            closeAlarm();
        });
        content.addView(open, buttonParams());

        return root;
    }

    private Button button(String text, int backgroundColor, int textColor) {
        Button button = new Button(this);
        button.setAllCaps(false);
        button.setText(text);
        button.setTextColor(textColor);
        button.setTextSize(17);
        button.setTypeface(Typeface.DEFAULT_BOLD);
        button.setGravity(Gravity.CENTER);
        button.setMinHeight(dp(58));
        button.setPadding(dp(16), 0, dp(16), 0);
        button.setBackground(rounded(backgroundColor, dp(18)));
        button.setClickable(true);
        button.setFocusable(true);
        return button;
    }

    private LinearLayout.LayoutParams matchWrap() {
        return new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
    }

    private LinearLayout.LayoutParams buttonParams() {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            dp(58)
        );
        params.setMargins(0, dp(12), 0, 0);
        return params;
    }

    private GradientDrawable makeBackground() {
        return new GradientDrawable(
            GradientDrawable.Orientation.TOP_BOTTOM,
            new int[] { Color.rgb(8, 13, 25), Color.rgb(15, 23, 42), Color.rgb(30, 41, 59) }
        );
    }

    private GradientDrawable circle(int color) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setShape(GradientDrawable.OVAL);
        drawable.setColor(color);
        return drawable;
    }

    private GradientDrawable rounded(int color, int radius) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(color);
        drawable.setCornerRadius(radius);
        return drawable;
    }

    private void closeAlarm() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            finishAndRemoveTask();
        } else {
            finish();
        }
    }

    private String getStringExtra(String key, String fallback) {
        Object value = extras.get(key);
        if (value == null) return fallback;
        String text = String.valueOf(value);
        return text.isEmpty() ? fallback : text;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
