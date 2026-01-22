import readline from "node:readline";
import { SerialPort } from "serialport";

export async function listPortsToConsole() {
  const ports = await SerialPort.list();
  if (!ports.length) {
    console.log("No serial ports found.");
    return [];
  }
  console.log("Available serial ports:");
  ports.forEach((p, idx) => {
    const label = p.friendlyName || p.manufacturer || p.productId || "Unknown";
    console.log(`${String(idx + 1).padStart(2, " ")}. ${p.path} (${label})`);
  });
  return ports;
}

function askLine(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (ans) => { rl.close(); resolve(ans); }));
}

async function choosePortInteractive() {
  const ports = await listPortsToConsole();
  if (!ports.length) return null;

  while (true) {
    const ans = (await askLine("Select port by number, or type the port path (e.g. COM9): ")).trim();
    if (!ans) continue;

    const n = Number.parseInt(ans, 10);
    if (Number.isFinite(n) && n >= 1 && n <= ports.length) return ports[n - 1].path;

    const exact = ports.find(p => String(p.path).toLowerCase() === ans.toLowerCase());
    if (exact) return exact.path;

    // allow manual entry
    if (/^com\d+$/i.test(ans) || ans.includes("/") || ans.includes("\\")) return ans;

    console.log("Invalid selection. Try again.");
  }
}

export async function choosePort({ portArg, nameArg }) {
  const ports = await SerialPort.list();

  if (portArg) return portArg;

  if (nameArg) {
    const q = nameArg.toLowerCase();
    const m = ports.find(p => (p.friendlyName || p.manufacturer || "").toLowerCase().includes(q))
          || ports.find(p => (p.path || "").toLowerCase().includes(q));
    return m?.path || null;
  }

  // prompt
  return choosePortInteractive();
}
