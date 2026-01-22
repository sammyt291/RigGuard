import dgram from "node:dgram";
import { safeJsonParse } from "./utils.js";

const MAGIC = "hamwatch.v1";

export function publicState(state) {
  return { decoder: "icom", freqHz: state.freqHz, mode: state.mode, band: state.band };
}

export function startLan({ state, udpPort, broadcastAddr, onPeerChange }) {
  const sock = dgram.createSocket("udp4");
  const peers = new Map();

  function send(obj, port, addr) {
    const buf = Buffer.from(JSON.stringify(obj), "utf8");
    sock.send(buf, port, addr);
  }

  function hello() {
    return { magic: MAGIC, type: "hello", id: state.id, name: state.name, ts: Date.now() };
  }
  function stateMsg() {
    return { magic: MAGIC, type: "state", id: state.id, name: state.name, ts: Date.now(), state: publicState(state) };
  }

  function upsertPeer(msg, rinfo) {
    if (!msg?.id || msg.id === state.id) return;
    const prev = peers.get(msg.id);
    peers.set(msg.id, {
      id: msg.id,
      name: msg.name || prev?.name || "unknown",
      addr: rinfo.address,
      lastSeen: Date.now(),
      state: msg.state || prev?.state || null,
    });
    onPeerChange?.(peers);
  }

  sock.on("message", (buf, rinfo) => {
    const msg = safeJsonParse(buf.toString("utf8"));
    if (!msg || msg.magic !== MAGIC) return;

    if (msg.type === "hello") {
      upsertPeer(msg, rinfo);
      send(stateMsg(), udpPort, rinfo.address);
      return;
    }
    if (msg.type === "state") {
      upsertPeer(msg, rinfo);
      return;
    }
  });

  sock.bind(udpPort, () => {
    sock.setBroadcast(true);
    send(hello(), udpPort, broadcastAddr);
    setTimeout(() => send(stateMsg(), udpPort, broadcastAddr), 200);
  });

  const tick = setInterval(() => {
    const cutoff = Date.now() - 15000;
    let changed = false;
    for (const [id, p] of peers) {
      if (p.lastSeen < cutoff) {
        peers.delete(id);
        changed = true;
      }
    }
    if (changed) onPeerChange?.(peers);
    send(stateMsg(), udpPort, broadcastAddr);
  }, 5000);

  return {
    peers,
    close() {
      clearInterval(tick);
      try { sock.close(); } catch {}
    }
  };
}

export function computeConflicts(localState, peers) {
  if (!localState.band) return [];
  const conflicts = [];
  for (const p of peers.values()) {
    if (p?.state?.band && p.state.band === localState.band) conflicts.push(p);
  }
  return conflicts;
}
