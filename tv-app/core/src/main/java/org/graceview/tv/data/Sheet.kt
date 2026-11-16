package org.graceview.tv.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import org.graceview.tv.Config
import java.io.File

@Serializable
data class ValueRange(val range: String? = null, val values: List<List<String>> = emptyList())

@Serializable
data class BatchGet(val valueRanges: List<ValueRange> = emptyList())

data class Device(
    val name: String,
    val profile: String,
    val defaultTheme: String,
    val defaultFolder: String,
    val location: String,
    val idleReturnMinutes: Int?,
    val exitConfirm: Boolean,
    /** Devices column K "Mute Live" (added 2026-11-13): scheduled Live mode plays the stream silently. */
    val muteLive: Boolean = false,
    /** Devices columns N/O "Wayfinding Left/Right" (added 2026-11-13), semicolon-separated. */
    val wayLeft: String = "",
    val wayRight: String = "",
    /**
     * Devices column P "Default Mode" (added 2026-11-15): what the Event Screen desktop app shows
     * when nothing is scheduled. TVs ignore it.
     */
    val defaultMode: String = "",
) {
    /** Column P as a mode; blank or unknown is Signage. */
    val idleMode: Mode get() = Mode.parse(defaultMode) ?: Mode.Signage

    /**
     * Wayfinding belongs to where the TV hangs, not to the theme. "None" in N or O hides it
     * (the no-wayfinding bottom bar); text in either replaces the theme's G/H; both blank keep the theme's.
     */
    fun withWayfinding(theme: Theme): Theme {
        fun items(s: String) = s.split(';').map { it.trim() }.filter { it.isNotEmpty() }
        val l = wayLeft.trim(); val r = wayRight.trim()
        return when {
            l.equals("None", true) || r.equals("None", true) -> theme.copy(wayLeft = emptyList(), wayRight = emptyList())
            l.isNotEmpty() || r.isNotEmpty() -> theme.copy(wayLeft = items(l), wayRight = items(r))
            else -> theme
        }
    }

    /** Matches the CLASSROOMS target. */
    val isClassroom get() = profile.equals("Classroom", ignoreCase = true)
    val isGreenRoom get() = profile.replace(" ", "").equals("GreenRoom", ignoreCase = true)
    /** Classroom and Green Room: the launcher is home, there is no scheduled power. */
    val usesLauncher get() = isClassroom || isGreenRoom
    val isSignage get() = !usesLauncher
    /** Off when nothing is scheduled (decided 2026-11-05: the Green Room is on only for rehearsals and Sunday). */
    val hasScheduledPower get() = isSignage || isGreenRoom
}

/**
 * [position] is a Planning Center team position that uses this mic (e.g. "Pastor" on the Speakers
 * team for HS 1). Numbered vocal positions ("1 First") match HH mics without it.
 */
data class MicMapRow(val label: String, val channel: Int?, val notes: String, val position: String = "")

/** The Green Room tab: settings by label in column A, then a Mic Map table under a "Mic Label" header. */
data class GreenRoomSettings(
    val serviceTypeId: String = "",
    val micSource: String = "",
    val planNoteCategory: String = "",
    val hideDeclined: Boolean = true,
    val proPresenter: String = "",
    val proPresenterTimer: String = "",
    val avantis: String = "",
    /** 1-based MIDI channel, as shown on the console. */
    val avantisBaseChannel: Int = 12,
    val micMap: List<MicMapRow> = emptyList(),
)

data class Theme(
    val name: String,
    val main: Int,
    val accent: Int,
    val displayName: String,
    val logoDark: String,
    val logoLight: String,
    val wayLeft: List<String>,
    val wayRight: List<String>,
    val qrLink: String,
    val calendar: String,
    val wifiName: String,
    val wifiPassword: String,
    val calendarHide: List<String>,
) {
    companion object {
        val FALLBACK = Theme(
            "Default", 0xFFCF2020.toInt(), 0xFFB50606.toInt(), "Graceview", "", "",
            emptyList(), emptyList(), "", "", "", "", emptyList(),
        )
    }
}

data class Folder(val name: String, val link: String)

data class SheetData(
    val devices: List<Device>,
    val themes: List<Theme>,
    val folders: List<Folder>,
    val override: OverrideNow? = null,
    val special: List<SpecialRow> = emptyList(),
    val weekly: List<WeeklyRow> = emptyList(),
    val liveFeeds: List<LiveFeed> = emptyList(),
    val greenRoom: GreenRoomSettings = GreenRoomSettings(),
) {
    fun theme(name: String) = themes.firstOrNull { it.name.equals(name.trim(), ignoreCase = true) }
    fun folder(name: String) = folders.firstOrNull { it.name.equals(name.trim(), ignoreCase = true) }
    fun device(name: String?) = devices.firstOrNull { it.name.equals(name?.trim(), ignoreCase = true) }
    val activeFeed: LiveFeed? get() = liveFeeds.firstOrNull { it.active && it.address.isNotBlank() }
}

