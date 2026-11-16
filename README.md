# Church Signage

Digital signage for churches, grown from the system that runs Graceview's TVs: a sideloaded Android TV app managed from a friendly web dashboard instead of a Google Sheet. Graceview is the first church using it. The live Graceview TV system is untouched; this project has its own app ID, Sheet, Drive folders and dashboard.

## What's here

| Folder or file | What it is |
|---|---|
| `graceview-tv-lab/` | The dashboard: a Google Apps Script web app bound to the "Graceview TV Lab" Sheet. Setup and a full guide are in [graceview-tv-lab/SETUP.md](graceview-tv-lab/SETUP.md). |
| `tv-app/` | The Church Signage TV app (Kotlin, Compose for TV), started from the Graceview TV app. App ID `org.graceview.signage.lab`, so it installs next to the live app. |
| `BACKLOG.md` | Feature ideas saved for later (classroom extras and open items). |
| `reference/` | A read-only clone of the live Graceview TV repository, for reference. Not part of this project's history (see `.gitignore`); pushing from it is turned off. |

## How the pieces fit

- Each church's own Google account holds its data (the Sheet and Drive folders). The dashboard runs as that account.
- TVs pair with a 6-character code, then ask the dashboard for their setup every 15 seconds through a small JSON connection (`doPost` in `Code.gs`). The setup arrives laid out like the original app's Sheet, so the original scheduler, launcher, power and transition logic run unchanged. There's no Google API key on the TV.
- The TV does all on-campus work itself: playing slides and the live feed, sleeping and waking the TV, and (Green Room) talking read-only to ProPresenter and the Avantis on the church network.

## Building the TV app

The project's Gradle (8.11.1) needs Java 17; Android Studio's bundled Java is too new. On this PC:

```powershell
$env:JAVA_HOME = "$env:LOCALAPPDATA\graceview-tools\jdk\jdk-17.0.21.0.2+1"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:GRACEVIEW_BUILD_DIR = "$env:LOCALAPPDATA\church-signage-build"
cd tv-app
& "$env:LOCALAPPDATA\graceview-tools\gradle-8.11.1\bin\gradle.bat" --no-daemon :core:test :app:testDebugUnitTest :app:assembleDebug
```

The APK lands in `%LOCALAPPDATA%\church-signage-build\app\outputs\apk\debug\app-debug.apk`. `tv-app/local.properties` needs only `sdk.dir`; `lab.url` there overrides the dashboard address.

## Trying it on the emulator

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\emulator\emulator.exe" -avd Television_1080p
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" install -r "$env:LOCALAPPDATA\church-signage-build\app\outputs\apk\debug\app-debug.apk"
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" shell am start -n org.graceview.signage.lab/org.graceview.tv.MainActivity
```

The app shows a pairing code; pair it from the dashboard's Devices page. The emulator can't test Fire OS 6, HDMI-CEC power, real HDMI switching or the church network; those need a real stick.

## Rules carried over from the live system

- The Avantis console and ProPresenter are read-only. The app never sends anything that changes them (enforced in code, with tests).
- No Google Play services. The oldest supported device is Fire OS 6 (Android 7.1, API 25).
- Changed on purpose: the Planning Center login is entered in the dashboard (kept in the script's private storage, sent only to Green Room TVs, stored encrypted there) instead of only through the setup script.
