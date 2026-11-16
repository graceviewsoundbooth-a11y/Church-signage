plugins {
    id("com.android.application") version "8.7.3" apply false
    id("org.jetbrains.kotlin.android") version "2.1.0" apply false
    id("org.jetbrains.kotlin.jvm") version "2.1.0" apply false
    id("org.jetbrains.kotlin.plugin.compose") version "2.1.0" apply false
    id("org.jetbrains.kotlin.plugin.serialization") version "2.1.0" apply false
    id("org.jetbrains.compose") version "1.7.3" apply false
}

// The project lives in OneDrive. Build output goes outside it so OneDrive sync
// doesn't lock files mid-build.
// build.ps1 sets GRACEVIEW_BUILD_DIR (C:\GraceviewTools\graceview-build when the user name has a space).
val outRoot = System.getenv("GRACEVIEW_BUILD_DIR")?.let { File(it) }
    ?: File(System.getenv("LOCALAPPDATA") ?: System.getProperty("java.io.tmpdir"), "graceview-build")
allprojects {
    layout.buildDirectory.set(File(outRoot, name))
}
