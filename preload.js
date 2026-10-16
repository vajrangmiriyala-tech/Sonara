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
  }
});
