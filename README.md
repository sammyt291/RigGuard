# HamWatch (console)

Plain console app:
- White status bar on top line
- Normal scrolling logs
- Input on bottom line
- Prompts for COM port selection unless `--port` or `--name` is provided
- LAN peer discovery + warns if someone else is on the same HAM band
- Icom CI-V decode + send (IC-7300 defaults)

## Install
```bash
npm install
```

## Run
```bash
npm start
```

## Select port (non-interactive)
```bash
node app.js --port COM9 --baud 19200
node app.js --name CP210x --baud 19200
```

If your CI-V frames show controller address `00`:
```bash
node app.js --ctrladdr 00
```

## In-app commands
Type `help`:

- `freq 14.200.000`      (set frequency)
- `mode usb`             (set mode)
- `mode usb 2`           (set mode with filter 1..3)
- `read freq` / `read mode`
- `split on|off`
- `vfo a|b`
- `power on|off`
- `set name <label>`
- `set baud <num>` then `reopen`
- `set rigaddr <hex>` / `set ctrladdr <hex>`
- `reopen`
- `peers`
- `quit`

## Notes
- Uses alternate screen + scroll region to keep the top status bar pinned.
