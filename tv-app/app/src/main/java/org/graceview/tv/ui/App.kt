package org.graceview.tv.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.foundation.layout.Box
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import org.graceview.tv.data.PairStart
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import org.graceview.tv.Config
import org.graceview.tv.SignageViewModel
import org.graceview.tv.data.Device
import org.graceview.tv.data.LiveCheck
import org.graceview.tv.data.Mode
import org.graceview.tv.data.SheetData

@Composable
fun GraceviewApp(vm: SignageViewModel) {
    val sheet by vm.sheet.collectAsState()
    val error by vm.sheetError.collectAsState()
    val device by vm.deviceName.collectAsState()
    val paired by vm.paired.collectAsState()
    val pairing by vm.pairing.collectAsState()
    val church by vm.church.collectAsState()
    val launcherLayout by vm.launcher.collectAsState()
    val resolved by vm.resolved.collectAsState()
    val slides by vm.slides.collectAsState()
    val events by vm.events.collectAsState()
    val weather by vm.weather.collectAsState()
    val logos by vm.logos.collectAsState()
    val churchLogo by vm.churchLogo.collectAsState()
    val applied by vm.applied.collectAsState()
    val showHome by vm.showHome.collectAsState()
    val allApps by vm.allAppsOpen.collectAsState()
    val livePlayer by vm.livePlayerOpen.collectAsState()
    val mirrorHelp by vm.mirrorHelp.collectAsState()
    val exitBanner by vm.exitBanner.collectAsState()
    val prompt by vm.prompt.collectAsState()
    val manualSignage by vm.manualSignage.collectAsState()
    val announcements by vm.announcementsOpen.collectAsState()
    val dashboard by vm.dashboardOpen.collectAsState()
    val plan by vm.greenRoom.plan.collectAsState()
    val planError by vm.greenRoom.planError.collectAsState()
    val pro by vm.greenRoom.pro.collectAsState()
    val avantis by vm.greenRoom.avantis.collectAsState()
    // Read so the home screen recomposes when the live checks change.
    val channelLive by vm.channelLive.collectAsState()
    val localLive by vm.localLive.collectAsState()

    DesignCanvas {
        val s = sheet
        val r = resolved
        when {
            // Church Signage: a screen that isn't paired shows a code to type into the dashboard.
            !paired -> PairingScreen(pairing, church, error)
            s == null && error != null ->
                StatusScreen("Can't reach the dashboard", "$error\n\nTrying again every 15 seconds.")
            s == null ->
                StatusScreen("Starting up…", "Loading this TV's setup from the dashboard.")
            device == null || r == null ->
                StatusScreen("Loading this TV…", "Getting this screen's setup from the dashboard.")
            else -> {
                val res = r!!
                val dev = res.device
                val theme = res.theme
                val hint = emptyHint(res.folderName, res.folderId != null)
                val mode = applied?.mode ?: Mode.Signage
                val feed = s!!.activeFeed
                val darkLogo = logos.first ?: logos.second
                val launcherBase = dev.usesLauncher && mode in setOf(Mode.Launcher, Mode.LiveOption, Mode.Off, Mode.Signage, Mode.Dashboard)

                when {
                    allApps -> AllAppsScreen(onLaunch = vm::launch)
                    livePlayer && feed != null && !feed.isYouTube -> LivePlayerScreen(feed)
                    // The local feed was turned off in the sheet while the player was open.
                    livePlayer -> LaunchedEffect(Unit) { vm.livePlayerOpen.value = false }
                    dashboard && dev.isGreenRoom -> GreenRoomDashboard(
                        theme = theme,
                        logo = darkLogo,
                        settings = s!!.greenRoom,
                        plan = plan,
                        planError = planError,
                        pro = pro,
                        avantis = avantis,
                        localStream = feed?.takeIf { !it.isYouTube && localLive }?.address,
                        youtubeLive = channelLive,
                    )
                    announcements ->
                        SignageScreen(theme, res.folderName, res.folderId != null, slides, events, weather, logos.first, logos.second, showWayfinding = false)
                    showHome || launcherBase || mode == Mode.Launcher || mode == Mode.LiveOption ->
                        LauncherScreen(
                            device = dev, theme = theme, slides = slides, hint = hint, weather = weather, logo = darkLogo,
                            showWatchLive = watchLiveTile(s!!, mode, channelLive, localLive),
                            onReturnToSignage = vm::returnToSignage,
                            onWatchLive = vm::watchLive,
                            onLaunch = vm::launch,
                            onAllApps = { vm.allAppsOpen.value = true },
                            onMirrorHelp = { vm.mirrorHelp.value = true },
                            onAnnouncements = { vm.announcementsOpen.value = true },
                            onDashboard = { vm.dashboardOpen.value = true },
                            layout = launcherLayout,
                            events = events,
                        )
                    else -> when (mode) {
                        Mode.Fullscreen -> FullscreenScreen(theme, slides, hint)
                        Mode.Countdown -> CountdownScreen(theme, applied!!, slides, hint, darkLogo)
                        Mode.Live -> LiveScreen(theme, applied, feed, darkLogo, muted = sheet?.device(device)?.muteLive == true)
                        // An emergency is church-wide: the church's logo and name (Church page), not the theme's.
                        Mode.Message -> MessageScreen(
                            if (church.isNotBlank()) theme.copy(displayName = church) else theme,
                            applied?.message.orEmpty(), churchLogo ?: darkLogo,
                        )
                        Mode.Off -> if (manualSignage) {
                            SignageScreen(dev.withWayfinding(theme), res.folderName, res.folderId != null, slides, events, weather, logos.first, logos.second)
                        } else BlackScreen()
                        else -> SignageScreen(dev.withWayfinding(theme), res.folderName, res.folderId != null, slides, events, weather, logos.first, logos.second)
                    }
                }

                if (mirrorHelp) MirrorHelp()
                if (exitBanner) BottomBanner("Press OK to open the home screen.")
                prompt?.let { BottomBanner("Switching to ${it.target.mode.label} in ${it.secondsLeft} seconds. Press OK to stay.") }
            }
        }
    }
}

