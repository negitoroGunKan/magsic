(() => {
    // Keys Mapping
    const KEYS = ['e', 'd', 'r', 'f', ' ', 'u', 'j', 'i', 'k'];
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

    let recordedNotes: RecordedNote[] = [];
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
    const BASE_PX_PER_MS = 0.5; // Matches game base speed roughly
    const PLAYHEAD_Y = 500; // Y position of the "current time" line from top of canvas
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

    if (!ctx) throw new Error('Canvas context not supported');

    // Audio Loading
    audioInput.addEventListener('change', () => {
        if (audioInput.files && audioInput.files[0]) {
            const file = audioInput.files[0];
            audio.src = URL.createObjectURL(file);
            statusDiv.textContent = 'Status: Audio Loaded';
        }
    });

    // Play/Pause
    const btnReset = document.getElementById('btn-reset') as HTMLButtonElement;

    btnReset.addEventListener('click', () => {
        recordedNotes.length = 0;
        statusDiv.textContent = 'Status: Reset (0 notes)';
        txtOutput.value = '';
        if (isPlaying) {
            audio.currentTime = 0;
        }
    });

    // Song Selection Logic
    const songSelect = document.getElementById('song-select') as HTMLSelectElement;
    const btnLoadSong = document.getElementById('btn-load-song') as HTMLButtonElement;
    let songList: any[] = [];

    // Load Song List
    async function loadEditorSongList() {
        try {
            const res = await fetch('songs/list.json');
            songList = await res.json();

            if (songSelect) {
                songSelect.innerHTML = '<option value="">-- Select Song --</option>';
                songList.forEach((song, index) => {
                    const opt = document.createElement('option');
                    opt.value = index.toString();
                    opt.textContent = `${song.title} - ${song.artist}`;
                    songSelect.appendChild(opt);
                });
                // alert(`Loaded ${songList.length} songs into list.`);
            }
        } catch (e) {
            console.error('Failed to load song list', e);
            alert('Failed to load song list: ' + e);
            if (statusDiv) statusDiv.textContent = 'Status: Failed to load song list.';
        }
    }
    loadEditorSongList();

    if (btnLoadSong && songSelect) {
        btnLoadSong.addEventListener('click', async () => {
            const index = parseInt(songSelect.value);
            if (isNaN(index) || !songList[index]) {
                alert('Please select a song from the list first.');
                return;
            }

            const song = songList[index];
            statusDiv.textContent = `Status: Loading ${song.title}...`;
            // alert(`Loading ${song.title}...`);

            try {
                // 1. Load Audio
                audio.src = `songs/${song.folder}/${song.audio}`;

                // 2. Load Chart (if exists)
                const chartRes = await fetch(`songs/${song.folder}/${song.chart}`);
                if (chartRes.ok) {
                    const chartText = await chartRes.text();
                    let text = chartText;
                    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

                    const json = JSON.parse(text);
                    importChartJSON(json);
                } else {
                    // Start fresh if no chart
                    recordedNotes.length = 0;
                    bpmInput.value = song.bpm;
                    offsetInput.value = '0';
                    statusDiv.textContent = `Status: Loaded ${song.title} (New Chart)`;
                }

            } catch (e) {
                alert('Error loading song: ' + e);
            }
        });
    }

    function importChartJSON(json: any) {
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
                json.notes.forEach((n: any) => {
                    const time = offset + (n.beat * msPerBeat);
                    const duration = (n.duration || 0) * msPerBeat;
                    recordedNotes.push({
                        time: time,
                        lane: n.lane,
                        duration: duration
                    });
                });
            }

            statusDiv.textContent = `Status: Loaded Chart (${recordedNotes.length} notes)`;
            alert(`Loaded ${recordedNotes.length} notes successfully!`);

            // Seek to start
            audio.currentTime = 0;
            scrollTime = 0;

        } catch (err) {
            alert('Error parsing JSON: ' + err);
        }
    }

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
            if (!e.repeat) togglePlay();
            return;
        }

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
    // const holdLengthInput = document.getElementById('hold-length') as HTMLInputElement; // Removed
    const noteTypeRadios = document.getElementsByName('note-type') as NodeListOf<HTMLInputElement>;
    let customNoteType = 'tap';
    let pendingHold: { lane: number, time: number } | null = null;

    if (noteTypeRadios) {
        noteTypeRadios.forEach(radio => {
            radio.addEventListener('change', () => {
                if (radio.checked) {
                    customNoteType = radio.value;
                    // Cancel pending hold if switching modes
                    pendingHold = null;
                }
            });
        });
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

    // Interaction: Click to Add/Remove
    editorCanvas.addEventListener('mousedown', (e) => {
        const rect = editorCanvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Calculate clicked Lane
        const laneWidth = editorCanvas.width / LANE_COUNT;
        const clickedLane = Math.floor(mouseX / laneWidth);
        if (clickedLane < 0 || clickedLane >= LANE_COUNT) return;

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
        const existingNoteIndex = recordedNotes.findIndex(note =>
            note.lane === clickedLane && Math.abs(note.time - quantizedTime) < hitWindow
        );

        if (existingNoteIndex !== -1) {
            // Remove
            recordedNotes.splice(existingNoteIndex, 1);
            // If we removed a note while pending, do we cancel pending? 
            // Maybe not.
        } else {
            // Add Logic
            if (customNoteType === 'hold') {
                if (!pendingHold) {
                    // Click 1: Start
                    pendingHold = { lane: clickedLane, time: quantizedTime };
                } else {
                    // Click 2: End
                    if (pendingHold.lane === clickedLane) {
                        const start = Math.min(pendingHold.time, quantizedTime);
                        const end = Math.max(pendingHold.time, quantizedTime);
                        const duration = end - start;

                        // Only add if duration > 0 (or allow 0 for tap in hold mode?)
                        // If duration is 0, it's just a tap.

                        recordedNotes.push({
                            time: start,
                            lane: clickedLane,
                            duration: duration
                        });
                        pendingHold = null;

                    } else {
                        // Clicked different lane -> Move start point
                        pendingHold = { lane: clickedLane, time: quantizedTime };
                    }
                }
            } else {
                // Click (Tap)
                recordedNotes.push({
                    time: quantizedTime,
                    lane: clickedLane,
                    duration: 0
                });
                pendingHold = null;
            }
        }
    });

    // Render Loop
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

        requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);

    function updateVisuals() {
        if (!ctx) return;

        // Clear
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, editorCanvas.width, editorCanvas.height);

        const bpm = parseFloat(bpmInput.value) || 110;
        const offset = parseFloat(offsetInput.value) || 0;
        const pxPerMs = BASE_PX_PER_MS * zoomLevel;

        if (isPlaying) {
            scrollTime = audio.currentTime * 1000;
            targetScrollTime = scrollTime; // Keep target synced while playing
        } else {
            // LERP towards target
            const diff = targetScrollTime - scrollTime;
            if (Math.abs(diff) < 0.5) {
                scrollTime = targetScrollTime;
            } else {
                scrollTime += diff * 0.2; // 20% smoothing per frame
            }

            // Lazy Sync Audio (only if significant drift and audio is ready)
            if (Math.abs(audio.currentTime * 1000 - scrollTime) > 100 && audio.readyState >= 2) {
                audio.currentTime = scrollTime / 1000;
            }
        }

        const currentTime = scrollTime;
        const laneWidth = editorCanvas.width / LANE_COUNT;

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
                for (let s = 1; s < (1 / step); s++) {
                    const subTime = beatTime + (s * subMs);
                    const subY = PLAYHEAD_Y - (subTime - currentTime) * pxPerMs;
                    ctx.beginPath();
                    ctx.moveTo(0, subY);
                    ctx.lineTo(editorCanvas.width, subY);
                    ctx.stroke();
                }
            }
        }

        // Draw Lanes
        ctx.strokeStyle = '#444';
        for (let i = 1; i < LANE_COUNT; i++) {
            const x = i * laneWidth;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, editorCanvas.height);
            ctx.stroke();
        }

        // Draw Active Holds (Visual feedback while holding)
        // Only if recording
        if (isRecording) {
            for (const laneStr in activeHolds) {
                const lane = parseInt(laneStr);
                const startTime = activeHolds[lane];
                const duration = currentTime - startTime;

                // Draw current hold
                const yHead = PLAYHEAD_Y - (startTime - currentTime) * pxPerMs; // This puts head at timeline
                // Wait, startTime is usually currentTime if just pressed.
                // If I press now (currentTime), yHead = PLAYHEAD_Y.
                // As time passes, currentTime increases. existing startTime is "past".
                // (startTime - currentTime) becomes negative.
                // yHead - (-neg) * pxPerMs -> yHead moves down?
                // y = PH - (past - current) * P = PH - (-diff) * P = PH + diff*P.
                // Past notes move DOWN. Future notes (above) come DOWN.
                // So head is moving DOWN from playhead.
                // Tail end is NOW (currentTime). yTail = PLAYHEAD_Y.
                // So draw from Head (lower) to Tail (playhead).
                // yHead is > PLAYHEAD_Y.
                // Rect from yHead upwards to PLAYHEAD_Y.

                const yHeadPos = PLAYHEAD_Y - (startTime - currentTime) * pxPerMs;
                const yTailPos = PLAYHEAD_Y; // Current time

                const x = lane * laneWidth;

                ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
                // Rect top-left X, Y, W, H.
                // yTailPos is TOP (smaller Y). yHeadPos is BOTTOM (larger Y).
                ctx.fillRect(x + 2, yTailPos, laneWidth - 4, yHeadPos - yTailPos);
            }
        }

        // Draw Pending Hold (Click-Click Mode)
        if (pendingHold) {
            const lane = pendingHold.lane;
            const time = pendingHold.time;
            const y = PLAYHEAD_Y - (time - currentTime) * pxPerMs;
            const x = lane * laneWidth;

            // Draw ghost head
            ctx.fillStyle = 'rgba(255, 255, 0, 0.5)'; // Yellow tint
            ctx.fillRect(x + 2, y - 5, laneWidth - 4, 10);

            // Draw cross or circle to mark exact spot
            ctx.strokeStyle = '#ffff00';
            ctx.lineWidth = 2;
            ctx.strokeRect(x + 2, y - 5, laneWidth - 4, 10);
        }

        // Draw Recorded Notes
        recordedNotes.forEach(note => {
            // Note visible?
            // Note spans from note.time to note.time + duration.
            const noteStart = note.time;
            const noteEnd = note.time + note.duration;

            // Check visibility overlap
            if (noteEnd < startTime - 1000 || noteStart > endTime + 1000) return;

            const x = note.lane * laneWidth;

            // Colors
            // E D R F Sp U J I K
            // 0 1 2 3 4  5 6 7 8
            let color = '#7CA4FF'; // default blue
            if ([1, 3, 6, 8].includes(note.lane)) color = '#ffffff'; // white
            if (note.lane === 4) color = '#e040fb'; // Purple

            ctx.fillStyle = color;

            // Head Position
            // y = PH - (time - current) * P
            const y = PLAYHEAD_Y - (note.time - currentTime) * pxPerMs;

            // Draw Long Note Tail
            if (note.duration > 0) {
                const tailHeight = note.duration * pxPerMs;
                // Tail extends UPWARDS from head?
                // note.time is START. note.time+duration is END (Future).
                // Future is ABOVE.
                // So Tail Y (end) < Head Y (start).
                // Tail Y = y - tailHeight.

                ctx.globalAlpha = 0.5;
                ctx.fillRect(x + 4, y - tailHeight, laneWidth - 8, tailHeight);
                ctx.globalAlpha = 1.0;
            }

            // Head
            const noteH = 10;
            ctx.fillRect(x + 2, y - noteH / 2, laneWidth - 4, noteH);
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

        const json = {
            bpm: bpm,
            offset: offset,
            notes: notes
        };
        return JSON.stringify(json, null, 2);
    }

    // Export Button
    btnExport.addEventListener('click', () => {
        txtOutput.value = getChartJSONString();
    });

    // Download Logic
    const btnDownload = document.getElementById('btn-download') as HTMLButtonElement;
    if (btnDownload) {
        btnDownload.addEventListener('click', () => {
            // Auto-export current state
            const content = getChartJSONString();
            txtOutput.value = content; // Update text area too for visibility

            // Get filename
            let defaultName = 'chart.json';
            if (songSelect && songList) {
                const index = parseInt(songSelect.value);
                if (!isNaN(index) && songList[index]) {
                    const song = songList[index];
                    defaultName = song.chart || 'chart.json';
                }
            }

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

    // Save to Disk (Server) Logic
    const btnSaveDisk = document.getElementById('btn-save-disk') as HTMLButtonElement;
    if (btnSaveDisk) {
        btnSaveDisk.addEventListener('click', async () => {
            // Auto-export
            const content = getChartJSONString();
            txtOutput.value = content;

            // Determine Target Path
            let targetPath = '';
            // We need the relative path from root, e.g. "songs/熱異常/netsu_ijo_chart.txt"
            if (songSelect && songList) {
                const index = parseInt(songSelect.value);
                if (!isNaN(index) && songList[index]) {
                    const song = songList[index];
                    const chartName = song.chart || 'chart.txt';
                    targetPath = `songs/${song.folder}/${chartName}`;
                }
            }

            if (!targetPath) {
                alert('Please load a song first from the list so we know where to save.');
                return;
            }

            if (!confirm(`Save to "${targetPath}"? This will overwrite the file.`)) return;

            try {
                const res = await fetch('/save', {
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
                } else {
                    const errText = await res.text();
                    alert('Save Failed: ' + errText);
                }
            } catch (e) {
                alert('Save Error: ' + e);
                console.error(e);
            }
        });
    }

})();
