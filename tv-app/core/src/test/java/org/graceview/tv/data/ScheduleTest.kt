package org.graceview.tv.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZonedDateTime

/**
 * The schedule rules from CLAUDE.md ("Resolving what a TV shows right now"), checked against the
 * Lobby's real Weekly rows as they were in the production Sheet on 2026-11-13.
 */
class ScheduleTest {
    private val zone = ZoneId.of("America/Chicago")
    private val lobby = Device("Lobby", "Signage", "Church", "Church", "", 10, true)
    private val room101 = Device("Room 101", "Classroom", "Church", "Church", "", null, false)
    private val greenRoom = Device("Green Room", "Green Room", "Church", "Church", "", null, false)

    private fun t(s: String) = ScheduleParse.time(s)!!
    private fun weekly(day: String, start: String, end: String, devices: String, mode: Mode, theme: String = "Church", folder: String = "Church", note: String = "") =
        WeeklyRow(ScheduleParse.days(day), t(start), t(end), devices, mode, theme, folder, note)

    private val lobbyWeek = listOf(
        weekly("Weekdays", "7:00 AM", "6:00 PM", "Lobby", Mode.Signage),
        weekly("Thu", "6:00 PM", "9:00 PM", "Lobby", Mode.Signage, note = "Thursday night"),
        weekly("Sun", "7:30 AM", "10:00 AM", "Lobby", Mode.Signage),
        weekly("Sun", "10:00 AM", "10:30 AM", "Lobby", Mode.Countdown, note = "Counts down to 10:30 service"),
        weekly("Sun", "10:30 AM", "12:00 PM", "Lobby", Mode.Live, folder = "", note = "Sunday service"),
        weekly("Sun", "12:00 PM", "1:00 PM", "Lobby", Mode.Signage),
        weekly("Sun", "10:30 AM", "12:00 PM", "CLASSROOMS", Mode.LiveOption),
    )

    private fun data(
        weekly: List<WeeklyRow> = lobbyWeek,
        special: List<SpecialRow> = emptyList(),
        override: OverrideNow? = null,
    ) = SheetData(listOf(lobby, room101, greenRoom), emptyList(), emptyList(), override, special, weekly)

    // 2026-11-15 is a Sunday, 2026-11-19 a Thursday, 2026-11-20 a Friday, 2026-11-21 a Saturday.
    private fun at(date: String, time: String) = LocalDate.parse(date).atTime(t(time)).atZone(zone)
    private fun mode(device: Device, date: String, time: String, d: SheetData = data()) = Scheduler(d, device).stateAt(at(date, time)).mode

    @Test
    fun sundayRunsSignageCountdownLiveSignageThenOff() {
        val day = "2026-11-15"
        assertEquals(Mode.Off, mode(lobby, day, "7:29 AM"))
        assertEquals(Mode.Signage, mode(lobby, day, "7:30 AM"))
        assertEquals(Mode.Countdown, mode(lobby, day, "10:00 AM"))
        assertEquals(Mode.Live, mode(lobby, day, "10:30 AM"))
        assertEquals(Mode.Live, mode(lobby, day, "11:59 AM"))
        assertEquals(Mode.Signage, mode(lobby, day, "12:00 PM"))
        assertEquals(Mode.Off, mode(lobby, day, "1:00 PM"))
    }

    @Test
    fun countdownEndsAtTheServiceTime() {
        val s = Scheduler(data(), lobby).stateAt(at("2026-11-15", "10:05 AM"))
        assertEquals(at("2026-11-15", "10:30 AM"), s.end)
        assertEquals("Weekly", s.source)
    }

    @Test
    fun endIsExclusiveAndStartInclusive() {
        assertEquals(Mode.Signage, mode(lobby, "2026-11-20", "7:00 AM"))
        assertEquals(Mode.Signage, mode(lobby, "2026-11-20", "5:59 PM"))
        assertEquals(Mode.Off, mode(lobby, "2026-11-20", "6:00 PM"))
    }

    @Test
    fun thursdayNightAndSaturday() {
        assertEquals(Mode.Signage, mode(lobby, "2026-11-19", "6:00 PM"))
        assertEquals(Mode.Off, mode(lobby, "2026-11-19", "9:00 PM"))
        assertEquals(Mode.Off, mode(lobby, "2026-11-21", "11:00 AM"))
    }

    @Test
    fun blankFolderFallsBackToTheDeviceDefault() {
        val s = Scheduler(data(), lobby).stateAt(at("2026-11-15", "10:45 AM"))
        assertEquals("Church", s.folder)
        assertEquals("Sunday service", s.note)
    }

    @Test
    fun overrideBeatsEverythingButOnlyForMatchingDevices() {
        val ov = OverrideNow(true, "Lobby", Mode.Message, "", "Closed today")
        val d = data(override = ov)
        val s = Scheduler(d, lobby).stateAt(at("2026-11-15", "10:45 AM"))
        assertEquals(Mode.Message, s.mode)
        assertEquals("Closed today", s.message)
        assertEquals("Church", s.theme)
        assertEquals(Mode.LiveOption, mode(room101, "2026-11-15", "10:45 AM", d))
        // Unchecked Active: the normal schedule.
        assertEquals(Mode.Live, mode(lobby, "2026-11-15", "10:45 AM", data(override = ov.copy(active = false))))
    }

