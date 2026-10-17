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
// Second audio element, used only for crossfades: the new track starts
// here while the old one fades out on the main element.
const audioX = document.createElement("audio");
audioX.preload = "metadata";
let activeAudio = audio; // the element the UI (seek bar, timers) follows
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
const spotifyImportBtn = document.getElementById("spotifyImportBtn");
const textImportBtn = document.getElementById("textImportBtn");
const modalOverlay = document.getElementById("modalOverlay");
const modalTitle = document.getElementById("modalTitle");
const modalBody = document.getElementById("modalBody");
const modalClose = document.getElementById("modalClose");


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

  // v0.5: download arrow, bottom-right. Only when the artist allowed it.
  const dlBtn = downloadButton(track, "card-dl");
  if (dlBtn) {
    box.appendChild(dlBtn);
  }

  // v0.5: heart, top-left. Likes are always available.
  box.appendChild(likeButton(track, "card-like"));

  // v0.5: hide button, top-right. Hiding never deletes the song.
  const cardHide = hideButton(track, "card-hide");
  if (cardHide) {
    box.appendChild(cardHide);
  }

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
    // The + / download / heart / hide buttons handle their own keys;
    // without this guard, Enter on one of them would also start the song.
    // The play overlay has no own action, so it keeps the card's.
    if (event.target.closest &&
        event.target.closest(".card-add, .card-dl, .card-like, .card-hide")) {
      return;
    }
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
    // v0.5: hidden songs never appear in auto content, not even here.
    trendingTracks = visibleTracks(tracks);
    // Clicking a card starts playing from the trending list at that card.
    renderTracks(trendingGrid, trendingTracks, function (index) {
      startQueue(trendingTracks, index);
    });
    // v0.6: trending paints first; language shelves and new albums
    // fill in afterwards, each on its own time.
    loadLanguageShelves();
    discoverAlbums();
    if (browseMode === "flow") {
      renderCoverflow();
    }
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
  // v0.5: a saved offline copy wins over streaming, exactly like
  // Spotify playing downloads first. Local files (v0.4) still first.
  const local = localSrc(track);
  // v0.5: offline with nothing saved means nothing to play.
  if (!navigator.onLine && !track._objectUrl && !local) {
    showSkipNote("You are offline. Play a downloaded song instead.");
    return;
  }
  playingOffline = !!local && !track._objectUrl;
  const src = track._objectUrl || local || streamUrl(track.id);
  if (xfadeSecs > 0 && !activeAudio.paused && activeAudio.src) {
    startCrossfade(src);
  } else {
    activeAudio = audio;
    audio.src = src;
    audio.play().catch(function () {
      if (local) {
        // The saved file is gone (removed outside the app). Drop the
        // stale entry and try the stream once instead of skipping.
        removeDownload(track.id, { silent: true });
        showSkipNote("Saved file missing. Streaming instead.");
        playCurrent();
        return;
      }
      // The browser refused to play. Often a stream-gated track.
      skipWithNote();
    });
  }
  updatePlayerUI(track);
  pushRecent(track);
  // v0.5: count one play and open a listening-time session.
  statsPlayStart(track);
  // v0.5: the DJ voice announces the track when enabled.
  djAnnounce(track);
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
  if (activeAudio.paused) {
    activeAudio.play();
  } else {
    activeAudio.pause();
  }
}

function nextTrack() {
  if (currentIndex + 1 < queue.length) {
    currentIndex = currentIndex + 1;
    playCurrent();
  } else {
    // v0.5: nowhere to go; close the listening-time books.
    statsPlayStop();
  }
}

function prevTrack() {
  // If we are a few seconds into the song, restart it instead of going back.
  if (activeAudio.currentTime > 3 && currentIndex !== -1) {
    activeAudio.currentTime = 0;
    return;
  }
  if (currentIndex > 0) {
    currentIndex = currentIndex - 1;
    playCurrent();
  }
}

