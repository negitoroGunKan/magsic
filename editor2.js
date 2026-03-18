"use strict";
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
    // Keys Mapping (0-12) - PRESERVED EXACTLY
    const KEYS = ['e', 'd', 'r', 'f', ' ', 'u', 'j', 'i', 'k', 's', 'l', 'w', 'o'];
    const LANE_COUNT = KEYS.length;
    // State
    const audio = new Audio();
    audio.preload = 'auto'; // Encourage browser to buffer ahead
    audio.preload = 'auto'; // Encourage browser to buffer ahead
    let currentClass = 'no';
    let currentLevel = '1';
    let bpmChanges = [];
    let layoutChanges = [];
    let recordedNotes = [];
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
    // 12Key Editor State
    let editMode12k = 'white';
    const btn12kWhite = document.getElementById('btn-12key-white');
    const btn12kBlue = document.getElementById('btn-12key-blue');
    const toggleGroup12k = document.getElementById('editor-12key-toggle-group');
    if (btn12kWhite && btn12kBlue) {
        btn12kWhite.onclick = () => {
            editMode12k = 'white';
            btn12kWhite.classList.add('primary');
            btn12kBlue.classList.remove('primary');
        };
        btn12kBlue.onclick = () => {
            editMode12k = 'blue';
            btn12kBlue.classList.add('primary');
            btn12kWhite.classList.remove('primary');
        };
    }
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
    const levelSelect = document.getElementById('level-select');
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
    // Offset Change Listener
    let previousOffset = parseFloat(offsetInput.value) || 0;
    offsetInput.addEventListener('focus', () => {
        previousOffset = parseFloat(offsetInput.value) || 0;
    });
    offsetInput.addEventListener('change', () => {
        const newOffset = parseFloat(offsetInput.value) || 0;
        const diff = newOffset - previousOffset;
        if (diff !== 0) {
            bpmChanges.forEach(bc => { bc.time += diff; });
            layoutChanges.forEach(lc => { lc.time += diff; });
            statusDiv.textContent = `Offset changed: ${previousOffset} -> ${newOffset}. BPM/Layouts shifted.`;
            previousOffset = newOffset;
        }
    });
    // Reset All Notes
    const btnReset = document.getElementById('btn-reset');
    btnReset.addEventListener('click', () => {
        if (!confirm('Are you sure you want to reset all recorded notes? This cannot be undone.'))
            return;
        recordedNotes.length = 0;
        statusDiv.textContent = 'Status: Reset (0 notes)';
        txtOutput.value = '';
        if (isPlaying)
            audio.currentTime = 0;
    });
    // Song Selection Logic
    let songList = [];
    let flattenedSongOptions = [];
    function loadEditorSongList() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const res = yield fetch('songs/list.json');
                songList = yield res.json();
                flattenedSongOptions = [];
                const MODES = ['4key', '6key', '8key', '12key'];
                const DIFFS = ['no', 'st', 'ad', 'pr', 'et'];
                const tableBody = document.getElementById('song-table-body');
                if (tableBody)
                    tableBody.innerHTML = '';
                songList.forEach(song => {
                    MODES.forEach(mode => {
                        DIFFS.forEach(diff => {
                            let filename = '';
                            let isLegacy = false;
                            if (mode === '8key' && song.charts && song.charts[diff]) {
                                filename = song.charts[diff];
                                isLegacy = true;
                            }
                            else {
                                const modeAbbr = mode.replace('key', 'k');
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
                            const tr = document.createElement('tr');
                            tr.innerHTML = `
                            <td>${song.title}</td>
                            <td>${diff.toUpperCase()}</td>
                            <td style="color: ${mode === '8key' ? '#e040fb' : '#00bcd4'};">${mode.toUpperCase()}</td>
                        `;
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
            if (opt.diff)
                currentClass = opt.diff.toLowerCase();
            try {
                audio.pause();
                audio.src = `songs/${song.folder}/${song.audio}`;
                audio.load();
                scrollTime = 0;
                targetScrollTime = 0;
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
                }
                else {
                    recordedNotes.length = 0;
                    bpmInput.value = song.bpm;
                    offsetInput.value = '0';
                    statusDiv.textContent = `Status: Created New Config for ${opt.label}`;
                    window.currentEditingFilename = opt.filename;
                    window.currentEditingFolder = song.folder;
                }
                const editorModeSelect = document.getElementById('editor-mode-select');
                if (editorModeSelect && opt.mode) {
                    editorModeSelect.value = opt.mode;
                    editorModeSelect.dispatchEvent(new Event('change'));
                }
            }
            catch (e) {
                alert('Error loading song: ' + e);
            }
        });
    }
    const bpmChangeValueInput = document.getElementById('bpm-change-value');
    function importChartJSON(json) {
        try {
            const initialBpm = json.bpm || parseFloat(bpmInput.value) || 120;
            const offset = json.offset || 0;
            bpmInput.value = initialBpm.toString();
            offsetInput.value = offset.toString();
            bpmChanges = [];
            if (Array.isArray(json.bpmChanges)) {
                json.bpmChanges.sort((a, b) => a.beat - b.beat);
                let currentTime = offset;
                let currentBeat = 0;
                let currentBpm = initialBpm;
                json.bpmChanges.forEach((bc) => {
                    const deltaBeats = bc.beat - currentBeat;
                    const msPerBeat = 60000 / currentBpm;
                    currentTime += deltaBeats * msPerBeat;
                    bpmChanges.push({
                        time: currentTime,
                        bpm: bc.bpm,
                        beat: bc.beat
                    });
                    currentBeat = bc.beat;
                    currentBpm = bc.bpm;
                });
            }
            const getTimeFromBeat = (beat) => {
                let time = offset;
                let b = 0;
                let bpm = initialBpm;
                for (let i = 0; i < bpmChanges.length; i++) {
                    const bc = bpmChanges[i];
                    if (beat >= bc.beat) {
                        time += (bc.beat - b) * (60000 / bpm);
                        b = bc.beat;
                        bpm = bc.bpm;
                    }
                    else {
                        break;
                    }
                }
                time += (beat - b) * (60000 / bpm);
                return time;
            };
            recordedNotes.length = 0;
            if (Array.isArray(json.notes)) {
                json.notes.forEach((n) => {
                    const startTime = getTimeFromBeat(n.beat);
                    const endBeat = n.beat + (n.duration || 0);
                    const endTime = getTimeFromBeat(endBeat);
                    recordedNotes.push({
                        time: startTime,
                        lane: n.lane,
                        duration: endTime - startTime,
                        type: n.type || 'normal'
                    });
                });
            }
            layoutChanges.length = 0;
            if (Array.isArray(json.layoutChanges)) {
                json.layoutChanges.forEach((lc) => {
                    const time = getTimeFromBeat(lc.beat);
                    layoutChanges.push({ time: time, type: lc.type });
                });
            }
            if (json.difficulty)
                currentClass = json.difficulty;
            if (json.level !== undefined && levelSelect) {
                levelSelect.value = json.level.toString();
                currentLevel = json.level.toString();
            }
            statusDiv.textContent = `Status: Loaded Chart (${recordedNotes.length} notes)`;
            scrollTime = 0;
            targetScrollTime = 0;
            audio.currentTime = 0;
        }
        catch (err) {
            alert('Error parsing JSON: ' + err);
        }
    }
    // Playback Logic
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
            audio.pause();
            isPlaying = false;
            targetScrollTime = scrollTime;
            btnPlay.textContent = 'Play / Pause (Space)';
            statusDiv.textContent = 'Status: Paused';
            statusDiv.classList.remove('recording');
        }
        else {
            if (chkRecord.checked) {
                btnPlay.disabled = true;
                startCountdown().then(() => {
                    btnPlay.disabled = false;
                    startPlayback(true);
                });
            }
            else {
                startPlayback(false);
            }
        }
    }
    function startPlayback(recording) {
        return __awaiter(this, void 0, void 0, function* () {
            if (isPlaying)
                return;
            isPlaying = true;
            isRecording = recording;
            btnPlay.textContent = 'Pause (Space)';
            if (isRecording) {
                statusDiv.textContent = 'Status: RECORDING...';
                statusDiv.classList.add('recording');
            }
            else {
                statusDiv.textContent = 'Status: Playing';
                statusDiv.classList.remove('recording');
            }
            audio.currentTime = scrollTime / 1000;
            try {
                yield audio.play();
            }
            catch (err) {
                console.error("Playback start error:", err);
                isPlaying = false;
            }
        });
    }
    // Keyboard Events for Recording & Transport
    window.addEventListener('keydown', (e) => {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement)
            return;
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
            if (!isRecording && !e.repeat)
                togglePlay();
        }
        // Note Type Shortcuts
        const typeKeys = { '1': 'tap', '2': 'hold', '3': 'layout-a', '4': 'layout-b', '5': 'sinking', '6': 'death' };
        if (typeKeys[e.key]) {
            const val = typeKeys[e.key];
            const radios = document.getElementsByName('note-type');
            radios.forEach(r => { if (r.value === val) {
                r.checked = true;
                r.dispatchEvent(new Event('change'));
            } });
        }
        if (isPlaying && !e.repeat) {
            const modifiers = ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab', 'Escape'];
            if (!modifiers.includes(e.key)) {
                syncTapTimes.push(audio.currentTime * 1000);
                if (syncTapCountDisp)
                    syncTapCountDisp.textContent = `${syncTapTimes.length} taps`;
            }
        }
        if (!isPlaying || !isRecording || e.repeat)
            return;
        const key = e.key.toLowerCase();
        const keyIndex = KEYS.indexOf(key);
        if (keyIndex !== -1) {
            if (activeHolds[keyIndex] === undefined) {
                activeHolds[keyIndex] = audio.currentTime * 1000;
            }
        }
        if (e.key === '[' || e.key === ']') {
            const currentOffset = parseInt(offsetInput.value) || 0;
            const MathStep = e.shiftKey ? 1 : 5;
            const diff = e.key === '[' ? -MathStep : MathStep;
            const newVal = currentOffset + diff;
            offsetInput.value = newVal.toString();
            if (chkSyncShiftNotes && chkSyncShiftNotes.checked) {
                recordedNotes.forEach(note => note.time += diff);
                layoutChanges.forEach(lc => lc.time += diff);
                statusDiv.textContent = `Offset tuned: ${newVal}ms (Notes Shifted)`;
            }
            else {
                statusDiv.textContent = `Offset tuned: ${newVal}ms`;
            }
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
        const key = e.key.toLowerCase();
        const keyIndex = KEYS.indexOf(key);
        if (keyIndex !== -1) {
            const startTime = activeHolds[keyIndex];
            if (startTime !== undefined) {
                const endTime = audio.currentTime * 1000;
                let duration = endTime - startTime;
                if (duration < 100)
                    duration = 0; // Tap
                const noteType = (customNoteType === 'sinking' || customNoteType === 'death') ? customNoteType : 'normal';
                recordedNotes.push({
                    time: startTime,
                    lane: keyIndex,
                    duration: duration,
                    type: noteType
                });
                delete activeHolds[keyIndex];
            }
        }
    });
    audio.addEventListener('ended', () => {
        isPlaying = false;
        isRecording = false;
        btnPlay.textContent = 'Play / Pause (Space)';
        statusDiv.textContent = 'Status: Ended';
        statusDiv.classList.remove('recording');
        for (const k in activeHolds)
            delete activeHolds[k];
    });
    // BPM & Sync Logic
    let tapTimes = [];
    if (btnTapBpm) {
        btnTapBpm.addEventListener('click', () => {
            const now = Date.now();
            if (tapTimes.length > 0 && now - tapTimes[tapTimes.length - 1] > 2000)
                tapTimes = [];
            tapTimes.push(now);
            if (tapTimes.length > 5)
                tapTimes.shift();
            if (tapTimes.length > 1) {
                let sum = 0;
                for (let i = 1; i < tapTimes.length; i++)
                    sum += tapTimes[i] - tapTimes[i - 1];
                const avgInterval = sum / (tapTimes.length - 1);
                const bpm = 60000 / avgInterval;
                bpmInput.value = bpm.toFixed(2);
            }
        });
    }
    if (btnBpmMinus)
        btnBpmMinus.addEventListener('click', () => { bpmInput.value = ((parseFloat(bpmInput.value) || 0) - 1).toFixed(2); });
    if (btnBpmPlus)
        btnBpmPlus.addEventListener('click', () => { bpmInput.value = ((parseFloat(bpmInput.value) || 0) + 1).toFixed(2); });
    function applyOffsetSync() {
        if (syncTapTimes.length < 2) {
            alert('Record at least 2 taps.');
            return;
        }
        const bpm = parseFloat(bpmInput.value) || 120;
        const currentOffset = parseInt(offsetInput.value) || 0;
        const msPerBeat = 60000 / bpm;
        let totalDeviation = 0;
        syncTapTimes.forEach(tap => {
            const n = Math.round((tap - currentOffset) / msPerBeat);
            const beatTime = currentOffset + (n * msPerBeat);
            totalDeviation += tap - beatTime;
        });
        const avgDev = totalDeviation / syncTapTimes.length;
        const roundedDev = Math.round(avgDev);
        const newOffset = currentOffset + roundedDev;
        offsetInput.value = newOffset.toString();
        lastMetronomeBeat = -1;
        if (chkSyncShiftNotes && chkSyncShiftNotes.checked) {
            recordedNotes.forEach(note => note.time += roundedDev);
            layoutChanges.forEach(lc => lc.time += roundedDev);
            statusDiv.textContent = `Offset synced: Adjusted by ${roundedDev}ms. Notes SHIFTED.`;
        }
        else {
            statusDiv.textContent = `Offset synced: Adjusted by ${roundedDev}ms.`;
        }
        syncTapTimes = [];
        if (syncTapCountDisp)
            syncTapCountDisp.textContent = '0 taps (Applied)';
    }
    if (btnApplySync)
        btnApplySync.addEventListener('click', applyOffsetSync);
    if (btnResetSync)
        btnResetSync.addEventListener('click', () => {
            syncTapTimes = [];
            if (syncTapCountDisp)
                syncTapCountDisp.textContent = '0 taps';
        });
    // Visual Editor Setup (Piano Roll)
    if (snapSelect)
        snapSelect.addEventListener('change', () => { snapDenominator = parseInt(snapSelect.value); });
    if (zoomRange)
        zoomRange.addEventListener('input', () => { zoomLevel = parseFloat(zoomRange.value); });
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
    const editorModeSelect = document.getElementById('editor-mode-select');
    let editorMode = '8key';
    const visualEditorContainer = document.getElementById('visual-editor-container');
    let LANE_DEFS = [];
    function calculateLaneLayout(canvasW) {
        if (!canvasW)
            canvasW = 400;
        LANE_DEFS = [];
        if (editorMode === '9key') {
            const w = 40;
            const gap = 10;
            const spaceW = 60;
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
            let totalLanes = 4;
            if (editorMode === '4key')
                totalLanes = 5;
            if (editorMode === '6key')
                totalLanes = 7;
            if (editorMode === '8key')
                totalLanes = 9;
            if (editorMode === '12key')
                totalLanes = 6; // Refactored to 6 doubled lanes
            const w = Math.floor(canvasW / totalLanes);
            for (let i = 0; i < totalLanes; i++)
                LANE_DEFS[i] = { x: i * w, width: w };
        }
    }
    if (editorModeSelect) {
        editorModeSelect.addEventListener('change', () => {
            editorMode = editorModeSelect.value;
            pendingHold = null;
            if (toggleGroup12k) {
                toggleGroup12k.style.display = (editorMode === '12key') ? 'flex' : 'none';
            }
            let newWidth = 400;
            if (editorMode === '4key')
                newWidth = 300;
            else if (editorMode === '6key')
                newWidth = 350;
            else if (editorMode === '8key')
                newWidth = 450;
            else if (editorMode === '9key')
                newWidth = 450;
            else if (editorMode === '12key')
                newWidth = 400; // Adjusted for 6 lanes
            if (visualEditorContainer)
                visualEditorContainer.style.width = `${newWidth}px`;
            editorCanvas.width = newWidth;
            calculateLaneLayout(editorCanvas.width);
        });
        editorModeSelect.dispatchEvent(new Event('change'));
    }
    // Scroll Wheel Seek
    editorCanvas.addEventListener('wheel', (e) => {
        if (isPlaying)
            return;
        e.preventDefault();
        const sensitivity = 0.5;
        const deltaMs = e.deltaY * sensitivity * (1 / zoomLevel) * 5;
        const maxScroll = (audio.duration && !isNaN(audio.duration) && audio.duration > 0) ? audio.duration * 1000 : 600000;
        targetScrollTime = Math.max(0, Math.min(maxScroll, targetScrollTime + deltaMs));
    }, { passive: false });
    const getBeatFromTimeGlobal = (time) => {
        const initialBpm = parseFloat(bpmInput.value) || 120;
        const offset = parseFloat(offsetInput.value) || 0;
        const sorted = [...bpmChanges].sort((a, b) => a.time - b.time);
        let currentTp = { time: offset, bpm: initialBpm, beat: 0 };
        for (const change of sorted) {
            if (time >= change.time) {
                const msPerBeat = 60000 / currentTp.bpm;
                currentTp = {
                    time: change.time,
                    bpm: change.bpm,
                    beat: currentTp.beat + ((change.time - currentTp.time) / msPerBeat)
                };
            }
            else
                break;
        }
        return currentTp.beat + ((time - currentTp.time) / (60000 / currentTp.bpm));
    };
    const getTimeFromBeatGlobal = (beat) => {
        const initialBpm = parseFloat(bpmInput.value) || 120;
        const offset = parseFloat(offsetInput.value) || 0;
        const sorted = [...bpmChanges].sort((a, b) => a.time - b.time);
        let changesWithBeats = [];
        let cTime = offset;
        let cBeat = 0;
        let cBpm = initialBpm;
        for (const change of sorted) {
            const msPerBeat = 60000 / cBpm;
            const changeBeat = cBeat + ((change.time - cTime) / msPerBeat);
            changesWithBeats.push({ time: change.time, bpm: change.bpm, beat: changeBeat });
            cTime = change.time;
            cBeat = changeBeat;
            cBpm = change.bpm;
        }
        let currentTp = { time: offset, bpm: initialBpm, beat: 0 };
        for (const change of changesWithBeats) {
            if (beat >= change.beat)
                currentTp = change;
            else
                break;
        }
        return currentTp.time + ((beat - currentTp.beat) * (60000 / currentTp.bpm));
    };
    // Note Placement Click
    editorCanvas.addEventListener('mousedown', (e) => {
        const rect = editorCanvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        if (!LANE_DEFS.length)
            calculateLaneLayout(editorCanvas.width);
        let clickedLane = -1;
        for (let i = 0; i < LANE_DEFS.length; i++) {
            if (mouseX >= LANE_DEFS[i].x && mouseX < LANE_DEFS[i].x + LANE_DEFS[i].width) {
                clickedLane = i;
                break;
            }
        }
        if (clickedLane === -1)
            return;
        // NOTE MAPPING - Crucial inheritance
        let targetKeyIndex = -1;
        if (editorMode === '9key') {
            targetKeyIndex = clickedLane;
            const mapping = [0, 1, 2, 3, 4, 5, 6, 7, 8];
            if (mapping[clickedLane] !== undefined)
                targetKeyIndex = mapping[clickedLane];
        }
        else if (editorMode === '6key') {
            const mapping = [9, 1, 3, 4, 6, 8, 10];
            targetKeyIndex = mapping[clickedLane];
        }
        else if (editorMode === '8key') {
            const mapping = [0, 1, 2, 3, 4, 5, 6, 7, 8];
            targetKeyIndex = mapping[clickedLane];
        }
        else if (editorMode === '12key') {
            // Mapping for 6 doubled lanes
            const whiteMapping = [9, 1, 3, 6, 8, 10]; // S, D, F, J, K, L
            const blueMapping = [11, 0, 2, 5, 7, 12]; // W, E, R, U, I, O
            targetKeyIndex = (editMode12k === 'white') ? whiteMapping[clickedLane] : blueMapping[clickedLane];
        }
        else if (editorMode === '4key') {
            const mapping = [1, 3, 4, 6, 8];
            targetKeyIndex = mapping[clickedLane];
        }
        if (targetKeyIndex === -1)
            return;
        const pxPerMs = BASE_PX_PER_MS * zoomLevel;
        const clickedTimeRaw = scrollTime + (PLAYHEAD_Y - mouseY) / pxPerMs;
        const clickedBeat = getBeatFromTimeGlobal(clickedTimeRaw);
        const snapBeat = 4 / snapDenominator;
        const quantizedBeat = Math.round(clickedBeat / snapBeat) * snapBeat;
        const quantizedTime = getTimeFromBeatGlobal(quantizedBeat);
        const hitWindow = 50 / zoomLevel;
        const existingNoteIndex = recordedNotes.findIndex(note => note.lane === targetKeyIndex && Math.abs(note.time - quantizedTime) < hitWindow);
        if (existingNoteIndex !== -1) {
            recordedNotes.splice(existingNoteIndex, 1);
        }
        else {
            if (customNoteType === 'hold') {
                if (!pendingHold) {
                    pendingHold = { lane: targetKeyIndex, time: quantizedTime };
                }
                else {
                    if (pendingHold.lane === targetKeyIndex) {
                        const start = Math.min(pendingHold.time, quantizedTime);
                        const end = Math.max(pendingHold.time, quantizedTime);
                        recordedNotes.push({ time: start, lane: targetKeyIndex, duration: end - start });
                        pendingHold = null;
                    }
                    else {
                        pendingHold = { lane: targetKeyIndex, time: quantizedTime };
                    }
                }
            }
            else if (customNoteType === 'layout-a' || customNoteType === 'layout-b') {
                const type = (customNoteType === 'layout-a') ? 'type-a' : 'type-b';
                const existingIndex = layoutChanges.findIndex(lc => Math.abs(lc.time - quantizedTime) < hitWindow);
                if (existingIndex !== -1)
                    layoutChanges.splice(existingIndex, 1);
                else
                    layoutChanges.push({ time: quantizedTime, type: type });
                layoutChanges.sort((a, b) => a.time - b.time);
                pendingHold = null;
            }
            else if (customNoteType === 'bpm-change') {
                const existingIndex = bpmChanges.findIndex(bc => Math.abs(bc.time - quantizedTime) < hitWindow);
                if (existingIndex !== -1) {
                    bpmChanges.splice(existingIndex, 1);
                }
                else {
                    const val = parseFloat(bpmChangeValueInput.value);
                    if (val > 0) {
                        bpmChanges.push({ time: quantizedTime, bpm: val, beat: 0 });
                        bpmChanges.sort((a, b) => a.time - b.time);
                    }
                }
                pendingHold = null;
            }
            else {
                const noteType = (customNoteType === 'sinking' || customNoteType === 'death') ? customNoteType : 'normal';
                recordedNotes.push({
                    time: quantizedTime,
                    lane: targetKeyIndex,
                    duration: 0,
                    type: noteType
                });
                pendingHold = null;
            }
        }
    });
    // Render Loop
    function loop() {
        updateVisuals();
        if (!isPlaying) {
            const scrollSpeed = 5 * (1 / zoomLevel) * 16;
            if (isUpPressed)
                targetScrollTime += scrollSpeed;
            if (isDownPressed)
                targetScrollTime -= scrollSpeed;
            const maxScroll = (audio.duration && !isNaN(audio.duration) && audio.duration > 0) ? audio.duration * 1000 : 600000;
            targetScrollTime = Math.max(0, Math.min(maxScroll, targetScrollTime));
        }
        else {
            if (chkMetronome && chkMetronome.checked) {
                const bpm = parseFloat(bpmInput.value) || 120;
                const offset = parseFloat(offsetInput.value) || 0;
                const currentBeat = Math.floor((audio.currentTime * 1000 - offset) / (60000 / bpm));
                if (currentBeat > lastMetronomeBeat) {
                    beep(currentBeat % 4 === 0 ? 880 : 440, 0.05);
                    lastMetronomeBeat = currentBeat;
                }
                else if (currentBeat < lastMetronomeBeat)
                    lastMetronomeBeat = currentBeat;
            }
        }
        // Update Debug Info
        const debugScroll = document.getElementById('debug-scroll');
        const debugAudio = document.getElementById('debug-audio');
        const debugSeeking = document.getElementById('debug-seeking');
        const debugReady = document.getElementById('debug-ready');
        const debugPlaying = document.getElementById('debug-playing');
        if (debugScroll)
            debugScroll.textContent = scrollTime.toFixed(2);
        if (debugAudio)
            debugAudio.textContent = (audio.currentTime * 1000).toFixed(2);
        if (debugSeeking) {
            debugSeeking.textContent = audio.seeking ? 'true' : 'false';
            debugSeeking.style.color = audio.seeking ? '#f00' : '#0f0';
        }
        if (debugReady)
            debugReady.textContent = audio.readyState.toString();
        if (debugPlaying) {
            debugPlaying.textContent = isPlaying ? 'PLAYING' : 'PAUSED';
            debugPlaying.style.color = isPlaying ? '#0f0' : '#f00';
        }
        requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
    function updateVisuals() {
        if (!ctx)
            return;
        ctx.fillStyle = '#1e1e1e';
        ctx.fillRect(0, 0, editorCanvas.width, editorCanvas.height);
        const initialBpm = parseFloat(bpmInput.value) || 120;
        const offset = parseFloat(offsetInput.value) || 0;
        const pxPerMs = BASE_PX_PER_MS * zoomLevel;
        if (isPlaying) {
            scrollTime = audio.currentTime * 1000;
            targetScrollTime = scrollTime;
        }
        else {
            const diff = targetScrollTime - scrollTime;
            if (Math.abs(diff) < 0.5)
                scrollTime = targetScrollTime;
            else
                scrollTime += diff * 0.2;
            if (Math.abs(audio.currentTime * 1000 - scrollTime) > 100 && audio.readyState >= 2) {
                audio.currentTime = scrollTime / 1000;
            }
        }
        const currentTime = scrollTime;
        const visibleStartTime = currentTime - ((editorCanvas.height - PLAYHEAD_Y) / pxPerMs);
        const visibleEndTime = currentTime + (PLAYHEAD_Y / pxPerMs);
        // Draw Lanes
        if (!LANE_DEFS.length)
            calculateLaneLayout(editorCanvas.width);
        ctx.strokeStyle = '#333';
        LANE_DEFS.forEach(def => ctx.strokeRect(def.x, 0, def.width, editorCanvas.height));
        // Draw Grid
        let currBpm = initialBpm;
        let cTime = offset;
        const msPerBeat = 60000 / currBpm;
        // Temporary simplified grid logic for cleanliness
        const snapBeat = 4 / snapDenominator;
        const startBeatVal = Math.floor((visibleStartTime - offset) / msPerBeat / snapBeat) * snapBeat;
        for (let b = startBeatVal; b < startBeatVal + 100; b += snapBeat) {
            const time = offset + b * msPerBeat;
            if (time > visibleEndTime)
                break;
            const y = PLAYHEAD_Y - (time - currentTime) * pxPerMs;
            const isMeasure = Math.abs(b % 4) < 0.001;
            const isBeat = Math.abs(b % 1) < 0.001;
            if (isMeasure) {
                ctx.strokeStyle = '#666';
                ctx.lineWidth = 2;
            }
            else if (isBeat) {
                ctx.strokeStyle = '#444';
                ctx.lineWidth = 1;
            }
            else {
                ctx.strokeStyle = '#2d2d2d';
                ctx.lineWidth = 1;
            }
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(editorCanvas.width, y);
            ctx.stroke();
        }
        // Draw Notes
        function drawNote(lane, time, duration, isGhost = false, noteType) {
            const y = PLAYHEAD_Y - (time - currentTime) * pxPerMs;
            if (y > editorCanvas.height + 100 && duration === 0)
                return;
            let visualLane = -1;
            let color = '#fff';
            let isSpace = false;
            if (editorMode === '8key' || editorMode === '9key') {
                const mapping = [0, 1, 2, 3, 4, 5, 6, 7, 8];
                visualLane = mapping.indexOf(lane);
                if (lane === 4) {
                    color = '#00bcd4';
                    isSpace = true;
                } // Teal instead of Pink
                else
                    color = (visualLane % 2 === 0) ? '#7CA4FF' : '#ffffff';
            }
            else if (editorMode === '4key') {
                const mapping = [1, 3, 4, 6, 8];
                visualLane = mapping.indexOf(lane);
                if (lane === 4) {
                    color = '#00bcd4';
                    isSpace = true;
                }
            }
            else if (editorMode === '6key') {
                const mapping = [9, 1, 3, 4, 6, 8, 10];
                visualLane = mapping.indexOf(lane);
                if (lane === 4) {
                    color = '#00bcd4';
                    isSpace = true;
                }
            }
            else if (editorMode === '12key') {
                // Shared 6-lane mapping
                const whiteMapping = [9, 1, 3, 6, 8, 10];
                const blueMapping = [11, 0, 2, 5, 7, 12];
                visualLane = whiteMapping.indexOf(lane);
                if (visualLane === -1)
                    visualLane = blueMapping.indexOf(lane);
                // Color based on which set the lane belongs to
                if (whiteMapping.includes(lane))
                    color = '#ffffff';
                else if (blueMapping.includes(lane))
                    color = '#00bcd4'; // Match V1's brighter blue
            }
            if (visualLane === -1)
                return;
            if (noteType === 'sinking')
                color = '#ff3333'; // Bright Red
            else if (noteType === 'death')
                color = '#330000'; // Very Dark Red/Black
            const ld = LANE_DEFS[visualLane];
            if (!ld)
                return;
            if (isGhost)
                ctx.globalAlpha = 0.5;
            ctx.fillStyle = color;
            if (noteType === 'sinking' || noteType === 'death') {
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 2;
            }
            else {
                ctx.strokeStyle = 'rgba(0,0,0,0.3)';
                ctx.lineWidth = 1;
            }
            if (duration > 0) {
                const tailHeight = duration * pxPerMs;
                ctx.globalAlpha = isGhost ? 0.3 : 0.6;
                // Special rendering for long death notes
                if (noteType === 'death') {
                    ctx.fillStyle = '#330000'; // Dark Red
                }
                ctx.fillRect(ld.x + 2, y - tailHeight, ld.width - 4, tailHeight);
                ctx.globalAlpha = isGhost ? 0.5 : 1.0;
            }
            ctx.fillRect(ld.x, y - 5, ld.width, 10);
            ctx.strokeRect(ld.x, y - 5, ld.width, 10);
            if (noteType === 'sinking' || noteType === 'death') {
                ctx.fillStyle = '#fff';
                ctx.font = 'bold 12px Arial';
                ctx.textAlign = 'center';
                ctx.fillText(noteType === 'sinking' ? '!' : 'X', ld.x + ld.width / 2, y + 5);
            }
            if (isGhost)
                ctx.globalAlpha = 1.0;
        }
        if (pendingHold) {
            const ghostType = (customNoteType === 'sinking' || customNoteType === 'death') ? customNoteType : 'normal';
            drawNote(pendingHold.lane, pendingHold.time, 0, true, ghostType);
        }
        recordedNotes.forEach(note => drawNote(note.lane, note.time, note.duration, false, note.type));
        // Draw Layout & BPM Event Texts
        layoutChanges.forEach(lc => {
            const y = PLAYHEAD_Y - (lc.time - currentTime) * pxPerMs;
            if (y > 0 && y < editorCanvas.height) {
                ctx.fillStyle = '#e040fb';
                ctx.fillText(`Layout ${lc.type}`, 10, y - 5);
                ctx.strokeStyle = '#e040fb';
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(editorCanvas.width, y);
                ctx.stroke();
            }
        });
        bpmChanges.forEach(bc => {
            const y = PLAYHEAD_Y - (bc.time - currentTime) * pxPerMs;
            if (y > 0 && y < editorCanvas.height) {
                ctx.fillStyle = '#ffeb3b';
                ctx.fillText(`BPM ${bc.bpm}`, 10, y - 5);
                ctx.strokeStyle = '#ffeb3b';
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(editorCanvas.width, y);
                ctx.stroke();
            }
        });
        // Playhead
        ctx.strokeStyle = '#ff0000';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, PLAYHEAD_Y);
        ctx.lineTo(editorCanvas.width, PLAYHEAD_Y);
        ctx.stroke();
        // Layer Indicator (New)
        if (editorMode === '12key') {
            ctx.fillStyle = (editMode12k === 'white') ? '#ffffff' : '#00bcd4';
            ctx.font = 'bold 16px Arial';
            ctx.textAlign = 'left';
            ctx.fillText(`LAYER: ${editMode12k.toUpperCase()}`, 10, 25);
        }
    }
    // Export Logic
    function getChartJSONString() {
        const initialBpm = parseFloat(bpmInput.value) || 120;
        const offset = parseFloat(offsetInput.value) || 0;
        bpmChanges.sort((a, b) => a.time - b.time);
        let cTime = offset;
        let cBeat = 0;
        let cBpm = initialBpm;
        bpmChanges.forEach(bc => {
            const msPerBeat = 60000 / cBpm;
            bc.beat = cBeat + ((bc.time - cTime) / msPerBeat);
            cTime = bc.time;
            cBeat = bc.beat;
            cBpm = bc.bpm;
        });
        const getBeatFromTime = (time) => {
            let t = offset;
            let b = 0;
            let bpm = initialBpm;
            for (let i = 0; i < bpmChanges.length; i++) {
                const bc = bpmChanges[i];
                if (time >= bc.time) {
                    b += (bc.time - t) / (60000 / bpm);
                    t = bc.time;
                    bpm = bc.bpm;
                }
                else
                    break;
            }
            return b + (time - t) / (60000 / bpm);
        };
        const notes = recordedNotes.map(note => {
            const beat = Math.round(getBeatFromTime(note.time) * 1000) / 1000;
            const durBeat = Math.round((getBeatFromTime(note.time + note.duration) - beat) * 1000) / 1000;
            return {
                beat,
                lane: note.lane,
                duration: durBeat,
                type: (note.type && note.type !== 'normal') ? note.type : undefined
            };
        }).sort((a, b) => a.beat - b.beat);
        const layoutChangesOut = layoutChanges.map(lc => ({ beat: Math.round(getBeatFromTime(lc.time) * 1000) / 1000, type: lc.type })).sort((a, b) => a.beat - b.beat);
        const bpmChangesOut = bpmChanges.map(bc => ({ beat: Math.round(bc.beat * 1000) / 1000, bpm: bc.bpm }));
        const json = {
            mode: editorMode,
            difficulty: currentClass,
            bpm: initialBpm,
            offset: offset,
            notes: notes,
            layoutChanges: layoutChangesOut,
            bpmChanges: bpmChangesOut
        };
        const levelNum = parseInt(currentLevel);
        if (levelNum > 0)
            json.level = levelNum;
        return JSON.stringify(json, null, 2);
    }
    if (btnExport)
        btnExport.addEventListener('click', () => { txtOutput.value = getChartJSONString(); });
    const btnDownload = document.getElementById('btn-download');
    if (btnDownload) {
        btnDownload.addEventListener('click', () => {
            const content = getChartJSONString();
            txtOutput.value = content;
            let defaultName = 'chart.json';
            if (window.currentEditingFilename)
                defaultName = window.currentEditingFilename;
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
    const btnSaveDisk = document.getElementById('btn-save-disk');
    if (btnSaveDisk) {
        btnSaveDisk.addEventListener('click', () => __awaiter(this, void 0, void 0, function* () {
            const content = getChartJSONString();
            txtOutput.value = content;
            let targetPath = '';
            if (window.currentEditingFilename && window.currentEditingFolder) {
                targetPath = `songs/${window.currentEditingFolder}/${window.currentEditingFilename}`;
            }
            if (!targetPath) {
                const manualPath = prompt('Please enter the save path relatively to songs/ (e.g., knight_of_nights/new_chart.json):');
                if (!manualPath)
                    return;
                targetPath = `songs/${manualPath}`;
                const parts = manualPath.split('/');
                if (parts.length >= 2) {
                    window.currentEditingFolder = parts[0];
                    window.currentEditingFilename = parts[parts.length - 1];
                }
            }
            else {
                if (!confirm(`Save to "${targetPath}"?`))
                    return;
            }
            try {
                const res = yield fetch('/save', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ path: targetPath, content: content })
                });
                if (res.ok) {
                    alert('Saved!');
                    statusDiv.textContent = `Status: Saved to ${targetPath}`;
                }
                else {
                    const errText = yield res.text();
                    alert(`Save Failed: ${res.status} ${errText}`);
                }
            }
            catch (e) {
                alert('Error: ' + e);
            }
        }));
    }
})();
