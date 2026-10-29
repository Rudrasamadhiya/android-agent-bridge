# Setting up android-agent-bridge (for AI agents)

Follow these steps when the user asks you to give yourself access to their Android phone.

1. In the user's project, run `npx -y android-agent-bridge init`. It writes `.mcp.json` (server name `phone`) and an agent guide. Tell the user to restart the agent so the `phone_*` tools load.
2. The phone needs the **Agent Bridge** app. If the phone is plugged in with USB debugging on, `npx -y android-agent-bridge usb` installs and sets everything up. Otherwise the user installs `apk/agent-bridge.apk` from the package.
3. Pairing over Wi-Fi: the user runs `npx -y android-agent-bridge start`, opens the app, taps **Scan QR code** and turns on the accessibility service. With the MCP server running, the pairing page is at http://localhost:8350/pair.
4. Call `phone_status` to confirm. Then follow `skill/SKILL.md`.

Without MCP, use the CLI from the shell: `npx android-agent-bridge screen --out shot.jpg`, `tap 12`, `type "hello" --into 3 --submit`, and so on (`npx android-agent-bridge help`). Read the saved screenshot file to see it.
