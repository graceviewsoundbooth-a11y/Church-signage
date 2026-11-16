package org.graceview.tv.system

import android.accessibilityservice.AccessibilityService
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.provider.Settings
import android.util.Log
import android.util.TypedValue
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.view.accessibility.AccessibilityEvent
import android.widget.FrameLayout
import android.widget.TextView
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import org.graceview.tv.MainActivity
import org.graceview.tv.R
import org.graceview.tv.data.Mode
import org.graceview.tv.data.ScheduleState

/**
 * Sends the remote's Home button to our home screen (CLAUDE.md, Launcher and navigation).
 * Also provides the lock-screen action used as the second way to sleep.
 * Enabled once per stick by the setup script. Not used on Fire TV.
 */
class HomeKeyService : AccessibilityService() {
    companion object {
        @Volatile private var instance: HomeKeyService? = null
        fun lockScreen(): Boolean =
            instance?.performGlobalAction(GLOBAL_ACTION_LOCK_SCREEN) ?: false
    }

    override fun onServiceConnected() { instance = this }
    override fun onDestroy() { instance = null; super.onDestroy() }
    override fun onAccessibilityEvent(event: AccessibilityEvent?) {}
    override fun onInterrupt() {}

    override fun onKeyEvent(event: KeyEvent): Boolean {
        if (event.keyCode != KeyEvent.KEYCODE_HOME || Platform.isFireTv(this)) return false
        if (event.action == KeyEvent.ACTION_UP) {
            // Resolves to our HOME alias, so it lands in the same task as a normal Home press.
            startActivity(
                Intent(Intent.ACTION_MAIN)
                    .addCategory(Intent.CATEGORY_HOME)
                    .setPackage(packageName)
                    .putExtra(MainActivity.EXTRA_HOME_WHILE_FOREGROUND, AppState.activityResumed)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            )
        }
        return true
    }
}

/**
 * Runs at each scheduled transition when the app is not on screen (the activity handles it
 * otherwise). Wakes a sleeping TV, returns from a Live YouTube window, or, if someone is using
 * another app, shows "Switching to … in 60 seconds. Press OK to stay."
 */
class TransitionService : Service() {
    companion object {
        private const val TAG = "TransitionService"
        private const val CHANNEL = "transitions"
        private const val PROMPT_SECONDS = 60

        fun start(ctx: Context) {
            runCatching { ContextCompat.startForegroundService(ctx, Intent(ctx, TransitionService::class.java)) }
                .onFailure { Log.w(TAG, "Couldn't start", it) }
        }
    }

    private val handler = Handler(Looper.getMainLooper())
    private var overlay: View? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        goForeground()
        handler.post { decide() }
        return START_NOT_STICKY
    }

    override fun onTimeout(startId: Int, fgsType: Int) { finish() }

    private fun goForeground() {
        if (Build.VERSION.SDK_INT >= 26) {
            val nm = getSystemService(NotificationManager::class.java)
            nm.createNotificationChannel(NotificationChannel(CHANNEL, "Schedule changes", NotificationManager.IMPORTANCE_LOW))
        }
        val n = NotificationCompat.Builder(this, CHANNEL).setSmallIcon(R.drawable.icon).setContentTitle("Graceview TV").setContentText("Applying the schedule").build()
        if (Build.VERSION.SDK_INT >= 34) startForeground(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SHORT_SERVICE)
        else startForeground(1, n)
    }

    private fun decide() {
        TransitionAlarm.scheduleNext(this)
        val sched = AppState.scheduler(this) ?: return finish()
        val target = sched.stateAt(Clock.now())
        val applied = AppState.appliedKey(this)
        when {
            target.key == applied || target.key == AppState.skippedKey(this) -> finish()
            AppState.activityResumed -> finish() // the activity's own loop handles it
            !(getSystemService(Context.POWER_SERVICE) as PowerManager).isInteractive ||
                AppState.appliedMode(this) == Mode.Off ||
                AppState.launchedLiveExternally -> launch("wake")
            !Settings.canDrawOverlays(this) -> launch("no overlay permission")
            else -> showPrompt(target)
        }
    }

    private fun launch(reason: String) {
        removeOverlay()
        Power.wakeAndLaunch(this, reason)
        finish()
    }

    private fun showPrompt(target: ScheduleState) {
        val wm = getSystemService(WINDOW_SERVICE) as WindowManager
        val text = TextView(this).apply {
            setTextColor(Color.WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 22f)
            setPadding(48, 28, 48, 28)
            background = GradientDrawable().apply { setColor(Color.argb(235, 20, 23, 28)); cornerRadius = 24f; setStroke(4, Color.WHITE) }
        }
        val root = object : FrameLayout(this) {
            override fun dispatchKeyEvent(event: KeyEvent): Boolean {
                if (event.action != KeyEvent.ACTION_UP) return true
                when (event.keyCode) {
                    KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER -> {
                        AppState.setSkippedKey(this@TransitionService, target.key)
                        removeOverlay(); finish()
                    }
                    KeyEvent.KEYCODE_BACK -> launch("switch now")
                }
                return true
            }
        }.apply {
            addView(text)
            isFocusable = true
            isFocusableInTouchMode = true
        }
        val lp = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT, WindowManager.LayoutParams.WRAP_CONTENT,
            // TYPE_APPLICATION_OVERLAY is API 26; Fire OS 6 (API 25) uses the older TYPE_PHONE.
            if (Build.VERSION.SDK_INT >= 26) WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            else @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_PHONE,
            WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT,
        ).apply { gravity = Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL; y = 80 }

        runCatching { wm.addView(root, lp) }.onFailure { Log.w(TAG, "Overlay failed", it); return launch("overlay failed") }
        overlay = root
        root.requestFocus()

        var left = PROMPT_SECONDS
        val tick = object : Runnable {
            override fun run() {
                if (overlay == null) return
                if (left <= 0) return launch("prompt timed out")
                text.text = "Switching to ${target.mode.label} in $left seconds. Press OK to stay."
                left--
                handler.postDelayed(this, 1000)
            }
        }
        tick.run()
    }

    private fun removeOverlay() {
        val v = overlay ?: return
        overlay = null
        runCatching { (getSystemService(WINDOW_SERVICE) as WindowManager).removeView(v) }
    }

    private fun finish() {
        handler.removeCallbacksAndMessages(null)
        removeOverlay()
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        removeOverlay()
        super.onDestroy()
    }
}
