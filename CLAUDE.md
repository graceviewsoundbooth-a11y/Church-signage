# Church Signage (Graceview's TV system, version 2.0)

Digital signage for churches: a sideloaded Android TV app run from a web dashboard (Google Apps Script) instead of a Google Sheet. Graceview Baptist Church is the first church using it. "1.0" is the older Graceview TV system (repo `graceview-tv`). 2.0 is replacing it one TV at a time, and both stay installable side by side. Read `README.md` and `graceview-tv-lab/SETUP.md` for the full guide.

## Two computers, one repo

This repo is worked on from two Windows computers, and every change has to reach both:
- **Barrett's laptop:** Windows user `bearp`, repo at `C:\Users\bearp\church-signage`.
- **The church computer:** the always-on vMix PC on the TV network, Windows user "GV Soundbooth 1". It's the primary computer for 2.0, and the only one that can reach the TVs.

The shared copy is the private GitHub repo **graceviewsoundbooth-a11y/church-signage**. Branch: `main`.

- **Start of every session:** `git pull`. Check `git status` is clean before changing anything.
- **End of every change:** run the tests, commit, then `git push`. Never leave work only on one computer.
- If a pull conflicts, stop and ask. Don't force-push and don't rewrite history.
- A change is only finished when it's committed, pushed, and deployed where it needs to go (see "How changes reach the TVs"). Say which of those are done.

## What's here

| Path | What it is |
|---|---|
| `graceview-tv-lab/apps-script/` | The dashboard and the TVs' server. `Code.gs`, `Panel.html` (dashboard), `Tv.html` (browser screens and full-size previews), `Screen.html` (screen layouts shared by both). |
| `graceview-tv-lab/site/loader.html` | Pasted into the church website (Clover Custom Code) at graceview.org/signage. Loads the dashboard without the browser's Google accounts. Keep it plain ASCII with no HTML tags inside JS strings: Clover's editor reformats them and breaks the script. |
| `graceview-tv-lab/tests/` | Node tests for the dashboard. `node graceview-tv-lab/tests/run-tests.js` runs all of them. |
| `tv-app/` | The TV app (Kotlin, Compose for TV). App ID `org.graceview.signage.lab`; code namespace `org.graceview.tv`; shown on TVs as "Church Signage". |
| `tv-app/build.ps1` | Builds the app. `-Release` makes the signed `dist\church-signage.apk`; add `-Test` to run the unit tests first. |
| `tv-app/setup-stick.ps1` | Installs and sets up a stick over adb. Makes the chosen version (2.0 by default, or `-Pkg org.graceview.tv` for 1.0) the TV's home, and pauses the other. |
| `tv-app/make-signing-key.ps1` | Made the release signing key once. Never run it again: a new key means every TV has to uninstall the app to update. |
| `reference/` | Gitignored. A read-only copy of the 1.0 repo, for reference. |

## Graceview's live setup

| Thing | Where |
|---|---|
| 2.0 Sheet | "Graceview Signage 2.0", ID `1mBs-njomly0-eOZXxexSUiO2Gkc0-sREWYmez1JUlDw`, owned by graceviewsoundbooth@gmail.com. Apps Script is bound to it (Extensions › Apps Script). |
| Dashboard web app | `https://script.google.com/macros/s/AKfycbxyaLwdIBo2LVLXFnOlm0xiw_nCcXljc2EcQ84BenlQU0ODyWaA7AfnwTywzVuQVhhS6w/exec`. Built into the TV app (`app/build.gradle.kts`) and `site/loader.html`. Always deploy as a **new version of this deployment**, never a new deployment, or every TV and the loader lose it. |
| Dashboard for people | https://graceview.org/signage |
| Slides | Each theme's Slides Folder is the same Drive folder 1.0 uses (Church, School, Salem, Special Events), so both systems show the same slides. |
| 1.0 Sheet | "Graceview TV Schedules and Settings", ID `1VffKvU_jcE51LroLZtBH2i5zVwUZU2BSgA2_aDU9kYY`. **Read only from here.** |
| Lab Sheet | "Graceview TV Lab" in Barrett's personal account. The old test setup; no longer used for Graceview. |
| Stick setup kit | Drive › Digital Signage › App Files › Church Signage 2.0 (the script, an APK, a README and a CLAUDE.md for moving one TV). Refresh it from `tv-app/` and `dist/` after changes. |

### TVs

| Screen | Stick | IP | Status |
|---|---|---|---|
| Coffee Spot | NVIDIA SHIELD (Android 11, API 30) | 192.168.0.125 | **2.0** since 2026-11-19 (paired; 1.0 paused; its 1.0 IP Address cleared) |
| Lobby | onn 4K, Google TV (Android 14) | 192.168.0.142 | **2.0** since 2026-11-19 (paired; 1.0 paused; stock launcher disabled; its 1.0 IP Address cleared) |
| Front Office | Amazon Fire TV | 192.168.0.151 | 1.0 |
| Green Room | Fire TV Stick 4K (Fire OS 6, API 25) | 192.168.0.182 | 1.0, move last |
| Room 101, Event Screen | not set up | | Screens exist on the dashboard |