/** Watch Live shows when the schedule says Live or Live Option, or a feed is actually live right now. */
private fun watchLiveTile(s: SheetData, mode: Mode, channelLive: Boolean, localLive: Boolean): Boolean {
    val anyFeed = s.activeFeed != null || s.liveFeeds.any { it.isYouTube && LiveCheck.usable(it.address) }
    return anyFeed && (mode == Mode.Live || mode == Mode.LiveOption || channelLive || localLive)
}

@Composable
private fun StatusScreen(title: String, detail: String) {
    Column(Modifier.fillMaxSize().background(Color(0xFF111418)).padding(u(120)), verticalArrangement = Arrangement.Center) {
        T(title, 64, weight = FontWeight.Bold, family = Montserrat)
        Spacer(Modifier.height(u(24)))
        T(detail, 32, color = Color(0xFFCCCCCC), lineHeight = 1.35f)
    }
}

/** Church Signage: "Pair this screen" with the code to type into the dashboard (Screens > + Add a screen). */
@Composable
private fun PairingScreen(p: PairStart?, church: String, error: String?) {
    Column(
        Modifier.fillMaxSize().background(Color(0xFF111418)).padding(u(96)),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        if (church.isNotBlank()) {
            T(church, 40, color = Color(0xFF9AA3AD))
            Spacer(Modifier.height(u(24)))
        }
        T("Pair this screen", 64, weight = FontWeight.Bold, family = Montserrat)
        Spacer(Modifier.height(u(40)))
        if (p == null) {
            T(if (error != null) "Can't reach the dashboard. Trying again…" else "Getting a code…", 36, color = Color(0xFFCCCCCC))
            if (error != null) {
                Spacer(Modifier.height(u(16)))
                T(error, 26, color = Color(0xFF8A939D))
            }
        } else {
            Box(Modifier.background(Color(0xFF1B2027), RoundedCornerShape(u(28))).padding(horizontal = u(64), vertical = u(24))) {
                T(p.code.take(3) + "-" + p.code.drop(3), 200, weight = FontWeight.Bold, family = Montserrat)
            }
            Spacer(Modifier.height(u(40)))
            val where = p.dashboard.ifBlank { "the signage dashboard" }
            T("1. On a phone or computer, open $where and sign in", 36, color = Color(0xFFC9D1DA))
            T("2. Go to Screens and choose + Add a screen", 36, color = Color(0xFFC9D1DA))
            T("3. Type this code, then pick which screen this is", 36, color = Color(0xFFC9D1DA))
            Spacer(Modifier.height(u(32)))
            T("A new code appears on its own every 15 minutes.", 28, color = Color(0xFF6D7783))
        }
    }
}

@Suppress("unused") // The production app's device picker; the dashboard now says which TV this is.
@Composable
private fun DevicePicker(devices: List<Device>, current: String?, onPick: (String) -> Unit) {
    val first = remember { FocusRequester() }
    // Start on the TV's current name so OK or Back keeps it unchanged.
    val focusIndex = devices.indexOfFirst { it.name.equals(current, ignoreCase = true) }.coerceAtLeast(0)
    Column(Modifier.fillMaxSize().background(Color(0xFF111418)).padding(horizontal = u(160), vertical = u(96))) {
        T("Which TV is this?", 64, weight = FontWeight.Bold, family = Montserrat)
        Spacer(Modifier.height(u(16)))
        T("Use the arrows and press OK. To change it later, hold OK for 10 seconds.", 30, color = Color(0xFFCCCCCC))
        Spacer(Modifier.height(u(48)))
        LazyColumn(verticalArrangement = Arrangement.spacedBy(u(16))) {
            itemsIndexed(devices) { i, d ->
                PickerItem(d, d.name.equals(current, ignoreCase = true), if (i == focusIndex) first else null) { onPick(d.name) }
            }
        }
    }
    LaunchedEffect(devices) { runCatching { first.requestFocus() } }
}

@Composable
private fun PickerItem(d: Device, selected: Boolean, focus: FocusRequester?, onClick: () -> Unit) {
    val src = remember { MutableInteractionSource() }
    val focused by src.collectIsFocusedAsState()
    val shape = RoundedCornerShape(u(12))
    Column(
        Modifier
            .fillMaxWidth()
            .then(if (focus != null) Modifier.focusRequester(focus) else Modifier)
            .border(u(4), if (focused) Color.White else Color.Transparent, shape)
            .background(if (focused) Color(0xFF2B3440) else Color(0xFF1B2028), shape)
            .clickable(interactionSource = src, indication = null, onClick = onClick)
            .padding(horizontal = u(32), vertical = u(20)),
        verticalArrangement = Arrangement.spacedBy(u(6)),
    ) {
        T(d.name + if (selected) "  (current)" else "", 40, weight = FontWeight.SemiBold)
        T(listOf(d.profile, d.location).filter { it.isNotBlank() }.joinToString(" · "), 26, color = Color(0xFFBBBBBB))
    }
}
