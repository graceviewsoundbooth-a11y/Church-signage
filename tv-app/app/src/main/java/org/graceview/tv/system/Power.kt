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
import android.os.Build
import android.os.PowerManager
import android.util.Log
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
