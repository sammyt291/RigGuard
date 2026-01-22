/**
 * Icom CI-V parser + command encoder + sender queue
 */

export class CivStreamParser {
  constructor(onFrame) {
    this.buf = Buffer.alloc(0);
    this.onFrame = onFrame;
  }
  push(chunk) {
    if (!Buffer.isBuffer(chunk) || chunk.length === 0) return;
    this.buf = Buffer.concat([this.buf, chunk]);

    while (true) {
      const start = this.buf.indexOf(0xFE);
      if (start === -1) {
        this.buf = Buffer.alloc(0);
        return;
      }
      if (start > 0) this.buf = this.buf.subarray(start);

      const end = this.buf.indexOf(0xFD);
      if (end === -1) return;

      const frame = this.buf.subarray(0, end + 1);
      this.buf = this.buf.subarray(end + 1);
      this.onFrame?.(frame);
    }
  }
}

export function decodeCivFrame(frame) {
  if (!frame || frame.length < 6) return null;
  if (frame[frame.length - 1] !== 0xFD) return null;

  let i = 0;
  while (i < frame.length && frame[i] === 0xFE) i++; // allow 1+ FE

  if (frame.length < i + 4) return null;
  const to = frame[i + 0];
  const from = frame[i + 1];
  const cmd = frame[i + 2];
  const data = frame.subarray(i + 3, frame.length - 1);
  return { to, from, cmd, data, raw: frame };
}

export function decodeFrequencyHzFromBcdLE(bcdBytes) {
  if (!bcdBytes || bcdBytes.length === 0) return null;
  let digits = "";
  for (let i = bcdBytes.length - 1; i >= 0; i--) {
    const b = bcdBytes[i];
    const hi = (b >> 4) & 0xF;
    const lo = b & 0xF;
    if (hi > 9 || lo > 9) return null;
    digits += String(hi) + String(lo);
  }
  digits = digits.replace(/^0+(?=\d)/, "");
  const hz = Number.parseInt(digits, 10);
  return Number.isFinite(hz) ? hz : null;
}

export function civModeName(modeByte) {
  const map = {
    0x00: "LSB",
    0x01: "USB",
    0x02: "AM",
    0x03: "CW",
    0x04: "RTTY",
    0x05: "FM",
    0x07: "CW-R",
    0x08: "RTTY-R",
  };
  return map[modeByte] ?? `MODE_0x${modeByte.toString(16).padStart(2, "0")}`;
}

export function interpretCiv(frame) {
  const d = decodeCivFrame(frame);
  if (!d) return null;

  const b1 = frame[frame.length - 2];
  if (b1 === 0xFB) return { type: "ack", ok: true };
  if (b1 === 0xFA) return { type: "ack", ok: false };

  if (d.cmd === 0x00 && d.data.length >= 5) {
    const hz = decodeFrequencyHzFromBcdLE(d.data.subarray(0, 5));
    return { type: "frequency", hz };
  }

  if (d.cmd === 0x01 && d.data.length >= 2) {
    const modeByte = d.data[0];
    const filterByte = d.data[1];
    return { type: "mode", mode: civModeName(modeByte), modeByte, filterByte };
  }

  return null;
}

export function buildCivFrame({ to, from, bytes, extraFe = 0 }) {
  const prefix = extraFe > 0 ? Buffer.alloc(extraFe, 0xFE) : Buffer.alloc(0);
  const body = Buffer.from([0xFE, 0xFE, to, from, ...bytes, 0xFD]);
  return Buffer.concat([prefix, body]);
}

// 5-byte BCD, LSB FIRST (little-endian digit pairs).
// Example 14.200.000 Hz => digits "0014200000" => bytes 00 00 20 14 00
export function encodeFreqBcdLE(hz) {
  const n = Math.trunc(hz);
  if (!Number.isFinite(n) || n < 0) throw new Error("Invalid Hz");
  const digits = n.toString().padStart(10, "0");

  const bytes = [];
  // Take digit pairs from the RIGHT (least significant) first.
  for (let i = digits.length; i > 0; i -= 2) {
    const hi = Number(digits[i - 2]);
    const lo = Number(digits[i - 1]);
    bytes.push((hi << 4) | lo);
  }
  // IMPORTANT: do NOT reverse; CI-V expects LSB-first order.
  return Buffer.from(bytes);
}

export function powerOnExtraFeCount(baud) {
  if (baud >= 115200) return 150;
  if (baud >= 57600) return 75;
  if (baud >= 38400) return 50;
  if (baud >= 19200) return 25;
  if (baud >= 9600) return 13;
  return 7;
}

export function civReadFreq(to, from) {
  return buildCivFrame({ to, from, bytes: [0x03] });
}
export function civReadMode(to, from) {
  return buildCivFrame({ to, from, bytes: [0x04] });
}
export function civSetFreq(to, from, hz) {
  const bcd = encodeFreqBcdLE(hz);
  return buildCivFrame({ to, from, bytes: [0x05, ...bcd] });
}
export function civSetMode(to, from, modeByte, filterByte = 0x02) {
  return buildCivFrame({
    to,
    from,
    bytes: [0x06, modeByte & 0xff, filterByte & 0xff],
  });
}
export function civSetSplit(to, from, on) {
  return buildCivFrame({ to, from, bytes: [0x0f, on ? 0x01 : 0x00] });
}
export function civSetVfo(to, from, which /* A|B */) {
  const v = String(which).toUpperCase() === "B" ? 0x01 : 0x00;
  return buildCivFrame({ to, from, bytes: [0x07, v] });
}
export function civPowerOn(to, from, baud) {
  return buildCivFrame({
    to,
    from,
    bytes: [0x18, 0x01],
    extraFe: powerOnExtraFeCount(baud),
  });
}
export function civPowerOff(to, from) {
  return buildCivFrame({ to, from, bytes: [0x18, 0x00] });
}

export class CivCommander {
  constructor({ port, to, from }) {
    this.port = port;
    this.to = to;
    this.from = from;
    this.queue = Promise.resolve();
    this.waiters = [];
  }

  onAck(ok) {
    const w = this.waiters.shift();
    if (w) w(ok);
  }

  send(frame, { expectAck = true, timeoutMs = 800 } = {}) {
    this.queue = this.queue.then(() =>
      this.#send(frame, { expectAck, timeoutMs })
    );
    return this.queue;
  }

  #send(frame, { expectAck, timeoutMs }) {
    return new Promise((resolve, reject) => {
      if (!this.port?.isOpen) return reject(new Error("Serial port not open"));

      let timer = null;
      const done = (ok) => {
        if (timer) clearTimeout(timer);
        resolve({ ok });
      };

      if (expectAck) {
        this.waiters.push(done);
        timer = setTimeout(() => {
          const idx = this.waiters.indexOf(done);
          if (idx >= 0) this.waiters.splice(idx, 1);
          resolve({ ok: false, timeout: true });
        }, timeoutMs);
      }

      this.port.write(frame, (err) => {
        if (err) {
          if (timer) clearTimeout(timer);
          if (expectAck) {
            const idx = this.waiters.indexOf(done);
            if (idx >= 0) this.waiters.splice(idx, 1);
          }
          return reject(err);
        }
        if (!expectAck) resolve({ ok: true });
      });
    });
  }
}

export function modeToByte(name) {
  const m = String(name).toUpperCase();
  const map = {
    LSB: 0x00,
    USB: 0x01,
    AM: 0x02,
    CW: 0x03,
    RTTY: 0x04,
    FM: 0x05,
    "CW-R": 0x07,
    "RTTY-R": 0x08,
  };
  return map[m] ?? null;
}
