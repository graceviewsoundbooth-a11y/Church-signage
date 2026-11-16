package org.graceview.tv.data

import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.withContext
import java.io.InputStream
import java.io.OutputStream
import java.net.InetSocketAddress
import java.net.Socket
import kotlin.coroutines.coroutineContext

/**
 * A message the app is allowed to send to the Avantis console. HARD RULE (CLAUDE.md): the app
 * never sends anything that sets or changes the console. The constructor is private and the only
 * factory builds a "Get channel name" request; every instance is re-checked against the read-only
 * whitelist when it's created, so a set message can't exist. AvantisGetTest proves it.
 *
 * Protocol: Allen & Heath "Avantis TCP/IP Protocol, Firmware V1.10", MIDI over TCP port 51325.
 */
class AvantisGet private constructor(bytes: ByteArray) {
    private val data = bytes.copyOf()
    fun bytes(): ByteArray = data.copyOf()

    init {
        check(isReadOnly(data)) { "Refusing to build a message that isn't a read-only get" }
    }

    companion object {
        val SYSEX_HEADER = byteArrayOf(0xF0.toByte(), 0x00, 0x00, 0x1A, 0x50, 0x10, 0x01, 0x00)
        /** SysEx function byte for "Get channel name". The reply uses 0x02; 0x03 would set a name. */
        const val GET_NAME = 0x01
        /** Every function byte the app may send. Only reads. */
        val ALLOWED_FUNCTIONS = setOf(GET_NAME)

        /** Name request for Input [input] (1-64) with the console's base MIDI channel [baseChannel] (1-12). */
        fun inputName(baseChannel: Int, input: Int): AvantisGet {
            require(baseChannel in 1..12) { "Base MIDI channel must be 1-12" }
            require(input in 1..64) { "Input must be 1-64" }
            return AvantisGet(SYSEX_HEADER + byteArrayOf((baseChannel - 1).toByte(), GET_NAME.toByte(), (input - 1).toByte(), 0xF7.toByte()))
        }

        /** True only for a complete SysEx get request in the whitelist. Anything else (Note On, NRPN, set SysEx…) is false. */
        fun isReadOnly(b: ByteArray): Boolean {
            if (b.size != SYSEX_HEADER.size + 4) return false
            for (i in SYSEX_HEADER.indices) if (b[i] != SYSEX_HEADER[i]) return false
            val n = b[8].toInt() and 0xFF
            val fn = b[9].toInt() and 0xFF
            val ch = b[10].toInt() and 0xFF
            return n in 0x00..0x0F && fn in ALLOWED_FUNCTIONS && ch in 0x00..0x7F && (b[11].toInt() and 0xFF) == 0xF7
        }
    }
}

data class AvantisState(
    val connected: Boolean = false,
    /** Input number (1-64) -> muted. Missing = not known yet: the console has no "get mute", it only reports changes. */
    val mutes: Map<Int, Boolean> = emptyMap(),
    /** Input number (1-64) -> channel name from the console. */
    val names: Map<Int, String> = emptyMap(),
    val updatedAt: Long = 0L,
)

/**
 * One persistent connection to the Avantis. Asks for one Mic Map channel's name every 3 seconds
 * (round-robin, so it never bursts) and listens for the mute messages the console sends when a
 * mute changes. Reconnects with backoff.
 */
class AvantisClient(private val host: String, private val baseChannel: Int, private val inputs: List<Int>) {
    private val _state = MutableStateFlow(AvantisState())
    val state: StateFlow<AvantisState> = _state

    suspend fun run() {
        var backoff = 2_000L
        while (coroutineContext.isActive) {
            try {
                withContext(Dispatchers.IO) {
                    Socket().use { s ->
                        // The console is on another subnet behind a router (~1 s round trips seen), so allow 15 s.
                        s.connect(InetSocketAddress(host, PORT), 15_000)
                        s.soTimeout = 3_000
                        backoff = 2_000L
                        _state.value = _state.value.copy(connected = true, updatedAt = System.currentTimeMillis())
                        Log.i(TAG, "Connected to Avantis $host")
                        session(s.getInputStream(), s.getOutputStream())
                    }
                }
            } catch (e: Exception) {
                if (_state.value.connected) Log.w(TAG, "Avantis connection lost", e) else Log.d(TAG, "Avantis not reachable: ${e.message}")
            }
            _state.value = _state.value.copy(connected = false)
            delay(backoff)
            backoff = (backoff * 2).coerceAtMost(60_000L)
        }
    }

