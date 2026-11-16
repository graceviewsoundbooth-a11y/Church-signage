import org.jetbrains.kotlin.gradle.dsl.JvmTarget
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import java.util.Properties

// The Event Screen web server (CLAUDE.md, "Event Screen"). Runs on the vMix PC; any computer on the
// church network opens it in a browser. build-web.ps1 packages it with its own Java runtime.
plugins {
    id("org.jetbrains.kotlin.jvm")
    application
}

java {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
}

kotlin {
    compilerOptions { jvmTarget.set(JvmTarget.JVM_17) }
}

val ktor = "3.0.3"
dependencies {
    implementation(project(":core"))
    implementation("io.ktor:ktor-server-core:$ktor")
    implementation("io.ktor:ktor-server-cio:$ktor")
    implementation("io.ktor:ktor-server-partial-content:$ktor")
    implementation("io.ktor:ktor-server-auto-head-response:$ktor")
    implementation("org.slf4j:slf4j-nop:2.0.16")
    // hls.js plays the feed with sound in Chrome and Edge (Safari plays HLS on its own). Served from the jar.
    implementation("org.webjars.npm:hls.js:1.5.15")

    testImplementation("junit:junit:4.13.2")
}

application {
    mainClass.set("org.graceview.tv.web.MainKt")
    applicationDefaultJvmArgs = listOf("-Dfile.encoding=UTF-8")
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
        val f = genDir.get().file("org/graceview/tv/web/BuildInfo.kt").asFile
        f.parentFile.mkdirs()
        f.writeText(
            "package org.graceview.tv.web\n\n" +
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
    from("../app/src/main/res/font") { into("web/fonts") }
    from("../app/src/main/res/drawable-nodpi/icon.png") { into("web") }
}

