# Graceview TV Lab: setup and guide

The lab is the dashboard for **Church Signage**: a web control panel that replaces the Google Sheet as the way people run the TVs. It has its own Sheet ("Graceview TV Lab") and Drive folders, and the TVs are either the native Church Signage app (`../tv-app`) or browser screens. Nothing here touches the live Graceview TV Sheet, Drive folders, TVs or the vMix PC.

## What's in it

| Piece | What it does |
|---|---|
| **Graceview TV Lab** (Google Sheet) | The data: Settings, Override, Weekly, Special Dates, Devices, Themes, Launchers, Green Room, Presets, Users, Activity, Lists |
| **Graceview Baptist Church Signage Slides** (Drive folder) | One shared folder of slide files per theme |
| `apps-script/Code.gs` | The server: scheduling rules, accounts and roles, pairing, the TV app's JSON connection, reads and writes to the Sheet and Drive |
| `apps-script/Panel.html` | The dashboard (Now, Devices, Override, Schedule, Themes, Slides, Activity, Launchers, Green Room, People, Account) |
| `apps-script/Tv.html` | A browser screen: pairs with a code, then plays one TV |
| `apps-script/Screen.html` | The 1920x1080 screen layouts, shared by the dashboard previews and browser screens |

## Install (about 10 minutes, once)

1. Open the **Graceview TV Lab** Sheet, then choose **Extensions > Apps Script**.
2. Replace everything in `Code.gs` with `apps-script/Code.gs`.
3. Add three HTML files with **+ > HTML**, named exactly `Panel`, `Tv` and `Screen` (the editor adds `.html`), and paste each file in.
4. **Project Settings** (gear icon): set the time zone to **(GMT-06:00) Central Time - Chicago**.
5. Choose **authorize** in the function list next to **Run**, click **Run**, and approve every permission (the Sheet, Google Drive, outside requests for weather and calendars). Google won't always ask on its own when a permission is added, so do this again whenever the code starts using something new.
6. **Deploy > New deployment > Web app**:
   - **Execute as:** Me
   - **Who has access:** Anyone (the TV app can't sign in to Google; the dashboard's own sign-in and TV pairing protect everything)
7. Copy the **Web app URL**.

**After a code change:** paste the changed files, then **Deploy > Manage deployments > pencil > Version: New version > Deploy**. The URL stays the same. A new version can take a minute to appear; refresh with Ctrl+Shift+R.

## First run and people

Open the Web app URL while signed in to the Google account that deployed it. A setup page asks for the church name, your name and a **backup password**, and makes you the **Owner**. With access set to "Anyone", Google may not identify you, so sign in with your email and that password.

On **People**, choose **Invite someone**, pick a role and send the one-time link (it expires in 7 days). They pick their own password.

| Role | Can do |
|---|---|
| Owner | Everything, including adding Admins |
| Admin | Everything: screens, schedule, themes, slides, launchers, Green Room, people |
| Staff | See every TV, upload and manage slides, start and end overrides, read the activity log |
| Limited | Edit only the themes and slides you pick, and see only the TVs you pick (a school or a renter) |

- **New link** resets a forgotten password (older links stop working). **Turn off** signs someone out at once; **Remove** deletes them.
- Passwords, sign-ins, invite links and the Planning Center login live in the script's private storage, never in the Sheet. Accounts lock for 15 minutes after 5 wrong passwords.
- People never need access to the Sheet or Drive: the app does the work for them.

## TVs

**Pairing:** a TV shows a 6-character code (the Church Signage app on a stick, or a browser at the Web app URL with `?screen`). On **Devices** (or **Now**), choose **Pair a TV**, type the code, and pick the TV or add a new one. It switches over within a few seconds and stays paired. Codes refresh every 15 minutes.

