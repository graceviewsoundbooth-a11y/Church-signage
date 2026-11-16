package org.graceview.tv.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Test

/** Devices columns N/O "Wayfinding Left/Right" (added 2026-11-13) against the theme's G/H. */
class WayfindingTest {
    private val church = Theme.FALLBACK.copy(
        name = "Church",
        wayLeft = listOf("Sanctuary", "Restrooms"),
        wayRight = listOf("Kids", "Offices"),
    )
    private fun tv(left: String, right: String) =
        Device("Coffee Spot", "Signage", "Church", "Church", "", 10, false, wayLeft = left, wayRight = right)

    @Test fun blankKeepsTheTheme() {
        assertSame(church, tv("", "  ").withWayfinding(church))
    }

    @Test fun noneHidesIt() {
        for ((l, r) in listOf("None" to "", "" to "none", "NONE" to "Kids")) {
            val t = tv(l, r).withWayfinding(church)
            assertEquals(emptyList<String>(), t.wayLeft)
            assertEquals(emptyList<String>(), t.wayRight)
        }
    }

    @Test fun deviceTextReplacesTheTheme() {
        val t = tv(" Gym ; Café;; ", "").withWayfinding(church)
        assertEquals(listOf("Gym", "Café"), t.wayLeft)
        assertEquals(emptyList<String>(), t.wayRight)
        assertEquals("Church", t.name)
    }
}
