// Prompts to paste into any agent once the phone is connected, grouped by what people try first.
export const PROMPT_GROUPS: { id: string; title: string; blurb: string; prompts: string[] }[] = [
  {
    id: "first",
    title: "First five minutes",
    blurb: "Check everything works and get a feel for it.",
    prompts: [
      "Is my phone connected? Tell me the model and Android version.",
      "Take a screenshot of my phone and tell me what's on screen.",
      "Open the Settings app on my phone and tell me the battery level.",
      "Turn my phone's media volume to 30% and brightness to 60.",
    ],
  },
  {
    id: "everyday",
    title: "Everyday",
    blurb: "Hands-free help with apps you already use.",
    prompts: [
      "Open YouTube on my phone and search for lofi music. Don't play anything yet.",
      "Read my phone's notifications and summarise them by app. Don't open or reply to anything.",
      "Open Maps on my phone and find the nearest petrol station. Tell me the distance.",
      "Open WhatsApp and read me the last message from Mom. Don't reply.",
      "Turn on Do Not Disturb and set an alarm in the Clock app for 7:00 am.",
    ],
  },
  {
    id: "dev",
    title: "For developers",
    blurb: "Test and debug the Android app you are building.",
    prompts: [
      "Open my app (com.example.app) and go through sign-up with a test account. Report anything broken.",
      "Test the checkout flow in my app like a QA tester: empty fields, back button, rotation. Give me a bug list with steps.",
      "Take screenshots of every screen in my app and describe the layout issues you see.",
      "Open my app, rotate the phone to landscape, and tell me which screens break.",
    ],
  },
  {
    id: "files",
    title: "Files",
    blurb: "Move files between the computer and the phone.",
    prompts: [
      "Send ./report.pdf to my phone and tell me where it was saved.",
      "What files has my phone sent to this computer? List them with sizes.",
      "Send every PDF in this folder to my phone.",
    ],
  },
];

// The MCP server's built-in prompts. In Claude Code they are slash commands: /mcp__phone__<name>.
export const MCP_PROMPTS: { name: string; title: string; args: string; does: string }[] = [
  { name: "phone_tour", title: "Check the phone", args: "", does: "Confirms the phone is connected and describes the screen." },
  { name: "do_in_app", title: "Do something in an app", args: "app, task", does: "Opens an app and carries out a task step by step." },
  { name: "test_my_app", title: "Test my app", args: "app, focus?", does: "QA walkthrough with a bug report at the end." },
  { name: "catch_up", title: "Catch me up", args: "", does: "Summarises notifications, urgent first." },
  { name: "set_up_phone", title: "Set the phone up", args: "settings", does: "Volume, brightness, Do Not Disturb in one go." },
  { name: "send_to_phone", title: "Send files to the phone", args: "files", does: "Sends files and confirms where they landed." },
];

// The commands people use most, for the cheat sheet.
export const CHEATSHEET: { group: string; rows: [string, string][] }[] = [
  { group: "Set up", rows: [
    ["npx android-agent-bridge usb", "Install the app over USB, switch it on, pair, start"],
    ["npx android-agent-bridge start", "Start the bridge and show the pairing QR code"],
    ["npx android-agent-bridge init", "Add the MCP server to this project"],
    ["phonectl status", "Is the phone connected?"],
  ] },
  { group: "Look and act", rows: [
    ["phonectl screen --out shot.jpg", "Screenshot with numbered elements"],
    ["phonectl elements", "Numbered list of what's on screen"],
    ["phonectl tap 12", "Tap element 12 (or \"Sign in\", C7, 540,1200)"],
    ["phonectl type \"hello\" --into 5 --submit", "Type into a field and press Enter"],
    ["phonectl scroll down", "Scroll the main list"],
    ["phonectl key back", "back, home, recents, notifications"],
  ] },
  { group: "Apps and device", rows: [
    ["phonectl launch YouTube", "Open an app by name"],
    ["phonectl volume 40%", "Media volume (ring, alarm, …)"],
    ["phonectl brightness 70", "Screen brightness, or auto"],
    ["phonectl dnd on", "Do Not Disturb"],
    ["phonectl battery", "Battery level and charging"],
  ] },
  { group: "Files", rows: [
    ["phonectl send photo.jpg", "Send to the phone's Downloads/Agent Bridge"],
    ["phonectl received", "Files the phone sent to this computer"],
    ["phonectl drop", "Drag-and-drop page in the browser"],
  ] },
];
