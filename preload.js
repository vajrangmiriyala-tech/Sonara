// ============================================================
// Sonara v0.3 - preload bridge
// This file runs before the web page loads. It exposes one
// tiny, safe API to the page: listening for playback commands
// from the Mac menu (Play / Pause, Next, Previous).
// The page itself can never touch Electron directly.
// ============================================================

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("sonara", {
  onMediaKey: function (callback) {
    ipcRenderer.on("media-key", function (_event, action) {
      callback(action);
    });
  }
});
