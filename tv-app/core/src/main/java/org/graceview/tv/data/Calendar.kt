package org.graceview.tv.data

import biweekly.Biweekly
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import org.graceview.tv.Config
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.util.Date
import java.util.Locale
import java.util.TimeZone

data class CalEvent(val start: ZonedDateTime, val allDay: Boolean, val title: String, val end: ZonedDateTime? = null) {
    /**
     * "Thu · 6:00–7:30 PM", "Sun · 11:00 AM–12:30 PM", or just the start when there's no
     * end time, the end is on another day, or it's an all-day event.
     */
    fun label(): String {
        val day = start.format(DAY)
        if (allDay) return "$day · All Day"
        val e = end
        if (e == null || !e.isAfter(start) || e.toLocalDate() != start.toLocalDate()) return "$day · ${start.format(TIME)}"
        val from = if (start.format(AMPM) == e.format(AMPM)) start.format(HM) else start.format(TIME)
        return "$day · $from–${e.format(TIME)}"
    }

    companion object {
        private val DAY = DateTimeFormatter.ofPattern("EEE", Locale.US)
        private val TIME = DateTimeFormatter.ofPattern("h:mm a", Locale.US)
        private val HM = DateTimeFormatter.ofPattern("h:mm", Locale.US)
        private val AMPM = DateTimeFormatter.ofPattern("a", Locale.US)
    }
}

@Serializable private data class GTime(val dateTime: String? = null, val date: String? = null)
@Serializable private data class GEvent(val summary: String? = null, val start: GTime? = null, val end: GTime? = null, val status: String? = null)
@Serializable private data class GList(val items: List<GEvent> = emptyList())

/**
 * The Themes "Calendar" cell holds either a webcal/ICS link or a public Google Calendar ID.
 * Returns events starting in the next 7 days, minus the hide list, sorted by start.
 */
object CalendarRepo {
    fun isLink(value: String) = Regex("^(webcal|https?)://", RegexOption.IGNORE_CASE).containsMatchIn(value.trim())

    /** The cell may list several calendars separated by ";", first = main, the rest = fallbacks. */
    fun sources(value: String): List<String> = value.split(';').map { it.trim() }.filter { it.isNotEmpty() }

    /**
     * Events from the first calendar. When it has fewer than Config.CALENDAR_MIN_EVENTS, the next
     * calendars fill the list up to Config.CALENDAR_FILL_TO (decided 2026-11-18: the school's
     * Brightwheel calendar, then the church's). Fallbacks are only fetched when needed; a failed
     * fallback is skipped, and the fetch fails only when the first calendar fails and no fallback works.
     */
    suspend fun fetch(value: String, hide: List<String>): List<CalEvent> {
        val now = ZonedDateTime.now(Config.ZONE)
        val end = now.plusDays(7)
        val lists = mutableListOf<List<CalEvent>>()
        var firstError: Exception? = null
        for ((i, src) in sources(value).withIndex()) {
            if (i > 0 && lists.sumOf { it.size } >= Config.CALENDAR_MIN_EVENTS) break
            try {
                lists += fetchOne(src, now, end).filter { ev -> hide.none { h -> ev.title.contains(h, ignoreCase = true) } }
            } catch (e: Exception) {
                if (i == 0) firstError = e
            }
        }
        if (lists.isEmpty()) throw firstError ?: IllegalStateException("No calendar")
        return combine(lists)
    }

    /** Every event of the first list, topped up from the next lists, sorted by start. */
    fun combine(lists: List<List<CalEvent>>): List<CalEvent> {
        val out = lists.firstOrNull()?.sortedBy { it.start }?.toMutableList() ?: return emptyList()
        for (more in lists.drop(1)) {
            if (out.size >= Config.CALENDAR_MIN_EVENTS) break
            val seen = out.map { it.title.lowercase() to it.start }.toSet()
            out += more.sortedBy { it.start }
                .filter { (it.title.lowercase() to it.start) !in seen }
                .take(Config.CALENDAR_FILL_TO - out.size)
        }
        return out.sortedBy { it.start }
    }

    private suspend fun fetchOne(value: String, now: ZonedDateTime, end: ZonedDateTime): List<CalEvent> =
        if (isLink(value)) {
            val url = value.replaceFirst(Regex("^webcal://", RegexOption.IGNORE_CASE), "https://")
            val text = Net.getString(url)
            withContext(Dispatchers.Default) { fromIcs(text, now, end) }
        } else {
            fromGoogle(value, now, end)
        }

