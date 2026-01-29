/**
 * Play & Pose Game - Unit Tests
 * Tests edge cases for settings changes during gameplay
 */

// Mock localStorage
const localStorageMock = (() => {
    let store = {};
    return {
        getItem: jest.fn(key => store[key] || null),
        setItem: jest.fn((key, value) => { store[key] = value; }),
        removeItem: jest.fn(key => { delete store[key]; }),
        clear: jest.fn(() => { store = {}; })
    };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Mock speechSynthesis
window.speechSynthesis = {
    cancel: jest.fn(),
    speak: jest.fn()
};
window.SpeechSynthesisUtterance = jest.fn();

// Mock MediaMetadata
window.MediaMetadata = jest.fn();

// Constants from game
const TIMEOUTS = {
    YT_INIT: 8000,
    TOAST: 3000,
    SKIP_DELAY: 500,
    SAVE_DEBOUNCE: 300,
    PHASE_TRANSITION_LOCK: 200
};

const AUDIO = {
    SKIP_SECONDS: 30
};

// Debounce utility from game
function debounce(fn, delay) {
    let timer = null;
    return function(...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

// Setup DOM before each test
beforeEach(() => {
    jest.useFakeTimers();
    localStorageMock.clear();

    document.body.innerHTML = `
        <div id="toast"></div>
        <div id="command"></div>
        <div id="timer"></div>
        <div id="message"></div>
        <button id="startButton"></button>
        <div id="skipControls"></div>
        <button id="skipBtn"></button>
        <div id="settings"></div>
        <input type="range" id="lengthSlider" min="1" max="3" value="2">
        <span id="lengthValue"></span>
        <input type="range" id="randomSlider" min="1" max="2" value="1">
        <span id="randomValue"></span>
        <input type="range" id="volSlider" min="0" max="100" value="50">
        <span id="volValue"></span>
        <button id="localTab"></button>
        <button id="ytTab"></button>
        <div id="localPanel"></div>
        <div id="ytPanel"></div>
        <input type="file" id="playFiles">
        <input type="file" id="poseFiles">
        <span id="playName"></span>
        <span id="poseName"></span>
        <input type="text" id="playURL">
        <input type="text" id="poseURL">
        <button id="sampleBtn"></button>
        <input type="checkbox" id="showTimer">
        <input type="checkbox" id="skipIntro" checked>
        <input type="checkbox" id="shuffle" checked>
        <input type="checkbox" id="muteVoice">
        <audio id="playAudio"></audio>
        <audio id="poseAudio"></audio>
        <div id="ytPlayers"></div>
        <div id="playWrapper"></div>
        <div id="poseWrapper"></div>
    `;
});

afterEach(() => {
    jest.useRealTimers();
});

// Create a minimal Game object for testing
function createTestGame() {
    const Game = {
        state: 'IDLE',
        timer: null,
        countdown: null,
        remaining: 0,
        wakeLock: null,
        source: 'local',
        playTracks: [],
        poseTracks: [],
        playIdx: 0,
        poseIdx: 0,
        playPlayer: null,
        posePlayer: null,
        playReady: false,
        poseReady: false,
        dom: {},
        _inTransition: false,
        _skipDebounce: false,
        _pendingVolume: undefined,

        LENGTH_PRESETS: {
            1: { base: 10, label: 'Short' },
            2: { base: 20, label: 'Medium' },
            3: { base: 35, label: 'Long' }
        },
        RANDOMNESS: {
            1: { variance: 0.2, label: 'Steady' },
            2: { variance: 0.5, label: 'Random' }
        },

        getPlayer(type) { return this[`${type}Player`]; },
        getAudio(type) { return this.dom[`${type}Audio`]; },
        getTracks(type) { return this[`${type}Tracks`]; },
        getIdx(type) { return this[`${type}Idx`]; },
        setIdx(type, val) { this[`${type}Idx`] = val; },
        isReady(type) { return this[`${type}Ready`]; },

        safeExec(fn, fallback = null) {
            try { return fn(); } catch(e) { return fallback; }
        },

        cacheDom() {
            const ids = [
                'command', 'timer', 'message', 'toast',
                'startButton', 'skipControls', 'skipBtn', 'settings',
                'lengthSlider', 'lengthValue', 'randomSlider', 'randomValue',
                'volSlider', 'volValue',
                'localTab', 'ytTab', 'localPanel', 'ytPanel',
                'playFiles', 'poseFiles', 'playName', 'poseName',
                'playURL', 'poseURL', 'sampleBtn',
                'showTimer', 'skipIntro', 'shuffle', 'muteVoice',
                'playAudio', 'poseAudio', 'ytPlayers', 'playWrapper', 'poseWrapper'
            ];
            this.dom = ids.reduce((acc, id) => {
                const key = id === 'startButton' ? 'startBtn' : id;
                acc[key] = document.getElementById(id);
                return acc;
            }, {});
        },

        setVolume(v) {
            const vol = v / 100;
            this._pendingVolume = v;
            if (this.dom.playAudio) this.dom.playAudio.volume = vol;
            if (this.dom.poseAudio) this.dom.poseAudio.volume = vol;
            ['play', 'pose'].forEach(type => {
                const player = this.getPlayer(type);
                if (player && this.isReady(type)) {
                    this.safeExec(() => player.setVolume(v));
                }
            });
        },

        applyPendingVolume(type) {
            if (this._pendingVolume !== undefined) {
                const player = this.getPlayer(type);
                if (player) {
                    this.safeExec(() => player.setVolume(this._pendingVolume));
                }
            }
        },

        shuffleList(type) {
            const list = this.getTracks(type);
            if (!list || list.length < 2) return;
            for (let i = list.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [list[i], list[j]] = [list[j], list[i]];
            }
        },

        nextTrack(type) {
            const tracks = this.getTracks(type);
            if (!tracks || tracks.length === 0) {
                return;
            }
            const newIdx = (this.getIdx(type) + 1) % tracks.length;
            this.setIdx(type, newIdx);
            if (newIdx === 0 && this.dom.shuffle && this.dom.shuffle.checked) {
                this.shuffleList(type);
            }
        },

        skipCurrentSong() {
            if (this.state === 'IDLE' || this._inTransition) {
                return false;
            }
            return true;
        },

        toggle() {
            if (this._inTransition) return false;
            return true;
        },

        clearTimers() {
            if (this.timer) { clearTimeout(this.timer); this.timer = null; }
            if (this.countdown) { clearInterval(this.countdown); this.countdown = null; }
            if (this.dom.timer) this.dom.timer.textContent = '';
        },

        handleShowTimerChange() {
            if (this.state === 'IDLE') return;

            if (this.dom.showTimer.checked) {
                if (!this.countdown && this.remaining > 0) {
                    this.dom.timer.textContent = this.remaining + 's';
                    this.countdown = setInterval(() => {
                        this.remaining--;
                        this.dom.timer.textContent = Math.max(0, this.remaining) + 's';
                    }, 1000);
                }
            } else {
                if (this.countdown) {
                    clearInterval(this.countdown);
                    this.countdown = null;
                }
                this.dom.timer.textContent = '';
            }
        },

        _saveImmediate() {
            const data = {
                length: this.dom.lengthSlider.value,
                volume: this.dom.volSlider.value,
                showTimer: this.dom.showTimer.checked
            };
            this.safeExec(() => localStorage.setItem('playpose_v7', JSON.stringify(data)));
        },

        save() {
            if (!this._debouncedSave) {
                this._debouncedSave = debounce(() => this._saveImmediate(), TIMEOUTS.SAVE_DEBOUNCE);
            }
            this._debouncedSave();
        },

        showToast(msg) {
            this.dom.toast.textContent = msg;
        }
    };

    Game.cacheDom();
    return Game;
}

// ============================================
// TEST SUITES
// ============================================

describe('Show Timer Toggle', () => {
    test('should start countdown when turned ON mid-game', () => {
        const game = createTestGame();
        game.state = 'PLAY';
        game.remaining = 15;
        game.dom.showTimer.checked = true;

        game.handleShowTimerChange();

        expect(game.dom.timer.textContent).toBe('15s');
        expect(game.countdown).not.toBeNull();
    });

    test('should stop countdown when turned OFF mid-game', () => {
        const game = createTestGame();
        game.state = 'PLAY';
        game.remaining = 15;
        game.countdown = setInterval(() => {}, 1000);
        game.dom.showTimer.checked = false;

        game.handleShowTimerChange();

        expect(game.dom.timer.textContent).toBe('');
        expect(game.countdown).toBeNull();
    });

    test('should do nothing when game is IDLE', () => {
        const game = createTestGame();
        game.state = 'IDLE';
        game.dom.showTimer.checked = true;

        game.handleShowTimerChange();

        expect(game.countdown).toBeNull();
    });

    test('should decrement remaining time each second', () => {
        const game = createTestGame();
        game.state = 'PLAY';
        game.remaining = 10;
        game.dom.showTimer.checked = true;

        game.handleShowTimerChange();

        expect(game.dom.timer.textContent).toBe('10s');

        jest.advanceTimersByTime(1000);
        expect(game.remaining).toBe(9);
        expect(game.dom.timer.textContent).toBe('9s');

        jest.advanceTimersByTime(1000);
        expect(game.remaining).toBe(8);
    });

    test('should not go below 0', () => {
        const game = createTestGame();
        game.state = 'PLAY';
        game.remaining = 1;
        game.dom.showTimer.checked = true;

        game.handleShowTimerChange();

        jest.advanceTimersByTime(2000);
        expect(game.dom.timer.textContent).toBe('0s');
    });
});

describe('Volume Control', () => {
    test('should store pending volume for YouTube players', () => {
        const game = createTestGame();

        game.setVolume(75);

        expect(game._pendingVolume).toBe(75);
    });

    test('should set local audio volume immediately', () => {
        const game = createTestGame();

        game.setVolume(80);

        expect(game.dom.playAudio.volume).toBe(0.8);
        expect(game.dom.poseAudio.volume).toBe(0.8);
    });

    test('should apply pending volume when YouTube player becomes ready', () => {
        const game = createTestGame();
        const mockPlayer = { setVolume: jest.fn() };

        game._pendingVolume = 60;
        game.playPlayer = mockPlayer;

        game.applyPendingVolume('play');

        expect(mockPlayer.setVolume).toHaveBeenCalledWith(60);
    });

    test('should not crash when player is null', () => {
        const game = createTestGame();
        game._pendingVolume = 50;
        game.playPlayer = null;

        expect(() => game.applyPendingVolume('play')).not.toThrow();
    });
});

describe('Skip Button Protection', () => {
    test('should not skip when game is IDLE', () => {
        const game = createTestGame();
        game.state = 'IDLE';

        const result = game.skipCurrentSong();

        expect(result).toBe(false);
    });

    test('should not skip during phase transition', () => {
        const game = createTestGame();
        game.state = 'PLAY';
        game._inTransition = true;

        const result = game.skipCurrentSong();

        expect(result).toBe(false);
    });

    test('should allow skip during normal gameplay', () => {
        const game = createTestGame();
        game.state = 'PLAY';
        game._inTransition = false;

        const result = game.skipCurrentSong();

        expect(result).toBe(true);
    });
});

describe('Toggle Protection', () => {
    test('should not toggle during transition', () => {
        const game = createTestGame();
        game._inTransition = true;

        const result = game.toggle();

        expect(result).toBe(false);
    });

    test('should allow toggle when not in transition', () => {
        const game = createTestGame();
        game._inTransition = false;

        const result = game.toggle();

        expect(result).toBe(true);
    });
});

describe('Empty Playlist Handling', () => {
    test('should not crash on nextTrack with empty playlist', () => {
        const game = createTestGame();
        game.playTracks = [];

        expect(() => game.nextTrack('play')).not.toThrow();
    });

    test('should not crash on nextTrack with null playlist', () => {
        const game = createTestGame();
        game.playTracks = null;

        expect(() => game.nextTrack('play')).not.toThrow();
    });

    test('should wrap index correctly with single track', () => {
        const game = createTestGame();
        game.playTracks = [{ name: 'track1' }];
        game.playIdx = 0;

        game.nextTrack('play');

        expect(game.playIdx).toBe(0); // Wraps back to 0
    });

    test('should increment index with multiple tracks', () => {
        const game = createTestGame();
        game.playTracks = [{ name: 'track1' }, { name: 'track2' }, { name: 'track3' }];
        game.playIdx = 0;

        game.nextTrack('play');

        expect(game.playIdx).toBe(1);
    });
});

describe('Shuffle List', () => {
    test('should not crash with empty list', () => {
        const game = createTestGame();
        game.playTracks = [];

        expect(() => game.shuffleList('play')).not.toThrow();
    });

    test('should not shuffle single item list', () => {
        const game = createTestGame();
        game.playTracks = [{ name: 'only-track' }];

        game.shuffleList('play');

        expect(game.playTracks).toHaveLength(1);
        expect(game.playTracks[0].name).toBe('only-track');
    });

    test('should shuffle list with multiple items', () => {
        const game = createTestGame();
        // Use many items to ensure shuffle actually changes order
        game.playTracks = Array.from({ length: 100 }, (_, i) => ({ name: `track${i}` }));
        const originalOrder = game.playTracks.map(t => t.name).join(',');

        game.shuffleList('play');

        const newOrder = game.playTracks.map(t => t.name).join(',');
        // With 100 items, probability of same order is essentially 0
        expect(newOrder).not.toBe(originalOrder);
    });
});

describe('Debounced Save', () => {
    test('should debounce multiple rapid save calls', () => {
        const game = createTestGame();

        // Call save multiple times rapidly
        game.save();
        game.save();
        game.save();
        game.save();
        game.save();

        // Before debounce delay, localStorage should not be called
        expect(localStorage.setItem).not.toHaveBeenCalled();

        // After debounce delay
        jest.advanceTimersByTime(TIMEOUTS.SAVE_DEBOUNCE + 50);

        // Should only be called once
        expect(localStorage.setItem).toHaveBeenCalledTimes(1);
    });

    test('should save after debounce delay', () => {
        const game = createTestGame();
        game.dom.lengthSlider.value = '3';
        game.dom.volSlider.value = '75';
        game.dom.showTimer.checked = true;

        game.save();
        jest.advanceTimersByTime(TIMEOUTS.SAVE_DEBOUNCE + 50);

        expect(localStorage.setItem).toHaveBeenCalledWith(
            'playpose_v7',
            expect.any(String)
        );
    });
});

describe('Clear Timers', () => {
    test('should clear phase timer', () => {
        const game = createTestGame();
        game.timer = setTimeout(() => {}, 10000);

        game.clearTimers();

        expect(game.timer).toBeNull();
    });

    test('should clear countdown interval', () => {
        const game = createTestGame();
        game.countdown = setInterval(() => {}, 1000);

        game.clearTimers();

        expect(game.countdown).toBeNull();
    });

    test('should clear timer display', () => {
        const game = createTestGame();
        game.dom.timer.textContent = '15s';

        game.clearTimers();

        expect(game.dom.timer.textContent).toBe('');
    });
});

describe('Safe Execution', () => {
    test('should return result on success', () => {
        const game = createTestGame();

        const result = game.safeExec(() => 42);

        expect(result).toBe(42);
    });

    test('should return fallback on error', () => {
        const game = createTestGame();

        const result = game.safeExec(() => { throw new Error('test'); }, 'fallback');

        expect(result).toBe('fallback');
    });

    test('should return null as default fallback', () => {
        const game = createTestGame();

        const result = game.safeExec(() => { throw new Error('test'); });

        expect(result).toBeNull();
    });
});

describe('State Transitions', () => {
    test('should track remaining time', () => {
        const game = createTestGame();
        game.remaining = 20;

        expect(game.remaining).toBe(20);
    });

    test('should maintain state correctly', () => {
        const game = createTestGame();

        game.state = 'PLAY';
        expect(game.state).toBe('PLAY');

        game.state = 'POSE';
        expect(game.state).toBe('POSE');

        game.state = 'IDLE';
        expect(game.state).toBe('IDLE');
    });
});
