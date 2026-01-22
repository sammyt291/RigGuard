import readline from "node:readline";
import { SerialPort } from "serialport";

function toDisplay(port) {
  return `${port.path}${port.manufacturer ? ` (${port.manufacturer})` : ""}`;
}

export async function listPortsToConsole() {
  const ports = await SerialPort.list();
  if (!ports.length) {
    console.log("No serial ports found.");
    return;
  }
  console.log("Available serial ports:");
  ports.forEach((port, idx) => {
    console.log(`  [${idx + 1}] ${toDisplay(port)}`);
  });
}

export async function choosePort({ portArg, nameArg }) {
  if (portArg) return portArg;
  const ports = await SerialPort.list();
  if (!ports.length) return null;

  if (nameArg) {
    const needle = nameArg.toLowerCase();
    const match = ports.find((port) =>
      [port.path, port.manufacturer, port.friendlyName]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(needle))
    );
    return match?.path ?? null;
  }

  if (ports.length === 1) return ports[0].path;

  console.log("Select a serial port:");
  ports.forEach((port, idx) => {
    console.log(`  [${idx + 1}] ${toDisplay(port)}`);
  });

  const answer = await new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question("Enter number: ", (response) => {
      rl.close();
      resolve(response);
    });
  });

  const index = Number.parseInt(String(answer).trim(), 10);
  if (!Number.isFinite(index) || index < 1 || index > ports.length) return null;
  return ports[index - 1].path;
}
