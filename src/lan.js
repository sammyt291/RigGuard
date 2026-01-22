import dgram from "node:dgram";

const PRESENCE_INTERVAL_MS = 2000;
const PEER_TIMEOUT_MS = 8000;

function now() {
  return Date.now();
}

export function computeConflicts(state, peers) {
  if (!state?.band) return [];
  const conflicts = [];
  for (const peer of peers.values()) {
    if (peer?.state?.band && peer.state.band === state.band) {
      conflicts.push(peer);
    }
  }
  return conflicts;
}

export function startLan({ state, udpPort, broadcastAddr, onPeerChange }) {
  const socket = dgram.createSocket("udp4");
  const peers = new Map();

  socket.bind(udpPort, () => {
    try {
      socket.setBroadcast(true);
    } catch {}
  });

  socket.on("message", (msg, rinfo) => {
    try {
      const data = JSON.parse(msg.toString());
      if (!data?.id || data.id === state.id) return;
      peers.set(data.id, {
        ...data,
        addr: rinfo.address,
        lastSeen: now(),
      });
      onPeerChange(new Map(peers));
    } catch {}
  });

  const interval = setInterval(() => {
    const payload = {
      id: state.id,
      name: state.name,
      state: {
        band: state.band,
        freqHz: state.freqHz,
        mode: state.mode,
      },
    };
    const message = Buffer.from(JSON.stringify(payload));
    try {
      socket.send(message, udpPort, broadcastAddr);
    } catch {}

    const threshold = now() - PEER_TIMEOUT_MS;
    let changed = false;
    for (const [id, peer] of peers.entries()) {
      if (peer.lastSeen < threshold) {
        peers.delete(id);
        changed = true;
      }
    }
    if (changed) onPeerChange(new Map(peers));
  }, PRESENCE_INTERVAL_MS);

  return {
    peers,
    close() {
      clearInterval(interval);
      try { socket.close(); } catch {}
    },
  };
}