// Skip a broken track and show a tiny note saying so.
function skipWithNote() {
  if (activeAudio.src === lastSkipSrc) {
    return; // already skipped for this track, do not skip twice
  }
  lastSkipSrc = activeAudio.src;
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

  scrambleText(playerTitle, track.title);
  playerArtist.textContent = artistName(track);
  document.title = track.title + " - " + artistName(track) + " | Sonara";

  // v0.5: show the "Offline copy" badge when the saved file is playing.
  offlineBadge.hidden = !playingOffline;

  // v0.5: light up the heart when the current song is liked.
  syncPlayerLike();

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
// v0.5: the root is a div (not a button) so a download button can
// sit inside it; keyboard support is added by hand to match.
function queueRow(track, index) {
  const row = document.createElement("div");
  row.className = "queue-row";
  row.tabIndex = 0;
  row.setAttribute("role", "button");
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

  // v0.5: smart-shuffle picks get a quiet "Suggested" tag.
  if (track._suggested) {
    const tag = document.createElement("span");
    tag.className = "suggested-tag";
    tag.textContent = "Suggested";
    text.appendChild(tag);
  }

  row.appendChild(text);

  // v0.5: download arrow at the row's end, when the artist allowed it.
  const dlBtn = downloadButton(track, "dl-btn");
  if (dlBtn) {
    row.appendChild(dlBtn);
  }

  // v0.5: heart next to the download arrow.
  row.appendChild(likeButton(track, "like-btn"));

  // v0.5: drag to reorder with mouse or touch. The row being dragged
  // goes quiet; a thin ember line shows exactly where it will land.
  // Touch screens keep native scrolling: dragging is mouse-only.
  const finePointer = window.matchMedia &&
    window.matchMedia("(pointer: fine)").matches;
  if (finePointer) {
    row.draggable = true;
  }
  row.addEventListener("dragstart", function (event) {
    if (!finePointer) {
      return;
    }
    dragIndex = index;
    event.dataTransfer.effectAllowed = "move";
    try {
      event.dataTransfer.setData("text/plain", String(index));
    } catch (e) {
      // Some browsers do not need the payload; the index is enough.
    }
    row.classList.add("dragging");
  });
  row.addEventListener("dragend", function () {
    row.classList.remove("dragging");
    clearDropMarks();
    dragIndex = -1;
  });
  row.addEventListener("dragover", function (event) {
    if (dragIndex === -1 || dragIndex === index) {
      return;
    }
    event.preventDefault(); // required, or drop never fires
    event.dataTransfer.dropEffect = "move";
    clearDropMarks();
    const rect = row.getBoundingClientRect();
    const before = (event.clientY - rect.top) < rect.height / 2;
    row.classList.add(before ? "drop-before" : "drop-after");
    row.dataset.dropBefore = before ? "1" : "";
  });
  row.addEventListener("drop", function (event) {
    event.preventDefault();
    const from = dragIndex;
    const before = row.dataset.dropBefore === "1";
    clearDropMarks();
    moveQueueItem(from, index, before);
  });

  // v0.5: arrow buttons, the keyboard alternative to dragging.
  // They only appear on hover or focus, so calm rows stay calm.
  row.appendChild(moveButton(track, index, -1));
  row.appendChild(moveButton(track, index, 1));

  // Clicking a row jumps straight to that song.
  function jump() {
    currentIndex = index;
    playCurrent();
  }
  row.addEventListener("click", jump);
  row.addEventListener("keydown", function (event) {
    // Inner buttons (heart, download, movers) handle their own keys;
    // without this, Enter on one of them would also jump the song.
    if (event.target !== row) {
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      jump();
    }
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
  // v0.5: keep the artist's download choice with the summary, so the
  // download button can appear on playlist rows too. Old saved songs
  // lack these fields and simply get no button.
  const dl = track.download && track.download.url
    ? { url: track.download.url }
    : null;
  return {
    id: track.id,
    title: track.title,
    artist: artistName(track),
    artwork: art,
    is_downloadable: track.is_downloadable === true,
    download: dl,
    // v0.5: genre, mood and tempo travel with the summary so mixes,
    // Daylist and charts can use them without another API call.
    // Old saved songs simply lack these fields.
    genre: track.genre || null,
    mood: track.mood || null,
    bpm: track.bpm || null
  };
}

// The playlist buttons in the sidebar, with a song count on each.
function renderPlaylistNav() {
  playlistNav.innerHTML = "";
  // v0.5: Liked Songs and Weekly Mix pin above the user's playlists.
  renderSpecialPlaylists();
  // v0.5: folders group playlists; filed playlists render inside them.
  renderFolderNav();
  playlists.forEach(function (pl) {
    if (isPlaylistFiled(pl.id)) {
      return; // lives inside a folder, rendered there instead
    }
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
// onRemove overrides the default "take out of this playlist" when given
// (used by the Liked Songs and Weekly Mix virtual playlists).
function playlistRow(pl, song, index, onRemove) {
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
    if (onRemove) {
      onRemove(index);
      return;
    }
    pl.tracks.splice(index, 1);
    savePlaylists();
    renderPlaylistNav();
    renderPlaylistSongs();
  });
  row.appendChild(rm);

  // v0.5: heart next to the remove button.
  row.appendChild(likeButton(song, "like-btn"));

  // v0.5: hide button next to the heart. Hiding never deletes.
  const hideBtn = hideButton(song);
  if (hideBtn) {
    row.appendChild(hideBtn);
  }

  // v0.5: a quiet tag where a hidden song still shows (playlists), so
  // nothing vanishes without an explanation.
  if (isHiddenId(song.id)) {
    const tag = document.createElement("span");
    tag.className = "hidden-tag";
    tag.textContent = "Hidden";
    row.appendChild(tag);
  }

  // v0.5: download arrow next to the remove button, when allowed.
  const dlBtn = downloadButton(song, "dl-btn");
  if (dlBtn) {
    row.appendChild(dlBtn);
  }

  // Clicking the row plays the playlist from this song.
  row.addEventListener("click", function () {
    startQueue(pl.tracks, index);
  });

  return row;
}

function renderPlaylistSongs() {
  // v0.5: Liked Songs and Weekly Mix are virtual playlists.
  if (openPlaylistId === "liked" || openPlaylistId === "mix") {
    renderSpecialPlaylistSongs();
    return;
  }
  // v0.5: Daylist and Discover Mix are virtual playlists too.
  if (isVirtualMixId(openPlaylistId)) {
    renderDayOrDiscover();
    return;
  }
  deletePlaylistBtn.hidden = false;
  refreshMixBtn.hidden = true;
  // v0.5: only real playlists can move into folders.
  folderMoveBtn.hidden = false;
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

  // v0.5: "Download all" shows only when at least one song in the
  // playlist can actually be downloaded and is not saved yet.
  const pending = pl.tracks.filter(function (song) {
    return canDownload(song) && !isDownloaded(song.id) &&
      dlProgress[song.id] === undefined;
  });
  downloadAllBtn.hidden = pending.length === 0;
  downloadAllBtn.onclick = function () {
    pending.forEach(function (song) {
      startDownload(song);
    });
    showSkipNote("Downloading " + pending.length +
      (pending.length === 1 ? " song." : " songs."));
    renderPlaylistSongs();
  };
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
  closeSoundMenu();
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
  const t = activeAudio.currentTime;
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
// Wired to both audio elements; only the active one drives the UI.
function wireAudio(el) {
  el.addEventListener("play", function () {
    if (el !== activeAudio) return;
    playButton.innerHTML = PAUSE_SVG;
    playButton.setAttribute("aria-label", "Pause");
    syncMiniPlayIcon();
  });
  el.addEventListener("pause", function () {
    if (el !== activeAudio) return;
    playButton.innerHTML = PLAY_SVG;
    playButton.setAttribute("aria-label", "Play");
    syncMiniPlayIcon();
  });

  // Keep the seek bar and time labels in sync with playback,
  // and move the lyric highlight as the song plays.
  el.addEventListener("timeupdate", function () {
    if (el !== activeAudio) return;
    currentTimeLabel.textContent = formatTime(el.currentTime);
    if (el.duration) {
      seekBar.value = (el.currentTime / el.duration) * 1000;
    }
    updateLyricHighlight();
  });

  // Once the track metadata loads we know the full duration.
  el.addEventListener("loadedmetadata", function () {
    if (el !== activeAudio) return;
    durationLabel.textContent = formatTime(el.duration);
  });

  // When a track finishes, move to the next one.
  // v0.5: at the end of the queue, radio mode keeps the music going.
  el.addEventListener("ended", function () {
    if (el !== activeAudio) return;
    advanceTrack();
  });

  // When a stream fails (for example a gated track), skip it quietly.
  el.addEventListener("error", function () {
    if (el !== activeAudio) return;
    if (currentIndex !== -1 && el.src) {
      skipWithNote();
    }
  });
}
wireAudio(audio);
wireAudio(audioX);

// Dragging the seek bar jumps to that point in the song.
seekBar.addEventListener("input", function () {
  if (activeAudio.duration) {
    activeAudio.currentTime = (seekBar.value / 1000) * activeAudio.duration;
  }
});

// The volume slider sets the audio volume from 0 to 1.
volumeBar.addEventListener("input", function () {
  setUserVolume(parseFloat(volumeBar.value));
});

// Shows one of the five main views and marks the right nav button active.
function showView(view) {
  browseView.hidden = view !== "browse";
  searchView.hidden = view !== "search";
  queueView.hidden = view !== "queue";
  playlistView.hidden = view !== "playlist";
  lyricsView.hidden = view !== "lyrics";
  recentView.hidden = view !== "recent";
  downloadedView.hidden = view !== "downloaded";
  libraryView.hidden = view !== "library";
  statsView.hidden = view !== "stats";
  chartsView.hidden = view !== "charts";
  albumView.hidden = view !== "album";

  navButtons.forEach(function (other) {
    other.classList.toggle("active", other.dataset.view === view);
  });
  // v0.5: folder items live in #folderNav, so both lists count.
  const pbtns = document.querySelectorAll("#playlistNav .playlist-btn, #folderNav .playlist-btn");
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
  if (view === "recent") {
    renderRecent();
  }
  if (view === "downloaded") {
    renderDownloaded();
    // v0.5: the Offline Mixtape rebuilds itself when a day old.
    checkMixtapeFresh();
  }
  if (view === "library") {
    renderLibrary();
  }
  if (view === "stats") {
    renderStats();
    // v0.5: the yearly Recap grows out of the same stats.
    renderRecap();
  }
  if (view === "charts") {
    renderCharts();
  }

  // v0.5: replay the staggered headline reveal for the new view.
  var section = document.getElementById(view + "View");
  if (section) {
    revealHeadline(section.querySelector("h1"));
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
  // v0.5: a deleted playlist also leaves any folder that held it.
  const goneId = openPlaylistId;
  const folders = loadFolders();
  let changed = false;
  folders.forEach(function (f) {
    const before = f.playlistIds.length;
    f.playlistIds = f.playlistIds.filter(function (x) { return x !== goneId; });
    if (f.playlistIds.length !== before) {
      changed = true;
    }
  });
  if (changed) {
    saveFolders(folders);
  }
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
  if (activeAudio.muted) {
    activeAudio.muted = false;
    audioX.muted = false;
  }
  setUserVolume(userVolume + step);
}

function toggleMute() {
  if (activeAudio.muted || userVolume === 0) {
    activeAudio.muted = false;
    audioX.muted = false;
    if (userVolume === 0) {
      setUserVolume(unmutedVolume);
    } else {
      volumeBar.value = userVolume;
    }
  } else {
    unmutedVolume = userVolume;
    activeAudio.muted = true;
    audioX.muted = true;
    volumeBar.value = 0;
  }
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
  if (activeAudio.paused) {
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
  const wasPlaying = !activeAudio.paused;
  const length = sleepMinutes;
  cancelSleepTimer();
  activeAudio.pause();
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


// ---------- Spotify import ----------

// Copies your Spotify playlists into Sonara. Spotify only talks
// to registered apps, so the one-time setup asks for a Client ID
// from developer.spotify.com (free). Login uses PKCE, the login
// flow made for apps like this: no secret ever lives in Sonara.
// Each Spotify song is then matched to a playable Audius track.

const SPOTIFY_AUTH_URL = "https://accounts.spotify.com/authorize";
const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";
const SPOTIFY_API = "https://api.spotify.com/v1";
const SPOTIFY_REDIRECT = "http://127.0.0.1:8888/callback";
const SPOTIFY_SCOPES = "playlist-read-private playlist-read-collaborative";

const LS_SPOTIFY_ID = "sonara-spotify-client-id";
const LS_SPOTIFY_TOKEN = "sonara-spotify-token";
const LS_SPOTIFY_REFRESH = "sonara-spotify-refresh";
const LS_SPOTIFY_EXPIRY = "sonara-spotify-expiry";

function openModal(title) {
  modalTitle.textContent = title;
  modalBody.innerHTML = "";
  modalOverlay.hidden = false;
}

function closeModal() {
  modalOverlay.hidden = true;
}

modalClose.addEventListener("click", closeModal);
modalOverlay.addEventListener("click", function (event) {
  if (event.target === modalOverlay) {
    closeModal();
  }
});

// PKCE helpers: a random secret and its SHA-256 fingerprint.
// The fingerprint goes to Spotify; the secret never leaves Sonara.
function randomString(length) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += chars[bytes[i] % chars.length];
  }
  return out;
}

async function pkceChallenge(verifier) {
  const data = new TextEncoder().encode(verifier);
  const hash = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(hash);
  let bin = "";
  bytes.forEach(function (b) { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function spotifyToken() {
  const token = localStorage.getItem(LS_SPOTIFY_TOKEN);
  const expiry = parseInt(localStorage.getItem(LS_SPOTIFY_EXPIRY) || "0", 10);
  if (!token || Date.now() > expiry) {
    return null;
  }
  return token;
}

function saveSpotifyTokens(json) {
  localStorage.setItem(LS_SPOTIFY_TOKEN, json.access_token);
  localStorage.setItem(LS_SPOTIFY_EXPIRY,
    String(Date.now() + (json.expires_in - 60) * 1000));
  if (json.refresh_token) {
    localStorage.setItem(LS_SPOTIFY_REFRESH, json.refresh_token);
  }
}

async function refreshSpotifyToken() {
  const refresh = localStorage.getItem(LS_SPOTIFY_REFRESH);
  const clientId = localStorage.getItem(LS_SPOTIFY_ID);
  if (!refresh || !clientId) {
    throw new Error("Spotify is not connected.");
  }
  const res = await fetch(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=refresh_token&refresh_token=" + encodeURIComponent(refresh) +
          "&client_id=" + encodeURIComponent(clientId)
  });
  if (!res.ok) {
    throw new Error("Spotify login expired. Connect again.");
  }
  const json = await res.json();
  saveSpotifyTokens(json);
  return json.access_token;
}

// One Spotify request, refreshing the login once if it expired.
async function spotifyFetch(path) {
  let token = spotifyToken();
  if (!token) {
    token = await refreshSpotifyToken();
  }
  let res = await fetch(SPOTIFY_API + path, {
    headers: { Authorization: "Bearer " + token }
  });
  if (res.status === 401) {
    token = await refreshSpotifyToken();
    res = await fetch(SPOTIFY_API + path, {
      headers: { Authorization: "Bearer " + token }
    });
  }
  if (!res.ok) {
    throw new Error("Spotify said no (" + res.status + ").");
  }
  return res.json();
}

// Step 1 of login: open Spotify in the browser. The Mac app runs
// a tiny local server that catches the login code Spotify sends
// back, and hands it to the page below.
async function connectSpotify() {
  const clientId = localStorage.getItem(LS_SPOTIFY_ID) || "";
  const verifier = randomString(64);
  const challenge = await pkceChallenge(verifier);
  sessionStorage.setItem("sonara-spotify-verifier", verifier);
  const url = SPOTIFY_AUTH_URL +
    "?response_type=code&client_id=" + encodeURIComponent(clientId) +
    "&scope=" + encodeURIComponent(SPOTIFY_SCOPES) +
    "&redirect_uri=" + encodeURIComponent(SPOTIFY_REDIRECT) +
    "&code_challenge_method=S256&code_challenge=" + encodeURIComponent(challenge);
  window.sonara.spotifyLogin(url);
}

// Step 2 of login: trade the code for tokens.
async function finishSpotifyLogin(code) {
  try {
    const verifier = sessionStorage.getItem("sonara-spotify-verifier") || "";
    const clientId = localStorage.getItem(LS_SPOTIFY_ID) || "";
    const res = await fetch(SPOTIFY_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=authorization_code&code=" + encodeURIComponent(code) +
            "&redirect_uri=" + encodeURIComponent(SPOTIFY_REDIRECT) +
            "&client_id=" + encodeURIComponent(clientId) +
            "&code_verifier=" + encodeURIComponent(verifier)
    });
    if (!res.ok) {
      throw new Error("Spotify would not give a token.");
    }
    saveSpotifyTokens(await res.json());
    showSpotifyPlaylists();
  } catch (err) {
    openModal("Spotify");
    const p = document.createElement("p");
    p.textContent = "Login failed: " + err.message;
    modalBody.appendChild(p);
  }
}

if (window.sonara && window.sonara.onSpotifyCode) {
  window.sonara.onSpotifyCode(function (code) {
    if (code) {
      finishSpotifyLogin(code);
    } else {
      showSkipNote("Spotify login was cancelled.");
    }
  });
}

// First-run setup: where the Client ID comes from.
function showSpotifySetup() {
  openModal("Connect Spotify");
  const intro = document.createElement("p");
  intro.textContent = "Spotify only talks to registered apps. This is free and takes two minutes:";
  const steps = document.createElement("ol");
  [
    "Open developer.spotify.com/dashboard and log in.",
    "Create an app (any name and description will do).",
    "In the app's Settings, add this Redirect URI:",
    "Copy the Client ID from the dashboard and paste it below."
  ].forEach(function (s) {
    const li = document.createElement("li");
    li.textContent = s;
    steps.appendChild(li);
  });
  const uri = document.createElement("p");
  const code = document.createElement("code");
  code.textContent = SPOTIFY_REDIRECT;
  uri.appendChild(code);
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Spotify Client ID";
  input.setAttribute("aria-label", "Spotify Client ID");
  const save = document.createElement("button");
  save.className = "primary-btn";
  save.textContent = "Save and connect";
  save.addEventListener("click", function () {
    const id = input.value.trim();
    if (!id) {
      return;
    }
    localStorage.setItem(LS_SPOTIFY_ID, id);
    openModal("Connect Spotify");
    const p = document.createElement("p");
    p.textContent = "Your browser opened Spotify. Approve Sonara, then come back here.";
    modalBody.appendChild(p);
    connectSpotify();
  });
  modalBody.appendChild(intro);
  modalBody.appendChild(steps);
  modalBody.appendChild(uri);
  modalBody.appendChild(input);
  modalBody.appendChild(save);
}

async function showSpotifyPlaylists() {
  openModal("Your Spotify playlists");
  const loading = document.createElement("p");
  loading.textContent = "Loading...";
  modalBody.appendChild(loading);
  try {
    const json = await spotifyFetch("/me/playlists?limit=50");
    modalBody.innerHTML = "";
    if (!json.items || json.items.length === 0) {
      const p = document.createElement("p");
      p.textContent = "No playlists found on your Spotify account.";
      modalBody.appendChild(p);
      return;
    }
    json.items.forEach(function (pl) {
      const row = document.createElement("button");
      row.className = "spotify-pl-row";
      const name = document.createElement("span");
      name.textContent = pl.name;
      const count = document.createElement("span");
      count.className = "spotify-pl-count";
      count.textContent = pl.tracks.total + " songs";
      row.appendChild(name);
      row.appendChild(count);
      row.addEventListener("click", function () {
        importSpotifyPlaylist(pl.id, pl.name);
      });
      modalBody.appendChild(row);
    });
    const disc = document.createElement("button");
    disc.className = "text-btn";
    disc.textContent = "Disconnect Spotify";
    disc.addEventListener("click", function () {
      [LS_SPOTIFY_ID, LS_SPOTIFY_TOKEN, LS_SPOTIFY_REFRESH, LS_SPOTIFY_EXPIRY]
        .forEach(function (k) { localStorage.removeItem(k); });
      sessionStorage.removeItem("sonara-spotify-verifier");
      closeModal();
      showSkipNote("Spotify disconnected.");
    });
    modalBody.appendChild(disc);
  } catch (err) {
    modalBody.innerHTML = "";
    const p = document.createElement("p");
    p.textContent = "Could not load playlists: " + err.message;
    modalBody.appendChild(p);
  }
}

// How alike two song names are, ignoring case and punctuation.
function normalizeName(s) {
  return (s || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ").trim();
}

// Scores an Audius result against the Spotify song we want.
// Exact title is worth the most; the artist breaks ties.
function matchScore(want, got) {
  const wt = normalizeName(want.title);
  const wa = normalizeName(want.artist);
  const gt = normalizeName(got.title);
  const ga = normalizeName(got.user && got.user.name);
  let score = 0;
  if (gt === wt) {
    score += 3;
  } else if (gt.indexOf(wt) !== -1 || wt.indexOf(gt) !== -1) {
    score += 2;
  }
  if (wa && ga === wa) {
    score += 2;
  } else if (wa && ga && (ga.indexOf(wa) !== -1 || wa.indexOf(ga) !== -1)) {
    score += 1;
  }
  return score;
}

// Finds the Spotify song on Audius, where Sonara can play it.
// Returns null when nothing close enough exists.
async function findOnAudius(title, artist) {
  const url = API_BASE + "/tracks/search?query=" +
    encodeURIComponent(title + " " + artist) + "&app_name=" + APP_NAME;
  const res = await fetch(url);
  if (!res.ok) {
    return null;
  }
  const json = await res.json();
  const results = json.data || [];
  let best = null;
  let bestScore = 0;
  results.slice(0, 5).forEach(function (t) {
    const s = matchScore({ title: title, artist: artist }, t);
    if (s > bestScore) {
      bestScore = s;
      best = t;
    }
  });
  return bestScore >= 3 ? best : null;
}

async function importSpotifyPlaylist(playlistId, playlistName) {
  openModal("Importing " + playlistName);
  const status = document.createElement("p");
  status.textContent = "Reading the playlist...";
  modalBody.appendChild(status);

  try {
    // Spotify sends 100 songs at a time; follow the pages.
    const wanted = [];
    let path = "/playlists/" + playlistId +
      "/tracks?limit=100&fields=items(track(name,artists(name))),next";
    while (path) {
      const json = await spotifyFetch(path);
      (json.items || []).forEach(function (item) {
        const t = item.track;
        if (t && t.name) {
          wanted.push({
            title: t.name,
            artist: (t.artists && t.artists[0] && t.artists[0].name) || ""
          });
        }
      });
      path = json.next ? json.next.replace("https://api.spotify.com/v1", "") : null;
    }

    const summaries = await matchTracks(wanted, status);

    const pl = { id: "p" + Date.now(), name: "Spotify: " + playlistName, tracks: summaries };
    playlists.push(pl);
    savePlaylists();
    renderPlaylistNav();
    closeModal();
    showPlaylist(pl.id);
    showSkipNote("Imported " + summaries.length + " of " + wanted.length + " songs.");
  } catch (err) {
    modalBody.innerHTML = "";
    const p = document.createElement("p");
    p.textContent = "Import failed: " + err.message;
    modalBody.appendChild(p);
  }
}

// Matches a list of {title, artist} against Audius, one at a time,
// showing progress in the status line. Shared by both importers.
async function matchTracks(wanted, status) {
  const summaries = [];
  for (let i = 0; i < wanted.length; i++) {
    status.textContent = "Matching " + (i + 1) + " of " + wanted.length + "...";
    const hit = await findOnAudius(wanted[i].title, wanted[i].artist);
    if (hit) {
      const summary = trackSummary(hit);
      const dup = summaries.some(function (s) { return s.id === summary.id; });
      if (!dup) {
        summaries.push(summary);
      }
    }
    // One search at a time, with a small pause to be polite.
    await new Promise(function (r) { setTimeout(r, 150); });
  }
  return summaries;
}

// Turns pasted text into {title, artist} pairs. Each line is one
// song: "Artist - Title", or just "Title". Leading numbers like
// "1." or "01 -" are stripped.
function parseTrackList(text) {
  const wanted = [];
  text.split("\n").forEach(function (raw) {
    const line = raw.trim().replace(/^[\d.\s\-\)\]]+/, "").trim();
    if (!line) {
      return;
    }
    let artist = "";
    let title = line;
    const dash = line.indexOf(" - ");
    if (dash !== -1) {
      artist = line.slice(0, dash).trim();
      title = line.slice(dash + 3).trim();
    }
    if (title) {
      wanted.push({ title: title, artist: artist });
    }
  });
  return wanted;
}

// Opens the track-list importer: a name box and a big text box.
function showTextImport() {
  openModal("Import track list");

  const hint = document.createElement("p");
  hint.textContent = "Paste one song per line, like \"Faouzia - Unethical\". " +
    "Tip: exportify.net turns a Spotify playlist into a copyable list.";
  modalBody.appendChild(hint);

  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.placeholder = "Playlist name";
  nameInput.maxLength = 40;
  modalBody.appendChild(nameInput);

  const area = document.createElement("textarea");
  area.placeholder = "Faouzia - Unethical\nNeongen - Way Too Long";
  area.setAttribute("aria-label", "Track list");
  modalBody.appendChild(area);

  const btn = document.createElement("button");
  btn.className = "primary-btn";
  btn.textContent = "Import";
  modalBody.appendChild(btn);

  btn.addEventListener("click", function () {
    const wanted = parseTrackList(area.value);
    if (wanted.length === 0) {
      area.focus();
      return;
    }
    importTrackList(nameInput.value.trim() || "Imported list", wanted);
  });
}

async function importTrackList(playlistName, wanted) {
  openModal("Importing " + playlistName);
  const status = document.createElement("p");
  status.textContent = "Matching songs...";
  modalBody.appendChild(status);

  try {
    const summaries = await matchTracks(wanted, status);
    const pl = { id: "p" + Date.now(), name: playlistName, tracks: summaries };
    playlists.push(pl);
    savePlaylists();
    renderPlaylistNav();
    closeModal();
    showPlaylist(pl.id);
    showSkipNote("Imported " + summaries.length + " of " + wanted.length + " songs.");
  } catch (err) {
    modalBody.innerHTML = "";
    const p = document.createElement("p");
    p.textContent = "Import failed: " + err.message;
    modalBody.appendChild(p);
  }
}

spotifyImportBtn.addEventListener("click", function () {
  if (!window.sonara || !window.sonara.spotifyLogin) {
    openModal("Import from Spotify");
    const p = document.createElement("p");
    p.textContent = "Spotify import needs the Sonara Mac app, because the login " +
      "happens through a tiny server on your own computer. Open Sonara " +
      "on your Mac and tap this button there.";
    modalBody.appendChild(p);
    return;
  }
  if (!localStorage.getItem(LS_SPOTIFY_ID)) {
    showSpotifySetup();
    return;
  }
  if (spotifyToken()) {
    showSpotifyPlaylists();
  } else {
    openModal("Connect Spotify");
    const p = document.createElement("p");
    p.textContent = "Your browser opened Spotify. Approve Sonara, then come back here.";
    modalBody.appendChild(p);
    connectSpotify();
  }
});

// Track-list import: no login needed, works everywhere including
// the plain browser version.
textImportBtn.addEventListener("click", showTextImport);

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


// ---------- 14. Themes ----------

// Five themes. The choice is saved in localStorage,
// so it survives closing and reopening the app.
const THEMES = [
  { id: "dark", name: "Dark" },
  { id: "light", name: "Light" },
  { id: "midnight", name: "Midnight" },
  { id: "forest", name: "Forest" },
  { id: "sunset", name: "Sunset" },
];
const themeToggle = document.getElementById("themeToggle");
const themeMenu = document.getElementById("themeMenu");

function applyTheme(theme) {
  if (!THEMES.some(function (t) { return t.id === theme; })) {
    theme = "dark";
  }
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("sonara-theme", theme);
  const found = THEMES.find(function (t) { return t.id === theme; });
  themeToggle.textContent = found.name;
}

function openThemeMenu() {
  themeMenu.innerHTML = "";
  const current = document.documentElement.getAttribute("data-theme") || "dark";
  THEMES.forEach(function (t) {
    const b = document.createElement("button");
    b.className = "add-menu-item";
    b.textContent = (t.id === current ? "✓ " : "") + t.name;
    b.addEventListener("click", function () {
      applyTheme(t.id);
      closeThemeMenu();
    });
    themeMenu.appendChild(b);
  });
  // Pop up just above the sidebar button.
  const r = themeToggle.getBoundingClientRect();
  themeMenu.style.left = r.left + "px";
  themeMenu.style.top = "auto";
  themeMenu.style.bottom = (window.innerHeight - r.top + 8) + "px";
  themeMenu.hidden = false;
}

function closeThemeMenu() {
  themeMenu.hidden = true;
}

themeToggle.addEventListener("click", function (event) {
  event.stopPropagation();
  if (themeMenu.hidden) {
    openThemeMenu();
  } else {
    closeThemeMenu();
  }
});

document.addEventListener("click", function (event) {
  if (!themeMenu.hidden && !themeMenu.contains(event.target)) {
    closeThemeMenu();
  }
});

applyTheme(localStorage.getItem("sonara-theme") || "dark");


// ---------- 15. Crossfade: Spotify-style smooth track transitions ----------

// Two audio elements take turns: the new track fades in on the idle
// one while the old track fades out. No Web Audio needed, so this
// works on every stream.
let xfadeSecs = parseInt(localStorage.getItem("sonara-xfade") || "0", 10) || 0;
let xfadeTimer = null;
let userVolume = 0.8;
audioX.volume = userVolume;

function setUserVolume(v) {
  userVolume = Math.min(1, Math.max(0, v));
  if (xfadeTimer) {
    clearInterval(xfadeTimer);
    xfadeTimer = null;
  }
  audio.volume = userVolume;
  audioX.volume = userVolume;
  volumeBar.value = userVolume;
}

function startCrossfade(src) {
  const oldEl = activeAudio;
  const newEl = (oldEl === audio) ? audioX : audio;
  activeAudio = newEl;
  clearInterval(xfadeTimer);
  xfadeTimer = null;
  newEl.src = src;
  newEl.volume = 0;
  newEl.play().then(function () {
    const steps = 24;
    const interval = (xfadeSecs * 1000) / steps;
    let n = 0;
    xfadeTimer = setInterval(function () {
      n++;
      const t = Math.min(1, n / steps);
      // Square-root curve sounds smoother than a straight line.
      newEl.volume = userVolume * Math.sqrt(t);
      oldEl.volume = userVolume * Math.sqrt(1 - t);
      if (t >= 1) {
        clearInterval(xfadeTimer);
        xfadeTimer = null;
        oldEl.pause();
        oldEl.volume = userVolume;
        newEl.volume = userVolume;
      }
    }, interval);
  }).catch(function () {
    // The new track refused to play: stay on the old one.
    activeAudio = oldEl;
    oldEl.volume = userVolume;
    newEl.pause();
    skipWithNote();
  });
}


// ---------- 16. Scramble-text track titles ----------

// OriginKit-style "Scramble Text": the title flickers through random
// characters before settling. Pure vanilla JS, no library.
const SCRAMBLE_CHARS = "!<>-_\\/[]{}=+*^?#";
let scrambleFrame = null;

function scrambleText(el, text) {
  if (!text) {
    el.textContent = "";
    return;
  }
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    el.textContent = text;
    return;
  }
  if (scrambleFrame) {
    cancelAnimationFrame(scrambleFrame);
  }
  const start = performance.now();
  const duration = 500;
  function frame(now) {
    const t = Math.min(1, (now - start) / duration);
    const reveal = Math.floor(t * text.length);
    let out = "";
    for (let i = 0; i < text.length; i++) {
      if (i < reveal || text[i] === " ") {
        out += text[i];
      } else {
        out += SCRAMBLE_CHARS[(Math.random() * SCRAMBLE_CHARS.length) | 0];
      }
    }
    el.textContent = out;
    if (t < 1) {
      scrambleFrame = requestAnimationFrame(frame);
    } else {
      el.textContent = text;
      scrambleFrame = null;
    }
  }
  scrambleFrame = requestAnimationFrame(frame);
}


// ---------- 17. Ember particle background ----------

// Subtle embers drift upward behind the app, tinted with the current
// theme's accent color. Canvas 2D, ~45 particles, zero dependencies.
(function initEmbers() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }
  const canvas = document.getElementById("emberCanvas");
  if (!canvas || !canvas.getContext) {
    return;
  }
  const ctx = canvas.getContext("2d");
  let w = 0;
  let h = 0;
  function resize() {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
  }
  window.addEventListener("resize", resize);
  resize();

  function accentRGB() {
    const v = getComputedStyle(document.documentElement)
      .getPropertyValue("--accent").trim();
    const m = v.match(/#([0-9a-f]{6})/i);
    if (m) {
      const n = parseInt(m[1], 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    return [255, 107, 53];
  }

  function spawn(fromTop) {
    return {
      x: Math.random() * w,
      y: fromTop ? Math.random() * h : h + 10,
      r: 0.8 + Math.random() * 2.2,
      s: 0.15 + Math.random() * 0.45,
      drift: (Math.random() - 0.5) * 0.3,
      a: 0.06 + Math.random() * 0.18,
      tw: Math.random() * Math.PI * 2
    };
  }

  const parts = [];
  for (let i = 0; i < 45; i++) {
    parts.push(spawn(true));
  }

  function tick() {
    ctx.clearRect(0, 0, w, h);
    const c = accentRGB();
    for (const p of parts) {
      p.y -= p.s;
      p.tw += 0.01;
      p.x += p.drift + Math.sin(p.tw) * 0.2;
      if (p.y < -12) {
        Object.assign(p, spawn(false));
      }
      const alpha = p.a * (0.7 + 0.3 * Math.sin(p.tw * 2));
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(" + c[0] + "," + c[1] + "," + c[2] +
        "," + alpha.toFixed(3) + ")";
      ctx.fill();
    }
    requestAnimationFrame(tick);
  }
  tick();
})();


// ---------- 18. Recently played ----------

const recentView = document.getElementById("recentView");
const recentList = document.getElementById("recentList");
const recentMessage = document.getElementById("recentMessage");
const RECENT_KEY = "sonara-recent";
const RECENT_MAX = 20;

function loadRecent() {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY));
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

function saveRecent(list) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_MAX)));
  } catch (e) {
    // Storage full or blocked: recent history just won't persist.
  }
}

// Every played track goes to the front; local files are session-only
// and are never stored.
function pushRecent(track) {
  if (!track || track.id == null || track._local) {
    return;
  }
  const summary = trackSummary(track);
  const list = loadRecent().filter(function (t) {
    return String(t.id) !== String(summary.id);
  });
  list.unshift(summary);
  saveRecent(list);
  if (!recentView.hidden) {
    renderRecent();
  }
}

function renderRecent() {
  const list = loadRecent();
  recentList.innerHTML = "";
  recentMessage.hidden = list.length > 0;
  list.forEach(function (s) {
    const row = document.createElement("button");
    row.className = "queue-row";
    row.setAttribute("aria-label", "Play " + s.title);
    const art = document.createElement("span");
    art.className = "q-art";
    if (s.artwork && s.artwork["150x150"]) {
      const img = document.createElement("img");
      img.src = s.artwork["150x150"];
      img.alt = "";
      art.appendChild(img);
    } else {
      art.appendChild(noteIcon());
    }
    const txt = document.createElement("span");
    txt.className = "q-text";
    const title = document.createElement("span");
    title.className = "q-title";
    title.textContent = s.title;
    const artist = document.createElement("span");
    artist.className = "q-artist";
    artist.textContent = s.artist;
    txt.appendChild(title);
    txt.appendChild(artist);
    row.appendChild(art);
    row.appendChild(txt);
    row.addEventListener("click", function () {
      startQueue([{
        id: s.id,
        title: s.title,
        user: { name: s.artist },
        artwork: s.artwork
      }], 0);
    });
    recentList.appendChild(row);
  });
}


// ---------- 19. Local files (Spotify-style "Local Files") ----------

const localFilesBtn = document.getElementById("localFilesBtn");
const localFileInput = document.getElementById("localFileInput");

localFilesBtn.addEventListener("click", function () {
  localFileInput.click();
});

localFileInput.addEventListener("change", function () {
  const files = Array.prototype.filter.call(
    localFileInput.files || [],
    function (f) { return f.type.indexOf("audio/") === 0; }
  );
  localFileInput.value = "";
  if (!files.length) {
    return;
  }
  const tracks = files.map(function (f, i) {
    const name = f.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
    return {
      id: "local-" + Date.now() + "-" + i,
      title: name || f.name,
      user: { name: "Local file" },
      artwork: null,
      _objectUrl: URL.createObjectURL(f),
      _local: true
    };
  });
  startQueue(tracks, 0);
  showView("queue");
  showSkipNote(files.length + (files.length === 1 ? " local file" : " local files") +
    " added to Up Next.");
});


// ---------- 20. Coverflow view for Browse ----------

const gridViewBtn = document.getElementById("gridViewBtn");
const flowViewBtn = document.getElementById("flowViewBtn");
const coverflowWrap = document.getElementById("coverflowWrap");
const coverflow = document.getElementById("coverflow");
const flowPrev = document.getElementById("flowPrev");
const flowNext = document.getElementById("flowNext");
let browseMode = "grid";
let flowIndex = 0;

function setBrowseMode(mode) {
  browseMode = mode;
  const isFlow = mode === "flow";
  trendingGrid.hidden = isFlow;
  coverflowWrap.hidden = !isFlow;
  gridViewBtn.classList.toggle("active", !isFlow);
  flowViewBtn.classList.toggle("active", isFlow);
  if (isFlow) {
    renderCoverflow();
  }
}

gridViewBtn.addEventListener("click", function () { setBrowseMode("grid"); });
flowViewBtn.addEventListener("click", function () { setBrowseMode("flow"); });

function renderCoverflow() {
  coverflow.innerHTML = "";
  const tracks = trendingTracks;
  if (!tracks.length) {
    return;
  }
  flowIndex = Math.max(0, Math.min(flowIndex, tracks.length - 1));
  tracks.forEach(function (track, i) {
    const btn = document.createElement("button");
    btn.className = "flow-item";
    btn.setAttribute("aria-label", "Play " + track.title);
    const art = document.createElement("div");
    art.className = "artwork";
    const url = artworkUrl(track, "500x500") || artworkUrl(track, "480x480");
    if (url) {
      const img = document.createElement("img");
      img.src = url;
      img.alt = "";
      art.appendChild(img);
    } else {
      art.classList.add("artwork-missing");
      art.appendChild(noteIcon());
    }
    const cap = document.createElement("div");
    cap.className = "flow-caption";
    const t = document.createElement("div");
    t.className = "card-title";
    t.textContent = track.title;
    const a = document.createElement("div");
    a.className = "card-artist";
    a.textContent = artistName(track);
    cap.appendChild(t);
    cap.appendChild(a);
    btn.appendChild(art);
    btn.appendChild(cap);
    btn.addEventListener("click", function () {
      if (i === flowIndex) {
        startQueue(trendingTracks, i);
      } else {
        flowIndex = i;
        layoutCoverflow();
      }
    });
    coverflow.appendChild(btn);
  });
  layoutCoverflow();
}

function layoutCoverflow() {
  const items = coverflow.children;
  for (let i = 0; i < items.length; i++) {
    const off = i - flowIndex;
    const abs = Math.abs(off);
    if (abs > 4) {
      items[i].style.opacity = "0";
      items[i].style.pointerEvents = "none";
      items[i].style.transform =
        "translateX(" + (off * 120) + "px) translateZ(-500px)";
    } else {
      items[i].style.opacity = String(1 - abs * 0.2);
      items[i].style.pointerEvents = "auto";
      let tr = "translateX(" + (off * 170) + "px)" +
        " translateZ(" + (-abs * 130) + "px)" +
        " rotateY(" + (off * -48) + "deg)";
      if (off === 0) {
        tr += " scale(1.12)";
      }
      items[i].style.transform = tr;
    }
    items[i].style.zIndex = String(100 - abs);
  }
}

flowPrev.addEventListener("click", function () {
  if (flowIndex > 0) {
    flowIndex--;
    layoutCoverflow();
  }
});
flowNext.addEventListener("click", function () {
  if (flowIndex < trendingTracks.length - 1) {
    flowIndex++;
    layoutCoverflow();
  }
});


// ---------- 21. Sound panel: crossfade ----------

const soundBtn = document.getElementById("soundBtn");
const soundMenu = document.getElementById("soundMenu");
const XFADE_OPTIONS = [
  { v: 0, name: "Off" },
  { v: 3, name: "3 seconds" },
  { v: 5, name: "5 seconds" },
  { v: 8, name: "8 seconds" }
];

function openSoundMenu() {
  soundMenu.innerHTML = "";
  const title = document.createElement("div");
  title.className = "sound-title";
  title.textContent = "Sound";
  const row = document.createElement("div");
  row.className = "xfade-row";
  const label = document.createElement("span");
  label.textContent = "Crossfade between songs";
  const sel = document.createElement("select");
  sel.setAttribute("aria-label", "Crossfade length");
  XFADE_OPTIONS.forEach(function (o) {
    const opt = document.createElement("option");
    opt.value = String(o.v);
    opt.textContent = o.name;
    if (o.v === xfadeSecs) {
      opt.selected = true;
    }
    sel.appendChild(opt);
  });
  sel.addEventListener("change", function () {
    xfadeSecs = parseInt(sel.value, 10) || 0;
    localStorage.setItem("sonara-xfade", String(xfadeSecs));
  });
  row.appendChild(label);
  row.appendChild(sel);
  soundMenu.appendChild(title);
  soundMenu.appendChild(row);
  // v0.5: DJ voice controls live in the same panel.
  appendDjVoiceRows(soundMenu);

  // The footer sits at the bottom, so the panel opens upward.
  const r = soundBtn.getBoundingClientRect();
  soundMenu.style.bottom = (window.innerHeight - r.top + 6) + "px";
  soundMenu.style.left = Math.max(8, Math.min(r.left,
    window.innerWidth - 320)) + "px";
  soundMenu.hidden = false;
}

function closeSoundMenu() {
  soundMenu.hidden = true;
}

soundBtn.addEventListener("click", function (event) {
  event.stopPropagation();
  if (soundMenu.hidden) {
    openSoundMenu();
  } else {
    closeSoundMenu();
  }
});

// Clicks inside the panel (like the crossfade dropdown) stay inside.
soundMenu.addEventListener("click", function (event) {
  event.stopPropagation();
});


// ---------- 22. v0.5: reel motion effects ----------

// Reel 1 (Raylight promo) + Reel 2 (liquidGL "Liquid Glass") motion,
// hand-built in vanilla JS. The CSS in styles.css does the visuals;
// this file only drives them. Everything here respects
// prefers-reduced-motion, matching the scrambleText pattern above.

// --- Staggered word-by-word headline reveals ---
// Splits an h1 into word spans; CSS fades each one up with a 120ms
// stagger. Safe to re-run: reading textContent back gives the plain
// words, so switching views simply replays the reveal.
function revealHeadline(h1) {
  if (!h1) {
    return;
  }
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }
  var text = h1.textContent;
  if (!text || !text.trim()) {
    return;
  }
  h1.innerHTML = "";
  var words = text.split(" ");
  words.forEach(function (word, i) {
    if (i > 0) {
      h1.appendChild(document.createTextNode(" "));
    }
    var span = document.createElement("span");
    span.className = "rw";
    span.style.animationDelay = (i * 120) + "ms";
    span.textContent = word;
    h1.appendChild(span);
  });
}

