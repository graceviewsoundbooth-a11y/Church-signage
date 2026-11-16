package org.graceview.tv.data

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.Credentials
import org.graceview.tv.Config
import org.graceview.tv.system.Secrets
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZonedDateTime

data class PlanItem(
    val title: String,
    /** "song", "header", "media" or "item". */
    val type: String,
    val lengthSec: Int,
    val key: String,
    /** "pre", "during" or "post". */
    val position: String,
)

data class PlanPerson(
    val name: String,
    val position: String,
    val team: String,
    /** "C" confirmed, "U" unconfirmed, "D" declined. */
    val status: String,
    val notes: String,
)

data class Plan(
    val title: String,
    val date: LocalDate?,
    /** The service time this dashboard is about (start of "during" items). */
    val serviceStart: ZonedDateTime?,
    val items: List<PlanItem>,
    val people: List<PlanPerson>,
    /** Plan notes: category name to content. */
    val notes: List<Pair<String, String>>,
    val updatedAt: Long,
)

/**
 * Planning Center Services API v2, read-only, with a personal access token (HTTP Basic).
 * About 5 requests a minute when polled every 60 seconds; Planning Center allows 100 per 20 seconds.
 */
class PlanningCenterClient(private val token: Secrets.PlanningCenterToken, private val serviceTypeId: String) {
    private val base = "https://api.planningcenteronline.com/services/v2"
    private val auth = mapOf("Authorization" to Credentials.basic(token.appId, token.secret))
    private var serviceTypeName: String? = null

    private suspend fun get(path: String): JsonObject =
        Net.json.parseToJsonElement(Net.getString(base + path, headers = auth)).jsonObject

    private fun JsonElement?.str(name: String): String =
        (this as? JsonObject)?.get("attributes")?.jsonObject?.get(name)?.let { runCatching { it.jsonPrimitive.contentOrNull }.getOrNull() }.orEmpty()

    private fun JsonElement?.int(name: String): Int =
        (this as? JsonObject)?.get("attributes")?.jsonObject?.get(name)?.let { runCatching { it.jsonPrimitive.intOrNull }.getOrNull() } ?: 0

    private fun data(o: JsonObject): List<JsonObject> = (o["data"] as? JsonArray)?.mapNotNull { it as? JsonObject }.orEmpty()

    private fun time(s: String): ZonedDateTime? = runCatching { OffsetDateTime.parse(s).atZoneSameInstant(Config.ZONE) }.getOrNull()

    private var resolvedId: String? = null

    /** The sheet may hold the number or the service type's name (e.g. "Worship Service"). */
    private suspend fun serviceTypeId(): String? {
        resolvedId?.let { return it }
        val v = serviceTypeId.trim()
        if (v.all { it.isDigit() }) return v.also { resolvedId = it }
        val match = data(get("/service_types?per_page=100")).firstOrNull { it.str("name").equals(v, ignoreCase = true) }
            ?: return null
        serviceTypeName = match.str("name")
        return match["id"]?.jsonPrimitive?.contentOrNull?.also { resolvedId = it }
    }

    suspend fun fetch(now: ZonedDateTime): Plan? {
        val st = serviceTypeId() ?: throw NoSuchElementException("No service type named \"${serviceTypeId.trim()}\" in Planning Center")
        if (serviceTypeName == null) serviceTypeName = runCatching { get("/service_types/$st")["data"].str("name") }.getOrNull()

        // Today's plan stays on screen after its service starts (it may have moved to "past").
        val today = now.toLocalDate()
        val past = data(get("/service_types/$st/plans?filter=past&order=-sort_date&per_page=1")).firstOrNull()
        val plan = past?.takeIf { time(it.str("sort_date"))?.toLocalDate() == today }
            ?: data(get("/service_types/$st/plans?filter=future&order=sort_date&per_page=1")).firstOrNull()
            ?: return null
        val pid = plan["id"]?.jsonPrimitive?.contentOrNull ?: return null

        val times = data(get("/service_types/$st/plans/$pid/plan_times?per_page=50"))
            .filter { it.str("time_type") == "service" }
            .mapNotNull { t -> time(t.str("starts_at"))?.let { s -> s to (time(t.str("ends_at")) ?: s.plusHours(2)) } }
            .sortedBy { it.first }
        // The service that hasn't ended yet, or the last one.
        val service = times.firstOrNull { it.second.isAfter(now) }?.first ?: times.lastOrNull()?.first

        val items = data(get("/service_types/$st/plans/$pid/items?per_page=100")).map { i ->
            PlanItem(i.str("title"), i.str("item_type"), i.int("length"), i.str("key_name"), i.str("service_position").ifEmpty { "during" })
        }

        val tm = get("/service_types/$st/plans/$pid/team_members?per_page=100&include=team")
        val teams = (tm["included"] as? JsonArray)?.mapNotNull { it as? JsonObject }
            ?.filter { it["type"]?.jsonPrimitive?.contentOrNull == "Team" }
            ?.associate { (it["id"]?.jsonPrimitive?.contentOrNull ?: "") to it.str("name") }
            .orEmpty()
        val people = data(tm).map { p ->
            val teamId = p["relationships"]?.jsonObject?.get("team")?.jsonObject?.get("data")
                ?.let { (it as? JsonObject)?.get("id")?.jsonPrimitive?.contentOrNull }
            PlanPerson(p.str("name"), p.str("team_position_name"), teams[teamId].orEmpty(), p.str("status"), p.str("notes"))
        }

        // Team and position names only (no people), to help set up the Mic Map.
        android.util.Log.i("GreenRoom", "Plan positions: " + people.map { "${it.team}/${it.position}" }.distinct().sorted().joinToString("; "))

        val notes = runCatching {
            data(get("/service_types/$st/plans/$pid/notes?per_page=100")).map { it.str("category_name") to it.str("content") }
        }.getOrDefault(emptyList())

        return Plan(
            title = plan.str("title").ifBlank { serviceTypeName.orEmpty() }.ifBlank { "Service" },
            date = time(plan.str("sort_date"))?.toLocalDate(),
            serviceStart = service ?: time(plan.str("sort_date")),
            items = items,
            people = people,
            notes = notes,
            updatedAt = System.currentTimeMillis(),
        )
    }
}
