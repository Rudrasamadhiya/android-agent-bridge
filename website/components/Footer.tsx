import Link from "next/link";
import { GITHUB, NPM, VERSION, asset } from "@/lib/site";

const COLS = [
  { h: "Product", l: [["Features", "/#features"], ["Live demo", "/#demo"], ["Download", "/download/"], ["Compatibility", "/#compat"]] },
  { h: "Docs", l: [["Quick start", "/docs/#quick-start"], ["Commands", "/docs/#commands"], ["MCP tools", "/docs/#mcp"], ["Troubleshooting", "/docs/#troubleshooting"]] },
  { h: "Project", l: [["GitHub", GITHUB], ["npm", NPM], ["Releases", `${GITHUB}/releases`], ["Report an issue", `${GITHUB}/issues`]] },
  { h: "More", l: [["MIT license", `${GITHUB}/blob/main/LICENSE`], ["Security", "/#security"], ["Changelog", "/docs/#changelog"]] },
];

export default function Footer() {
  return (
    <footer className="footer">
      <div className="wrap footer-grid">
        <div className="footer-brand">
          <Link className="brand" href="/"><img src={asset("/icon.svg")} alt="" width={28} height={28} />Agent Bridge</Link>
          <p>Give your AI agent a real phone. Open source, made by <a href="https://github.com/Rudrasamadhiya">Rudra Samadhiya</a>.</p>
          <p className="hud">v{VERSION} · MIT</p>
        </div>
        {COLS.map((c) => (
          <div key={c.h} className="footer-col">
            <h4>{c.h}</h4>
            {c.l.map(([t, h]) => (h.startsWith("http") ? <a key={t} href={h}>{t}</a> : <Link key={t} href={h}>{t}</Link>))}
          </div>
        ))}
      </div>
      <div className="wrap footer-base"><span>© 2026 Agent Bridge contributors.</span><span>Android is a trademark of Google LLC. Not affiliated with Google, Anthropic or Uber.</span></div>
    </footer>
  );
}
