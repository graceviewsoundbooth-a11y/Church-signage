package org.graceview.tv.data

import org.graceview.tv.Config
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale

enum class Mode(val label: String) {
    Signage("signage"),
    Fullscreen("full-screen announcements"),
    Countdown("the countdown"),
    Live("the live service"),
    LiveOption("the home screen"),
    Launcher("the home screen"),
    Message("an announcement"),
    /** Green Room: opens the Green Room Dashboard. Other TVs treat it as Launcher. */
    Dashboard("the dashboard"),
    Off("off");

    companion object {
        fun parse(s: String): Mode? = when (s.trim().lowercase(Locale.US)) {
            "signage" -> Signage
            "fullscreen", "full screen" -> Fullscreen
            "countdown" -> Countdown
            "live" -> Live
            "live option" -> LiveOption
            "launcher" -> Launcher
            "message" -> Message
            "dashboard" -> Dashboard
            "off" -> Off
            else -> null
        }
    }
}

data class OverrideNow(val active: Boolean, val devices: String, val mode: Mode, val theme: String, val message: String)

data class SpecialRow(
    val startDate: LocalDate, val endDate: LocalDate, val start: LocalTime, val end: LocalTime,
    val devices: String, val mode: Mode, val theme: String, val folder: String, val note: String,
)

data class WeeklyRow(
    val days: Set<DayOfWeek>, val start: LocalTime, val end: LocalTime,
    val devices: String, val mode: Mode, val theme: String, val folder: String, val note: String,
)

data class LiveFeed(val name: String, val type: String, val address: String, val active: Boolean) {
    val isYouTube get() = type.equals("YouTube", ignoreCase = true)
}

/** What a TV should be showing at one moment, and why. */
data class ScheduleState(
    val mode: Mode,
    val theme: String,
    val folder: String,
    val message: String,
    val note: String,
    val end: ZonedDateTime?,
    val source: String,
) {
    /**
     * Two states with the same key look the same on screen, so moving between them is not a
     * transition. The end time only matters for Countdown, where it's shown.
     */
    val key: String get() = listOf(mode.name, theme.lowercase(), folder.lowercase(), message, if (mode == Mode.Countdown) end?.toString() else "").joinToString("|")
}

object ScheduleParse {
    private val TIME_FORMATS = listOf("h:mm a", "h:mm:ss a", "h a", "H:mm", "H:mm:ss").map { DateTimeFormatter.ofPattern(it, Locale.US) }
    private val DATE_FORMATS = listOf("M/d/yyyy", "M/d/yy", "yyyy-MM-dd").map { DateTimeFormatter.ofPattern(it, Locale.US) }

    fun time(s: String): LocalTime? {
        val t = s.trim().uppercase(Locale.US)
        if (t.isEmpty()) return null
        for (f in TIME_FORMATS) runCatching { return LocalTime.parse(t, f) }
        return null
    }

    fun date(s: String): LocalDate? {
        val t = s.trim()
        if (t.isEmpty()) return null
        for (f in DATE_FORMATS) runCatching { return LocalDate.parse(t, f) }
        return null
    }

    fun days(s: String): Set<DayOfWeek> = when (s.trim().lowercase(Locale.US)) {
        "daily" -> DayOfWeek.entries.toSet()
        "weekdays" -> setOf(DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY, DayOfWeek.THURSDAY, DayOfWeek.FRIDAY)
        "weekends" -> setOf(DayOfWeek.SATURDAY, DayOfWeek.SUNDAY)
        "sun", "sunday" -> setOf(DayOfWeek.SUNDAY)
        "mon", "monday" -> setOf(DayOfWeek.MONDAY)
        "tue", "tues", "tuesday" -> setOf(DayOfWeek.TUESDAY)
        "wed", "wednesday" -> setOf(DayOfWeek.WEDNESDAY)
        "thu", "thur", "thurs", "thursday" -> setOf(DayOfWeek.THURSDAY)
        "fri", "friday" -> setOf(DayOfWeek.FRIDAY)
        "sat", "saturday" -> setOf(DayOfWeek.SATURDAY)
        else -> emptySet()
    }
}

