package org.graceview.tv

import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.KeyEvent
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import android.content.pm.PackageManager
import androidx.lifecycle.ViewModelProvider
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import org.graceview.tv.data.Mode
import org.graceview.tv.system.AppState
import org.graceview.tv.system.AwayCheck
import org.graceview.tv.system.Clock
import org.graceview.tv.system.Power
import org.graceview.tv.system.TransitionAlarm
import org.graceview.tv.ui.GraceviewApp
import java.time.Duration
import java.time.LocalDateTime
import java.time.ZonedDateTime

class MainActivity : ComponentActivity() {
    companion object {
        const val EXTRA_HOME_WHILE_FOREGROUND = "homeWhileForeground"
        const val EXTRA_APPLY_NOW = "applyNow"
        /** Debug builds only: pretend it's this local time, e.g. 2026-11-08T10:05. */
        const val EXTRA_FAKE_NOW = "fakeNow"
        const val EXTRA_CLEAR_FAKE = "clearFake"
        const val EXTRA_SET_DEVICE = "setDevice"
        private const val EXTRA_REDIRECTED = "redirected"
        private const val TAG = "MainActivity"
    }

    private val vm: SignageViewModel by lazy {
        ViewModelProvider(application as GraceviewApplication, ViewModelProvider.AndroidViewModelFactory.getInstance(application))[SignageViewModel::class.java]
    }

