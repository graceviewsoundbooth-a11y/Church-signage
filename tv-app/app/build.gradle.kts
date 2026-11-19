import org.jetbrains.kotlin.gradle.dsl.JvmTarget
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import java.io.File
import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("org.jetbrains.kotlin.plugin.serialization")
}

val localProps = Properties().apply {
    val f = rootProject.file("local.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}

android {
    namespace = "org.graceview.tv"
    compileSdk = 35

    defaultConfig {
        applicationId = "org.graceview.signage.lab"
        // Fire OS 6 (Fire TV Stick 4K 1st gen, AFTMM) is API 25, Fire OS 7 is API 28,
        // Fire OS 8 is API 30, the Onn 4K Pro is Android 14.
        minSdk = 25
        targetSdk = 34
        // Every build gets a higher version so the church-PC updater (tv-updater) knows it's newer:
        // the code is minutes since 2026-01-01 UTC, the name is the build's local date and time.
        versionCode = ((System.currentTimeMillis() / 1000 - 1767225600L) / 60).toInt()
        versionName = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy.MM.dd.HHmm"))
        buildConfigField("String", "GOOGLE_API_KEY", "\"${localProps.getProperty("google.apiKey", "")}\"")
        // Church Signage: the dashboard web app this TV pairs with (Graceview Signage 2.0). Not a secret.
        // lab.url in local.properties points a build somewhere else (the test dashboard, another church).
        val labUrl = localProps.getProperty("lab.url",
            "https://script.google.com/macros/s/AKfycbxyaLwdIBo2LVLXFnOlm0xiw_nCcXljc2EcQ84BenlQU0ODyWaA7AfnwTywzVuQVhhS6w/exec")
        buildConfigField("String", "LAB_URL", "\"$labUrl\"")
    }

    /*
     * Release signing. The key lives outside the project (make-signing-key.ps1 makes it), in
     * %LOCALAPPDATA%\church-signage-keys\signing.properties, or wherever CS_SIGNING_PROPS points.
     * Every update must be signed with the same key, or TVs have to uninstall to update: back it up.
     */
    val signingPropsFile = file(System.getenv("CS_SIGNING_PROPS")
        ?: (System.getenv("LOCALAPPDATA") ?: System.getProperty("user.home")) + "/church-signage-keys/signing.properties")
    val signingProps = Properties().apply {
        if (signingPropsFile.exists()) signingPropsFile.inputStream().use { load(it) }
    }
    // The key file as written in signing.properties, or (when the folder was copied to another computer,
    // where that path doesn't exist) the file of the same name next to signing.properties.
    val keyFile = signingProps.getProperty("storeFile")?.let { p ->
        file(p).takeIf { it.exists() } ?: File(signingPropsFile.parentFile, File(p).name)
    }
    signingConfigs {
        if (keyFile != null) {
            create("release") {
                storeFile = keyFile
                storePassword = signingProps.getProperty("storePassword")
                keyAlias = signingProps.getProperty("keyAlias")
                keyPassword = signingProps.getProperty("keyPassword")
            }
        }
    }
    buildTypes {
        getByName("release") {
            isMinifyEnabled = false // the code is small; shrinking risks breaking reflection-based parsing
            signingConfig = signingConfigs.findByName("release")
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    compileOptions {
        // java.time on API 25 (Fire OS 6).
        isCoreLibraryDesugaringEnabled = true
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    lint {
        // False positive: overriding ComponentActivity.dispatchKeyEvent is normal.
        disable += "RestrictedApi"
    }

    packaging {
        resources {
            excludes += setOf(
                "/META-INF/{AL2.0,LGPL2.1}",
                "META-INF/DEPENDENCIES",
                "META-INF/LICENSE*",
                "META-INF/NOTICE*",
                "META-INF/versions/9/previous-compilation-data.bin",
            )
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
    }
}

dependencies {
    implementation(project(":core"))

    val composeBom = platform("androidx.compose:compose-bom:2024.12.01")
    implementation(composeBom)
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.foundation:foundation")

    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")

    implementation("androidx.media3:media3-exoplayer:1.5.1")
    implementation("androidx.media3:media3-ui:1.5.1")
    implementation("androidx.media3:media3-exoplayer-rtsp:1.5.1")

    implementation("io.coil-kt:coil-compose:2.7.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")
    implementation("com.google.zxing:core:3.5.3")
    implementation("net.sf.biweekly:biweekly:0.6.8")
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.3")

    testImplementation("junit:junit:4.13.2")
}
