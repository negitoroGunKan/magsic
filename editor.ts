(function () {
    // Keys Mapping (0-12)
    const KEYS = ['e', 'd', 'r', 'f', ' ', 'u', 'j', 'i', 'k', 's', 'l', 'w', 'o'];
    const LANE_COUNT = KEYS.length;

    // DEBUG: Confirm script execution
    // alert('Editor Script Attached'); // Commented out to reduce noise, but good for first check


    // State
    const audio = new Audio();

    interface RecordedNote {
        time: number;
        lane: number;
        duration: number; // Ms
    }

    interface LayoutChange {
        time: number;
        type: 'type-a' | 'type-b';
    }

    let recordedNotes: RecordedNote[] = [];
    let layoutChanges: LayoutChange[] = [];
    const activeHolds: { [lane: number]: number } = {}; // lane -> startTime (ms)

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
    const audioInput = document.getElementById('audio-input') as HTMLInputElement;
    const btnPlay = document.getElementById('btn-play') as HTMLButtonElement;
    const chkRecord = document.getElementById('chk-record') as HTMLInputElement;
    const btnExport = document.getElementById('btn-export') as HTMLButtonElement;
    const txtOutput = document.getElementById('output') as HTMLTextAreaElement;
    const statusDiv = document.getElementById('status') as HTMLDivElement;
    const bpmInput = document.getElementById('bpm') as HTMLInputElement;
    const offsetInput = document.getElementById('offset') as HTMLInputElement;
    const countdownOverlay = document.getElementById('countdown-overlay') as HTMLDivElement;

    // BPM Tools
    const btnTapBpm = document.getElementById('btn-tap-bpm') as HTMLButtonElement;
    const btnBpmMinus = document.getElementById('btn-bpm-minus') as HTMLButtonElement;
    const btnBpmPlus = document.getElementById('btn-bpm-plus') as HTMLButtonElement;

    // Editor UI
    const editorCanvas = document.getElementById('editor-canvas') as HTMLCanvasElement;
    const ctx = editorCanvas.getContext('2d');
    const snapSelect = document.getElementById('snap-select') as HTMLSelectElement;
    const zoomRange = document.getElementById('zoom-range') as HTMLInputElement;
    const chkMetronome = document.getElementById('chk-metronome') as HTMLInputElement;

    const syncTapCountDisp = document.getElementById('sync-tap-count') as HTMLSpanElement;
    const btnApplySync = document.getElementById('btn-apply-sync') as HTMLButtonElement;
    const btnResetSync = document.getElementById('btn-reset-sync') as HTMLButtonElement;
    const chkSyncShiftNotes = document.getElementById('chk-sync-shift-notes') as HTMLInputElement;

    // Metronome State
    let lastMetronomeBeat = -1;
    let audioCtx: AudioContext | null = null;
    let syncTapTimes: number[] = [];
    function getAudioCtx() {
        if (!audioCtx) audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        return audioCtx;
    }

    function beep(freq = 880, duration = 0.07) {
        const actx = getAudioCtx();
        if (actx.state === 'suspended') actx.resume();
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

    const levelSelect = document.getElementById('level-select') as HTMLSelectElement;
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

    if (!ctx) throw new Error('Canvas context not supported');

    // Audio Loading
    audioInput.addEventListener('change', () => {
        if (audioInput.files && audioInput.files[0]) {
            const file = audioInput.files[0];
            audio.src = URL.createObjectURL(file);
            statusDiv.textContent = 'Status: Audio Loaded';
        }
    });

    // Offset Change Listener (Manual Update)
    // When offset changes, the "Zero Point" moves.
    // Structural events (BPM, Layout) are usually Beat-based, so they should shift in Time to preserve Beat.
    // Notes... usually we want to "Calibrate" (move Grid, keep Notes on Audio) OR "Shift" (move Notes with Grid).
    // The user complaint implies the Grid moved away from the Structure.
    // So we will Shift Structure (BPM/Layout) to match the new Grid Zero.
    // We will NOT shift Notes by default (assuming user wants to align Grid to Audio/Notes).
    // (If they want to shift notes, they should use the Sync tool or shortcuts).

    let previousOffset = parseFloat(offsetInput.value) || 0;
    offsetInput.addEventListener('focus', () => {
        previousOffset = parseFloat(offsetInput.value) || 0;
    });
    offsetInput.addEventListener('change', () => {
        const newOffset = parseFloat(offsetInput.value) || 0;
        const diff = newOffset - previousOffset;

        if (diff !== 0) {
            // Shift BPM Changes
            bpmChanges.forEach(bc => {
                bc.time += diff;
            });
            // Shift Layout Changes
            layoutChanges.forEach(lc => {
                lc.time += diff;
            });

            // Note: We do NOT shift recordedNotes here. 
            // If the user wants to shift notes, they should use the shortcuts [ ] which do shift notes if checked.
            // Or use the Sync tool.
            // Changing the offset value directly is usually "Fixing the Grid start point".

            statusDiv.textContent = `Offset changed: ${previousOffset} -> ${newOffset}. BPM/Layouts shifted.`;
            previousOffset = newOffset;
        }
    });

    // Play/Pause
    const btnReset = document.getElementById('btn-reset') as HTMLButtonElement;

    btnReset.addEventListener('click', () => {
        if (!confirm('Are you sure you want to reset all recorded notes? This cannot be undone.')) return;

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
    let songList: any[] = [];

    // Load Song List
    // State for Flattened Song List (Index in Select -> { song, filename })
    interface SongOption {
        song: any;
        label: string;
        filename: string;
        mode?: string;
        diff?: string;
    }
    let flattenedSongOptions: SongOption[] = [];

    // Load Song List
    async function loadEditorSongList() {
        try {
            const res = await fetch('songs/list.json');
            songList = await res.json();
            flattenedSongOptions = [];

            const tableDiv = document.getElementById('song-table-body');
            if (tableDiv) tableDiv.innerHTML = '<tr><td colspan="3">Loading...</td></tr>';

            /*
            if (songSelect) {
                songSelect.innerHTML = '<option value="">-- Select Song --</option>'; 
            */

            const MODES = ['4key', '6key', '8key', '12key'];
            // Diff Keys: no=Normal, st=Standard, ad=Advanced, pr=Professional, et=Extreme
            const DIFFS = ['no', 'st', 'ad', 'pr', 'et'];

            const tableBody = document.getElementById('song-table-body');
            if (tableBody) tableBody.innerHTML = '';

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
                        } else {
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

                        if (tableBody) tableBody.appendChild(tr);
                    });
                });
            });

            if (statusDiv) statusDiv.textContent = `Status: Loaded ${flattenedSongOptions.length} chart options.`;

        } catch (e) {
            console.error('Failed to load song list', e);
            alert('Failed to load song list: ' + e);
            if (statusDiv) statusDiv.textContent = 'Status: Failed to load song list.';
        }
    }
    loadEditorSongList();



    async function loadSongByIndex(index: number) {
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
            const chartRes = await fetch(`songs/${song.folder}/${opt.filename}?t=${Date.now()}`);
            if (chartRes.ok) {
                const chartText = await chartRes.text();
                let text = chartText;
                if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

                const json = JSON.parse(text);
                importChartJSON(json);

                (window as any).currentEditingFilename = opt.filename;

                (window as any).currentEditingFolder = song.folder;
                statusDiv.textContent = `Status: Loaded ${opt.label}`;

                // Import Logic (btn-import) handled globally below
                (window as any).currentEditingFolder = song.folder;
                statusDiv.textContent = `Status: Loaded ${opt.label}`;

                // Auto-set Mode Selector
                const editorModeSelect = document.getElementById('editor-mode-select') as HTMLSelectElement;
                if (editorModeSelect && opt.mode) {
                    editorModeSelect.value = opt.mode;
                    // Trigger change manually to update grid
                    editorModeSelect.dispatchEvent(new Event('change'));
                }

            } else {
                // Start fresh if no chart (or missing file)
                recordedNotes.length = 0;
                bpmInput.value = song.bpm;
                offsetInput.value = '0';
                statusDiv.textContent = `Status: Created New Config for ${opt.label}`;

                (window as any).currentEditingFilename = opt.filename;
                (window as any).currentEditingFolder = song.folder;

                // Set Mode
                const editorModeSelect = document.getElementById('editor-mode-select') as HTMLSelectElement;
                if (editorModeSelect && opt.mode) {
                    editorModeSelect.value = opt.mode;
                    editorModeSelect.dispatchEvent(new Event('change'));
                }
            }

        } catch (e) {
            alert('Error loading song: ' + e);
        }
    }

    // BPM Change Logic
    interface BPMChange {
        time: number;
        bpm: number;
        beat: number; // calculated on export/import mainly, but useful to track
    }
    let bpmChanges: BPMChange[] = [];

    const bpmChangeValueInput = document.getElementById('bpm-change-value') as HTMLInputElement;

    // ... (Existing code) ...

    // Update Import Logic to include BPM Changes
    function importChartJSON(json: any) {
        try {
            const initialBpm = json.bpm || parseFloat(bpmInput.value) || 120;
            const offset = json.offset || 0;

            bpmInput.value = initialBpm;
            offsetInput.value = offset;

            // Import BPM Changes first to calculate times correctly
            bpmChanges = [];
            if (Array.isArray(json.bpmChanges)) {
                // If importing from JSON, we likely have 'beat'. We need 'time'.
                // Sort by beat
                json.bpmChanges.sort((a: any, b: any) => a.beat - b.beat);

                let currentTime = offset;
                let currentBeat = 0;
                let currentBpm = initialBpm;

                json.bpmChanges.forEach((bc: any) => {
                    // Calculate time from previous segment
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

            // Helper to get time from beat using variable BPM
            const getTimeFromBeat = (beat: number): number => {
                let time = offset;
                let b = 0;
                let bpm = initialBpm;

                for (let i = 0; i < bpmChanges.length; i++) {
                    const bc = bpmChanges[i];
                    if (beat >= bc.beat) {
                        time += (bc.beat - b) * (60000 / bpm);
                        b = bc.beat;
                        bpm = bc.bpm;
                    } else {
                        break;
                    }
                }
                time += (beat - b) * (60000 / bpm);
                return time;
            };

            // Clear existing
            recordedNotes.length = 0;

            // Import Notes
            if (Array.isArray(json.notes)) {
                json.notes.forEach((n: any) => {
                    // Start Time
                    const startTime = getTimeFromBeat(n.beat);
                    // Duration (approximate if spanning BPM change? For now assume constant BPM for duration or small enough)
                    // Actually Duration should be calculated based on beats too if it spans.
                    // But simpler: endBeat = n.beat + n.duration (in beats)
                    const endBeat = n.beat + (n.duration || 0);
                    const endTime = getTimeFromBeat(endBeat);

                    recordedNotes.push({
                        time: startTime,
                        lane: n.lane,
                        duration: endTime - startTime
                    });
                });
            }

            // Import Layout Changes
            layoutChanges.length = 0;
            if (Array.isArray(json.layoutChanges)) {
                json.layoutChanges.forEach((lc: any) => {
                    const time = getTimeFromBeat(lc.beat);
                    layoutChanges.push({
                        time: time,
                        type: lc.type
                    });
                });
            }

            // ... (Existing Difficulty/Level import) ...
            if (json.difficulty) currentClass = json.difficulty;
            if (json.level !== undefined && levelSelect) {
                levelSelect.value = json.level.toString();
                currentLevel = json.level.toString();
            }

            statusDiv.textContent = `Status: Loaded Chart (${recordedNotes.length} notes, ${bpmChanges.length} BPM changes)`;
            alert(`Loaded ${recordedNotes.length} notes, ${layoutChanges.length} layout changes, ${bpmChanges.length} BPM changes!`);

            audio.currentTime = 0;
            scrollTime = 0;

        } catch (err) {
            alert('Error parsing JSON: ' + err);
        }
    }

    // Update Click Logic to Add/Remove BPM Changes
    editorCanvas.addEventListener('mousedown', (e) => {
        // ... (Existing calculation of quantizedTime) ...
        // We need to inject logic before the existing note add logic or integrate it. 
        // Since I can't easily inject into the middle of the existing listener with replace, I will rewrite the listener.
        // Wait, I am replacing the whole file content? No, just a block.
        // I need to be careful. The previous code for mousedown is long.
        // I will target the `if (customNoteType === 'hold')` block and add `else if (customNoteType === 'bpm-change')`.
    });


    // Update Draw Logic to Visualize BPM changes
    // ... (Target existing draw loop) ...


    function startCountdown(): Promise<void> {
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
                } else {
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
        } else {
            // Play Request
            if (chkRecord.checked) {
                // Start Countdown
                btnPlay.disabled = true; // Prevent double click
                startCountdown().then(() => {
                    btnPlay.disabled = false;
                    startPlayback(true);
                });
            } else {
                // Immediate Start
                startPlayback(false);
            }
        }
    }

    function startPlayback(recording: boolean) {
        audio.play();
        isPlaying = true;
        btnPlay.textContent = 'Pause';

        isRecording = recording;
        if (isRecording) {
            statusDiv.textContent = 'Status: RECORDING...';
            statusDiv.classList.add('recording');
        } else {
            statusDiv.textContent = 'Status: Playing';
            statusDiv.classList.remove('recording');
        }
    }

    // Recording Logic
    window.addEventListener('keydown', (e) => {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

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
                if (!e.repeat) togglePlay();
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
                if (syncTapCountDisp) syncTapCountDisp.textContent = `${syncTapTimes.length} taps`;
            }
        }

        const currentKeyIndex = KEYS.indexOf(e.key.toLowerCase());
        if (!isPlaying || !isRecording) return;
        if (e.repeat) return; // Ignore hold-repeat events

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
            } else {
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
        if (e.key === 'ArrowUp') isUpPressed = false;
        if (e.key === 'ArrowDown') isDownPressed = false;

        if (!isPlaying || !isRecording) return;
        if (!isPlaying || !isRecording) return;

        const key = e.key.toLowerCase();
        const keyIndex = KEYS.indexOf(key);
        if (keyIndex !== -1) {
            // End Hold
            const startTime = activeHolds[keyIndex];
            if (startTime !== undefined) {
                const endTime = audio.currentTime * 1000;
                let duration = endTime - startTime;

                // Threshold: If < 100ms, treat as single tap (duration 0)
                if (duration < 100) duration = 0;

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
        for (const k in activeHolds) delete activeHolds[k];
    });

    // ==========================================
    // BPM Tools Logic
    // ==========================================

    let tapTimes: number[] = [];

    if (btnTapBpm) {
        btnTapBpm.addEventListener('click', () => {
            const now = Date.now();
            // Reset if gap > 2000ms
            if (tapTimes.length > 0 && now - tapTimes[tapTimes.length - 1] > 2000) {
                tapTimes = [];
            }
            tapTimes.push(now);
            // Constant window size of 5 for average
            if (tapTimes.length > 5) tapTimes.shift();

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
        } else {
            statusDiv.textContent = `Offset synced: Adjusted by ${roundedDev}ms. (Grid only)`;
        }

        // Clear taps
        syncTapTimes = [];
        if (syncTapCountDisp) syncTapCountDisp.textContent = '0 taps (Applied)';

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
            if (syncTapCountDisp) syncTapCountDisp.textContent = '0 taps';
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
    const noteTypeRadios = document.getElementsByName('note-type') as NodeListOf<HTMLInputElement>;
    let customNoteType: string = 'tap';
    let pendingHold: { lane: number, time: number } | null = null;

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
    const editLayerRadios = document.getElementsByName('edit-layer') as NodeListOf<HTMLInputElement>;
    const layerSelectorContainer = document.getElementById('layer-selector-container') as HTMLDivElement;
    let currentEditLayer: 'white' | 'blue' | 'space' = 'white';

    if (editLayerRadios) {
        editLayerRadios.forEach(radio => {
            radio.addEventListener('change', () => {
                if (radio.checked) {
                    currentEditLayer = radio.value as 'white' | 'blue' | 'space';
                    pendingHold = null;
                }
            });
        });
    }

    // Editor Mode Logic
    const editorModeSelect = document.getElementById('editor-mode-select') as HTMLSelectElement;
    let editorMode: '4key' | '6key' | '8key' | '9key' | '12key' = '9key';
    const visualEditorContainer = document.getElementById('visual-editor-container') as HTMLDivElement;

    // Default width per lane
    const LANE_WIDTH_4K = 50;
    const LANE_WIDTH_6K = 40;
    const LANE_WIDTH_8K = 40;
    const LANE_WIDTH_9K = 80; // Original
    const LANE_WIDTH_12K = 35;

    if (editorModeSelect) {
        editorModeSelect.addEventListener('change', () => {
            editorMode = editorModeSelect.value as '4key' | '6key' | '8key' | '9key' | '12key';
            pendingHold = null;

            // Update UI for mode
            let newWidth = 220;
            if (editorMode === '4key') newWidth = 220;
            else if (editorMode === '6key') newWidth = 300;
            else if (editorMode === '8key') newWidth = 400;
            else if (editorMode === '9key') newWidth = 800;
            else if (editorMode === '12key') newWidth = 500;

            if (visualEditorContainer) visualEditorContainer.style.width = `${newWidth}px`;
            editorCanvas.width = newWidth;
            calculateLaneLayout(editorCanvas.width);

            // Hide Layer Selector completely?
            // User requested it be visible in all modes
            if (layerSelectorContainer) layerSelectorContainer.style.display = 'block';
        });
        // Init logic
        editorModeSelect.dispatchEvent(new Event('change'));
    }

    // Import Logic
    const importInput = document.getElementById('import-input') as HTMLInputElement;
    if (importInput) {
        importInput.addEventListener('change', () => {
            if (importInput.files && importInput.files[0]) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        const json = JSON.parse(e.target?.result as string);
                        importChartJSON(json);
                    } catch (err) {
                        alert('Error parsing JSON: ' + err);
                    }
                };
                reader.readAsText(importInput.files[0]);
            }
        });
    }

    // Interaction: Smooth Scroll to Seek
    editorCanvas.addEventListener('wheel', (e) => {
        if (isPlaying) return;
        e.preventDefault();

        const sensitivity = 0.5;
        // DeltaY * (1/Zoom) * SpeedFactor
        const deltaMs = e.deltaY * sensitivity * (1 / zoomLevel) * 5;

        // Update Target
        targetScrollTime = Math.max(0, Math.min((audio.duration || 100) * 1000, targetScrollTime + deltaMs));

    }, { passive: false });

    // Lane Visual Layout
    interface LaneDef { x: number; width: number; }
    let LANE_DEFS: LaneDef[] = [];

    function calculateLaneLayout(canvasW: number) {
        if (!canvasW) canvasW = 800; // Safety fallback
        LANE_DEFS = [];
        if (editorMode === '9key') {
            // Original 9-lane logic
            const w = 80;
            const gap = 10;
            const spaceW = 120;
            let cx = 0;

            LANE_DEFS[0] = { x: cx, width: w }; cx += w;
            LANE_DEFS[1] = { x: cx, width: w }; cx += w;
            cx += gap;
            LANE_DEFS[2] = { x: cx, width: w }; cx += w;
            LANE_DEFS[3] = { x: cx, width: w }; cx += w;
            cx += gap;
            LANE_DEFS[4] = { x: cx, width: spaceW }; cx += spaceW;
            cx += gap;
            LANE_DEFS[5] = { x: cx, width: w }; cx += w;
            LANE_DEFS[6] = { x: cx, width: w }; cx += w;
            cx += gap;
            LANE_DEFS[7] = { x: cx, width: w }; cx += w;
            LANE_DEFS[8] = { x: cx, width: w }; cx += w;
        } else {
            // Generic linear layout
            let totalLanes = 4;
            if (editorMode === '4key') totalLanes = 5; // 4 + Space
            if (editorMode === '6key') totalLanes = 7; // 6 + Space
            if (editorMode === '8key') totalLanes = 9; // 8key + Space = 9 inputs
            if (editorMode === '12key') totalLanes = 13; // 12 + Space

            const w = Math.floor(canvasW / totalLanes);
            for (let i = 0; i < totalLanes; i++) {
                LANE_DEFS[i] = { x: i * w, width: w };
            }
        }
    }


    // Helper: Global Time/Beat Conversion
    const getBeatFromTimeGlobal = (time: number): number => {
        const initialBpm = parseFloat(bpmInput.value) || 120;
        const offset = parseFloat(offsetInput.value) || 0;
        const sorted = [...bpmChanges].sort((a, b) => a.time - b.time);

        let currentTp = { time: offset, bpm: initialBpm, beat: 0 };

        for (const change of sorted) {
            if (time >= change.time) {
                const msPerBeat = 60000 / currentTp.bpm;
                const deltaMs = change.time - currentTp.time;
                const deltaBeats = deltaMs / msPerBeat;
                currentTp = {
                    time: change.time,
                    bpm: change.bpm,
                    beat: currentTp.beat + deltaBeats
                };
            } else {
                break;
            }
        }
        const msPerBeat = 60000 / currentTp.bpm;
        return currentTp.beat + ((time - currentTp.time) / msPerBeat);
    };

    const getTimeFromBeatGlobal = (beat: number): number => {
        const initialBpm = parseFloat(bpmInput.value) || 120;
        const offset = parseFloat(offsetInput.value) || 0;
        const sorted = [...bpmChanges].sort((a, b) => a.time - b.time);

        // We first need to calculate the "beat" of each change to know where they fall
        // This is a bit inefficient to do every click, but safe.
        let changesWithBeats = [];
        let cTime = offset;
        let cBeat = 0;
        let cBpm = initialBpm;

        for (const change of sorted) {
            const msPerBeat = 60000 / cBpm;
            const deltaMs = change.time - cTime;
            const deltaBeats = deltaMs / msPerBeat;
            const changeBeat = cBeat + deltaBeats;

            changesWithBeats.push({ time: change.time, bpm: change.bpm, beat: changeBeat });

            cTime = change.time;
            cBeat = changeBeat;
            cBpm = change.bpm;
        }

        // Now find segment
        let currentTp = { time: offset, bpm: initialBpm, beat: 0 };
        for (const change of changesWithBeats) {
            if (beat >= change.beat) {
                currentTp = change;
            } else {
                break;
            }
        }

        const msPerBeat = 60000 / currentTp.bpm;
        return currentTp.time + ((beat - currentTp.beat) * msPerBeat);
    };

    // Interaction: Click to Add/Remove
    editorCanvas.addEventListener('mousedown', (e) => {
        const rect = editorCanvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Calculate clicked Lane
        if (!LANE_DEFS.length) calculateLaneLayout(editorCanvas.width);

        let clickedLane = -1;
        for (let i = 0; i < LANE_DEFS.length; i++) {
            const ld = LANE_DEFS[i];
            if (mouseX >= ld.x && mouseX < ld.x + ld.width) {
                clickedLane = i;
                break;
            }
        }
        if (clickedLane === -1) return; // Clicked in gap

        // Map Clicked Lane to Game Key Index
        let targetKeyIndex = -1;

        if (editorMode === '9key') {
            targetKeyIndex = clickedLane;
            const mapping = [1, 3, 4, 6, 8];
            targetKeyIndex = mapping[clickedLane];
        } else if (editorMode === '6key') {
            const mapping = [9, 1, 3, 4, 6, 8, 10];
            targetKeyIndex = mapping[clickedLane];
        } else if (editorMode === '8key') {
            const mapping = [0, 1, 2, 3, 4, 5, 6, 7, 8];
            targetKeyIndex = mapping[clickedLane];
        } else if (editorMode === '12key') {
            const mapping = [9, 11, 1, 0, 3, 2, 4, 5, 6, 7, 8, 12, 10];
            targetKeyIndex = mapping[clickedLane];
        }

        if (targetKeyIndex === -1) return;

        // Calculate clicked Time
        const pxPerMs = BASE_PX_PER_MS * zoomLevel;
        const currentTime = scrollTime; // Use visual time
        const clickedTimeRaw = currentTime + (PLAYHEAD_Y - mouseY) / pxPerMs;

        // Quantize Time (Variable BPM Aware)
        const clickedBeat = getBeatFromTimeGlobal(clickedTimeRaw);
        const snapBeat = 4 / snapDenominator;

        const n = Math.round(clickedBeat / snapBeat);
        const quantizedBeat = n * snapBeat;
        const quantizedTime = getTimeFromBeatGlobal(quantizedBeat);

        // Check if note exists nearby (tolerance of snap/2 in Time domain? Or pixel domain?)
        // Pixel domain is better for "clicking what you see".
        // Time tolerance:
        // const hitWindow = snapMs / 2; // Old
        // New: Convert 5px to ms? 
        const hitWindow = 50 / zoomLevel; // ~50ms worth of pixels?

        let existingNoteIndex = -1;
        existingNoteIndex = recordedNotes.findIndex(note =>
            note.lane === targetKeyIndex && Math.abs(note.time - quantizedTime) < hitWindow
        );

        if (existingNoteIndex !== -1) {
            // Remove
            recordedNotes.splice(existingNoteIndex, 1);
        } else {
            // Add Logic
            if (customNoteType === 'hold') {
                if (!pendingHold) {
                    // Click 1: Start
                    pendingHold = { lane: targetKeyIndex, time: quantizedTime };
                } else {
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
                    } else {
                        // Clicked different lane -> Move start point
                        pendingHold = { lane: targetKeyIndex, time: quantizedTime };
                    }
                }
            } else if (customNoteType === 'layout-a' || customNoteType === 'layout-b') {
                const type = (customNoteType === 'layout-a') ? 'type-a' : 'type-b';
                const existingIndex = layoutChanges.findIndex(lc => Math.abs(lc.time - quantizedTime) < hitWindow);

                if (existingIndex !== -1) {
                    layoutChanges.splice(existingIndex, 1);
                } else {
                    layoutChanges.push({ time: quantizedTime, type: type as 'type-a' | 'type-b' });
                }
                layoutChanges.sort((a, b) => a.time - b.time);
                pendingHold = null;

            } else if (customNoteType === 'bpm-change') {
                // BPM Change logic
                const existingIndex = bpmChanges.findIndex(bc => Math.abs(bc.time - quantizedTime) < hitWindow);

                if (existingIndex !== -1) {
                    bpmChanges.splice(existingIndex, 1);
                    alert(`Removed BPM Change at ${quantizedTime.toFixed(0)}ms`);
                } else {
                    const val = parseFloat(bpmChangeValueInput.value);
                    if (val > 0) {
                        bpmChanges.push({ time: quantizedTime, bpm: val, beat: 0 }); // Beat calculated later
                        bpmChanges.sort((a, b) => a.time - b.time);
                        alert(`Added BPM Change: ${val} at ${quantizedTime.toFixed(0)}ms`);
                    }
                }
                pendingHold = null;

            } else {
                // Click (Tap)
                recordedNotes.push({
                    time: quantizedTime,
                    lane: targetKeyIndex,
                    duration: 0
                });
                pendingHold = null;
            }
        }
    });// Render Loop
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
        } else {
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
                } else if (currentBeat < lastMetronomeBeat) {
                    // Reset if seek back
                    lastMetronomeBeat = currentBeat;
                }
            }
        }

        requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);

    function updateVisuals() {
        if (!ctx) return;

        // Clear
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, editorCanvas.width, editorCanvas.height);

        const initialBpm = parseFloat(bpmInput.value) || 110;
        const offset = parseFloat(offsetInput.value) || 0;
        const pxPerMs = BASE_PX_PER_MS * zoomLevel;

        if (isPlaying) {
            scrollTime = audio.currentTime * 1000;
            targetScrollTime = scrollTime;
        } else {
            const diff = targetScrollTime - scrollTime;
            if (Math.abs(diff) < 0.5) {
                scrollTime = targetScrollTime;
            } else {
                scrollTime += diff * 0.2;
            }
            if (Math.abs(audio.currentTime * 1000 - scrollTime) > 100 && audio.readyState >= 2) {
                audio.currentTime = scrollTime / 1000;
            }
        }

        const currentTime = scrollTime;

        // Draw Beat Grid (Variable BPM)
        const viewHeightMs = editorCanvas.height / pxPerMs;
        const visibleStartTime = currentTime - ((editorCanvas.height - PLAYHEAD_Y) / pxPerMs);
        const visibleEndTime = currentTime + (PLAYHEAD_Y / pxPerMs);

        // 1. Prepare Anchors (Segments with calculated Base Beat)
        // This ensures grid is continuous (aligned to beat 0 at offset)
        const sortedChanges = bpmChanges.map(c => ({ ...c })).sort((a, b) => a.time - b.time);

        interface BPMAnchor {
            startTime: number;
            endTime: number;
            bpm: number;
            baseTime: number;
            baseBeat: number;
        }

        const anchors: BPMAnchor[] = [];

        // Initial Segment: From -Infinity to First Change
        // Reference: Offset is Beat 0.
        // If first change is at Time T > Offset: 
        // Segment 0 covers [-Inf, T]. BaseTime=Offset, BaseBeat=0.
        // If first change is at Time T < Offset:
        // Segment 0 covers [-Inf, T]. Still BaseTime=Offset, BaseBeat=0? 
        // Actually, if we have changes before offset, we should respect them.
        // But for simplicity/robustness, let's assume "Initial BPM" governs everything before the first explicit change.
        // And we pin "Beat 0" to "Offset".

        let t = offset;
        let b = 0;
        let cBpm = initialBpm;

        // We need to advance t/b/bpm through changes to build anchors
        // But the first anchor is special (pre-changes).
        const firstChangeTime = sortedChanges.length > 0 ? sortedChanges[0].time : 999999999;

        anchors.push({
            startTime: -999999999,
            endTime: firstChangeTime,
            bpm: initialBpm,
            baseTime: offset,
            baseBeat: 0
        });

        // Calculate subsequent anchors
        // We start tracking from 'offset' generally, but if changes are before offset, 
        // we might strictly need to back-calculate. 
        // Let's assume sortedChanges are processed correctly from simplified "t=0" view? 
        // Actually, let's just trace from the first change found.

        // We need to know the beat of the FIRST change.
        // If first change is at T=1000, and Offset=0, BPM=120 (0.5s/beat).
        // Beat at T=1000 is 2.
        // So Anchor 1 starts at T=1000, Beat=2.

        // Logic:
        // 1. Find beat of sortedChanges[0] using InitialBPM and Offset.
        // 2. Iterate.

        if (sortedChanges.length > 0) {
            // Check if first change is before offset?
            // If change is at -1000, offset 0.
            // Beat = (-1000 - 0) / 500 = -2.
            // Correct.

            // Re-use logic:
            let currTime = offset;
            let currBeat = 0;
            let currBpm = initialBpm;

            // We need to bridge from 'currTime' to 'change.time'

            // Actually, simply iterate changes and push anchors.
            // But we need to link them.
            // The "Initial Anchor" above handles up to firstChangeTime.
            // So we just need to calculate the state AT firstChangeTime to start the loop?
            // Or just iterate changes, calculating delta from previous state.

            // We start state at Offset/0/Initial.
            // We process changes in order.

            // Warning: if changes are somehow before each other? Sorted handles that.

            for (let i = 0; i < sortedChanges.length; i++) {
                const change = sortedChanges[i];

                // Calculate beats passed since last state
                const msPerBeat = 60000 / currBpm;
                const deltaMs = change.time - currTime;
                const deltaBeats = deltaMs / msPerBeat;

                currBeat += deltaBeats;
                currTime = change.time;
                currBpm = change.bpm;

                const nextTime = (i + 1 < sortedChanges.length) ? sortedChanges[i + 1].time : 999999999;

                anchors.push({
                    startTime: change.time,
                    endTime: nextTime,
                    bpm: change.bpm,
                    baseTime: change.time,
                    baseBeat: currBeat
                });
            }
        }

        // Draw Loop
        anchors.forEach(anchor => {
            const segStart = Math.max(visibleStartTime, anchor.startTime);
            const segEnd = Math.min(visibleEndTime, anchor.endTime);

            if (segStart < segEnd) {
                const msPerBeat = 60000 / anchor.bpm;
                const snapBeat = 4 / snapDenominator;

                // Calculate start beat in this segment
                const elapsedSinceBase = segStart - anchor.baseTime;
                const beatsSinceBase = elapsedSinceBase / msPerBeat;
                const globalBeatStart = anchor.baseBeat + beatsSinceBase;

                // Snap to grid
                // We want b >= globalBeatStart such that b is multiple of snapBeat
                const startGridBeat = Math.ceil(globalBeatStart / snapBeat) * snapBeat;

                // We iterate until time > segEnd
                // Safety: Limit iterations to avoid freeze if snap is tiny or bug
                let safety = 0;

                for (let b = startGridBeat; safety < 1000; b += snapBeat) {
                    safety++;
                    const time = anchor.baseTime + (b - anchor.baseBeat) * msPerBeat;

                    if (time > segEnd + 1) break;

                    const y = PLAYHEAD_Y - (time - currentTime) * pxPerMs;

                    // Measure Check (Global Beat % 4)
                    // Use epsilon for float comparison
                    const isMeasure = Math.abs(b % 4) < 0.001 || Math.abs((b % 4) - 4) < 0.001;

                    if (isMeasure) {
                        ctx.strokeStyle = '#666';
                        ctx.lineWidth = 2; // Thicker for measure
                    } else {
                        // Beat Check (Global Beat % 1)
                        const isBeat = Math.abs(b % 1) < 0.001 || Math.abs((b % 1) - 1) < 0.001;
                        if (isBeat) {
                            ctx.strokeStyle = '#444';
                            ctx.lineWidth = 1;
                        } else {
                            ctx.strokeStyle = '#222'; // Subdivision
                            ctx.lineWidth = 1;
                        }
                    }

                    ctx.beginPath();
                    ctx.moveTo(0, y);
                    ctx.lineTo(editorCanvas.width, y);
                    ctx.stroke();
                }
            }
        });

        // Draw Layout Changes
        layoutChanges.forEach(lc => {
            const y = PLAYHEAD_Y - (lc.time - currentTime) * pxPerMs;
            if (y < 0 || y > editorCanvas.height) return;

            ctx.strokeStyle = '#e040fb';
            ctx.lineWidth = 3;
            ctx.setLineDash([10, 5]);
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(editorCanvas.width, y);
            ctx.stroke();
            ctx.setLineDash([]);

            ctx.fillStyle = '#e040fb';
            ctx.font = '12px Arial';
            ctx.fillText(lc.type.toUpperCase(), editorCanvas.width - 10, y - 5);
        });

        // Draw BPM Changes
        bpmChanges.forEach(bc => {
            const y = PLAYHEAD_Y - (bc.time - currentTime) * pxPerMs;
            if (y < 0 || y > editorCanvas.height) return;

            ctx.strokeStyle = '#ffeb3b'; // Yellow
            ctx.lineWidth = 3;
            ctx.setLineDash([5, 5]); // Dotted
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(editorCanvas.width, y);
            ctx.stroke();
            ctx.setLineDash([]);

            ctx.fillStyle = '#ffeb3b';
            ctx.font = 'bold 12px Arial';
            ctx.fillText(`BPM ${bc.bpm}`, editorCanvas.width - 10, y - 5);
        });

        if (!LANE_DEFS.length) calculateLaneLayout(editorCanvas.width);

        // Draw Lanes (Vertical Dividers)
        ctx.strokeStyle = '#444';
        LANE_DEFS.forEach(def => {
            ctx.strokeRect(def.x, 0, def.width, editorCanvas.height);
        });

        // Draw Active Holds (Visual feedback while holding)
        if (isRecording) {
            for (const laneStr in activeHolds) {
                const lane = parseInt(laneStr);
                const startTime = activeHolds[lane];

                let visualLane = -1;
                if (editorMode === '9key') {
                    visualLane = lane;
                } else {
                    let mapping: number[] = [];
                    if (editorMode === '4key') mapping = [1, 3, 4, 6, 8];
                    else if (editorMode === '6key') mapping = [9, 1, 3, 4, 6, 8, 10];
                    else if (editorMode === '8key') mapping = [0, 1, 2, 3, 4, 5, 6, 7, 8];
                    else if (editorMode === '12key') mapping = [9, 11, 1, 0, 3, 2, 4, 5, 6, 7, 8, 12, 10];

                    const idx = mapping.indexOf(lane);
                    if (idx !== -1) visualLane = idx;
                }

                if (visualLane === -1 || !LANE_DEFS[visualLane]) continue;
                const ld = LANE_DEFS[visualLane];

                const yHeadPos = PLAYHEAD_Y - (startTime - currentTime) * pxPerMs;
                const yTailPos = PLAYHEAD_Y; // Current time

                ctx.fillStyle = (lane === 4) ? 'rgba(224, 64, 251, 0.3)' : 'rgba(255, 255, 255, 0.3)';
                ctx.fillRect(ld.x + 2, yTailPos, ld.width - 4, yHeadPos - yTailPos);
            }
        }

        // Helper to draw a single note (Moved inside or kept global? It was inside updateVisuals in original)
        // In the original file (Step 506 line 1253), drawNote was inside updateVisuals.
        function drawNote(lane: number, time: number, duration: number, isGhost: boolean = false) {
            if (!ctx) return;
            const y = PLAYHEAD_Y - (time - currentTime) * pxPerMs;

            // Simple bounds check
            if (y > editorCanvas.height + 100 && duration === 0) return;
            // If hold, check tail
            if (duration > 0) {
                const tailY = y - duration * pxPerMs;
                if (tailY > editorCanvas.height && y > editorCanvas.height) return;
                if (y < -100 && tailY < -100) return;
            }

            let visualLane = -1;
            let color = '#ffffff';
            let isSpace = false;

            if (editorMode === '9key') {
                visualLane = lane;
                const whiteIndices = [1, 3, 6, 8];
                const blueIndices = [0, 2, 5, 7];
                if (whiteIndices.includes(lane)) color = '#ffffff';
                else if (blueIndices.includes(lane)) color = '#7CA4FF';
                else if (lane === 4) { color = '#e040fb'; isSpace = true; }
            } else {
                let mapping: number[] = [];
                if (editorMode === '4key') mapping = [1, 3, 4, 6, 8];
                else if (editorMode === '6key') mapping = [9, 1, 3, 4, 6, 8, 10];
                else if (editorMode === '8key') mapping = [0, 1, 2, 3, 4, 5, 6, 7, 8];
                else if (editorMode === '12key') mapping = [9, 11, 1, 0, 3, 2, 4, 5, 6, 7, 8, 12, 10];

                const idx = mapping.indexOf(lane);
                if (idx !== -1) {
                    visualLane = idx;
                    if (lane === 4) {
                        color = '#e040fb';
                        isSpace = true;
                    } else if (editorMode === '8key') {
                        color = (idx % 2 === 0) ? '#7CA4FF' : '#ffffff';
                    } else if (editorMode === '12key') {
                        const whiteKeys = [9, 1, 3, 6, 8, 10];
                        if (whiteKeys.includes(lane)) color = '#ffffff';
                        else color = '#7CA4FF';
                    } else {
                        color = '#ffffff';
                    }
                }
            }
            if (visualLane === -1 && !isSpace) return;

            if (isGhost) {
                ctx.globalAlpha = 0.5;
                if (isSpace && editorMode === '9key') {
                    ctx.fillStyle = 'rgba(224, 64, 251, 0.5)';
                    ctx.fillRect(0, y - 5, editorCanvas.width, 10);
                } else if (visualLane !== -1) {
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
            if (isSpace && editorMode === '9key') {
                const drawH = 15;
                ctx.globalAlpha = 0.5;
                if (duration > 0) {
                    const tailHeight = duration * pxPerMs;
                    ctx.fillRect(0, y - tailHeight, editorCanvas.width, tailHeight);
                }
                ctx.fillRect(0, y - drawH / 2, editorCanvas.width, drawH);
                ctx.globalAlpha = 1.0;
            } else if (visualLane !== -1) {
                const ld = LANE_DEFS[visualLane];
                if (!ld) return;
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

        // Draw Notes
        if (pendingHold && pendingHold.lane === 4) {
            drawNote(pendingHold.lane, pendingHold.time, 0, true);
        }
        recordedNotes.forEach(note => {
            if (note.lane === 4) drawNote(note.lane, note.time, note.duration);
        });

        if (pendingHold && pendingHold.lane !== 4) {
            drawNote(pendingHold.lane, pendingHold.time, 0, true);
        }
        recordedNotes.forEach(note => {
            if (note.lane !== 4) drawNote(note.lane, note.time, note.duration);
        });

        // Draw Playhead
        ctx.strokeStyle = '#ff0000';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, PLAYHEAD_Y);
        ctx.lineTo(editorCanvas.width, PLAYHEAD_Y);
        ctx.stroke();
    }

    function getChartJSONString() {
        const initialBpm = parseFloat(bpmInput.value) || 120;
        const offset = parseFloat(offsetInput.value) || 0;

        bpmChanges.sort((a, b) => a.time - b.time);

        // 1. Calculate Beats for BPM Changes
        let cTime = offset;
        let cBeat = 0;
        let cBpm = initialBpm;

        bpmChanges.forEach(bc => {
            const msPerBeat = 60000 / cBpm;
            const deltaMs = bc.time - cTime;
            const deltaBeats = deltaMs / msPerBeat;
            bc.beat = cBeat + deltaBeats;
            cTime = bc.time;
            cBeat = bc.beat;
            cBpm = bc.bpm;
        });

        // 2. Helper
        const getBeatFromTime = (time: number): number => {
            let t = offset;
            let b = 0;
            let bpm = initialBpm;
            for (let i = 0; i < bpmChanges.length; i++) {
                const bc = bpmChanges[i];
                if (time >= bc.time) {
                    const msPerBeat = 60000 / bpm;
                    b += (bc.time - t) / msPerBeat;
                    t = bc.time;
                    bpm = bc.bpm;
                } else {
                    break;
                }
            }
            const msPerBeat = 60000 / bpm;
            b += (time - t) / msPerBeat;
            return b;
        };

        // 3. Notes
        const notes = recordedNotes.map(note => {
            const beat = Math.round(getBeatFromTime(note.time) * 1000) / 1000;
            const endBeat = getBeatFromTime(note.time + note.duration);
            const durBeat = Math.round((endBeat - beat) * 1000) / 1000;
            return { beat, lane: note.lane, duration: durBeat };
        }).sort((a, b) => a.beat - b.beat);

        // 4. Layout
        const layoutChangesOut = layoutChanges.map(lc => ({
            beat: Math.round(getBeatFromTime(lc.time) * 1000) / 1000,
            type: lc.type
        })).sort((a, b) => a.beat - b.beat);

        // 5. BPM
        const bpmChangesOut = bpmChanges.map(bc => ({
            beat: Math.round(bc.beat * 1000) / 1000,
            bpm: bc.bpm
        }));

        const json: any = {
            mode: editorMode,
            difficulty: currentClass,
            bpm: initialBpm,
            offset: offset,
            notes: notes,
            layoutChanges: layoutChangesOut,
            bpmChanges: bpmChangesOut
        };
        const levelNum = parseInt(currentLevel);
        if (levelNum > 0) json.level = levelNum;

        return JSON.stringify(json, null, 2);
    }

    if (btnExport) {
        btnExport.addEventListener('click', () => {
            txtOutput.value = getChartJSONString();
        });
    }

    const btnDownload = document.getElementById('btn-download') as HTMLButtonElement;
    if (btnDownload) {
        btnDownload.addEventListener('click', () => {
            const content = getChartJSONString();
            txtOutput.value = content;
            let defaultName = 'chart.json';
            if ((window as any).currentEditingFilename) defaultName = (window as any).currentEditingFilename;

            const filename = prompt('Enter filename to save as:', defaultName);
            if (!filename) return;

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

    const btnSaveDisk = document.getElementById('btn-save-disk') as HTMLButtonElement;
    if (btnSaveDisk) {
        btnSaveDisk.addEventListener('click', async () => {
            const content = getChartJSONString();
            txtOutput.value = content;
            let targetPath = '';
            if ((window as any).currentEditingFilename && (window as any).currentEditingFolder) {
                targetPath = `songs/${(window as any).currentEditingFolder}/${(window as any).currentEditingFilename}`;
            }
            if (!targetPath) {
                alert('Please load a song first.');
                return;
            }
            if (!confirm(`Save to "${targetPath}"?`)) return;
            try {
                const res = await fetch('/save', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ path: targetPath, content: content })
                });
                if (res.ok) {
                    alert('Saved!');
                    statusDiv.textContent = `Status: Saved to ${targetPath}`;
                } else {
                    alert('Save Failed');
                }
            } catch (e) { alert('Error: ' + e); }
        });
    }
})();