/** Reads the control Sheet with the Sheets API and keeps the last good copy on disk in [dir]. */
class SheetRepo(dir: File) {
    private val cache = File(dir, "sheet.json")

    fun loadCached(): SheetData? = runCatching {
        parse(Net.json.decodeFromString<BatchGet>(cache.readText()))
    }.getOrNull()

    suspend fun fetch(): SheetData {
        val ranges = RANGES.joinToString("&") { "ranges=" + Net.enc(it) }
        val url = "https://sheets.googleapis.com/v4/spreadsheets/${Config.SHEET_ID}/values:batchGet" +
            "?$ranges&valueRenderOption=FORMATTED_VALUE&key=${Config.API_KEY}"
        val text = Net.getString(url)
        val data = parse(Net.json.decodeFromString<BatchGet>(text))
        withContext(Dispatchers.IO) {
            val tmp = File(cache.path + ".tmp")
            tmp.writeText(text)
            if (!tmp.renameTo(cache)) { cache.delete(); tmp.renameTo(cache) }
        }
        return data
    }

    /**
     * Church Signage: keeps a setup that came from the dashboard as the last good copy, the same
     * file the alarm and transition code read when the app isn't on screen.
     */
    suspend fun store(b: BatchGet): SheetData {
        val data = parse(b)
        withContext(Dispatchers.IO) {
            val tmp = File(cache.path + ".tmp")
            tmp.writeText(Net.json.encodeToString(BatchGet.serializer(), b))
            if (!tmp.renameTo(cache)) { cache.delete(); tmp.renameTo(cache) }
        }
        return data
    }

    /** Just the Override Now block: one small request, polled more often than the full sheet. */
    suspend fun fetchOverride(): OverrideNow {
        val url = "https://sheets.googleapis.com/v4/spreadsheets/${Config.SHEET_ID}/values/" +
            Net.enc(RANGES[OVERRIDE]) + "?valueRenderOption=FORMATTED_VALUE&key=${Config.API_KEY}"
        return parseOverride(Net.json.decodeFromString<ValueRange>(Net.getString(url)).values)
    }

