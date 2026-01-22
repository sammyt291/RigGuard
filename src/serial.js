import { SerialPort } from "serialport";
import { CivCommander, CivStreamParser, interpretCiv } from "./civ.js";
import { bandFromHz } from "./utils.js";

/**
 * Opens serial port and wires CI-V parse/interpret.
 */
export async function openSerial({ state, log, onDecodedChange }) {
  if (!state.portPath) throw new Error("No portPath selected");

  const port = new SerialPort({ path: state.portPath, baudRate: state.baud, autoOpen: false });

  const commander = new CivCommander({ port, to: state.rigAddr, from: state.ctrlAddr });

  const parser = new CivStreamParser((frame) => {
    const msg = interpretCiv(frame);
    if (!msg) return;

    if (msg.type === "ack") {
      commander.onAck(msg.ok);
      return;
    }

    if (msg.type === "frequency" && Number.isFinite(msg.hz)) {
      state.freqHz = msg.hz;
      state.band = bandFromHz(msg.hz);
      onDecodedChange?.();
      return;
    }

    if (msg.type === "mode") {
      state.mode = msg.mode;
      onDecodedChange?.();
      return;
    }
  });

  port.on("data", (buf) => {
    if (state.rawEcho) {
      const s = buf.toString("utf8").replace(/[^\x09\x0A\x0D\x20-\x7E]/g, ".");
      log(s);
    }
    parser.push(buf);
  });

  port.on("error", (e) => log(`Serial error: ${e.message}`));
  port.on("close", () => log("Serial closed"));

  await new Promise((resolve, reject) => port.open((err) => (err ? reject(err) : resolve())));

  if (state.dtr || state.rts) {
    port.set({ dtr: !!state.dtr, rts: !!state.rts }, (e) => {
      if (e) log(`Flow control set error: ${e.message}`);
    });
  }

  log(`Connected ${state.portPath} @ ${state.baud}  (rig=0x${state.rigAddr.toString(16)}, ctrl=0x${state.ctrlAddr.toString(16)})`);

  return { port, commander };
}

export async function closeSerial(port) {
  if (!port || !port.isOpen) return;
  await new Promise((resolve) => port.close(() => resolve()));
}
