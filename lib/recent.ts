import fs from "fs";
import path from "path";
import { KOLReport, RecentEntry } from "./types";

const ARCHIVE_DIR = "/tmp/kol_v2";
const RECENT_FILE = path.join(ARCHIVE_DIR, "_recent.json");
const MAX_RECENT = 20;

function ensureDir() {
  if (!fs.existsSync(ARCHIVE_DIR)) {
    fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
  }
}

export function addRecent(report: KOLReport): void {
  ensureDir();
  const entries = readRecent();

  const entry: RecentEntry = {
    handle: report.handle,
    accuracy: report.overallAccuracy,
    totalCalls: report.totalCalls,
    hits: report.hits,
    misses: report.misses,
    pending: report.pending,
    searchedAt: new Date().toISOString(),
    biasNote: report.biasNote,
  };

  // Dedup by handle (keep most recent)
  const filtered = entries.filter(
    (e) => e.handle.toLowerCase() !== entry.handle.toLowerCase()
  );
  filtered.unshift(entry);
  const trimmed = filtered.slice(0, MAX_RECENT);

  // Atomic write
  const tmp = RECENT_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(trimmed, null, 2));
  fs.renameSync(tmp, RECENT_FILE);
}

export function readRecent(): RecentEntry[] {
  ensureDir();
  try {
    if (fs.existsSync(RECENT_FILE)) {
      const raw = fs.readFileSync(RECENT_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // Corrupt file — try to seed from archive
    try {
      fs.unlinkSync(RECENT_FILE);
    } catch {
      // ignore
    }
  }

  // Cold start: seed from archive
  return seedFromArchive();
}

function seedFromArchive(): RecentEntry[] {
  ensureDir();
  const entries: RecentEntry[] = [];

  try {
    const files = fs.readdirSync(ARCHIVE_DIR).filter(
      (f) => f.endsWith(".json") && f !== "_recent.json"
    );

    for (const file of files) {
      try {
        const raw = fs.readFileSync(path.join(ARCHIVE_DIR, file), "utf-8");
        const { data, ts } = JSON.parse(raw) as { data: KOLReport; ts: number };
        if (data && data.handle && typeof data.overallAccuracy === "number") {
          entries.push({
            handle: data.handle,
            accuracy: data.overallAccuracy,
            totalCalls: data.totalCalls,
            hits: data.hits,
            misses: data.misses,
            pending: data.pending,
            searchedAt: new Date(ts).toISOString(),
            biasNote: data.biasNote,
          });
        }
      } catch {
        // Skip corrupt archive files
      }
    }
  } catch {
    // Archive dir doesn't exist yet
  }

  entries.sort(
    (a, b) => new Date(b.searchedAt).getTime() - new Date(a.searchedAt).getTime()
  );
  const trimmed = entries.slice(0, MAX_RECENT);

  if (trimmed.length > 0) {
    try {
      const tmp = RECENT_FILE + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify(trimmed, null, 2));
      fs.renameSync(tmp, RECENT_FILE);
    } catch {
      // ignore write errors
    }
  }

  return trimmed;
}
