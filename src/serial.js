import { SerialPort } from "serialport";

const DEFAULT_TIMEOUT_MS = 300;

export async function openSerial({ state, log, onDecodedChange }) {
  const port = new SerialPort({
    path: state.portPath,
    baudRate: state.baud,
    autoOpen: false,
    dataBits: 8,
    stopBits: 1,
    parity: "none",
    rtscts: false,
  });

  await new Promise((resolve, reject) => {
    port.open((err) => {
      if (err) reject(err);
      else resolve();
    });
  });

  if (typeof state.dtr === "number") port.set({ dtr: !!state.dtr });
  if (typeof state.rts === "number") port.set({ rts: !!state.rts });

  port.on("data", (data) => {
    if (state.rawEcho) {
      log?.(`raw ${data.toString("hex")}`);
    }
    onDecodedChange?.();
  });

  const commander = {
    to: state.rigAddr,
    from: state.ctrlAddr,
    async send(frame, opts = {}) {
      const payload = Buffer.from(frame);
      return new Promise((resolve) => {
        port.write(payload, (err) => {
          if (err) {
            resolve({ ok: false, timeout: false, error: err });
            return;
          }
          if (opts.expectAck === false) {
            resolve({ ok: true, timeout: false });
            return;
          }
          setTimeout(() => resolve({ ok: true, timeout: false }), DEFAULT_TIMEOUT_MS);
        });
      });
    },
  };

  return { port, commander };
}

export async function closeSerial(port) {
  await new Promise((resolve) => {
    port.close(() => resolve());
  });
}
