import ansiEscapes from "ansi-escapes";

/**
 * Minimal console renderer:
 * - Top line status (white bg)
 * - Middle scrolling log region
 * - Bottom input line (managed by input module)
 */
export function createTerm() {
  const out = process.stdout;

  let cols = out.columns || 120;
  let rows = out.rows || 30;

  function setScrollRegion() {
    cols = out.columns || cols;
    rows = out.rows || rows;
    const logTop = 2;
    const logBottom = Math.max(2, rows - 1);
    out.write(`\x1b[${logTop};${logBottom}r`);
  }

  function enter() {
    out.write(ansiEscapes.enterAlternativeScreen);
    out.write(ansiEscapes.cursorHide);
    out.write(ansiEscapes.clearScreen);
    setScrollRegion();
    out.write(ansiEscapes.cursorTo(0, Math.max(1, rows - 2)));
  }

  function exit() {
    out.write("\x1b[r"); // reset scroll region
    out.write(ansiEscapes.cursorShow);
    out.write(ansiEscapes.exitAlternativeScreen);
  }

  function writeStatus(line) {
    cols = out.columns || cols;
    out.write(ansiEscapes.cursorSavePosition);
    out.write(ansiEscapes.cursorTo(0, 0));
    out.write("\x1b[47m\x1b[30m"); // bg white, fg black
    out.write(String(line).padEnd(cols).slice(0, cols));
    out.write("\x1b[0m");
    out.write(ansiEscapes.cursorRestorePosition);
  }

  function renderInput(prompt, buffer) {
    cols = out.columns || cols;
    rows = out.rows || rows;
    out.write(ansiEscapes.cursorSavePosition);
    out.write(ansiEscapes.cursorTo(0, rows - 1));
    out.write(ansiEscapes.eraseLine);
    const s = `${prompt}${buffer}`;
    out.write(s.slice(0, cols - 1));
    out.write(ansiEscapes.cursorRestorePosition);
  }

  function logLine(msg) {
    rows = out.rows || rows;
    const logRow = Math.max(1, rows - 2);
    out.write(ansiEscapes.cursorSavePosition);
    out.write(ansiEscapes.cursorTo(0, logRow));
    out.write(ansiEscapes.eraseLine);
    out.write(String(msg) + "\n"); // scroll in region
    out.write(ansiEscapes.cursorRestorePosition);
  }

  out.on("resize", setScrollRegion);

  return { enter, exit, writeStatus, logLine, renderInput };
}
