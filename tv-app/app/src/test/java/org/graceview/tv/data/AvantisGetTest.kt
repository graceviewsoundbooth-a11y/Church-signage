package org.graceview.tv.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.lang.reflect.Modifier

/**
 * The Avantis hard rule (CLAUDE.md): the app must never send anything that sets or changes the
 * console. These tests prove the client can only produce read-only get messages.
 */
class AvantisGetTest {
    private val header = listOf(0xF0, 0x00, 0x00, 0x1A, 0x50, 0x10, 0x01, 0x00)

    @Test
    fun everyMessageTheFactoryCanBuildIsAGetName() {
        for (base in 1..12) for (input in 1..64) {
            val b = AvantisGet.inputName(base, input).bytes().map { it.toInt() and 0xFF }
            assertEquals(header + listOf(base - 1, 0x01, input - 1, 0xF7), b)
        }
    }

    @Test
    fun onlyGetFunctionsAreAllowed() {
        assertEquals(setOf(0x01), AvantisGet.ALLOWED_FUNCTIONS)
    }

    @Test
    fun setMessagesFromTheProtocolAreRejected() {
        fun bytes(vararg v: Int) = ByteArray(v.size) { v[it].toByte() }
        fun sysex(vararg body: Int) = bytes(*(header + body.toList()).toIntArray())
        val sets = listOf(
            bytes(0x9B, 0x00, 0x7F, 0x9B, 0x00, 0x00),                                   // Mute ON
            bytes(0x9B, 0x00, 0x3F, 0x9B, 0x00, 0x00),                                   // Mute OFF
            bytes(0xBB, 0x63, 0x00, 0xBB, 0x62, 0x17, 0xBB, 0x06, 0x6B),                 // Fader level
            bytes(0xBB, 0x63, 0x00, 0xBB, 0x62, 0x18, 0xBB, 0x06, 0x7F),                 // Main assign
            bytes(0xBB, 0x63, 0x00, 0xBB, 0x62, 0x40, 0xBB, 0x06, 0x40),                 // DCA assign
            bytes(0xBB, 0x00, 0x00, 0xCB, 0x01),                                         // Scene recall
            sysex(0x0B, 0x03, 0x00, 0x41, 0x42, 0xF7),                                   // Set name
            sysex(0x0B, 0x06, 0x00, 0x01, 0xF7),                                         // Set colour
            sysex(0x0B, 0x0D, 0x00, 0x0D, 0x00, 0x6B, 0xF7),                             // Send level
            sysex(0x0B, 0x02, 0x00, 0xF7),                                               // A name reply, not a request
            bytes(0xF0, 0x7F, 0x7F, 0x06, 0x02, 0xF7),                                   // MMC play
        )
        for (m in sets) assertFalse("must reject ${m.joinToString { "%02X".format(it) }}", AvantisGet.isReadOnly(m))
    }

    @Test
    fun aGetNameRequestIsAccepted() {
        assertTrue(AvantisGet.isReadOnly(AvantisGet.inputName(12, 1).bytes()))
    }

    @Test
    fun theOnlyWayToMakeAMessageIsTheReadOnlyFactory() {
        // No public constructor, and every public factory returns an AvantisGet built by inputName.
        // (Kotlin adds a synthetic accessor for the companion; source code can't call it.)
        assertTrue(AvantisGet::class.java.declaredConstructors.filter { !it.isSynthetic }.all { Modifier.isPrivate(it.modifiers) })
        val factories = AvantisGet.Companion::class.java.declaredMethods
            .filter { Modifier.isPublic(it.modifiers) && it.returnType == AvantisGet::class.java }
            .map { it.name }
        assertEquals(listOf("inputName"), factories)
    }

    @Test
    fun theClientsOnlyWritePathTakesAnAvantisGet() {
        // Any method on the client that could write bytes must take an AvantisGet, not raw bytes.
        val writers = AvantisClient::class.java.declaredMethods.filter { m ->
            m.parameterTypes.any { it == java.io.OutputStream::class.java }
        }
        assertTrue(writers.isNotEmpty())
        for (m in writers) {
            assertFalse("${m.name} takes raw bytes", m.parameterTypes.any { it == ByteArray::class.java })
        }
        assertTrue(writers.any { m -> m.parameterTypes.any { it == AvantisGet::class.java } })
    }

    @Test
    fun parserReadsMutesWithRunningStatusAndNames() {
        val events = mutableListOf<MidiParser.Event>()
        val p = MidiParser(12) { events += it }
        // Mute on for inputs 1, 2 (running status), mute off input 3, plus Note Off which is ignored.
        listOf(0x9B, 0x00, 0x7F, 0x01, 0x7F, 0x9B, 0x02, 0x3F, 0x9B, 0x02, 0x00).forEach(p::feed)
        // Name reply for input 5: "HH 1"
        (header + listOf(0x0B, 0x02, 0x04, 0x48, 0x48, 0x20, 0x31, 0xF7)).forEach(p::feed)
        assertEquals(
            listOf(
                MidiParser.Event.Mute(1, true), MidiParser.Event.Mute(2, true), MidiParser.Event.Mute(3, false),
                MidiParser.Event.Name(5, "HH 1"),
            ),
            events,
        )
    }
}
