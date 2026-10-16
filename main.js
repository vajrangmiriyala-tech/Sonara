// ============================================================
// Sonara v0.3 - the Mac app shell (Electron)
// This file runs in the "main" process: it creates the window
// and the native Mac menu. The music player itself still lives
// in index.html / app.js, which load inside the window.
// ============================================================

const { app, BrowserWindow, Menu } = require("electron");
const path = require("path");

let mainWindow = null;

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
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "toggleDevTools" }
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
