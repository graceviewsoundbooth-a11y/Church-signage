import org.jetbrains.kotlin.gradle.dsl.JvmTarget

// Shared by the TV app (app) and the Event Screen desktop app (desktop): plain Kotlin/JVM, no Android.
// The TV app's core library desugaring covers java.time here too on Fire OS 6 (API 25).
plugins {
    id("org.jetbrains.kotlin.jvm")
    id("org.jetbrains.kotlin.plugin.serialization")
}

java {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
    }
}

dependencies {
    api("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.9.0")
    api("com.squareup.okhttp3:okhttp:4.12.0")
    api("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")
    implementation("com.google.zxing:core:3.5.3")
    implementation("net.sf.biweekly:biweekly:0.6.8")

    testImplementation("junit:junit:4.13.2")
}
