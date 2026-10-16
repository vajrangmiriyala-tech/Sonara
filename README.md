# Sonara

Sonara is a free and open-source music app for Mac. This is v0.1, the web player. It plays real music through the free Audius API. No account, no ads, no cost.

## Download the Mac app

Grab the latest DMG from the [Releases page](../../releases) (Apple Silicon Macs only).

1. Double-click the DMG, drag **Sonara** into **Applications**, eject the DMG.
2. **Before opening Sonara**, run this in Terminal (Spotlight -> type "Terminal"):

```
xattr -cr /Applications/Sonara.app
```

> **Why?** macOS shows a *"Sonara is damaged"* popup for unsigned apps. The app is not broken — this one command tells macOS to trust it. After that it opens normally.

3. Open Sonara from Applications. Drag it to your Dock for quick access.

## How to run

You need an internet connection, because the songs stream from the Audius API.

Option 1, easiest: double-click `index.html` and it opens in your browser.

Option 2, better for building: open this folder in VS Code, install the Live Server extension, and click "Go Live" at the bottom. The page reloads by itself every time you save a file.

## Run as a Mac app (v0.3)

You need Node.js installed (check with `node --version` in Terminal).

1. Open Terminal in this folder and run `npm install`. This downloads Electron, the tool that turns the web player into a real Mac app.
2. Run `npm start`. Sonara opens as its own app window, with a real Sonara menu at the top.
3. To build the DMG that other Mac users can install: run `npm run dist`. The DMG appears in a new `dist` folder.

Note: the DMG is unsigned (Apple charges $99/year for the certificate that removes the warning). On first launch, users right-click the app and choose Open. That is normal for free open-source Mac apps.

## What v0.1 can do

- Browse trending tracks of the week
- Search for songs and artists
- Play, pause, next, previous
- Seek bar with time display
- Volume control
- Keyboard shortcuts: Space to play/pause, left/right arrows for previous/next track, up/down arrows for volume, M to mute
- Mini player: tiny always-on-top window in the Mac app, floating card in the browser
- Sleep timer: pauses the music after 15, 30, 45, or 60 minutes
- Spotify import: connect your Spotify account and copy any playlist into Sonara (Mac app)
- If a track refuses to play, it skips to the next one and shows a small note
- Tracks without artwork get a clean placeholder tile, never a broken image

## Project files

- `index.html` - the page layout: sidebar, track grid, and the now-playing bar
- `styles.css` - all the styling, inspired by Apple Music
- `app.js` - all the logic in plain JavaScript, with comments on every section
- `LICENSE` - the MIT license

## Roadmap

- v0.2: playlists, queue, synced lyrics
- v0.3: Electron Mac app (DMG), media keys, mini player - done
- v1.0: themes, equalizer (sleep timer done)

## License

MIT. See `LICENSE`. Anyone can use, share, and build on this code.
