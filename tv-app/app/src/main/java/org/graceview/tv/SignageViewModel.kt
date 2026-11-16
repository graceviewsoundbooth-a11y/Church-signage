package org.graceview.tv

import android.app.Application
import android.content.Intent
import android.util.Log
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import org.graceview.tv.data.CalEvent
import org.graceview.tv.data.CalendarRepo
import org.graceview.tv.data.Device
import org.graceview.tv.data.DriveLinks
import org.graceview.tv.data.DriveSync
import org.graceview.tv.data.GreenRoomFeed
import org.graceview.tv.data.LiveCheck
import org.graceview.tv.data.LiveFeed
import org.graceview.tv.data.Lab
import org.graceview.tv.data.LabFolders
import org.graceview.tv.data.LabLauncher
import org.graceview.tv.data.LogoCache
import org.graceview.tv.data.PairStart
import org.graceview.tv.data.Mode
import org.graceview.tv.data.ScheduleState
import org.graceview.tv.data.Scheduler
import org.graceview.tv.data.SheetData
import org.graceview.tv.data.SheetRepo
import org.graceview.tv.data.Slide
import org.graceview.tv.data.Theme
import org.graceview.tv.data.Weather
import org.graceview.tv.data.WeatherRepo
import org.graceview.tv.system.AppState
import org.graceview.tv.system.Clock
import org.graceview.tv.system.Platform
import org.graceview.tv.system.Secrets
import org.graceview.tv.system.TransitionAlarm
import java.io.File

/** What the screen is built from: this TV, the theme and folder of the current schedule state. */
data class Resolved(val device: Device, val theme: Theme, val folderName: String, val folderId: String?)

data class Prompt(val target: ScheduleState, val secondsLeft: Int)

sealed interface UiEvent {
    data class Launch(val intent: Intent) : UiEvent
    data object Sleep : UiEvent
}

class SignageViewModel(app: Application) : AndroidViewModel(app) {
    private val ctx get() = getApplication<Application>()
    private val sheetRepo = SheetRepo(app.filesDir)

    val sheet = MutableStateFlow<SheetData?>(sheetRepo.loadCached())
    val sheetError = MutableStateFlow<String?>(null)
    val deviceName = MutableStateFlow(AppState.deviceName(app))

    // ---- Church Signage pairing ----
    /** This screen has a device key from the dashboard. */
    val paired = MutableStateFlow(AppState.deviceKey(app) != null)
    /** The code on screen while waiting to be paired. */
    val pairing = MutableStateFlow<PairStart?>(null)
    val church = MutableStateFlow("")
    /** This TV's home screen layout from the dashboard; null = the built-in tile row. */
    val launcher = MutableStateFlow<LabLauncher?>(null)
    private var appsReportedAt = 0L
    val pickerRequested = MutableStateFlow(false)
    val slides = MutableStateFlow<List<Slide>>(emptyList())
    /** null = no calendar for this theme, so the list is hidden. */
    val events = MutableStateFlow<List<CalEvent>?>(null)
    val weather = MutableStateFlow<Weather?>(null)
    val logos = MutableStateFlow<Pair<File?, File?>>(null to null)

    // ---- Schedule and navigation state ----
    /** The schedule state on screen. Changes only at transitions. */
    val applied = MutableStateFlow<ScheduleState?>(null)
    /** Our home screen is showing (signage TVs; classrooms always show it). */
    val showHome = MutableStateFlow(false)
    val allAppsOpen = MutableStateFlow(false)
    val livePlayerOpen = MutableStateFlow(false)
    val mirrorHelp = MutableStateFlow(false)
    /** The church YouTube channel is live right now (see LiveCheck). */
    val channelLive = MutableStateFlow(false)
    /** The Active local stream (RTSP) is answering. */
    val localLive = MutableStateFlow(false)
    /** Classroom TVs: the Announcements tile is showing the full digital-sign screen. */
    val announcementsOpen = MutableStateFlow(false)
    /** Green Room TVs: the Green Room Dashboard is open. */
    val dashboardOpen = MutableStateFlow(false)
    /** Planning Center, ProPresenter and Avantis data, fetched only while the dashboard is open. */
    val greenRoom = GreenRoomFeed(app, viewModelScope)
    val exitBanner = MutableStateFlow(false)
    val prompt = MutableStateFlow<Prompt?>(null)
    /** Off is scheduled, but someone chose Return to Signage. Cleared at the next transition. */
    val manualSignage = MutableStateFlow(false)
    /** Off is applied but the stick couldn't sleep, so the screen is black. */
    val offBlack = MutableStateFlow(false)

