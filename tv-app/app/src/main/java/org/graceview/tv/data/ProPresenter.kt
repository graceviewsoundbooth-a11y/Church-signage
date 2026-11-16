package org.graceview.tv.data

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

data class ProState(
    /** ProPresenter Timer Name from the sheet, e.g. "Sermon". */
    val timerName: String = "",
    /** The named timer's display time, e.g. "17:42". */
    val timer: String? = null,
    val timerOver: Boolean = false,
    val presentation: String? = null,
    /** The active playlist item's name. With a Planning Center-linked playlist it matches the plan item title. */
    val playlistItem: String? = null,
    /** 1-based slide number in the active presentation. */
    val slide: Int? = null,
    val slideCount: Int? = null,
    val stageMessage: String = "",
    val updatedAt: Long = 0L,
)

/**
 * ProPresenter 7's network API, read-only (CLAUDE.md: never call anything that triggers, clears or
 * changes). Only GET requests exist in this class. Paths follow the v1 API
 * (openapi.propresenter.com); confirm against the installed version.
 */
class ProPresenterClient(address: String, private val timerName: String) {
    private val base = "http://" + address.trim().removePrefix("http://").removeSuffix("/")
    private var lastPresentationId: String? = null
    private var slideCount: Int? = null
    private var presentationName: String? = null

    private suspend fun get(path: String): JsonElement = Net.json.parseToJsonElement(Net.getString(base + path, Net.lan))

    suspend fun poll(): ProState {
        // Each part is optional; one failing endpoint doesn't hide the others.
        val timer = runCatching { timer() }.getOrNull()
        val index = runCatching { get("/v1/presentation/slide_index").jsonObject["presentation_index"] as? JsonObject }.getOrNull()
        val stage = runCatching { stageMessage() }.getOrNull()
        // "/v1/playlist/active": { presentation: { playlist: {...}, item: { name, index } } }
        val playlistItem = runCatching {
            ((get("/v1/playlist/active") as? JsonObject)?.get("presentation") as? JsonObject)
                ?.get("item")?.jsonObject?.get("name")?.jsonPrimitive?.contentOrNull
        }.getOrNull()
        if (timer == null && index == null && stage == null && playlistItem == null) throw java.io.IOException("ProPresenter didn't answer")

        val presId = index?.get("presentation_id")?.jsonObject
        val uuid = presId?.get("uuid")?.jsonPrimitive?.contentOrNull
        if (uuid != lastPresentationId) {
            lastPresentationId = uuid
            presentationName = presId?.get("name")?.jsonPrimitive?.contentOrNull
            // The slide count needs the whole presentation, so read it only when the presentation changes.
            slideCount = if (uuid == null) null else runCatching { countSlides(get("/v1/presentation/active")) }.getOrNull()
        }
        val slideIndex = (index?.get("index") as? JsonPrimitive)?.intOrNull
        return ProState(
            timerName = timerName.trim(),
            timer = timer?.first,
            timerOver = timer?.second ?: false,
            presentation = presentationName,
            playlistItem = playlistItem,
            slide = slideIndex?.plus(1),
            slideCount = slideCount,
            stageMessage = stage ?: "",
            updatedAt = System.currentTimeMillis(),
        )
    }

    /** "/v1/timers/current": [{ id: { name }, time: "00:17:42", state }]. Returns display text and whether it's past zero. */
    private suspend fun timer(): Pair<String, Boolean>? {
        if (timerName.isBlank()) return null
        val list = get("/v1/timers/current") as? JsonArray ?: return null
        val t = list.firstOrNull {
            it.jsonObject["id"]?.jsonObject?.get("name")?.jsonPrimitive?.contentOrNull.equals(timerName.trim(), ignoreCase = true)
        }?.jsonObject ?: return null
        val raw = t["time"]?.jsonPrimitive?.contentOrNull ?: return null
        return formatTimer(raw)
    }

    private suspend fun stageMessage(): String {
        val e = get("/v1/stage/message")
        return when (e) {
            is JsonPrimitive -> e.contentOrNull.orEmpty()
            is JsonObject -> e["message"]?.jsonPrimitive?.contentOrNull.orEmpty()
            else -> ""
        }.trim()
    }

    companion object {
        /** "00:17:42" -> "17:42", "01:05:00" -> "1:05:00", "-00:01:05" -> ("1:05", over). */
        fun formatTimer(raw: String): Pair<String, Boolean> {
            val over = raw.trim().startsWith("-")
            val parts = raw.trim().removePrefix("-").substringBefore('.').split(':').mapNotNull { it.toIntOrNull() }
            val (h, m, s) = when (parts.size) {
                3 -> Triple(parts[0], parts[1], parts[2])
                2 -> Triple(0, parts[0], parts[1])
                else -> return raw.trim() to over
            }
            val text = if (h > 0) "%d:%02d:%02d".format(h, m, s) else "%d:%02d".format(m, s)
            return text to over
        }

        /** Counts slides in "/v1/presentation/active": { presentation: { groups: [{ slides: [...] }] } }. */
        fun countSlides(e: JsonElement): Int? {
            val p = (e as? JsonObject)?.get("presentation") as? JsonObject ?: return null
            val groups = p["groups"] as? JsonArray ?: return null
            return groups.sumOf { g -> ((g as? JsonObject)?.get("slides") as? JsonArray)?.size ?: 0 }.takeIf { it > 0 }
        }
    }
}
