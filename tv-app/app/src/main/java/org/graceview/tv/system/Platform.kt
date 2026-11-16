package org.graceview.tv.system

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.drawable.Drawable
import android.media.tv.TvContract
import android.media.tv.TvInputInfo
import android.media.tv.TvInputManager
import android.net.Uri
import android.provider.Settings
import org.graceview.tv.data.LiveFeed

/** Everything that differs between Google TV and Fire TV lives here. */
object Platform {
    fun isFireTv(ctx: Context) = ctx.packageManager.hasSystemFeature("amazon.hardware.fire_tv")

    private val YOUTUBE = listOf("com.google.android.youtube.tv", "com.amazon.firetv.youtube", "com.google.android.youtube.tvkids", "com.google.android.youtube")
    private val BROWSERS = listOf("com.amazon.cloud9", "org.mozilla.tv.firefox", "com.android.chrome", "com.opera.browser", "com.cloudmosa.puffinTV", "com.tvwebbrowser.v22", "com.google.android.tv.browser")
    private val STORES = listOf("com.android.vending", "com.amazon.venezia")

    fun launchIntent(ctx: Context, pkg: String): Intent? {
        val pm = ctx.packageManager
        return (pm.getLeanbackLaunchIntentForPackage(pkg) ?: pm.getLaunchIntentForPackage(pkg))
            ?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }

    private fun firstInstalled(ctx: Context, pkgs: List<String>) = pkgs.firstNotNullOfOrNull { launchIntent(ctx, it) }

    fun youtube(ctx: Context) = firstInstalled(ctx, YOUTUBE)
    fun browser(ctx: Context) = firstInstalled(ctx, BROWSERS)
    fun store(ctx: Context) = firstInstalled(ctx, STORES)

    fun settings(ctx: Context): Intent? =
        Intent(Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK).takeIf { it.resolveActivity(ctx.packageManager) != null }

    /** Fire TV's Display Mirroring, or the system cast settings where they exist. Null means show the help card instead. */
    fun screenMirror(ctx: Context): Intent? =
        Intent(Settings.ACTION_CAST_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK).takeIf { it.resolveActivity(ctx.packageManager) != null }

    /** Only devices with a physical HDMI input (Fire TV Cube, some TVs) get the tile. */
    fun hdmiInput(ctx: Context): Intent? {
        val tim = ctx.getSystemService(Context.TV_INPUT_SERVICE) as? TvInputManager ?: return null
        val input = runCatching { tim.tvInputList }.getOrNull()?.firstOrNull { it.type == TvInputInfo.TYPE_HDMI } ?: return null
        return Intent(Intent.ACTION_VIEW, TvContract.buildChannelUriForPassthroughInput(input.id)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            .takeIf { it.resolveActivity(ctx.packageManager) != null }
    }

    /** Opens the YouTube channel's /live link in the YouTube app. */
    fun youtubeLive(ctx: Context, feed: LiveFeed): Intent {
        val uri = Uri.parse(feed.address)
        val pkg = YOUTUBE.firstOrNull { launchIntent(ctx, it) != null }
        return Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK).apply { if (pkg != null) setPackage(pkg) }
    }

    data class AppEntry(val label: String, val pkg: String, val banner: Drawable?, val icon: Drawable?)

    /** Every TV app with a launcher entry, except this one. */
    fun allApps(ctx: Context): List<AppEntry> {
        val pm = ctx.packageManager
        val seen = mutableSetOf<String>()
        val out = mutableListOf<AppEntry>()
        for (cat in listOf(Intent.CATEGORY_LEANBACK_LAUNCHER, Intent.CATEGORY_LAUNCHER)) {
            val q = Intent(Intent.ACTION_MAIN).addCategory(cat)
            for (ri in pm.queryIntentActivities(q, 0)) {
                val pkg = ri.activityInfo.packageName
                if (pkg == ctx.packageName || !seen.add(pkg)) continue
                out += AppEntry(ri.loadLabel(pm).toString(), pkg, ri.activityInfo.loadBanner(pm), ri.loadIcon(pm))
            }
        }
        return out.sortedBy { it.label.lowercase() }
    }

    /**
     * Fire OS always sends Home to Amazon's launcher, so on Fire the HOME alias is turned off
     * (CLAUDE.md, Fire TV support). Elsewhere it stays on.
     */
    fun configureHomeAlias(ctx: Context) {
        val alias = ComponentName(ctx, "org.graceview.tv.HomeAlias")
        val want = if (isFireTv(ctx)) PackageManager.COMPONENT_ENABLED_STATE_DISABLED else PackageManager.COMPONENT_ENABLED_STATE_ENABLED
        if (ctx.packageManager.getComponentEnabledSetting(alias) != want) {
            ctx.packageManager.setComponentEnabledSetting(alias, want, PackageManager.DONT_KILL_APP)
        }
    }
}