    /** True when this app is the TV's Home app (stock launcher disabled, or chosen as default). */
    private fun isDefaultHome(): Boolean =
        packageManager.resolveActivity(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME), PackageManager.MATCH_DEFAULT_ONLY)
            ?.activityInfo?.packageName == packageName

    /**
     * When we're the Home app, Android keeps HOME launches in their own task. Forward any other
     * launch (app icon, boot, wake, adb) into that task so only one copy is ever on screen.
     */
    private fun redirectToHomeTask(intent: Intent?): Boolean {
        if (intent == null || intent.hasCategory(Intent.CATEGORY_HOME) || !isDefaultHome()) return false
        val home = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME).setPackage(packageName)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            .putExtra(EXTRA_REDIRECTED, true)
        intent.extras?.let { home.putExtras(it) }
        startActivity(home)
        return true
    }

    private var okDownAt = 0L
    private var okFired = false
    private val okHandler = Handler(Looper.getMainLooper())
    /** OK is being held. Some inputs (the emulator, some remotes) send a held key as rapid press/release pairs. */
    private var okHolding = false
    private val openPicker = Runnable {
        Log.i(TAG, "OK held 10 s: opening the picker")
        okFired = true
        vm.requestPicker()
    }
    /** Runs once OK has been released for 300 ms: the hold is over. */
    private val endHold = Runnable {
        okHolding = false
        okFired = false
        okConsumed = false
        okHandler.removeCallbacks(openPicker)
    }
    private var okConsumed = false
    private var pausedAt = 0L

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (redirectToHomeTask(intent)) {
            finish()
            return
        }
        // Keeps the stick from sleeping or starting its screensaver while signage is up.
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        if (Build.VERSION.SDK_INT >= 27) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        } else {
            // Fire OS 6 (API 25).
            @Suppress("DEPRECATION")
            window.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON)
        }
        WindowCompat.getInsetsController(window, window.decorView).apply {
            hide(WindowInsetsCompat.Type.systemBars())
            systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
        lifecycleScope.launch {
            vm.uiEvents.collect { e ->
                when (e) {
                    is UiEvent.Launch -> runCatching { startActivity(e.intent) }.onFailure { Log.w(TAG, "Launch failed", it) }
                    UiEvent.Sleep -> if (!Power.sleep(this@MainActivity)) vm.sleepFailed()
                }
            }
        }
        handleIntent(intent, fresh = true)
        setContent { GraceviewApp(vm) }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIntent(intent, fresh = false)
    }

    private fun handleIntent(intent: Intent?, fresh: Boolean) {
        intent ?: return
        if (BuildConfig.DEBUG) {
            intent.getStringExtra(EXTRA_FAKE_NOW)?.let { s ->
                runCatching {
                    val fake = LocalDateTime.parse(s).atZone(Config.ZONE)
                    Clock.offset = Duration.between(ZonedDateTime.now(Config.ZONE), fake)
                    Log.i(TAG, "Clock set to $fake")
                }
            }
            if (intent.getBooleanExtra(EXTRA_CLEAR_FAKE, false)) {
                Clock.offset = Duration.ZERO
                Log.i(TAG, "Clock back to real time")
            }
            // A changed clock moves the next transition; re-plan the alarm so none is left at a test time.
            if (intent.hasExtra(EXTRA_FAKE_NOW) || intent.hasExtra(EXTRA_CLEAR_FAKE)) {
                runCatching { TransitionAlarm.scheduleNext(this) }
            }
            // Point the YouTube live check at another channel, e.g. one that's live now; "" resets.
            intent.getStringExtra("liveUrl")?.let { vm.debugYoutubeAddress = it.ifBlank { null } }
        }
        if (intent.getBooleanExtra(EXTRA_APPLY_NOW, false)) vm.requestApplyWithoutPrompt()
        // Setup script: set this TV's name without the picker (setup-stick.ps1 -Device).
        intent.getStringExtra(EXTRA_SET_DEVICE)?.takeIf { it.isNotBlank() }?.let {
            Log.i(TAG, "Device set to $it by setup")
            vm.chooseDevice(it.trim())
        }

        // Home button. A fresh launch with HOME is the system starting us at boot: show signage.
        // A redirected launch (see redirectToHomeTask) isn't a Home press either.
        if (!fresh && intent.hasCategory(Intent.CATEGORY_HOME) && !intent.getBooleanExtra(EXTRA_REDIRECTED, false)) {
            val foreground = intent.getBooleanExtra(EXTRA_HOME_WHILE_FOREGROUND, System.currentTimeMillis() - pausedAt < 1500)
            if (foreground && !vm.showHome.value && !vm.allAppsOpen.value) vm.exitRequested()
            else {
                vm.back()
                if (vm.device.value?.isSignage == true) vm.openHome()
            }
        }
    }

    override fun onResume() {
        super.onResume()
        AppState.activityResumed = true
        AwayCheck.cancel(this)
        vm.cameBackToApp()
    }

    override fun onPause() {
        okHandler.removeCallbacks(openPicker)
        okHandler.removeCallbacks(endHold)
        okHolding = false
        AppState.activityResumed = false
        pausedAt = System.currentTimeMillis()
        // Another app (or Amazon's home screen) took over: return to the schedule if it sits idle.
        AppState.leftAppAt = pausedAt
        AwayCheck.schedule(this, pausedAt + Config.AWAY_IDLE_MS)
        super.onPause()
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        AppState.lastInputAt = System.currentTimeMillis()
        val isOk = event.keyCode == KeyEvent.KEYCODE_DPAD_CENTER || event.keyCode == KeyEvent.KEYCODE_ENTER

        // Off, but the stick couldn't sleep (black screen): any button opens the home screen.
        if (event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0 && vm.applied.value?.mode == Mode.Off &&
            !vm.showHome.value && !vm.manualSignage.value && !vm.pickerRequested.value && vm.device.value?.isSignage == true
        ) {
            vm.openHome()
            okConsumed = isOk
            return true
        }

        if (isOk) {
            when (event.action) {
                KeyEvent.ACTION_DOWN -> {
                    if (event.repeatCount == 0) {
                        okHandler.removeCallbacks(endHold)
                        if (!okHolding) {
                            // A new press, not part of an ongoing hold.
                            okHolding = true
                            okDownAt = event.downTime
                            okFired = false
                            okConsumed = false
                            Log.i(TAG, "OK down: hold timer started")
                            // "Press OK to stay" and "Press OK to open the home screen" take OK first.
                            if (vm.prompt.value != null) { vm.stayOnPrompt(); okConsumed = true; return true }
                            if (vm.exitBanner.value) { vm.openHome(); okConsumed = true; return true }
                            // Holding OK for 10 seconds reopens the "Which TV is this?" picker. A timer,
                            // not key repeats, so it works however the remote reports a held key.
                            okHandler.postDelayed(openPicker, 10_000)
                        } else {
                            // Another press within 300 ms of a release: treat it as the same hold, and
                            // don't let it click anything on screen.
                            return true
                        }
                    }
                    if (okFired || okConsumed) return true
                }
                KeyEvent.ACTION_UP -> {
                    // End the hold only if OK stays up for 300 ms; a quick re-press continues it.
                    okHandler.removeCallbacks(endHold)
                    okHandler.postDelayed(endHold, 300)
                    if (okFired || okConsumed) return true
                    if (event.eventTime - okDownAt > 500) return true // part of a held key; not a tap
                }
            }
        }

        if (event.keyCode == KeyEvent.KEYCODE_BACK) {
            // Never let Back close the app; it's the TV's main screen.
            if (event.action == KeyEvent.ACTION_UP && !vm.pickerRequested.value) {
                if (!vm.back() && !vm.showHome.value) vm.exitRequested()
            } else if (event.action == KeyEvent.ACTION_UP) {
                vm.pickerRequested.value = false
            }
            return true
        }
        return super.dispatchKeyEvent(event)
    }
}
