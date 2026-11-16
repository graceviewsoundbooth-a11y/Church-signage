package org.graceview.tv.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.Request
import java.io.IOException
import java.net.InetSocketAddress
import java.net.Socket
import java.net.URI
import java.time.Instant
import java.time.OffsetDateTime

/**
 * Is the service streaming right now? Used to show the Watch Live tile without a schedule row.
 *
 * YouTube: there's no cheap official API for "is this channel live" (search.list costs 100 of
 * the 10,000 daily quota units), so this reads the channel's public /live page and looks for
 * the live badge YouTube puts on a live channel's header. Unofficial: if YouTube changes the
 * page, this simply reports "not live" and the schedule still controls the tile.
 *
 * Local stream: an RTSP DESCRIBE to the encoder. A 200 reply means the stream is up.
 */
object LiveCheck {
    private const val UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
    private val LIVE_MARKERS = listOf("\"liveData\":{\"liveBadgeText\":\"LIVE\"}", "\"isLiveNow\":true")
    private val CHANNEL_ID = Regex("youtube\\.com/channel/(UC[\\w-]{20,})")
    private val PUBLISHED = Regex("<published>([^<]+)</published>")

    /** Sheet placeholders like "[your-channel-handle]" aren't real addresses yet. */
    fun usable(address: String) = address.isNotBlank() && '[' !in address

    data class YouTubeResult(val live: Boolean, val channelId: String?)

    suspend fun youtube(address: String): YouTubeResult = withContext(Dispatchers.IO) {
        val url = address.trim().replaceFirst(Regex("^http://", RegexOption.IGNORE_CASE), "https://")
        val req = Request.Builder().url(url)
            .header("User-Agent", UA)
            .header("Accept-Language", "en-US,en;q=0.9")
            .header("Cookie", "CONSENT=YES+1; SOCS=CAI")
            .build()
        Net.client.newCall(req).execute().use { r ->
            if (!r.isSuccessful) throw IOException("YouTube HTTP ${r.code}")
            val body = r.body?.string().orEmpty()
            YouTubeResult(LIVE_MARKERS.any { body.contains(it) }, CHANNEL_ID.find(body)?.groupValues?.get(1))
        }
    }

    /** Newest upload or stream in the channel's RSS feed (about 7 KB). */
    suspend fun newestPublished(channelId: String): Instant? {
        val xml = Net.getString("https://www.youtube.com/feeds/videos.xml?channel_id=$channelId")
        // The first <published> belongs to the channel; entries follow, newest first.
        return PUBLISHED.findAll(xml).drop(1).firstOrNull()?.groupValues?.get(1)
            ?.let { runCatching { OffsetDateTime.parse(it).toInstant() }.getOrNull() }
    }

    suspend fun rtspUp(address: String): Boolean = withContext(Dispatchers.IO) {
        val u = URI(address.trim())
        val port = if (u.port > 0) u.port else 554
        Socket().use { s ->
            s.connect(InetSocketAddress(u.host, port), 3_000)
            s.soTimeout = 3_000
            s.getOutputStream().write(
                "DESCRIBE ${address.trim()} RTSP/1.0\r\nCSeq: 1\r\nAccept: application/sdp\r\nUser-Agent: GraceviewTV\r\n\r\n".toByteArray(),
            )
            val status = s.getInputStream().bufferedReader().readLine().orEmpty()
            status.startsWith("RTSP/") && status.contains(" 200")
        }
    }
}
