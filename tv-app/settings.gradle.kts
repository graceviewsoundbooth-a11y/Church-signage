pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "ChurchSignageTV"
include(":app")
// Shared Kotlin/JVM code (Sheet, schedule, Drive, calendar...) used by the TV app and the desktop app.
include(":core")
// The Event Screen desktop app for Windows (CLAUDE.md, "Event Screen desktop app").
// include(":desktop")  (not used by the Church Signage TV app)
// The Event Screen web server: runs on the vMix PC, any browser on the church network shows it.
// include(":web")  (not used by the Church Signage TV app)
