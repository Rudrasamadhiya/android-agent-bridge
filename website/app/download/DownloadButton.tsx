"use client";
import { useStats } from "@/lib/useStats";

export default function DownloadButton({ size }: { size: string }) {
  const s = useStats();
  return (
    <div className="dl-btn-row">
      <a className="btn btn-lime btn-lg" href={s.apkUrl} download>
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M12 4v11M8 11l4 4 4-4M5 19h14" /></svg>
        Download APK <span className="btn-meta">{size}</span>
      </a>
      <span className="dl-count">{s.apk != null ? `${s.apk.toLocaleString()} downloads` : ""}</span>
    </div>
  );
}
