// ============================================================
// Sonara v0.6 - the Mac app shell (Electron)
// This file runs in the "main" process: it creates the window
// and the native Mac menu. The music player itself still lives
// in index.html / app.js, which load inside the window.
// ------------------------------------------------------------
// SECURITY MODEL (v0.6 hardening):
// - contextIsolation: true + sandbox: true. The web page runs in a
//   locked-down renderer with no Node.js access at all. It can only
//   talk to this process through the tiny, named API in preload.js
//   (downloadTrack, onDownloadProgress, ...). Nothing else crosses.
// - Content-Security-Policy (index.html <meta>): only our own app.js
//   may run as script; network calls (fetch/XHR) may only reach the
//   six API hosts the app actually uses; images/media may come from
//   any HTTPS host (Audius artwork and streams live on a changing
//   set of decentralized content nodes, so allowlisting them all is
//   impossible). Images and audio cannot run code.
// - Download guard (download-track handler below): the file URL must
//   be HTTPS and may not point at a private or local address. The URL
//   comes from the Audius API today; this is defense in depth against
//   a spoofed response turning the downloader into a network probe.
// - Rendering: app.js sets every API string via textContent (never
//   innerHTML). The only innerHTML uses are "" (clearing) and
//   hardcoded SVG icon constants. No API data ever becomes HTML.
// - No secrets in code: the app has no API keys, no tokens, no
//   credentials. Spotify uses the user's own OAuth code flow.
// ============================================================

const { app, BrowserWindow, Menu, ipcMain, shell } = require("electron");
const path = require("path");

// The display name everywhere: About panel and the user-data
// folder. (In dev mode the macOS menu bar still shows "Electron"
// because it is Electron's binary; the packaged DMG shows Sonara.)
app.setName("Sonara");
const http = require("http");

let mainWindow = null;
let miniMode = false;
let normalBounds = null; // remembers the window size before mini mode

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: "Sonara",
    backgroundColor: "#f5f5f7",
    webPreferences: {
      // preload.js is the only bridge between this file and the
      // web page. contextIsolation + sandbox keep the page in a
      // locked-down renderer with no Node.js access of its own.
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: true
    }
  });

  mainWindow.loadFile("index.html");

  mainWindow.on("closed", function () {
    mainWindow = null;
  });
}

// Sends a playback command to the web page inside the window.
function sendMediaKey(action) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("media-key", action);
  }
}

// Shrinks the window to the tiny always-on-top mini player,
// or grows it back to its previous size. The page is told
// after the resize so it can swap its layout.
function applyMiniMode(on) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  miniMode = on;
  if (on) {
    normalBounds = mainWindow.getBounds();
    // The window's minimum size must drop first, or the
    // shrink below would be clamped and do nothing.
    mainWindow.setMinimumSize(320, 140);
    mainWindow.setSize(380, 150);
    mainWindow.setAlwaysOnTop(true);
  } else {
    mainWindow.setAlwaysOnTop(false);
    mainWindow.setMinimumSize(900, 600);
    if (normalBounds) {
      mainWindow.setBounds(normalBounds);
    }
  }
  mainWindow.webContents.send("mini-mode", on);
}

// The page asks for mini mode through the preload bridge.
ipcMain.on("set-mini-mode", function (_event, on) {
  applyMiniMode(!!on);
});


// ---------- Spotify login ----------

// Spotify sends the user back to a tiny local web server after
// they approve Sonara. We read the login code from that request,
// hand it to the page, and shut the server back down. Nothing
// listens on the network except during those few seconds.

let spotifyServer = null;

function stopSpotifyServer() {
  if (spotifyServer) {
    spotifyServer.close();
    spotifyServer = null;
  }
}

