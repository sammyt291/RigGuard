const ESC = "\u001b[";

function write(value) {
  process.stdout.write(value);
}

function cursorTo(row, col) {
  write(`${ESC}${row};${col}H`);
}

function clearLine() {
  write(`${ESC}2K`);
}

function setScrollRegion(top, bottom) {
  write(`${ESC}${top};${bottom}r`);
}

export function createTerm() {
  let statusLine = "";
  let inAlt = false;

  function renderStatus() {
    if (!statusLine) return;
    cursorTo(1, 1);
    clearLine();
    write(statusLine);
  }

  function logLine(msg) {
    const rows = process.stdout.rows || 24;
    const logRow = Math.max(2, rows - 1);
    cursorTo(logRow, 1);
    clearLine();
    write(`${msg}\n`);
    renderStatus();
  }

  function enter() {
    inAlt = true;
    write(`${ESC}?1049h`);
    write(`${ESC}?25l`);
    write(`${ESC}2J`);
    const rows = process.stdout.rows || 24;
    setScrollRegion(2, Math.max(2, rows - 1));
    cursorTo(1, 1);
    clearLine();
  }

  function exit() {
    if (inAlt) {
      write(`${ESC}r`);
      write(`${ESC}?25h`);
      write(`${ESC}?1049l`);
      inAlt = false;
    }
  }

  function writeStatus(line) {
    statusLine = line;
    renderStatus();
  }

  return {
    enter,
    exit,
    writeStatus,
    logLine,
  };
}
