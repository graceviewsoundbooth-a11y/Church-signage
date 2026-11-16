package org.graceview.tv.web

import io.ktor.http.CacheControl
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.withCharset
import io.ktor.server.application.Application
import io.ktor.server.application.install
import io.ktor.server.cio.CIO
import io.ktor.server.engine.embeddedServer
import io.ktor.server.http.content.staticResources
import io.ktor.server.plugins.autohead.AutoHeadResponse
import io.ktor.server.plugins.partialcontent.PartialContent
import io.ktor.server.request.receiveText
import io.ktor.server.response.cacheControl
import io.ktor.server.response.header
import io.ktor.server.response.respond
import io.ktor.server.response.respondBytes
import io.ktor.server.response.respondFile
import io.ktor.server.response.respondText
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.routing
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.graceview.tv.Config
import org.graceview.tv.data.Net
import org.graceview.tv.data.Qr
import java.awt.Desktop
import java.awt.image.BufferedImage
import java.io.BufferedInputStream
import java.io.ByteArrayOutputStream
import java.net.BindException
import java.net.URI
import java.net.URLConnection
import java.time.LocalDateTime
import java.time.ZonedDateTime
import java.util.concurrent.TimeUnit
import javax.imageio.ImageIO
import kotlin.system.exitProcess

/**
 * Graceview Event Screen server. Runs on the vMix PC; any browser on the church network opens
 * http://<this PC>:8090 and shows the Event Screen (or any device's signage).
 * Arguments: --port 8090, --liveUrl rtsp://... (play another stream in Live mode, for testing),
 * --open (open the page in this PC's browser once it's running), --install / --uninstall / --check
 * (start at sign-in and allow it through the firewall; see Installer).
 */
fun main(args: Array<String>) {
    fun arg(name: String) = args.indexOf(name).takeIf { it >= 0 }?.let { args.getOrNull(it + 1) }
    Config.API_KEY = BuildInfo.GOOGLE_API_KEY
    Log.init()
    val port = arg("--port")?.toIntOrNull() ?: 8090
    args.firstOrNull { it in setOf("--install", "--uninstall", "--check") }?.let { Installer.run(it, port) }

    val hub = Hub(Storage.dir)
    hub.testLiveUrl = arg("--liveUrl")
    hub.start()

    val server = embeddedServer(CIO, port = port, host = "0.0.0.0") { routes(hub) }
    try {
        server.start(wait = false)
    } catch (e: Exception) {
        val busy = generateSequence<Throwable>(e) { it.cause }.any { it is BindException }
        Log.w("EventServer", if (busy) "Port $port is in use: is the Event Screen server already running?" else "Couldn't start", e)
        exitProcess(1)
    }
    Log.i("EventServer", "Serving on port $port")
    if ("--open" in args) runCatching { Desktop.getDesktop().browse(URI("http://localhost:$port/")) }
    Thread.currentThread().join()
}

private val SAFE_ID = Regex("^[\\w-]{10,100}$")
private val SAFE_FILE = Regex("^[\\w-]{10,100}_\\w{1,16}\\.(jpg|png|mp4)$")
private const val HLS_JS = "META-INF/resources/webjars/hls.js/1.5.15/dist/hls.min.js"