function startSpotifyLogin(authUrl) {
  stopSpotifyServer();
  spotifyServer = http.createServer(function (req, res) {
    let code = "";
    try {
      const url = new URL(req.url, "http://127.0.0.1:8888");
      if (url.pathname === "/callback") {
        code = url.searchParams.get("code") || "";
      }
    } catch (e) {
      code = "";
    }
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end("<h2 style=\"font-family:sans-serif\">Sonara is connected. You can close this tab.</h2>");
    if (code && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("spotify-code", code);
    }
    stopSpotifyServer();
  });
  spotifyServer.listen(8888, "127.0.0.1", function () {
    shell.openExternal(authUrl);
  });
}

ipcMain.on("spotify-login", function (_event, authUrl) {
  startSpotifyLogin(authUrl);
});


// ---------- v0.5: Offline downloads ----------

// Downloads live inside the app's own data folder, so removing the
// app cleans them up too. One file per track, named by track id.
// The web page keeps the registry (what is downloaded); this process
// only moves bytes and reports progress.

const fs = require("fs");
const https = require("https");

function downloadsDir() {
  const dir = path.join(app.getPath("userData"), "downloads");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Safe file name: Audius ids are already alphanumeric, but we strip
// anything else anyway so a strange id can never escape the folder.
// The extension comes from the URL when it has one, else mp3.
function downloadFileName(trackId, url) {
  const safeId = String(trackId).replace(/[^a-zA-Z0-9_-]/g, "");
  let ext = "mp3";
  const m = /\.([a-z0-9]{2,4})(?:[?#]|$)/i.exec(url || "");
  if (m) {
    ext = m[1].toLowerCase();
  }
  return safeId + "." + ext;
}

// Fetches a URL into a file, following up to 3 redirects, and calls
// onProgress(received, total) as bytes arrive. done(err, received).
function fetchToFile(url, tmpPath, redirectsLeft, onProgress, done) {
  let finished = false;
  function finish(err, received) {
    if (finished) {
      return;
    }
    finished = true;
    done(err, received);
  }

  const req = https.get(url, { timeout: 30000 }, function (res) {
    // Signed Audius URLs sometimes bounce; follow them.
    if (res.statusCode >= 300 && res.statusCode < 400 &&
        res.headers.location && redirectsLeft > 0) {
      res.resume();
      fetchToFile(res.headers.location, tmpPath, redirectsLeft - 1,
        onProgress, finish);
      return;
    }
    if (res.statusCode !== 200) {
      res.resume();
      finish(new Error("bad status " + res.statusCode));
      return;
    }
    const total = parseInt(res.headers["content-length"], 10) || 0;
    let received = 0;
    const out = fs.createWriteStream(tmpPath);
    out.on("error", function (err) { finish(err); });
    res.on("data", function (chunk) {
      received += chunk.length;
      onProgress(received, total);
    });
    res.on("error", function (err) {
      out.destroy();
      finish(err);
    });
    res.on("end", function () {
      out.end(function () { finish(null, received); });
    });
    res.pipe(out);
  });
  req.on("timeout", function () {
    req.destroy(new Error("timed out"));
  });
  req.on("error", function (err) { finish(err); });
}

const activeDownloads = {}; // trackId -> true while a download runs

// payload: { trackId, url, title }
ipcMain.on("download-track", function (event, payload) {
  const sender = event.sender;
  const trackId = payload && payload.trackId;
  const url = payload && payload.url;
  if (!trackId || !url || activeDownloads[trackId]) {
    return; // bad input, or a double-tap: never start twice
  }
  // v0.6: download URL guard. The file must come over HTTPS, and never
  // from a private or local address (that would let a spoofed API
  // response probe the user's own network). Legitimate download URLs
  // live on Audius's decentralized content nodes, whose hostnames
  // change, so we guard the shape of the URL, not its hostname.
  let urlOk = false;
  try {
    const u = new URL(String(url));
    const host = u.hostname.toLowerCase();
    const isPrivate = host === "localhost" || host === "::1" ||
      /^127\./.test(host) || /^10\./.test(host) ||
      /^192\.168\./.test(host) || /^169\.254\./.test(host) ||
      /^172\.(1[6-9]|2[0-9]|3[01])\./.test(host) ||
      host === "0.0.0.0";
    urlOk = u.protocol === "https:" && !isPrivate;
  } catch (e) {
    urlOk = false;
  }
  if (!urlOk) {
    sender.send("download-error",
      { trackId: trackId, message: "Download refused: unexpected address." });
    return;
  }
  activeDownloads[trackId] = true;

  const fileName = downloadFileName(trackId, url);
  const tmpPath = path.join(downloadsDir(), fileName + ".part");
  const finalPath = path.join(downloadsDir(), fileName);

  fetchToFile(url, tmpPath, 3,
    function (received, total) {
      if (!sender.isDestroyed()) {
        sender.send("download-progress",
          { trackId: trackId, received: received, total: total });
      }
    },
    function (err) {
      delete activeDownloads[trackId];
      if (sender.isDestroyed()) {
        return;
      }
      if (err) {
        fs.unlink(tmpPath, function () {});
        // Plain words only, never the raw error.
        const msg = err.code === "ENOSPC"
          ? "Your disk is full."
          : "Download failed. Check your connection and try again.";
        sender.send("download-error", { trackId: trackId, message: msg });
        return;
      }
      // Rename only when the file is complete, so a half
      // download can never pass as a finished song.
      fs.rename(tmpPath, finalPath, function (renameErr) {
        if (renameErr) {
          sender.send("download-error",
            { trackId: trackId, message: "Could not save the file." });
          return;
        }
        let size = 0;
        try {
          size = fs.statSync(finalPath).size;
        } catch (e) {
          size = 0;
        }
        sender.send("download-done",
          { trackId: trackId, filePath: finalPath, size: size });
      });
    });
});

// payload: { trackId, filePath }
ipcMain.on("delete-download", function (_event, payload) {
  const filePath = payload && payload.filePath;
  if (!filePath) {
    return;
  }
  // Only delete inside our own downloads folder, never anywhere else.
  const dir = path.resolve(downloadsDir()) + path.sep;
  const resolved = path.resolve(filePath);
  if (resolved.indexOf(dir) !== 0) {
    return;
  }
  fs.unlink(resolved, function () {
    // Missing file is fine: the goal (it being gone) is already true.
  });
});


// ---------- v0.5: Smart playback: pause when the Mac is muted ----------

// Every 3 seconds we ask macOS whether the system output is muted.
// Only changes are reported to the page, which pauses the music.
// macOS only: the whole app is Mac-only, but the guard keeps the
// code honest if it ever runs anywhere else.
const { exec } = require("child_process");
let lastMuted = null;

if (process.platform === "darwin") {
  setInterval(function () {
    exec("osascript -e 'output muted of (get volume settings)'",
      function (err, stdout) {
        if (err) {
          return; // a hiccup: try again on the next tick
        }
        const muted = /true/i.test(stdout);
        if (muted !== lastMuted) {
          lastMuted = muted;
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send("system-muted", muted);
          }
        }
      });
  }, 3000);
}

app.whenReady().then(function () {
  createWindow();

  // A real Mac app menu with the Sonara name.
  const menu = Menu.buildFromTemplate([
    {
      label: "Sonara",
      submenu: [
        { role: "about" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" }
      ]
    },
    {
      label: "Playback",
      submenu: [
        {
          label: "Play / Pause",
          accelerator: "Space",
          click: function () { sendMediaKey("playpause"); }
        },
        {
          label: "Next Track",
          accelerator: "Cmd+Right",
          click: function () { sendMediaKey("next"); }
        },
        {
          label: "Previous Track",
          accelerator: "Cmd+Left",
          click: function () { sendMediaKey("prev"); }
        }
      ]
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" }
      ]
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        {
          label: "Mini Player",
          accelerator: "Shift+Cmd+M",
          click: function () { applyMiniMode(!miniMode); }
        }
      ]
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "close" }
      ]
    }
  ]);
  Menu.setApplicationMenu(menu);

  // On macOS, re-open a window when the dock icon is clicked
  // and no windows are open.
  app.on("activate", function () {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// On macOS the app stays running until the user quits it.
app.on("window-all-closed", function () {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
