package org.graceview.tv.system

import android.app.Activity
import android.app.AlarmManager
import android.app.PendingIntent
import android.app.admin.DeviceAdminReceiver
import android.app.admin.DevicePolicyManager
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.media.AudioManager
import android.os.Build
import android.os.PowerManager
import android.util.Log
import org.graceview.tv.Config
import org.graceview.tv.MainActivity

/** Device admin, granted once per stick by the setup script, so the app can call lockNow() for Off. */
class AdminReceiver : DeviceAdminReceiver()

object Power {
    private const val TAG = "Power"

    fun adminComponent(ctx: Context) = ComponentName(ctx, AdminReceiver::class.java)

    /**
     * Off mode. Tries device-admin lockNow(), then the accessibility lock-screen action (CLAUDE.md, Power).
     * Returns false when neither is available; the caller then shows a black screen.
     */
    fun sleep(activity: Activity): Boolean {
        val dpm = activity.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
        if (dpm.isAdminActive(adminComponent(activity))) {
            runCatching { dpm.lockNow(); return true }.onFailure { Log.w(TAG, "lockNow failed", it) }
        }
        if (HomeKeyService.lockScreen()) return true
        return false
    }

    /** Wakes the screen (HDMI-CEC then turns the TV on) and brings the app to the front. */
    fun wakeAndLaunch(ctx: Context, reason: String) {
        Log.i(TAG, "Wake and launch: $reason")
        val pm = ctx.getSystemService(Context.POWER_SERVICE) as PowerManager
        @Suppress("DEPRECATION")
        val wl = pm.newWakeLock(
            PowerManager.SCREEN_BRIGHT_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP or PowerManager.ON_AFTER_RELEASE,
            "graceview:wake",
        )
        wl.acquire(10_000)
        ctx.startActivity(
            Intent(ctx, MainActivity::class.java)
                .putExtra(MainActivity.EXTRA_APPLY_NOW, true)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT),
        )
    }
}

/** Exact alarm at the next schedule change. Fires TransitionReceiver. */
object TransitionAlarm {
    private const val TAG = "TransitionAlarm"

    fun scheduleNext(ctx: Context) {
        val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val pi = PendingIntent.getBroadcast(
            ctx, 0, Intent(ctx, TransitionReceiver::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        am.cancel(pi)
        val next = AppState.scheduler(ctx)?.nextChange(Clock.now()) ?: return
        // Alarms run on the real clock; subtract any debug offset.
        val at = next.toInstant().toEpochMilli() - Clock.offset.toMillis()
        val canExact = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || am.canScheduleExactAlarms()
        if (canExact) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
        else am.setWindow(AlarmManager.RTC_WAKEUP, at, 30_000, pi)
        Log.i(TAG, "Next transition at $next (exact=$canExact)")
    }
}

/**
 * A Signage TV left in another app (Amazon's home screen, YouTube, a search page) returns to the
 * schedule after Config.AWAY_IDLE_MS with no remote press and no sound (ported from 1.0).
 * Remote presses in other apps come from HomeKeyService; without it, the time counts from when
 * the app left the screen. Classroom and Green Room TVs are left alone: people use other apps there.
 */
object AwayCheck {
    private const val TAG = "AwayCheck"

    private fun pending(ctx: Context) = PendingIntent.getBroadcast(
        ctx, 1, Intent(ctx, AwayReceiver::class.java),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    /** Called when the app leaves the screen, and to check again later. */
    fun schedule(ctx: Context, at: Long) {
        val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        // Exact: Fire OS 6 delayed an inexact 10-minute alarm by about 4 minutes (1.0 test, 2026-11-17).
        val canExact = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || am.canScheduleExactAlarms()
        if (canExact) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending(ctx))
        else am.setWindow(AlarmManager.RTC_WAKEUP, at, 30_000, pending(ctx))
    }

    fun cancel(ctx: Context) {
        (ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager).cancel(pending(ctx))
    }

    fun run(ctx: Context) {
        if (AppState.activityResumed) return
        val dev = AppState.loadSchedule(ctx)?.second ?: return
        if (!dev.isSignage) return
        // Asleep: the next transition alarm wakes it. A scheduled YouTube Live window ends with its own transition.
        if (!(ctx.getSystemService(Context.POWER_SERVICE) as PowerManager).isInteractive) return
        val now = System.currentTimeMillis()
        if (AppState.launchedLiveExternally) return schedule(ctx, now + Config.AWAY_IDLE_MS)
        // Something is playing sound (a video, music): someone may be watching. Check again later.
        if ((ctx.getSystemService(Context.AUDIO_SERVICE) as AudioManager).isMusicActive) {
            Log.i(TAG, "Sound playing in another app; checking again later")
            return schedule(ctx, now + Config.AWAY_IDLE_MS)
        }
        // The process may have restarted since the app left the screen: count from now.
        if (AppState.leftAppAt == 0L) AppState.leftAppAt = now
        val since = maxOf(AppState.lastInputAt, AppState.leftAppAt)
        if (now - since < Config.AWAY_IDLE_MS) return schedule(ctx, since + Config.AWAY_IDLE_MS)
        Log.i(TAG, "Idle in another app for ${(now - since) / 60_000} min (presses seen: ${HomeKeyService.running})")
        TransitionService.start(ctx, away = true)
    }
}

class AwayReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) = AwayCheck.run(ctx)
}

class TransitionReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        TransitionService.start(ctx)
    }
}

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_MY_PACKAGE_REPLACED) {
            // An update stopped the app. Re-arm the schedule, and come back on screen if the TV is
            // on. If it's asleep, leave it asleep; the next transition alarm wakes it as usual.
            TransitionAlarm.scheduleNext(ctx)
            val pm = ctx.getSystemService(Context.POWER_SERVICE) as PowerManager
            if (pm.isInteractive) {
                runCatching { Power.wakeAndLaunch(ctx, "updated") }.onFailure { Log.w("Boot", "Couldn't start after update", it) }
            } else {
                Log.i("Boot", "Updated while asleep; staying asleep")
            }
            return
        }
        if (intent.action != Intent.ACTION_BOOT_COMPLETED && intent.action != "android.intent.action.QUICKBOOT_POWERON") return
        TransitionAlarm.scheduleNext(ctx)
        // Start on boot. Allowed from the background because the app holds SYSTEM_ALERT_WINDOW.
        runCatching { Power.wakeAndLaunch(ctx, "boot") }.onFailure { Log.w("Boot", "Couldn't start on boot", it) }
    }
}
