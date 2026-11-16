package org.graceview.tv.web

import java.io.File
import java.net.HttpURLConnection
import java.net.Inet4Address
import java.net.NetworkInterface
import java.net.URI
import javax.swing.JOptionPane
import kotlin.system.exitProcess

/**
 * --install, --uninstall and --check for GraceviewEventServer.exe on the vMix PC, like the stream
 * scheduler: it runs at this Windows user's sign-in (the HKCU Run key) and Windows Firewall lets
 * other computers reach it (one rule for this exe, added with an administrator prompt).
 */
object Installer {
    private const val NAME = "GraceviewEventServer"
    private const val RULE = "Graceview Event Screen"
    private const val RUN_KEY = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run"

    /** The packaged exe (jpackage sets this), or null when run from Gradle. */
    private val exe: String? get() = System.getProperty("jpackage.app-path")?.takeIf { File(it).exists() }

    fun run(cmd: String, port: Int) {
        val code = when (cmd) {
            "--install" -> install(port)
            "--uninstall" -> uninstall()
            else -> check(port)
        }
        exitProcess(code)
    }

    private fun install(port: Int): Int {
        val path = exe ?: return fail("Run --install from the installed GraceviewEventServer.exe, not from Gradle.")
        if (!exec("reg", "add", RUN_KEY, "/v", NAME, "/t", "REG_SZ", "/d", "\"$path\"", "/f")) return fail("Couldn't add it to sign-in (reg add failed).")
        Log.i("Install", "Runs at sign-in: $path")
        // Windows asks an administrator to allow the firewall rule. "No" leaves it working on this PC only.
        val fw = elevated(
            "netsh advfirewall firewall delete rule name=\"$RULE\" >nul 2>&1 & " +
                "netsh advfirewall firewall add rule name=\"$RULE\" dir=in action=allow program=\"$path\" enable=yes profile=any",
        )
        Log.i("Install", "Firewall rule: ${if (fw) "added" else "not added"}")
        val running = answering(port)
        val msg = buildString {
            append("Installed. The Event Screen server starts every time this Windows user signs in.\n\n")
            append(if (fw) "Firewall: other computers on the network can reach it.\n\n"
            else "Firewall: NOT allowed (the administrator prompt was declined), so only this PC can open it.\nRun --install again to fix.\n\n")
            append("On any computer on the church network, open:\n")
            addresses(port).forEach { append("    $it\n") }
            if (!running) append("\nStart it now?")
        }
        if (running) {
            JOptionPane.showMessageDialog(null, msg + "\nIt's already running.", "Graceview Event Screen", JOptionPane.INFORMATION_MESSAGE)
        } else if (JOptionPane.showConfirmDialog(null, msg, "Graceview Event Screen", JOptionPane.YES_NO_OPTION) == JOptionPane.YES_OPTION) {
            ProcessBuilder(path).start()
        }
        return 0
    }

    private fun uninstall(): Int {
        exec("reg", "delete", RUN_KEY, "/v", NAME, "/f")
        val fw = elevated("netsh advfirewall firewall delete rule name=\"$RULE\"")
        val me = ProcessHandle.current().pid()
        val path = exe
        ProcessHandle.allProcesses()
            .filter { it.pid() != me && path != null && it.info().command().orElse("").equals(path, ignoreCase = true) }
            .forEach { it.destroyForcibly() }
        Log.i("Install", "Uninstalled (firewall rule removed: $fw)")
        JOptionPane.showMessageDialog(
            null,
            "Removed. It won't start at sign-in anymore, and the running copy was closed." +
                if (fw) "" else "\nThe firewall rule is still there (the administrator prompt was declined).",
            "Graceview Event Screen", JOptionPane.INFORMATION_MESSAGE,
        )
        return 0
    }

    private fun check(port: Int): Int {
        val registered = runCatching {
            val p = ProcessBuilder("reg", "query", RUN_KEY, "/v", NAME).redirectErrorStream(true).start()
            p.inputStream.readBytes(); p.waitFor() == 0
        }.getOrDefault(false)
        val msg = "Starts at sign-in: ${if (registered) "yes" else "no (run with --install)"}\n" +
            "Running now: ${if (answering(port)) "yes" else "no"}\n\n" +
            "Open on any computer on the church network:\n" + addresses(port).joinToString("\n") { "    $it" } +
            "\n\nLog: ${File(Storage.dir, "log.txt")}"
        JOptionPane.showMessageDialog(null, msg, "Graceview Event Screen", JOptionPane.INFORMATION_MESSAGE)
        return 0
    }

    /** http://<each LAN IPv4 of this PC>:port, church network (192.168.0.x) first. */
    fun addresses(port: Int): List<String> = runCatching {
        NetworkInterface.getNetworkInterfaces().toList()
            .filter { it.isUp && !it.isLoopback && !it.isVirtual }
            .flatMap { it.inetAddresses.toList() }
            .filterIsInstance<Inet4Address>()
            .filter { !it.isLinkLocalAddress }
            .map { it.hostAddress }
            .sortedBy { if (it.startsWith("192.168.0.")) 0 else 1 }
            .map { "http://$it:$port" }
    }.getOrDefault(emptyList()).ifEmpty { listOf("http://localhost:$port") }

    private fun answering(port: Int) = runCatching {
        val c = URI("http://127.0.0.1:$port/api/state").toURL().openConnection() as HttpURLConnection
        c.connectTimeout = 2000; c.readTimeout = 3000
        c.responseCode == 200
    }.getOrDefault(false)

    private fun exec(vararg cmd: String): Boolean = runCatching {
        val p = ProcessBuilder(*cmd).redirectErrorStream(true).start()
        p.inputStream.readBytes()
        p.waitFor() == 0
    }.getOrDefault(false)

    /** Runs a cmd.exe line as administrator (Windows shows its prompt). False if declined or failed. */
    private fun elevated(line: String): Boolean {
        val ps = "\$p = Start-Process cmd -Verb RunAs -Wait -PassThru -WindowStyle Hidden -ArgumentList '/c', '" +
            line.replace("'", "''") + "'; exit \$p.ExitCode"
        return exec("powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps)
    }

    private fun fail(text: String): Int {
        Log.w("Install", text)
        JOptionPane.showMessageDialog(null, text, "Graceview Event Screen", JOptionPane.ERROR_MESSAGE)
        return 1
    }
}