// --- Cursor-tracked 3D tilt on track cards ---
// The artwork leans toward the pointer (max ~15deg each way) and
// eases back flat on leave. One delegated listener covers every
// card, including ones rendered later.
var tiltReduceMotion =
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;
var tiltCard = null;
var tiltArt = null;

function clearTilt() {
  if (tiltArt) {
    tiltArt.style.setProperty("--rx", "0deg");
    tiltArt.style.setProperty("--ry", "0deg");
  }
  tiltCard = null;
  tiltArt = null;
}

if (!tiltReduceMotion) {
  document.addEventListener("mousemove", function (event) {
    var target = event.target;
    var card = target && target.closest ? target.closest(".card") : null;
    if (!card) {
      if (tiltCard) {
        clearTilt();
      }
      return;
    }
    if (card !== tiltCard) {
      clearTilt();
      tiltCard = card;
      tiltArt = card.querySelector(".artwork");
      if (!tiltArt) {
        tiltCard = null;
        return;
      }
    }
    var rect = tiltArt.getBoundingClientRect();
    var px = (event.clientX - rect.left) / rect.width - 0.5;
    var py = (event.clientY - rect.top) / rect.height - 0.5;
    tiltArt.style.setProperty("--ry", (px * 30).toFixed(1) + "deg");
    tiltArt.style.setProperty("--rx", (-py * 30).toFixed(1) + "deg");
  });

  document.addEventListener("mouseout", function (event) {
    if (tiltCard &&
        (!event.relatedTarget || !tiltCard.contains(event.relatedTarget))) {
      clearTilt();
    }
  });

  // Scrolling can leave a stale tilt behind; clear it.
  document.addEventListener("scroll", clearTilt, { passive: true });
}

// Reveal the Browse headline on first load.
revealHeadline(document.querySelector("#browseView h1"));


// ---------- 23. Offline downloads (Spotify-style) ----------

// LEGAL BOUNDARY, read before touching this code:
// A download button is shown ONLY when the Audius API says
// is_downloadable === true AND hands us a download.url for the track.
// That flag is the artist's own choice. There is no "download
// anything" path in this app, and there never will be: ignoring the
// flag would take artists' work against their choice.

// Registry shape in localStorage ("sonara-downloads"):
//   { [trackId]: { id, title, artist, artwork, filePath, size,
//                  downloadedAt, external } }
// external=true means a plain browser saved the file into the user's
// Downloads folder. Only the Mac app keeps files it can play back.

const DL_KEY = "sonara-downloads";
const downloadedView = document.getElementById("downloadedView");
const downloadedList = document.getElementById("downloadedList");
const downloadedMessage = document.getElementById("downloadedMessage");
const downloadedSubtitle = document.getElementById("downloadedSubtitle");
const dlStorage = document.getElementById("dlStorage");
const removeAllDlBtn = document.getElementById("removeAllDlBtn");
const offlinePill = document.getElementById("offlinePill");
const offlineBadge = document.getElementById("offlineBadge");
const downloadAllBtn = document.getElementById("downloadAllBtn");

let downloads = loadDownloads(); // the registry
const dlProgress = {};           // trackId -> 0..100 while downloading
const dlMetaCache = {};          // trackId -> {title, artist, artwork}, kept while downloading
let playingOffline = false;      // true when the saved copy is playing

const DL_ARROW_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>';
const CHECK_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>';

// True only inside the Electron Mac app, where the download bridge exists.
function isDesktop() {
  return !!(window.sonara && window.sonara.downloadTrack);
}

// The artist's choice, straight from the Audius API. Both must hold.
function canDownload(track) {
  return !!(track && track.is_downloadable === true &&
    track.download && track.download.url);
}

function loadDownloads() {
  try {
    const raw = localStorage.getItem(DL_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    return obj && typeof obj === "object" ? obj : {};
  } catch (error) {
    return {};
  }
}

function saveDownloads() {
  try {
    localStorage.setItem(DL_KEY, JSON.stringify(downloads));
  } catch (error) {
    // Storage is full or blocked. The app keeps working for this session.
  }
}

function isDownloaded(trackId) {
  return !!(trackId && downloads[trackId]);
}

// The file the player should use, or null when we should stream.
// file:// works because the Mac app loads its page over file:// too.
function localSrc(track) {
  if (!track || !isDesktop()) {
    return null;
  }
  const entry = downloads[track.id];
  if (entry && entry.filePath && !entry.external) {
    return "file://" + entry.filePath;
  }
  return null;
}

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) {
    return "0 KB";
  }
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) {
    return mb.toFixed(1) + " MB";
  }
  return Math.max(1, Math.round(bytes / 1024)) + " KB";
}

// Starts a download. In the Mac app the main process fetches the file;
// in a plain browser this is an honest one-shot save into the user's
// Downloads folder, because a web page cannot silently manage files.
function startDownload(track) {
  if (!canDownload(track) || isDownloaded(track.id) ||
      dlProgress[track.id] !== undefined) {
    return;
  }
  if (isDesktop()) {
    dlMetaCache[track.id] = {
      title: track.title,
      artist: artistName(track),
      artwork: trackSummary(track).artwork
    };
    dlProgress[track.id] = 0;
    window.sonara.downloadTrack({
      trackId: track.id,
      url: track.download.url,
      title: track.title
    });
  } else {
    const a = document.createElement("a");
    a.href = track.download.url;
    a.target = "_blank";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    downloads[track.id] = {
      id: track.id,
      title: track.title,
      artist: artistName(track),
      artwork: trackSummary(track).artwork,
      filePath: null,
      size: 0,
      downloadedAt: Date.now(),
      external: true
    };
    saveDownloads();
    renderDownloaded();
    showSkipNote("Saved to your Downloads folder. The browser cannot keep it inside Sonara.");
  }
  syncDownloadButtons();
}

// Removes a saved song. options.silent skips the note, used when the
// file vanished on its own and we are only cleaning the registry.
function removeDownload(trackId, options) {
  const entry = downloads[trackId];
  if (!entry) {
    return;
  }
  if (isDesktop() && entry.filePath && !entry.external) {
    window.sonara.deleteDownload({ trackId: trackId, filePath: entry.filePath });
  }
  delete downloads[trackId];
  delete dlProgress[trackId];
  delete dlMetaCache[trackId];
  saveDownloads();
  syncDownloadButtons();
  renderDownloaded();
  if (!(options && options.silent)) {
    showSkipNote("Download removed.");
  }
}

