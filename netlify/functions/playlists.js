const YTMusic = require("ytmusic-api").default;

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

async function getYTMusic() {
  if (!ytmusic) {
    ytmusic = new YTMusic();
    await ytmusic.initialize();
  }
  return ytmusic;
}

async function fetchMoodPlaylists(mood, limit = 10) {
  try {
    const yt = await getYTMusic();
    const targetMood = MOOD_CATEGORIES[mood.toLowerCase()] || mood;

    // Search for playlists matching the mood
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
    return [];
  }
}

async function searchPlaylists(query, limit = 10) {
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
    return [];
  }
}

exports.handler = async (event) => {
  const params = event.queryStringParameters || {};
  const action = params.action || "moods";

  let limit = 10;
  try {
    limit = Math.min(50, Math.max(1, parseInt(params.limit || "10")));
  } catch (e) {
    limit = 10;
  }

  let result = {};

  try {
    if (action === "moods") {
      result = { moods: AVAILABLE_MOODS };
    } else if (action === "debug") {
      // Debug endpoint to see raw API response format
      const yt = await getYTMusic();
      const rawResults = await yt.searchPlaylists("party music");
      result = {
        raw: rawResults.slice(0, 2),
        keys: rawResults.length > 0 ? Object.keys(rawResults[0]) : []
      };
    } else if (action === "browse") {
      const mood = params.mood || "party";
      const playlists = await fetchMoodPlaylists(mood, limit);
      result = { playlists };
    } else if (action === "search") {
      const query = params.query || params.q || "";
      if (!query) {
        result = { error: "Missing query parameter" };
      } else {
        const playlists = await searchPlaylists(query, limit);
        result = { playlists };
      }
    } else {
      result = { error: "Unknown action" };
    }
  } catch (error) {
    result = { error: error.message };
  }

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    },
    body: JSON.stringify(result)
  };
};
