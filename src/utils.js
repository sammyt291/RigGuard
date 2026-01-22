import fs from "node:fs";
import { randomUUID } from "node:crypto";

const ID_PATH = "instance-id.json";

export function loadOrCreateId() {
  try {
    const data = JSON.parse(fs.readFileSync(ID_PATH, "utf8"));
    if (data?.id) return data.id;
  } catch {}

  const id = randomUUID();
  fs.writeFileSync(ID_PATH, JSON.stringify({ id }, null, 2));
  return id;
}

export function parseHexByte(value, fallback) {
  if (value == null) return fallback;
  const num = Number.parseInt(String(value).trim(), 16);
  if (Number.isNaN(num)) return fallback;
  return num & 0xff;
}

export function formatHzDots(hz) {
  const digits = Math.max(0, Math.floor(hz)).toString();
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

export function parseFreqToHz(input) {
  if (!input) return null;
  const raw = String(input).trim();
  if (!raw) return null;
  if (/^\d+(\.\d+)?$/.test(raw)) {
    const mhz = Number(raw);
    if (!Number.isFinite(mhz)) return null;
    return Math.round(mhz * 1_000_000);
  }
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return null;
  return Number.parseInt(digits, 10);
}
