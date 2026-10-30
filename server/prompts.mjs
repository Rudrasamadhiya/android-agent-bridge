// Ready-made prompts the MCP server offers. Clients show them as one-click starters
// (Claude Code: /mcp__phone__<name>). Each one sets the agent up to work safely.
import { z } from 'zod';

const SAFETY = 'Before sending a message, posting, paying, deleting or changing account settings, stop and ask me. Never type passwords or card numbers; ask me to do that on the phone.';

const msg = (text) => ({ messages: [{ role: 'user', content: { type: 'text', text } }] });

export const PROMPTS = [
  {
    name: 'phone_tour',
    title: 'Check the phone',
    description: 'Confirm the phone is connected and describe what is on screen right now.',
    args: {},
    text: () => `Use the phone tools. Call phone_status to check my Android phone is connected (if it isn't, tell me how to pair it). Then take a phone_screen and tell me in two or three sentences which app is open and what I could do from here.`,
  },
  {
    name: 'do_in_app',
    title: 'Do something in an app',
    description: 'Open an app on the phone and carry out a task in it, step by step.',
    args: {
      app: z.string().describe('App name, e.g. "YouTube" or "Settings"'),
      task: z.string().describe('What to do, e.g. "play the latest video from MKBHD"'),
    },
    text: ({ app, task }) => `On my Android phone, open ${app} and ${task}. Work step by step: after each action, read the updated element list and decide the next step; take a phone_screen only when you need to see images or layout. ${SAFETY} When you're done, tell me what you did and what's on screen now.`,
  },
  {
    name: 'test_my_app',
    title: 'Test my app',
    description: 'Walk through an app like a QA tester and report anything broken or confusing.',
    args: {
      app: z.string().describe('App name or package, e.g. "com.example.shop"'),
      focus: z.string().optional().describe('Optional: a flow to focus on, e.g. "sign-up and checkout"'),
    },
    text: ({ app, focus }) => `Test ${app} on my Android phone like a careful QA tester${focus ? `, focusing on ${focus}` : ''}. Open it, go through its main screens and flows, and try edge cases (empty fields, back button, rotating, long text). Take a phone_screen of anything that looks wrong. ${SAFETY} Finish with a short report: what works, bugs found (with steps to reproduce), and UX issues.`,
  },
  {
    name: 'catch_up',
    title: 'Catch me up',
    description: 'Summarise the notifications that arrived on the phone.',
    args: {},
    text: () => `Read the notifications on my Android phone with phone_notifications and give me a short summary grouped by app, with anything that looks urgent first. Don't open or reply to anything.`,
  },
  {
    name: 'set_up_phone',
    title: 'Set the phone up',
    description: 'Change volume, brightness, Do Not Disturb and other quick settings in one go.',
    args: {
      settings: z.string().describe('What you want, e.g. "media volume 30%, brightness 60, Do Not Disturb on"'),
    },
    text: ({ settings }) => `On my Android phone, set: ${settings}. Use phone_volume, phone_brightness and phone_toggle where they fit; fall back to phone_settings and the screen only if needed. Then report the final values.`,
  },
  {
    name: 'send_to_phone',
    title: 'Send files to the phone',
    description: 'Send files from this computer to the phone and confirm where they landed.',
    args: {
      files: z.string().describe('File paths on this computer, separated by commas'),
    },
    text: ({ files }) => `Send these files from this computer to my Android phone with phone_send_files: ${files}. Then tell me where each one was saved on the phone.`,
  },
];

export function registerPrompts(server) {
  for (const p of PROMPTS) {
    server.registerPrompt(p.name, { title: p.title, description: p.description, argsSchema: p.args }, (args) => msg(p.text(args || {})));
  }
}
