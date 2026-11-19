package org.graceview.tv.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.graceview.tv.Config
import java.io.IOException

/*
 * Church Signage: the dashboard (the lab's Apps Script web app) replaces the Google Sheet.
 * The TV pairs once with a code, then asks for its setup with the device key it was given.
 * The setup arrives laid out like the production Sheet's rows, so SheetRepo.parse and the
 * Scheduler read it unchanged.
 */

@Serializable
data class PairStart(
    val code: String = "",
    val secret: String = "",
    val exp: Long = 0,
    val church: String = "",
    /** Where people open the dashboard, as they'd type it ("graceview.org/signage"); blank if the church hasn't set one. */
    val dashboard: String = "",
    val error: String? = null,
)

@Serializable
data class PairCheck(
    val waiting: Boolean = false,
    val paired: Boolean = false,
    val expired: Boolean = false,
    val deviceKey: String = "",
    val deviceId: String = "",
    val error: String? = null,
)

@Serializable
data class LabState(
    val unpaired: Boolean = false,
    val device: String = "",
    val church: String = "",
    val batch: BatchGet? = null,
    /** Each slides folder's files, by folder ID (see LabFolders). */
    val files: Map<String, List<LabFile>> = emptyMap(),
    /** This TV's home screen layout from the dashboard's Launchers page; null = the built-in row. */
    val launcher: LabLauncher? = null,
    /** Green Room TVs only: the Planning Center login (blank = removed in the dashboard). null for other TVs. */
    val planningCenter: LabPco? = null,
    /** The dashboard's Church page: website wording, weather spot, time zone. null from older dashboards. */
    val settings: LabSettings? = null,
    val error: String? = null,
)

/** Church-wide settings from the dashboard's Church page. lat/lon null = no weather. */
@Serializable
data class LabSettings(
    val website: String = "",
    val timeZone: String = "",
    val place: String = "",
    val lat: Double? = null,
    val lon: Double? = null,
    val unit: String = "F",
    val messageLine: String = "",
    val noEvents: String = "",
    /** The church logo's Drive link ("" = none). The TV downloads it like a theme logo. */
    val logoLink: String = "",
) {
    /** Puts these into Config, where the screens, the schedule and the weather read them. */
    fun apply() {
        timeZone.takeIf { it.isNotBlank() }?.let { z -> runCatching { java.time.ZoneId.of(z) }.getOrNull()?.let { Config.ZONE = it } }
        Config.WEATHER_ON = lat != null && lon != null
        if (lat != null && lon != null) { Config.WEATHER_LAT = lat; Config.WEATHER_LON = lon }
        Config.WEATHER_PLACE = place
        Config.WEATHER_CELSIUS = unit.equals("C", ignoreCase = true)
        Config.MESSAGE_LINE = messageLine
        if (noEvents.isNotBlank()) Config.NO_EVENTS_TEXT = noEvents
    }
}

/**
 * One home screen tile. type: watchlive, return, announcements, dashboard, mirror, hdmi, youtube,
 * browser, store, allapps, settings; or "app" (value = package name) or "web" (value = https link).
 */
@Serializable
data class LabTile(val type: String, val value: String = "", val label: String = "")

@Serializable
data class LabPco(val appId: String = "", val secret: String = "") {
    override fun toString() = "LabPco(appId=…${appId.takeLast(4)}, secret=hidden)" // never log the secret
}

@Serializable
data class LabLauncher(val name: String = "", val tiles: List<LabTile> = emptyList(), val idleMinutes: Int = 0)

object Lab {
    private val JSON = "application/json; charset=utf-8".toMediaType()

    /**
     * Apps Script answers a POST with a redirect to the result; OkHttp follows it as a GET,
     * which is what Apps Script expects.
     */
    private suspend fun post(fields: Map<String, String>): String = withContext(Dispatchers.IO) {
        if (Config.LAB_URL.isBlank()) throw IOException("The dashboard address isn't set.")
        val body = buildJsonObject { fields.forEach { (k, v) -> put(k, v) } }.toString().toRequestBody(JSON)
        Net.client.newCall(Request.Builder().url(Config.LAB_URL).post(body).build()).execute().use { r ->
            val text = r.body?.string().orEmpty()
            if (r.code == 401 || r.code == 403) {
                throw IOException("The dashboard asked for a Google sign-in. Set its access to \"Anyone\" (Deploy > Manage deployments).")
            }
            if (!r.isSuccessful) throw IOException("HTTP ${r.code} from the dashboard")
            if (!text.trimStart().startsWith("{")) {
                throw IOException("The dashboard didn't answer with data. Is its access set to \"Anyone\"?")
            }
            text
        }
    }

    suspend fun pairStart(deviceInfo: String): PairStart =
        Net.json.decodeFromString<PairStart>(post(mapOf("action" to "pairStart", "ua" to deviceInfo)))
            .also { if (it.error != null) throw IOException(it.error) }

    suspend fun pairCheck(code: String, secret: String): PairCheck =
        Net.json.decodeFromString<PairCheck>(post(mapOf("action" to "pairCheck", "code" to code, "secret" to secret)))
            .also { if (it.error != null) throw IOException(it.error) }

    /** [appsJson]: this TV's installed apps as JSON ([{pkg, label}]), sent now and then for the Launchers page. */
    /** [greenRoomJson]: Green Room TVs report whether Planning Center, ProPresenter and the Avantis connect. */
    suspend fun state(deviceKey: String, appsJson: String? = null, greenRoomJson: String? = null, infoJson: String? = null): LabState =
        Net.json.decodeFromString<LabState>(post(buildMap {
            put("action", "state"); put("key", deviceKey)
            // This TV's IP address, model and app version, for the dashboard's Devices page.
            if (infoJson != null) put("info", infoJson)
            if (appsJson != null) put("apps", appsJson)
            if (greenRoomJson != null) put("greenRoom", greenRoomJson)
        })).also { if (it.error != null) throw IOException(it.error) }
}