    private suspend fun session(input: InputStream, output: OutputStream) {
        val parser = MidiParser(baseChannel) { event ->
            val now = System.currentTimeMillis()
            _state.value = when (event) {
                is MidiParser.Event.Mute -> _state.value.copy(mutes = _state.value.mutes + (event.input to event.muted), updatedAt = now)
                is MidiParser.Event.Name -> _state.value.copy(names = _state.value.names + (event.input to event.name), updatedAt = now)
            }
        }
        val buf = ByteArray(512)
        var next = 0
        var lastAsk = 0L
        while (coroutineContext.isActive) {
            val now = System.currentTimeMillis()
            if (inputs.isNotEmpty() && now - lastAsk >= POLL_MS) {
                lastAsk = now
                send(output, AvantisGet.inputName(baseChannel, inputs[next % inputs.size]))
                next++
            }
            val n = try { input.read(buf) } catch (_: java.net.SocketTimeoutException) { 0 }
            if (n < 0) throw java.io.EOFException("Console closed the connection")
            for (i in 0 until n) parser.feed(buf[i].toInt() and 0xFF)
        }
    }

    /** The only write path. It takes an AvantisGet, which can only be a read-only request. */
    private fun send(out: OutputStream, msg: AvantisGet) {
        out.write(msg.bytes())
        out.flush()
    }

    companion object {
        const val PORT = 51325
        const val POLL_MS = 3_000L
        private const val TAG = "Avantis"
    }
}

/** Reads the console's MIDI stream (with running status) for input mutes and channel-name replies. */
class MidiParser(baseChannel: Int, private val onEvent: (Event) -> Unit) {
    sealed interface Event {
        data class Mute(val input: Int, val muted: Boolean) : Event
        data class Name(val input: Int, val name: String) : Event
    }

    private val inputChannel = baseChannel - 1
    private var status = 0
    private val data = ArrayList<Int>(3)
    private var sysex: ArrayList<Int>? = null

    fun feed(b: Int) {
        sysex?.let { sx ->
            if (b == 0xF7) { sysex = null; handleSysex(sx) }
            else if (b >= 0x80 && b < 0xF8) sysex = null // interrupted
            else if (b < 0x80) sx.add(b)
            return
        }
        when {
            b == 0xF0 -> { sysex = ArrayList(); status = 0 }
            b >= 0xF8 -> {} // real-time, ignore
            b >= 0x80 -> { status = b; data.clear() }
            status == 0 -> {}
            else -> {
                data.add(b)
                if (data.size >= dataLength(status)) {
                    handle(status, data)
                    data.clear()
                }
            }
        }
    }

    private fun dataLength(s: Int) = when (s and 0xF0) { 0xC0, 0xD0 -> 1; 0xF0 -> if (s == 0xF2) 2 else 1; else -> 2 }

    private fun handle(s: Int, d: List<Int>) {
        // Note On on the inputs' MIDI channel: velocity 01-3F = mute off, 40-7F = mute on, 00 ignored.
        if ((s and 0xF0) == 0x90 && (s and 0x0F) == inputChannel) {
            val ch = d[0]
            val vel = d[1]
            if (ch in 0x00..0x3F && vel != 0) onEvent(Event.Mute(ch + 1, vel >= 0x40))
        }
    }

    private fun handleSysex(b: List<Int>) {
        // Body after F0: 00 00 1A 50 10 01 00, 0N, 02, CH, name..., (F7 stripped)
        val header = listOf(0x00, 0x00, 0x1A, 0x50, 0x10, 0x01, 0x00)
        if (b.size < header.size + 3 || b.subList(0, header.size) != header) return
        if (b[7] != inputChannel || b[8] != 0x02) return
        val ch = b[9]
        if (ch !in 0x00..0x3F) return
        val name = b.drop(10).map { it.toChar() }.joinToString("").trim()
        onEvent(Event.Name(ch + 1, name))
    }
}
