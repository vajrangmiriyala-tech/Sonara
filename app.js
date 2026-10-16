// ============================================================
// Sonara v0.1
// Plain JavaScript. No frameworks, no build step.
// Read from top to bottom:
//   1. Settings (the Audius API)
//   2. Page elements we will control
//   3. Player state (what is in the queue, what is playing)
//   4. Small helper functions
//   5. Building track cards on the page
//   6. Loading trending tracks
//   7. Search
//   8. The player: play, pause, next, previous, skip
//   9. The Up Next list
//  10. Playlists (saved in the browser)
//  11. Wiring up buttons and the audio element
//  12. Synced lyrics
//  13. Start the app
// ============================================================


// ---------- 1. Settings ----------

// The free Audius API. Every request must carry ?app_name=Sonara.
const API_BASE = "https://discoveryprovider.audius.co/v1";
const APP_NAME = "Sonara";

// How many trending tracks to load, and how long to wait
// after typing before searching (in milliseconds).
const TRENDING_LIMIT = 24;
const SEARCH_DELAY = 400;


// ---------- 2. Page elements ----------

// getElementById grabs one element by its id from index.html.
const trendingGrid = document.getElementById("trendingGrid");
const trendingMessage = document.getElementById("trendingMessage");
const searchGrid = document.getElementById("searchGrid");
const searchMessage = document.getElementById("searchMessage");
const searchInput = document.getElementById("searchInput");
const browseView = document.getElementById("browseView");
const searchView = document.getElementById("searchView");
const queueView = document.getElementById("queueView");
const queueList = document.getElementById("queueList");
const queueMessage = document.getElementById("queueMessage");
const playlistNav = document.getElementById("playlistNav");
const newPlaylistBtn = document.getElementById("newPlaylistBtn");
const playlistNew = document.getElementById("playlistNew");
const playlistNameInput = document.getElementById("playlistNameInput");
const playlistView = document.getElementById("playlistView");
const playlistTitle = document.getElementById("playlistTitle");
const playlistSubtitle = document.getElementById("playlistSubtitle");
const playlistList = document.getElementById("playlistList");
const playlistMessage = document.getElementById("playlistMessage");
const deletePlaylistBtn = document.getElementById("deletePlaylistBtn");
const addMenu = document.getElementById("addMenu");
const lyricsView = document.getElementById("lyricsView");
const lyricsSubtitle = document.getElementById("lyricsSubtitle");
const lyricsLines = document.getElementById("lyricsLines");
const lyricsMessage = document.getElementById("lyricsMessage");
const navButtons = document.querySelectorAll(".nav-btn");

const audio = document.getElementById("audio");
const playerArt = document.getElementById("playerArt");
const playerTitle = document.getElementById("playerTitle");
const playerArtist = document.getElementById("playerArtist");
const playButton = document.getElementById("playButton");
const prevButton = document.getElementById("prevButton");
const nextButton = document.getElementById("nextButton");
const seekBar = document.getElementById("seekBar");
const currentTimeLabel = document.getElementById("currentTime");
const durationLabel = document.getElementById("duration");
const volumeBar = document.getElementById("volumeBar");
const skipNote = document.getElementById("skipNote");
const miniPlayer = document.getElementById("miniPlayer");
const miniArt = document.getElementById("miniArt");
const miniTitle = document.getElementById("miniTitle");
const miniArtist = document.getElementById("miniArtist");
const miniPlay = document.getElementById("miniPlay");
const miniPrev = document.getElementById("miniPrev");
const miniNext = document.getElementById("miniNext");
const miniClose = document.getElementById("miniClose");
const miniPlayerBtn = document.getElementById("miniPlayerBtn");
const sleepBtn = document.getElementById("sleepBtn");
const sleepMenu = document.getElementById("sleepMenu");


// ---------- 3. Player state ----------

let trendingTracks = []; // tracks loaded on the Browse tab
let searchResults = [];  // tracks loaded on the Search tab
let queue = [];          // the list we are currently playing from
let currentIndex = -1;   // position in the queue, -1 means nothing picked yet
let searchTimer = null;  // used to wait a beat before searching
let skipNoteTimer = null;
let lastSkipSrc = "";    // remembers a bad track so we skip it only once


// ---------- 4. Small helper functions ----------

// SVG icons, kept as text so we can swap them in and out.
const NOTE_SVG = '<svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor" aria-hidden="true"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>';
const PLAY_SVG = '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
const PAUSE_SVG = '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>';
const PLAY_SVG_SMALL = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
const PLUS_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z"/></svg>';

// Turns seconds into "m:ss", for example 125 becomes "2:05".
function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) {
    return "0:00";
  }
  const total = Math.floor(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return mins + ":" + String(secs).padStart(2, "0");
}

// Picks an artwork URL from a track, or null when it has none.
function artworkUrl(track, size) {
  if (track.artwork && track.artwork[size]) {
    return track.artwork[size];
  }
  return null;
}

