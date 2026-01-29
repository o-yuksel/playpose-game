/**
 * Play & Pose - Playlist API Tests
 * Documents required validation for deploy/api/playlists.js (Vercel)
 */

const fs = require('fs');
const path = require('path');

describe('Playlist ID Validation', () => {
    test('playlists.js should filter out invalid playlist IDs', () => {
        // Read the Vercel API source to verify validation exists
        const jsPath = path.join(__dirname, '..', 'deploy', 'api', 'playlists.js');
        const jsSource = fs.readFileSync(jsPath, 'utf8');

        // The JS code SHOULD filter out invalid playlist IDs (null, "null", "None", "undefined")
        expect(jsSource).toContain('.filter(p => p.id');
        expect(jsSource).toContain('!== "null"');
        expect(jsSource).toContain('!== "None"');
    });
});