    private val _events = MutableSharedFlow<UiEvent>(extraBufferCapacity = 8)
    val uiEvents: SharedFlow<UiEvent> = _events

    /** Set when the transition service already waited 60 seconds and brought the app forward. */
    @Volatile private var applyNextWithoutPrompt = false
    /** When Off began or the TV last came back to the app; Green Room idle-sleep counts from here. */
    @Volatile private var offSince = 0L
    private var promptJob: Job? = null
    private var exitJob: Job? = null

    val device: StateFlow<Device?> = combine(sheet, deviceName) { s, n -> s?.device(n) }
        .stateIn(viewModelScope, SharingStarted.Eagerly, null)

    val resolved: StateFlow<Resolved?> = combine(sheet, device, applied) { s, dev, st ->
        if (s == null || dev == null) null else resolve(s, dev, st)
    }.stateIn(viewModelScope, SharingStarted.Eagerly, null)

    val activeFeed: LiveFeed? get() = sheet.value?.activeFeed

    init {
        Platform.configureHomeAlias(app)
        viewModelScope.launch { weatherLoop() }
        // Church Signage: the dashboard replaces the Sheet (labLoop replaces sheetLoop and overrideLoop).
        viewModelScope.launch { labLoop() }
        viewModelScope.launch { liveLoop() }
        viewModelScope.launch { calendarLoop() }
        // Slides and logos: with no API key, folder lists come from the dashboard (LabFolders).
        viewModelScope.launch { slidesLoop() }
        viewModelScope.launch { logoLoop() }
        viewModelScope.launch { scheduleLoop() }
        viewModelScope.launch { idleLoop() }
        viewModelScope.launch {
            combine(dashboardOpen, device, sheet) { open, dev, s -> if (open && dev?.isGreenRoom == true) s?.greenRoom else null }
                .distinctUntilChanged()
                .collect { settings -> if (settings == null) greenRoom.stop() else greenRoom.start(settings) }
        }
    }

    // ---- Device picker ----

