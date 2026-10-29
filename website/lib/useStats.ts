"use client";
import { useEffect, useState } from "react";
import { APK_FALLBACK, PKG, REPO } from "./site";

export type Stats = { apk?: number; npm?: number; stars?: number; apkUrl: string; loaded: boolean };

const KEY = "ab-stats-v2";
let shared: Promise<Stats> | null = null;

async function load(): Promise<Stats> {
  try {
    const c = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (c && Date.now() - c.at < 30 * 60e3) return { ...c, loaded: true };
  } catch {}
  const get = (u: string) => fetch(u).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const [rels, npm, repo] = await Promise.all([
    get(`https://api.github.com/repos/${REPO}/releases?per_page=100`),
    get(`https://api.npmjs.org/downloads/point/last-year/${PKG}`),
    get(`https://api.github.com/repos/${REPO}`),
  ]);
  const s: Stats = { apkUrl: APK_FALLBACK, loaded: true };
  if (Array.isArray(rels)) {
    let n = 0;
    let latest: string | null = null;
    for (const r of rels)
      for (const a of r.assets ?? [])
        if (a.name.endsWith(".apk")) {
          n += a.download_count;
          if (!latest && !r.prerelease) latest = a.browser_download_url;
        }
    s.apk = n;
    if (latest) s.apkUrl = latest;
  }
  if (npm && typeof npm.downloads === "number") s.npm = npm.downloads;
  if (repo && typeof repo.stargazers_count === "number") s.stars = repo.stargazers_count;
  try { localStorage.setItem(KEY, JSON.stringify({ ...s, at: Date.now() })); } catch {}
  return s;
}

// Live download and star counts, fetched once per page and cached for 30 minutes.
export function useStats(): Stats {
  const [s, set] = useState<Stats>({ apkUrl: APK_FALLBACK, loaded: false });
  useEffect(() => {
    shared ??= load();
    shared.then(set);
  }, []);
  return s;
}
