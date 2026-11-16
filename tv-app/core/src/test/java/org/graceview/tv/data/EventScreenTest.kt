package org.graceview.tv.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.ZoneId
import java.time.ZonedDateTime

/** Devices column P "Default Mode" (2026-11-15) and the shared color parser that replaced Android's. */
class EventScreenTest {
    private val zone = ZoneId.of("America/Chicago")
    private fun screen(defaultMode: String) =
        Device("Event Screen", "Signage", "Special Events", "Special Events", "", null, false, defaultMode = defaultMode)
    private val lobby = Device("Lobby", "Signage", "Church", "Church", "", 10, true, defaultMode = "Fullscreen")
    private val data = SheetData(listOf(screen("")), emptyList(), emptyList())
    private val monday3am = ZonedDateTime.of(2026, 11, 16, 3, 0, 0, 0, zone)

    @Test fun nothingScheduledShowsTheDefaultMode() {
        for ((cell, mode) in listOf("" to Mode.Signage, "Fullscreen" to Mode.Fullscreen, "Live" to Mode.Live, "nonsense" to Mode.Signage)) {
            val d = screen(cell)
            val s = Scheduler(data, d, d.idleMode).stateAt(monday3am)
            assertEquals(cell, mode, s.mode)
            assertEquals("Special Events", s.theme)
        }
    }

    @Test fun tvsStillGoOffAndIgnoreColumnP() {
        assertEquals(Mode.Off, Scheduler(data, lobby).stateAt(monday3am).mode)
    }

    @Test fun overrideStillWins() {
        val d = screen("Fullscreen")
        val withOverride = data.copy(override = OverrideNow(true, "Event Screen", Mode.Live, "", ""))
        assertEquals(Mode.Live, Scheduler(withOverride, d, d.idleMode).stateAt(monday3am).mode)
    }

    @Test fun colorsParseLikeAndroid() {
        assertEquals(0xFFCF2020.toInt(), SheetRepo.parseColor("#CF2020"))
        assertEquals(0xFFB6562A.toInt(), SheetRepo.parseColor(" #b6562a "))
        assertEquals(0x80FF0000.toInt(), SheetRepo.parseColor("#80FF0000"))
        assertEquals(0xFFFF0000.toInt(), SheetRepo.parseColor("red"))
        assertNull(SheetRepo.parseColor("#ABC"))
        assertNull(SheetRepo.parseColor("#GG0000"))
        assertNull(SheetRepo.parseColor(""))
    }
}
