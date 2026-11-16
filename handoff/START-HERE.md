# Graceview TV: ideas handoff

This is a brainstorming brief for a fresh chat. It describes the signage system as built on 2026-11-16, so ideas can be explored and sketched before any of them are built in the real project.

## How to use this

1. Start a new chat and attach this file, plus anything from `screens/` and `design/` that's relevant.
2. Paste this as your first message:

> I run the TV signage system described in START-HERE.md at Graceview Baptist Church. I want to play with ideas before building anything. Treat the "Hard rules" and "Decided" items as fixed unless I say otherwise. When an idea settles, write it up using the "Bringing an idea back" format at the end of the file, so I can paste it into the chat that has the code.

3. When an idea is ready, paste its write-up into the Claude Code session that has the repo (`C:\Graceview\graceview-tv`). That session checks it against the code and `CLAUDE.md`, then builds it.

There's no code, API key or password in this package. Mockups made here are sketches. The real screens are 1920x1080 and follow the design rules below.

---

## What exists today

One Android TV app (Kotlin, Jetpack Compose for TV) runs every TV in the building. A Google Sheet controls what each TV shows and when. Slides come from Google Drive folders, events from church calendars, and weather from Open-Meteo.

| Piece | What it is | Runs on |
|---|---|---|
| TV app (APK) | Signage, scheduler, launcher, live feed, Green Room dashboard | Onn Google TV sticks, Fire TV sticks, an NVIDIA Shield |
| Control Sheet | "Graceview TV Schedules and Settings" in Google Sheets | Google |
| Drive folders | One per theme (Church, School, Renter, Special Events), plus App Update | Google Drive |
| TV updater | Installs new APK builds from Drive onto every TV over the network, every 15 min; writes App Version / Now Showing / Last Seen back to the Sheet | The vMix PC (Windows, always on) |
| Event Screen web server | The same signage screens as a web page any computer on the church network can open (most production computers are Macs) | The vMix PC, port 8090 |
| Event Screen desktop app | Windows backup of the web version | Any Windows PC |
| MediaMTX | Takes vMix's stream and re-serves it as RTSP (TVs), WebRTC and HLS (browsers) | The vMix PC |

Shared rules (Sheet parsing, the scheduler, Drive sync, calendar, weather, live checks) live in one Kotlin `core` module used by the TV app, the desktop app and the web server.

## The TVs

| Device name | Profile | Hardware | Notes |
|---|---|---|---|
| Lobby | Signage | Onn Google TV 4K Pro (Android 14) | Church theme, has wayfinding arrows |
| Coffee Spot | Signage | NVIDIA Shield | School theme on weekdays |
| Front Office | Signage | Fire TV (Fire OS 7) | Renter theme (Salem Lutheran Early Childhood) on weekdays |
| Green Room | Green Room | Fire TV Stick 4K 1st gen (Fire OS 6) | Worship-team dashboard |
| Classrooms | Classroom | Onn sticks (planned) | Branded launcher |
| Event Screen | Signage | A browser (web version) | Projector / sanctuary screens for events |

Profiles:
- **Signage:** shows signage on a schedule and turns the TV on and off. People can still leave it to use other apps.
- **Classroom:** a branded home screen with rotating announcements behind an app row (Watch Live, Screen Mirror, HDMI, YouTube, browser, apps, settings). No scheduled power.
- **Green Room:** the classroom home screen plus a dashboard combining Planning Center, ProPresenter, the Avantis mixer and the live feed.

## How the Sheet controls everything

Tabs: **Override Now**, **Special Dates**, **Weekly**, **Devices**, **Themes**, **Folders**, **Live Feeds**, **Green Room**, **Status**, **Lists**.

What a TV shows right now is decided in this order (the first match wins):
1. **Override Now**: one block with an Active checkbox, Devices, Mode, Theme and Message. Checked every 30 seconds, applied within about 5 seconds.
2. **Special Dates**: a date range plus a daily time window.
3. **Weekly**: Day (Sun–Sat, Weekdays, Daily), Start, End, Devices, Mode, Theme, Folder.
4. Nothing matched: Signage and Green Room TVs turn Off; Classroom TVs show the launcher; the Event Screen shows its Default Mode.

