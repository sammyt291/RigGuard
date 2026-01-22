import readline from "node:readline";

const ESC = "\u001b[";

function moveCursor(row, col) {
  process.stdout.write(`${ESC}${row};${col}H`);
}

function clearLine() {
  process.stdout.write(`${ESC}2K`);
}

export function startInput({ term, onCommand }) {
  let buffer = "";
  let cursor = 0;
  let stopped = false;
  const prompt = "> ";

  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }
  process.stdin.resume();
  process.stdin.setEncoding("utf8");

  function render() {
    if (stopped) return;
    const rows = process.stdout.rows || 24;
    const col = prompt.length + cursor + 1;
    moveCursor(rows, 1);
    clearLine();
    process.stdout.write(`${prompt}${buffer}`);
    moveCursor(rows, Math.max(col, 1));
  }

  function insertText(text) {
    if (!text) return;
    buffer = `${buffer.slice(0, cursor)}${text}${buffer.slice(cursor)}`;
    cursor += text.length;
  }

  function handleBackspace() {
    if (cursor <= 0) return;
    buffer = `${buffer.slice(0, cursor - 1)}${buffer.slice(cursor)}`;
    cursor -= 1;
  }

  function handleDelete() {
    if (cursor >= buffer.length) return;
    buffer = `${buffer.slice(0, cursor)}${buffer.slice(cursor + 1)}`;
  }

  function handleKeypress(str, key) {
    if (!key) return;
    if (key.ctrl && key.name === "c") {
      term.exit?.();
      process.exit(0);
    }

    if (key.name === "return") {
      const line = buffer.trim();
      buffer = "";
      cursor = 0;
      render();
      if (line) onCommand(line);
      return;
    }

    switch (key.name) {
      case "left":
        cursor = Math.max(0, cursor - 1);
        render();
        return;
      case "right":
        cursor = Math.min(buffer.length, cursor + 1);
        render();
        return;
      case "home":
        cursor = 0;
        render();
        return;
      case "end":
        cursor = buffer.length;
        render();
        return;
      case "backspace":
        handleBackspace();
        render();
        return;
      case "delete":
        handleDelete();
        render();
        return;
      case "u":
        if (key.ctrl) {
          buffer = "";
          cursor = 0;
          render();
          return;
        }
        break;
      default:
        break;
    }

    if (!key.ctrl && !key.meta && str) {
      insertText(str);
      render();
    }
  }

  process.stdin.on("keypress", handleKeypress);

  render();

  return {
    render,
    stop() {
      if (stopped) return;
      stopped = true;
      process.stdin.off("keypress", handleKeypress);
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
    },
  };
}
