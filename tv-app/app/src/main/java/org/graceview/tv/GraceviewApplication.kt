package org.graceview.tv

import android.app.Application
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.lifecycle.ViewModelStore
import androidx.lifecycle.ViewModelStoreOwner
import org.graceview.tv.system.AppState

/**
 * Holds one SignageViewModel for the whole process, so the schedule loop runs once even if
 * Android briefly has two activity instances (the HOME task and a normal launch).
 */
class GraceviewApplication : Application(), ViewModelStoreOwner {
    override val viewModelStore = ViewModelStore()

    private val handler = Handler(Looper.getMainLooper())

    /**
     * When the stick wakes, Google TV (Android TV Core Services) and Fire OS open their own home
     * screen, which covers ours, even when our alarm did the waking. Come back to the front a
     * moment later: signage if the schedule is on, our home screen during Off (cameBackToApp).
     */
    private val bringToFront = Runnable {
        if (AppState.activityResumed) return@Runnable
        Log.i("GraceviewApp", "Screen on: bringing Graceview to the front")
        runCatching {
            startActivity(Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }.onFailure { Log.w("GraceviewApp", "Couldn't come to the front after wake", it) }
    }

    override fun onCreate() {
        super.onCreate()
        // The shared code (android/core) gets the API key and logs through Android's Log.
        Config.API_KEY = BuildConfig.GOOGLE_API_KEY
        Config.LAB_URL = BuildConfig.LAB_URL
        org.graceview.tv.data.CoreLog.sink = org.graceview.tv.data.CoreLog.Sink { level, tag, message, error ->
            if (level == 'W') Log.w(tag, message, error) else Log.i(tag, message, error)
        }
        // SCREEN_ON can only be received by a receiver registered at runtime.
        registerReceiver(object : BroadcastReceiver() {
            override fun onReceive(context: Context, intent: Intent) {
                handler.removeCallbacks(bringToFront)
                // Twice: the stock home screen can open a few seconds after the screen turns on.
                handler.postDelayed(bringToFront, 2_000)
                handler.postDelayed(bringToFront, 5_000)
            }
        }, IntentFilter(Intent.ACTION_SCREEN_ON))
    }
}
