package org.graceview.tv

import org.junit.Assert.assertEquals
import org.junit.Test

/** CLAUDE.md, Content > Playback (decided 2026-11-04, "[full]" added 2026-11-13). */
class SlideTimingTest {
    @Test fun imagesAndPlainVideosGet12Seconds() {
        assertEquals(12_000L, Config.slideMaxMs("01 Welcome.png", video = false))
        assertEquals(12_000L, Config.slideMaxMs("02 Promo.mp4", video = true))
    }

    @Test fun fullVideosPlayUpTo3Minutes() {
        for (n in listOf("03 Baptism [full].mp4", "[FULL] recap.mp4", "x [Full].MP4")) {
            assertEquals(n, 180_000L, Config.slideMaxMs(n, video = true))
        }
    }

    @Test fun theTagDoesNothingOnImages() {
        assertEquals(12_000L, Config.slideMaxMs("04 Poster [full].jpg", video = false))
    }

    @Test fun onlyTheBracketedTagCounts() {
        assertEquals(12_000L, Config.slideMaxMs("05 Full house.mp4", video = true))
    }
}