// Builds the playable stream URL for one track id.
function streamUrl(trackId) {
  return API_BASE + "/tracks/" + trackId + "/stream?app_name=" + APP_NAME;
}

// The artist lives inside track.user.name. Playlist songs store it
// as track.artist instead, so we check both.
function artistName(track) {
  if (track.user && track.user.name) {
    return track.user.name;
  }
  if (track.artist) {
    return track.artist;
  }
  return "Unknown artist";
}

// A music note icon used wherever artwork is missing.
function noteIcon() {
  const span = document.createElement("span");
  span.innerHTML = NOTE_SVG;
  span.style.display = "flex";
  return span;
}


// ---------- 5. Building track cards ----------

// One square artwork tile. Shows the image, or a soft placeholder
// tile with a note icon when the track has no artwork.
function makeArtwork(track) {
  const box = document.createElement("div");
  box.className = "artwork";

  const url = artworkUrl(track, "480x480");

  if (url) {
    const img = document.createElement("img");
    img.src = url;
    img.alt = track.title;
    img.loading = "lazy"; // load images only when scrolled into view
    // If the image link is broken, swap to the placeholder instead.
    img.onerror = function () {
      box.classList.add("artwork-missing");
      box.innerHTML = "";
      box.appendChild(noteIcon());
    };
    box.appendChild(img);
  } else {
    box.classList.add("artwork-missing");
    box.appendChild(noteIcon());
  }

  // Round play button that appears when you hover the card.
  const overlay = document.createElement("button");
  overlay.className = "card-play";
  overlay.setAttribute("aria-label", "Play " + track.title);
  overlay.innerHTML = PLAY_SVG_SMALL;
  box.appendChild(overlay);

  // Small + button that adds the song to a playlist.
  // stopPropagation stops the card's own click, so it does not start playing.
  const addBtn = document.createElement("button");
  addBtn.className = "card-add";
  addBtn.setAttribute("aria-label", "Add to playlist");
  addBtn.innerHTML = PLUS_SVG;
  addBtn.addEventListener("click", function (event) {
    event.stopPropagation();
    openAddMenu(track, addBtn);
  });
  box.appendChild(addBtn);

  return box;
}

// One full card: artwork on top, title and artist below.
// onPick is a function we call with the card's index when clicked.
function trackCard(track, index, onPick) {
  const card = document.createElement("article");
  card.className = "card";
  card.tabIndex = 0; // lets keyboard users focus the card

  card.appendChild(makeArtwork(track));

  const title = document.createElement("div");
  title.className = "card-title";
  title.textContent = track.title; // textContent is safe: no HTML runs
  card.appendChild(title);

  const artist = document.createElement("div");
  artist.className = "card-artist";
  artist.textContent = artistName(track);
  card.appendChild(artist);

  function pick() {
    onPick(index);
  }
  card.addEventListener("click", pick);
  card.addEventListener("keydown", function (event) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      pick();
    }
  });

  return card;
}

// Clears a grid and fills it with cards for every track.
function renderTracks(grid, tracks, onPick) {
  grid.innerHTML = "";
  tracks.forEach(function (track, index) {
    grid.appendChild(trackCard(track, index, onPick));
  });
}


// ---------- 6. Loading trending tracks ----------

async function loadTrending() {
  trendingMessage.textContent = "Loading trending tracks...";
  trendingMessage.hidden = false;

  try {
    const url = API_BASE + "/tracks/trending?app_name=" + APP_NAME +
                "&limit=" + TRENDING_LIMIT + "&time=week";
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error("bad response");
    }
    const json = await response.json();
    const tracks = json.data || [];

    if (tracks.length === 0) {
      trendingMessage.textContent = "No trending tracks right now. Try again later.";
      return;
    }

    trendingMessage.hidden = true;
    trendingTracks = tracks;
    // Clicking a card starts playing from the trending list at that card.
    renderTracks(trendingGrid, tracks, function (index) {
      startQueue(trendingTracks, index);
    });
  } catch (error) {
    // Friendly message only. We never show the raw error to the user.
    trendingMessage.textContent =
      "Could not load music. Check your internet connection and reload the page.";
  }
}


// ---------- 7. Search ----------

// Wait a beat after each keystroke so we do not search on every letter.
searchInput.addEventListener("input", function () {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(runSearch, SEARCH_DELAY);
});

async function runSearch() {
  const query = searchInput.value.trim();

  if (query.length === 0) {
    searchGrid.innerHTML = "";
    searchMessage.textContent = "Type above to find music.";
    searchMessage.hidden = false;
    return;
  }

  searchMessage.textContent = "Searching...";
  searchMessage.hidden = false;

  try {
    const url = API_BASE + "/tracks/search?query=" + encodeURIComponent(query) +
                "&app_name=" + APP_NAME;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error("bad response");
    }
    const json = await response.json();
    const tracks = json.data || [];

    if (tracks.length === 0) {
      searchGrid.innerHTML = "";
      searchMessage.textContent = "No songs found. Try another search.";
      return;
    }

    searchMessage.hidden = true;
    searchResults = tracks;
    renderTracks(searchGrid, tracks, function (index) {
      startQueue(searchResults, index);
    });
  } catch (error) {
    searchGrid.innerHTML = "";
    searchMessage.textContent =
      "Search failed. Check your internet connection and try again.";
  }
}