// One download button for one track, or null when the artist did not
// allow downloads. cls picks the card or the row styling. Every button
// carries its track id so syncDownloadButtons can refresh them all in
// place, without re-rendering any list.
function downloadButton(track, cls) {
  if (!canDownload(track)) {
    return null;
  }
  const btn = document.createElement("button");
  btn.className = cls;
  btn.setAttribute("data-dl-btn", "");
  btn.dataset.trackId = track.id;
  btn.dataset.title = track.title;
  btn.addEventListener("click", function (event) {
    event.stopPropagation();
    onDownloadTap(track, btn);
  });
  paintDlBtn(btn);
  return btn;
}

// Paints one button from the current state: arrow, live %, or checkmark.
function paintDlBtn(btn) {
  const id = btn.dataset.trackId;
  const title = btn.dataset.title || "this song";
  btn.classList.remove("downloading", "done", "armed");
  if (isDownloaded(id)) {
    btn.classList.add("done");
    btn.innerHTML = CHECK_SVG;
    btn.setAttribute("aria-label", "Remove download of " + title);
  } else if (dlProgress[id] !== undefined) {
    btn.classList.add("downloading");
    btn.textContent = Math.round(dlProgress[id]) + "%";
    btn.setAttribute("aria-label", "Downloading " + title);
  } else {
    btn.innerHTML = DL_ARROW_SVG;
    btn.setAttribute("aria-label", "Download " + title + " for offline");
  }
}

function syncDownloadButtons() {
  const buttons = document.querySelectorAll("[data-dl-btn]");
  buttons.forEach(paintDlBtn);
}

// Tapping the button: download, or, when already saved, arm removal.
// Removal uses the app's tap-again-to-confirm pattern, no popups.
function onDownloadTap(track, btn) {
  const id = track.id;
  if (isDownloaded(id)) {
    if (btn.dataset.armed === "1") {
      btn.dataset.armed = "";
      removeDownload(id);
      return;
    }
    btn.dataset.armed = "1";
    btn.classList.add("armed");
    btn.textContent = "?";
    btn.setAttribute("aria-label", "Tap again to remove the download");
    setTimeout(function () {
      if (btn.dataset.armed === "1") {
        btn.dataset.armed = "";
        paintDlBtn(btn);
      }
    }, 3000);
    return;
  }
  if (dlProgress[id] !== undefined) {
    return; // already downloading; the % on the button is the feedback
  }
  startDownload(track);
}

// Answers from the main process about downloads.
if (isDesktop()) {
  window.sonara.onDownloadProgress(function (data) {
    if (!data || !data.trackId || dlProgress[data.trackId] === undefined) {
      return;
    }
    dlProgress[data.trackId] = data.total > 0
      ? Math.min(100, (data.received / data.total) * 100)
      : 0;
    syncDownloadButtons();
  });

  window.sonara.onDownloadDone(function (data) {
    if (!data || !data.trackId) {
      return;
    }
    const meta = dlMetaCache[data.trackId] || {};
    downloads[data.trackId] = {
      id: data.trackId,
      title: meta.title || "Unknown title",
      artist: meta.artist || "Unknown artist",
      artwork: meta.artwork || null,
      filePath: data.filePath,
      size: data.size || 0,
      downloadedAt: Date.now(),
      external: false
    };
    delete dlProgress[data.trackId];
    delete dlMetaCache[data.trackId];
    saveDownloads();
    syncDownloadButtons();
    renderDownloaded();
    showSkipNote("Downloaded. It will play offline from now on.");
  });

  window.sonara.onDownloadError(function (data) {
    if (!data || !data.trackId) {
      return;
    }
    delete dlProgress[data.trackId];
    delete dlMetaCache[data.trackId];
    syncDownloadButtons();
    showSkipNote(data.message || "Download failed. Try again.");
  });
}

// ---------- The Downloaded view ----------

function downloadedTracks() {
  return Object.keys(downloads)
    .map(function (id) { return downloads[id]; })
    .sort(function (a, b) { return b.downloadedAt - a.downloadedAt; });
}

function renderDownloaded() {
  downloadedList.innerHTML = "";
  const list = downloadedTracks();
  downloadedMessage.hidden = list.length > 0;
  downloadedSubtitle.textContent = list.length === 0
    ? "Songs saved on this Mac"
    : list.length + (list.length === 1 ? " song" : " songs") +
      " saved on this Mac";
  list.forEach(function (entry) {
    downloadedList.appendChild(downloadedRow(entry));
  });
  updateDlStorage();
}

// One row in the Downloaded view: artwork, title, size, remove button.
// Tapping the row plays the song, from the saved file when we have it.
function downloadedRow(entry) {
  const row = document.createElement("div");
  row.className = "queue-row";
  row.tabIndex = 0;
  row.setAttribute("role", "button");

  const art = document.createElement("div");
  art.className = "q-art";
  const url = entry.artwork ? entry.artwork["150x150"] : null;
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
  title.textContent = entry.title;
  text.appendChild(title);

  const sub = document.createElement("div");
  sub.className = "q-artist";
  sub.textContent = entry.artist + " · " +
    (entry.external ? "in Downloads folder" : formatBytes(entry.size));
  text.appendChild(sub);

  row.appendChild(text);

  const rm = document.createElement("button");
  rm.className = "remove-btn";
  rm.setAttribute("aria-label", "Remove download");
  rm.textContent = "x";
  rm.addEventListener("click", function (event) {
    event.stopPropagation();
    removeDownload(entry.id);
  });
  row.appendChild(rm);

  function play() {
    // The id is enough: playCurrent streams it, or picks the saved
    // file when this Mac has it.
    startQueue([{
      id: entry.id,
      title: entry.title,
      user: { name: entry.artist },
      artwork: entry.artwork,
      is_downloadable: true,
      download: null
    }], 0);
  }
  row.addEventListener("click", play);
  row.addEventListener("keydown", function (event) {
    // The remove button handles its own keys.
    if (event.target !== row) {
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      play();
    }
  });

  return row;
}

// "12 songs · 48.3 MB" line at the top of the Downloaded view.
function updateDlStorage() {
  const list = downloadedTracks();
  let total = 0;
  list.forEach(function (entry) { total += entry.size || 0; });
  dlStorage.textContent = list.length === 0
    ? ""
    : list.length + (list.length === 1 ? " song" : " songs") +
      " · " + formatBytes(total);
}

// Remove all: first click arms it, second click confirms.
let removeAllArmed = false;
let removeAllTimer = null;
removeAllDlBtn.addEventListener("click", function () {
  const ids = Object.keys(downloads);
  if (ids.length === 0) {
    return;
  }
  if (!removeAllArmed) {
    removeAllArmed = true;
    removeAllDlBtn.textContent = "Click again to confirm";
    clearTimeout(removeAllTimer);
    removeAllTimer = setTimeout(function () {
      removeAllArmed = false;
      removeAllDlBtn.textContent = "Remove all";
    }, 3000);
    return;
  }
  ids.forEach(function (id) {
    removeDownload(id, { silent: true });
  });
  removeAllArmed = false;
  removeAllDlBtn.textContent = "Remove all";
  showSkipNote("All downloads removed.");
});


// ---------- 24. Offline mode ----------

// The pill in the header and the Downloaded view are the offline home.
// Trying to stream a song that is not saved while offline is refused
// with a plain note instead of a silent failure.
function updateOnlineUI() {
  offlinePill.hidden = navigator.onLine;
}

window.addEventListener("online", updateOnlineUI);
window.addEventListener("offline", updateOnlineUI);
updateOnlineUI();




// ---------- 25. v0.5: 11 roadmap features (step 3) ----------

// Borrowed, with credit in spirit, from the famous music apps:
// Spotify (Liked Songs, stats, mixes, queue, radio), YouTube Music
// (radio, speed, library, mixtape, discover, recap), JioSaavn
// (language charts), Echo Music (track story, share, lyric styles,
// smart playback). Everything below is free, needs no login, and
// keeps the app's zero-dependency, plain-JavaScript character.


// ===== 25.1 Liked Songs (Spotify-style hearts) =====

// Hearts live in localStorage "sonara-liked": track summaries,
// newest first. The same summary shape playlists use.
const LIKE_KEY = "sonara-liked";
const HEART_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>';
const MIX_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>';

let likedTracks = loadLiked();

function loadLiked() {
  try {
    const raw = localStorage.getItem(LIKE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch (error) {
    return [];
  }
}

function saveLiked() {
  try {
    localStorage.setItem(LIKE_KEY, JSON.stringify(likedTracks));
  } catch (error) {
    // Storage is full or blocked. Likes work for this session.
  }
}

function isLiked(trackId) {
  return likedTracks.some(function (t) {
    return String(t.id) === String(trackId);
  });
}

// Tapping a heart adds or removes the song, then refreshes every
// heart on screen plus the sidebar count.
function toggleLike(track) {
  if (!track || track.id == null) {
    return;
  }
  const at = likedTracks.findIndex(function (t) {
    return String(t.id) === String(track.id);
  });
  if (at === -1) {
    likedTracks.unshift(trackSummary(track));
    showSkipNote("Added to Liked Songs.");
  } else {
    likedTracks.splice(at, 1);
    showSkipNote("Removed from Liked Songs.");
  }
  saveLiked();
  syncLikeButtons();
  renderPlaylistNav();
  if (openPlaylistId === "liked") {
    renderPlaylistSongs();
  }
  if (!libraryView.hidden && libTab === "songs") {
    renderLibrary();
  }
}

// One heart button for one track. cls picks the card or row styling.
// Every button carries its track id so syncLikeButtons can repaint
// them all in place, without re-rendering any list.
function likeButton(track, cls) {
  const btn = document.createElement("button");
  btn.className = cls;
  btn.setAttribute("data-like-btn", "");
  btn.dataset.trackId = track.id;
  btn.addEventListener("click", function (event) {
    event.stopPropagation();
    toggleLike(track);
  });
  paintLikeBtn(btn);
  return btn;
}

function paintLikeBtn(btn) {
  const liked = isLiked(btn.dataset.trackId);
  btn.classList.toggle("liked", liked);
  btn.innerHTML = HEART_SVG;
  btn.setAttribute("aria-label", liked ? "Unlike this song" : "Like this song");
}

function syncLikeButtons() {
  document.querySelectorAll("[data-like-btn]").forEach(paintLikeBtn);
  syncPlayerLike();
}

// The heart in the now-playing bar follows the current song.
const likeBtn = document.getElementById("likeBtn");

function syncPlayerLike() {
  const track = queue[currentIndex];
  const liked = !!(track && isLiked(track.id));
  likeBtn.classList.toggle("liked", liked);
  likeBtn.setAttribute("aria-label",
    liked ? "Unlike this song" : "Like this song");
}

likeBtn.addEventListener("click", function () {
  const track = queue[currentIndex];
  if (track) {
    toggleLike(track);
  } else {
    showSkipNote("Play a song first.");
  }
});

// ===== 25.2 Your stats (Spotify Wrapped-style, on-device only) =====

// Every play is counted here in localStorage "sonara-stats":
//   { [trackId]: { id, title, artist, artwork, plays, seconds } }
// Seconds accumulate only while sound is actually playing. Nothing
// ever leaves the Mac: there is no account and no server to send to.
const STATS_KEY = "sonara-stats";

const statsView = document.getElementById("statsView");
const statsBody = document.getElementById("statsBody");
const statsMessage = document.getElementById("statsMessage");

function loadStats() {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    return obj && typeof obj === "object" ? obj : {};
  } catch (error) {
    return {};
  }
}

function saveStats(stats) {
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  } catch (error) {
    // Storage is full or blocked. Stats pause for this session.
  }
}

// One open listening session. t0 is when the current stretch of
// audible playback began; pauses and track changes close it out.
let statSession = null;

// A new track started: count one play, then open a timing session.
function statsPlayStart(track) {
  statsPlayStop(); // finalize any previous session first
  if (!track || track.id == null || track._local) {
    return; // local files are session-only, like recent history
  }
  const stats = loadStats();
  const id = String(track.id);
  const entry = stats[id] || {
    id: track.id,
    title: track.title,
    artist: artistName(track),
    artwork: trackSummary(track).artwork,
    // v0.5: genre travels with the stats so Recap can name a top genre.
    genre: track.genre || null,
    plays: 0,
    seconds: 0
  };
  entry.plays += 1;
  entry.title = track.title;
  entry.artist = artistName(track);
  if (track.genre) {
    entry.genre = track.genre;
  }
  stats[id] = entry;
  saveStats(stats);
  statSession = { id: id, t0: Date.now() };
  if (!statsView.hidden) {
    renderStats();
  }
}

// Playback stopped being audible: bank the seconds and close out.
function statsPlayStop() {
  if (!statSession) {
    return;
  }
  const stats = loadStats();
  const entry = stats[statSession.id];
  if (entry) {
    entry.seconds += Math.max(0, (Date.now() - statSession.t0) / 1000);
    saveStats(stats);
  }
  statSession = null;
}

// Resuming mid-song: restart the clock, but do not count a new play.
// Pause closed the session, so resume reopens one for the current
// track; without this, every second after a pause would go uncounted.
function statsPlayResume() {
  if (statSession) {
    statSession.t0 = Date.now();
    return;
  }
  const track = queue[currentIndex];
  if (track && track.id != null && !track._local) {
    statSession = { id: String(track.id), t0: Date.now() };
  }
}

// Hook the real audio elements, mirroring wireAudio's activeAudio guard.
// Pause closes the session; play reopens the clock without a new count.
function wireStats(el) {
  el.addEventListener("pause", function () {
    if (el !== activeAudio) {
      return;
    }
    statsPlayStop();
  });
  el.addEventListener("play", function () {
    if (el !== activeAudio) {
      return;
    }
    statsPlayResume();
  });
}
wireStats(audio);
wireStats(audioX);

// The Stats view: total minutes, top 5 songs, top 5 artists.
function renderStats() {
  const stats = loadStats();
  const entries = Object.keys(stats).map(function (k) {
    return stats[k];
  }).filter(function (e) {
    return e.plays > 0;
  });
  statsMessage.hidden = entries.length > 0;
  statsBody.innerHTML = "";
  if (entries.length === 0) {
    return;
  }

  const totalSecs = entries.reduce(function (sum, e) {
    return sum + (e.seconds || 0);
  }, 0);

  const big = document.createElement("div");
  big.className = "stat-block";
  const bigNum = document.createElement("div");
  bigNum.className = "stat-big";
  bigNum.textContent = Math.round(totalSecs / 60);
  const bigLabel = document.createElement("div");
  bigLabel.className = "stat-big-label";
  bigLabel.textContent = "minutes listened on this Mac";
  big.appendChild(bigNum);
  big.appendChild(bigLabel);
  statsBody.appendChild(big);

  statsBody.appendChild(statBlock("Top songs",
    entries.slice().sort(function (a, b) {
      return b.plays - a.plays;
    }).slice(0, 5).map(function (e) {
      return { name: e.title, sub: e.artist, meta: e.plays + (e.plays === 1 ? " play" : " plays") };
    })));

  const byArtist = {};
  entries.forEach(function (e) {
    const a = byArtist[e.artist] || { artist: e.artist, plays: 0 };
    a.plays += e.plays;
    byArtist[e.artist] = a;
  });
  statsBody.appendChild(statBlock("Top artists",
    Object.keys(byArtist).map(function (k) {
      return byArtist[k];
    }).sort(function (a, b) {
      return b.plays - a.plays;
    }).slice(0, 5).map(function (a) {
      return { name: a.artist, sub: "", meta: a.plays + (a.plays === 1 ? " play" : " plays") };
    })));
}

// One titled block of ranked rows. Plain numbers, no fake fanfare.
function statBlock(title, rows) {
  const block = document.createElement("div");
  block.className = "stat-block";
  const h = document.createElement("h2");
  h.textContent = title;
  block.appendChild(h);
  rows.forEach(function (r, i) {
    const row = document.createElement("div");
    row.className = "stat-row";
    const rank = document.createElement("span");
    rank.className = "stat-rank";
    rank.textContent = (i + 1);
    const name = document.createElement("span");
    name.className = "stat-name";
    name.textContent = r.name + (r.sub ? " - " + r.sub : "");
    const meta = document.createElement("span");
    meta.className = "stat-sub";
    meta.textContent = r.meta;
    row.appendChild(rank);
    row.appendChild(name);
    row.appendChild(meta);
    block.appendChild(row);
  });
  return block;
}

// ===== 25.3 Weekly Mix (your own Discover Weekly) =====

// The mix lives in localStorage "sonara-weekly-mix":
//   { generatedAt, tracks: [summaries] }
// Half is your most-played (from stats), half is fresh trending.
// It rebuilds itself when opened stale (older than 7 days).
const MIX_KEY = "sonara-weekly-mix";
const MIX_MAX = 20;
const MIX_STALE_MS = 7 * 24 * 3600 * 1000;
const LIKED_ID = "liked";
const MIX_ID = "mix";

const refreshMixBtn = document.getElementById("refreshMixBtn");

function loadMix() {
  try {
    const raw = localStorage.getItem(MIX_KEY);
    const m = raw ? JSON.parse(raw) : null;
    if (m && Array.isArray(m.tracks)) {
      return m;
    }
  } catch (error) {
    // fall through to the empty mix
  }
  return { generatedAt: 0, tracks: [] };
}

function saveMix(mix) {
  try {
    localStorage.setItem(MIX_KEY, JSON.stringify(mix));
  } catch (error) {
    // Storage is full or blocked. The mix works for this session.
  }
}

