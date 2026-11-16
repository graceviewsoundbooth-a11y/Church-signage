package org.graceview.tv.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import org.graceview.tv.Config
import java.io.File

object DriveLinks {
    private val patterns = listOf(
        Regex("/folders/([\\w-]{10,})"),
        Regex("/file/d/([\\w-]{10,})"),
        Regex("/d/([\\w-]{10,})"),
        Regex("[?&]id=([\\w-]{10,})"),
    )
    private val bareId = Regex("^[\\w-]{20,}$")

    /** Pulls the file or folder ID out of any common Drive link, or accepts a bare ID. */
    fun id(link: String): String? {
        val t = link.trim()
        if (t.isEmpty()) return null
        for (p in patterns) p.find(t)?.let { return it.groupValues[1] }
        return if (bareId.matches(t)) t else null
    }
}

data class Slide(val file: File, val video: Boolean, val name: String)

/** Church Signage: one file in a slides folder, as listed by the dashboard. */
@Serializable
data class LabFile(val id: String, val name: String, val mimeType: String, val modified: String = "")

/**
 * Church Signage has no Google API key on the TV. The dashboard sends each folder's file list
 * (folder ID -> files) with the TV's setup, and files download by their public link, which works
 * because slide folders are shared "anyone with the link can view".
 */
object LabFolders {
    @Volatile var listings: Map<String, List<LabFile>> = emptyMap()

    fun mediaUrl(fileId: String): String =
        if (Config.API_KEY.isNotBlank()) "https://www.googleapis.com/drive/v3/files/$fileId?alt=media&supportsAllDrives=true&key=${Config.API_KEY}"
        else "https://drive.usercontent.google.com/download?id=$fileId&export=download&confirm=t"
}

@Serializable
private data class DriveFile(
    val id: String,
    val name: String,
    val mimeType: String,
    val md5Checksum: String? = null,
    val modifiedTime: String? = null,
)

@Serializable
private data class DriveList(val files: List<DriveFile> = emptyList(), val nextPageToken: String? = null)

@Serializable
private data class SlideEntry(val name: String, val file: String, val video: Boolean)

/** Mirrors one Drive folder of announcements to local storage under [root]/slides. */
object DriveSync {
    private const val TAG = "DriveSync"
    private val EXT = mapOf("image/jpeg" to "jpg", "image/png" to "png", "video/mp4" to "mp4")
    private const val MANIFEST = "manifest.json"

    private fun dir(root: File, folderId: String) = File(root, "slides/$folderId").apply { mkdirs() }

    /** The last synced slides, so the TV has something to show before the network is up. */
    fun cached(root: File, folderId: String): List<Slide> = runCatching {
        val d = dir(root, folderId)
        Net.json.decodeFromString<List<SlideEntry>>(File(d, MANIFEST).readText())
            .map { Slide(File(d, it.file), it.video, it.name) }
            .filter { it.file.exists() }
    }.getOrDefault(emptyList())

    suspend fun sync(root: File, folderId: String): List<Slide> {
        val d = dir(root, folderId)
        val listed = list(folderId)
            .filter { it.mimeType in EXT }
            .sortedWith { a, b -> naturalCompare(a.name, b.name) }

        val entries = mutableListOf<SlideEntry>()
        for (f in listed) {
            val version = (f.md5Checksum ?: f.modifiedTime ?: "0").filter { it.isLetterOrDigit() }.take(16)
            val fileName = "${f.id}_$version.${EXT.getValue(f.mimeType)}"
            val dest = File(d, fileName)
            if (!dest.exists()) {
                try {
                    Net.download(LabFolders.mediaUrl(f.id), dest)
                } catch (e: Exception) {
                    CoreLog.w(TAG, "Skipping ${f.name}: ${e.message}")
                    continue
                }
            }
            entries += SlideEntry(f.name, fileName, f.mimeType.startsWith("video/"))
        }

        withContext(Dispatchers.IO) {
            val tmp = File(d, "$MANIFEST.tmp")
            tmp.writeText(Net.json.encodeToString(kotlinx.serialization.builtins.ListSerializer(SlideEntry.serializer()), entries))
            if (!tmp.renameTo(File(d, MANIFEST))) { File(d, MANIFEST).delete(); tmp.renameTo(File(d, MANIFEST)) }
            val keep = entries.map { it.file }.toSet() + MANIFEST
            d.listFiles()?.filter { it.name !in keep }?.forEach { it.delete() }
        }
        return entries.map { Slide(File(d, it.file), it.video, it.name) }
    }

    private suspend fun list(folderId: String): List<DriveFile> {
        if (Config.API_KEY.isBlank()) {
            val files = LabFolders.listings[folderId]
                ?: throw java.io.IOException("No file list for this folder from the dashboard yet")
            return files.map { DriveFile(it.id, it.name, it.mimeType, null, it.modified.ifBlank { null }) }
        }
        val out = mutableListOf<DriveFile>()
        var page: String? = null
        do {
            val url = "https://www.googleapis.com/drive/v3/files" +
                "?q=" + Net.enc("'$folderId' in parents and trashed = false") +
                "&fields=" + Net.enc("nextPageToken,files(id,name,mimeType,md5Checksum,modifiedTime)") +
                "&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true" +
                (page?.let { "&pageToken=" + Net.enc(it) } ?: "") +
                "&key=${Config.API_KEY}"
            val res = Net.json.decodeFromString<DriveList>(Net.getString(url))
            out += res.files
            page = res.nextPageToken
        } while (page != null)
        return out
    }

    private val chunk = Regex("\\d+|\\D+")

    /** Sorts "2 Easter" before "10 VBS" so number prefixes control the order. */
    fun naturalCompare(a: String, b: String): Int {
        val xa = chunk.findAll(a.lowercase()).map { it.value }.toList()
        val xb = chunk.findAll(b.lowercase()).map { it.value }.toList()
        for (i in 0 until minOf(xa.size, xb.size)) {
            val p = xa[i]
            val q = xb[i]
            val c = if (p[0].isDigit() && q[0].isDigit()) p.toBigInteger().compareTo(q.toBigInteger()) else p.compareTo(q)
            if (c != 0) return c
        }
        return xa.size - xb.size
    }
}

/** Downloads theme logos from their Drive links once and keeps them under [root]/logos. */
object LogoCache {
    suspend fun get(root: File, link: String): File? {
        val id = DriveLinks.id(link) ?: return null
        val f = File(root, "logos/$id")
        if (!f.exists()) {
            runCatching {
                Net.download(LabFolders.mediaUrl(id), f)
            }.onFailure { CoreLog.w("LogoCache", "Logo $id: ${it.message}") }
        }
        return f.takeIf { it.exists() }
    }
}
