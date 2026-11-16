package org.graceview.tv.desktop

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import org.graceview.tv.Config
import org.graceview.tv.data.CalEvent
import org.graceview.tv.data.CalendarRepo
import org.graceview.tv.data.Device
import org.graceview.tv.data.DriveLinks
import org.graceview.tv.data.DriveSync
import org.graceview.tv.data.LiveCheck
import org.graceview.tv.data.LiveFeed
import org.graceview.tv.data.LogoCache
import org.graceview.tv.data.Mode
import org.graceview.tv.data.ScheduleState
import org.graceview.tv.data.Scheduler
import org.graceview.tv.data.SheetData
import org.graceview.tv.data.SheetRepo
import org.graceview.tv.data.Slide
import org.graceview.tv.data.Theme
import org.graceview.tv.data.Weather
import org.graceview.tv.data.WeatherRepo
import java.io.File

/** What the screen is built from: this device, the theme and folder of what's showing. */
data class Resolved(val device: Device, val theme: Theme, val folderName: String, val folderId: String?)

/**
 * The Event Screen's state: the same Sheet, Drive, calendar and weather loops as the TVs, the
 * shared Scheduler with Default Mode as the fallback, and the keyboard's manual mode.
 */
class EventScreen(private val dir: File = Storage.dir) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val sheetRepo = SheetRepo(dir)

    val sheet = MutableStateFlow<SheetData?>(sheetRepo.loadCached())
    val sheetError = MutableStateFlow<String?>(null)
    val deviceName = MutableStateFlow(Prefs.device)
    val pickerRequested = MutableStateFlow(false)
    val slides = MutableStateFlow<List<Slide>>(emptyList())
    val events = MutableStateFlow<List<CalEvent>?>(null)
    val weather = MutableStateFlow<Weather?>(null)
    val logos = MutableStateFlow<Pair<File?, File?>>(null to null)

    /** What the schedule says right now. Changes only at transitions. */
    val applied = MutableStateFlow<ScheduleState?>(null)
    /** F1-F3: a mode chosen at the keyboard, until the next scheduled change or F4. */
    val manual = MutableStateFlow<Mode?>(null)
    /** --liveUrl (testing): play this stream in Live mode instead of the Sheet's. */
    @Volatile var testLiveUrl: String? = null
    /** A short note at the bottom of the screen, and when to hide it. */
    val note = MutableStateFlow<Pair<String, Long>?>(null)

    val device: StateFlow<Device?> = combine(sheet, deviceName) { s, n -> s?.device(n) }
        .stateIn(scope, SharingStarted.Eagerly, null)

    val resolved: StateFlow<Resolved?> = combine(sheet, device, applied) { s, dev, st ->
        if (s == null || dev == null) null else resolve(s, dev, st)
    }.stateIn(scope, SharingStarted.Eagerly, null)

    /** The mode on screen: the keyboard's choice, or the schedule's. */
    val shownMode: StateFlow<Mode?> = combine(applied, manual) { a, m -> m ?: a?.mode }
        .stateIn(scope, SharingStarted.Eagerly, null)

    fun start() {
        scope.launch { weatherLoop() }
        if (Config.API_KEY.isNotBlank()) {
            scope.launch { sheetLoop() }
            scope.launch { overrideLoop() }
            scope.launch { slidesLoop() }
            scope.launch { calendarLoop() }
            scope.launch { logoLoop() }
        }
        scope.launch { scheduleLoop() }
    }

    // ---- Device ----

    fun chooseDevice(name: String) {
        Prefs.device = name
        applied.value = null
        manual.value = null
        deviceName.value = name
        pickerRequested.value = false
        DesktopLog.i(TAG, "Device: $name")
    }

    fun requestPicker() { pickerRequested.value = true }

    private fun resolve(s: SheetData, dev: Device, st: ScheduleState?): Resolved {
        val themeName = st?.theme?.ifBlank { null } ?: dev.defaultTheme
        val folderName = st?.folder?.ifBlank { null } ?: dev.defaultFolder
        val theme = s.theme(themeName) ?: s.theme(dev.defaultTheme) ?: s.themes.firstOrNull() ?: Theme.FALLBACK
        val folderId = s.folder(folderName)?.link?.let { DriveLinks.id(it) }
            ?: s.folder(dev.defaultFolder)?.link?.let { DriveLinks.id(it) }
        return Resolved(dev, theme, folderName, folderId)
    }

    /**
     * The local stream to play in Live mode: the Active Live Feeds row when it's a local stream,
     * otherwise the first Local stream row (the desktop can't open the YouTube app).
     */
    fun liveFeed(): LiveFeed? {
        testLiveUrl?.let { return LiveFeed("Test", "Local stream", it, true) }
        val s = sheet.value ?: return null
        return s.activeFeed?.takeIf { !it.isYouTube }
            ?: s.liveFeeds.firstOrNull { !it.isYouTube && LiveCheck.usable(it.address) }
    }

    // ---- Keyboard ----

    fun setManual(mode: Mode?) {
        manual.value = mode
        if (mode == null) {
            showNote("Following the schedule")
            DesktopLog.i(TAG, "Manual mode cleared")
        } else {
            showNote("Manual: ${mode.name} (F4 returns to the schedule)")
            DesktopLog.i(TAG, "Manual mode: $mode")
        }
    }

    fun showNote(text: String, ms: Long = 5_000) {
        note.value = text to System.currentTimeMillis() + ms
    }

    // ---- Schedule ----

    private suspend fun scheduleLoop() {
        combine(sheet, device) { s, d -> if (s == null || d == null) null else Scheduler(s, d, d.idleMode) }
            .collectLatest { sched ->
                if (sched == null) return@collectLatest
                while (true) {
                    val target = sched.stateAt(Clock.now())
                    val current = applied.value
                    if (current == null || target.key != current.key) {
                        DesktopLog.i(TAG, "Showing ${target.mode} (${target.source}) theme=${target.theme} folder=${target.folder}")
                        applied.value = target
                        // A scheduled change ends a keyboard choice.
                        if (current != null && manual.value != null) {
                            manual.value = null
                            showNote("Schedule changed: following the schedule")
                        }
                    }
                    delay(5_000)
                }
            }
    }

    // ---- Content loops (the same timing as the TVs) ----

    private suspend fun sheetLoop() {
        while (true) {
            try {
                sheet.value = sheetRepo.fetch()
                sheetError.value = null
            } catch (e: Exception) {
                DesktopLog.w(TAG, "Sheet fetch failed", e)
                sheetError.value = e.message ?: e.javaClass.simpleName
            }
            delay(Config.SHEET_POLL_MS)
        }
    }

    private suspend fun overrideLoop() {
        while (true) {
            delay(Config.OVERRIDE_POLL_MS)
            val current = sheet.value ?: continue
            try {
                val ov = sheetRepo.fetchOverride()
                if (ov != current.override) {
                    DesktopLog.i(TAG, "Override Now changed: active=${ov.active} mode=${ov.mode} devices=${ov.devices}")
                    sheet.value = current.copy(override = ov)
                    runCatching { sheet.value = sheetRepo.fetch() }
                }
            } catch (e: Exception) {
                DesktopLog.w(TAG, "Override check failed", e)
            }
        }
    }

    private suspend fun slidesLoop() {
        resolved.map { it?.folderId }.distinctUntilChanged().collectLatest { folderId ->
            if (folderId == null) {
                slides.value = emptyList()
                return@collectLatest
            }
            slides.value = DriveSync.cached(dir, folderId)
            while (true) {
                val ok = try {
                    slides.value = DriveSync.sync(dir, folderId)
                    true
                } catch (e: Exception) {
                    DesktopLog.w(TAG, "Drive sync failed", e)
                    false
                }
                delay(if (ok) Config.DRIVE_SYNC_MS else Config.RETRY_MS)
            }
        }
    }

    private suspend fun calendarLoop() {
        resolved.map { r -> r?.theme?.let { it.calendar to it.calendarHide } }.distinctUntilChanged().collectLatest { cal ->
            if (cal == null || cal.first.isBlank()) {
                events.value = null
                return@collectLatest
            }
            while (true) {
                val ok = try {
                    events.value = CalendarRepo.fetch(cal.first, cal.second)
                    true
                } catch (e: Exception) {
                    DesktopLog.w(TAG, "Calendar fetch failed", e)
                    if (events.value == null) events.value = emptyList()
                    false
                }
                delay(if (ok) Config.CALENDAR_MS else Config.RETRY_MS)
            }
        }
    }

    private suspend fun weatherLoop() {
        while (true) {
            val ok = try {
                weather.value = WeatherRepo.fetch()
                true
            } catch (e: Exception) {
                DesktopLog.w(TAG, "Weather fetch failed", e)
                false
            }
            delay(if (ok) Config.WEATHER_MS else Config.RETRY_MS)
        }
    }

    private suspend fun logoLoop() {
        resolved.map { r -> r?.theme?.let { it.logoDark to it.logoLight } }.distinctUntilChanged().collectLatest { links ->
            if (links == null) {
                logos.value = null to null
                return@collectLatest
            }
            while (true) {
                val dark = links.first.takeIf { it.isNotBlank() }?.let { LogoCache.get(dir, it) }
                val light = links.second.takeIf { it.isNotBlank() }?.let { LogoCache.get(dir, it) }
                logos.value = dark to light
                val missing = (links.first.isNotBlank() && dark == null) || (links.second.isNotBlank() && light == null)
                if (!missing) break
                delay(Config.RETRY_MS)
            }
        }
    }

    companion object {
        private const val TAG = "EventScreen"
    }
}
