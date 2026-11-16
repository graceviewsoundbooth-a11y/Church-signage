package org.graceview.tv.data

import android.content.Context
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import org.graceview.tv.system.Clock
import org.graceview.tv.system.Secrets
import java.time.ZonedDateTime

// ---- What the dashboard shows ------------------------------------------------

enum class ItemState { Done, Now, Upcoming }

data class OosRow(
    val start: ZonedDateTime?,
    val title: String,
    val key: String,
    val lengthSec: Int,
    val isHeader: Boolean,
    val state: ItemState,
)

data class BandRow(val name: String, val roles: String)

data class MicRow(val label: String, val name: String, val role: String, val muted: Boolean?)

object GreenRoomLogic {
    /**
     * Items in the plan's own order (headers stay with their items). Times run from the service
     * time minus the "pre" items' length, so pre-service items end at the service time. NOW is the
     * item whose title matches the active ProPresenter presentation; otherwise the item whose time
     * window contains now.
     */
    fun orderOfService(plan: Plan, now: ZonedDateTime, proNames: List<String>): List<OosRow> {
        val start = plan.serviceStart
        val ordered = plan.items
        val starts = arrayOfNulls<ZonedDateTime>(ordered.size)
        if (start != null) {
            var t = start.minusSeconds(ordered.filter { it.position == "pre" }.sumOf { it.lengthSec }.toLong())
            ordered.forEachIndexed { idx, i ->
                // The first service item starts at the service time, even if pre items were left short.
                if (i.position != "pre" && i.type != "header" && t.isBefore(start) && ordered.take(idx).none { it.position != "pre" && it.type != "header" }) t = start
                starts[idx] = t
                t = t.plusSeconds(i.lengthSec.toLong())
            }
        }

        val clockNow = ordered.indices.firstOrNull { idx ->
            val i = ordered[idx]
            val s = starts[idx] ?: return@firstOrNull false
            i.type != "header" && i.lengthSec > 0 && !now.isBefore(s) && now.isBefore(s.plusSeconds(i.lengthSec.toLong()))
        }
        // ProPresenter first: the playlist item name, then the presentation name. An exact title
        // match beats a partial one; if a title appears twice, take the one nearest the clock.
        val proMatch = proNames.map { it.trim().lowercase() }.filter { it.isNotEmpty() }.firstNotNullOfOrNull { p ->
            val items = ordered.indices.filter { ordered[it].type != "header" && ordered[it].title.isNotBlank() }
            val exact = items.filter { ordered[it].title.trim().lowercase() == p }
            val hits = exact.ifEmpty { items.filter { titlesMatch(ordered[it].title.trim().lowercase(), p) } }
            hits.minByOrNull { kotlin.math.abs(it - (clockNow ?: 0)) }
        }
        val nowIndex = proMatch ?: clockNow

        return ordered.mapIndexed { idx, i ->
            val s = starts[idx]
            val state = when {
                nowIndex != null && idx == nowIndex -> ItemState.Now
                nowIndex != null && idx < nowIndex -> ItemState.Done
                nowIndex == null && s != null && i.lengthSec > 0 && !now.isBefore(s.plusSeconds(i.lengthSec.toLong())) -> ItemState.Done
                else -> ItemState.Upcoming
            }
            OosRow(if (i.type == "header") null else s, i.title, if (i.type == "song") i.key else "", i.lengthSec, i.type == "header", state)
        }
    }

    private fun titlesMatch(item: String, presentation: String) =
        item == presentation || item.contains(presentation) || presentation.contains(item)

    private fun isBandTeam(team: String) = team.lowercase().let { "worship" in it || "band" in it || "praise" in it }

    /**
     * The praise/worship/band team (other teams such as Speakers are left out when one exists),
     * declined people left off if asked, one row per person.
     */
    fun band(plan: Plan, hideDeclined: Boolean): List<BandRow> {
        val all = plan.people.filter { !(hideDeclined && it.status.equals("D", ignoreCase = true)) }
        // Instruments only (the "Band" team); singers are under Mic Assignments. Without a Band team,
        // fall back to praise/worship teams, then everyone.
        val people = all.filter { "band" in it.team.lowercase() }
            .ifEmpty { all.filter { isBandTeam(it.team) } }
            .ifEmpty { all }
        val teamOrder = people.map { it.team }.distinct()
        return teamOrder.flatMap { team ->
            people.filter { it.team == team }.groupBy { it.name }.map { (name, ps) ->
                BandRow(name, ps.map { it.position }.filter { it.isNotBlank() }.distinct().joinToString(" · "))
            }
        }.distinctBy { it.name }
    }