Devices can be targeted as `ALL`, `ALL SIGNAGE`, `CLASSROOMS`, or one device name. Times are America/Chicago; Start is inclusive, End exclusive. The full Sheet is read every 3 minutes, and the last good copy keeps running if a fetch fails.

**Modes:** Signage, Fullscreen (slides only), Countdown (slides plus a bar counting down to the row's End time, "Worship begins in"), Live, Live Option (Watch Live tile on classroom launchers), Launcher, Message (full-screen text, header "IMPORTANT UPDATE"), Dashboard (Green Room), Off (TV sleeps through HDMI-CEC).

**Per-device settings (Devices tab):** Profile, Default Theme and Folder, Idle Return minutes, Exit Confirm, Mute Live (scheduled Live plays silently), Wayfinding Left/Right overrides, and Default Mode (Event Screen only).

**Themes tab:** Main and Accent colors, Display Name, a logo for dark and for light backgrounds, Wayfinding Left/Right (semicolon lists), QR code link, Calendar (ShelbyNext webcal feed or a public Google Calendar ID), Guest Wi-Fi name/password (made into a Wi-Fi QR), Calendar Hide (titles to leave out).

Current themes: Church #CF2020 / #B50606, School #263D5A / #0C2340, Renter #18453B / #68B1A1, Special Events #B6562A / #DBBA33 (one theme for Christmas, Easter, VBS and so on; recolor it in the Sheet per event).

## The signage screen

1920x1080: a 1536x864 slide area top-left, a 384x864 sidebar ("This Week" with 3–4 upcoming events, then QR codes for info and guest Wi-Fi), and a 216-high bottom bar of five 384-wide cells: clock, date, wayfinding left, wayfinding right, logo plus weather. Cells alternate Main and Accent colors. Without wayfinding, the bar becomes clock, weather, logo on white, date. See `screens/lobby-signage.png` and `screens/coffee-spot-signage.png`.

**Slides:** JPG, PNG or MP4 from the theme's Drive folder, sorted by file name (uploaders control order with number prefixes), synced every 10 minutes. Each shows for up to 12 seconds; videos play muted and stop at 12 seconds unless the file name contains `[full]` (then up to 3 minutes). Slides fit without cropping, with gaps filled in the theme color.

**This Week:** events in the next 7 days, refreshed every 15 minutes, with end times ("Thu · 6:00–7:30 PM"). The church feed is ShelbyNext and full of daily "Early Learning Center" and "Private Event" entries, which the Hide list removes.

## Live feed

- vMix in the sanctuary streams to MediaMTX on the same PC. TVs play it over RTSP (about 1–3 seconds behind), browsers over WebRTC (about 1 s, no sound) or HLS (with sound, a few seconds).
- A YouTube row in Live Feeds opens the YouTube app instead (20–30 s behind).
- A Watch Live tile appears on home screens whenever the feed is actually live (YouTube's live badge is checked from the channel page, the local stream with an RTSP probe), not only during scheduled Live rows.
- Players show a "Connecting to the sanctuary feed…" cover, retry after 5 s, and reconnect when the picture freezes for 10 s.

## Green Room dashboard

Dark UI (#111418 background, #1B2027 panels). Top bar: logo, plan title and date, the ProPresenter sermon timer, a LIVE badge or "Service starts in" countdown, and the clock. A yellow stage-message strip appears when ProPresenter has one. Left: the live video, then mic assignments (who's on which handheld or headset, red LIVE or gray MUTED badges from the Avantis). Right: Order of Service (done items dimmed, NOW highlighted, following ProPresenter's active playlist item), then the band.

Every source is optional: if Planning Center, ProPresenter or the Avantis can't be reached, only its parts hide. Panels with data over 2 minutes old show "last updated." On Sunday 7:30 AM–12:30 PM and Thursday 6–9 PM; off otherwise.

## Launcher and navigation

- Google TV: the app is the Home app, and an accessibility service catches the Home button. Fire TV always sends Home to Amazon's launcher, so there the home screen is reached from inside the app.
- Signage TVs: Back or Home shows "Press OK to open the home screen" (when Exit Confirm is checked). A Return to Signage tile comes first on the home screen. After Idle Return minutes with no input, the home screen goes back to signage.
- Scheduled changes only act at transition times. If someone is using the TV (another app, or a button press in the last 10 minutes), it asks "Switching to [mode] in 60 seconds. Press OK to stay."
- No PIN locks anywhere.

## Hard rules (don't design around these)

- **The Avantis mixer is read-only.** The app may never send anything that changes the console (faders, mutes, names, scenes). It's enforced in code with a whitelist and a test.
- **ProPresenter is read-only.** No endpoint that triggers, clears or changes anything.
- **No Google Play services.** Fire TV has none. Everything works over plain HTTP with one Google API key, restricted to Drive, Sheets and Calendar, which never leaves the church (it's built into the APK and the Event Screen server).
- **The oldest device is Fire OS 6 (Android 7.1, API 25).** Anything on the TV must run there.
- **The Planning Center token** lives only in encrypted storage on the Green Room stick. Never in the Sheet, a repo or logs.
- **Sheets API quotas:** 60 reads per minute per user, 300 per project. Each TV does 2 small reads a minute plus a full read every 3 minutes, so a feature that adds Sheet reads per TV has to fit in that budget.
- **No public website.** The Event Screen lives on the church network because the API key would be exposed, the vMix feed only exists inside, and the ShelbyNext feed won't let browsers read it.
- **Amazon Fire TV devices running Vega OS** can't run the app. Only Fire OS devices.

## Design rules

- Built for 10-foot viewing on a 90-inch TV: nothing under 22px at 1080p, high contrast, a clear focus ring on everything the remote can select.
- Fonts: Source Sans 3 (body, clock, numbers; weight 300 for big numerals) and Montserrat (headings).
- Colors come from the Sheet at runtime, never hard-coded.
- A layout change to the signage screens currently has to be made three times: the TV app, the Windows desktop app and the web page. Ideas that touch layout should note that cost, or propose sharing the UI.

## Decided (change only on purpose)

12 seconds per slide; the Sheet as the only control panel; precedence Override > Special Dates > Weekly > default; Mute Live on Lobby, Coffee Spot and Front Office; Green Room schedule; web Event Screen served from the vMix PC, with the Windows app as a backup; the TV updater on the vMix PC; Fire devices on signage TVs only, Onn sticks in classrooms.

## Known limits and open items

- The LG TV at the church refuses CEC Standby, so it can't be turned off by the stick; it uses its own off timer.
- The Avantis can't report a mic's mute state until it changes (its protocol has no "get mute").
- Not yet seen during a real service: the "On screen: Slide x of y" line, and the dashboard across a full Sunday.
- School, Renter and Special Events calendars, and some logos, aren't filled in yet.
- The Event Screen hasn't been tried on a Mac or Safari, with the real vMix feed, or on a projector. WebRTC can't play H.264 with B-frames; it falls back to HLS.
- In progress: offering Salem Lutheran Early Childhood (the renter) their own weekday theme on the Front Office TV, 6:30 AM–6:30 PM, with their own upload folder and a one-page guide.

## Files in this package

- `screens/lobby-signage.png`: the Lobby TV (Church theme with wayfinding), a screenshot from the real TV on 2026-11-13.
- `screens/coffee-spot-signage.png`: the Coffee Spot TV (School theme, no-wayfinding bottom bar).
- `design/*.html`: the approved screen designs at 1920x1080. Open them in a browser. Lobby-Signage, Lobby-Countdown, Lobby-Live, CoffeeSpot-School, FrontOffice-Renter, Classroom-Home, Special-Christmas (now "Special Events"), Special-Override (the Message mode), GreenRoom-Home, GreenRoom-Dashboard, GreenRoom-Offline.

---

## Bringing an idea back

When an idea is ready to build, write it up like this and paste it into the coding session:

```
IDEA: <short name>

What it does (for the people who see or use it):
<2-4 sentences>

Which screens / devices / profiles it touches:
<list>

Sheet changes (new tab, columns, or values; who edits them):
<list, or "none">

Rules and edge cases:
- What happens when data is missing or a source is down
- How it interacts with Override Now / Special Dates / Weekly
- Fire OS 6 and Fire TV limits, if relevant

Decided items or hard rules it changes (if any), and why:
<list, or "none">

Mockup (optional): HTML at 1920x1080 using the theme colors and fonts above
```
