package org.graceview.tv.web

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.addJsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject
import org.graceview.tv.Config
import org.graceview.tv.data.CalEvent
import org.graceview.tv.data.CalendarRepo
import org.graceview.tv.data.DriveLinks
import org.graceview.tv.data.DriveSync
import org.graceview.tv.data.LiveCheck
import org.graceview.tv.data.LiveFeed
import org.graceview.tv.data.LogoCache
import org.graceview.tv.data.Qr
import org.graceview.tv.data.Scheduler
import org.graceview.tv.data.SheetData
import org.graceview.tv.data.SheetRepo
import org.graceview.tv.data.Slide
import org.graceview.tv.data.Theme
import org.graceview.tv.data.Weather
import org.graceview.tv.data.WeatherRepo
import java.io.File
import java.net.URI
import java.time.Instant
import java.time.ZonedDateTime
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicReference

/**
 * Everything the Event Screen pages show: the same Sheet, Drive, calendar and weather loops as the
 * TVs, run once on this PC for every browser. Slide folders, calendars and logos are fetched the
 * first time a page needs them and then kept up to date on the TVs' timing.
 */
class Hub(private val dir: File) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val repo = SheetRepo(dir)

    @Volatile var sheet: SheetData? = repo.loadCached()
    @Volatile private var sheetError: String? = null
    @Volatile private var weather: Weather? = null

    /** --liveUrl (testing): play this stream in Live mode instead of the Sheet's. */
    @Volatile var testLiveUrl: String? = null

    private val slides = Keeper<String, List<Slide>>(scope, { DriveSync.cached(dir, it) }) { id, set ->
        while (true) {
            val ok = try { set(DriveSync.sync(dir, id)); true } catch (e: Exception) { Log.w(TAG, "Drive sync failed", e); false }
            delay(if (ok) Config.DRIVE_SYNC_MS else Config.RETRY_MS)
        }
    }

    private val calendars = Keeper<Pair<String, List<String>>, List<CalEvent>?>(scope, { null }) { (cal, hide), set ->
        var have = false
        while (true) {
            val ok = try { set(CalendarRepo.fetch(cal, hide)); have = true; true } catch (e: Exception) {
                Log.w(TAG, "Calendar fetch failed", e)
                if (!have) set(emptyList())
                false
            }
            delay(if (ok) Config.CALENDAR_MS else Config.RETRY_MS)
        }
    }

    private val logos = Keeper<String, File?>(scope, { id -> File(dir, "logos/$id").takeIf { it.exists() } }) { id, set ->
        while (true) {
            val f = LogoCache.get(dir, id)
            set(f)
            if (f != null) break
            delay(Config.RETRY_MS)
        }
    }

    fun start() {
        scope.launch { weatherLoop() }
        if (Config.API_KEY.isNotBlank()) {
            scope.launch { sheetLoop() }
            scope.launch { overrideLoop() }
        }
    }

    // ---- What one page shows ----

    /**
     * The state for the page of device [name] at [now]. The page polls this every few seconds; the
     * mode it shows changes only when the schedule's key changes, as on the TVs.
     */
    fun state(name: String?, now: ZonedDateTime): JsonObject = buildJsonObject {
        put("version", BuildInfo.VERSION)
        put("now", now.toInstant().toEpochMilli())
        put("apiKey", Config.API_KEY.isNotBlank())
        sheetError?.let { put("sheetError", it) }
        val s = sheet ?: return@buildJsonObject
        put("sheetLoaded", true)
        putJsonArray("devices") {
            s.devices.forEach { d ->
                addJsonObject {
                    put("name", d.name)
                    put("detail", listOf(d.profile, d.location).filter { it.isNotBlank() }.joinToString(" · "))
                }
            }
        }
        val dev = s.device(name) ?: return@buildJsonObject
        put("device", dev.name)

        // Nothing scheduled: the device's Default Mode (column P), never Off on its own.
        val st = Scheduler(s, dev, dev.idleMode).stateAt(now)
        putJsonObject("schedule") {
            put("mode", st.mode.name)
            put("key", st.key)
            put("message", st.message)
            put("note", st.note)
            put("source", st.source)
            put("end", st.end?.toInstant()?.toEpochMilli()?.let { JsonPrimitive(it) } ?: JsonPrimitive(null as Long?))
        }

        val themeName = st.theme.ifBlank { null } ?: dev.defaultTheme
        val folderName = st.folder.ifBlank { null } ?: dev.defaultFolder
        val theme = dev.withWayfinding(s.theme(themeName) ?: s.theme(dev.defaultTheme) ?: s.themes.firstOrNull() ?: Theme.FALLBACK)
        val folderId = s.folder(folderName)?.link?.let { DriveLinks.id(it) }
            ?: s.folder(dev.defaultFolder)?.link?.let { DriveLinks.id(it) }

        putJsonObject("theme") {
            put("displayName", theme.displayName)
            put("main", css(theme.main))
            put("accent", css(theme.accent))
            putJsonArray("wayLeft") { theme.wayLeft.forEach { add(JsonPrimitive(it)) } }
            putJsonArray("wayRight") { theme.wayRight.forEach { add(JsonPrimitive(it)) } }
            put("qrLink", theme.qrLink)
            if (theme.wifiName.isNotBlank() && theme.wifiPassword.isNotBlank()) {
                put("wifi", Qr.wifiPayload(theme.wifiName, theme.wifiPassword))
                put("wifiName", theme.wifiName)
            }
        }
        put("folderName", folderName)
        put("folderLinked", folderId != null)
        putJsonArray("slides") {
            if (folderId != null) slides.get(folderId).forEach { sl ->
                addJsonObject {
                    put("url", "slides/$folderId/${sl.file.name}")
                    put("video", sl.video)
                    put("maxMs", Config.slideMaxMs(sl.name, sl.video))
                }
            }
        }
        if (theme.calendar.isNotBlank()) {
            val evs = calendars.get(theme.calendar to theme.calendarHide)
            if (evs != null) putJsonArray("events") {
                evs.take(4).forEach { ev -> addJsonObject { put("label", ev.label()); put("title", ev.title) } }
            }
        }
        weather?.let { w -> putJsonObject("weather") { put("tempF", w.tempF); put("code", w.code); put("isDay", w.isDay) } }
        theme.logoDark.takeIf { it.isNotBlank() }?.let { DriveLinks.id(it) }?.let { id -> if (logos.get(id) != null) put("logoDark", "logos/$id") }
        theme.logoLight.takeIf { it.isNotBlank() }?.let { DriveLinks.id(it) }?.let { id -> if (logos.get(id) != null) put("logoLight", "logos/$id") }

        putJsonObject("live") {
            val feed = liveFeed()
            put("available", feed != null)
            put("muted", dev.muteLive)
            feed?.let { mediaPath(it.address) }?.let { (host, path) ->
                // A loopback address means MediaMTX is on this PC: the page uses the host it was opened from.
                if (!isLoopback(host)) put("host", host)
                put("path", path)
            }
        }
    }

    /**
     * The local stream to play in Live mode: the Active Live Feeds row when it's a local stream,
     * otherwise the first Local stream row (a browser can't open the YouTube app).
     */
    fun liveFeed(): LiveFeed? {
        testLiveUrl?.let { return LiveFeed("Test", "Local stream", it, true) }
        val s = sheet ?: return null
        return s.activeFeed?.takeIf { !it.isYouTube }
            ?: s.liveFeeds.firstOrNull { !it.isYouTube && LiveCheck.usable(it.address) }
    }

    fun logoFile(id: String): File? = File(dir, "logos/$id").takeIf { it.isFile }

    fun slideFile(folderId: String, name: String): File? = File(dir, "slides/$folderId/$name").takeIf { it.isFile }

    // ---- Loops (the TVs' timing) ----

    private suspend fun sheetLoop() {
        while (true) {
            try {
                sheet = repo.fetch()
                sheetError = null
            } catch (e: Exception) {
                Log.w(TAG, "Sheet fetch failed", e)
                sheetError = e.message ?: e.javaClass.simpleName
            }
            delay(Config.SHEET_POLL_MS)
        }
    }

    private suspend fun overrideLoop() {
        while (true) {
            delay(Config.OVERRIDE_POLL_MS)
            val current = sheet ?: continue
            try {
                val ov = repo.fetchOverride()
                if (ov != current.override) {
                    Log.i(TAG, "Override Now changed: active=${ov.active} mode=${ov.mode} devices=${ov.devices}")
                    sheet = current.copy(override = ov)
                    runCatching { sheet = repo.fetch() }
                }
            } catch (e: Exception) {
                Log.w(TAG, "Override check failed", e)
            }
        }
    }

    private suspend fun weatherLoop() {
        while (true) {
            val ok = try { weather = WeatherRepo.fetch(); true } catch (e: Exception) { Log.w(TAG, "Weather fetch failed", e); false }
            delay(if (ok) Config.WEATHER_MS else Config.RETRY_MS)
        }
    }

    companion object {
        private const val TAG = "Hub"

        fun css(argb: Int) = "#%06X".format(argb and 0xFFFFFF)

        /** rtsp://192.168.0.115:8554/live/stream → ("192.168.0.115", "live/stream"). */
        fun mediaPath(address: String): Pair<String, String>? = runCatching {
            val u = URI(address.trim())
            val host = u.host ?: return null
            val path = u.path.trim('/').ifBlank { return null }
            host to path
        }.getOrNull()

        fun isLoopback(host: String) = host == "localhost" || host.startsWith("127.") || host == "::1" || host == "[::1]"
    }
}

/** One value per key, fetched by a loop that starts the first time the key is asked for. */
private class Keeper<K : Any, V>(
    private val scope: CoroutineScope,
    private val initial: (K) -> V,
    private val loop: suspend (K, (V) -> Unit) -> Unit,
) {
    private val values = ConcurrentHashMap<K, AtomicReference<V>>()

    fun get(key: K): V = values.computeIfAbsent(key) { k ->
        val ref = AtomicReference(initial(k))
        scope.launch { loop(k) { ref.set(it) } }
        ref
    }.get()
}
