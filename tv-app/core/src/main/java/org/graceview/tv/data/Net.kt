package org.graceview.tv.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.io.IOException
import java.net.URLEncoder
import java.util.concurrent.TimeUnit

object Net {
    val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .build()

    /** Short timeouts for devices on the church network (ProPresenter), polled every second. */
    val lan: OkHttpClient = client.newBuilder()
        .connectTimeout(2, TimeUnit.SECONDS)
        .readTimeout(3, TimeUnit.SECONDS)
        .build()

    val json = Json { ignoreUnknownKeys = true; isLenient = true }

    fun enc(s: String): String = URLEncoder.encode(s, "UTF-8").replace("+", "%20")

    fun redact(url: String): String = url.replace(Regex("key=[^&]+"), "key=…")

    suspend fun getString(
        url: String,
        http: OkHttpClient = client,
        headers: Map<String, String> = emptyMap(),
    ): String = withContext(Dispatchers.IO) {
        val req = Request.Builder().url(url).apply { headers.forEach { (k, v) -> header(k, v) } }.build()
        http.newCall(req).execute().use { r ->
            val body = r.body?.string().orEmpty()
            if (!r.isSuccessful) throw IOException("HTTP ${r.code} from ${redact(url).substringBefore('?')}: ${body.take(300)}")
            body
        }
    }

    /** Downloads to a .part file and renames it, so a half-downloaded file is never shown. */
    suspend fun download(url: String, dest: File) = withContext(Dispatchers.IO) {
        dest.parentFile?.mkdirs()
        val part = File(dest.parentFile, dest.name + ".part")
        client.newCall(Request.Builder().url(url).build()).execute().use { r ->
            if (!r.isSuccessful) throw IOException("HTTP ${r.code} downloading ${dest.name}")
            val body = r.body ?: throw IOException("Empty body for ${dest.name}")
            part.outputStream().use { out -> body.byteStream().copyTo(out) }
        }
        if (!part.renameTo(dest)) {
            dest.delete()
            if (!part.renameTo(dest)) throw IOException("Couldn't save ${dest.name}")
        }
    }
}