function buildWeeklyMix() {
  const stats = loadStats();
  const top = Object.keys(stats).map(function (k) {
    return stats[k];
  }).sort(function (a, b) {
    return b.plays - a.plays;
  }).slice(0, 8);

  const tracks = [];
  const seen = {};
  top.forEach(function (s) {
    // v0.5: a hidden song does not sneak back in through the tops.
    if (isHiddenId(s.id)) {
      return;
    }
    tracks.push({
      id: s.id,
      title: s.title,
      artist: s.artist,
      artwork: s.artwork
    });
    seen[String(s.id)] = true;
  });
  // Fill the rest with trending songs you have not already got.
  // When offline, trending is empty and the mix is just your tops.
  // v0.5: hidden songs stay out of every auto mix.
  trendingTracks.forEach(function (t) {
    if (tracks.length >= MIX_MAX) {
      return;
    }
    if (isHiddenId(t.id)) {
      return;
    }
    if (!seen[String(t.id)]) {
      tracks.push(trackSummary(t));
      seen[String(t.id)] = true;
    }
  });
  return { generatedAt: Date.now(), tracks: tracks };
}

refreshMixBtn.addEventListener("click", function () {
  const mix = buildWeeklyMix();
  saveMix(mix);
  renderPlaylistNav();
  renderSpecialPlaylistSongs();
  showSkipNote("Mix refreshed with this week's songs.");
});

// Liked Songs and Weekly Mix pin above the user's own playlists.
// They are virtual: no delete button, and the mix gets Refresh.
function renderSpecialPlaylists() {
  playlistNav.appendChild(specialNavButton(LIKED_ID, "Liked Songs",
    HEART_SVG, likedTracks.length));
  playlistNav.appendChild(specialNavButton(MIX_ID, "Weekly Mix",
    MIX_SVG, loadMix().tracks.length));
  // v0.5: Daylist and Discover Mix pin here too.
  renderMoreSpecialPlaylists();
}

function specialNavButton(id, name, iconSvg, count) {
  const b = document.createElement("button");
  b.className = "nav-btn playlist-btn";
  b.dataset.pid = id;
  const icon = document.createElement("span");
  icon.className = "pl-icon";
  icon.innerHTML = iconSvg;
  b.appendChild(icon);
  const label = document.createElement("span");
  label.textContent = name;
  b.appendChild(label);
  const c = document.createElement("span");
  c.className = "count";
  c.textContent = count;
  b.appendChild(c);
  b.addEventListener("click", function () {
    showPlaylist(id);
  });
  return b;
}

// The open view for a virtual playlist. The mix rebuilds when stale;
// liked songs render straight from the hearts registry.
function renderSpecialPlaylistSongs() {
  const isMix = openPlaylistId === MIX_ID;
  let tracks;
  if (isMix) {
    let mix = loadMix();
    if (mix.tracks.length === 0 ||
        Date.now() - mix.generatedAt > MIX_STALE_MS) {
      mix = buildWeeklyMix();
      saveMix(mix);
    }
    tracks = mix.tracks;
    playlistTitle.textContent = "Weekly Mix";
    playlistSubtitle.textContent = "Made for you from your plays and trending";
  } else {
    tracks = likedTracks;
    playlistTitle.textContent = "Liked Songs";
    playlistSubtitle.textContent = tracks.length +
      (tracks.length === 1 ? " song" : " songs") + " you loved";
  }
  playlistList.innerHTML = "";
  refreshMixBtn.hidden = !isMix;
  deletePlaylistBtn.hidden = true;
  // v0.5: virtual mixes cannot move into folders.
  folderMoveBtn.hidden = true;

  if (tracks.length === 0) {
    playlistMessage.textContent = isMix
      ? "Nothing to mix yet. Play some music first."
      : "No liked songs yet. Tap the heart on any song.";
    playlistMessage.hidden = false;
  } else {
    playlistMessage.hidden = true;
    tracks.forEach(function (song, index) {
      playlistList.appendChild(playlistRow(
        { tracks: tracks }, song, index,
        isMix ? function (i) {
          // Taking a song out of an auto-mix: drop it and re-save.
          const m = loadMix();
          m.tracks.splice(i, 1);
          saveMix(m);
          renderPlaylistNav();
          renderSpecialPlaylistSongs();
        } : function (i) {
          toggleLike(tracks[i]);
        }
      ));
    });
  }

  // "Download all" mirrors the real playlist behavior.
  const pending = tracks.filter(function (song) {
    return canDownload(song) && !isDownloaded(song.id) &&
      dlProgress[song.id] === undefined;
  });
  downloadAllBtn.hidden = pending.length === 0;
  downloadAllBtn.onclick = function () {
    pending.forEach(function (song) {
      startDownload(song);
    });
    showSkipNote("Downloading " + pending.length +
      (pending.length === 1 ? " song." : " songs."));
    renderSpecialPlaylistSongs();
  };
}

// ===== 25.4 Better queue: drag reorder + save as playlist =====

// Which queue row is being dragged, or -1 when none is.
let dragIndex = -1;

// Removes the ember landing lines from every queue row.
function clearDropMarks() {
  queueList.querySelectorAll(".drop-before, .drop-after").forEach(
    function (row) {
      row.classList.remove("drop-before");
      row.classList.remove("drop-after");
      delete row.dataset.dropBefore;
    });
}

// Moves one queue row to a new spot. `before` says whether it lands
// in front of the target row or behind it. The playing highlight
// follows the song, not the position.
function moveQueueItem(from, to, before) {
  if (from === -1 || from === to ||
      from < 0 || from >= queue.length ||
      to < 0 || to >= queue.length) {
    return;
  }
  const item = queue.splice(from, 1)[0];
  let dest = before ? to : to + 1;
  if (from < dest) {
    dest -= 1;
  }
  queue.splice(dest, 0, item);
  if (currentIndex === from) {
    currentIndex = dest;
  } else if (from < currentIndex && dest >= currentIndex) {
    currentIndex -= 1;
  } else if (from > currentIndex && dest <= currentIndex) {
    currentIndex += 1;
  }
  renderQueue();
}

// The small up/down arrows on each queue row: the keyboard and touch
// alternative to dragging. dir is -1 (up) or 1 (down).
function moveButton(track, index, dir) {
  const b = document.createElement("button");
  b.className = "q-move";
  b.textContent = dir < 0 ? "↑" : "↓";
  b.setAttribute("aria-label",
    (dir < 0 ? "Move up: " : "Move down: ") + track.title);
  b.addEventListener("click", function (event) {
    event.stopPropagation();
    if (dir < 0 && index > 0) {
      moveQueueItem(index, index - 1, true);
    } else if (dir > 0 && index < queue.length - 1) {
      moveQueueItem(index, index + 1, false);
    }
  });
  return b;
}

// "Save as playlist": the inline name box mirrors the sidebar's
// playlist-creation pattern, so there is nothing new to learn.
const saveQueueBtn = document.getElementById("saveQueueBtn");
const saveQueueBox = document.getElementById("saveQueueBox");
const saveQueueInput = document.getElementById("saveQueueInput");
const saveQueueGo = document.getElementById("saveQueueGo");

saveQueueBtn.addEventListener("click", function () {
  if (queue.length === 0) {
    showSkipNote("Nothing queued yet. Play something first.");
    return;
  }
  saveQueueBox.hidden = false;
  saveQueueInput.value = "";
  saveQueueInput.focus();
});

function commitSaveQueue() {
  const name = saveQueueInput.value.trim();
  if (!name) {
    return;
  }
  playlists.push({
    id: "p" + Date.now(),
    name: name,
    tracks: queue.map(trackSummary)
  });
  savePlaylists();
  renderPlaylistNav();
  saveQueueBox.hidden = true;
  showSkipNote("Saved as \"" + name + "\".");
}

saveQueueGo.addEventListener("click", commitSaveQueue);
saveQueueInput.addEventListener("keydown", function (event) {
  if (event.key === "Enter") {
    commitSaveQueue();
  }
  if (event.key === "Escape") {
    saveQueueBox.hidden = true;
  }
});

// ===== 25.5 Radio mode (endless similar songs) =====

// When the queue runs out and radio is on, Sonara keeps playing by
// itself: same genre first, then same mood, then plain trending.
// Songs from your last 20 plays never repeat.
let radioOn = false;
try {
  radioOn = localStorage.getItem("sonara-radio") === "1";
} catch (error) {
  // Private mode: radio just starts off.
}

const radioBtn = document.getElementById("radioBtn");

function applyRadio() {
  radioBtn.classList.toggle("on", radioOn);
  radioBtn.setAttribute("aria-label", radioOn
    ? "Radio on: endless similar songs"
    : "Radio: endless similar songs");
}

radioBtn.addEventListener("click", function () {
  radioOn = !radioOn;
  try {
    localStorage.setItem("sonara-radio", radioOn ? "1" : "0");
  } catch (error) {
    // Choice lasts for this session only.
  }
  applyRadio();
  showSkipNote(radioOn
    ? "Radio on. Similar songs will keep playing."
    : "Radio off.");
});
applyRadio();

// Called when a track ends: next in queue, radio, or stop.
function advanceTrack() {
  if (currentIndex + 1 < queue.length) {
    nextTrack();
    return;
  }
  if (radioOn) {
    radioNext();
    return;
  }
  statsPlayStop(); // queue over: close the books on this listen
}

function radioNext() {
  const last = queue[currentIndex];
  if (!last || trendingTracks.length === 0) {
    showSkipNote("Radio needs the trending list. Check your connection.");
    statsPlayStop();
    return;
  }
  // Everything played lately is off-limits, so radio never loops.
  const recentIds = {};
  loadRecent().forEach(function (t) {
    recentIds[String(t.id)] = true;
  });
  queue.forEach(function (t) {
    recentIds[String(t.id)] = true;
  });

  function fresh(list) {
    const pool = list.filter(function (t) {
      // v0.5: hidden songs never reach the radio either.
      return !recentIds[String(t.id)] && !isHiddenId(t.id);
    });
    if (pool.length === 0) {
      return null;
    }
    return pool[Math.floor(Math.random() * pool.length)];
  }

  let pick = null;
  if (last.genre) {
    pick = fresh(trendingTracks.filter(function (t) {
      return t.genre === last.genre;
    }));
  }
  if (!pick && last.mood) {
    pick = fresh(trendingTracks.filter(function (t) {
      return t.mood === last.mood;
    }));
  }
  if (!pick) {
    pick = fresh(trendingTracks);
  }
  if (!pick) {
    showSkipNote("Radio ran out of fresh songs for now.");
    statsPlayStop();
    return;
  }
  queue.push(pick);
  currentIndex = queue.length - 1;
  playCurrent();
}


// ===== 25.6 Playback speed =====

// 1x, 1.25x, 1.5x, 2x, back to 1x. The rate sticks to both audio
// elements (crossfade swaps between them) and is remembered.
const SPEEDS = [1, 1.25, 1.5, 2];
let speedIdx = 0;
try {
  const saved = parseFloat(localStorage.getItem("sonara-speed"));
  const found = SPEEDS.indexOf(saved);
  if (found !== -1) {
    speedIdx = found;
  }
} catch (error) {
  // Private mode: speed just starts at 1x.
}

const speedBtn = document.getElementById("speedBtn");

function applySpeed() {
  audio.playbackRate = SPEEDS[speedIdx];
  audioX.playbackRate = SPEEDS[speedIdx];
  speedBtn.textContent = SPEEDS[speedIdx] + "x";
  speedBtn.classList.toggle("fast", speedIdx !== 0);
  speedBtn.setAttribute("aria-label",
    "Playback speed " + SPEEDS[speedIdx] + "x");
}

speedBtn.addEventListener("click", function () {
  speedIdx = (speedIdx + 1) % SPEEDS.length;
  try {
    localStorage.setItem("sonara-speed", String(SPEEDS[speedIdx]));
  } catch (error) {
    // Choice lasts for this session only.
  }
  applySpeed();
});
applySpeed();

// ===== 25.7 Library: Songs, Artists, Playlists in tabs =====

// Three tabs over what you kept: liked songs, the artists behind
// them (plus your history), and every playlist including the
// virtual ones. Tapping an artist filters the Songs tab to them.
const libraryView = document.getElementById("libraryView");
const libraryList = document.getElementById("libraryList");
const libraryMessage = document.getElementById("libraryMessage");
const libTabSongs = document.getElementById("libTabSongs");
const libTabArtists = document.getElementById("libTabArtists");
const libTabPlaylists = document.getElementById("libTabPlaylists");
const libTabHidden = document.getElementById("libTabHidden");
const libArtistFilter = document.getElementById("libArtistFilter");

let libTab = "songs";
let libArtistName = null; // artist currently filtering the Songs tab

function setLibTab(tab) {
  libTab = tab;
  libArtistName = null;
  renderLibrary();
}

libTabSongs.addEventListener("click", function () { setLibTab("songs"); });
libTabArtists.addEventListener("click", function () { setLibTab("artists"); });
libTabPlaylists.addEventListener("click", function () { setLibTab("playlists"); });
libTabHidden.addEventListener("click", function () { setLibTab("hidden"); });

// One artist, and every liked or once-played song of theirs we know.
function libraryArtists() {
  const map = {};
  function add(name, summary) {
    if (!name) {
      return;
    }
    const key = name.toLowerCase();
    if (!map[key]) {
      map[key] = { name: name, tracks: [] };
    }
    if (!map[key].tracks.some(function (t) {
      return String(t.id) === String(summary.id);
    })) {
      map[key].tracks.push(summary);
    }
  }
  likedTracks.forEach(function (t) {
    add(artistName(t), trackSummary(t));
  });
  const stats = loadStats();
  Object.keys(stats).forEach(function (k) {
    add(stats[k].artist, stats[k]);
  });
  return Object.keys(map).map(function (k) {
    return map[k];
  }).sort(function (a, b) {
    return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1;
  });
}

// One row: artwork, title, artist. Tapping plays just that song.
function libSongRow(summary) {
  const row = document.createElement("div");
  row.className = "queue-row";
  row.tabIndex = 0;
  row.setAttribute("role", "button");
  row.setAttribute("aria-label", "Play " + summary.title);

  const art = document.createElement("div");
  art.className = "q-art";
  const url = summary.artwork ? summary.artwork["150x150"] : null;
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
  title.textContent = summary.title;
  const artist = document.createElement("div");
  artist.className = "q-artist";
  artist.textContent = summary.artist;
  text.appendChild(title);
  text.appendChild(artist);
  row.appendChild(text);

  row.appendChild(likeButton(summary, "like-btn"));

  function play() {
    startQueue([{
      id: summary.id,
      title: summary.title,
      user: { name: summary.artist },
      artwork: summary.artwork,
      is_downloadable: summary.is_downloadable === true,
      download: summary.download || null
    }], 0);
  }
  row.addEventListener("click", play);
  row.addEventListener("keydown", function (event) {
    // The heart handles its own keys.
    if (event.target !== row) {
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      play();
    }
  });
  return row;
}

function renderLibrary() {
  [libTabSongs, libTabArtists, libTabPlaylists, libTabHidden].forEach(function (b) {
    b.classList.remove("active");
  });
  ({ songs: libTabSongs, artists: libTabArtists, playlists: libTabPlaylists, hidden: libTabHidden })[libTab].classList.add("active");

  libraryList.innerHTML = "";
  libArtistFilter.hidden = true;

  // v0.5: hidden songs live here with an Unhide button each.
  if (libTab === "hidden") {
    renderHiddenTab();
    return;
  }

  if (libTab === "songs") {
    let list = likedTracks;
    if (libArtistName) {
      list = list.filter(function (t) {
        return artistName(t) === libArtistName;
      });
      libArtistFilter.hidden = false;
      libArtistFilter.innerHTML = "";
      libArtistFilter.appendChild(document.createTextNode(
        "Showing songs by " + libArtistName + " "));
      const clear = document.createElement("button");
      clear.className = "text-btn";
      clear.textContent = "Clear";
      clear.addEventListener("click", function () {
        libArtistName = null;
        renderLibrary();
      });
      libArtistFilter.appendChild(clear);
    }
    libraryMessage.hidden = list.length > 0;
    if (list.length === 0 && !libArtistName) {
      libraryMessage.textContent =
        "Tap the heart on any song to start your library.";
    }
    list.forEach(function (t) {
      libraryList.appendChild(libSongRow(t));
    });
    return;
  }

  if (libTab === "artists") {
    const artists = libraryArtists();
    libraryMessage.hidden = artists.length > 0;
    if (artists.length === 0) {
      libraryMessage.textContent =
        "No artists yet. Like songs or play music first.";
    }
    artists.forEach(function (a) {
      const row = document.createElement("button");
      row.className = "queue-row";
      const text = document.createElement("div");
      text.className = "q-text";
      const name = document.createElement("div");
      name.className = "q-title";
      name.textContent = a.name;
      const count = document.createElement("div");
      count.className = "q-artist";
      count.textContent = a.tracks.length +
        (a.tracks.length === 1 ? " song" : " songs");
      text.appendChild(name);
      text.appendChild(count);
      row.appendChild(text);
      row.addEventListener("click", function () {
        libArtistName = a.name;
        libTab = "songs";
        renderLibrary();
      });
      libraryList.appendChild(row);
    });
    return;
  }

  // Playlists tab: your playlists plus the virtual ones.
  libraryMessage.hidden = true;
  const entries = [
    { id: "liked", name: "Liked Songs", sub: likedTracks.length + " songs" },
    { id: "mix", name: "Weekly Mix", sub: loadMix().tracks.length + " songs" },
    // v0.5: the two new auto mixes pin here as well.
    { id: "daylist", name: "Daylist", sub: loadDaylist().tracks.length + " songs" },
    { id: "discover", name: "Discover Mix", sub: loadDiscoverMix().tracks.length + " songs" }
  ].concat(playlists.map(function (p) {
    return {
      id: p.id,
      name: p.name,
      sub: p.tracks.length + (p.tracks.length === 1 ? " song" : " songs")
    };
  }));
  entries.forEach(function (e) {
    const row = document.createElement("button");
    row.className = "queue-row";
    const text = document.createElement("div");
    text.className = "q-text";
    const name = document.createElement("div");
    name.className = "q-title";
    name.textContent = e.name;
    const sub = document.createElement("div");
    sub.className = "q-artist";
    sub.textContent = e.sub;
    text.appendChild(name);
    text.appendChild(sub);
    row.appendChild(text);
    row.addEventListener("click", function () {
      showPlaylist(e.id);
    });
    libraryList.appendChild(row);
  });
}