    companion object {
        // Phase 1 reads Devices, Themes and Folders. The rest are fetched now so the
        // cache is complete for the scheduler in phase 2.
        val RANGES = listOf(
            "'Override Now'!A1:B9",
            "'Special Dates'!A2:I",
            "'Weekly'!A2:H",
            "'Devices'!A2:P",
            "'Themes'!A2:M",
            "'Folders'!A2:D",
            "'Live Feeds'!A2:E",
            "'Green Room'!A1:D60",
        )
        private const val OVERRIDE = 0
        private const val SPECIAL = 1
        private const val WEEKLY = 2
        private const val DEVICES = 3
        private const val THEMES = 4
        private const val FOLDERS = 5
        private const val LIVE = 6
        private const val GREEN_ROOM = 7

        fun parseGreenRoom(rows: List<List<String>>): GreenRoomSettings {
            val header = rows.indexOfFirst { it.c(0).equals("Mic Label", ignoreCase = true) }
            val settingRows = if (header >= 0) rows.subList(0, header) else rows
            fun v(label: String) = settingRows.firstOrNull { it.c(0).equals(label, ignoreCase = true) }?.c(1).orEmpty()
            val mics = if (header < 0) emptyList() else rows.drop(header + 1)
                .filter { it.c(0).isNotEmpty() }
                .map { r -> MicMapRow(r.c(0), r.c(1).toIntOrNull()?.takeIf { it in 1..64 }, r.c(2), r.c(3)) }
            return GreenRoomSettings(
                serviceTypeId = v("Planning Center Service Type ID"),
                micSource = v("Mic Assignment Source"),
                planNoteCategory = v("Plan Note Category"),
                hideDeclined = v("Hide Declined People").let { it.isEmpty() || bool(it) },
                proPresenter = v("ProPresenter Address"),
                proPresenterTimer = v("ProPresenter Timer Name"),
                avantis = v("Avantis Address"),
                avantisBaseChannel = v("Avantis MIDI Base Channel").toIntOrNull()?.takeIf { it in 1..12 } ?: 12,
                micMap = mics,
            )
        }

        private fun List<String>.c(i: Int) = getOrNull(i)?.trim().orEmpty()
        private fun bool(s: String) = s.equals("TRUE", ignoreCase = true)
        private fun list(s: String) = s.split(';').map { it.trim() }.filter { it.isNotEmpty() }
        private fun color(s: String, fallback: Int) = parseColor(s) ?: fallback

        private val NAMED = mapOf(
            "black" to 0xFF000000, "darkgray" to 0xFF444444, "gray" to 0xFF888888, "grey" to 0xFF888888,
            "lightgray" to 0xFFCCCCCC, "white" to 0xFFFFFFFF, "red" to 0xFFFF0000, "green" to 0xFF00FF00,
            "blue" to 0xFF0000FF, "yellow" to 0xFFFFFF00, "cyan" to 0xFF00FFFF, "magenta" to 0xFFFF00FF,
            "aqua" to 0xFF00FFFF, "fuchsia" to 0xFFFF00FF, "lime" to 0xFF00FF00, "maroon" to 0xFF800000,
            "navy" to 0xFF000080, "olive" to 0xFF808000, "purple" to 0xFF800080, "silver" to 0xFFC0C0C0,
            "teal" to 0xFF008080,
        )

        /** Same as Android's Color.parseColor: #RRGGBB, #AARRGGBB or a basic color name. */
        fun parseColor(s: String): Int? {
            val t = s.trim()
            if (t.startsWith("#")) {
                val hex = t.substring(1)
                if (hex.any { it.lowercaseChar() !in "0123456789abcdef" }) return null
                return when (hex.length) {
                    6 -> (0xFF000000 or hex.toLong(16)).toInt()
                    8 -> hex.toLong(16).toInt()
                    else -> null
                }
            }
            return NAMED[t.lowercase()]?.toInt()
        }

        /** Override Now is a key/value block starting at A1, so B5..B9 are rows 4..8. */
        fun parseOverride(ov: List<List<String>>) = OverrideNow(
            active = bool(ov.getOrNull(4).orEmpty().c(1)),
            devices = ov.getOrNull(5).orEmpty().c(1).ifEmpty { "ALL" },
            mode = Mode.parse(ov.getOrNull(6).orEmpty().c(1)) ?: Mode.Message,
            theme = ov.getOrNull(7).orEmpty().c(1),
            message = ov.getOrNull(8).orEmpty().c(1),
        )

        fun parse(b: BatchGet): SheetData {
            fun rows(i: Int) = b.valueRanges.getOrNull(i)?.values.orEmpty()

            val devices = rows(DEVICES).filter { it.c(0).isNotEmpty() }.map { r ->
                // H-J and L-M (IP, version, status, Now Showing, Last Seen) belong to the church-PC updater.
                Device(
                    r.c(0), r.c(1), r.c(2), r.c(3), r.c(4), r.c(5).toIntOrNull(), bool(r.c(6)),
                    muteLive = bool(r.c(10)), wayLeft = r.c(13), wayRight = r.c(14), defaultMode = r.c(15),
                )
            }
            val themes = rows(THEMES).filter { it.c(0).isNotEmpty() }.map { r ->
                Theme(
                    name = r.c(0),
                    main = color(r.c(1), Theme.FALLBACK.main),
                    accent = color(r.c(2), Theme.FALLBACK.accent),
                    displayName = r.c(3).ifEmpty { r.c(0) },
                    logoDark = r.c(4),
                    logoLight = r.c(5),
                    wayLeft = list(r.c(6)),
                    wayRight = list(r.c(7)),
                    qrLink = r.c(8),
                    calendar = r.c(9),
                    wifiName = r.c(10),
                    wifiPassword = r.c(11),
                    calendarHide = list(r.c(12)),
                )
            }
            val folders = rows(FOLDERS).filter { it.c(0).isNotEmpty() }.map { r -> Folder(r.c(0), r.c(1)) }

            val override = parseOverride(rows(OVERRIDE))

            val special = rows(SPECIAL).mapNotNull { r ->
                val sd = ScheduleParse.date(r.c(0)) ?: return@mapNotNull null
                val ed = ScheduleParse.date(r.c(1)) ?: sd
                val st = ScheduleParse.time(r.c(2)) ?: return@mapNotNull null
                val et = ScheduleParse.time(r.c(3)) ?: return@mapNotNull null
                val mode = Mode.parse(r.c(5)) ?: return@mapNotNull null
                SpecialRow(sd, ed, st, et, r.c(4).ifEmpty { "ALL" }, mode, r.c(6), r.c(7), r.c(8))
            }

            val weekly = rows(WEEKLY).mapNotNull { r ->
                val days = ScheduleParse.days(r.c(0)).takeIf { it.isNotEmpty() } ?: return@mapNotNull null
                val st = ScheduleParse.time(r.c(1)) ?: return@mapNotNull null
                val et = ScheduleParse.time(r.c(2)) ?: return@mapNotNull null
                val mode = Mode.parse(r.c(4)) ?: return@mapNotNull null
                WeeklyRow(days, st, et, r.c(3).ifEmpty { "ALL" }, mode, r.c(5), r.c(6), r.c(7))
            }

            val live = rows(LIVE).filter { it.c(0).isNotEmpty() || it.c(2).isNotEmpty() }.map { r ->
                LiveFeed(r.c(0), r.c(1), r.c(2), bool(r.c(3)))
            }

            return SheetData(devices, themes, folders, override, special, weekly, live, parseGreenRoom(rows(GREEN_ROOM)))
        }
    }
}
