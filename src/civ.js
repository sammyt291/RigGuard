const PREAMBLE = [0xfe, 0xfe];
const EOM = 0xfd;

function frame(to, from, command, data = []) {
  return Uint8Array.from([...PREAMBLE, to, from, command, ...data, EOM]);
}

function toBcdByte(value) {
  const tens = Math.floor(value / 10) % 10;
  const ones = value % 10;
  return (tens << 4) | ones;
}

function freqToBcd(hz) {
  const padded = Math.max(0, Math.floor(hz)).toString().padStart(8, "0");
  const bytes = [];
  for (let i = padded.length; i > 0; i -= 2) {
    const pair = padded.slice(Math.max(0, i - 2), i);
    bytes.push(toBcdByte(Number.parseInt(pair, 10)));
  }
  return bytes;
}

export function civReadFreq(to, from) {
  return frame(to, from, 0x03);
}

export function civReadMode(to, from) {
  return frame(to, from, 0x04);
}

export function civSetFreq(to, from, hz) {
  return frame(to, from, 0x05, freqToBcd(hz));
}

export function civSetMode(to, from, modeByte, filterByte) {
  return frame(to, from, 0x06, [modeByte, filterByte]);
}

export function civSetSplit(to, from, on) {
  return frame(to, from, 0x0f, [on ? 0x01 : 0x00]);
}

export function civSetVfo(to, from, which) {
  const value = String(which).toUpperCase() === "B" ? 0x01 : 0x00;
  return frame(to, from, 0x07, [value]);
}

export function civPowerOn(to, from) {
  return frame(to, from, 0x18, [0x01]);
}

export function civPowerOff(to, from) {
  return frame(to, from, 0x18, [0x00]);
}

export function modeToByte(mode) {
  if (!mode) return null;
  const key = String(mode).toLowerCase();
  const mapping = {
    lsb: 0x00,
    usb: 0x01,
    am: 0x02,
    cw: 0x03,
    rtty: 0x04,
    fm: 0x05,
    wfm: 0x06,
  };
  return mapping[key] ?? null;
}
