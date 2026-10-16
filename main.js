// ============================================================
// Sonara v0.3 - the Mac app shell (Electron)
// This file runs in the "main" process: it creates the window
// and the native Mac menu. The music player itself still lives
// in index.html / app.js, which load inside the window.
// ============================================================

const { app, BrowserWindow, Menu, ipcMain, shell } = require("electron");
const path = require("path");
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
      // web page. contextIsolation keeps the page safe.
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true
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
