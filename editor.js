var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
(function () {
    // Keys Mapping (0-12)
    const KEYS = ['e', 'd', 'r', 'f', ' ', 'u', 'j', 'i', 'k', 's', 'l', 'w', 'o'];
    const LANE_COUNT = KEYS.length;
    // DEBUG: Confirm script execution
    // alert('Editor Script Attached'); // Commented out to reduce noise, but good for first check
    // State
    const audio = new Audio();
    let recordedNotes = [];
    let layoutChanges = [];
    const activeHolds = {}; // lane -> startTime (ms)
    let isPlaying = false;
    let isRecording = false;
    // Scrolling Strings
    let isUpPressed = false;
    let isDownPressed = false;
    // Visual Editor State
    let scrollTime = 0; // Current rendered time (LERP)
    let targetScrollTime = 0; // Target time (set by Audio or Scroll)
    let zoomLevel = 1.0; // Pixels per ms (base factor)
    const BASE_PX_PER_MS = 0.2; // Adjusted for better visibility range
    const PLAYHEAD_Y = 850; // Y position of the "current time" line from top of canvas
    let snapDenominator = 16; // 1/16th beat default
    // UI Elements
    const audioInput = document.getElementById('audio-input');
    const btnPlay = document.getElementById('btn-play');
    const chkRecord = document.getElementById('chk-record');
    const btnExport = document.getElementById('btn-export');
    const txtOutput = document.getElementById('output');
    const statusDiv = document.getElementById('status');
    const bpmInput = document.getElementById('bpm');
    const offsetInput = document.getElementById('offset');
    const countdownOverlay = document.getElementById('countdown-overlay');
    // BPM Tools
    const btnTapBpm = document.getElementById('btn-tap-bpm');
    const btnBpmMinus = document.getElementById('btn-bpm-minus');
    const btnBpmPlus = document.getElementById('btn-bpm-plus');
    // Editor UI
    const editorCanvas = document.getElementById('editor-canvas');
    const ctx = editorCanvas.getContext('2d');
    const snapSelect = document.getElementById('snap-select');
    const zoomRange = document.getElementById('zoom-range');
    const chkMetronome = document.getElementById('chk-metronome');
    const syncTapCountDisp = document.getElementById('sync-tap-count');
    const btnApplySync = document.getElementById('btn-apply-sync');
    const btnResetSync = document.getElementById('btn-reset-sync');
    const chkSyncShiftNotes = document.getElementById('chk-sync-shift-notes');
    // Metronome State
    let lastMetronomeBeat = -1;
    let audioCtx = null;
    let syncTapTimes = [];
    function getAudioCtx() {
        if (!audioCtx)
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        return audioCtx;
    }
    function beep(freq = 880, duration = 0.07) {
        const actx = getAudioCtx();
        if (actx.state === 'suspended')
            actx.resume();
        const osc = actx.createOscillator();
        const gain = actx.createGain();
        osc.connect(gain);
        gain.connect(actx.destination);
        osc.frequency.value = freq;
        osc.type = 'square'; // Square is the most piercing/audible
        gain.gain.setValueAtTime(0.8, actx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + duration);
        osc.start();
        osc.stop(actx.currentTime + duration);
    }
    // --- Difficulty & Level State ---
    let currentClass = 'no';
    const levelSelect = document.getElementById('level-select');
    let currentLevel = '1';
    if (levelSelect) {
        // Populate Level Dropdown (1-21) if empty
        if (levelSelect.options.length === 0) {
            const defaultOpt = document.createElement('option');
            defaultOpt.value = '0';
            defaultOpt.textContent = 'Not Set';
            levelSelect.appendChild(defaultOpt);
            for (let i = 1; i <= 21; i++) {
                const opt = document.createElement('option');
                opt.value = i.toString();
                opt.textContent = i.toString();
                levelSelect.appendChild(opt);
            }
        }
        levelSelect.addEventListener('change', () => {
            currentLevel = levelSelect.value;
        });
    }
    if (!ctx)
        throw new Error('Canvas context not supported');
    // Audio Loading
    audioInput.addEventListener('change', () => {
        if (audioInput.files && audioInput.files[0]) {
            const file = audioInput.files[0];
            audio.src = URL.createObjectURL(file);
            statusDiv.textContent = 'Status: Audio Loaded';
        }
    });
    // Play/Pause
    const btnReset = document.getElementById('btn-reset');
    btnReset.addEventListener('click', () => {
        if (!confirm('Are you sure you want to reset all recorded notes? This cannot be undone.'))
            return;
        recordedNotes.length = 0;
        statusDiv.textContent = 'Status: Reset (0 notes)';
        txtOutput.value = '';
        if (isPlaying) {
            audio.currentTime = 0;
        }
    });
    // Song Selection Logic
    // DOM Elements (Updated)
    // const songSelect = document.getElementById('song-select') as HTMLSelectElement; // Removed
    // const btnLoadSong = document.getElementById('btn-load-song') as HTMLButtonElement; // Removed
    let songList = [];
    let flattenedSongOptions = [];
    // Load Song List
    function loadEditorSongList() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const res = yield fetch('songs/list.json');
                songList = yield res.json();
                flattenedSongOptions = [];
                const tableDiv = document.getElementById('song-table-body');
                if (tableDiv)
                    tableDiv.innerHTML = '<tr><td colspan="3">Loading...</td></tr>';
                /*
                if (songSelect) {
                    songSelect.innerHTML = '<option value="">-- Select Song --</option>';
                */
                const MODES = ['4key', '6key', '8key', '12key'];
                // Diff Keys: no=Normal, st=Standard, ad=Advanced, pr=Professional, et=Extreme
                const DIFFS = ['no', 'st', 'ad', 'pr', 'et'];
                const tableBody = document.getElementById('song-table-body');
                if (tableBody)
                    tableBody.innerHTML = '';
                songList.forEach(song => {
                    MODES.forEach(mode => {
                        DIFFS.forEach(diff => {
                            let filename = '';
                            let isLegacy = false;
                            // 1. Check for Legacy (8key / 9key) existing file
                            // The user considers existing list.json charts as "8KEY"
                            if (mode === '8key' && song.charts && song.charts[diff]) {
                                filename = song.charts[diff];
                                isLegacy = true;
                            }
                            else {
                                // 2. Generate New Filename for missing/new modes
                                // Format: {id}_{diff}_{mode}.json  (e.g. netsu_ijo_no_4k.json)
                                // Mode Abbr: 4key->4k, 6key->6k, 12key->12k, 8key->8k
                                const modeAbbr = mode.replace('key', 'k');
                                filename = `${song.folder}_${diff}_${modeAbbr}.json`;
                                // Note: song.folder might be "netsu_ijo" or "Calamity Fortune" (with spaces).
                                // Existing files seem to use song.folder name? 
                                // Actually list.json: "no": "netsu_ijo_no.json". Folder: "netsu_ijo".
                                // "knights_no.json". Folder: "knight_of_nights". 
                                // This implies filename is arbitrary in list.json.
                                // For NEW files, we should use a consistent pattern.
                                // Let's use song.id or song.folder (sanitized)? 
                                // song.id is safer "netsu_ijo". "knight_of_nights".
                                // Let's use song.id: `${song.id}_${diff}_${modeAbbr}.json`
                                // Wait, list.json has "knights_no.json" but id is "knight_of_nights".
                                // The user might prefer "knights" but I can't guess that.
                                // I will use song.id.
                                filename = `${song.id}_${diff}_${modeAbbr}.json`;
                            }
                            const label = `${song.title} (${diff.toUpperCase()}-${mode.toUpperCase()})`;
                            flattenedSongOptions.push({
                                label: label,
                                song: song,
                                filename: filename,
                                mode: mode,
                                diff: diff.toUpperCase()
                            });
                            // Create Row
                            const tr = document.createElement('tr');
                            tr.style.borderBottom = '1px solid #444';
                            tr.style.cursor = 'pointer';
                            tr.style.background = '#222';
                            tr.onmouseover = () => tr.style.background = '#333';
                            tr.onmouseout = () => tr.style.background = '#222';
                            tr.innerHTML = `
                        <td style="padding: 4px;">${song.title}</td>
                        <td style="padding: 4px;">${diff.toUpperCase()}</td>
                        <td style="padding: 4px; text-align: center; color: ${mode === '8key' ? '#e040fb' : '#00bcd4'};">${mode.toUpperCase()}</td>
                    `;
                            // Click -> Load
                            // We need to pass the INDEX of flattenedSongOptions
                            const idx = flattenedSongOptions.length - 1;
                            tr.onclick = () => loadSongByIndex(idx);
                            if (tableBody)
                                tableBody.appendChild(tr);
                        });
                    });
                });
                if (statusDiv)
                    statusDiv.textContent = `Status: Loaded ${flattenedSongOptions.length} chart options.`;
            }
            catch (e) {
                console.error('Failed to load song list', e);
                alert('Failed to load song list: ' + e);
                if (statusDiv)
                    statusDiv.textContent = 'Status: Failed to load song list.';
            }
        });
    }
    loadEditorSongList();
    function loadSongByIndex(index) {
        return __awaiter(this, void 0, void 0, function* () {
            if (isNaN(index) || !flattenedSongOptions[index]) {
                alert('Invalid song selection.');
                return;
            }
            const opt = flattenedSongOptions[index];
            const song = opt.song;
            statusDiv.textContent = `Status: Loading ${opt.label}...`;
            // Auto-set Class from selection
            if (opt.diff) {
                currentClass = opt.diff.toLowerCase();
            }
            try {
                // 1. Load Audio
                audio.src = `songs/${song.folder}/${song.audio}`;
                // 2. Load Chart
                // Use cache buster ?t=...
                const chartRes = yield fetch(`songs/${song.folder}/${opt.filename}?t=${Date.now()}`);
                if (chartRes.ok) {
                    const chartText = yield chartRes.text();
                    let text = chartText;
                    if (text.charCodeAt(0) === 0xFEFF)
                        text = text.slice(1);
                    const json = JSON.parse(text);
                    importChartJSON(json);
                    window.currentEditingFilename = opt.filename;
                    window.currentEditingFolder = song.folder;
                    statusDiv.textContent = `Status: Loaded ${opt.label}`;
                    // Import Logic (btn-import) handled globally below
                    window.currentEditingFolder = song.folder;
                    statusDiv.textContent = `Status: Loaded ${opt.label}`;
                    // Auto-set Mode Selector
                    const editorModeSelect = document.getElementById('editor-mode-select');
                    if (editorModeSelect && opt.mode) {
                        editorModeSelect.value = opt.mode;
                        // Trigger change manually to update grid
                        editorModeSelect.dispatchEvent(new Event('change'));
                    }
                }
                else {
                    // Start fresh if no chart (or missing file)
                    recordedNotes.length = 0;
                    bpmInput.value = song.bpm;
                    offsetInput.value = '0';
                    statusDiv.textContent = `Status: Created New Config for ${opt.label}`;
                    window.currentEditingFilename = opt.filename;
                    window.currentEditingFolder = song.folder;
                    // Set Mode
                    const editorModeSelect = document.getElementById('editor-mode-select');
                    if (editorModeSelect && opt.mode) {
                        editorModeSelect.value = opt.mode;
                        editorModeSelect.dispatchEvent(new Event('change'));
                    }
                }
            }
            catch (e) {
                alert('Error loading song: ' + e);
            }
        });
    }
    function importChartJSON(json) {
        try {
            const bpm = json.bpm || parseFloat(bpmInput.value) || 120;
            const offset = json.offset || 0;
            // Apply BPM/Offset
            bpmInput.value = bpm;
            offsetInput.value = offset;
            const msPerBeat = 60000 / bpm;
            // Clear existing
            recordedNotes.length = 0;
            // Import Notes
            if (Array.isArray(json.notes)) {
                json.notes.forEach((n) => {
                    const time = offset + (n.beat * msPerBeat);
                    const duration = (n.duration || 0) * msPerBeat;
                    recordedNotes.push({
                        time: time,
                        lane: n.lane,
                        duration: duration
                    });
                });
            }
            // Import Layout Changes
            layoutChanges.length = 0;
            if (Array.isArray(json.layoutChanges)) {
                json.layoutChanges.forEach((lc) => {
                    const time = offset + (lc.beat * msPerBeat);
                    layoutChanges.push({
                        time: time,
                        type: lc.type
                    });
                });
            }
            // Import Difficulty/Level
            if (json.difficulty) {
                currentClass = json.difficulty;
            }
            if (json.level !== undefined && levelSelect) {
                levelSelect.value = json.level.toString();
                currentLevel = json.level.toString();
            }
            else if (levelSelect) {
                levelSelect.value = '0';
                currentLevel = '0';
            }
            statusDiv.textContent = `Status: Loaded Chart (${recordedNotes.length} notes, ${layoutChanges.length} layout changes)`;
            alert(`Loaded ${recordedNotes.length} notes and ${layoutChanges.length} layout changes successfully!`);
            // Seek to start
            audio.currentTime = 0;
            scrollTime = 0;
        }
        catch (err) {
            alert('Error parsing JSON: ' + err);
        }
    }
    function startCountdown() {
        return new Promise((resolve) => {
            if (!countdownOverlay) {
                resolve();
                return;
            }
            countdownOverlay.style.display = 'block';
            let count = 3;
            countdownOverlay.textContent = count.toString();
            const interval = setInterval(() => {
                count--;
                if (count > 0) {
                    countdownOverlay.textContent = count.toString();
                }
                else {
                    clearInterval(interval);
                    countdownOverlay.style.display = 'none';
                    resolve();
                }
            }, 1000);
        });
    }
    btnPlay.addEventListener('click', togglePlay);
    function togglePlay() {
        if (!audio.src) {
            alert('Please load an audio file first.');
            return;
        }
        if (isPlaying) {
            // Pause immediately
            audio.pause();
            isPlaying = false;
            btnPlay.textContent = 'Play';
            statusDiv.textContent = 'Status: Paused';
            statusDiv.classList.remove('recording');
        }
        else {
            // Play Request
            if (chkRecord.checked) {
                // Start Countdown
                btnPlay.disabled = true; // Prevent double click
                startCountdown().then(() => {
                    btnPlay.disabled = false;
                    startPlayback(true);
                });
            }
            else {
                // Immediate Start
                startPlayback(false);
            }
        }
    }
    function startPlayback(recording) {
        audio.play();
        isPlaying = true;
        btnPlay.textContent = 'Pause';
        isRecording = recording;
        if (isRecording) {
            statusDiv.textContent = 'Status: RECORDING...';
            statusDiv.classList.add('recording');
        }
        else {
            statusDiv.textContent = 'Status: Playing';
            statusDiv.classList.remove('recording');
        }
    }
    // Recording Logic
    window.addEventListener('keydown', (e) => {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)
            return;
        // Navigation (Prevent default scroll)
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            isUpPressed = true;
        }
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            isDownPressed = true;
        }
        if (e.key === ' ') {
            e.preventDefault();
            // If NOT recording, Space toggles play/pause
            if (!isRecording) {
                if (!e.repeat)
                    togglePlay();
                // We still want to record a tap even if it toggles play? 
                // Maybe better to only record if isPlaying is already true.
            }
            // If Recording, fall through to note logic below...
        }
        // --- Offset Sync Tap Recording ---
        // Record ANY key press as a tap if we are currently playing.
        // This is more flexible than just the game keys.
        if (isPlaying && !e.repeat) {
            // Ignore pure modifier keys
            const modifiers = ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab', 'Escape'];
            if (!modifiers.includes(e.key)) {
                syncTapTimes.push(audio.currentTime * 1000);
                if (syncTapCountDisp)
                    syncTapCountDisp.textContent = `${syncTapTimes.length} taps`;
            }
        }
        const currentKeyIndex = KEYS.indexOf(e.key.toLowerCase());
        if (!isPlaying || !isRecording)
            return;
        if (e.repeat)
            return; // Ignore hold-repeat events
        const key = e.key.toLowerCase();
        const keyIndex = KEYS.indexOf(key);
        if (keyIndex !== -1) {
            // Start Hold
            if (activeHolds[keyIndex] === undefined) {
                activeHolds[keyIndex] = audio.currentTime * 1000;
                statusDiv.textContent = `Status: Recording... (Hold started)`;
            }
        }
        // Offset Shortcuts
        if (e.key === '[' || e.key === ']') {
            const currentOffset = parseInt(offsetInput.value) || 0;
            const step = e.shiftKey ? 1 : 5;
            const diff = e.key === '[' ? -step : step;
            const newVal = currentOffset + diff;
            offsetInput.value = newVal.toString();
            // SHIFT NOTES if enabled
            if (chkSyncShiftNotes && chkSyncShiftNotes.checked) {
                recordedNotes.forEach(note => note.time += diff);
                layoutChanges.forEach(lc => lc.time += diff);
                statusDiv.textContent = `Offset tuned: ${newVal}ms (Notes Shifted)`;
            }
            else {
                statusDiv.textContent = `Offset tuned: ${newVal}ms`;
            }
            // Trigger metronome seek reset if nudging back
            lastMetronomeBeat = -1;
        }
        if (e.key === 'Enter' && e.shiftKey) {
            e.preventDefault();
            applyOffsetSync();
        }
    });
    window.addEventListener('keyup', (e) => {
        if (e.key === 'ArrowUp')
            isUpPressed = false;
        if (e.key === 'ArrowDown')
            isDownPressed = false;
        if (!isPlaying || !isRecording)
            return;
        if (!isPlaying || !isRecording)
            return;
        const key = e.key.toLowerCase();
        const keyIndex = KEYS.indexOf(key);
        if (keyIndex !== -1) {
            // End Hold
            const startTime = activeHolds[keyIndex];
            if (startTime !== undefined) {
                const endTime = audio.currentTime * 1000;
                let duration = endTime - startTime;
                // Threshold: If < 100ms, treat as single tap (duration 0)
                if (duration < 100)
                    duration = 0;
                recordedNotes.push({
                    time: startTime,
                    lane: keyIndex,
                    duration: duration
                });
                delete activeHolds[keyIndex];
                statusDiv.textContent = `Status: RECORDING... (Notes: ${recordedNotes.length})`;
            }
        }
    });
    // Clear recording status on end
    audio.addEventListener('ended', () => {
        isPlaying = false;
        isRecording = false;
        btnPlay.textContent = 'Play';
        statusDiv.textContent = 'Status: Ended';
        statusDiv.classList.remove('recording');
        // Clear any stuck holds
        for (const k in activeHolds)
            delete activeHolds[k];
    });
    // ==========================================
    // BPM Tools Logic
    // ==========================================
    let tapTimes = [];
    if (btnTapBpm) {
        btnTapBpm.addEventListener('click', () => {
            const now = Date.now();
            // Reset if gap > 2000ms
            if (tapTimes.length > 0 && now - tapTimes[tapTimes.length - 1] > 2000) {
                tapTimes = [];
            }
            tapTimes.push(now);
            // Constant window size of 5 for average
            if (tapTimes.length > 5)
                tapTimes.shift();
            if (tapTimes.length > 1) {
                // Calculate Average Interval
                let sum = 0;
                for (let i = 1; i < tapTimes.length; i++) {
                    sum += tapTimes[i] - tapTimes[i - 1];
                }
                const avgInterval = sum / (tapTimes.length - 1);
                const bpm = 60000 / avgInterval;
                bpmInput.value = bpm.toFixed(2);
            }
        });
    }
    if (btnBpmMinus) {
        btnBpmMinus.addEventListener('click', () => {
            const val = parseFloat(bpmInput.value) || 0;
            bpmInput.value = (val - 1).toFixed(2);
        });
    }
    if (btnBpmPlus) {
        btnBpmPlus.addEventListener('click', () => {
            const val = parseFloat(bpmInput.value) || 0;
            bpmInput.value = (val + 1).toFixed(2);
        });
    }
    function applyOffsetSync() {
        if (syncTapTimes.length < 2) {
            alert('Please record at least 2 taps (by pressing keys while playing) before applying sync.');
            return;
        }
        const bpm = parseFloat(bpmInput.value) || 120;
        const currentOffset = parseInt(offsetInput.value) || 0;
        const msPerBeat = 60000 / bpm;
        let totalDeviation = 0;
        syncTapTimes.forEach(tap => {
            const n = Math.round((tap - currentOffset) / msPerBeat);
            const beatTime = currentOffset + (n * msPerBeat);
            const dev = tap - beatTime;
            totalDeviation += dev;
        });
        const avgDev = totalDeviation / syncTapTimes.length;
        const roundedDev = Math.round(avgDev);
        const newOffset = currentOffset + roundedDev;
        offsetInput.value = newOffset.toString();
        lastMetronomeBeat = -1; // Reset metronome
        // SHIFT NOTES if enabled
        if (chkSyncShiftNotes && chkSyncShiftNotes.checked) {
            recordedNotes.forEach(note => {
                note.time += roundedDev;
            });
            layoutChanges.forEach(lc => {
                lc.time += roundedDev;
            });
            statusDiv.textContent = `Offset synced: Adjusted by ${roundedDev}ms. Notes SHIFTED.`;
        }
        else {
            statusDiv.textContent = `Offset synced: Adjusted by ${roundedDev}ms. (Grid only)`;
        }
        // Clear taps
        syncTapTimes = [];
        if (syncTapCountDisp)
            syncTapCountDisp.textContent = '0 taps (Applied)';
        // Visual feedback
        statusDiv.style.backgroundColor = 'rgba(0, 255, 150, 0.3)';
        setTimeout(() => statusDiv.style.backgroundColor = '', 1000);
    }
    // Offset Sync Tool
    if (btnApplySync) {
        btnApplySync.addEventListener('click', applyOffsetSync);
    }
    if (btnResetSync) {
        btnResetSync.addEventListener('click', () => {
            syncTapTimes = [];
            if (syncTapCountDisp)
                syncTapCountDisp.textContent = '0 taps';
            statusDiv.textContent = 'Sync taps reset.';
        });
    }
    // ==========================================
    // Visual Editor Logic
    // ==========================================
    if (snapSelect) {
        snapSelect.addEventListener('change', () => {
            snapDenominator = parseInt(snapSelect.value);
        });
    }
    if (zoomRange) {
        zoomRange.addEventListener('input', () => {
            zoomLevel = parseFloat(zoomRange.value);
        });
    }
    // Note Type Logic
    const noteTypeRadios = document.getElementsByName('note-type');
    let customNoteType = 'tap';
    let pendingHold = null;
    if (noteTypeRadios) {
        noteTypeRadios.forEach(radio => {
            radio.addEventListener('change', () => {
                if (radio.checked) {
                    customNoteType = radio.value;
                    pendingHold = null;
                }
            });
        });
    }
    // Edit Layer Logic
    const editLayerRadios = document.getElementsByName('edit-layer');
    const layerSelectorContainer = document.getElementById('layer-selector-container');
    let currentEditLayer = 'white';
    if (editLayerRadios) {
        editLayerRadios.forEach(radio => {
            radio.addEventListener('change', () => {
                if (radio.checked) {
                    currentEditLayer = radio.value;
                    pendingHold = null;
                }
            });
        });
    }
    // Editor Mode Logic
    const editorModeSelect = document.getElementById('editor-mode-select');
    let editorMode = '9key';
    const visualEditorContainer = document.getElementById('visual-editor-container');
    // Default width per lane
    const LANE_WIDTH_4K = 50;
    const LANE_WIDTH_6K = 40;
    const LANE_WIDTH_8K = 40;
    const LANE_WIDTH_9K = 80; // Original
    const LANE_WIDTH_12K = 35;
    if (editorModeSelect) {
        editorModeSelect.addEventListener('change', () => {
            editorMode = editorModeSelect.value;
            pendingHold = null;
            // Update UI for mode
            let newWidth = 220;
            if (editorMode === '4key')
                newWidth = 220;
            else if (editorMode === '6key')
                newWidth = 300;
            else if (editorMode === '8key')
                newWidth = 400;
            else if (editorMode === '9key')
                newWidth = 800;
            else if (editorMode === '12key')
                newWidth = 500;
            if (visualEditorContainer)
                visualEditorContainer.style.width = `${newWidth}px`;
            editorCanvas.width = newWidth;
            calculateLaneLayout(editorCanvas.width);
            // Hide Layer Selector completely?
            // User requested it be visible in all modes
            if (layerSelectorContainer)
                layerSelectorContainer.style.display = 'block';
        });
        // Init logic
        editorModeSelect.dispatchEvent(new Event('change'));
    }
    // Import Logic
    const importInput = document.getElementById('import-input');
    if (importInput) {
        importInput.addEventListener('change', () => {
            if (importInput.files && importInput.files[0]) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    var _a;
                    try {
                        const json = JSON.parse((_a = e.target) === null || _a === void 0 ? void 0 : _a.result);
                        importChartJSON(json);
                    }
                    catch (err) {
                        alert('Error parsing JSON: ' + err);
                    }
                };
                reader.readAsText(importInput.files[0]);
            }
        });
    }
    // Interaction: Smooth Scroll to Seek
    editorCanvas.addEventListener('wheel', (e) => {
        if (isPlaying)
            return;
        e.preventDefault();
        const sensitivity = 0.5;
        // DeltaY * (1/Zoom) * SpeedFactor
        const deltaMs = e.deltaY * sensitivity * (1 / zoomLevel) * 5;
        // Update Target
        targetScrollTime = Math.max(0, Math.min((audio.duration || 100) * 1000, targetScrollTime + deltaMs));
    }, { passive: false });
    let LANE_DEFS = [];
    function calculateLaneLayout(canvasW) {
        if (!canvasW)
            canvasW = 800; // Safety fallback
        LANE_DEFS = [];
        if (editorMode === '9key') {
            // Original 9-lane logic
            const w = 80;
            const gap = 10;
            const spaceW = 120;
            let cx = 0;
            LANE_DEFS[0] = { x: cx, width: w };
            cx += w;
            LANE_DEFS[1] = { x: cx, width: w };
            cx += w;
            cx += gap;
            LANE_DEFS[2] = { x: cx, width: w };
            cx += w;
            LANE_DEFS[3] = { x: cx, width: w };
            cx += w;
            cx += gap;
            LANE_DEFS[4] = { x: cx, width: spaceW };
            cx += spaceW;
            cx += gap;
            LANE_DEFS[5] = { x: cx, width: w };
            cx += w;
            LANE_DEFS[6] = { x: cx, width: w };
            cx += w;
            cx += gap;
            LANE_DEFS[7] = { x: cx, width: w };
            cx += w;
            LANE_DEFS[8] = { x: cx, width: w };
            cx += w;
        }
        else {
            // Generic linear layout
            let totalLanes = 4;
            if (editorMode === '4key')
                totalLanes = 5; // 4 + Space
            if (editorMode === '6key')
                totalLanes = 7; // 6 + Space
            if (editorMode === '8key')
                totalLanes = 9; // 8key + Space = 9 inputs
            if (editorMode === '12key')
                totalLanes = 13; // 12 + Space
            const w = Math.floor(canvasW / totalLanes);
            for (let i = 0; i < totalLanes; i++) {
                LANE_DEFS[i] = { x: i * w, width: w };
            }
        }
    }
    // Interaction: Click to Add/Remove
    editorCanvas.addEventListener('mousedown', (e) => {
        const rect = editorCanvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        // Calculate clicked Lane
        if (!LANE_DEFS.length)
            calculateLaneLayout(editorCanvas.width);
        let clickedLane = -1;
        for (let i = 0; i < LANE_DEFS.length; i++) {
            const ld = LANE_DEFS[i];
            if (mouseX >= ld.x && mouseX < ld.x + ld.width) {
                clickedLane = i;
                break;
            }
        }
        if (clickedLane === -1)
            return; // Clicked in gap
        // Map Clicked Lane to Game Key Index
        // Map Clicked Lane to Game Key Index
        let targetKeyIndex = -1;
        if (editorMode === '9key') {
            targetKeyIndex = clickedLane;
            // d, f, j, k -> 1, 3, 6, 8. Space is 4.
            // Visual: d, f, Space, j, k -> 1, 3, 4, 6, 8
            const mapping = [1, 3, 4, 6, 8];
            targetKeyIndex = mapping[clickedLane];
        }
        else if (editorMode === '6key') {
            // s, d, f, j, k, l -> 9, 1, 3, 6, 8, 10. Space is 4.
            // Visual: s, d, f, Space, j, k, l -> 9, 1, 3, 4, 6, 8, 10
            const mapping = [9, 1, 3, 4, 6, 8, 10];
            targetKeyIndex = mapping[clickedLane];
        }
        else if (editorMode === '8key') {
            // e, d, r, f, Space, u, j, i, k -> 0, 1, 2, 3, 4, 5, 6, 7, 8
            // Visual Order: Linear 0-8
            const mapping = [0, 1, 2, 3, 4, 5, 6, 7, 8];
            targetKeyIndex = mapping[clickedLane];
        }
        else if (editorMode === '12key') {
            // s, l, w, o + others...
            // Space (4) in middle
            // [9, 11, 1, 0, 3, 2,  4,  5, 6, 7, 8, 12, 10]
            const mapping = [9, 11, 1, 0, 3, 2, 4, 5, 6, 7, 8, 12, 10];
            targetKeyIndex = mapping[clickedLane];
        }
        if (targetKeyIndex === -1)
            return;
        console.log(`MouseDown: ClickedLane=${clickedLane}, TargetKey=${targetKeyIndex}, Mode=${editorMode}`);
        // Calculate clicked Time
        const pxPerMs = BASE_PX_PER_MS * zoomLevel;
        const currentTime = scrollTime; // Use visual time
        const clickedTimeRaw = currentTime + (PLAYHEAD_Y - mouseY) / pxPerMs;
        // Quantize Time
        const bpm = parseFloat(bpmInput.value) || 110;
        const offset = parseFloat(offsetInput.value) || 0;
        const msPerBeat = 60000 / bpm;
        const snapMs = msPerBeat * (4 / snapDenominator); // 4/16 = 1/4 beat ms
        const n = Math.round((clickedTimeRaw - offset) / snapMs);
        const quantizedTime = offset + (n * snapMs);
        // Check if note exists nearby (tolerance of snap/2)
        const hitWindow = snapMs / 2;
        let existingNoteIndex = -1;
        if (editorMode === '9key') {
            existingNoteIndex = recordedNotes.findIndex(note => note.lane === targetKeyIndex && Math.abs(note.time - quantizedTime) < hitWindow);
        }
        else {
            // Multi-mode deletion logic: 
            // If we click a visual lane, delete the note mapped to it.
            existingNoteIndex = recordedNotes.findIndex(note => note.lane === targetKeyIndex && Math.abs(note.time - quantizedTime) < hitWindow);
        }
        if (existingNoteIndex !== -1) {
            // Remove
            recordedNotes.splice(existingNoteIndex, 1);
        }
        else {
            // Add Logic
            if (customNoteType === 'hold') {
                if (!pendingHold) {
                    // Click 1: Start
                    pendingHold = { lane: targetKeyIndex, time: quantizedTime };
                }
                else {
                    // Click 2: End
                    if (pendingHold.lane === targetKeyIndex) {
                        const start = Math.min(pendingHold.time, quantizedTime);
                        const end = Math.max(pendingHold.time, quantizedTime);
                        const duration = end - start;
                        recordedNotes.push({
                            time: start,
                            lane: targetKeyIndex,
                            duration: duration
                        });
                        pendingHold = null;
                    }
                    else {
                        // Clicked different lane -> Move start point
                        pendingHold = { lane: targetKeyIndex, time: quantizedTime };
                    }
                }
            }
            else if (customNoteType === 'layout-a' || customNoteType === 'layout-b') {
                const type = (customNoteType === 'layout-a') ? 'type-a' : 'type-b';
                // Check if already exists near this time
                const hitWindowLC = snapMs / 2;
                const existingIndex = layoutChanges.findIndex(lc => Math.abs(lc.time - quantizedTime) < hitWindowLC);
                if (existingIndex !== -1) {
                    layoutChanges.splice(existingIndex, 1);
                }
                else {
                    layoutChanges.push({ time: quantizedTime, type: type });
                }
                layoutChanges.sort((a, b) => a.time - b.time);
                pendingHold = null;
            }
            else {
                // Click (Tap)
                recordedNotes.push({
                    time: quantizedTime,
                    lane: targetKeyIndex,
                    duration: 0
                });
                pendingHold = null;
            }
        }
    }); // Render Loop
    function loop() {
        updateVisuals();
        // Handle Keyboard Scrolling
        if (!isPlaying) {
            const scrollSpeed = 5 * (1 / zoomLevel) * 16; // Base speed
            if (isUpPressed) {
                targetScrollTime += scrollSpeed;
            }
            if (isDownPressed) {
                targetScrollTime -= scrollSpeed;
            }
            // Clamp
            targetScrollTime = Math.max(0, Math.min((audio.duration || 600) * 1000, targetScrollTime));
        }
        else {
            // Metronome logic
            if (chkMetronome && chkMetronome.checked) {
                const bpm = parseFloat(bpmInput.value) || 110;
                const offset = parseFloat(offsetInput.value) || 0;
                const msPerBeat = 60000 / bpm;
                const currentTime = audio.currentTime * 1000;
                const currentBeat = Math.floor((currentTime - offset) / msPerBeat);
                if (currentBeat > lastMetronomeBeat) {
                    // Tick! (Higher pitch for measure start)
                    const isMeasure = currentBeat % 4 === 0;
                    beep(isMeasure ? 880 : 440, 0.05);
                    lastMetronomeBeat = currentBeat;
                }
                else if (currentBeat < lastMetronomeBeat) {
                    // Reset if seek back
                    lastMetronomeBeat = currentBeat;
                }
            }
        }
        requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
    function updateVisuals() {
        if (!ctx)
            return;
        // Clear
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, editorCanvas.width, editorCanvas.height);
        const bpm = parseFloat(bpmInput.value) || 110;
        const offset = parseFloat(offsetInput.value) || 0;
        const pxPerMs = BASE_PX_PER_MS * zoomLevel;
        if (isPlaying) {
            scrollTime = audio.currentTime * 1000;
            targetScrollTime = scrollTime; // Keep target synced while playing
        }
        else {
            // LERP towards target
            const diff = targetScrollTime - scrollTime;
            if (Math.abs(diff) < 0.5) {
                scrollTime = targetScrollTime;
            }
            else {
                scrollTime += diff * 0.2; // 20% smoothing per frame
            }
            // Lazy Sync Audio (only if significant drift and audio is ready)
            if (Math.abs(audio.currentTime * 1000 - scrollTime) > 100 && audio.readyState >= 2) {
                audio.currentTime = scrollTime / 1000;
            }
        }
        const currentTime = scrollTime;
        // Lane width is calculated in calculateLaneLayout and stored in LANE_DEFS
        // Draw Beat Grid
        const msPerBeat = 60000 / bpm;
        // Optimization: view range
        const viewHeightMs = editorCanvas.height / pxPerMs;
        const startTime = currentTime - ((editorCanvas.height - PLAYHEAD_Y) / pxPerMs);
        const endTime = currentTime + (PLAYHEAD_Y / pxPerMs);
        const startBeat = Math.floor((startTime - offset) / msPerBeat);
        const endBeat = Math.ceil((endTime - offset) / msPerBeat);
        ctx.textAlign = 'right';
        ctx.font = '10px monospace';
        if (!LANE_DEFS.length)
            calculateLaneLayout(editorCanvas.width);
        for (let b = startBeat; b <= endBeat; b++) {
            const beatTime = offset + (b * msPerBeat);
            const y = PLAYHEAD_Y - (beatTime - currentTime) * pxPerMs;
            const isMeasure = b % 4 === 0;
            ctx.strokeStyle = isMeasure ? '#666' : '#333';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(editorCanvas.width, y);
            ctx.stroke();
            // Subdivisions
            if (snapDenominator > 4) {
                const step = 4 / snapDenominator;
                const subMs = msPerBeat * step;
                ctx.strokeStyle = '#222';
                // Improve precision for subdivisions
                // 1/step is the number of subdivisions per beat (e.g. 1/0.25 = 4)
                const subs = Math.round(1 / step);
                for (let s = 1; s < subs; s++) {
                    const subTime = beatTime + (s * subMs);
                    const subY = PLAYHEAD_Y - (subTime - currentTime) * pxPerMs;
                    ctx.beginPath();
                    ctx.moveTo(0, subY);
                    ctx.lineTo(editorCanvas.width, subY);
                    ctx.stroke();
                }
            }
        }
        // Draw Layout Changes
        layoutChanges.forEach(lc => {
            const y = PLAYHEAD_Y - (lc.time - currentTime) * pxPerMs;
            if (y < 0 || y > editorCanvas.height)
                return;
            ctx.strokeStyle = '#e040fb';
            ctx.lineWidth = 3;
            ctx.setLineDash([10, 5]);
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(editorCanvas.width, y);
            ctx.stroke();
            ctx.setLineDash([]); // Reset
            ctx.fillStyle = '#e040fb';
            ctx.textAlign = 'left';
            ctx.font = 'bold 12px Arial';
            ctx.fillText(`LAYOUT: ${lc.type.toUpperCase()}`, 10, y - 5);
        });
        // Draw Lanes (Vertical Dividers)
        ctx.strokeStyle = '#444';
        LANE_DEFS.forEach(def => {
            // Draw left and right bounds? Just dividers.
            // Draw rect frame for lane?
            ctx.strokeRect(def.x, 0, def.width, editorCanvas.height);
        });
        // Draw Active Holds (Visual feedback while holding)
        // Only if recording
        // Draw Active Holds (Visual feedback while holding)
        // Only if recording
        if (isRecording) {
            for (const laneStr in activeHolds) {
                const lane = parseInt(laneStr);
                const startTime = activeHolds[lane];
                // Determine Visual Lane
                let visualLane = -1;
                if (editorMode === '9key') {
                    visualLane = lane;
                }
                else {
                    let mapping = [];
                    if (editorMode === '4key')
                        mapping = [1, 3, 4, 6, 8];
                    else if (editorMode === '6key')
                        mapping = [9, 1, 3, 4, 6, 8, 10];
                    else if (editorMode === '8key')
                        mapping = [0, 1, 2, 3, 4, 5, 6, 7, 8];
                    else if (editorMode === '12key')
                        mapping = [9, 11, 1, 0, 3, 2, 4, 5, 6, 7, 8, 12, 10];
                    const idx = mapping.indexOf(lane);
                    if (idx !== -1)
                        visualLane = idx;
                }
                if (visualLane === -1 || !LANE_DEFS[visualLane])
                    continue;
                const ld = LANE_DEFS[visualLane];
                const yHeadPos = PLAYHEAD_Y - (startTime - currentTime) * pxPerMs;
                const yTailPos = PLAYHEAD_Y; // Current time
                ctx.fillStyle = (lane === 4) ? 'rgba(224, 64, 251, 0.3)' : 'rgba(255, 255, 255, 0.3)';
                ctx.fillRect(ld.x + 2, yTailPos, ld.width - 4, yHeadPos - yTailPos);
            }
        }
        // Helper to draw a single note
        function drawNote(lane, time, duration, isGhost = false) {
            if (!ctx)
                return;
            const noteStart = time;
            const noteEnd = time + duration;
            if (noteEnd < startTime - 1000 || noteStart > endTime + 1000)
                return;
            let visualLane = -1;
            let color = '#ffffff';
            let isSpace = false;
            if (editorMode === '9key') {
                visualLane = lane;
                const whiteIndices = [1, 3, 6, 8];
                const blueIndices = [0, 2, 5, 7];
                if (whiteIndices.includes(lane))
                    color = '#ffffff';
                else if (blueIndices.includes(lane))
                    color = '#7CA4FF';
                else if (lane === 4) {
                    color = '#e040fb';
                    isSpace = true;
                }
            }
            else {
                // Determine Visual Lane for current mode
                let mapping = [];
                if (editorMode === '4key')
                    mapping = [1, 3, 4, 6, 8];
                else if (editorMode === '6key')
                    mapping = [9, 1, 3, 4, 6, 8, 10];
                else if (editorMode === '8key')
                    mapping = [0, 1, 2, 3, 4, 5, 6, 7, 8];
                else if (editorMode === '12key')
                    mapping = [9, 11, 1, 0, 3, 2, 4, 5, 6, 7, 8, 12, 10];
                const idx = mapping.indexOf(lane);
                if (idx !== -1) {
                    visualLane = idx;
                    // User-specified Color Logic
                    if (lane === 4) {
                        color = '#e040fb'; // Space is Purple
                        isSpace = true;
                    }
                    else if (editorMode === '4key') {
                        // All White (d,f,j,k)
                        color = '#ffffff';
                    }
                    else if (editorMode === '6key') {
                        // All White (s,d,f,j,k,l)
                        color = '#ffffff';
                    }
                    else if (editorMode === '8key') {
                        color = (idx % 2 === 0) ? '#7CA4FF' : '#ffffff';
                    }
                    else if (editorMode === '12key') {
                        // White: s(9), d(1), f(3), j(6), k(8), l(10)
                        // Blue: w(11), e(0), r(2), u(5), i(7), o(12)
                        const whiteKeys = [9, 1, 3, 6, 8, 10];
                        if (whiteKeys.includes(lane))
                            color = '#ffffff';
                        else
                            color = '#7CA4FF';
                    }
                }
            }
            if (visualLane === -1 && !isSpace) {
                console.log(`DrawNote Skip: lane=${lane}`);
                return;
            }
            // console.log(`DrawNote: lane=${lane}, mode=${editorMode}, visualLane=${visualLane}, isSpace=${isSpace}, color=${color}`);
            const y = PLAYHEAD_Y - (time - currentTime) * pxPerMs;
            if (isGhost) {
                ctx.globalAlpha = 0.5;
                if (isSpace && editorMode === '9key') { // Only draw space ghost in 9key
                    ctx.fillStyle = 'rgba(224, 64, 251, 0.5)';
                    ctx.fillRect(0, y - 5, editorCanvas.width, 10);
                }
                else if (visualLane !== -1) {
                    const ld = LANE_DEFS[visualLane];
                    if (ld) {
                        ctx.fillStyle = 'rgba(255, 255, 0, 0.5)';
                        ctx.fillRect(ld.x + 2, y - 5, ld.width - 4, 10);
                        ctx.strokeStyle = '#ffff00';
                        ctx.lineWidth = 2;
                        ctx.strokeRect(ld.x + 2, y - 5, ld.width - 4, 10);
                    }
                }
                ctx.globalAlpha = 1.0;
                return;
            }
            ctx.fillStyle = color;
            if (isSpace && editorMode === '9key') { // Only draw space in 9key
                const drawH = 15;
                ctx.globalAlpha = 0.5; // Transparency for Space bars
                if (duration > 0) {
                    const tailHeight = duration * pxPerMs;
                    ctx.fillRect(0, y - tailHeight, editorCanvas.width, tailHeight);
                }
                ctx.fillRect(0, y - drawH / 2, editorCanvas.width, drawH);
                ctx.globalAlpha = 1.0;
            }
            else if (visualLane !== -1) {
                const ld = LANE_DEFS[visualLane];
                if (!ld)
                    return;
                const drawX = ld.x + 5;
                const drawW = ld.width - 10;
                if (duration > 0) {
                    const tailHeight = duration * pxPerMs;
                    ctx.globalAlpha = 0.5;
                    ctx.fillRect(drawX + 2, y - tailHeight, drawW - 4, tailHeight);
                    ctx.globalAlpha = 1.0;
                }
                const noteH = 15;
                ctx.fillRect(drawX, y - noteH / 2, drawW, noteH);
            }
        }
        // Pass 1: Draw Space Notes and Space Ghost (Background Layer)
        if (pendingHold && pendingHold.lane === 4) {
            drawNote(pendingHold.lane, pendingHold.time, 0, true);
        }
        recordedNotes.forEach(note => {
            if (note.lane === 4)
                drawNote(note.lane, note.time, note.duration);
        });
        // Pass 2: Draw White/Blue Notes and their Ghost (Foreground Layer)
        if (pendingHold && pendingHold.lane !== 4) {
            drawNote(pendingHold.lane, pendingHold.time, 0, true);
        }
        recordedNotes.forEach(note => {
            if (note.lane !== 4)
                drawNote(note.lane, note.time, note.duration);
        });
        // Draw Playhead
        ctx.strokeStyle = '#ff0000';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, PLAYHEAD_Y);
        ctx.lineTo(editorCanvas.width, PLAYHEAD_Y);
        ctx.stroke();
    }
    // Export Logic Helper
    function getChartJSONString() {
        const bpm = parseFloat(bpmInput.value) || 110;
        const offset = parseFloat(offsetInput.value) || 0;
        const msPerBeat = 60000 / bpm;
        // Convert MS to Beats
        const notes = recordedNotes.map(note => {
            const rawBeat = (note.time - offset) / msPerBeat;
            const beat = Math.round(rawBeat * 1000) / 1000;
            const rawDur = note.duration / msPerBeat;
            const durBeat = Math.round(rawDur * 1000) / 1000;
            return {
                beat: beat,
                lane: note.lane,
                duration: durBeat
            };
        }).sort((a, b) => a.beat - b.beat);
        const layoutChangesOut = layoutChanges.map(lc => {
            const rawBeat = (lc.time - offset) / msPerBeat;
            const beat = Math.round(rawBeat * 1000) / 1000;
            return {
                beat: beat,
                type: lc.type
            };
        }).sort((a, b) => a.beat - b.beat);
        const json = {
            mode: editorMode,
            difficulty: currentClass,
            bpm: bpm,
            offset: offset,
            notes: notes,
            layoutChanges: layoutChangesOut
        };
        const levelNum = parseInt(currentLevel);
        if (levelNum > 0) {
            json.level = levelNum;
        }
        return JSON.stringify(json, null, 2);
    }
    // Export Button
    btnExport.addEventListener('click', () => {
        txtOutput.value = getChartJSONString();
    });
    // Download Logic
    const btnDownload = document.getElementById('btn-download');
    if (btnDownload) {
        btnDownload.addEventListener('click', () => {
            // Auto-export current state
            const content = getChartJSONString();
            txtOutput.value = content; // Update text area too for visibility
            // Get filename
            let defaultName = 'chart.json';
            let index = -1;
            // Find index of currently loaded song if possible, or just default
            // We don't have a specific "selected index" state easily accessible unless we store it.
            // But for download, we just need the content. The filename is secondary.
            // Let's rely on global currentEditingFilename if available.
            if (window.currentEditingFilename) {
                defaultName = window.currentEditingFilename;
            }
            const filename = prompt('Enter filename to save as:', defaultName);
            if (!filename)
                return;
            const blob = new Blob([content], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        });
    }
    // Save to Disk (Server) Logic
    const btnSaveDisk = document.getElementById('btn-save-disk');
    if (btnSaveDisk) {
        btnSaveDisk.addEventListener('click', () => __awaiter(this, void 0, void 0, function* () {
            // Auto-export
            const content = getChartJSONString();
            txtOutput.value = content;
            // Determine Target Path
            let targetPath = '';
            if (window.currentEditingFilename && window.currentEditingFolder) {
                targetPath = `songs/${window.currentEditingFolder}/${window.currentEditingFilename}`;
            }
            if (!targetPath) {
                alert('Please load a song first from the list so we know where to save.');
                return;
            }
            if (!confirm(`Save to "${targetPath}"? This will overwrite the file.`))
                return;
            try {
                const res = yield fetch('/save', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        path: targetPath,
                        content: content
                    })
                });
                if (res.ok) {
                    alert('Saved successfully!');
                    statusDiv.textContent = `Status: Saved to ${targetPath}`;
                }
                else {
                    const errText = yield res.text();
                    alert('Save Failed: ' + errText);
                }
            }
            catch (e) {
                alert('Save Error: ' + e);
                console.error(e);
            }
        }));
    }
})();
