// ============================================================
// Sonara v0.3 - preload bridge
// This file runs before the web page loads. It exposes one
// tiny, safe API to the page: listening for playback commands
// from the Mac menu (Play / Pause, Next, Previous), and asking
// the Mac app to shrink to / grow back from the mini player.
// The page itself can never touch Electron directly.
// ============================================================

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("sonara", {
  onMediaKey: function (callback) {
    ipcRenderer.on("media-key", function (_event, action) {
      callback(action);
    });
  },
  setMiniMode: function (on) {
    ipcRenderer.send("set-mini-mode", on);
  },
  onMiniMode: function (callback) {
    ipcRenderer.on("mini-mode", function (_event, on) {
      callback(on);
    });
  },
  spotifyLogin: function (authUrl) {
    ipcRenderer.send("spotify-login", authUrl);
  },
  onSpotifyCode: function (callback) {
    ipcRenderer.on("spotify-code", function (_event, code) {
      callback(code);
    });
  },

  // v0.5: offline downloads. The page asks the main process to fetch
  // a file, and hears back about progress, completion, or failure.
  // The page itself never touches the file system.
  downloadTrack: function (payload) {
    ipcRenderer.send("download-track", payload);
  },
  onDownloadProgress: function (callback) {
    ipcRenderer.on("download-progress", function (_event, data) {
      callback(data);
    });
  },
  onDownloadDone: function (callback) {
    ipcRenderer.on("download-done", function (_event, data) {
      callback(data);
    });
  },
  onDownloadError: function (callback) {
    ipcRenderer.on("download-error", function (_event, data) {
      callback(data);
    });
  },
  deleteDownload: function (payload) {
    ipcRenderer.send("delete-download", payload);
  },

  // v0.5: smart playback. The main process reports macOS mute changes;
  // the page pauses the music when the system goes mute.
  onSystemMuted: function (callback) {
    ipcRenderer.on("system-muted", function (_event, muted) {
      callback(muted);
    });
  }
});