**Devices page:** every TV with its location, kind of screen, theme, launcher, what it's showing now, **Online** (checked in within 3 minutes) or last seen, and the IP address, model and app version the TV reports. Admins can **Edit** (renaming also updates schedule rows, overrides, presets and Limited users that name the TV), **Unpair** or **Remove** a TV. **Preview** shows what a TV shows (signed-in people only; add `&at=2026-11-22T10:45` to preview a time).

**Now page:** a live picture of every TV, plus buttons to preview the schedule at set times (Sunday 9:45 countdown, Sunday 10:45 live, the Wednesday overlap, Thanksgiving, Christmas Eve).

**The native app** (`../tv-app`, app ID `org.graceview.signage.lab`): installs alongside the live Graceview TV app. It asks the dashboard for its setup every 15 seconds and keeps the last good copy, so it keeps running if the internet drops. The schedule, launcher, power and transition logic are the original app's. Build and emulator notes are in `../README.md`.

## Schedule and overrides

The same rules as the live system: **Override** beats **Special Dates**, which beat **Weekly**; with nothing scheduled, each TV uses its default. **Override** has ready-made presets and can end on its own. **Schedule** shows the week as a grid and flags rows a higher row hides.

## Themes

- **Colors:** main and accent, each with a **text color**, a readability score and **Suggest text color**. Live previews show both bottom-bar layouts.
- **+ Add a theme** makes the theme and its own shared slides folder in Drive.
- **Fallback theme:** one theme (Church to start) is the fallback. A TV whose theme is missing shows it.
- **Delete theme…** shows what will change first (TVs move to the fallback; schedule rows, the override and presets follow each TV's theme; Limited users lose it), then deletes on confirm. Its slides folder stays in Drive. The fallback can't be deleted.
- **Calendar:** a ShelbyNext or other `webcal://` or `https://….ics` link, or a public Google Calendar ID (several with `;`). **Calendar Hide** drops events by title. Every theme starts with a US-holidays stand-in.

## Slides

Slides are uploaded files only (JPG, PNG, MP4). Each theme has a folder in Drive, shared "anyone with the link can view" so every TV can load it.

- Add files on the **Slides** page (drag and drop, up to 45 MB) or straight into the Drive folder. TVs pick them up within about a minute.
- **Order** is the file name (`01 Welcome.jpg`); the ↑ ↓ buttons renumber. **Dates** are tags in the name: `[from 12-01]`, `[until 2026-12-24]`; the date boxes write them. **`[full]`** plays a whole video (up to 3 minutes).
- **Delete** moves the file to Drive's trash (restorable for 30 days).
- A folder linked by hand that isn't shared shows a warning with a **Make viewable by link** button.

## Launchers

A launcher is the home screen people see when they leave the slides (or all the time on a classroom TV). On **Launchers**, pick tiles and their order: built-ins (Watch Live, Return to Signage, Announcements, Green Room Dashboard, Screen Mirror, HDMI, YouTube, Web Browser, Get Apps, All Apps, Settings), **any app** (TVs report their installed apps every hour) or **a website**. Choose which TVs use it and how long a signage TV waits idle before going back. TVs leave out tiles that don't apply there. Website tiles need a browser app on the TV; stock Google TV has none.

## Green Room

On **Green Room**: the **Planning Center login** (personal access token: Application ID and Secret; shown only as "Saved, ID …abcd" and sent only to Green Room TVs, which store it encrypted), the service type, mic assignment source, ProPresenter address and timer, Avantis address and MIDI channel, and the **mic map**. **Connections** shows whether each Green Room TV reaches Planning Center, ProPresenter and the Avantis (reported while its dashboard is open). ProPresenter and the Avantis are read-only and only reachable from the church network. The addresses in the lab are stand-ins.

## Known limits

- Apps Script is slower than a real server: a save takes 1 to 3 seconds; TVs see changes within about 15 seconds.
- Browser screens can't play the live feed or video from Drive (videos show as a still). The native app plays both.
- Calendar times are read as Central time unless the feed says otherwise.
