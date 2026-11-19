# Graceview TV Lab: setup and guide

The lab is the dashboard for **Church Signage**: a web control panel that replaces the Google Sheet as the way people run the TVs. It has its own Sheet ("Graceview TV Lab") and Drive folders, and the TVs are either the native Church Signage app (`../tv-app`) or browser screens. Nothing here touches the live Graceview TV Sheet, Drive folders, TVs or the vMix PC.

## The dashboard

Four sections, plus the red **Override** button at the top:

- **Screens:** **Now showing** has a live preview of every screen with Edit and Override ("See a different time" previews any moment); **Manage screens** lists them with status, IP and app version. **+ Add a screen** pairs one.
- **Schedule:** weekly rows and special dates.
- **Content:** **Slides** (uploads per theme) and **Look & details** (theme colors, logo, wayfinding, QR, Wi-Fi, calendars). Staff see Slides only.
- **Settings:** Church, People, Home screens, Green Room, Recent activity, Your account.

On a phone the sections become a bar at the bottom. The corner button switches light and dark.

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

**After a code change:** paste the changed files, then **Deploy > Manage deployments > pencil > Version: New version > Deploy**. The URL stays the same. A new version can take a minute to appear; refresh with Ctrl+Shift+R. If you use the website loader, its page copy updates itself on the next visit.

## First run and people

Open the Web app URL while signed in to the Google account that deployed it. A setup page asks for the church name, your name and a **backup password**, and makes you the **Owner**. With access set to "Anyone", Google may not identify you, so sign in with your email and that password.

On **Settings → People**, choose **Invite someone**, pick a role and send the one-time link (it expires in 7 days). They pick their own password.

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

**Pairing:** a TV shows a 6-character code (the Church Signage app on a stick, or a browser at the Web app URL with `?screen`). On **Screens**, choose **+ Add a screen**, type the code, and pick the screen or add a new one. It switches over within a few seconds and stays paired. Codes refresh every 15 minutes.

**Devices page:** every TV with its location, kind of screen, theme, launcher, what it's showing now, **Online** (checked in within 3 minutes) or last seen, and the IP address, model and app version the TV reports. Admins can **Edit** (renaming also updates schedule rows, overrides, presets and Limited users that name the TV), **Unpair** or **Remove** a TV. **Preview** shows what a TV shows (signed-in people only; add `&at=2026-11-22T10:45` to preview a time).

**Now page:** a live picture of every TV, plus buttons to preview the schedule at set times (Sunday 9:45 countdown, Sunday 10:45 live, the Wednesday overlap, Thanksgiving, Christmas Eve).

**The native app** (`../tv-app`, app ID `org.graceview.signage.lab`): installs alongside the live Graceview TV app. It asks the dashboard for its setup every 15 seconds and keeps the last good copy, so it keeps running if the internet drops. The schedule, launcher, power and transition logic are the original app's. Build and emulator notes are in `../README.md`.

## Schedule and overrides

The same rules as the live system: **Override** beats **Special Dates**, which beat **Weekly**; with nothing scheduled, each TV uses its default. **Override** (the red button at the top, always there) has ready-made presets and can end on its own; while one runs the button turns solid red. **Schedule** shows the week as a grid and flags rows a higher row hides.

## Themes

- **Colors:** main and accent, each with a **text color**, a readability score and **Suggest text color**. Live previews show both bottom-bar layouts.
- **+ Add a theme** makes the theme and its own shared slides folder in Drive.
- **Duplicate…** makes an event theme from an existing one: logo, wayfinding, QR, Wi-Fi and calendar are copied, and you set the new name, name on screens and colors. Slides can start in a new empty folder, as copies of the original, or share the original folder.
- **Fallback theme:** one theme (Church to start) is the fallback. A TV whose theme is missing shows it.
- **Delete theme…** shows what will change first (TVs move to the fallback; schedule rows, the override and presets follow each TV's theme; Limited users lose it), then deletes on confirm. Its slides folder stays in Drive unless you tick **Also move its slides folder to Google Drive's trash** (restorable for 30 days; not offered when another theme shares the folder). The fallback can't be deleted.
- **Calendars for This Week:** a **Main calendar** plus optional **fallbacks**. Each is a ShelbyNext or other `webcal://` or `https://….ics` link, or a public Google Calendar ID. If the main calendar has fewer than 3 events in the next 7 days, the fallbacks fill This Week up to 4, in order, each event once; a fallback that can't be read is skipped. Use ↑↓ to reorder, and **Check all calendars** to test every link (each shows its event count and whether it's in use). TVs get the whole list and apply the same rule. **Hide calendar events containing** drops events by title. Every theme starts with a US-holidays stand-in.