    @Test
    fun specialDatesBeatWeeklyInsideTheirRangeOnly() {
        val christmas = SpecialRow(
            LocalDate.parse("2026-12-20"), LocalDate.parse("2026-12-27"), t("7:00 AM"), t("9:00 PM"),
            "ALL SIGNAGE", Mode.Fullscreen, "Christmas", "Christmas", "",
        )
        val d = data(special = listOf(christmas))
        val sunday = Scheduler(d, lobby).stateAt(at("2026-12-20", "10:45 AM"))
        assertEquals(Mode.Fullscreen, sunday.mode)
        assertEquals("Christmas", sunday.theme)
        assertEquals("Special Dates", sunday.source)
        // The day after the range: back to Weekly.
        assertEquals(Mode.Signage, mode(lobby, "2026-12-28", "10:00 AM", d))
        // ALL SIGNAGE doesn't include classrooms.
        assertEquals(Mode.Launcher, mode(room101, "2026-12-21", "10:00 AM", d))
    }

    @Test
    fun targetsMatchTheRightDevices() {
        val d = data()
        assertTrue(Scheduler(d, lobby).matches("ALL"))
        assertTrue(Scheduler(d, lobby).matches("all signage"))
        assertTrue(Scheduler(d, lobby).matches(" lobby "))
        assertFalse(Scheduler(d, lobby).matches("CLASSROOMS"))
        assertTrue(Scheduler(d, room101).matches("CLASSROOMS"))
        assertFalse(Scheduler(d, room101).matches("ALL SIGNAGE"))
        // Decided 2026-11-05: CLASSROOMS matches Classroom only, not the Green Room.
        assertFalse(Scheduler(d, greenRoom).matches("CLASSROOMS"))
        assertFalse(Scheduler(d, greenRoom).matches("ALL SIGNAGE"))
        // The dashboard saves several TVs as one comma-separated cell.
        assertTrue(Scheduler(d, lobby).matches("Lobby, Coffee Spot"))
        assertTrue(Scheduler(d, lobby).matches("Coffee Spot,Lobby"))
        assertFalse(Scheduler(d, lobby).matches("Coffee Spot, Front Office"))
        assertFalse(Scheduler(d, lobby).matches(""))
        assertTrue(Scheduler(d, room101).matches("Lobby, CLASSROOMS"))
    }

    @Test
    fun fallbackIsOffForSignageAndGreenRoomAndLauncherForClassrooms() {
        val day = "2026-11-21"
        assertEquals(Mode.Off, mode(lobby, day, "10:00 AM"))
        assertEquals(Mode.Off, mode(greenRoom, day, "10:00 AM"))
        assertEquals(Mode.Launcher, mode(room101, day, "10:00 AM"))
    }

    @Test
    fun windowsCanRunPastMidnight() {
        val d = data(weekly = listOf(weekly("Fri", "10:00 PM", "2:00 AM", "Lobby", Mode.Fullscreen)))
        assertEquals(Mode.Fullscreen, mode(lobby, "2026-11-20", "11:30 PM", d))
        assertEquals(Mode.Fullscreen, mode(lobby, "2026-11-21", "1:59 AM", d))
        assertEquals(Mode.Off, mode(lobby, "2026-11-21", "2:00 AM", d))
    }

    @Test
    fun nextChangeFindsTheNextVisibleTransition() {
        val s = Scheduler(data(), lobby)
        assertEquals(at("2026-11-15", "10:00 AM"), s.nextChange(at("2026-11-15", "9:00 AM")))
        assertEquals(at("2026-11-15", "1:00 PM"), s.nextChange(at("2026-11-15", "12:30 PM")))
        // Saturday morning: next is Sunday 7:30 AM.
        assertEquals(at("2026-11-15", "7:30 AM"), s.nextChange(at("2026-11-14", "8:00 AM")))
        assertNull(Scheduler(data(weekly = emptyList()), lobby).nextChange(at("2026-11-15", "9:00 AM")))
    }

    @Test
    fun parsesSheetTimesDaysAndModes() {
        assertEquals(LocalTime.of(7, 30), ScheduleParse.time("7:30 AM"))
        assertEquals(LocalTime.of(19, 0), ScheduleParse.time("19:00"))
        assertEquals(LocalTime.of(12, 0), ScheduleParse.time("12:00 pm"))
        assertNull(ScheduleParse.time(""))
        assertEquals(5, ScheduleParse.days("Weekdays").size)
        assertEquals(setOf(DayOfWeek.THURSDAY), ScheduleParse.days("Thu"))
        assertTrue(ScheduleParse.days("Someday").isEmpty())
        assertEquals(LocalDate.of(2026, 12, 25), ScheduleParse.date("12/25/2026"))
        assertEquals(Mode.LiveOption, Mode.parse("Live Option"))
        assertEquals(Mode.Fullscreen, Mode.parse("Full Screen"))
        assertNull(Mode.parse("Party"))
    }

    @Test
    fun utcTimesConvertToChicagoTime() {
        // A UTC timestamp converts to Chicago time before matching: 16:45 UTC = 10:45 AM CST.
        val utc = ZonedDateTime.of(2026, 11, 15, 16, 45, 0, 0, ZoneId.of("UTC")).withZoneSameInstant(zone)
        assertEquals(Mode.Live, Scheduler(data(), lobby).stateAt(utc).mode)
    }
}