// ===== 25.8 Track story: "about this artist" (Wikipedia, free) =====

// Every artist name goes to Wikipedia's free summary API. No key,
// no account. The panel reuses the app's modal dialog, and every
// string is set as textContent so nothing from the web can run.
const aboutBtn = document.getElementById("aboutBtn");

aboutBtn.addEventListener("click", function () {
  const track = queue[currentIndex];
  if (!track) {
    showSkipNote("Play a song first.");
    return;
  }
  const name = artistName(track);
  openModal("About " + name);
  const loading = document.createElement("p");
  loading.className = "message";
  loading.textContent = "Finding the story...";
  modalBody.appendChild(loading);

  fetch("https://en.wikipedia.org/api/rest_v1/page/summary/" +
      encodeURIComponent(name))
    .then(function (response) {
      if (!response.ok) {
        throw new Error("no story");
      }
      return response.json();
    })
    .then(function (json) {
      if (!json || !json.extract) {
        throw new Error("no story");
      }
      modalBody.innerHTML = "";
      if (json.thumbnail && json.thumbnail.source) {
        const img = document.createElement("img");
        img.className = "story-thumb";
        img.src = json.thumbnail.source;
        img.alt = "";
        modalBody.appendChild(img);
      }
      const heading = document.createElement("h3");
      heading.textContent = json.title || name;
      modalBody.appendChild(heading);
      const text = document.createElement("p");
      text.className = "story-extract";
      text.textContent = json.extract;
      modalBody.appendChild(text);
    })
    .catch(function () {
      modalBody.innerHTML = "";
      const none = document.createElement("p");
      none.className = "message";
      none.textContent = "No story found for this artist.";
      modalBody.appendChild(none);
    });
});


// ===== 25.9 Share links (anyone can open them) =====

// Song.link turns an Audius page into one link that opens in
// whatever music app the friend has. Free, no key. When it fails,
// the plain Audius link goes to the clipboard instead.
const shareBtn = document.getElementById("shareBtn");

function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).catch(function () {
      fallbackCopy(text);
    });
    return;
  }
  fallbackCopy(text);
}

// Old-school copy for browsers where the clipboard API is blocked.
function fallbackCopy(text) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand("copy");
  } catch (error) {
    // Nothing more we can do; the note below still tells the truth.
  }
  document.body.removeChild(ta);
}

shareBtn.addEventListener("click", function () {
  const track = queue[currentIndex];
  if (!track) {
    showSkipNote("Play a song first.");
    return;
  }
  // Saved downloads and local files have no web page to share.
  if (!track.permalink) {
    showSkipNote("No share link for this song.");
    return;
  }
  const audiusUrl = "https://audius.co" + track.permalink;
  fetch("https://api.song.link/v1-alpha.1/links?url=" +
      encodeURIComponent(audiusUrl) + "&userCountry=US")
    .then(function (response) {
      if (!response.ok) {
        throw new Error("no match");
      }
      return response.json();
    })
    .then(function (json) {
      copyText((json && json.pageUrl) || audiusUrl);
      showSkipNote("Link copied. Send it to anyone.");
    })
    .catch(function () {
      copyText(audiusUrl);
      showSkipNote("Link copied. Send it to anyone.");
    });
});

// ===== 25.10 Lyric display styles =====

// Three looks for the synced line, picked right in the Lyrics view.
// The choice is remembered. Only the active line changes; the
// lyrics engine itself is untouched.
const LYRIC_STYLE_KEY = "sonara-lyric-style";
const LYRIC_STYLES = ["glow", "fade", "rise"];
let lyricStyle = "glow";
try {
  const saved = localStorage.getItem(LYRIC_STYLE_KEY);
  if (LYRIC_STYLES.indexOf(saved) !== -1) {
    lyricStyle = saved;
  }
} catch (error) {
  // Private mode: the style just starts at Glow.
}

function applyLyricStyle() {
  lyricsLines.className = "lyrics lyr-" + lyricStyle;
  document.querySelectorAll(".lyr-style-btn").forEach(function (b) {
    b.classList.toggle("active", b.dataset.style === lyricStyle);
  });
}

document.querySelectorAll(".lyr-style-btn").forEach(function (b) {
  b.addEventListener("click", function () {
    lyricStyle = b.dataset.style;
    try {
      localStorage.setItem(LYRIC_STYLE_KEY, lyricStyle);
    } catch (error) {
      // Choice lasts for this session only.
    }
    applyLyricStyle();
  });
});
applyLyricStyle();


// ===== 25.11 Smart playback: ears on the Mac itself =====

// (a) Electron only: every 3 seconds the Mac app asks macOS whether
// the system output is muted. The moment it is, while music plays,
// Sonara pauses and says why. It never resumes by itself: unmuting
// is the user's own "I'm back", and they press play when ready.
if (window.sonara && window.sonara.onSystemMuted) {
  window.sonara.onSystemMuted(function (muted) {
    if (muted && !activeAudio.paused) {
      activeAudio.pause();
      showSkipNote("Paused: your Mac is muted.");
    }
  });
}

// (b) Both platforms: when the list of audio outputs shrinks while
// music plays, the headphones (or speaker) just left. Pause and
// remember; when an output comes back, resume where we left off.
let devicePaused = false;
let lastOutputCount = -1;

async function countAudioOutputs() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter(function (d) {
      return d.kind === "audiooutput";
    }).length;
  } catch (error) {
    return -1; // counting failed: stay out of the way
  }
}

if (navigator.mediaDevices &&
    typeof navigator.mediaDevices.addEventListener === "function") {
  navigator.mediaDevices.addEventListener("devicechange", async function () {
    const now = await countAudioOutputs();
    if (now === -1 || lastOutputCount === -1) {
      if (now !== -1) {
        lastOutputCount = now;
      }
      return;
    }
    if (now < lastOutputCount && !activeAudio.paused) {
      activeAudio.pause();
      devicePaused = true;
      showSkipNote("Paused: headphones disconnected.");
    } else if (now > lastOutputCount && devicePaused) {
      devicePaused = false;
      activeAudio.play().catch(function () {
        // The browser said no (autoplay rules): the user presses play.
      });
      showSkipNote("Headphones back. Resuming.");
    }
    lastOutputCount = now;
  });
  countAudioOutputs().then(function (n) {
    if (n !== -1) {
      lastOutputCount = n;
    }
  });
}


// ---------- 26. v0.5: 9 new features (step 4) ----------

// A second wave borrowed from the famous music apps, rebuilt for a free
// app with no login and no server: Spotify (Daylist, Smart Shuffle,
// folders, DJ voice, Hide), YouTube Music (Offline Mixtape, Discover
// Mix, Recap), JioSaavn (language charts). Plain JavaScript, zero new
// dependencies, comments on every section.


// ===== 26.0 Shared handles and helpers =====

const chartsView = document.getElementById("chartsView");
const chartPills = document.getElementById("chartPills");
const chartsGrid = document.getElementById("chartsGrid");
const chartsMessage = document.getElementById("chartsMessage");
const folderNav = document.getElementById("folderNav");
const newFolderBtn = document.getElementById("newFolderBtn");
const folderNew = document.getElementById("folderNew");
const folderNameInput = document.getElementById("folderNameInput");
const folderMoveBtn = document.getElementById("folderMoveBtn");
const folderMenu = document.getElementById("folderMenu");
const mixtapeBtn = document.getElementById("mixtapeBtn");
const mixtapeStatus = document.getElementById("mixtapeStatus");
const shuffleBtn = document.getElementById("shuffleBtn");
const smartShuffleBtn = document.getElementById("smartShuffleBtn");

// The two virtual auto-mixes from this step.
function isVirtualMixId(id) {
  return id === "daylist" || id === "discover";
}


// ===== 26.1 Daylist (Spotify-style, rebuilt from your own data) =====

// A playlist that changes with the time of day. The scoring is honest:
// your play counts, your likes, and each track's real BPM against the
// daypart's tempo. Nothing is faked.
const DAYLIST_KEY = "sonara-daylist";
const DAYPARTS = [
  { id: "morning", name: "Morning Calm", start: 5, end: 11, bpmMax: 100 },
  { id: "midday", name: "Midday Focus", start: 11, end: 16, bpmMin: 90, bpmMax: 125 },
  { id: "evening", name: "Evening Energy", start: 16, end: 21, bpmMin: 115 },
  { id: "night", name: "Night Unwind", start: 21, end: 29, bpmMax: 95 }
];

function currentDaypart() {
  const h = new Date().getHours();
  for (let i = 0; i < DAYPARTS.length; i++) {
    const p = DAYPARTS[i];
    const inside = p.end <= 24
      ? (h >= p.start && h < p.end)
      : (h >= p.start || h < p.end - 24);
    if (inside) {
      return p;
    }
  }
  return DAYPARTS[3];
}

function loadDaylist() {
  try {
    const raw = localStorage.getItem(DAYLIST_KEY);
    const dl = raw ? JSON.parse(raw) : null;
    if (dl && dl.daypart && Array.isArray(dl.tracks)) {
      return dl;
    }
  } catch (error) {
    // Corrupt entry: fall through to an empty one.
  }
  return { daypart: "", label: "", builtAt: 0, tracks: [] };
}

function saveDaylist(dl) {
  try {
    localStorage.setItem(DAYLIST_KEY, JSON.stringify(dl));
  } catch (error) {
    // Storage full or blocked: the daylist simply does not persist.
  }
}

// Tiny seeded random so a daypart's order feels made, not reshuffled
// on every open.
function seededRandom(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function daypartScore(track, stats, part) {
  let score = 0;
  const id = String(track.id);
  if (stats[id]) {
    score += stats[id].plays * 2;
  }
  for (let i = 0; i < likedTracks.length; i++) {
    if (String(likedTracks[i].id) === id) {
      score += 3;
      break;
    }
  }
  const bpm = parseInt(track.bpm, 10);
  if (bpm > 0) {
    const fitsMin = !part.bpmMin || bpm >= part.bpmMin - 10;
    const fitsMax = !part.bpmMax || bpm <= part.bpmMax + 10;
    score += (fitsMin && fitsMax) ? 2 : -1;
  }
  return score;
}

function buildDaylist() {
  const part = currentDaypart();
  const stats = loadStats();
  const seen = {};
  const scored = [];
  const recentIds = {};
  loadRecent().forEach(function (t) {
    recentIds[String(t.id)] = true;
  });

  function consider(track) {
    const id = String(track.id);
    if (!id || seen[id] || recentIds[id] || isHiddenId(track.id)) {
      return;
    }
    seen[id] = true;
    scored.push({
      track: trackSummary(track),
      score: daypartScore(track, stats, part)
    });
  }
  likedTracks.forEach(consider);
  trendingTracks.forEach(consider);

  scored.sort(function (a, b) {
    return b.score - a.score;
  });
  const picks = scored.slice(0, 30).map(function (s) {
    return s.track;
  });
  // Stable order per daypart: same morning, same list.
  const rand = seededRandom(part.start * 100 + new Date().getDate());
  for (let i = picks.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = picks[i];
    picks[i] = picks[j];
    picks[j] = tmp;
  }
  return {
    daypart: part.id,
    label: part.name,
    builtAt: Date.now(),
    tracks: picks
  };
}

// Fresh when the daypart changed, when empty, or when older than 6h.
function getDaylist() {
  const part = currentDaypart();
  const dl = loadDaylist();
  if (!dl.tracks.length || dl.daypart !== part.id ||
      Date.now() - dl.builtAt > 6 * 3600 * 1000) {
    const fresh = buildDaylist();
    // Only stamp the build time when we actually found songs, so an
    // early empty build (trending not loaded yet) retries next time.
    if (fresh.tracks.length > 0) {
      saveDaylist(fresh);
    }
    return fresh;
  }
  return dl;
}


// ===== 26.2 Smart Shuffle (Spotify-style, suggestions included) =====

// Plain shuffle keeps the current song first and mixes the rest.
// Smart shuffle additionally slips a recommended song in about every
// four tracks, marked "Suggested" so it never feels sneaky.
let smartShuffleOn = false;
try {
  smartShuffleOn = localStorage.getItem("sonara-smart-shuffle") === "1";
} catch (error) {
  // Private mode: the toggle just works for this session.
}

// Your three most-liked genres, for suggestion picks.
function likedGenres() {
  const counts = {};
  likedTracks.forEach(function (t) {
    if (t.genre) {
      counts[t.genre] = (counts[t.genre] || 0) + 1;
    }
  });
  return Object.keys(counts).sort(function (a, b) {
    return counts[b] - counts[a];
  }).slice(0, 3);
}

// One recommended track: trending, in a liked genre, not hidden, not
// played lately, not already queued.
function pickSuggested(queuedIds) {
  if (trendingTracks.length === 0) {
    return null;
  }
  const genres = likedGenres();
  const recentIds = {};
  loadRecent().forEach(function (t) {
    recentIds[String(t.id)] = true;
  });
  const pool = trendingTracks.filter(function (t) {
    const id = String(t.id);
    return !queuedIds[id] && !recentIds[id] && !isHiddenId(t.id) &&
      (genres.length === 0 || genres.indexOf(t.genre) !== -1);
  });
  if (pool.length === 0) {
    return null;
  }
  const pick = pool[Math.floor(Math.random() * pool.length)];
  const summary = trackSummary(pick);
  summary._suggested = true; // transient flag for the "Suggested" tag
  return summary;
}

function shuffleQueue() {
  if (queue.length < 2) {
    showSkipNote("Not enough songs to shuffle.");
    return;
  }
  const current = queue[currentIndex];
  const rest = [];
  for (let i = 0; i < queue.length; i++) {
    if (i !== currentIndex) {
      rest.push(queue[i]);
    }
  }
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = rest[i];
    rest[i] = rest[j];
    rest[j] = tmp;
  }
  let out = [current].concat(rest);
  if (smartShuffleOn) {
    const withSuggestions = [];
    const queuedIds = {};
    out.forEach(function (t) {
      queuedIds[String(t.id)] = true;
    });
    let sinceSuggestion = 0;
    out.forEach(function (t) {
      withSuggestions.push(t);
      sinceSuggestion++;
      if (sinceSuggestion >= 4) {
        const s = pickSuggested(queuedIds);
        if (s) {
          withSuggestions.push(s);
          queuedIds[String(s.id)] = true;
        }
        sinceSuggestion = 0;
      }
    });
    out = withSuggestions;
  }
  queue = out;
  currentIndex = 0;
  renderQueue();
  showSkipNote(smartShuffleOn
    ? "Shuffled, with a few suggestions mixed in."
    : "Queue shuffled.");
}

function applySmartShuffleBtn() {
  smartShuffleBtn.textContent = "Smart shuffle: " + (smartShuffleOn ? "on" : "off");
  smartShuffleBtn.setAttribute("aria-pressed", smartShuffleOn ? "true" : "false");
}

shuffleBtn.addEventListener("click", shuffleQueue);
smartShuffleBtn.addEventListener("click", function () {
  smartShuffleOn = !smartShuffleOn;
  try {
    localStorage.setItem("sonara-smart-shuffle", smartShuffleOn ? "1" : "0");
  } catch (error) {
    // Session-only then.
  }
  applySmartShuffleBtn();
  showSkipNote(smartShuffleOn
    ? "Smart shuffle on: suggestions will join the mix."
    : "Smart shuffle off.");
});
applySmartShuffleBtn();


// ===== 26.3 Playlist folders (Spotify-style organization) =====

// Folders group playlists in the sidebar. Moving a playlist into a
// folder never deletes or changes it; only its shelf changes.
const FOLDERS_KEY = "sonara-folders";
const folderOpen = {}; // in-memory expand state, collapsed by default