// ---------- 8. The player ----------

// Start playing a list from a given position.
function startQueue(list, index) {
  queue = list;
  currentIndex = index;
  playCurrent();
}

// Play the track at currentIndex.
function playCurrent() {
  const track = queue[currentIndex];
  if (!track) {
    return;
  }
  lastSkipSrc = ""; // new track, so a fresh skip is allowed
  audio.src = streamUrl(track.id);
  audio.play().catch(function () {
    // The browser refused to play. Often a stream-gated track.
    skipWithNote();
  });
  updatePlayerUI(track);
}

// Play / pause toggle for the big round button.
function togglePlay() {
  if (currentIndex === -1) {
    // Nothing picked yet: start the first trending track.
    if (trendingTracks.length > 0) {
      startQueue(trendingTracks, 0);
    }
    return;
  }
  if (audio.paused) {
    audio.play();
  } else {
    audio.pause();
  }
}

function nextTrack() {
  if (currentIndex + 1 < queue.length) {
    currentIndex = currentIndex + 1;
    playCurrent();
  }
}

function prevTrack() {
  // If we are a few seconds into the song, restart it instead of going back.
  if (audio.currentTime > 3 && currentIndex !== -1) {
    audio.currentTime = 0;
    return;
  }
  if (currentIndex > 0) {
    currentIndex = currentIndex - 1;
    playCurrent();
  }
}

// Skip a broken track and show a tiny note saying so.
function skipWithNote() {
  if (audio.src === lastSkipSrc) {
    return; // already skipped for this track, do not skip twice
  }
  lastSkipSrc = audio.src;
  showSkipNote("Skipped a track that would not play.");
  nextTrack();
}

function showSkipNote(text) {
  skipNote.textContent = text;
  skipNote.hidden = false;
  clearTimeout(skipNoteTimer);
  skipNoteTimer = setTimeout(function () {
    skipNote.hidden = true;
  }, 3000);
}

// Refresh the bottom bar: artwork, title, artist, and the browser tab title.
function updatePlayerUI(track) {
  playerArt.innerHTML = "";
  playerArt.classList.remove("artwork-missing");

  const url = artworkUrl(track, "150x150");
  if (url) {
    const img = document.createElement("img");
    img.src = url;
    img.alt = "";
    img.onerror = function () {
      playerArt.classList.add("artwork-missing");
      playerArt.innerHTML = "";
      playerArt.appendChild(noteIcon());
    };
    playerArt.appendChild(img);
  } else {
    playerArt.classList.add("artwork-missing");
    playerArt.appendChild(noteIcon());
  }

  playerTitle.textContent = track.title;
  playerArtist.textContent = artistName(track);
  document.title = track.title + " - " + artistName(track) + " | Sonara";

  // Keep the mini player in sync when it is open.
  if (miniOpen || !miniPlayer.hidden) {
    syncMiniTrack();
  }

  // Keep the Up Next list in sync every time a new track starts.
  renderQueue();

  // Fetch lyrics for the new track in the background.
  loadLyrics(track);
}


// ---------- The Up Next list ----------

// One row in the Up Next list: small artwork, title, artist.
// The currently playing song gets highlighted.
function queueRow(track, index) {
  const row = document.createElement("button");
  row.className = "queue-row";
  if (index === currentIndex) {
    row.className = "queue-row playing";
  }

  const art = document.createElement("div");
  art.className = "q-art";
  const url = artworkUrl(track, "150x150");
  if (url) {
    const img = document.createElement("img");
    img.src = url;
    img.alt = "";
    img.onerror = function () {
      art.innerHTML = "";
      art.appendChild(noteIcon());
    };
    art.appendChild(img);
  } else {
    art.appendChild(noteIcon());
  }
  row.appendChild(art);

  const text = document.createElement("div");
  text.className = "q-text";

  const title = document.createElement("div");
  title.className = "q-title";
  title.textContent = track.title;
  text.appendChild(title);

  const artist = document.createElement("div");
  artist.className = "q-artist";
  artist.textContent = artistName(track);
  text.appendChild(artist);

  row.appendChild(text);

  // Clicking a row jumps straight to that song.
  row.addEventListener("click", function () {
    currentIndex = index;
    playCurrent();
  });

  return row;
}

// Rebuilds the Up Next list from the current queue.
function renderQueue() {
  queueList.innerHTML = "";

  if (queue.length === 0) {
    queueMessage.textContent = "Nothing queued yet. Play something first.";
    queueMessage.hidden = false;
    return;
  }

  queueMessage.hidden = true;
  queue.forEach(function (track, index) {
    queueList.appendChild(queueRow(track, index));
  });
}