    fun chooseDevice(name: String) {
        AppState.setDeviceName(ctx, name)
        applied.value = null
        deviceName.value = name
        pickerRequested.value = false
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

    // ---- Schedule ----

    private suspend fun scheduleLoop() {
        combine(sheet, device) { s, d -> if (s == null || d == null) null else Scheduler(s, d) }
            .collectLatest { sched ->
                if (sched == null) return@collectLatest
                TransitionAlarm.scheduleNext(ctx)
                while (true) {
                    tick(sched)
                    delay(5_000)
                }
            }
    }

    private fun tick(sched: Scheduler) {
        val target = sched.stateAt(Clock.now())
        val current = applied.value
        if (current == null) {
            apply(target, initial = true)
            return
        }
        if (target.key == current.key) {
            if (prompt.value != null) cancelPrompt()
            return
        }
        if (prompt.value?.target?.key == target.key) return
        if (applyNextWithoutPrompt) {
            applyNextWithoutPrompt = false
            Log.i(TAG, "Transition ${current.mode} -> ${target.mode}: applying without prompt (requested)")
            apply(target)
            return
        }
        if (target.key == AppState.skippedKey(ctx)) return
        if (!AppState.activityResumed) return // TransitionService handles it while we're in the background

        val busy = showHome.value || allAppsOpen.value || livePlayerOpen.value || announcementsOpen.value ||
            dashboardOpen.value || AppState.recentInput()
        Log.i(TAG, "Transition ${current.mode} -> ${target.mode}: home=${showHome.value} input ${(System.currentTimeMillis() - AppState.lastInputAt) / 1000}s ago busy=$busy")
        if (!busy || current.mode == Mode.Off) apply(target) else startPrompt(target)
    }

    private fun apply(target: ScheduleState, initial: Boolean = false) {
        cancelPrompt()
        val dev = device.value
        applied.value = target
        offSince = System.currentTimeMillis()
        AppState.setApplied(ctx, target.key, target.mode)
        AppState.setSkippedKey(ctx, null)
        AppState.launchedLiveExternally = false
        manualSignage.value = false
        offBlack.value = false
        allAppsOpen.value = false
        livePlayerOpen.value = false
        announcementsOpen.value = false
        dashboardOpen.value = false
        exitBanner.value = false
        showHome.value = false
        Log.i(TAG, "Applied ${target.mode} (${target.source}) theme=${target.theme} folder=${target.folder} initial=$initial")

        when (target.mode) {
            Mode.Off -> {
                // Opening the app during Off hours (setup, testing) shows the home screen instead of sleeping.
                if (initial && dev?.hasScheduledPower == true) { if (dev.isSignage) showHome.value = true }
                else _events.tryEmit(UiEvent.Sleep)
            }
            Mode.Dashboard -> if (dev?.isGreenRoom == true) dashboardOpen.value = true
            Mode.Live -> {
                val feed = activeFeed
                if (feed != null && feed.isYouTube) {
                    AppState.launchedLiveExternally = true
                    _events.tryEmit(UiEvent.Launch(Platform.youtubeLive(ctx, feed)))
                }
            }
            else -> {}
        }
        TransitionAlarm.scheduleNext(ctx)
    }

    private fun startPrompt(target: ScheduleState) {
        promptJob?.cancel()
        promptJob = viewModelScope.launch {
            for (left in 60 downTo 1) {
                prompt.value = Prompt(target, left)
                delay(1_000)
            }
            apply(target)
        }
    }

    private fun cancelPrompt() {
        promptJob?.cancel()
        promptJob = null
        prompt.value = null
    }

    /** "Press OK to stay": skip this transition. */
    fun stayOnPrompt() {
        val p = prompt.value ?: return
        AppState.setSkippedKey(ctx, p.target.key)
        cancelPrompt()
    }

    fun requestApplyWithoutPrompt() { applyNextWithoutPrompt = true }

    /** Off failed to sleep the stick: show black instead. */
    fun sleepFailed() { offBlack.value = true }

    // ---- Home screen and navigation ----

    /** Back or Home while signage is showing. */
    fun exitRequested() {
        val dev = device.value ?: return
        if (dev.usesLauncher) { back(); return } // closes Announcements, the dashboard or All Apps
        if (showHome.value) return
        if (dev.exitConfirm) {
            exitJob?.cancel()
            exitBanner.value = true
            exitJob = viewModelScope.launch { delay(5_000); exitBanner.value = false }
        } else openHome()
    }

    fun openHome() {
        exitJob?.cancel()
        exitBanner.value = false
        offBlack.value = false
        showHome.value = true
    }

    /** Woken by the remote while Off, or Home pressed from another app. */
    fun cameBackToApp() {
        offSince = System.currentTimeMillis()
        if (applied.value?.mode == Mode.Off && device.value?.hasScheduledPower == true && !manualSignage.value) openHome()
    }

    fun returnToSignage() {
        allAppsOpen.value = false
        showHome.value = false
        if (applied.value?.mode == Mode.Off) manualSignage.value = true
    }

    /** The YouTube row in Live Feeds (Active or not): used for detection and as a fallback. */
    private fun youtubeFeed(): LiveFeed? =
        debugYoutubeAddress?.let { LiveFeed("Debug", "YouTube", it, false) }
            ?: sheet.value?.liveFeeds?.firstOrNull { it.isYouTube && LiveCheck.usable(it.address) }

    /** Debug builds only (MainActivity "liveUrl"): check this channel instead of the sheet's. */
    @Volatile var debugYoutubeAddress: String? = null

    /**
     * Plays the Active feed: the local stream in-app when it's Active and answering (lower
     * delay), otherwise the YouTube channel's /live page in the YouTube app.
     */
    fun watchLive() {
        val active = activeFeed
        if (active != null && !active.isYouTube && (localLive.value || !channelLive.value)) {
            livePlayerOpen.value = true
            return
        }
        val yt = youtubeFeed() ?: active?.takeIf { it.isYouTube } ?: return
        _events.tryEmit(UiEvent.Launch(Platform.youtubeLive(ctx, yt)))
    }

    /**
     * Every minute: is the YouTube channel live, and is the Active local stream up?
     * The YouTube live page is ~290 KB, so it's read every minute only when a stream is likely
     * (something new on the channel in the last 6 hours, or it's already live); otherwise
     * every 15 minutes. The channel's RSS feed (~7 KB) decides "likely".
     */
    private suspend fun liveLoop() {
        var channelId: String? = null
        var lastPageCheck = 0L
        var lastAddress: String? = null
        while (true) {
            val yt = youtubeFeed()
            if (yt?.address != lastAddress) {
                // New or changed channel address: forget what we knew and check right away.
                lastAddress = yt?.address
                channelId = null
                lastPageCheck = 0L
                channelLive.value = false
            }
            if (yt == null) {
                channelLive.value = false
            } else {
                val recent = channelId?.let { id ->
                    runCatching { LiveCheck.newestPublished(id) }.getOrNull()
                        ?.let { java.time.Duration.between(it, java.time.Instant.now()).toHours() < Config.LIVE_RECENT_HOURS }
                } ?: true
                val interval = if (channelLive.value || recent) Config.LIVE_TICK_MS else Config.LIVE_PAGE_IDLE_MS
                val now = System.currentTimeMillis()
                if (now - lastPageCheck >= interval - 1_000) {
                    lastPageCheck = now
                    try {
                        val r = LiveCheck.youtube(yt.address)
                        if (r.channelId != null) channelId = r.channelId
                        if (r.live != channelLive.value) Log.i(TAG, "YouTube channel is ${if (r.live) "LIVE" else "not live"}")
                        channelLive.value = r.live
                    } catch (e: Exception) {
                        Log.w(TAG, "YouTube live check failed", e)
                    }
                }
            }

            val local = activeFeed?.takeIf { !it.isYouTube && LiveCheck.usable(it.address) }
            val up = local != null && runCatching { LiveCheck.rtspUp(local.address) }.getOrDefault(false)
            if (up != localLive.value) Log.i(TAG, "Local stream is ${if (up) "up" else "down"}")
            localLive.value = up

            delay(Config.LIVE_TICK_MS)
        }
    }

    fun launch(intent: Intent) { _events.tryEmit(UiEvent.Launch(intent)) }

    /** Back inside our own screens. Returns true if it was handled. */
    fun back(): Boolean = when {
        mirrorHelp.value -> { mirrorHelp.value = false; true }
        allAppsOpen.value -> { allAppsOpen.value = false; true }
        livePlayerOpen.value -> { livePlayerOpen.value = false; true }
        announcementsOpen.value -> { announcementsOpen.value = false; true }
        dashboardOpen.value -> { dashboardOpen.value = false; true }
        else -> false
    }

    /** On our home screen, after Idle Return minutes with no remote input, go back to signage. */
    private suspend fun idleLoop() {
        // Idle time counts from the later of the last button press and when the home screen
        // opened, so a freshly started app doesn't time out immediately.
        var homeOpenedAt = 0L
        viewModelScope.launch {
            combine(showHome, allAppsOpen) { h, a -> h || a }.distinctUntilChanged().collect { open ->
                if (open) homeOpenedAt = System.currentTimeMillis()
            }
        }
        while (true) {
            delay(15_000)
            val dev = device.value ?: continue
            // Green Room woken during Off hours: back to sleep after Idle Return minutes with no input.
            if (dev.isGreenRoom && applied.value?.mode == Mode.Off && AppState.activityResumed) {
                val minutes = (dev.idleReturnMinutes ?: 10).coerceAtLeast(1)
                if (System.currentTimeMillis() - maxOf(AppState.lastInputAt, homeOpenedAt, offSince) >= minutes * 60_000L) {
                    Log.i(TAG, "Green Room idle during Off: sleeping")
                    offSince = System.currentTimeMillis()
                    _events.tryEmit(UiEvent.Sleep)
                }
                continue
            }
            if (!dev.isSignage || !(showHome.value || allAppsOpen.value) || !AppState.activityResumed) continue
            val minutes = (dev.idleReturnMinutes ?: 10).coerceAtLeast(1)
            val since = maxOf(AppState.lastInputAt, homeOpenedAt)
            if (System.currentTimeMillis() - since < minutes * 60_000L) continue
            Log.i(TAG, "Idle return after $minutes min")
            allAppsOpen.value = false
            showHome.value = false
            if (applied.value?.mode == Mode.Off) _events.tryEmit(UiEvent.Sleep)
        }
    }

    // ---- Church Signage: pairing and the dashboard ----

    /**
     * Not paired: show a code and wait for someone to approve it in the dashboard.
     * Paired: fetch this TV's setup every 15 seconds and keep the last good copy on disk.
     * If the dashboard says the key no longer works (unpaired there), go back to showing a code.
     */
    private suspend fun labLoop() {
        while (true) {
            val key = AppState.deviceKey(ctx)
            if (key == null) {
                paired.value = false
                waitForPairing()
                continue
            }
            try {
                // Once an hour, tell the dashboard which apps are installed (for the Launchers page).
                val apps = if (System.currentTimeMillis() - appsReportedAt > 60 * 60_000L) installedAppsJson() else null
                val st = Lab.state(key, apps, greenRoom.statusJson(), deviceInfoJson())
                if (apps != null) appsReportedAt = System.currentTimeMillis()
                launcher.value = st.launcher
                // Green Room TVs: keep the Planning Center login from the dashboard in encrypted storage.
                st.planningCenter?.let { pco ->
                    val current = Secrets.planningCenter(ctx)
                    if (pco.appId.isBlank() || pco.secret.isBlank()) {
                        if (current != null) { Secrets.clearPlanningCenter(ctx); Log.i(TAG, "Planning Center login removed by the dashboard") }
                    } else if (current?.appId != pco.appId || current.secret != pco.secret) {
                        Secrets.savePlanningCenter(ctx, pco.appId, pco.secret)
                        Log.i(TAG, "Planning Center login updated from the dashboard")
                    }
                }
                if (st.unpaired) {
                    Log.i(TAG, "The dashboard no longer knows this screen: showing a pairing code")
                    AppState.setDeviceKey(ctx, null)
                    paired.value = false
                    continue
                }
                church.value = st.church
                if (st.files.isNotEmpty()) LabFolders.listings = st.files
                st.batch?.let { sheet.value = sheetRepo.store(it) }
                if (st.device.isNotBlank() && !st.device.equals(deviceName.value, ignoreCase = true)) {
                    Log.i(TAG, "Paired as ${st.device}")
                    chooseDevice(st.device)
                }
                sheetError.value = null
            } catch (e: Exception) {
                Log.w(TAG, "Dashboard fetch failed", e)
                sheetError.value = e.message ?: e.javaClass.simpleName
            }
            delay(Config.LAB_POLL_MS)
        }
    }

    /** IP address on the local network, model and app version, for the dashboard's Devices page. */
    private fun deviceInfoJson(): String? = runCatching {
        val ip = java.net.NetworkInterface.getNetworkInterfaces().toList()
            .filter { it.isUp && !it.isLoopback }
            .flatMap { it.inetAddresses.toList() }
            .firstOrNull { it is java.net.Inet4Address && it.isSiteLocalAddress }?.hostAddress.orEmpty()
        kotlinx.serialization.json.buildJsonObject {
            put("ip", kotlinx.serialization.json.JsonPrimitive(ip))
            put("model", kotlinx.serialization.json.JsonPrimitive("${android.os.Build.MANUFACTURER} ${android.os.Build.MODEL}".trim()))
            put("android", kotlinx.serialization.json.JsonPrimitive(android.os.Build.VERSION.RELEASE))
            put("version", kotlinx.serialization.json.JsonPrimitive(BuildConfig.VERSION_NAME))
        }.toString()
    }.getOrNull()

    private fun installedAppsJson(): String? = runCatching {
        val list = Platform.allApps(ctx)
            .filter { it.pkg != ctx.packageName }
            .map { kotlinx.serialization.json.buildJsonObject { put("pkg", kotlinx.serialization.json.JsonPrimitive(it.pkg)); put("label", kotlinx.serialization.json.JsonPrimitive(it.label)) } }
        kotlinx.serialization.json.JsonArray(list).toString()
    }.getOrNull()

    /** One pairing code: shows it until it's approved (returns with a key saved) or it expires. */
    private suspend fun waitForPairing() {
        val p = try {
            Lab.pairStart("${android.os.Build.MANUFACTURER} ${android.os.Build.MODEL}, Android ${android.os.Build.VERSION.RELEASE}")
        } catch (e: Exception) {
            Log.w(TAG, "Couldn't get a pairing code", e)
            pairing.value = null
            sheetError.value = e.message ?: e.javaClass.simpleName
            delay(Config.RETRY_MS / 4)
            return
        }
        sheetError.value = null
        church.value = p.church
        pairing.value = p
        while (System.currentTimeMillis() < p.exp) {
            delay(Config.PAIR_POLL_MS)
            val c = runCatching { Lab.pairCheck(p.code, p.secret) }.getOrNull() ?: continue
            if (c.paired) {
                Log.i(TAG, "Paired (device ${c.deviceId})")
                AppState.setDeviceKey(ctx, c.deviceKey)
                applied.value = null
                pairing.value = null
                paired.value = true
                return
            }
            if (c.expired) break
        }
        pairing.value = null
    }

    // ---- Content loops ----

    @Suppress("unused") // The production app's Sheet loop, kept for reference; labLoop replaces it.
    private suspend fun sheetLoop() {
        while (true) {
            try {
                sheet.value = sheetRepo.fetch()
                sheetError.value = null
            } catch (e: Exception) {
                Log.w(TAG, "Sheet fetch failed", e)
                sheetError.value = e.message ?: e.javaClass.simpleName
            }
            delay(Config.SHEET_POLL_MS)
        }
    }

    /**
     * Checks only Override Now every 30 seconds. When it changes, the schedule loop picks it up
     * within 5 seconds, and the full sheet is fetched again so the on-disk copy matches.
     */
    @Suppress("unused")
    private suspend fun overrideLoop() {
        while (true) {
            delay(Config.OVERRIDE_POLL_MS)
            val current = sheet.value ?: continue
            try {
                val ov = sheetRepo.fetchOverride()
                if (ov != current.override) {
                    Log.i(TAG, "Override Now changed: active=${ov.active} mode=${ov.mode} devices=${ov.devices}")
                    sheet.value = current.copy(override = ov)
                    runCatching { sheet.value = sheetRepo.fetch() }
                }
            } catch (e: Exception) {
                Log.w(TAG, "Override check failed", e)
            }
        }
    }

    private suspend fun slidesLoop() {
        resolved.map { it?.folderId }.distinctUntilChanged().collectLatest { folderId ->
            if (folderId == null) {
                slides.value = emptyList()
                return@collectLatest
            }
            slides.value = DriveSync.cached(ctx.filesDir, folderId)
            while (true) {
                val ok = try {
                    slides.value = DriveSync.sync(ctx.filesDir, folderId)
                    true
                } catch (e: Exception) {
                    Log.w(TAG, "Drive sync failed: ${e.message}")
                    false
                }
                // Church Signage: the dashboard's list is already fresh, so checking it is cheap.
                val lab = Config.API_KEY.isBlank()
                delay(if (ok) (if (lab) 60_000L else Config.DRIVE_SYNC_MS) else (if (lab) 15_000L else Config.RETRY_MS))
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
                    Log.w(TAG, "Calendar fetch failed", e)
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
                Log.w(TAG, "Weather fetch failed", e)
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
                val dark = links.first.takeIf { it.isNotBlank() }?.let { LogoCache.get(ctx.filesDir, it) }
                val light = links.second.takeIf { it.isNotBlank() }?.let { LogoCache.get(ctx.filesDir, it) }
                logos.value = dark to light
                val missing = (links.first.isNotBlank() && dark == null) || (links.second.isNotBlank() && light == null)
                if (!missing) break
                delay(Config.RETRY_MS)
            }
        }
    }

    companion object {
        private const val TAG = "Signage"
    }
}