function loadFolders() {
  try {
    const raw = localStorage.getItem(FOLDERS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch (error) {
    return [];
  }
}

function saveFolders(folders) {
  try {
    localStorage.setItem(FOLDERS_KEY, JSON.stringify(folders));
  } catch (error) {
    // Session-only then.
  }
}

function isPlaylistFiled(pid) {
  return loadFolders().some(function (f) {
    return f.playlistIds.indexOf(pid) !== -1;
  });
}

function folderOfPlaylist(pid) {
  const folders = loadFolders();
  for (let i = 0; i < folders.length; i++) {
    if (folders[i].playlistIds.indexOf(pid) !== -1) {
      return folders[i];
    }
  }
  return null;
}

function renderFolderNav() {
  folderNav.innerHTML = "";
  loadFolders().forEach(function (f) {
    const members = f.playlistIds.map(findPlaylist).filter(function (p) {
      return !!p;
    });
    const row = document.createElement("button");
    row.className = "nav-btn folder-row";
    const caret = document.createElement("span");
    caret.className = "folder-caret";
    caret.textContent = folderOpen[f.id] ? "▾" : "▸";
    row.appendChild(caret);
    const name = document.createElement("span");
    name.textContent = f.name;
    row.appendChild(name);
    const count = document.createElement("span");
    count.className = "count";
    count.textContent = members.length;
    row.appendChild(count);
    row.setAttribute("aria-label", "Folder " + f.name);
    row.addEventListener("click", function () {
      folderOpen[f.id] = !folderOpen[f.id];
      renderFolderNav();
    });
    folderNav.appendChild(row);

    if (folderOpen[f.id]) {
      members.forEach(function (pl) {
        const b = document.createElement("button");
        b.className = "nav-btn playlist-btn folder-item";
        b.dataset.pid = pl.id;
        const n = document.createElement("span");
        n.textContent = pl.name;
        b.appendChild(n);
        const c = document.createElement("span");
        c.className = "count";
        c.textContent = pl.tracks.length;
        b.appendChild(c);
        b.addEventListener("click", function () {
          showPlaylist(pl.id);
        });
        folderNav.appendChild(b);
      });
    }
  });
}

// New folder: the same inline pattern as new playlists.
newFolderBtn.addEventListener("click", function () {
  folderNew.hidden = false;
  folderNameInput.value = "";
  folderNameInput.focus();
});

folderNameInput.addEventListener("keydown", function (event) {
  if (event.key === "Enter") {
    const name = folderNameInput.value.trim();
    if (name) {
      const folders = loadFolders();
      folders.push({ id: "f" + Date.now(), name: name, playlistIds: [] });
      saveFolders(folders);
      folderNew.hidden = true;
      renderPlaylistNav();
      showSkipNote("Folder created.");
    }
  }
  if (event.key === "Escape") {
    folderNew.hidden = true;
  }
});

function movePlaylistToFolder(pid, folderId) {
  const folders = loadFolders();
  folders.forEach(function (f) {
    f.playlistIds = f.playlistIds.filter(function (x) {
      return x !== pid;
    });
    if (folderId && f.id === folderId) {
      f.playlistIds.push(pid);
    }
  });
  saveFolders(folders);
  renderPlaylistNav();
  showSkipNote(folderId ? "Moved to folder." : "Taken out of its folder.");
}

// "Move to folder" for the open playlist. Virtual playlists never
// show this button (hidden in their render paths).
folderMoveBtn.addEventListener("click", function (event) {
  event.stopPropagation();
  const pl = findPlaylist(openPlaylistId);
  if (!pl) {
    return;
  }
  folderMenu.innerHTML = "";
  const folders = loadFolders();
  if (folders.length === 0) {
    const empty = document.createElement("div");
    empty.className = "add-menu-empty";
    empty.textContent = "No folders yet. Make one with the + next to Folders.";
    folderMenu.appendChild(empty);
  }
  folders.forEach(function (f) {
    const item = document.createElement("button");
    item.className = "add-menu-item";
    item.textContent = f.name;
    item.addEventListener("click", function () {
      movePlaylistToFolder(pl.id, f.id);
      folderMenu.hidden = true;
    });
    folderMenu.appendChild(item);
  });
  const filed = folderOfPlaylist(pl.id);
  if (filed) {
    const out = document.createElement("button");
    out.className = "add-menu-item";
    out.textContent = "Remove from folder";
    out.addEventListener("click", function () {
      movePlaylistToFolder(pl.id, null);
      folderMenu.hidden = true;
    });
    folderMenu.appendChild(out);
  }
  const r = folderMoveBtn.getBoundingClientRect();
  folderMenu.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 240)) + "px";
  folderMenu.style.top = (r.bottom + 6) + "px";
  folderMenu.hidden = false;
});

document.addEventListener("click", function () {
  folderMenu.hidden = true;
});


// ===== 26.4 DJ voice (a free radio-DJ announcement) =====

// Spotify's AI DJ needs a server. Ours uses the Mac's own built-in
// voices through the browser's free speech engine: no key, no cost,
// nothing leaves the computer.
let djVoiceOn = false;
let djVoiceURI = "";
try {
  djVoiceOn = localStorage.getItem("sonara-dj-voice") === "1";
  djVoiceURI = localStorage.getItem("sonara-dj-voice-uri") || "";
} catch (error) {
  // Private mode: the toggle just works for this session.
}

let djSavedVolume = null; // [audio, audioX] volumes while ducked

function djDuck() {
  djSavedVolume = [audio.volume, audioX.volume];
  audio.volume = Math.max(0.05, audio.volume * 0.3);
  audioX.volume = Math.max(0.05, audioX.volume * 0.3);
}

function djRestore() {
  if (djSavedVolume) {
    audio.volume = djSavedVolume[0];
    audioX.volume = djSavedVolume[1];
    djSavedVolume = null;
  }
}

function djCancel() {
  if ("speechSynthesis" in window) {
    try {
      speechSynthesis.cancel();
    } catch (error) {
      // Nothing was speaking.
    }
  }
  djRestore();
}

function pickDjVoice() {
  if (!("speechSynthesis" in window)) {
    return null;
  }
  const voices = speechSynthesis.getVoices();
  for (let i = 0; i < voices.length; i++) {
    if (voices[i].voiceURI === djVoiceURI) {
      return voices[i];
    }
  }
  for (let i = 0; i < voices.length; i++) {
    if (voices[i].lang && voices[i].lang.indexOf("en") === 0) {
      return voices[i];
    }
  }
  return voices[0] || null;
}

// Called from playCurrent: one short announcement per track start,
// never over a paused player.
function djAnnounce(track) {
  if (!djVoiceOn || !("speechSynthesis" in window) || !track) {
    return;
  }
  djRestore(); // close out any previous announcement first
  djCancel();
  const u = new SpeechSynthesisUtterance(
    "Now playing: " + track.title + " by " + artistName(track));
  const voice = pickDjVoice();
  if (voice) {
    u.voice = voice;
  }
  u.onend = djRestore;
  u.onerror = djRestore;
  djDuck();
  try {
    speechSynthesis.speak(u);
  } catch (error) {
    djRestore(); // speech blocked: never leave the volume ducked
  }
}

// Pausing or a track change never leaves a voice talking.
[audio, audioX].forEach(function (el) {
  el.addEventListener("pause", djCancel);
});

// The DJ controls live in the Sound panel, next to crossfade.
function appendDjVoiceRows(menu) {
  const title = document.createElement("div");
  title.className = "sound-title";
  title.textContent = "DJ voice";
  menu.appendChild(title);

  const row = document.createElement("div");
  row.className = "xfade-row";
  const label = document.createElement("span");
  label.textContent = "Announce each track";
  const toggle = document.createElement("input");
  toggle.type = "checkbox";
  toggle.checked = djVoiceOn;
  toggle.setAttribute("aria-label", "DJ voice announcements");
  toggle.addEventListener("change", function () {
    djVoiceOn = toggle.checked;
    try {
      localStorage.setItem("sonara-dj-voice", djVoiceOn ? "1" : "0");
    } catch (error) {
      // Session-only then.
    }
    if (!djVoiceOn) {
      djCancel();
    }
  });
  row.appendChild(label);
  row.appendChild(toggle);
  menu.appendChild(row);

  const vrow = document.createElement("div");
  vrow.className = "xfade-row";
  const vlabel = document.createElement("span");
  vlabel.textContent = "Voice";
  const sel = document.createElement("select");
  sel.setAttribute("aria-label", "DJ voice choice");
  function fillVoices() {
    sel.innerHTML = "";
    const voices = ("speechSynthesis" in window)
      ? speechSynthesis.getVoices() : [];
    if (voices.length === 0) {
      const o = document.createElement("option");
      o.textContent = "Default voice";
      sel.appendChild(o);
      return;
    }
    voices.forEach(function (v) {
      const o = document.createElement("option");
      o.value = v.voiceURI;
      o.textContent = v.name + " (" + v.lang + ")";
      if (v.voiceURI === djVoiceURI) {
        o.selected = true;
      }
      sel.appendChild(o);
    });
  }
  fillVoices();
  // System voices can arrive late; refill if the menu is still open.
  if ("speechSynthesis" in window && speechSynthesis.addEventListener) {
    speechSynthesis.addEventListener("voiceschanged", fillVoices);
  }
  sel.addEventListener("change", function () {
    djVoiceURI = sel.value;
    try {
      localStorage.setItem("sonara-dj-voice-uri", djVoiceURI);
    } catch (error) {
      // Session-only then.
    }
  });
  vrow.appendChild(vlabel);
  vrow.appendChild(sel);
  menu.appendChild(vrow);

  const note = document.createElement("div");
  note.className = "dj-note";
  note.textContent = "Uses your Mac's built-in voices. Free, nothing is downloaded.";
  menu.appendChild(note);
}


// ===== 26.5 Hide song ("never play this again") =====

// Hidden ids live in localStorage "sonara-hidden". A hidden song is
// excluded from every auto surface (mixes, radio, trending, Daylist,
// Discover) but never deleted: playlists keep showing it with a quiet
// tag, and the Library's Hidden tab can bring it back.
const HIDDEN_KEY = "sonara-hidden";

function loadHidden() {
  try {
    const raw = localStorage.getItem(HIDDEN_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.map(String) : [];
  } catch (error) {
    return [];
  }
}

function saveHidden(ids) {
  try {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify(ids));
  } catch (error) {
    // Session-only then.
  }
}

function isHiddenId(id) {
  return !!hiddenSet()[String(id)];
}

// The hidden ids, cached in memory: isHiddenId runs per track on
// every render, and re-reading localStorage each time would waste it.
let hiddenCache = null;
function hiddenSet() {
  if (!hiddenCache) {
    hiddenCache = {};
    loadHidden().forEach(function (hid) {
      hiddenCache[hid] = true;
    });
  }
  return hiddenCache;
}

// Auto content always goes through this filter first.
function visibleTracks(list) {
  return list.filter(function (t) {
    return !isHiddenId(t.id);
  });
}

function hideSong(id) {
  const ids = loadHidden();
  const s = String(id);
  if (ids.indexOf(s) === -1) {
    ids.push(s);
    saveHidden(ids);
    hiddenCache = null;
  }
}

function unhideSong(id) {
  saveHidden(loadHidden().filter(function (x) {
    return x !== String(id);
  }));
  hiddenCache = null;
}

const HIDE_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 5.1A9.8 9.8 0 0112 5c5 0 9 4.5 10 7-.4 1-1.3 2.4-2.7 3.7M6.6 6.6C4.1 8 2.6 10.4 2 12c1 2.5 5 7 10 7 1.5 0 2.9-.4 4.1-1"/></svg>';

// Small hide button for rows and cards. stopPropagation keeps the
// row's own click (play) from firing underneath it.
function hideButton(track, cls) {
  const b = document.createElement("button");
  b.className = "hide-btn" + (cls ? " " + cls : "");
  const hidden = isHiddenId(track.id);
  b.classList.toggle("on", hidden);
  b.setAttribute("aria-label", hidden ? "Unhide this song" : "Hide this song");
  b.title = hidden ? "Unhide" : "Hide";
  b.innerHTML = HIDE_SVG;
  b.addEventListener("click", function (event) {
    event.stopPropagation();
    if (isHiddenId(track.id)) {
      unhideSong(track.id);
      showSkipNote("Song is back in your mixes.");
    } else {
      hideSong(track.id);
      showSkipNote("Hidden. It will stay out of your mixes and radio.");
    }
    refreshHideButtons();
  });
  return b;
}

// After a hide/unhide, re-render whatever list is on screen so the
// states update without a reload.
function refreshHideButtons() {
  if (openPlaylistId && !playlistView.hidden) {
    renderPlaylistSongs();
    return;
  }
  const active = document.querySelector("nav .nav-btn.active");
  const v = active ? active.dataset.view : null;
  if (v === "browse") {
    loadTrending();
  } else if (v === "library") {
    renderLibrary();
  }
  // Search results keep their buttons until the next search; the
  // exclusion from auto content applies immediately regardless.
}

// The Library's Hidden tab: every hidden song with an Unhide button.
function renderHiddenTab() {
  const ids = loadHidden();
  const known = {};
  likedTracks.forEach(function (t) {
    known[String(t.id)] = t;
  });
  const stats = loadStats();
  Object.keys(stats).forEach(function (k) {
    if (!known[k] && stats[k]) {
      known[k] = {
        id: stats[k].id,
        title: stats[k].title,
        artist: stats[k].artist,
        artwork: stats[k].artwork
      };
    }
  });
  libraryMessage.hidden = ids.length > 0;
  if (ids.length === 0) {
    libraryMessage.textContent =
      "Nothing hidden. Hidden songs skip your mixes and radio.";
    return;
  }
  ids.forEach(function (id) {
    const t = known[id] || { id: id, title: "A hidden song", artist: "", artwork: null };
    const row = document.createElement("div");
    row.className = "queue-row";
    const art = document.createElement("div");
    art.className = "q-art";
    const url = t.artwork ? t.artwork["150x150"] : null;
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
    title.textContent = t.title;
    text.appendChild(title);
    const artist = document.createElement("div");
    artist.className = "q-artist";
    artist.textContent = t.artist || "";
    text.appendChild(artist);
    row.appendChild(text);
    const un = document.createElement("button");
    un.className = "text-btn";
    un.textContent = "Unhide";
    un.setAttribute("aria-label", "Unhide " + t.title);
    un.addEventListener("click", function () {
      unhideSong(id);
      renderLibrary();
      showSkipNote("Song is back.");
    });
    row.appendChild(un);
    libraryList.appendChild(row);
  });
}


// ===== 26.6 Offline Mixtape (YouTube Music-style auto-downloads) =====

// A fresh ~25-song mix, rebuilt daily from music the artist allowed
// you to keep, downloaded with the step-2 machinery. The button always
// tells the truth about how much is actually on the Mac.
const MIXTAPE_KEY = "sonara-offline-mixtape";
const MIXTAPE_SIZE = 25;

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function loadMixtape() {
  try {
    const raw = localStorage.getItem(MIXTAPE_KEY);
    const m = raw ? JSON.parse(raw) : null;
    if (m && Array.isArray(m.trackIds)) {
      return m;
    }
  } catch (error) {
    // Corrupt entry: fall through to an empty one.
  }
  return { date: "", trackIds: [] };
}

function saveMixtape(m) {
  try {
    localStorage.setItem(MIXTAPE_KEY, JSON.stringify(m));
  } catch (error) {
    // Session-only then.
  }
}

// Weekly-Mix spirit, but only songs the artist let you download.
function buildMixtapeTracks() {
  const picks = [];
  const seen = {};
  function consider(t) {
    if (picks.length >= MIXTAPE_SIZE) {
      return;
    }
    const id = String(t.id);
    if (!id || seen[id] || isHiddenId(t.id)) {
      return;
    }
    // The artist's download choice is the gate, always.
    if (!canDownload(t)) {
      return;
    }
    seen[id] = true;
    picks.push(trackSummary(t));
  }
  likedTracks.forEach(consider);
  trendingTracks.forEach(consider);
  return picks;
}

function updateMixtapeBtn() {
  const m = loadMixtape();
  if (m.trackIds.length === 0) {
    mixtapeBtn.textContent = "Build Offline Mixtape";
    mixtapeStatus.hidden = true;
    return;
  }
  const done = m.trackIds.filter(function (id) {
    return isDownloaded(id);
  }).length;
  mixtapeBtn.textContent = "Refresh Mixtape";
  mixtapeStatus.hidden = false;
  mixtapeStatus.textContent = done + " of " + m.trackIds.length + " saved";
}

function buildMixtape() {
  if (!navigator.onLine) {
    showSkipNote("You are offline. Connect to build the mixtape.");
    return;
  }
  const tracks = buildMixtapeTracks();
  if (tracks.length === 0) {
    showSkipNote("No downloadable songs found yet. Play some music first.");
    return;
  }
  saveMixtape({
    date: todayStr(),
    trackIds: tracks.map(function (t) {
      return String(t.id);
    })
  });
  let n = 0;
  tracks.forEach(function (t) {
    if (!isDownloaded(t.id) && dlProgress[t.id] === undefined) {
      startDownload(t);
      n++;
    }
  });
  showSkipNote(n > 0
    ? "Downloading your Offline Mixtape: " + n + " songs."
    : "Mixtape is already fully downloaded.");
  updateMixtapeBtn();
}

// Called when the Downloaded view opens: a mixtape older than today
// rebuilds itself quietly.
function checkMixtapeFresh() {
  const m = loadMixtape();
  if (m.trackIds.length === 0) {
    updateMixtapeBtn();
    return; // never built: the button waits for its first tap
  }
  if (m.date === todayStr()) {
    updateMixtapeBtn();
    return;
  }
  if (!navigator.onLine) {
    updateMixtapeBtn();
    return;
  }
  buildMixtape();
}


// ===== 26.7 Discover Mix (weekly, only music you never played) =====

const DISCOVER_KEY = "sonara-discover-mix";
const WEEK_MS = 7 * 24 * 3600 * 1000;

function loadDiscoverMix() {
  try {
    const raw = localStorage.getItem(DISCOVER_KEY);
    const m = raw ? JSON.parse(raw) : null;
    if (m && Array.isArray(m.tracks)) {
      return m;
    }
  } catch (error) {
    // Corrupt entry: fall through to an empty one.
  }
  return { generatedAt: 0, tracks: [] };
}

function saveDiscoverMix(m) {
  try {
    localStorage.setItem(DISCOVER_KEY, JSON.stringify(m));
  } catch (error) {
    // Session-only then.
  }
}

function buildDiscoverMix() {
  const stats = loadStats();
  const played = {};
  Object.keys(stats).forEach(function (k) {
    played[String(stats[k].id)] = true;
  });
  const genres = likedGenres();
  const picks = [];
  const seen = {};
  function consider(t) {
    if (picks.length >= 30) {
      return;
    }
    const id = String(t.id);
    if (!id || seen[id] || played[id] || isHiddenId(t.id)) {
      return;
    }
    seen[id] = true;
    picks.push(trackSummary(t));
  }
  // Your genres first, then everything else trending.
  trendingTracks.forEach(function (t) {
    if (genres.indexOf(t.genre) !== -1) {
      consider(t);
    }
  });
  trendingTracks.forEach(function (t) {
    consider(t);
  });
  return { generatedAt: Date.now(), tracks: picks };
}

function getDiscoverMix() {
  const m = loadDiscoverMix();
  if (m.tracks.length === 0 || Date.now() - m.generatedAt > WEEK_MS) {
    const fresh = buildDiscoverMix();
    if (fresh.tracks.length > 0) {
      saveDiscoverMix(fresh);
    }
    return fresh;
  }
  return m;
}


// ===== Virtual playlist plumbing for Daylist + Discover =====

// Daylist and Discover Mix pin under Weekly Mix in the sidebar.
function renderMoreSpecialPlaylists() {
  playlistNav.appendChild(specialNavButton("daylist", "Daylist",
    DAYLIST_SVG, getDaylist().tracks.length));
  playlistNav.appendChild(specialNavButton("discover", "Discover Mix",
    DISCOVER_SVG, getDiscoverMix().tracks.length));
}

