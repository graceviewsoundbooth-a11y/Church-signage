package org.graceview.tv

import java.time.ZoneId

object Config {
    /** "Graceview TV Schedules and Settings". Change only here when the sheet moves. */
    const val SHEET_ID = "1VffKvU_jcE51LroLZtBH2i5zVwUZU2BSgA2_aDU9kYY"

    val ZONE: ZoneId = ZoneId.of("America/Chicago")

    const val WEATHER_LAT = 30.0972
    const val WEATHER_LON = -95.6161
    const val WEATHER_PLACE = "Tomball"

    const val SHEET_POLL_MS = 3 * 60_000L
    /** Override Now alone is checked this often, so an emergency message reaches the TVs fast. */
    const val OVERRIDE_POLL_MS = 30_000L
    const val DRIVE_SYNC_MS = 10 * 60_000L
    const val CALENDAR_MS = 15 * 60_000L
    const val WEATHER_MS = 30 * 60_000L
    const val RETRY_MS = 2 * 60_000L

    /** Watch Live detection. The live page is ~290 KB, so it's checked often only when a stream is likely. */
    const val LIVE_TICK_MS = 60_000L
    const val LIVE_PAGE_IDLE_MS = 15 * 60_000L
    const val LIVE_RECENT_HOURS = 6L

    /** Longest any one announcement stays up. Images show this long; videos end early or get cut here. */
    const val SLIDE_MAX_MS = 12_000L

    /**
     * Themes Calendar cell with several calendars ("school; church"): when the first has fewer
     * than CALENDAR_MIN_EVENTS in the next 7 days, the others fill the list up to CALENDAR_FILL_TO.
     */
    const val CALENDAR_MIN_EVENTS = 3
    const val CALENDAR_FILL_TO = 4

    /** A video whose file name contains this tag (any case) plays to its end (decided 2026-11-13). */
    const val FULL_VIDEO_TAG = "[full]"

    /** Safety cap for "[full]" videos, in case one is very long or never reports its end. */
    const val FULL_VIDEO_MAX_MS = 180_000L

    /** How long one announcement may stay up: 12 s, or up to 3 minutes for a "[full]" video. */
    fun slideMaxMs(name: String, video: Boolean) =
        if (video && name.contains(FULL_VIDEO_TAG, ignoreCase = true)) FULL_VIDEO_MAX_MS else SLIDE_MAX_MS

    const val NO_EVENTS_TEXT = "See all events at graceview.org"

    /**
     * The Google API key, from local.properties at build time. Each app sets it at startup (the TV
     * app from BuildConfig in GraceviewApplication, the desktop app from its generated BuildInfo).
     */
    @Volatile var API_KEY: String = ""

    /**
     * Church Signage: the dashboard's web app address (the lab's Apps Script "/exec" URL). The TV
     * app sets it at startup from BuildConfig (local.properties "lab.url", or the lab's address).
     */
    @Volatile var LAB_URL: String = ""

    /** How often a paired TV asks the dashboard for its setup. Override Now reaches it this fast. */
    const val LAB_POLL_MS = 15_000L

    /** How often a screen showing a pairing code asks whether it has been paired. */
    const val PAIR_POLL_MS = 4_000L
}
