import fs from "node:fs";
import crypto from "node:crypto";

export function safeJsonParse(s) {
  try { return JSON.parse(s); } catch { return null; }
}

export function loadOrCreateId(path = "instance-id.json") {
  try {
    const j = safeJsonParse(fs.readFileSync(path, "utf8"));
    if (j?.id) return j.id;
  } catch {}
  const id = crypto.randomUUID();
  fs.writeFileSync(path, JSON.stringify({ id }, null, 2));
  return id;
}

export function parseHexByte(s, fallback) {
  if (typeof s !== "string") return fallback;
  const clean = s.trim().replace(/^0x/i, "");
  const v = Number.parseInt(clean, 16);
  return Number.isFinite(v) && v >= 0 && v <= 255 ? v : fallback;
}

export function formatHzDots(hz) {
  if (!Number.isFinite(hz)) return "—";
  return String(Math.trunc(hz)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

export function parseFreqToHz(input) {
  const digits = String(input ?? "").replace(/[^\d]/g, "");
  const hz = Number(digits);
  return Number.isFinite(hz) && hz > 0 ? hz : null;
}

export function bandFromHz(hz) {
  if (!Number.isFinite(hz)) return null;
  const mhz = hz / 1e6;
  const bands = [
    { name: "160m", lo: 1.8, hi: 2.0 },
    { name: "80m", lo: 3.5, hi: 4.0 },
    { name: "60m", lo: 5.0, hi: 5.5 },
    { name: "40m", lo: 7.0, hi: 7.3 },
    { name: "30m", lo: 10.1, hi: 10.15 },
    { name: "20m", lo: 14.0, hi: 14.35 },
    { name: "17m", lo: 18.068, hi: 18.168 },
    { name: "15m", lo: 21.0, hi: 21.45 },
    { name: "12m", lo: 24.89, hi: 24.99 },
    { name: "10m", lo: 28.0, hi: 29.7 },
    { name: "6m", lo: 50.0, hi: 54.0 },
    { name: "2m", lo: 144.0, hi: 148.0 },
    { name: "70cm", lo: 420.0, hi: 450.0 },
  ];
  for (const b of bands) {
    if (mhz >= b.lo && mhz <= b.hi) return b.name;
  }
  return null;
}