Keep this table current when a TV moves. Before moving one, clear its IP Address in 1.0's Devices tab. Otherwise the 1.0 updater installs 1.0 updates over it, and installing an update turns the paused 1.0 back on.

## How changes reach the TVs

1. **Dashboard and server** (`apps-script/*`):
   - Run the tests.
   - Copy each changed file into the Apps Script editor: `Get-Content -Raw -Encoding UTF8 <file> | Set-Clipboard`, then paste over the whole file and save.
   - **Deploy › Manage deployments › pencil › Version: New version › Deploy.**
   - TVs pick it up within about 15 seconds. A DEADLINE_EXCEEDED page right after a deploy is Google catching up; refresh after a minute.
2. **Website loader** (`site/loader.html`): paste into the Clover page's Custom Code block, save and publish.
3. **TV app** (`tv-app/*`):
   - `tv-app\build.ps1 -Release -Test` on either computer.
   - Install it from the **church computer**, which is on the TV network: `tv-app\setup-stick.ps1 -Ip <ip> -Port 5555` for each 2.0 stick. It's safe to re-run, and it reinstalls over the existing app keeping its pairing.
   - Every build gets a higher version automatically.
   - There's no automatic 2.0 updater yet. 1.0's `GraceviewTvUpdater` on the church computer only handles 1.0 (`org.graceview.tv`).

## Building on each computer

- `build.ps1` finds its tools itself:
  - It uses `%LOCALAPPDATA%\graceview-tools` and `%LOCALAPPDATA%\Android\Sdk`.
  - If that path has a space (the church computer's "GV Soundbooth 1"), it uses `C:\GraceviewTools` instead, which the 1.0 setup already filled with Java 17, the Android SDK and Gradle.
- adb on the church computer is `C:\GraceviewTools\Android\Sdk\platform-tools\adb.exe`. The TVs trust that computer's adb key under its usual Windows account.
- **The release signing key** is never in git.
  - Folder: `%LOCALAPPDATA%\church-signage-keys`, holding `church-signage-release.jks` and `signing.properties` with its password.
  - Both computers need a copy at that path, and Barrett keeps a private backup.
  - The build finds the .jks next to `signing.properties` even if the folder was copied from elsewhere.
  - The certificate's SHA-256 starts `743364aa`. Check a build with `apksigner verify --print-certs`.
- No `google.apiKey` is needed for 2.0 (the "API key is missing" warning is about 1.0 features and can be ignored).

## Tests

- **Dashboard:** `node graceview-tv-lab/tests/run-tests.js`. It must say all suites passed before anything is pasted into Apps Script. The tests run `Code.gs` and the page scripts in Node with stand-ins for Apps Script and the browser.
- **TV app:** `tv-app\build.ps1 -Release -Test` runs the unit tests first.
- **Emulator:** AVD `Television_1080p`. See `README.md`.

## Rules

- **1.0 stays untouched:** its repo, its Sheet, its Drive App Update folder, its updater and its TV app. The only exceptions are a TV's IP Address cell when that TV moves, and switching a TV back with `setup-stick.ps1 -Pkg org.graceview.tv -SkipInstall`.
- **ProPresenter and the Avantis console are read-only.** The app never sends them anything that changes them.
- **No paid services.** Flag anything that would cost money before doing it.
- **Secrets never go in git or in the Sheet:** the signing key, the Planning Center login (kept in the script's private storage, entered on Settings › Green Room), people's passwords. The built-in Drive API key in `Code.gs` (`BUILTIN_VIDEO_KEY`) is deliberately public: it's limited to the Drive API, and it's in every preview page.
- **Never sign in to the dashboard or type someone's password** on their behalf. Pairing a TV is done by a person on Screens › + Add a screen.
- **Don't uninstall the app from a TV or factory-reset anything:** pairing and settings would be lost. Pausing and switching versions are enough.
- **Keep docs in step:** when behaviour changes, update `graceview-tv-lab/SETUP.md`, and update this file when the live setup changes (a TV moves, a new deployment).

## Open items

- An automatic 2.0 updater on the church computer, like 1.0's. Until then, app updates are installed with `setup-stick.ps1`.
- Sign-ins are slow when nothing has used the dashboard for a while (Apps Script starts cold, and the server's cached copies expire after 5 to 15 minutes). Paired TVs checking in keep it warm. A 5-minute warm-up trigger was offered and declined for now.
- Quiet hours (see `BACKLOG.md`).
