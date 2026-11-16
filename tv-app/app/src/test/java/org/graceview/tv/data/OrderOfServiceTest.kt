package org.graceview.tv.data

import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZonedDateTime

class OrderOfServiceTest {
    private val zone = ZoneId.of("America/Chicago")
    private val start = ZonedDateTime.of(2026, 11, 8, 10, 30, 0, 0, zone)
    private val plan = Plan(
        title = "Worship Service", date = LocalDate.of(2026, 11, 8), serviceStart = start,
        items = listOf(
            PlanItem("Pre-Service", "header", 0, "", "pre"),
            PlanItem("Countdown Slides/Video", "media", 600, "", "pre"),
            PlanItem("Opening Worship", "header", 0, "", "during"),
            PlanItem("Made For More", "song", 369, "C", "during"),
            PlanItem("Welcome", "item", 60, "", "during"),
            PlanItem("Back To Life", "song", 254, "B", "during"),
        ),
        people = emptyList(), notes = emptyList(), updatedAt = 0L,
    )

    private fun times(rows: List<OosRow>) = rows.map { it.start?.toLocalTime()?.toString() }

    @Test
    fun keepsPlanOrderAndPreServiceEndsAtServiceTime() {
        val rows = GreenRoomLogic.orderOfService(plan, start.minusHours(1), emptyList())
        assertEquals(plan.items.map { it.title }, rows.map { it.title })
        assertEquals(listOf(null, "10:20", null, "10:30", "10:36:09", "10:37:09"), times(rows))
    }

    @Test
    fun proPresenterPlaylistItemSetsNow() {
        // Clock says Made For More, but ProPresenter is on Welcome.
        val rows = GreenRoomLogic.orderOfService(plan, start.plusMinutes(2), listOf("Welcome", "Some Presentation"))
        assertEquals(ItemState.Now, rows[4].state)
        assertEquals(ItemState.Done, rows[3].state)
        assertEquals(ItemState.Upcoming, rows[5].state)
    }

    @Test
    fun numberedVocalPositionsFillHandhelds() {
        val p = plan.copy(people = listOf(
            PlanPerson("Robert Santana", "2 Second", "Worship", "C", ""),
            PlanPerson("Colleen Dyson", "3 Third", "Worship", "C", ""),
            PlanPerson("Rick Kingham", "Drums", "Worship", "C", ""),
            PlanPerson("Declined Person", "1 First", "Worship", "D", ""),
            PlanPerson("Larry Womack", "Pastor", "Speakers", "C", ""),
        ))
        val settings = GreenRoomSettings(
            micSource = "Position name",
            micMap = listOf(
                MicMapRow("HH 1", null, ""), MicMapRow("HH 2", null, ""), MicMapRow("HH 3", null, ""),
                MicMapRow("HS 1", null, "", "pastor"),
            ),
        )
        val mics = GreenRoomLogic.mics(settings, p, null)
        assertEquals(listOf("", "Robert Santana", "Colleen Dyson", "Larry Womack"), mics.map { it.name })
        assertEquals(listOf("", "2 Second", "3 Third", "Pastor"), mics.map { it.role })
    }

    @Test
    fun clockSetsNowWithoutProPresenter() {
        val rows = GreenRoomLogic.orderOfService(plan, start.plusMinutes(2), emptyList())
        assertEquals(ItemState.Now, rows[3].state)
    }
}
