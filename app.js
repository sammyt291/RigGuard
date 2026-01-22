#!/usr/bin/env node
import os from "node:os";
import fs from "node:fs";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import { loadOrCreateId, parseHexByte, formatHzDots, parseFreqToHz } from "./src/utils.js";
import { createTerm } from "./src/term.js";
import { startInput } from "./src/input.js";
import { choosePort, listPortsToConsole } from "./src/serialSelect.js";
import { startLan, computeConflicts } from "./src/lan.js";
import { openSerial, closeSerial } from "./src/serial.js";
import {
  civReadFreq, civReadMode, civSetFreq, civSetMode, civSetSplit,
  civSetVfo, civPowerOn, civPowerOff, modeToByte
} from "./src/civ.js";

const argv = yargs(hideBin(process.argv))
  .option("list", { type: "boolean", describe: "List serial ports and exit" })
  .option("port", { type: "string", describe: "Select by port path (e.g., COM9)" })
  .option("name", { type: "string", describe: "Select by friendly/manufacturer substring" })
  .option("baud", { type: "number", default: 9600, describe: "Baud rate" })
  .option("config", { type: "string", default: "selected-serial.json", describe: "Save selection JSON here" })
  .option("dtr", { type: "number", default: 0, describe: "Set DTR (0/1)" })
  .option("rts", { type: "number", default: 0, describe: "Set RTS (0/1)" })
  .option("rigaddr", { type: "string", default: "94", describe: "Radio CI-V address hex (default 94)" })
  .option("ctrladdr", { type: "string", default: "E0", describe: "Controller address hex (default E0; some setups use 00)" })
  .option("net", { type: "boolean", default: true, describe: "Enable LAN presence + conflict detection" })
  .option("udpPort", { type: "number", default: 41234, describe: "UDP port for presence" })
  .option("broadcast", { type: "string", default: "255.255.255.255", describe: "Broadcast address" })
  .option("label", { type: "string", default: "", describe: "Name shown to peers" })
  .help()
  .argv;

const instanceId = loadOrCreateId();
const instanceNameDefault = argv.label?.trim() || os.hostname();

const state = {
  id: instanceId,
  name: instanceNameDefault,
  portPath: null,
  baud: argv.baud,
  dtr: argv.dtr ? 1 : 0,
  rts: argv.rts ? 1 : 0,
  rigAddr: parseHexByte(argv.rigaddr, 0x94),
  ctrlAddr: parseHexByte(argv.ctrladdr, 0xE0),

  freqHz: null,
  mode: null,
  band: null,

  peersCount: 0,
  conflicts: [],
  lastWarnKey: "",

  rawEcho: false,
};

let term = null;
let input = null;

let port = null;
let commander = null;

let lan = null;
let peers = new Map();

let lastStatus = "";

function makeStatusLine() {
  const freq = state.freqHz ? formatHzDots(state.freqHz) : "—";
  const mode = state.mode || "—";
  const band = state.band || "—";
  const conflictStr = state.conflicts.length
    ? `CONFLICT ${state.conflicts.map(p => p.name || p.id.slice(0, 8)).join(", ")}`
    : "OK";

  return (
    ` ${state.name}  ` +
    `Port:${state.portPath || "—"}@${state.baud}  ` +
    `F:${freq}  M:${mode}  B:${band}  ` +
    `Peers:${state.peersCount}  ` +
    `${conflictStr} `
  );
}

function updateStatus(force = false) {
  const line = makeStatusLine();
  if (!force && line === lastStatus) return;
  lastStatus = line;
  term.writeStatus(line);
}

function log(msg) {
  term.logLine(msg);
  input?.render?.();
}

function onPeerChange(newPeers) {
  peers = newPeers;
  state.peersCount = peers.size;
  state.conflicts = computeConflicts(state, peers);

  const key = `${state.band}|${state.conflicts.map(p => p.id).sort().join(",")}`;
  if (state.conflicts.length && key !== state.lastWarnKey) {
    state.lastWarnKey = key;
    log(`⚠ Band conflict on ${state.band} with: ${state.conflicts.map(p => p.name || p.id.slice(0, 8)).join(", ")}`);
  }
  if (!state.conflicts.length) state.lastWarnKey = "";

  updateStatus();
}