## Slides

Slides are uploaded files only (JPG, PNG, MP4). Each theme has a folder in Drive, shared "anyone with the link can view" so every TV can load it.

- Add files under **Content → Slides** (drag and drop, up to 45 MB) or straight into the Drive folder. TVs pick up files added on the dashboard within about a minute, and files dropped straight into Drive within about 5 minutes.
- **Order** is the file name (`01 Welcome.jpg`); the ↑ ↓ buttons renumber. **Dates** are tags in the name: `[from 12-01]`, `[until 2026-12-24]`; the date boxes write them. **`[full]`** plays a whole video (up to 3 minutes).
- **Delete** moves the file to Drive's trash (restorable for 30 days).
- A folder linked by hand that isn't shared shows a warning with a **Make viewable by link** button.

## Launchers

A launcher is the home screen people see when they leave the slides (or all the time on a classroom TV). On **Settings → Home screens**, pick tiles and their order: built-ins (Watch Live, Return to Signage, Announcements, Green Room Dashboard, Screen Mirror, HDMI, YouTube, Web Browser, Get Apps, All Apps, Settings), **any app** (TVs report their installed apps every hour) or **a website**. Choose which TVs use it and how long a signage TV waits idle before going back. TVs leave out tiles that don't apply there. Website tiles need a browser app on the TV; stock Google TV has none.

## Green Room

On **Settings → Green Room**: the **Planning Center login** (personal access token: Application ID and Secret; shown only as "Saved, ID …abcd" and sent only to Green Room TVs, which store it encrypted), the service type, mic assignment source, ProPresenter address and timer, Avantis address and MIDI channel, and the **mic map**. **Connections** shows whether each Green Room TV reaches Planning Center, ProPresenter and the Avantis (reported while its dashboard is open). ProPresenter and the Avantis are read-only and only reachable from the church network. The addresses in the lab are stand-ins.

## Church

On **Settings → Church** (Owner and Admin), the church-wide settings, stored on the Sheet's Settings tab. **Settings** also holds **People**, **Home screens**, **Green Room**, **Recent activity** and **Your account** (password); each person sees only the tabs their role allows.

- **Church name** and **website** (e.g. `graceview.org`).
- **Logo:** upload a PNG or JPG (saved as "Church logo" in the slides folder, shared by link; replacing it trashes the old one). It's on every emergency message, and any theme with no logo of its own uses it.
- **Guest Wi-Fi:** name and password for the Wi-Fi QR code on any theme with no Wi-Fi of its own. A theme's own logo or Wi-Fi always wins; the theme editor shows the church default in gray.
- **Weather location:** search a town or ZIP code (Open-Meteo's free place search, no key) and pick it. This also sets the time zone. You can rename the label shown next to the temperature. **No weather** leaves the weather spot empty. Choose **°F or °C**.
- **Time zone:** schedules, clocks and calendar times all use it.
- **Wording on the screens:** the line under an Override Now message and the This Week text when the calendar is empty. Leave them blank to use wording built from the website ("Watch graceview.org and your email for updates.", "See all events at graceview.org"). A preview shows the emergency message.

Paired TVs pick up changes on their next check-in. The weather refreshes right away when its location or unit changes.

## The dashboard at the church's own address

A browser signed into more than one Google account can't open the Apps Script link (Google Drive's "Sorry, unable to open the file"). So the church website hosts a small loader instead, at an address like **graceview.org/signage**:

1. On the website, make a page at that address (not a redirect) and add a custom code block (Clover: a **Custom Code** section).
2. Paste in the whole of [site/loader.html](site/loader.html). It fetches the dashboard from the web app without the browser's Google accounts and replaces the page with it.
3. On **Settings → Church**, set **Dashboard address** to that page. Invite links then use it.

On that page everyone signs in with their dashboard password, the Owner too (the backup password from setup). First-time setup still needs the Google link. The loader only calls the dashboard's own functions (listed in `panelApi_` in Code.gs), and each checks the sign-in. "New version" deployments keep the same link; a brand-new deployment means updating `EXEC` in the loader.

## Known limits

- **"Sorry, unable to open the file at this time" (Google Drive page):** the browser is signed into more than one Google account, and the link picked up a `/u/1/`, `/u/4/`… part. Open the dashboard in a private or Incognito tab (or sign out of the extra accounts). Nobody needs a Google account to use it.
- Apps Script is slower than a real server: a save takes 1 to 3 seconds; TVs see changes within about 15 seconds.
- Browser screens can't play the live feed or video from Drive (videos show as a still). The native app plays both.
- Calendar times without a zone in the feed are read in the church's time zone.
