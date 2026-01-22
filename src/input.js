/**
 * Bottom-line input using stdin raw mode.
 */
export function startInput({ term, onCommand }) {
  const prompt = "> ";
  let buf = "";
  let active = true;

  function render() {
    term.renderInput(prompt, buf);
  }

  function stop() {
    active = false;
    try { process.stdin.setRawMode(false); } catch {}
    process.stdin.pause();
  }

  process.stdin.setEncoding("utf8");
  process.stdin.resume();
  process.stdin.setRawMode(true);

  const onData = (chunk) => {
    if (!active) return;

    // Ctrl+C
    if (chunk === "\u0003") {
      onCommand?.("quit");
      return;
    }

    // Enter
    if (chunk === "\r" || chunk === "\n") {
      const line = buf.trim();
      buf = "";
      render();
      if (line) onCommand?.(line);
      return;
    }

    // Backspace
    if (chunk === "\u007f") {
      if (buf.length > 0) buf = buf.slice(0, -1);
      render();
      return;
    }

    // Ignore escape sequences (arrows, etc.)
    if (chunk.startsWith("\u001b")) return;

    // Printable
    buf += chunk;
    render();
  };

  process.stdin.on("data", onData);
  render();

  return { render, stop };
}
