package it.mvtechcore.mvanager;

import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;
import android.os.Build;

/** Keeps a data-only FCM wakeup alive long enough to download the widget feed. */
public class AgendaWidgetRefreshJob extends JobService {
    private static final int JOB_ID = 0xA6E1;

    static void schedule(Context context) {
        JobScheduler scheduler = (JobScheduler) context.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        if (scheduler == null) return;
        JobInfo.Builder builder = new JobInfo.Builder(JOB_ID, new ComponentName(context, AgendaWidgetRefreshJob.class))
            .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY);
        if (Build.VERSION.SDK_INT >= 31) builder.setExpedited(true);
        boolean fallback = false;
        try { fallback = scheduler.schedule(builder.build()) == JobScheduler.RESULT_FAILURE; }
        catch (RuntimeException error) { fallback = true; }
        if (fallback && Build.VERSION.SDK_INT >= 31) {
            scheduler.schedule(new JobInfo.Builder(JOB_ID, new ComponentName(context, AgendaWidgetRefreshJob.class))
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).build());
        }
    }

    @Override public boolean onStartJob(JobParameters parameters) {
        AgendaWidgetProvider.EXECUTOR.execute(() -> {
            String result = AgendaWidgetProvider.refresh(getApplicationContext());
            jobFinished(parameters, "error".equals(result));
        });
        return true;
    }

    @Override public boolean onStopJob(JobParameters parameters) { return true; }
}