    private fun fromIcs(text: String, now: ZonedDateTime, end: ZonedDateTime): List<CalEvent> {
        val zone = Config.ZONE
        val tz = TimeZone.getTimeZone(zone)
        val today = now.toLocalDate()
        val lastDay = end.toLocalDate()
        val out = mutableListOf<CalEvent>()

        fun addAllDay(d: LocalDate, title: String) {
            if (!d.isBefore(today) && d.isBefore(lastDay)) out += CalEvent(d.atStartOfDay(zone), true, title)
        }
        fun addTimed(z: ZonedDateTime, title: String, lengthMs: Long) {
            val e = if (lengthMs > 0) z.plusNanos(lengthMs * 1_000_000) else null
            if (!z.isBefore(now) && z.isBefore(end)) out += CalEvent(z, false, title, e)
        }

        for (cal in Biweekly.parse(text).all()) {
            // Instances replaced by a RECURRENCE-ID override, keyed by UID + original start.
            val overridden = cal.events.mapNotNull { e ->
                val uid = e.uid?.value
                val rid = e.recurrenceId?.value
                if (uid != null && rid != null) uid to rid.time else null
            }.toSet()

            for (e in cal.events) {
                val title = e.summary?.value?.trim().orEmpty()
                if (title.isEmpty()) continue
                val start = e.dateStart?.value ?: continue
                val allDay = !start.hasTime()
                val recurring = e.recurrenceRule != null || e.recurrenceDates.isNotEmpty()
                // Event length from DTEND, or DURATION; 0 when neither is given.
                val lengthMs = e.dateEnd?.value?.let { it.time - start.time }
                    ?: e.duration?.value?.toMillis()
                    ?: 0L

                if (!recurring) {
                    val rc = start.rawComponents
                    when {
                        allDay && rc != null -> addAllDay(LocalDate.of(rc.year, rc.month, rc.date), title)
                        allDay -> addAllDay(start.toInstant().atZone(zone).toLocalDate(), title)
                        // Floating time (no TZID, no Z): treat as Chicago local time.
                        rc != null && !rc.isUtc && e.dateStart.parameters.timezoneId == null ->
                            addTimed(ZonedDateTime.of(rc.year, rc.month, rc.date, rc.hour, rc.minute, rc.second, 0, zone), title, lengthMs)
                        else -> addTimed(start.toInstant().atZone(zone), title, lengthMs)
                    }
                    continue
                }

                val uid = e.uid?.value
                val it = e.getDateIterator(tz)
                it.advanceTo(Date.from(now.minusDays(1).toInstant()))
                var guard = 0
                while (it.hasNext() && guard++ < 1000) {
                    val d = it.next()
                    if (d.toInstant().isAfter(end.toInstant())) break
                    if (uid != null && (uid to d.time) in overridden) continue
                    val z = d.toInstant().atZone(zone)
                    if (allDay) addAllDay(z.toLocalDate(), title) else addTimed(z, title, lengthMs)
                }
            }
        }
        return out
    }

    private suspend fun fromGoogle(id: String, now: ZonedDateTime, end: ZonedDateTime): List<CalEvent> {
        val url = "https://www.googleapis.com/calendar/v3/calendars/${Net.enc(id)}/events" +
            "?singleEvents=true&orderBy=startTime&maxResults=50" +
            "&timeMin=" + Net.enc(now.toOffsetDateTime().toString()) +
            "&timeMax=" + Net.enc(end.toOffsetDateTime().toString()) +
            "&key=${Config.API_KEY}"
        val list = Net.json.decodeFromString<GList>(Net.getString(url))
        return list.items.filter { it.status != "cancelled" }.mapNotNull { g ->
            val title = g.summary?.trim().orEmpty()
            if (title.isEmpty()) return@mapNotNull null
            val s = g.start ?: return@mapNotNull null
            when {
                s.dateTime != null -> {
                    val z = OffsetDateTime.parse(s.dateTime).atZoneSameInstant(Config.ZONE)
                    val e = g.end?.dateTime?.let { runCatching { OffsetDateTime.parse(it).atZoneSameInstant(Config.ZONE) }.getOrNull() }
                    if (z.isBefore(now)) null else CalEvent(z, false, title, e)
                }
                s.date != null -> CalEvent(LocalDate.parse(s.date).atStartOfDay(Config.ZONE), true, title)
                else -> null
            }
        }
    }
}
