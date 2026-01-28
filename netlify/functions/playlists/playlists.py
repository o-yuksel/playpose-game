"""
Netlify function to fetch YouTube Music playlists by genre/mood.
Uses ytmusicapi to access YouTube Music's curated content.
"""

import json
from ytmusicapi import YTMusic


# Initialize YTMusic (no auth needed for browsing public content)
ytmusic = None


def get_ytmusic():
    """Lazy initialization of YTMusic client."""
    global ytmusic
    if ytmusic is None:
        ytmusic = YTMusic()
    return ytmusic


# Mood/Genre mappings - YouTube Music's internal params
MOOD_CATEGORIES = {
    "workout": "Workout",
    "energize": "Energize",
    "party": "Party",
    "chill": "Chill",
    "focus": "Focus",
    "romance": "Romance",
    "sad": "Sad",
    "sleep": "Sleep",
    "kids": "Kids",
    "commute": "Commute",
}


def fetch_mood_playlists(mood: str, limit: int = 10):
    """Fetch playlists for a specific mood/genre from YouTube Music."""
    yt = get_ytmusic()

    try:
        # Get mood categories from YouTube Music
        mood_categories = yt.get_mood_categories()

        # Find the matching mood
        target_mood = MOOD_CATEGORIES.get(mood.lower(), mood)
        playlists = []

        # Search through mood categories
        for category_name, category_items in mood_categories.items():
            for item in category_items:
                if target_mood.lower() in item.get("title", "").lower():
                    # Get playlists for this mood
                    mood_playlists = yt.get_mood_playlists(item["params"])
                    for playlist_group in mood_playlists:
                        for playlist in playlist_group.get("playlists", []):
                            if len(playlists) >= limit:
                                break
                            playlists.append({
                                "id": playlist.get("playlistId"),
                                "title": playlist.get("title"),
                                "description": playlist.get("description", ""),
                                "thumbnail": get_best_thumbnail(playlist.get("thumbnails", [])),
                                "url": f"https://music.youtube.com/playlist?list={playlist.get('playlistId')}"
                            })

        return playlists

    except Exception as e:
        return {"error": str(e)}


def search_playlists(query: str, limit: int = 10):
    """Search for playlists by keyword."""
    yt = get_ytmusic()

    try:
        results = yt.search(query, filter="playlists", limit=limit)
        playlists = []

        for item in results:
            if item.get("resultType") == "playlist":
                playlists.append({
                    "id": item.get("playlistId"),
                    "title": item.get("title"),
                    "description": item.get("description", ""),
                    "thumbnail": get_best_thumbnail(item.get("thumbnails", [])),
                    "url": f"https://www.youtube.com/playlist?list={item.get('playlistId')}"
                })

        return playlists

    except Exception as e:
        return {"error": str(e)}


def get_best_thumbnail(thumbnails):
    """Get the best quality thumbnail URL."""
    if not thumbnails:
        return None
    return thumbnails[-1].get("url") if thumbnails else None


def get_available_moods():
    """Get list of available mood categories."""
    yt = get_ytmusic()

    try:
        mood_categories = yt.get_mood_categories()
        moods = []

        for category_name, category_items in mood_categories.items():
            for item in category_items:
                moods.append({
                    "title": item.get("title"),
                    "params": item.get("params")
                })

        return moods

    except Exception as e:
        return {"error": str(e)}


def handler(event, context):
    """Netlify function handler."""

    # Parse query parameters
    params = event.get("queryStringParameters") or {}

    action = params.get("action", "moods")
    try:
        limit = min(50, max(1, int(params.get("limit", "10"))))
    except (ValueError, TypeError):
        limit = 10

    result = {}

    if action == "moods":
        result = {"moods": get_available_moods()}

    elif action == "browse":
        mood = params.get("mood", "party")
        result = {"playlists": fetch_mood_playlists(mood, limit)}

    elif action == "search":
        query = params.get("q", "")
        if query:
            result = {"playlists": search_playlists(query, limit)}
        else:
            result = {"error": "Missing 'q' parameter for search"}

    else:
        result = {"error": f"Unknown action: {action}"}

    return {
        "statusCode": 200,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "s-maxage=3600, stale-while-revalidate"
        },
        "body": json.dumps(result)
    }