    /**
     * One row per Mic Map entry. The name comes from the Mic Assignment Source; the status from the
     * Avantis (null when not known).
     */
    fun mics(settings: GreenRoomSettings, plan: Plan?, avantis: AvantisState?): List<MicRow> {
        val source = settings.micSource.trim().lowercase()
        val people = plan?.people.orEmpty().filter { !it.status.equals("D", ignoreCase = true) }
        val noteLines = plan?.notes.orEmpty()
            .filter { settings.planNoteCategory.isBlank() || it.first.equals(settings.planNoteCategory.trim(), ignoreCase = true) }
            .flatMap { it.second.lines() }
        return settings.micMap.map { m ->
            var name = ""
            var role = m.notes
            when {
                source.startsWith("position") -> {
                    val byLabel = people.firstOrNull { containsLabel(it.position, m.label) }
                    // The Mic Map names the position outright (e.g. HS 1 <- "Pastor" on the Speakers team).
                    val byPosition = m.position.takeIf { it.isNotBlank() }?.let { pos ->
                        people.firstOrNull { it.position.trim().equals(pos.trim(), ignoreCase = true) }
                    }
                    if (byPosition != null) {
                        name = byPosition.name
                        role = byPosition.position
                    } else if (byLabel != null) {
                        name = byLabel.name
                        role = stripLabel(byLabel.position, m.label).ifBlank { m.notes }
                    } else {
                        // Graceview's vocal positions are numbered: "1 First" sings on HH 1, "2 Second" on HH 2.
                        // Under the name: the Planning Center position, e.g. "1 First".
                        people.firstOrNull { numberedHandheld(it.position, m.label) }?.let {
                            name = it.name
                            role = it.position.ifBlank { m.notes }
                        }
                    }
                }
                source.startsWith("assignment") -> people.firstOrNull { containsLabel(it.notes, m.label) }?.let {
                    name = it.name
                    role = it.position.ifBlank { m.notes }
                }
                source.startsWith("plan") -> noteLines.firstOrNull { containsLabel(it.substringBefore('-').substringBefore(':'), m.label) }?.let {
                    name = it.substringAfter('-', it.substringAfter(':', "")).trim()
                }
                source.startsWith("avantis") -> name = m.channel?.let { avantis?.names?.get(it) }.orEmpty()
            }
            val muted = if (avantis?.connected == true) m.channel?.let { avantis.mutes[it] } else null
            MicRow(m.label, name, role, muted)
        }
    }

    /** "1 First" (position starts with a number) matches the Mic Map label "HH 1". */
    fun numberedHandheld(position: String, label: String): Boolean {
        val n = Regex("^\\s*(\\d+)\\b").find(position)?.groupValues?.get(1) ?: return false
        val hh = Regex("^\\s*HH\\s*(\\d+)\\s*$", RegexOption.IGNORE_CASE).find(label)?.groupValues?.get(1) ?: return false
        return n.toInt() == hh.toInt()
    }

    private fun labelRegex(label: String) = Regex("(^|[^A-Za-z0-9])" + Regex.escape(label.trim()) + "($|[^A-Za-z0-9])", RegexOption.IGNORE_CASE)
    fun containsLabel(text: String, label: String) = label.isNotBlank() && labelRegex(label).containsMatchIn(text)
    /** "Vocals - HH 2" -> "Vocals". */
    fun stripLabel(text: String, label: String) =
        text.replace(Regex(Regex.escape(label.trim()), RegexOption.IGNORE_CASE), "").trim().trim('-', '–', '·', ',', '(', ')', ' ')
}

// ---- Keeping the data fresh while the dashboard is open ----------------------

/**
 * Runs the three sources while the dashboard is open. Each is optional: a missing setting or an
 * unreachable device leaves only its own state empty.
 */
class GreenRoomFeed(private val ctx: Context, private val scope: CoroutineScope) {
    val plan = MutableStateFlow<Plan?>(null)
    val planError = MutableStateFlow<String?>(null)
    val pro = MutableStateFlow<ProState?>(null)
    private val _avantis = MutableStateFlow<AvantisState?>(null)
    val avantis: StateFlow<AvantisState?> = _avantis

    private var jobs: List<Job> = emptyList()
    private var running: GreenRoomSettings? = null