// ---------- 10. Playlists (saved in the browser) ----------

// Playlists live in localStorage, so they survive closing the page.
// Each one looks like: { id: "p123", name: "Chill", tracks: [song, song] }
// A stored song is a small summary: { id, title, artist, artwork }.
const PLAYLIST_KEY = "sonara-playlists";
let playlists = loadPlaylists();
let openPlaylistId = null; // which playlist is open right now

function loadPlaylists() {
  try {
    const raw = localStorage.getItem(PLAYLIST_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch (error) {
    return [];
  }
}

function savePlaylists() {
  try {
    localStorage.setItem(PLAYLIST_KEY, JSON.stringify(playlists));
  } catch (error) {
    // Storage is full or blocked. The app keeps working for this session.
  }
}

function findPlaylist(pid) {
  return playlists.find(function (p) { return p.id === pid; });
}

// Shrinks a full API track down to the small summary we store.
function trackSummary(track) {
  const art = track.artwork ? {
    "150x150": track.artwork["150x150"] || null,
    "480x480": track.artwork["480x480"] || null
  } : null;
  return { id: track.id, title: track.title, artist: artistName(track), artwork: art };
}

// The playlist buttons in the sidebar, with a song count on each.
function renderPlaylistNav() {
  playlistNav.innerHTML = "";
  playlists.forEach(function (pl) {
    const b = document.createElement("button");
    b.className = "nav-btn playlist-btn";
    b.dataset.pid = pl.id;

    const name = document.createElement("span");
    name.textContent = pl.name;
    b.appendChild(name);

    const count = document.createElement("span");
    count.className = "count";
    count.textContent = pl.tracks.length;
    b.appendChild(count);

    b.addEventListener("click", function () {
      showPlaylist(pl.id);
    });
    playlistNav.appendChild(b);
  });
}

// Opens one playlist in the main area.
function showPlaylist(pid) {
  openPlaylistId = pid;
  showView("playlist");
  renderPlaylistSongs();
}

// One row inside an open playlist, with a remove button.
function playlistRow(pl, song, index) {
  const row = document.createElement("div");
  row.className = "queue-row";

  const art = document.createElement("div");
  art.className = "q-art";
  const url = song.artwork ? song.artwork["150x150"] : null;
  if (url) {
    const img = document.createElement("img");
    img.src = url;
    img.alt = "";
    img.onerror = function () {
      art.innerHTML = "";
      art.appendChild(noteIcon());
    };
    art.appendChild(img);
  } else {
    art.appendChild(noteIcon());
  }
  row.appendChild(art);

  const text = document.createElement("div");
  text.className = "q-text";

  const title = document.createElement("div");
  title.className = "q-title";
  title.textContent = song.title;
  text.appendChild(title);

  const artist = document.createElement("div");
  artist.className = "q-artist";
  artist.textContent = song.artist;
  text.appendChild(artist);

  row.appendChild(text);

  const rm = document.createElement("button");
  rm.className = "remove-btn";
  rm.setAttribute("aria-label", "Remove from playlist");
  rm.textContent = "x";
  rm.addEventListener("click", function (event) {
    event.stopPropagation();
    pl.tracks.splice(index, 1);
    savePlaylists();
    renderPlaylistNav();
    renderPlaylistSongs();
  });
  row.appendChild(rm);

  // Clicking the row plays the playlist from this song.
  row.addEventListener("click", function () {
    startQueue(pl.tracks, index);
  });

  return row;
}

function renderPlaylistSongs() {
  const pl = findPlaylist(openPlaylistId);
  playlistList.innerHTML = "";

  if (!pl) {
    return;
  }

  playlistTitle.textContent = pl.name;
  playlistSubtitle.textContent = pl.tracks.length +
    (pl.tracks.length === 1 ? " song" : " songs");
  deletePlaylistBtn.textContent = "Delete playlist";

  if (pl.tracks.length === 0) {
    playlistMessage.textContent =
      "This playlist is empty. Add songs with the + button on any song.";
    playlistMessage.hidden = false;
    return;
  }

  playlistMessage.hidden = true;
  pl.tracks.forEach(function (song, index) {
    playlistList.appendChild(playlistRow(pl, song, index));
  });
}

// Adds a song to a playlist, unless it is already there.
function addToPlaylist(pid, track) {
  const pl = findPlaylist(pid);
  if (!pl) {
    return;
  }
  const exists = pl.tracks.some(function (t) { return t.id === track.id; });
  if (exists) {
    showSkipNote("Already in " + pl.name + ".");
    return;
  }
  pl.tracks.push(trackSummary(track));
  savePlaylists();
  renderPlaylistNav();
  if (openPlaylistId === pid) {
    renderPlaylistSongs();
  }
  showSkipNote("Added to " + pl.name + ".");
}

// The small popup menu for picking which playlist gets the song.
function openAddMenu(track, anchor) {
  addMenu.innerHTML = "";

  if (playlists.length === 0) {
    const empty = document.createElement("div");
    empty.className = "add-menu-empty";
    empty.textContent = "No playlists yet. Make one with the + in the sidebar.";
    addMenu.appendChild(empty);
  } else {
    playlists.forEach(function (pl) {
      const item = document.createElement("button");
      item.className = "add-menu-item";
      item.textContent = pl.name;
      item.addEventListener("click", function (event) {
        event.stopPropagation();
        addToPlaylist(pl.id, track);
        closeAddMenu();
      });
      addMenu.appendChild(item);
    });
  }

  const r = anchor.getBoundingClientRect();
  addMenu.style.top = (r.bottom + window.scrollY + 6) + "px";
  addMenu.style.left = Math.max(8, Math.min(r.left + window.scrollX,
    window.innerWidth - 200)) + "px";
  addMenu.hidden = false;
}

function closeAddMenu() {
  addMenu.hidden = true;
}

// Clicking anywhere else closes the menus.
document.addEventListener("click", function () {
  closeAddMenu();
  closeSleepMenu();
});


// ---------- 12. Synced lyrics ----------

// Lyrics come from lrclib, a free lyrics database. No API key needed.
// We ask by artist and song name. The answer has syncedLyrics
// (lines with timestamps like [01:23.45]) and plainLyrics (plain text).
const LYRIC_API = "https://lrclib.net/api/get";

let lyricLines = [];   // [{ time: seconds, text: "line" }], sorted by time
let lyricPlain = "";   // plain text fallback when no timestamps exist
let lyricState = "idle"; // idle | loading | synced | plain | none
let lyricTrackId = null; // which song these lyrics belong to
let lastActiveLine = -1;
const lyricCache = {}; // song id -> { lines, plain } or null when none found

// Turns "[01:23.45] hello" into { time: 83.45, text: "hello" }.
function parseLRC(lrcText) {
  const lines = [];
  const pattern = /\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/;
  lrcText.split("\n").forEach(function (raw) {
    const m = pattern.exec(raw);
    if (!m) {
      return;
    }
    const mins = parseInt(m[1], 10);
    const secs = parseInt(m[2], 10);
    const frac = m[3].length === 3 ? parseInt(m[3], 10) / 1000
                                   : parseInt(m[3], 10) / 100;
    const text = m[4].trim();
    if (text) {
      lines.push({ time: mins * 60 + secs + frac, text: text });
    }
  });
  lines.sort(function (a, b) { return a.time - b.time; });
  return lines;
}

// Fetches lyrics for a track. Results are cached, so each song
// is looked up only once no matter how often it plays.
async function loadLyrics(track) {
  lyricTrackId = track.id;
  lyricState = "loading";
  lyricLines = [];
  lyricPlain = "";
  lastActiveLine = -1;
  if (!lyricsView.hidden) {
    renderLyrics();
  }

  if (lyricCache[track.id] !== undefined) {
    useLyricResult(track.id, lyricCache[track.id]);
    return;
  }

  try {
    const url = LYRIC_API +
      "?artist_name=" + encodeURIComponent(artistName(track)) +
      "&track_name=" + encodeURIComponent(track.title);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error("no lyrics");
    }
    const json = await response.json();
    const lines = json.syncedLyrics ? parseLRC(json.syncedLyrics) : [];
    const plain = json.plainLyrics || "";
    const result = (lines.length > 0 || plain) ? { lines: lines, plain: plain }
                                              : null;
    lyricCache[track.id] = result;
    useLyricResult(track.id, result);
  } catch (error) {
    lyricCache[track.id] = null;
    useLyricResult(track.id, null);
  }
}

// Applies a lyrics result, but only if the user has not
// switched to another song while we were fetching.
function useLyricResult(trackId, result) {
  if (lyricTrackId !== trackId) {
    return;
  }
  if (result && result.lines.length > 0) {
    lyricLines = result.lines;
    lyricState = "synced";
  } else if (result && result.plain) {
    lyricPlain = result.plain;
    lyricState = "plain";
  } else {
    lyricState = "none";
  }
  if (!lyricsView.hidden) {
    renderLyrics();
    updateLyricHighlight();
  }
}

// Draws the lyrics view from the current state.
function renderLyrics() {
  lyricsLines.innerHTML = "";
  lastActiveLine = -1;

  const track = queue[currentIndex];
  if (!track) {
    lyricsSubtitle.textContent = "";
    lyricsMessage.textContent = "Play a song to see its lyrics.";
    lyricsMessage.hidden = false;
    return;
  }

  lyricsSubtitle.textContent = track.title + " - " + artistName(track);

  if (lyricState === "loading" || lyricState === "idle") {
    lyricsMessage.textContent = "Finding lyrics...";
    lyricsMessage.hidden = false;
    return;
  }

  if (lyricState === "none") {
    lyricsMessage.textContent = "No lyrics found for this song.";
    lyricsMessage.hidden = false;
    return;
  }

  lyricsMessage.hidden = true;

  if (lyricState === "synced") {
    lyricLines.forEach(function (line) {
      const div = document.createElement("div");
      div.className = "lyric-line";
      div.textContent = line.text;
      lyricsLines.appendChild(div);
    });
  } else {
    const div = document.createElement("div");
    div.className = "lyric-plain";
    div.textContent = lyricPlain;
    lyricsLines.appendChild(div);
  }
}

// Lights up the line matching the current playback time
// and scrolls it into view.
function updateLyricHighlight() {
  if (lyricLines.length === 0 || lyricsView.hidden) {
    return;
  }
  const t = audio.currentTime;
  let active = -1;
  for (let i = 0; i < lyricLines.length; i++) {
    if (lyricLines[i].time <= t) {
      active = i;
    } else {
      break;
    }
  }
  if (active === lastActiveLine) {
    return;
  }
  lastActiveLine = active;
  const rows = lyricsLines.querySelectorAll(".lyric-line");
  rows.forEach(function (row, i) {
    row.classList.toggle("active", i === active);
  });
  if (active >= 0 && rows[active]) {
    rows[active].scrollIntoView({ block: "center", behavior: "smooth" });
  }
}


// ---------- 9. Wiring up buttons and the audio element ----------

playButton.addEventListener("click", togglePlay);
nextButton.addEventListener("click", nextTrack);
prevButton.addEventListener("click", prevTrack);

// Swap the round button icon between play and pause.
audio.addEventListener("play", function () {
  playButton.innerHTML = PAUSE_SVG;
  playButton.setAttribute("aria-label", "Pause");
  syncMiniPlayIcon();
});
audio.addEventListener("pause", function () {
  playButton.innerHTML = PLAY_SVG;
  playButton.setAttribute("aria-label", "Play");
  syncMiniPlayIcon();
});

// Keep the seek bar and time labels in sync with playback,
// and move the lyric highlight as the song plays.
audio.addEventListener("timeupdate", function () {
  currentTimeLabel.textContent = formatTime(audio.currentTime);
  if (audio.duration) {
    seekBar.value = (audio.currentTime / audio.duration) * 1000;
  }
  updateLyricHighlight();
});

// Once the track metadata loads we know the full duration.
audio.addEventListener("loadedmetadata", function () {
  durationLabel.textContent = formatTime(audio.duration);
});

// When a track finishes, move to the next one.
audio.addEventListener("ended", nextTrack);

// When a stream fails (for example a gated track), skip it quietly.
audio.addEventListener("error", function () {
  if (currentIndex !== -1 && audio.src) {
    skipWithNote();
  }
});

// Dragging the seek bar jumps to that point in the song.
seekBar.addEventListener("input", function () {
  if (audio.duration) {
    audio.currentTime = (seekBar.value / 1000) * audio.duration;
  }
});

// The volume slider sets the audio volume from 0 to 1.
volumeBar.addEventListener("input", function () {
  audio.volume = parseFloat(volumeBar.value);
});

// Shows one of the four main views and marks the right nav button active.
function showView(view) {
  browseView.hidden = view !== "browse";
  searchView.hidden = view !== "search";
  queueView.hidden = view !== "queue";
  playlistView.hidden = view !== "playlist";
  lyricsView.hidden = view !== "lyrics";

  navButtons.forEach(function (other) {
    other.classList.toggle("active", other.dataset.view === view);
  });
  const pbtns = playlistNav.querySelectorAll(".playlist-btn");
  pbtns.forEach(function (b) {
    b.classList.toggle("active",
      view === "playlist" && b.dataset.pid === openPlaylistId);
  });

  if (view === "search") {
    searchInput.focus();
  }
  if (view === "queue") {
    renderQueue();
  }
  if (view === "lyrics") {
    renderLyrics();
    updateLyricHighlight();
  }
}

// Sidebar tabs: Browse, Search, Up Next.
navButtons.forEach(function (button) {
  button.addEventListener("click", function () {
    showView(button.dataset.view);
  });
});

// New playlist: the + button reveals a name box, Enter creates it.
newPlaylistBtn.addEventListener("click", function () {
  playlistNew.hidden = false;
  playlistNameInput.value = "";
  playlistNameInput.focus();
});

playlistNameInput.addEventListener("keydown", function (event) {
  if (event.key === "Enter") {
    const name = playlistNameInput.value.trim();
    if (name) {
      const pl = { id: "p" + Date.now(), name: name, tracks: [] };
      playlists.push(pl);
      savePlaylists();
      renderPlaylistNav();
      playlistNew.hidden = true;
      showPlaylist(pl.id);
    }
  }
  if (event.key === "Escape") {
    playlistNew.hidden = true;
  }
});

// Delete playlist: first click arms it, second click confirms.
let deleteArmed = false;
let deleteTimer = null;
deletePlaylistBtn.addEventListener("click", function () {
  if (!deleteArmed) {
    deleteArmed = true;
    deletePlaylistBtn.textContent = "Click again to confirm";
    clearTimeout(deleteTimer);
    deleteTimer = setTimeout(function () {
      deleteArmed = false;
      deletePlaylistBtn.textContent = "Delete playlist";
    }, 3000);
    return;
  }
  playlists = playlists.filter(function (p) { return p.id !== openPlaylistId; });
  savePlaylists();
  renderPlaylistNav();
  openPlaylistId = null;
  deleteArmed = false;
  showView("browse");
});

// Keyboard shortcuts. One place for all of them, working both in the
// browser and inside the Electron Mac app. Typing in a text box is
// never hijacked: the search box and playlist name box keep their keys.
let unmutedVolume = 0.8; // remembers the volume so M can bring it back

function isTyping(target) {
  if (!target || !target.tagName) {
    return false;
  }
  const tag = target.tagName.toUpperCase();
  return tag === "INPUT" || tag === "TEXTAREA";
}

function nudgeVolume(step) {
  if (audio.muted) {
    audio.muted = false;
  }
  const next = Math.min(1, Math.max(0, audio.volume + step));
  audio.volume = next;
  volumeBar.value = next;
}

function toggleMute() {
  if (audio.muted || audio.volume === 0) {
    audio.muted = false;
    if (audio.volume === 0) {
      audio.volume = unmutedVolume;
    }
  } else {
    unmutedVolume = audio.volume;
    audio.muted = true;
  }
  volumeBar.value = audio.muted ? 0 : audio.volume;
}

document.addEventListener("keydown", function (event) {
  if (isTyping(event.target)) {
    return;
  }
  if (event.code === "Space" && event.target === document.body) {
    // Space on a focused button already clicks it, so only handle
    // it here when nothing clickable has focus.
    event.preventDefault();
    togglePlay();
  } else if (event.code === "ArrowRight") {
    event.preventDefault();
    nextTrack();
  } else if (event.code === "ArrowLeft") {
    event.preventDefault();
    prevTrack();
  } else if (event.code === "ArrowUp") {
    event.preventDefault();
    nudgeVolume(0.05);
  } else if (event.code === "ArrowDown") {
    event.preventDefault();
    nudgeVolume(-0.05);
  } else if (event.code === "KeyM") {
    toggleMute();
  }
});


// ---------- Mini player ----------

// True when we run inside the Electron Mac app and can ask it
// to shrink the window. In a plain browser we show a floating
// card instead.
function inElectron() {
  return !!(window.sonara && window.sonara.setMiniMode);
}

let miniOpen = false;

function openMiniPlayer() {
  if (inElectron()) {
    // The Mac app shrinks the window and then tells us through
    // onMiniMode, which paints the mini layout.
    window.sonara.setMiniMode(true);
    return;
  }
  miniOpen = true;
  document.body.classList.add("mini-open");
  miniPlayer.hidden = false;
  syncMiniTrack();
  syncMiniPlayIcon();
}

function closeMiniPlayer() {
  if (inElectron()) {
    window.sonara.setMiniMode(false);
    return;
  }
  miniOpen = false;
  document.body.classList.remove("mini-open");
  miniPlayer.hidden = true;
}

function toggleMiniPlayer() {
  if (miniOpen) {
    closeMiniPlayer();
  } else {
    openMiniPlayer();
  }
}

// Fill the mini player with the current track's artwork and names.
function syncMiniTrack() {
  const track = queue[currentIndex];
  if (!track) {
    return;
  }
  miniArt.innerHTML = "";
  miniArt.classList.remove("artwork-missing");
  const url = artworkUrl(track, "150x150");
  if (url) {
    const img = document.createElement("img");
    img.src = url;
    img.alt = "";
    img.onerror = function () {
      miniArt.classList.add("artwork-missing");
      miniArt.innerHTML = "";
      miniArt.appendChild(noteIcon());
    };
    miniArt.appendChild(img);
  } else {
    miniArt.classList.add("artwork-missing");
    miniArt.appendChild(noteIcon());
  }
  miniTitle.textContent = track.title;
  miniArtist.textContent = artistName(track);
}

// Keep the mini play button's icon in step with the real one.
function syncMiniPlayIcon() {
  if (audio.paused) {
    miniPlay.innerHTML = PLAY_SVG;
    miniPlay.setAttribute("aria-label", "Play");
  } else {
    miniPlay.innerHTML = PAUSE_SVG;
    miniPlay.setAttribute("aria-label", "Pause");
  }
}

miniPlayerBtn.addEventListener("click", toggleMiniPlayer);
miniPlay.addEventListener("click", togglePlay);
miniPrev.addEventListener("click", prevTrack);
miniNext.addEventListener("click", nextTrack);
miniClose.addEventListener("click", closeMiniPlayer);


// ---------- Sleep timer ----------

// Pauses the music after a chosen number of minutes, for
// falling asleep to. Runs on wall-clock time, so it keeps
// working even as tracks change.
let sleepMinutes = 0;    // the chosen length, 0 means off
let sleepTimeout = null; // fires once when the time is up
let sleepTick = null;     // refreshes the countdown label
let sleepEndsAt = 0;     // timestamp the timer ends at

function setSleepTimer(minutes) {
  cancelSleepTimer();
  sleepMinutes = minutes;
  if (minutes <= 0) {
    return;
  }
  sleepEndsAt = Date.now() + minutes * 60000;
  sleepTimeout = setTimeout(fireSleepTimer, minutes * 60000);
  sleepTick = setInterval(updateSleepButton, 30000);
  updateSleepButton();
}

function cancelSleepTimer() {
  clearTimeout(sleepTimeout);
  clearInterval(sleepTick);
  sleepTimeout = null;
  sleepTick = null;
  sleepMinutes = 0;
  sleepBtn.classList.remove("active");
  sleepBtn.title = "Sleep timer";
  sleepBtn.setAttribute("aria-label", "Sleep timer");
}

// Shows roughly how many minutes are left on the button itself.
function updateSleepButton() {
  const left = Math.max(1, Math.ceil((sleepEndsAt - Date.now()) / 60000));
  sleepBtn.classList.add("active");
  sleepBtn.title = "Sleep timer: about " + left + " min left (click to change)";
  sleepBtn.setAttribute("aria-label", "Sleep timer, " + left + " minutes left");
}

function fireSleepTimer() {
  const wasPlaying = !audio.paused;
  const length = sleepMinutes;
  cancelSleepTimer();
  audio.pause();
  if (wasPlaying) {
    showSkipNote("Sleep timer ended after " + length + " minutes.");
  }
}

function openSleepMenu() {
  sleepMenu.innerHTML = "";
  const options = [
    { label: "Off", minutes: 0 },
    { label: "15 minutes", minutes: 15 },
    { label: "30 minutes", minutes: 30 },
    { label: "45 minutes", minutes: 45 },
    { label: "60 minutes", minutes: 60 }
  ];
  options.forEach(function (opt) {
    const item = document.createElement("button");
    item.className = "add-menu-item";
    item.textContent = opt.label + (sleepMinutes === opt.minutes ? " (on)" : "");
    item.addEventListener("click", function (event) {
      event.stopPropagation();
      setSleepTimer(opt.minutes);
      closeSleepMenu();
    });
    sleepMenu.appendChild(item);
  });

  // The footer sits at the bottom of the screen, so the menu
  // opens upward from the button instead of downward.
  const r = sleepBtn.getBoundingClientRect();
  sleepMenu.style.bottom = (window.innerHeight - r.top + 6) + "px";
  sleepMenu.style.left = Math.max(8, Math.min(r.left,
    window.innerWidth - 200)) + "px";
  sleepMenu.hidden = false;
}

function closeSleepMenu() {
  sleepMenu.hidden = true;
}

sleepBtn.addEventListener("click", function (event) {
  event.stopPropagation();
  if (sleepMenu.hidden) {
    openSleepMenu();
  } else {
    closeSleepMenu();
  }
});

// Inside the Electron Mac app, the native menu's Playback items
// reach us through window.sonara. In a plain browser this does
// not exist, so nothing happens there.
if (window.sonara && window.sonara.onMediaKey) {
  window.sonara.onMediaKey(function (action) {
    if (action === "playpause") {
      togglePlay();
    } else if (action === "next") {
      nextTrack();
    } else if (action === "prev") {
      prevTrack();
    }
  });
}

// The Mac app tells us when the window has finished shrinking to
// (or growing back from) mini size, so we can swap the layout.
if (window.sonara && window.sonara.onMiniMode) {
  window.sonara.onMiniMode(function (on) {
    miniOpen = on;
    document.body.classList.toggle("mini-window", on);
    miniPlayer.hidden = !on;
    if (on) {
      syncMiniTrack();
      syncMiniPlayIcon();
    }
  });
}


// ---------- 14. Theme: dark or light ----------

// Dark is the default. The choice is saved in localStorage,
// so it survives closing and reopening the app.
const themeToggle = document.getElementById("themeToggle");

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("sonara-theme", theme);
  themeToggle.textContent = theme === "dark" ? "Light mode" : "Dark mode";
}

themeToggle.addEventListener("click", function () {
  const current = document.documentElement.getAttribute("data-theme") || "dark";
  applyTheme(current === "dark" ? "light" : "dark");
});

applyTheme(localStorage.getItem("sonara-theme") || "dark");


// ---------- 10. Start the app ----------

audio.volume = 0.8;
renderPlaylistNav();
loadTrending();