/** Applies the precedence rules from CLAUDE.md: Override Now, then Special Dates, then Weekly, then the fallback. */
class Scheduler(
    private val data: SheetData,
    private val device: Device,
    /**
     * What to show when nothing matches, instead of Off/Launcher. The Event Screen desktop app
     * passes the device's Default Mode (Devices column P); TVs leave it null.
     */
    private val idleMode: Mode? = null,
) {
    private val zone get() = Config.ZONE // the church's zone, which the dashboard can change

    fun matches(target: String): Boolean = when (target.trim().uppercase(Locale.US)) {
        "ALL" -> true
        "ALL SIGNAGE" -> device.isSignage
        "CLASSROOMS" -> device.isClassroom
        else -> target.trim().equals(device.name, ignoreCase = true)
    }

    /** Start inclusive, end exclusive. An end at or before the start runs past midnight. */
    private fun window(day: LocalDate, start: LocalTime, end: LocalTime): Pair<ZonedDateTime, ZonedDateTime> {
        val s = day.atTime(start).atZone(zone)
        var e = day.atTime(end).atZone(zone)
        if (!e.isAfter(s)) e = e.plusDays(1)
        return s to e
    }

    fun stateAt(now: ZonedDateTime): ScheduleState {
        val o = data.override
        if (o != null && o.active && matches(o.devices)) {
            return ScheduleState(o.mode, o.theme.ifBlank { device.defaultTheme }, device.defaultFolder, o.message, "", null, "Override Now")
        }

        val today = now.toLocalDate()
        for (r in data.special) {
            if (!matches(r.devices)) continue
            for (d in listOf(today, today.minusDays(1))) {
                if (d.isBefore(r.startDate) || d.isAfter(r.endDate)) continue
                val (s, e) = window(d, r.start, r.end)
                if (!now.isBefore(s) && now.isBefore(e)) return state(r.mode, r.theme, r.folder, r.note, e, "Special Dates")
            }
        }

        for (r in data.weekly) {
            if (!matches(r.devices)) continue
            for (d in listOf(today, today.minusDays(1))) {
                if (d.dayOfWeek !in r.days) continue
                val (s, e) = window(d, r.start, r.end)
                if (!now.isBefore(s) && now.isBefore(e)) return state(r.mode, r.theme, r.folder, r.note, e, "Weekly")
            }
        }

        // Signage and Green Room are off when nothing is scheduled; classrooms show their home screen.
        val fallback = idleMode ?: if (device.hasScheduledPower) Mode.Off else Mode.Launcher
        return ScheduleState(fallback, device.defaultTheme, device.defaultFolder, "", "", null, "No schedule")
    }

    private fun state(mode: Mode, theme: String, folder: String, note: String, end: ZonedDateTime, source: String) =
        ScheduleState(mode, theme.ifBlank { device.defaultTheme }, folder.ifBlank { device.defaultFolder }, "", note, end, source)

    /** The next moment within 8 days when what this TV shows actually changes, or null. */
    fun nextChange(now: ZonedDateTime): ZonedDateTime? {
        val current = stateAt(now).key
        val today = now.toLocalDate()
        val times = sortedSetOf<ZonedDateTime>()
        for (offset in -1L..8L) {
            val d = today.plusDays(offset)
            for (r in data.weekly) {
                if (d.dayOfWeek !in r.days || !matches(r.devices)) continue
                val (s, e) = window(d, r.start, r.end)
                times += s; times += e
            }
            for (r in data.special) {
                if (d.isBefore(r.startDate) || d.isAfter(r.endDate) || !matches(r.devices)) continue
                val (s, e) = window(d, r.start, r.end)
                times += s; times += e
            }
        }
        val limit = now.plusDays(8)
        return times.firstOrNull { it.isAfter(now) && !it.isAfter(limit) && stateAt(it).key != current }
    }
}
