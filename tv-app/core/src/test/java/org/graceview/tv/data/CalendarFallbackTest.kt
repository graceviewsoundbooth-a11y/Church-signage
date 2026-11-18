package org.graceview.tv.data

import org.graceview.tv.Config
import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.ZonedDateTime

class CalendarFallbackTest {
    private val base = ZonedDateTime.of(2026, 11, 18, 8, 0, 0, 0, Config.ZONE)
    private fun ev(title: String, hours: Long) = CalEvent(base.plusHours(hours), false, title)

    @Test fun sourcesSplitOnSemicolons() {
        assertEquals(listOf("https://a.ics", "webcal://b"), CalendarRepo.sources(" https://a.ics ;webcal://b; "))
        assertEquals(listOf("abc@group.calendar.google.com"), CalendarRepo.sources("abc@group.calendar.google.com"))
    }

    @Test fun enoughSchoolEventsUsesNoFallback() {
        val school = listOf(ev("Chapel", 5), ev("Picture Day", 1), ev("Field Trip", 30))
        val out = CalendarRepo.combine(listOf(school, listOf(ev("Choir", 2))))
        assertEquals(listOf("Picture Day", "Chapel", "Field Trip"), out.map { it.title })
    }

    @Test fun fewSchoolEventsFillFromChurchSortedByTime() {
        val school = listOf(ev("Chapel", 20))
        val church = listOf(ev("Choir", 2), ev("Bible Study", 10), ev("Youth", 40), ev("Men's Breakfast", 50))
        val out = CalendarRepo.combine(listOf(school, church))
        // All school events stay; the church's earliest fill up to 4.
        assertEquals(listOf("Choir", "Bible Study", "Chapel", "Youth"), out.map { it.title })
    }

    @Test fun duplicateInBothCalendarsShowsOnce() {
        val school = listOf(ev("Thanksgiving Chapel", 3))
        val church = listOf(ev("thanksgiving chapel", 3), ev("Choir", 4))
        assertEquals(listOf("Thanksgiving Chapel", "Choir"), CalendarRepo.combine(listOf(school, church)).map { it.title })
    }

    @Test fun noSchoolEventsAllFromChurch() {
        val church = (1..6L).map { ev("Event $it", it) }
        assertEquals(4, CalendarRepo.combine(listOf(emptyList(), church)).size)
    }
}
