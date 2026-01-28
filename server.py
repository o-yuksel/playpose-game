"""
Local development server for Play · Pose.
Serves static files and handles the playlist API.
"""

from http.server import HTTPServer, SimpleHTTPRequestHandler
import json
import os
from urllib.parse import parse_qs, urlparse

# Try to import ytmusicapi
try:
    from ytmusicapi import YTMusic
    YTMUSIC_AVAILABLE = True
except ImportError:
    YTMUSIC_AVAILABLE = False
    print("WARNING: ytmusicapi not installed. Run: pip install ytmusicapi")

ytmusic = None


def get_ytmusic():
    """Lazy initialization of YTMusic client."""
    global ytmusic
    if ytmusic is None and YTMUSIC_AVAILABLE:
        ytmusic = YTMusic()
    return ytmusic


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
    if not yt:
        return {"error": "ytmusicapi not available"}

    try:
        mood_categories = yt.get_mood_categories()
        target_mood = MOOD_CATEGORIES.get(mood.lower(), mood).lower()
        playlists = []

        print(f"[API] Searching for mood: {target_mood}")
        print(f"[API] Available categories: {list(mood_categories.keys())}")

        # Try to find matching mood
        matched_params = None
        for category_name, category_items in mood_categories.items():
            for item in category_items:
                item_title = item.get("title", "").lower()
                # More flexible matching
                if target_mood in item_title or item_title in target_mood:
                    matched_params = item.get("params")
                    print(f"[API] Found match: {item.get('title')} -> {matched_params}")
                    break
            if matched_params:
                break

        # If no match, try the first category as fallback
        if not matched_params and mood_categories:
            first_category = list(mood_categories.values())[0]
            if first_category:
                matched_params = first_category[0].get("params")
                print(f"[API] Using fallback: {first_category[0].get('title')}")

        if matched_params:
            mood_playlists = yt.get_mood_playlists(matched_params)
            print(f"[API] Got {len(mood_playlists)} playlist groups")

            for playlist_group in mood_playlists:
                # Handle different response structures
                group_playlists = playlist_group.get("playlists", [])
                if not group_playlists and isinstance(playlist_group, dict):
                    # Sometimes playlists are directly in the group
                    if "playlistId" in playlist_group:
                        group_playlists = [playlist_group]

                for playlist in group_playlists:
                    if len(playlists) >= limit:
                        break
                    playlist_id = playlist.get("playlistId")
                    # Skip invalid playlist IDs
                    if not playlist_id or playlist_id == "None" or str(playlist_id).lower() in ("none", "null"):
                        continue
                    playlists.append({
                        "id": playlist_id,
                        "title": playlist.get("title", "Unknown"),
                        "description": playlist.get("description", ""),
                        "thumbnail": get_best_thumbnail(playlist.get("thumbnails", [])),
                        "url": f"https://www.youtube.com/playlist?list={playlist_id}"
                    })

        print(f"[API] Returning {len(playlists)} playlists")
        return playlists
    except Exception as e:
        print(f"[API] Error: {e}")
        import traceback
        traceback.print_exc()
        return {"error": str(e)}


def search_playlists(query: str, limit: int = 10):
    """Search for playlists by keyword."""
    yt = get_ytmusic()
    if not yt:
        return {"error": "ytmusicapi not available"}

    try:
        results = yt.search(query, filter="playlists", limit=limit)
        playlists = []

        for item in results:
            if item.get("resultType") == "playlist":
                playlist_id = item.get("playlistId")
                # Skip invalid playlist IDs
                if not playlist_id or str(playlist_id).lower() in ("none", "null"):
                    continue
                playlists.append({
                    "id": playlist_id,
                    "title": item.get("title", "Unknown"),
                    "description": item.get("description", ""),
                    "thumbnail": get_best_thumbnail(item.get("thumbnails", [])),
                    "url": f"https://www.youtube.com/playlist?list={playlist_id}"
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
    if not yt:
        return {"error": "ytmusicapi not available"}

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


class DevHandler(SimpleHTTPRequestHandler):
    """Handler that serves static files and API endpoints."""

    def do_GET(self):
        parsed = urlparse(self.path)

        # Handle API requests
        if parsed.path.startswith('/api/playlists'):
            self.handle_api(parsed)
            return

        # Serve static files
        super().do_GET()

    def handle_api(self, parsed):
        """Handle API requests."""
        params = parse_qs(parsed.query)

        action = params.get("action", ["moods"])[0]
        try:
            limit = min(50, max(1, int(params.get("limit", ["10"])[0])))
        except (ValueError, TypeError):
            limit = 10

        result = {}

        if action == "moods":
            result = {"moods": get_available_moods()}
        elif action == "browse":
            mood = params.get("mood", ["party"])[0]
            result = {"playlists": fetch_mood_playlists(mood, limit)}
        elif action == "search":
            query = params.get("q", [""])[0]
            if query:
                result = {"playlists": search_playlists(query, limit)}
            else:
                result = {"error": "Missing 'q' parameter for search"}
        else:
            result = {"error": f"Unknown action: {action}"}

        # Send response
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(result).encode())

    def log_message(self, format, *args):
        """Custom log format."""
        if '/api/' in args[0]:
            print(f"[API] {args[0]}")
        elif not any(ext in args[0] for ext in ['.js', '.css', '.ico', '.png', '.jpg']):
            print(f"[GET] {args[0]}")


def main():
    port = 8080
    server = HTTPServer(('localhost', port), DevHandler)

    print("=" * 50)
    print("  Play · Pose Dev Server")
    print("=" * 50)
    print()

    if YTMUSIC_AVAILABLE:
        print("[OK] ytmusicapi loaded - Browse feature enabled")
    else:
        print("[!!] ytmusicapi not found - Install with:")
        print("     pip install ytmusicapi")
        print()
        print("     Browse feature will show errors until installed.")

    print()
    print(f"Server running at: http://localhost:{port}")
    print(f"Open: http://localhost:{port}/index.html")
    print()
    print("Press Ctrl+C to stop")
    print("=" * 50)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")


if __name__ == "__main__":
    main()
