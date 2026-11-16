package org.graceview.tv.system

import android.content.Context
import org.graceview.tv.Config
import org.graceview.tv.data.Device
import org.graceview.tv.data.Mode
import org.graceview.tv.data.Scheduler
import org.graceview.tv.data.SheetData
import org.graceview.tv.data.SheetRepo
import java.time.Duration
import java.time.ZonedDateTime

/** App clock. Debug builds can shift it for testing (see MainActivity "fakeNow"). */
object Clock {
    @Volatile var offset: Duration = Duration.ZERO
    fun now(): ZonedDateTime = ZonedDateTime.now(Config.ZONE).plus(offset)
}

/**
 * Small amount of state shared between the activity, the alarm receiver and the transition
 * service. Values that must survive the process dying live in SharedPreferences.
 */
object AppState {
    @Volatile var activityResumed = false
    @Volatile var lastInputAt = 0L
    /** True after we sent the user to YouTube for a Live window, so the end of Live returns without asking. */
    @Volatile var launchedLiveExternally = false

    private fun prefs(ctx: Context) = ctx.getSharedPreferences("graceview", Context.MODE_PRIVATE)

    fun deviceName(ctx: Context): String? = prefs(ctx).getString("device", null)
    fun setDeviceName(ctx: Context, name: String) = prefs(ctx).edit().putString("device", name).apply()

    /** Church Signage: the key the dashboard gave this screen when it was paired. null = not paired. */
    fun deviceKey(ctx: Context): String? = prefs(ctx).getString("deviceKey", null)
    fun setDeviceKey(ctx: Context, key: String?) = prefs(ctx).edit().apply {
        if (key == null) remove("deviceKey") else putString("deviceKey", key)
    }.apply()

    /** Key of the schedule state currently on screen. */
    fun appliedKey(ctx: Context): String? = prefs(ctx).getString("appliedKey", null)
    fun appliedMode(ctx: Context): Mode? = prefs(ctx).getString("appliedMode", null)?.let { runCatching { Mode.valueOf(it) }.getOrNull() }
    fun setApplied(ctx: Context, key: String, mode: Mode) =
        prefs(ctx).edit().putString("appliedKey", key).putString("appliedMode", mode.name).apply()

    /** Key of a transition the user chose to skip with "Press OK to stay". */
    fun skippedKey(ctx: Context): String? = prefs(ctx).getString("skippedKey", null)
    fun setSkippedKey(ctx: Context, key: String?) = prefs(ctx).edit().putString("skippedKey", key).apply()

    fun recentInput(windowMs: Long = 10 * 60_000L) = System.currentTimeMillis() - lastInputAt < windowMs

    /** Reads the cached sheet and this TV's row, for code running without the activity. */
    fun loadSchedule(ctx: Context): Pair<SheetData, Device>? {
        val data = SheetRepo(ctx.filesDir).loadCached() ?: return null
        val device = data.device(deviceName(ctx)) ?: return null
        return data to device
    }

    fun scheduler(ctx: Context): Scheduler? = loadSchedule(ctx)?.let { (d, dev) -> Scheduler(d, dev) }
}
