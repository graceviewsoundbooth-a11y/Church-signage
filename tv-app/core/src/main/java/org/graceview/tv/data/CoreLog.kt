package org.graceview.tv.data

/**
 * Logging for the shared code. The TV app sends it to Android's Log, the desktop app to its log
 * file. Never pass secrets (the API key, the Planning Center token) to it.
 */
object CoreLog {
    fun interface Sink {
        fun log(level: Char, tag: String, message: String, error: Throwable?)
    }

    @Volatile var sink: Sink = Sink { level, tag, message, error ->
        System.err.println("$level/$tag: $message" + (error?.let { " ($it)" } ?: ""))
    }

    fun i(tag: String, message: String) = sink.log('I', tag, message, null)
    fun w(tag: String, message: String, error: Throwable? = null) = sink.log('W', tag, message, error)
}
