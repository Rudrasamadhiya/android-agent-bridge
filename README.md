# android-agent-bridge

Give your AI agent (Claude Code, Cursor, Antigravity, or anything that speaks MCP or runs shell commands) your **whole Android phone**: it sees the screen, taps, types, scrolls and opens apps — in any app, not just your own.

- **Pair once by QR code** over Wi-Fi, or plug in **USB**. Both work, and the phone switches to Wi-Fi when you unplug.
- **Screenshots with numbered elements** so the agent says "tap 12" instead of guessing pixels, plus a **lettered grid** ("tap C7") for maps, games and images.
- **Typing without the keyboard**: text goes straight into the field.
- **Android 5.0 and newer** (phones from 2015 on).

```
 ┌──────────────┐  MCP / CLI   ┌───────────────────┐  Wi-Fi or USB  ┌──────────────────┐
 │ Claude Code, │ ───────────▶ │ android-agent-    │ ◀────────────▶ │ Agent Bridge app │
 │ Cursor, …    │              │ bridge (computer) │   WebSocket    │ (phone)          │
 └──────────────┘              └───────────────────┘                └──────────────────┘
```

## 1. Install the app on the phone

**Install it over USB (step 2b).** `usb` installs the app for you.

Opening the APK from WhatsApp, a browser or a file manager often fails with Google Play Protect's **"App blocked to protect your device"**. In some countries (India and others), Play Protect blocks sideloaded apps that use accessibility, with no "install anyway" option. Installs over USB with adb aren't blocked, so use `usb` once. After that the phone also works over Wi-Fi.

## 2a. Pair over Wi-Fi

```bash
npx android-agent-bridge start
```

Open **Agent Bridge** on the phone → **Scan QR code** → point it at the QR code in the terminal (or the bigger one at http://localhost:8350/pair). Then turn on the app's **accessibility service** with the button in the app.

Phone and computer must be on the same Wi-Fi. On Windows, allow Node.js through the firewall when asked.

## 2b. Or set up over USB

Turn on USB debugging (Settings → About phone → tap Build number 7 times → Developer options → USB debugging), plug in, then:

```bash
npx android-agent-bridge usb
```

This installs the app if needed, turns on its accessibility service, pairs it and starts the bridge. No QR code.

## 3. Connect your agent

```bash
npx android-agent-bridge init
```

Run it in your project: it adds the MCP server to `.mcp.json` (and `.cursor/mcp.json` with `--cursor`), plus a short guide for the agent. For other agents, add an MCP server with the command `npx -y android-agent-bridge`.

Then ask: *"Open WhatsApp on my phone and read the last message from Mom."*

## Tools

| MCP tool | CLI | What it does |
|---|---|---|
| `phone_status` | `status` | connected phone, Android version, capabilities |
| `phone_screen` | `screen [--mode marks\|grid\|both\|plain]` | screenshot with numbered elements / grid + element list |
| `phone_elements` | `elements [--all] [--ocr]` | element list only (cheap, text); `--all` includes covered elements, `--ocr` adds screen text |
| `phone_ocr` | `ocr` | text read from the screen pixels with positions (on-device ML Kit, offline) — finds controls apps hide from accessibility |
| `phone_tap` | `tap <target> [--long]` | tap or long-press |
| `phone_type` | `type <text> [--into t] [--submit]` | type into a field |
| `phone_scroll` | `scroll <dir> [--in t]` | scroll the screen or a list |
| `phone_swipe` | `swipe <from> <to>` | drag between two points |
| `phone_key` | `key <name>` | back, home, recents, notifications, quick_settings, enter, lock |
| `phone_open_app` | `open <app>` | open an app by name or package |
| `phone_apps` | `apps [filter]` | list installed apps |
| `phone_wait_for` | `wait <text>` | wait for text to appear |
| `phone_open_app` `store` | `launch <app> --store` | open an app, or its Play Store page if it isn't installed |
| `phone_volume` | `volume [stream] [up\|down\|mute\|40%\|…]` | media, ring, notification, alarm, call volume |
| `phone_brightness` | `brightness [0-100\|auto]` | screen brightness |
| `phone_toggle` | `flashlight` · `rotation` · `dnd` · `ringer` | quick switches |
| `phone_settings` | `settings <page>` | open wifi, bluetooth, display, battery… or an app's info page |
| `phone_open_link` | `url <link>` | web pages and deep links |
| `phone_dial` | `dial <number>` | dialer with the number filled in (never calls) |
| `phone_web_search` | `search <query>` | web search on the phone |
| `phone_device_info` | `battery` · `current` · `permissions` | battery, app in front, what the app may do |
| `phone_notifications` | `notifications` | notifications received since the service started |
| `phone_clipboard` | `clipboard [set <text>]` | read / set the clipboard |
| `phone_wake` | `wake` | turn the screen on (stays PIN-locked) |
| `phone_permissions` | `permissions grant` | switch on the one-time permissions over USB |
| `phone_stop_app` | `stop <package>` | force-stop an app (USB) |

A **target** is an element number (`12`), visible text (`Sign in`), a grid cell (`C7`) or pixels (`540,1200`). Text is matched in this order: exact or starts-with in the app → exact or starts-with in the screen text (OCR) → contains → the Android system bar.

The CLI commands need a running bridge: `start`, `usb`, or an agent's MCP session. All of them share one bridge.

## What works on which Android

| | 5.0–6.0 | 7.0–10 | 11+ |
|---|---|---|---|
| Element list, typing, clicking elements, back/home | ✅ | ✅ | ✅ |
| Tap anywhere (grid, pixels), swipes | over USB | ✅ | ✅ |
| Screenshots | tap "Allow screen capture" once per session, or USB | same | ✅ built in |
| Enter key | over USB | over USB | ✅ |

"Over USB" means the bridge does it through adb when the phone is plugged in with USB debugging.

Apps that block screen capture (banking, Netflix and similar) show up black in screenshots; their element list usually still works.

## Security

- Only a computer holding the pairing secret from the QR code can connect. `npx android-agent-bridge pair --reset` makes a new secret; every phone then has to scan again.
- Traffic on your Wi-Fi is not encrypted (plain WebSocket), so use it on networks you trust. Over USB it never leaves the cable.
- Turn off the accessibility service in the app (or Android settings) to cut access at once.
- The agent guide tells agents to ask before sending, paying or deleting, and never to type passwords.

## Building the app

```bash
cd android
./gradlew assembleRelease
```

Needs JDK 17 and the Android SDK (`ANDROID_HOME` or `android/local.properties`). The APK lands in `android/app/build/outputs/apk/release/`; copy it to `apk/agent-bridge.apk`.

## License

MIT
