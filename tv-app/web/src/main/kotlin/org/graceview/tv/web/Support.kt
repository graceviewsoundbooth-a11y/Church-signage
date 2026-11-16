package org.graceview.tv.web

import org.graceview.tv.Config
import org.graceview.tv.data.CoreLog
import java.io.File
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter

/** %LOCALAPPDATA%\GraceviewEventServer: the Sheet cache, slides, logos and the log. */
object Storage {
    val dir: File = File(System.getenv("LOCALAPPDATA") ?: System.getProperty("user.home"), "GraceviewEventServer").apply { mkdirs() }
}

/** A small log file (log.txt, then log.old.txt). Never logs the API key. */
object Log {
    private val file = File(Storage.dir, "log.txt")
    private val fmt = DateTimeFormatter.ofPattern("MM-dd HH:mm:ss")

    fun init() {
        CoreLog.sink = CoreLog.Sink { level, tag, message, error -> write(level, tag, message, error) }
        write('I', "EventServer", "Started ${BuildInfo.VERSION}", null)
    }

    fun i(tag: String, message: String) = write('I', tag, message, null)
    fun w(tag: String, message: String, error: Throwable? = null) = write('W', tag, message, error)

    @Synchronized private fun write(level: Char, tag: String, message: String, error: Throwable?) {
        val line = "${LocalDateTime.now().format(fmt)} $level/$tag: ${message.replace(Config.API_KEY.ifEmpty { "\u0000" }, "…")}" +
            (error?.let { " (${it.javaClass.simpleName}: ${it.message?.replace(Config.API_KEY.ifEmpty { "\u0000" }, "…")})" } ?: "")
        println(line)
        runCatching {
            if (file.length() > 1_000_000) file.renameTo(File(Storage.dir, "log.old.txt").also { it.delete() })
            file.appendText(line + "\n")
        }
    }
}