    /** Church Signage: whether each source connects, reported to the dashboard's Green Room page. */
    data class SourceStatus(val ok: Boolean, val text: String)
    private val status = java.util.concurrent.ConcurrentHashMap<String, SourceStatus>()

    /** The current status as JSON for the dashboard, or null when the dashboard isn't open on this TV. */
    fun statusJson(): String? {
        if (running == null) return null
        val obj = kotlinx.serialization.json.buildJsonObject {
            status.forEach { (k, v) ->
                put(k, kotlinx.serialization.json.buildJsonObject {
                    put("ok", kotlinx.serialization.json.JsonPrimitive(v.ok))
                    put("text", kotlinx.serialization.json.JsonPrimitive(v.text))
                })
            }
        }
        return obj.toString()
    }

    /** Starts (or restarts when settings change) the polling loops. */
    fun start(settings: GreenRoomSettings) {
        if (running == settings && jobs.any { it.isActive }) return
        stop()
        running = settings
        status.clear()
        if (settings.proPresenter.isBlank()) status["proPresenter"] = SourceStatus(false, "No ProPresenter address on the Green Room page.")
        if (settings.avantis.isBlank()) status["avantis"] = SourceStatus(false, "No Avantis address on the Green Room page.")
        jobs = listOfNotNull(
            scope.launch { pcoLoop(settings) },
            settings.proPresenter.takeIf { it.isNotBlank() }?.let { scope.launch { proLoop(it, settings.proPresenterTimer) } },
            settings.avantis.takeIf { it.isNotBlank() }?.let { addr ->
                scope.launch {
                    val client = AvantisClient(addr.substringBefore(':').trim(), settings.avantisBaseChannel, settings.micMap.mapNotNull { it.channel }.distinct())
                    launch {
                        client.state.collect {
                            _avantis.value = it
                            status["avantis"] = if (it.connected) SourceStatus(true, "")
                                else SourceStatus(false, "No answer from the console at $addr.")
                        }
                    }
                    client.run()
                }
            },
        )
    }

    fun stop() {
        jobs.forEach { it.cancel() }
        jobs = emptyList()
        running = null
    }

    private suspend fun pcoLoop(settings: GreenRoomSettings) {
        while (true) {
            val token = Secrets.planningCenter(ctx)
            when {
                token == null -> planError.value = "Planning Center isn't connected. Add its login on the dashboard's Green Room page."
                settings.serviceTypeId.isBlank() -> planError.value = "Add the Planning Center service type on the dashboard's Green Room page."
                else -> try {
                    plan.value = PlanningCenterClient(token, settings.serviceTypeId).fetch(Clock.now())
                    planError.value = if (plan.value == null) "No upcoming plan in Planning Center." else null
                } catch (e: NoSuchElementException) {
                    planError.value = e.message
                } catch (e: Exception) {
                    Log.w(TAG, "Planning Center fetch failed: ${e.message}")
                    planError.value = if (e.message?.contains("HTTP 401") == true) "Planning Center didn't accept the login. Check it on the dashboard's Green Room page."
                    else "Can't reach Planning Center."
                }
            }
            // Connected = Planning Center answered (an empty schedule still counts as connected).
            status["planningCenter"] = when {
                plan.value != null && planError.value == null -> SourceStatus(true, "")
                planError.value == "No upcoming plan in Planning Center." -> SourceStatus(true, "Connected, but no upcoming plan.")
                else -> SourceStatus(false, planError.value ?: "")
            }
            delay(PCO_MS)
        }
    }

    private suspend fun proLoop(address: String, timer: String) {
        val client = ProPresenterClient(address, timer)
        var failures = 0
        while (true) {
            try {
                pro.value = client.poll()
                failures = 0
                status["proPresenter"] = SourceStatus(true, "")
                delay(PRO_MS)
            } catch (e: Exception) {
                failures++
                if (failures >= 3) status["proPresenter"] = SourceStatus(false, "No answer from ProPresenter at $address.")
                if (failures == 1) Log.w(TAG, "ProPresenter not reachable: ${e.message}")
                // Keep the last good state; back off while it's down.
                delay(if (failures < 5) PRO_MS * 2 else 10_000L)
            }
        }
    }

    companion object {
        private const val TAG = "GreenRoom"
        const val PCO_MS = 60_000L
        const val PRO_MS = 1_000L
        /** Panels with data older than this show "Updated h:mm". */
        const val STALE_MS = 2 * 60_000L
    }
}
