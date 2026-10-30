export const REPO = "Rudrasamadhiya/android-agent-bridge";
export const PKG = "android-agent-bridge";
export const VERSION = "0.1.2";
export const GITHUB = `https://github.com/${REPO}`;
export const NPM = `https://www.npmjs.com/package/${PKG}`;
// Downloads go through GitHub Releases so they are counted; useStats swaps in the exact asset URL.
export const APK_LATEST = `${GITHUB}/releases/latest/download/agent-bridge.apk`;
export const APK_FALLBACK = APK_LATEST;
export const APK_SIZE = "13 MB";

export const asset = (p: string) => `${process.env.NEXT_PUBLIC_BASE ?? ""}${p}`;
