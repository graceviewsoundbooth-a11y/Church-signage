import org.jetbrains.compose.desktop.application.dsl.TargetFormat
import org.jetbrains.kotlin.gradle.dsl.JvmTarget
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import java.util.Properties

// The Event Screen desktop app (CLAUDE.md, "Event Screen desktop app", decided 2026-11-15).
plugins {
    id("org.jetbrains.kotlin.jvm")
    id("org.jetbrains.kotlin.plugin.compose")
    id("org.jetbrains.compose")
}

java {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
}

kotlin {
    compilerOptions { jvmTarget.set(JvmTarget.JVM_17) }
}

dependencies {
    implementation(project(":core"))
    implementation(compose.desktop.currentOs)
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-swing:1.9.0")
    // VLC for MP4 slides and the RTSP live feed. Needs VLC 3.x: bundled by build-desktop.ps1,
    // or an installed VLC when run from Gradle.
    implementation("uk.co.caprica:vlcj:4.8.3")
}

// The API key (from local.properties, never committed) and the build time, as a generated Kotlin file.
val localProps = Properties().apply {
    val f = rootProject.file("local.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}
val buildTime: String = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy.MM.dd.HHmm"))
val genDir = layout.buildDirectory.dir("generated/buildinfo")
val genBuildInfo = tasks.register("genBuildInfo") {
    val key = localProps.getProperty("google.apiKey", "")
    inputs.property("key", key)
    inputs.property("time", buildTime)
    outputs.dir(genDir)
    doLast {
        val f = genDir.get().file("org/graceview/tv/desktop/BuildInfo.kt").asFile
        f.parentFile.mkdirs()
        f.writeText(
            "package org.graceview.tv.desktop\n\n" +
                "internal object BuildInfo {\n" +
                "    const val GOOGLE_API_KEY = \"" + key.replace("\\", "\\\\").replace("\"", "\\\"") + "\"\n" +
                "    const val VERSION = \"" + buildTime + "\"\n" +
                "}\n",
        )
    }
}
sourceSets.main {
    kotlin.srcDir(genDir)
}
tasks.named("compileKotlin") { dependsOn(genBuildInfo) }

// Fonts and the icon come from the TV app, so there's one copy of each.
tasks.processResources {
    from("../app/src/main/res/font") { into("fonts") }
    from("../app/src/main/res/drawable-nodpi/icon.png")
}

compose.desktop {
    application {
        mainClass = "org.graceview.tv.desktop.MainKt"
        jvmArgs += listOf("-Dfile.encoding=UTF-8")
        nativeDistributions {
            targetFormats(TargetFormat.Msi)
            packageName = "GraceviewEventScreen"
            packageVersion = "1.0.0"
            description = "Graceview TV Event Screen"
            vendor = "Graceview"
            includeAllModules = true
            // VLC's libraries and plugins, copied here by build-desktop.ps1 (not committed).
            appResourcesRootDir.set(project.layout.projectDirectory.dir("vlc-bundle"))
            windows {
                iconFile.set(project.file("icon.ico"))
                menuGroup = "Graceview"
                shortcut = true
                dirChooser = false
                perUserInstall = true
                upgradeUuid = "5b1a7c1e-9a55-4d3e-9a0e-6c1f0f3e2b71"
            }
        }
    }
}