private fun Application.routes(hub: Hub) {
    install(PartialContent)
    install(AutoHeadResponse)

    routing {
        /**
         * What the page shows. For testing, `fakeNow=2026-11-15T15:05:00` (Chicago time) plus
         * `elapsed` (ms since the page opened) runs the schedule at another time.
         */
        get("/api/state") {
            val q = call.request.queryParameters
            val fake = q["fakeNow"]?.let { runCatching { LocalDateTime.parse(it).atZone(Config.ZONE) }.getOrNull() }
            val now = fake?.plusNanos((q["elapsed"]?.toLongOrNull() ?: 0L).coerceIn(0L, 7L * 86_400_000L) * 1_000_000)
                ?: ZonedDateTime.now(Config.ZONE)
            call.response.cacheControl(CacheControl.NoStore(null))
            call.respondText(hub.state(q["device"], now).toString(), ContentType.Application.Json.withCharset(Charsets.UTF_8))
        }

        /**
         * The live feed over WebRTC (WHEP): the page's offer goes to MediaMTX on this PC and the
         * answer comes back. Only the Sheet's feed can be reached this way.
         */
        post("/api/whep") {
            val feed = hub.liveFeed() ?: return@post call.respond(HttpStatusCode.NotFound, "No Local stream row in Live Feeds")
            val (host, path) = Hub.mediaPath(feed.address) ?: return@post call.respond(HttpStatusCode.NotFound, "Live feed address isn't usable")
            val offer = call.receiveText()
            if (offer.length > 100_000) return@post call.respond(HttpStatusCode.PayloadTooLarge)
            val (code, body) = try {
                withContext(Dispatchers.IO) {
                    val req = Request.Builder().url("http://$host:8889/$path/whep")
                        .post(offer.toRequestBody("application/sdp".toMediaType())).build()
                    WHEP_CLIENT.newCall(req).execute().use { it.code to it.body?.string().orEmpty() }
                }
            } catch (e: Exception) {
                Log.w("Live", "MediaMTX didn't answer", e)
                return@post call.respond(HttpStatusCode.BadGateway, "MediaMTX didn't answer")
            }
            call.respondText(body, ContentType("application", "sdp"), HttpStatusCode.fromValue(code))
        }

        get("/slides/{folder}/{file}") {
            val folder = call.parameters["folder"].orEmpty()
            val name = call.parameters["file"].orEmpty()
            val f = if (SAFE_ID.matches(folder) && SAFE_FILE.matches(name)) hub.slideFile(folder, name) else null
            if (f == null) return@get call.respond(HttpStatusCode.NotFound)
            // The file name carries the Drive checksum, so a changed slide gets a new name.
            call.response.header(HttpHeaders.CacheControl, "max-age=86400")
            call.respondFile(f)
        }

        get("/logos/{id}") {
            val id = call.parameters["id"].orEmpty()
            val f = if (SAFE_ID.matches(id)) hub.logoFile(id) else null
            if (f == null) return@get call.respond(HttpStatusCode.NotFound)
            val bytes = f.readBytes()
            val type = runCatching { URLConnection.guessContentTypeFromStream(BufferedInputStream(bytes.inputStream())) }.getOrNull()
                ?: if (bytes.take(256).toByteArray().decodeToString().contains("<svg")) "image/svg+xml" else "image/png"
            call.response.header(HttpHeaders.CacheControl, "max-age=3600")
            call.respondBytes(bytes, ContentType.parse(type))
        }

        /** A QR code, one pixel per module; the page scales it up without smoothing. */
        get("/qr.png") {
            val text = call.request.queryParameters["text"].orEmpty()
            if (text.isEmpty() || text.length > 1000) return@get call.respond(HttpStatusCode.BadRequest)
            val px = runCatching { Qr.pixels(text) }.getOrNull() ?: return@get call.respond(HttpStatusCode.BadRequest)
            val img = BufferedImage(px.width, px.height, BufferedImage.TYPE_INT_RGB)
            img.setRGB(0, 0, px.width, px.height, px.argb, 0, px.width)
            val out = ByteArrayOutputStream()
            ImageIO.write(img, "png", out)
            call.response.header(HttpHeaders.CacheControl, "max-age=86400")
            call.respondBytes(out.toByteArray(), ContentType.Image.PNG)
        }

        get("/hls.js") {
            val bytes = Hub::class.java.classLoader.getResourceAsStream(HLS_JS)?.use { it.readBytes() }
                ?: return@get call.respond(HttpStatusCode.NotFound)
            call.response.header(HttpHeaders.CacheControl, "max-age=86400")
            call.respondBytes(bytes, ContentType.Application.JavaScript)
        }

        // The page itself: index.html, app.js, style.css, fonts. No caching, so a new build shows at once.
        staticResources("/", "web") {
            cacheControl { listOf(CacheControl.NoCache(null)) }
        }
    }
}

private val WHEP_CLIENT = Net.client.newBuilder().connectTimeout(5, TimeUnit.SECONDS).readTimeout(15, TimeUnit.SECONDS).build()


