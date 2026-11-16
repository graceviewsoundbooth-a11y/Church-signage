GRACEVIEW EVENT SCREEN SERVER
=============================
Runs on the vMix computer. Any computer on the church network (Mac or Windows) shows the
Event Screen in a web browser: announcements, This Week, QR codes, clock and weather, the
countdown, messages, and the vMix live feed. It follows the Sheet like the TVs (the
"Event Screen" row in the Devices tab).

This folder has the Google API key built in. Keep it inside the church.


INSTALL (once, on the vMix computer)
------------------------------------
1. Unzip GraceviewEventServer.zip to C:\GraceviewEventServer
2. Open Command Prompt and run:
     C:\GraceviewEventServer\GraceviewEventServer.exe --install
   Windows asks to allow changes (that's the firewall rule, so other computers can reach it):
   click Yes. Then click Yes to start it now.
3. The message lists the address to open, for example  http://192.168.0.115:8090
   Check:  C:\GraceviewEventServer\GraceviewEventServer.exe --check

It starts by itself every time Windows signs in. To remove it: --uninstall


SHOWING IT ON A PROJECTOR OR THE SANCTUARY SCREENS
---------------------------------------------------
1. On the computer connected to the screen (on the church network, not guest Wi-Fi), open
   Chrome, Edge or Safari and go to  http://192.168.0.115:8090
2. The first time, pick "Event Screen".
3. Drag the browser window to the projector, then click the page (or press F) for full screen.
   Esc leaves full screen.
Tip: bookmark  http://192.168.0.115:8090/?device=Event%20Screen

Keys (Mac keyboards: use the number keys, or fn + F1-F4):
  F1 or 1   Signage            F2 or 2   Full-screen announcements
  F3 or 3   Live (vMix feed)   F4 or 4   back to the Sheet's schedule
  F         full screen        Ctrl+D (Cmd+D on a Mac)  pick another device
A key only changes that computer, until the next scheduled change or F4.

Live: with "Mute Live" checked for Event Screen in the Devices tab, the feed has no sound and
is about 1 second behind. Unchecked, it has sound and is a few seconds behind. If the
browser blocks the sound, click the page once.


WHEN SOMETHING'S WRONG
----------------------
- The page says it can't reach the server: is the vMix computer on? Run --check there.
- Log: %LOCALAPPDATA%\GraceviewEventServer\log.txt on the vMix computer.
- Testing: add ?fakeNow=2026-11-15T15:05:00 to the address to see the schedule at another time.