const DAYLIST_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="4" fill="currentColor" stroke="none"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1"/></svg>';
const DISCOVER_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M15 9l-2 5-4 1 2-5z" fill="currentColor" stroke="none"/></svg>';

// The open view for Daylist / Discover Mix. Removing a song drops it
// from the saved mix, like Weekly Mix does.
function renderDayOrDiscover() {
  const isDay = openPlaylistId === "daylist";
  const data = isDay ? getDaylist() : getDiscoverMix();
  const tracks = data.tracks;
  playlistList.innerHTML = "";
  refreshMixBtn.hidden = true;
  deletePlaylistBtn.hidden = true;
  // Virtual mixes cannot move into folders.
  folderMoveBtn.hidden = true;
  playlistTitle.textContent = isDay ? "Daylist" : "Discover Mix";
  playlistSubtitle.textContent = isDay
    ? data.label + " · made for right now"
    : "New music you have not played yet · refreshed weekly";
  if (tracks.length === 0) {
    playlistMessage.textContent = isDay
      ? "Play some music first, then your daylist appears."
      : "Play some music first, then discoveries appear.";
    playlistMessage.hidden = false;
  } else {
    playlistMessage.hidden = true;
    tracks.forEach(function (song, index) {
      playlistList.appendChild(playlistRow(
        { tracks: tracks }, song, index,
        function (i) {
          const d = isDay ? loadDaylist() : loadDiscoverMix();
          d.tracks.splice(i, 1);
          if (isDay) {
            saveDaylist(d);
          } else {
            saveDiscoverMix(d);
          }
          renderPlaylistNav();
          renderDayOrDiscover();
        }
      ));
    });
  }

  // "Download all" mirrors the other virtual playlists.
  const pending = tracks.filter(function (song) {
    return canDownload(song) && !isDownloaded(song.id) &&
      dlProgress[song.id] === undefined;
  });
  downloadAllBtn.hidden = pending.length === 0;
  downloadAllBtn.onclick = function () {
    pending.forEach(function (song) {
      startDownload(song);
    });
    showSkipNote("Downloading " + pending.length +
      (pending.length === 1 ? " song." : " songs."));
    renderDayOrDiscover();
  };
}


// ===== 26.8 Recap ("Your year", honest about the data window) =====

// Grows out of the Stats view. The caption is deliberate: listening
// stats only exist from v0.5 on, so "your year" starts today and
// fills in as you listen.
function renderRecap() {
  const stats = loadStats();
  const entries = Object.keys(stats).map(function (k) {
    return stats[k];
  }).filter(function (e) {
    return e.plays > 0;
  });
  if (entries.length === 0) {
    return;
  }
  const wrap = document.createElement("div");
  wrap.className = "recap-block";
  const h = document.createElement("h2");
  h.textContent = "Your year";
  wrap.appendChild(h);
  const cap = document.createElement("p");
  cap.className = "recap-cap";
  cap.textContent = "Since you started using Sonara.";
  wrap.appendChild(cap);

  const totalSecs = entries.reduce(function (sum, e) {
    return sum + (e.seconds || 0);
  }, 0);
  const big = document.createElement("div");
  big.className = "stat-block";
  const bigNum = document.createElement("div");
  bigNum.className = "stat-big";
  bigNum.textContent = Math.round(totalSecs / 60);
  const bigLabel = document.createElement("div");
  bigLabel.className = "stat-big-label";
  bigLabel.textContent = "minutes so far this year";
  big.appendChild(bigNum);
  big.appendChild(bigLabel);
  wrap.appendChild(big);

  wrap.appendChild(statBlock("Top songs this year",
    entries.slice().sort(function (a, b) {
      return b.plays - a.plays;
    }).slice(0, 5).map(function (e) {
      return {
        name: e.title,
        sub: e.artist,
        meta: e.plays + (e.plays === 1 ? " play" : " plays")
      };
    })));

  const byArtist = {};
  entries.forEach(function (e) {
    const a = byArtist[e.artist] || { artist: e.artist, plays: 0 };
    a.plays += e.plays;
    byArtist[e.artist] = a;
  });
  const artists = Object.keys(byArtist).map(function (k) {
    return byArtist[k];
  }).sort(function (a, b) {
    return b.plays - a.plays;
  }).slice(0, 5);
  wrap.appendChild(statBlock("Top artists this year",
    artists.map(function (a) {
      return {
        name: a.artist,
        sub: a.plays + (a.plays === 1 ? " play" : " plays"),
        meta: ""
      };
    })));

  const byGenre = {};
  entries.forEach(function (e) {
    if (e.genre) {
      byGenre[e.genre] = (byGenre[e.genre] || 0) + e.plays;
    }
  });
  const topGenre = Object.keys(byGenre).sort(function (a, b) {
    return byGenre[b] - byGenre[a];
  })[0];
  if (topGenre) {
    wrap.appendChild(statBlock("Top genre", [{
      name: topGenre,
      sub: byGenre[topGenre] + " plays",
      meta: ""
    }]));
  } else {
    const more = document.createElement("p");
    more.className = "recap-cap";
    more.textContent = "Keep listening and your top genre appears here.";
    wrap.appendChild(more);
  }

  statsBody.appendChild(wrap);
}


// ===== 26.9 Charts (genre pills, the honest version) =====

// NOTE, verified 2026-10-16 against the live Audius API: track objects
// expose NO language field (keys are genre, mood, tags, ...). Faking
// "Telugu charts" with keyword search would lie, so Charts filter by
// the real, verified `genre` field instead. Genres are filtered on
// this Mac from one trending fetch; no extra API surface is assumed.
let chartCache = null;
let chartGenre = "All";
let chartFiltered = [];

async function renderCharts() {
  chartsMessage.hidden = false;
  chartsMessage.textContent = "Loading charts...";
  try {
    if (!chartCache || Date.now() - chartCache.at > 30 * 60 * 1000) {
      const url = API_BASE + "/tracks/trending?app_name=" + APP_NAME +
        "&limit=100&time=week";
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error("bad response");
      }
      const json = await res.json();
      chartCache = {
        at: Date.now(),
        tracks: (json.data || []).filter(function (t) {
          return t && !t.is_delete;
        })
      };
    }
    const genres = [];
    chartCache.tracks.forEach(function (t) {
      if (t.genre && genres.indexOf(t.genre) === -1) {
        genres.push(t.genre);
      }
    });
    genres.sort();
    renderChartPills(["All"].concat(genres));
    renderChartGrid();
    chartsMessage.hidden = true;
  } catch (error) {
    chartsMessage.textContent =
      "Could not load charts. Check your connection and try again.";
  }
}

function renderChartPills(genres) {
  chartPills.innerHTML = "";
  genres.forEach(function (g) {
    const b = document.createElement("button");
    b.className = "chart-pill" + (g === chartGenre ? " active" : "");
    b.textContent = g;
    b.setAttribute("role", "tab");
    b.setAttribute("aria-label", "Chart genre " + g);
    b.addEventListener("click", function () {
      chartGenre = g;
      renderChartPills(genres);
      renderChartGrid();
    });
    chartPills.appendChild(b);
  });
}

function renderChartGrid() {
  let list = chartCache ? chartCache.tracks : [];
  list = visibleTracks(list);
  if (chartGenre !== "All") {
    list = list.filter(function (t) {
      return t.genre === chartGenre;
    });
  }
  chartFiltered = list;
  renderTracks(chartsGrid, chartFiltered, function (index) {
    startQueue(chartFiltered, index);
  });
}


// ===== 26.10 Wiring it all up =====

mixtapeBtn.addEventListener("click", buildMixtape);

// Keep the mixtape button honest as downloads finish.
if (window.sonara && window.sonara.onDownloadDone) {
  window.sonara.onDownloadDone(function () {
    updateMixtapeBtn();
  });
}
if (window.sonara && window.sonara.onDownloadProgress) {
  window.sonara.onDownloadProgress(function () {
    updateMixtapeBtn();
  });
}
updateMixtapeBtn();


// ---------- 27. v0.6: language shelves on the home page ----------

// The Audius API has no language field (verified 2026-10-16), so each
// shelf is a keyword search, ranked by real play counts. The most
// played tracks float up; keyword false positives sink. Shelf titles
// name the language only and promise nothing more.
const LANG_SHELVES = [
  { query: "telugu", title: "Telugu Hits" },
  { query: "hindi", title: "Hindi Hits" },
  { query: "punjabi", title: "Punjabi Hits" },
  { query: "tamil", title: "Tamil Hits" },
  { query: "bhojpuri", title: "Bhojpuri Hits" },
  { query: "bengali", title: "Bengali Hits" },
  { query: "marathi", title: "Marathi Hits" }
];
const langShelves = document.getElementById("langShelves");
// Every loadTrending run bumps this; late responses from an older run
// are dropped so shelves never duplicate (e.g. after hide/unhide).
let shelfGen = 0;

function loadLanguageShelves() {
  const gen = ++shelfGen;
  langShelves.innerHTML = "";
  // Each shelf resolves on its own; a slow or failed language never
  // blocks the others, and the trending grid painted long before this.
  LANG_SHELVES.forEach(function (shelf) {
    fetch(API_BASE + "/tracks/search?query=" +
        encodeURIComponent(shelf.query) +
        "&limit=30&app_name=" + APP_NAME)
      .then(function (res) {
        if (!res.ok) {
          throw new Error("bad response");
        }
        return res.json();
      })
      .then(function (json) {
        if (gen !== shelfGen) {
          return; // a newer load started; drop this stale shelf
        }
        const tracks = visibleTracks(json.data || [])
          .sort(function (a, b) {
            return (b.play_count || 0) - (a.play_count || 0);
          })
          .slice(0, 10);
        if (tracks.length === 0) {
          return; // silent hide: no shelf for this language
        }
        renderLangShelf(shelf.title, tracks);
      })
      .catch(function () {
        // Silent: the shelf simply does not appear.
      });
  });
}

function renderLangShelf(title, tracks) {
  const wrap = document.createElement("section");
  wrap.className = "lang-shelf";
  const h = document.createElement("h2");
  h.textContent = title;
  wrap.appendChild(h);
  const row = document.createElement("div");
  row.className = "shelf-row";
  tracks.forEach(function (track, index) {
    row.appendChild(trackCard(track, index, function (i) {
      startQueue(tracks, i);
    }));
  });
  wrap.appendChild(row);
  langShelves.appendChild(wrap);
}


// ---------- 28. v0.6: albums (Spotify-style album pages) ----------

// Audius marks real albums with is_album=true on playlists. Search
// rarely surfaces them, but /v1/users/{id}/albums does, so "New
// Albums" is built from the artists behind today's trending tracks.
// The list is cached for a day; albums are the artist's own releases.
let albumCache = null;
let albumCacheAt = 0;
const ALBUM_CACHE_MS = 24 * 3600 * 1000;
const albumView = document.getElementById("albumView");
const albumBack = document.getElementById("albumBack");
const albumArt = document.getElementById("albumArt");
const albumTitle = document.getElementById("albumTitle");
const albumArtist = document.getElementById("albumArtist");
const albumPlay = document.getElementById("albumPlay");
const albumList = document.getElementById("albumList");
const albumMessage = document.getElementById("albumMessage");
let openAlbum = null;   // the album object on screen
let openAlbumTracks = []; // its resolved tracks, in order
let albumLoadToken = 0; // drops late responses if another album opens

function discoverAlbums() {
  const gen = shelfGen;
  if (albumCache && Date.now() - albumCacheAt < ALBUM_CACHE_MS) {
    renderAlbumShelf(albumCache, gen);
    return;
  }
  // Unique artists from trending, a dozen at most. Each artist's
  // albums resolve independently; the shelf appears with whatever
  // arrived, up to ten albums.
  const seen = {};
  const artists = [];
  trendingTracks.forEach(function (t) {
    const uid = t.user_id || (t.user && t.user.id);
    if (uid && !seen[uid]) {
      seen[uid] = true;
      artists.push(uid);
    }
  });
  const found = [];
  let pending = 0;
  artists.slice(0, 12).forEach(function (uid) {
    pending++;
    fetch(API_BASE + "/users/" + uid + "/albums?limit=10&app_name=" +
        APP_NAME)
      .then(function (res) {
        return res.ok ? res.json() : null;
      })
      .then(function (json) {
        (json && json.data || []).forEach(function (a) {
          if (a && a.is_album === true && found.length < 10 &&
              !found.some(function (x) { return x.id === a.id; })) {
            found.push(a);
          }
        });
      })
      .catch(function () {
        // One artist failing never blocks the shelf.
      })
      .then(function () {
        pending--;
        if (pending === 0) {
          albumCache = found;
          albumCacheAt = Date.now();
          renderAlbumShelf(found, gen);
        }
      });
  });
  if (artists.length === 0) {
    renderAlbumShelf([], gen);
  }
}

function renderAlbumShelf(albums, gen) {
  // The shelf lives with the language shelves, first among them.
  if (gen !== shelfGen) {
    return; // a newer load started; drop this stale shelf
  }
  if (!albums || albums.length === 0) {
    return; // silent hide, like the language shelves
  }
  const wrap = document.createElement("section");
  wrap.className = "lang-shelf";
  const h = document.createElement("h2");
  h.textContent = "New Albums";
  wrap.appendChild(h);
  const row = document.createElement("div");
  row.className = "shelf-row";
  albums.forEach(function (album) {
    row.appendChild(albumCard(album));
  });
  wrap.appendChild(row);
  langShelves.insertBefore(wrap, langShelves.firstChild);
}

// One album card: cover, name, artist. Tapping opens the album page.
function albumCard(album) {
  const card = document.createElement("article");
  card.className = "card";
  card.tabIndex = 0;
  const art = document.createElement("div");
  art.className = "artwork";
  const url = album.artwork ? album.artwork["480x480"] : null;
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
  card.appendChild(art);
  const title = document.createElement("div");
  title.className = "card-title";
  title.textContent = album.playlist_name || "Untitled album";
  card.appendChild(title);
  const artist = document.createElement("div");
  artist.className = "card-artist";
  const u = album.user || {};
  artist.textContent = u.name || u.handle || "Unknown artist";
  card.appendChild(artist);
  function open() {
    openAlbumView(album);
  }
  card.addEventListener("click", open);
  card.addEventListener("keydown", function (event) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      open();
    }
  });
  return card;
}

// The dedicated album page: big cover, name, artist, tracks in order.
function openAlbumView(album) {
  openAlbum = album;
  openAlbumTracks = [];
  const token = ++albumLoadToken;
  const u = album.user || {};
  // Title first: showView replays the headline reveal on the new name.
  albumTitle.textContent = album.playlist_name || "Untitled album";
  albumArtist.textContent = u.name || u.handle || "Unknown artist";
  showView("album");
  albumArt.innerHTML = "";
  const url = album.artwork ? album.artwork["480x480"] : null;
  if (url) {
    const img = document.createElement("img");
    img.src = url;
    img.alt = "";
    img.onerror = function () {
      albumArt.innerHTML = "";
      albumArt.appendChild(noteIcon());
    };
    albumArt.appendChild(img);
  } else {
    albumArt.appendChild(noteIcon());
  }
  albumList.innerHTML = "";
  albumMessage.hidden = false;
  albumMessage.textContent = "Loading tracks...";
  const ids = (album.playlist_contents || [])
    .map(function (c) { return c && c.track_id; })
    .filter(function (id) { return !!id; });
  fetchAlbumTracks(ids).then(function (tracks) {
    if (token !== albumLoadToken) {
      return; // the user opened another album meanwhile
    }
    openAlbumTracks = visibleTracks(tracks);
    albumMessage.hidden = openAlbumTracks.length > 0;
    if (openAlbumTracks.length === 0) {
      albumMessage.textContent = "No playable tracks on this album.";
      return;
    }
    openAlbumTracks.forEach(function (track, index) {
      albumList.appendChild(albumTrackRow(track, index));
    });
  });
}

// Resolves track ids to full track objects, in order. Four fetches run
// at once; one bad track is skipped, never breaking the album.
function fetchAlbumTracks(ids) {
  return new Promise(function (resolve) {
    if (ids.length === 0) {
      resolve([]);
      return;
    }
    const out = new Array(ids.length);
    let finished = 0;
    let next = 0;
    function worker() {
      if (next >= ids.length) {
        return;
      }
      const idx = next++;
      fetch(API_BASE + "/tracks/" + ids[idx] + "?app_name=" + APP_NAME)
        .then(function (res) {
          return res.ok ? res.json() : null;
        })
        .then(function (json) {
          out[idx] = json && json.data ? json.data : null;
        })
        .catch(function () {
          out[idx] = null;
        })
        .then(function () {
          finished++;
          if (finished === ids.length) {
            resolve(out.filter(function (t) { return !!t; }));
          } else {
            worker();
          }
        });
    }
    const workers = Math.min(4, ids.length);
    for (let w = 0; w < workers; w++) {
      worker();
    }
  });
}

// One row in the album's track list. Tapping plays the album from here.
function albumTrackRow(track, index) {
  const row = document.createElement("div");
  row.className = "queue-row";
  row.tabIndex = 0;
  row.setAttribute("role", "button");
  const num = document.createElement("div");
  num.className = "album-num";
  num.textContent = String(index + 1);
  row.appendChild(num);
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
  const dlBtn = downloadButton(track, "dl-btn");
  if (dlBtn) {
    row.appendChild(dlBtn);
  }
  row.appendChild(likeButton(track, "like-btn"));
  function play() {
    startQueue(openAlbumTracks, index);
  }
  row.addEventListener("click", play);
  row.addEventListener("keydown", function (event) {
    if (event.target !== row) {
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      play();
    }
  });
  return row;
}

albumBack.addEventListener("click", function () {
  showView("browse");
});

albumPlay.addEventListener("click", function () {
  if (openAlbumTracks.length > 0) {
    startQueue(openAlbumTracks, 0);
  }
});


// ---------- 10. Start the app ----------

audio.volume = 0.8;
renderPlaylistNav();
loadTrending();
