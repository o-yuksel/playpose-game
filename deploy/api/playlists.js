const YTMusic = require("ytmusic-api");

const MOOD_CATEGORIES = {
  party: "party",
  workout: "workout",
  relax: "chill",
  focus: "focus",
  sleep: "sleep",
  romance: "romance",
  sad: "sad",
  energize: "energy"
};

const AVAILABLE_MOODS = ["party", "workout", "relax", "focus", "sleep", "romance", "sad", "energize"];

let ytmusic = null;
let lastInitTime = 0;
const MAX_CLIENT_AGE = 4 * 60 * 1000; // Reinitialize after 4 minutes

async function getYTMusic(forceReinit = false) {
  const now = Date.now();
  const isStale = (now - lastInitTime) > MAX_CLIENT_AGE;

  if (!ytmusic || forceReinit || isStale) {
    ytmusic = new YTMusic();
    await ytmusic.initialize();
    lastInitTime = now;
  }
  return ytmusic;
}

async function fetchMoodPlaylists(mood, limit = 10, retry = true) {
  try {
    const yt = await getYTMusic();
    const targetMood = MOOD_CATEGORIES[mood.toLowerCase()] || mood;
    const results = await yt.searchPlaylists(targetMood + " music");

    const playlists = results.slice(0, limit).map(item => ({
      id: item.playlistId || item.browseId || item.id,
      title: item.name || item.title || "Unknown",
      description: item.artist?.name || item.subtitle || "",
      thumbnail: item.thumbnails?.[0]?.url || item.thumbnail || "",
      url: `https://www.youtube.com/playlist?list=${item.playlistId || item.browseId || item.id}`
    })).filter(p => p.id && p.id !== "null" && p.id !== "None" && p.id !== "undefined");

    return playlists.length > 0 ? playlists : [];
  } catch (error) {
    console.error("Error fetching mood playlists:", error);
    if (retry) {
      console.log("Retrying with fresh client...");
      await getYTMusic(true);
      return fetchMoodPlaylists(mood, limit, false);
    }
    return [];
  }
}

async function searchPlaylists(query, limit = 10, retry = true) {
  try {
    const yt = await getYTMusic();
    const results = await yt.searchPlaylists(query);

    const playlists = results.slice(0, limit).map(item => ({
      id: item.playlistId || item.browseId || item.id,
      title: item.name || item.title || "Unknown",
      description: item.artist?.name || item.subtitle || "",
      thumbnail: item.thumbnails?.[0]?.url || item.thumbnail || "",
      url: `https://www.youtube.com/playlist?list=${item.playlistId || item.browseId || item.id}`
    })).filter(p => p.id && p.id !== "null" && p.id !== "None" && p.id !== "undefined");

    return playlists.length > 0 ? playlists : [];
  } catch (error) {
    console.error("Error searching playlists:", error);
    if (retry) {
      console.log("Retrying with fresh client...");
      await getYTMusic(true);
      return searchPlaylists(query, limit, false);
    }
    return [];
  }
}

module.exports = async (req, res) => {
  const { action = "moods", mood, query, q, limit: limitParam } = req.query;

  let limit = 10;
  try {
    limit = Math.min(50, Math.max(1, parseInt(limitParam || "10")));
  } catch (e) {
    limit = 10;
  }

  let result = {};

  try {
    if (action === "moods") {
      result = { moods: AVAILABLE_MOODS };
    } else if (action === "browse") {
      const playlists = await fetchMoodPlaylists(mood || "party", limit);
      result = { playlists };
    } else if (action === "search") {
      const searchQuery = query || q || "";
      if (!searchQuery) {
        result = { error: "Missing query parameter" };
      } else {
        const playlists = await searchPlaylists(searchQuery, limit);
        result = { playlists };
      }
    } else {
      result = { error: "Unknown action" };
    }
  } catch (error) {
    result = { error: error.message };
  }

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");
  res.status(200).json(result);
};