function onDecodedChange() {
  onPeerChange(peers);
  updateStatus();
}

async function reopenSerial() {
  if (port?.isOpen) await closeSerial(port);
  const opened = await openSerial({ state, log, onDecodedChange });
  port = opened.port;
  commander = opened.commander;
}

function shutdown() {
  (async () => {
    try { lan?.close(); } catch {}
    try { if (port?.isOpen) await closeSerial(port); } catch {}
    try { input?.stop?.(); } catch {}
    try { term?.exit?.(); } catch {}
    process.exit(0);
  })();
}

async function handleCommand(line) {
  const parts = line.trim().split(/\s+/);
  const cmd = (parts[0] || "").toLowerCase();
  const a1 = parts[1];
  const rest = parts.slice(1).join(" ");

  try {
    if (cmd === "help") {
      log([
        "Commands:",
        "  help",
        "  peers",
        "  show",
        "  freq 14.200.000",
        "  mode usb [filter 1..3]",
        "  read freq | read mode",
        "  split on|off",
        "  vfo a|b",
        "  power on|off",
        "  set name <label>",
        "  set baud <num>        (then: reopen)",
        "  set dtr <0|1>         (then: reopen)",
        "  set rts <0|1>         (then: reopen)",
        "  set rigaddr <hex>",
        "  set ctrladdr <hex>",
        "  reopen",
        "  raw on|off",
        "  quit",
      ].join("\n")); // <-- real newlines
      return;
    }

    if (cmd === "quit" || cmd === "exit") { shutdown(); return; }

    if (cmd === "show") {
      log(JSON.stringify({
        id: state.id,
        name: state.name,
        port: state.portPath,
        baud: state.baud,
        rigAddr: `0x${state.rigAddr.toString(16)}`,
        ctrlAddr: `0x${state.ctrlAddr.toString(16)}`,
        freqHz: state.freqHz,
        mode: state.mode,
        band: state.band,
        peers: state.peersCount,
      }, null, 2));
      return;
    }

    if (cmd === "peers") {
      if (!peers.size) return log("No peers.");
      const lines = [];
      for (const p of peers.values()) {
        lines.push(
          `${(p.name || p.id.slice(0, 8)).padEnd(18)} ${p.addr.padEnd(15)} band=${p.state?.band || "—"} freq=${p.state?.freqHz ? formatHzDots(p.state.freqHz) : "—"}`
        );
      }
      log(lines.join("\n")); // <-- real newlines
      return;
    }

    if (cmd === "raw") {
      const on = (a1 || "").toLowerCase() === "on";
      state.rawEcho = on;
      log(`raw ${on ? "ON" : "OFF"}`);
      return;
    }

    if (cmd === "set") {
      const key = (a1 || "").toLowerCase();
      const val = parts.slice(2).join(" ");

      if (key === "name") { state.name = val.trim() || state.name; log(`name = ${state.name}`); updateStatus(true); return; }
      if (key === "baud") { const n = Number(val); if (!Number.isFinite(n) || n <= 0) return log("Invalid baud"); state.baud = n; log(`baud = ${n} (run: reopen)`); updateStatus(true); return; }
      if (key === "dtr") { state.dtr = val.trim() === "1" ? 1 : 0; log(`dtr = ${state.dtr} (run: reopen)`); return; }
      if (key === "rts") { state.rts = val.trim() === "1" ? 1 : 0; log(`rts = ${state.rts} (run: reopen)`); return; }
      if (key === "rigaddr") { state.rigAddr = parseHexByte(val, state.rigAddr); if (commander) commander.to = state.rigAddr; log(`rigaddr = 0x${state.rigAddr.toString(16)}`); return; }
      if (key === "ctrladdr") { state.ctrlAddr = parseHexByte(val, state.ctrlAddr); if (commander) commander.from = state.ctrlAddr; log(`ctrladdr = 0x${state.ctrlAddr.toString(16)}`); return; }

      log("Unknown set key.");
      return;
    }

    if (cmd === "reopen") {
      log("Reopening serial...");
      await reopenSerial();
      updateStatus(true);
      return;
    }

    if (!port?.isOpen || !commander) return log("Serial not open yet.");

    if (cmd === "read") {
      if ((a1 || "").toLowerCase() === "freq") {
        const res = await commander.send(civReadFreq(state.rigAddr, state.ctrlAddr));
        log(`read freq sent (ack=${res.ok}${res.timeout ? ", timeout" : ""})`);
        return;
      }
      if ((a1 || "").toLowerCase() === "mode") {
        const res = await commander.send(civReadMode(state.rigAddr, state.ctrlAddr));
        log(`read mode sent (ack=${res.ok}${res.timeout ? ", timeout" : ""})`);
        return;
      }
      return log("Usage: read freq | read mode");
    }

    if (cmd === "freq") {
      const hz = parseFreqToHz(rest);
      if (!hz) return log("Usage: freq 14.200.000");
      const res = await commander.send(civSetFreq(state.rigAddr, state.ctrlAddr, hz));
      log(`freq ${hz} (ack=${res.ok}${res.timeout ? ", timeout" : ""})`);
      return;
    }

    if (cmd === "mode") {
      const modeName = parts[1];
      const filter = Number(parts[2] || "2");
      const mb = modeToByte(modeName);
      if (mb == null) return log("Usage: mode usb [filter 1..3]");
      const fb = Number.isFinite(filter) ? Math.max(1, Math.min(3, filter)) : 2;
      const res = await commander.send(civSetMode(state.rigAddr, state.ctrlAddr, mb, fb));
      log(`mode ${String(modeName).toUpperCase()} filter ${fb} (ack=${res.ok}${res.timeout ? ", timeout" : ""})`);
      return;
    }

    if (cmd === "split") {
      const on = (a1 || "").toLowerCase() === "on";
      const res = await commander.send(civSetSplit(state.rigAddr, state.ctrlAddr, on));
      log(`split ${on ? "ON" : "OFF"} (ack=${res.ok}${res.timeout ? ", timeout" : ""})`);
      return;
    }

    if (cmd === "vfo") {
      const which = (a1 || "a").toUpperCase();
      const res = await commander.send(civSetVfo(state.rigAddr, state.ctrlAddr, which));
      log(`vfo ${which} (ack=${res.ok}${res.timeout ? ", timeout" : ""})`);
      return;
    }

    if (cmd === "power") {
      const which = (a1 || "").toLowerCase();
      if (which === "on") {
        await commander.send(civPowerOn(state.rigAddr, state.ctrlAddr, state.baud), { expectAck: false });
        log("power on sent");
        return;
      }
      if (which === "off") {
        const res = await commander.send(civPowerOff(state.rigAddr, state.ctrlAddr));
        log(`power off sent (ack=${res.ok}${res.timeout ? ", timeout" : ""})`);
        return;
      }
      return log("Usage: power on|off");
    }

    log(`Unknown command: ${line}`);
  } catch (e) {
    log(`Error: ${e?.message || String(e)}`);
  }
}

(async () => {
  if (argv.list) {
    await listPortsToConsole();
    process.exit(0);
  }

  state.portPath = await choosePort({ portArg: argv.port, nameArg: argv.name });

  if (state.portPath) {
    fs.writeFileSync(
      argv.config,
      JSON.stringify(
        { path: state.portPath, baud: state.baud, dtr: state.dtr, rts: state.rts, rigaddr: argv.rigaddr, ctrladdr: argv.ctrladdr },
        null,
        2
      )
    );
  }

  term = createTerm();
  term.enter();

  if (!state.portPath) {
    updateStatus(true);
    log("No serial port selected. Rerun or pass --port/--name.");
  } else {
    try {
      await reopenSerial();
    } catch (e) {
      log(`Failed to open serial: ${e?.message || String(e)}`);
    }
  }

  if (argv.net) {
    lan = startLan({
      state,
      udpPort: argv.udpPort,
      broadcastAddr: argv.broadcast,
      onPeerChange: (p) => onPeerChange(p),
    });
    peers = lan.peers;
  }

  updateStatus(true);
  input = startInput({ term, onCommand: handleCommand });
  log("Type 'help' for commands.");
})();

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
