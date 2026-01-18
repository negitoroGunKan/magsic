(() => {
    console.log('Magusic script executing...');
    // alert('Script Loaded 2.0'); // Un-comment to verify reload

    // Check for button immediately
    const checkBtn = document.getElementById('btn-calibrate');
    if (!checkBtn) {
        console.error('Critical: btn-calibrate NOT FOUND in DOM on load');
    } else {
        console.log('btn-calibrate found!');
        checkBtn.addEventListener('click', () => console.log('Direct Click Handler!'));
    }
    // Canvas Setup
    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context not supported');

    // UI Elements
    const btnRandom = document.getElementById('btn-random') as HTMLButtonElement;
    const btnChart = document.getElementById('btn-chart') as HTMLButtonElement;
    const audioInput = document.getElementById('audio-input') as HTMLInputElement;
    const chartInput = document.getElementById('chart-input') as HTMLInputElement;
    const controlsDiv = document.getElementById('controls') as HTMLDivElement;
    const speedInput = document.getElementById('speed-input') as HTMLInputElement;
    const speedDisplay = document.getElementById('speed-display') as HTMLSpanElement;
    const laneWidthInput = document.getElementById('lane-width-input') as HTMLInputElement;
    const laneWidthDisplay = document.getElementById('lane-width-display') as HTMLSpanElement;

    // Results UI
    const resultsOverlay = document.getElementById('results-overlay') as HTMLDivElement;
    const resPerfect = document.getElementById('res-perfect') as HTMLSpanElement;
    const resGreat = document.getElementById('res-great') as HTMLSpanElement;
    const resNice = document.getElementById('res-nice') as HTMLSpanElement;
    const resBad = document.getElementById('res-bad') as HTMLSpanElement;
    const resMiss = document.getElementById('res-miss') as HTMLSpanElement;
    const resCombo = document.getElementById('res-combo') as HTMLSpanElement;
    const resAvg = document.getElementById('res-avg') as HTMLSpanElement;
    const btnCloseResults = document.getElementById('btn-close-results') as HTMLButtonElement;

    // Offset Controls
    const offsetInput = document.getElementById('offset-input') as HTMLInputElement;
    const offsetDisplay = document.getElementById('offset-display') as HTMLSpanElement;
    let globalOffset = 0;

    // Calibration UI
    const calibrationOverlay = document.getElementById('calibration-overlay') as HTMLDivElement;
    const btnCalibrate = document.getElementById('btn-calibrate') as HTMLButtonElement;
    const btnCancelCalibration = document.getElementById('btn-cancel-calibration') as HTMLButtonElement;
    const calibrationVisual = document.getElementById('calibration-visual') as HTMLDivElement;
    const calibrationStatus = document.getElementById('calibration-status') as HTMLParagraphElement;

    // Song Select UI
    const btnSelectSong = document.getElementById('btn-select-song') as HTMLButtonElement;
    const songSelectOverlay = document.getElementById('song-select-overlay') as HTMLDivElement;
    const songListDiv = document.getElementById('song-list') as HTMLDivElement;
    const btnCloseSelect = document.getElementById('btn-close-select') as HTMLButtonElement;

    // Start Screen UI
    const startScreen = document.getElementById('start-screen') as HTMLDivElement;
    const btnStartSelect = document.getElementById('btn-start-select') as HTMLButtonElement;

    if (btnCloseResults) {
        btnCloseResults.addEventListener('click', () => {
            resultsOverlay.style.display = 'none';
            // Return to start screen or controls? 
            // Usually Result -> Select Screen or Start Screen.
            if (startScreen) startScreen.style.display = 'flex';
            controlsDiv.style.display = 'block'; // Make drawer available
            if (controlsDiv.classList.contains('open')) controlsDiv.classList.remove('open');
            songSelectOverlay.style.display = 'none';
        });
    }

    function openSongSelect() {
        if (startScreen) startScreen.style.display = 'none';
        controlsDiv.classList.remove('open'); // Close drawer if open
        songSelectOverlay.style.display = 'block';
        loadSongList();
    }

    if (btnStartSelect) {
        btnStartSelect.addEventListener('click', openSongSelect);
    }

    // Song Select Event Listeners
    if (btnSelectSong) {
        btnSelectSong.addEventListener('click', openSongSelect);
    }

    // ... Skipping lines, moving to btnRandom ...

    // Deleted duplicate handler block



    // Input handling logic removed from here (it exists at the bottom)



    if (btnCalibrate) {
        btnCalibrate.addEventListener('click', startCalibration);
    }
    if (btnCancelCalibration) {
        btnCancelCalibration.addEventListener('click', stopCalibration);
    }

    if (offsetInput && offsetDisplay) {
        offsetInput.addEventListener('input', () => {
            const val = parseInt(offsetInput.value);
            globalOffset = val;
            offsetDisplay.textContent = val.toString();
        });
    }

    // Option Drawer Toggle
    const btnOptionsToggle = document.getElementById('btn-options-toggle');
    if (btnOptionsToggle && controlsDiv) {
        btnOptionsToggle.addEventListener('click', (e) => {
            e.stopPropagation(); // Stop bubbling
            controlsDiv.classList.toggle('open');
        });

        document.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            if (controlsDiv.classList.contains('open')) {
                // If click is NOT inside drawer AND NOT the toggle button
                if (!controlsDiv.contains(target) && target !== btnOptionsToggle) {
                    controlsDiv.classList.remove('open');
                }
            }
        });
    }

    // Game Config
    let currentLaneWidth = 100;
    const KEYS = ['e', 'd', 'r', 'f', ' ', 'u', 'j', 'i', 'k'];
    const NOTE_HEIGHT = 10;

    // Speed Configuration
    const BASE_NOTE_SPEED = 0.5; // Base speed (x1.0)
    let currentNoteSpeed = BASE_NOTE_SPEED * 2.5; // Default x2.5
    let HIT_Y = 0; // Calculated on resize

    // Skin Assets
    const SKIN: { [key: string]: HTMLImageElement | null } = {
        white: null,
        blue: null,
        space: null,
        titleBg: null,
        gameBg: null
    };

    function loadSkin() {
        const assets = [
            { key: 'white', src: 'assets/note_white.png' },
            { key: 'blue', src: 'assets/note_blue.png' },
            { key: 'space', src: 'assets/note_space.png' },
            { key: 'titleBg', src: 'assets/title_bg.png' },
            { key: 'selectBg', src: 'assets/select_bg.png' },
            { key: 'gameBg', src: 'assets/game_bg.png' }
        ];

        assets.forEach(a => {
            const img = new Image();
            img.src = a.src;
            img.onload = () => {
                SKIN[a.key] = img;

                // Specific Logic for HTML elements
                if (a.key === 'selectBg') {
                    // Override default rgba background
                    if (songSelectOverlay) {
                        songSelectOverlay.style.background = `url(${a.src}) no-repeat center center / cover`;
                    }
                }
            };
            // onerror: silently fail -> fallback to null, keep default style
        });
    }
    loadSkin();

    // Layout Configuration
    interface LaneConfig {
        x: number;
        width: number;
        color: string;
        label: string;
    }
    let LANE_CONFIGS: LaneConfig[] = [];
    let laneStartX = 0;

    // Judgement Configuration (ms)
    const THRESHOLD_PERFECT = 33;
    const THRESHOLD_GREAT = 66;
    const THRESHOLD_NICE = 100;
    const THRESHOLD_BAD = 133;
    const MISS_BOUNDARY = 150;

    // Stats
    interface GameStats {
        perfect: number;
        great: number;
        nice: number;
        bad: number;
        miss: number;
        combo: number;
        maxCombo: number;
        totalErrorMs: number;
        hitCount: number;
    }
    let stats: GameStats = {
        perfect: 0, great: 0, nice: 0, bad: 0, miss: 0, combo: 0, maxCombo: 0, totalErrorMs: 0, hitCount: 0
    };

    function resetStats() {
        stats = { perfect: 0, great: 0, nice: 0, bad: 0, miss: 0, combo: 0, maxCombo: 0, totalErrorMs: 0, hitCount: 0 };
    }

    function addHit(type: 'perfect' | 'great' | 'nice' | 'bad' | 'miss', errorMs: number = 0) {
        stats[type]++;
        if (type !== 'miss') {
            stats.totalErrorMs += errorMs;
            stats.hitCount++;
        }

        if (type === 'miss' || type === 'bad') {
            stats.combo = 0;
        } else {
            stats.combo++;
            if (stats.combo > stats.maxCombo) {
                stats.maxCombo = stats.combo;
            }
        }
    }


    // Calibration State
    let isCalibrating = false;
    let calibrationStartTime = 0;
    const CALIBRATION_BPM = 120;
    const CALIBRATION_BEATS = 8; // 4 count-in + 8 measure? No, just 8 total, measuring last 4.
    let calibrationTaps: number[] = [];

    function startCalibration() {
        console.log('Starting Calibration...');
        if (btnCalibrate) btnCalibrate.blur(); // Remove focus

        try {
            if (!audioContext) audioContext = new AudioContext(); // Ensure context
            if (audioContext.state === 'suspended') audioContext.resume();
        } catch (e) {
            alert('Audio Context Error: ' + e);
            return;
        }

        isCalibrating = true;
        if (calibrationOverlay) {
            calibrationOverlay.style.display = 'flex';
            if (calibrationStatus) calibrationStatus.textContent = "Listen & Tap...";
        } else {
            console.error('Calibration Overlay not found');
            alert('Error: Calibration Overlay element not found');
            return;
        }
        calibrationTaps = [];

        // Schedule Beeps
        const now = audioContext.currentTime;
        const beatInterval = 60 / CALIBRATION_BPM;
        calibrationStartTime = now + 1.0; // Start after 1s delay

        for (let i = 0; i < CALIBRATION_BEATS; i++) {
            const time = calibrationStartTime + (i * beatInterval);
            const osc = audioContext.createOscillator();
            const gain = audioContext.createGain();
            osc.connect(gain);
            gain.connect(audioContext.destination);

            osc.type = 'sine';
            osc.frequency.value = i < 4 ? 440 : 880; // High pitch for measure phase

            osc.start(time);
            osc.stop(time + 0.1);

            // Gain envelope
            gain.gain.setValueAtTime(0.5, time);
            gain.gain.exponentialRampToValueAtTime(0.01, time + 0.1);
        }

        // Auto Close
        setTimeout(() => {
            finishCalibration();
        }, (calibrationStartTime + (CALIBRATION_BEATS * beatInterval) + 1.0) * 1000 - (now * 1000));
    }

    function stopCalibration() {
        isCalibrating = false;
        calibrationOverlay.style.display = 'none';
    }

    function finishCalibration() {
        if (!isCalibrating) return;

        // Analyze Taps
        const beatInterval = 60 / CALIBRATION_BPM;
        let diffs: number[] = [];

        calibrationTaps.forEach(tapTime => { // tapTime is AudioContext time
            const relative = tapTime - calibrationStartTime;
            const beatIndex = Math.round(relative / beatInterval);

            if (beatIndex >= 4 && beatIndex < CALIBRATION_BEATS) { // Only measure non-count-in
                const expected = calibrationStartTime + (beatIndex * beatInterval);
                const diff = (tapTime - expected) * 1000; // ms
                if (Math.abs(diff) < 200) diffs.push(diff);
            }
        });

        if (diffs.length >= 3) {
            const sum = diffs.reduce((a, b) => a + b, 0);
            const avg = Math.round(sum / diffs.length);
            globalOffset = avg;
            offsetInput.value = globalOffset.toString();
            offsetDisplay.textContent = globalOffset.toString();
            alert(`Calibration Complete!\nAverage Latency: ${avg}ms\nOffset Updated.`);
        } else {
            alert('Calibration Failed. Not enough valid taps.');
        }
        stopCalibration();
    }

    // Audio & State (Web Audio API)
    let audioContext: AudioContext | null = null;
    let audioBuffer: AudioBuffer | null = null;
    let audioSource: AudioBufferSourceNode | null = null;
    let audioStartTime = 0; // Context time when playback started

    // Notes
    interface Note {
        laneIndex: number; // 0-8 for KEYS
        y: number;
        active: boolean;
        isLong: boolean;
        duration: number; // ms
        processed: boolean; // for long note head hit
        beingHeld: boolean;
        spawnTime?: number; // for Chart mode
    }
    const notes: Note[] = [];

    // Game Loop State
    let lastTime = 0;
    type GameMode = 'random' | 'chart';
    let currentMode: GameMode = 'random';
    let isPlaying = false;

    // Chart Data
    let chartData: { time: number, lane: number, duration: number }[] = [];
    let nextNoteIndex = 0;

    // Visual Lanes (Background)
    interface VisualLane {
        x: number;
        width: number;
    }
    let VISUAL_LANES: VisualLane[] = [];

    // Judgement Feedback
    let judgementText = '';
    let judgementColor = '#fff';
    let judgementTimer = 0;

    // Input Handling State
    const pressedKeys: boolean[] = new Array(KEYS.length).fill(false);
    const heldNotes: (Note | null)[] = new Array(KEYS.length).fill(null);

    // ==========================================
    // Core Game Functions
    // ==========================================

    function initAudio() {
        if (!audioContext) {
            audioContext = new AudioContext();
        }
        if (audioContext.state === 'suspended') {
            audioContext.resume();
        }
    }

    function playAudio() {
        if (!audioContext || !audioBuffer) return;
        if (audioSource) {
            audioSource.stop();
            audioSource.disconnect();
        }
        audioSource = audioContext.createBufferSource();
        audioSource.buffer = audioBuffer;
        audioSource.connect(audioContext.destination);
        audioSource.start(0);
        audioStartTime = audioContext.currentTime;

        audioSource.onended = () => {
            if (currentMode === 'chart' && isPlaying) {
                // Song finished
                setTimeout(showResults, 1000);
                isPlaying = false;
            }
        };
    }

    function stopAudio() {
        if (audioSource) {
            audioSource.stop();
            audioSource.disconnect();
            audioSource = null;
        }
    }

    function getAudioTime(): number {
        if (!audioContext || !audioSource) return 0;
        // Current time in seconds
        return Math.max(0, audioContext.currentTime - audioStartTime);
    }

    function spawnNote(laneIndex: number, speed: number, isLong: boolean = false, duration: number = 0, initialY: number | null = null) {
        let startY = 0;
        if (initialY !== null) {
            startY = initialY;
        } else {
            // Default (Random mode): Spawn just above screen
            // But actually, for visual smoothness, usually 0 (top of screen).
            // Previous logic: -duration * speed. (Head is above screen?)
            // Let's stick to 0 for random notes head.
            startY = -duration * speed;
        }

        notes.push({
            laneIndex: laneIndex,
            y: startY,
            active: true,
            isLong: isLong,
            duration: duration,
            processed: false,
            beingHeld: false
        });
    }

    function update(deltaTime: number) {
        if (!isPlaying) return;

        // 1. Spawning
        if (currentMode === 'random') {
            // Random Spawn Logic (simplified for brevity or existing logic)
            if (Math.random() < 0.02) {
                const lane = Math.floor(Math.random() * KEYS.length);
                spawnNote(lane, currentNoteSpeed, Math.random() < 0.2, Math.random() * 500);
            }
        } else {
            // Chart Spawn Logic
            const currentTimeMs = getAudioTime() * 1000;
            // Spawn ahead: look for notes that will arrive at HIT_Y within window.
            // But we can look arbitrarily far ahead? No, usually screen height.
            // If we use screen height, we only spawn what is on screen.
            // notes outside logic will be handled next frame.
            const spawnAheadTime = HIT_Y / currentNoteSpeed;

            while (nextNoteIndex < chartData.length) {
                const noteData = chartData[nextNoteIndex];
                // Check if note is roughly within screen or just passed top
                // We should spawn if (noteTime - currentTime) * speed < HIT_Y
                // i.e. noteTime < currentTime + spawnAheadTime
                if (noteData.time <= currentTimeMs + spawnAheadTime) {
                    // Calculate precise Y
                    // Y should be such that at t=noteData.time, Y = HIT_Y.
                    // Y_now = HIT_Y - (noteTime - currentTime) * speed
                    const correctY = HIT_Y - (noteData.time - currentTimeMs) * currentNoteSpeed;

                    spawnNote(noteData.lane, currentNoteSpeed, noteData.duration > 0, noteData.duration, correctY);
                    nextNoteIndex++;
                } else {
                    break;
                }
            }
        }

        // 2. Logic (Move & Miss)
        notes.forEach(note => {
            if (!note.active) return;

            // Movement
            if (!note.beingHeld) {
                note.y += currentNoteSpeed * deltaTime;
            } else {
                note.y += currentNoteSpeed * deltaTime;
            }

            // MISS Detection Logic
            if (note.isLong && note.beingHeld) {
                const tailY = note.y - (note.duration * currentNoteSpeed);
                if (tailY >= HIT_Y) {
                    note.active = false;
                    // Held to end -> Perfect! 
                    judgementText = `PERFECT`;
                    judgementColor = '#00ffff';
                    judgementTimer = 1000;
                    addHit('perfect');
                }
            } else if (!note.isLong || !note.processed) { // Check Head
                const checkY = note.y;
                const distancePassed = checkY - HIT_Y;
                const msPassed = distancePassed / currentNoteSpeed;

                if (msPassed > MISS_BOUNDARY && note.active) {
                    note.active = false;
                    judgementText = `MISS`;
                    judgementColor = '#ff0000';
                    judgementTimer = 1000;
                    addHit('miss');
                }
            } else { // Long note processed but lost hold?
                const tailY = note.y - (note.duration * currentNoteSpeed);
                if (tailY > canvas.height) note.active = false;
            }
        });

        // Cleanup
        for (let i = notes.length - 1; i >= 0; i--) {
            const note = notes[i];
            const tailY = note.y - (note.duration * currentNoteSpeed);
            if (!note.active || tailY > canvas.height + 100) { // Off screen
                notes.splice(i, 1);
            }
        }

        if (judgementTimer > 0) judgementTimer -= deltaTime;
    }

    function draw() {
        if (!ctx) return;

        // Clear / Draw Background
        if (!isPlaying && SKIN.titleBg) {
            ctx.drawImage(SKIN.titleBg, 0, 0, canvas.width, canvas.height);
        } else if (isPlaying && SKIN.gameBg) {
            ctx.drawImage(SKIN.gameBg, 0, 0, canvas.width, canvas.height);
            // Alpha dark overlay for playability?
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        } else {
            ctx.fillStyle = '#222';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        // Draw STATIC VISUAL LANES (Background)
        VISUAL_LANES.forEach(lane => {
            // Lane BG
            ctx.fillStyle = '#111';
            ctx.fillRect(lane.x, 0, lane.width, canvas.height);

            // Divider
            ctx.strokeStyle = '#555';
            ctx.lineWidth = 2;
            ctx.beginPath();
            const x = lane.x + lane.width;
            ctx.moveTo(x, 0);
            ctx.lineTo(x, canvas.height);
            ctx.stroke();

            // Left divider for the very first lane
            if (lane === VISUAL_LANES[0]) {
                ctx.beginPath();
                ctx.moveTo(lane.x, 0);
                ctx.lineTo(lane.x, canvas.height);
                ctx.stroke();
            }
        });

        // Draw Target Line
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, HIT_Y);
        ctx.lineTo(canvas.width, HIT_Y);
        ctx.stroke();

        // Draw Key Feedback (Dynamic)
        pressedKeys.forEach((pkg, index) => {
            if (pkg) {
                const config = LANE_CONFIGS[index];
                if (!config) return;

                if (config.label === 'SPACE') {
                    ctx.fillStyle = 'rgba(224, 64, 251, 0.4)';
                    ctx.fillRect(config.x, HIT_Y - 5, config.width, 10);
                } else {
                    const color = config.color;
                    let baseColor = 'rgba(255, 255, 255,';
                    if (color === '#7CA4FF') baseColor = 'rgba(124, 164, 255,';
                    else if (color === '#ffffff') baseColor = 'rgba(255, 255, 255,';

                    ctx.fillStyle = `${baseColor} 0.1)`;
                    ctx.fillRect(config.x, 0, config.width, canvas.height);
                    ctx.fillStyle = `${baseColor} 0.3)`;
                    ctx.fillRect(config.x, HIT_Y - 10, config.width, 20);
                }
            }
        });

        // Draw Labels
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        // Only draw visible lane labels or all? All is fine
        LANE_CONFIGS.forEach(c => {
            if (c && c.label) {
                // Auto-scale font
                const fontSize = Math.min(20, Math.floor(c.width / 3));
                ctx.font = `${fontSize}px Arial`;

                let yPos = canvas.height - 30;
                if (c.label === 'SPACE') yPos = canvas.height - 50; // Higher for Space

                ctx.fillText(c.label, c.x + c.width / 2, yPos);
            }
        });

        // Draw Combo
        if (stats.combo > 0) {
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 60px Arial';
            ctx.textAlign = 'center';
            ctx.globalAlpha = 0.3;
            ctx.fillText(stats.combo.toString(), canvas.width / 2, canvas.height / 2);
            ctx.globalAlpha = 1.0;
        }

        // Draw Notes (Multi-pass: White -> Blue -> Space)
        function drawNotesForLane(targetLaneIdx: number) {
            notes.forEach(note => {
                if (note.laneIndex !== targetLaneIdx) return;
                const config = LANE_CONFIGS[note.laneIndex];
                if (!config) return;

                let bodyColor = 'rgba(255, 255, 255, 0.5)';
                if (config.color === '#7CA4FF') bodyColor = 'rgba(124, 164, 255, 0.5)';
                else if (config.color === '#e040fb') bodyColor = 'rgba(224, 64, 251, 0.5)';

                const x = config.x;
                const w = config.width;
                const H_GAP = 2; // Horizontal Gap (shrink width)

                // Determine Note Height (Space is thinner)
                let drawHeight = NOTE_HEIGHT;
                if (note.laneIndex === 4) {
                    drawHeight = 3;
                }

                // Determine Skin Image
                let skinImg = null;
                if (config.label === 'SPACE') skinImg = SKIN.space;
                else if (config.color === '#7CA4FF') skinImg = SKIN.blue;
                else skinImg = SKIN.white;

                if (note.isLong) {
                    const tailHeight = note.duration * currentNoteSpeed;
                    const headY = note.y;
                    const tailY = headY - tailHeight;

                    // Simple rect for long note Body (No specific long note skin yet, use alpha color)
                    ctx!.fillStyle = bodyColor;
                    ctx!.fillRect(x + H_GAP, tailY, w - (H_GAP * 2), tailHeight);

                    // Head
                    if (skinImg) {
                        ctx!.drawImage(skinImg, x + H_GAP, headY - (drawHeight / 2), w - (H_GAP * 2), drawHeight);
                    } else {
                        ctx!.fillStyle = config.color;
                        ctx!.fillRect(x + H_GAP, headY - (drawHeight / 2), w - (H_GAP * 2), drawHeight);
                    }
                } else {
                    if (skinImg) {
                        ctx!.drawImage(skinImg, x + H_GAP, note.y - (drawHeight / 2), w - (H_GAP * 2), drawHeight);
                    } else {
                        ctx!.fillStyle = config.color;
                        ctx!.fillRect(x + H_GAP, note.y - (drawHeight / 2), w - (H_GAP * 2), drawHeight);
                    }
                }
            });
        }

        // Pass 1: White Notes (1, 3, 6, 8)
        [1, 3, 6, 8].forEach(idx => drawNotesForLane(idx));

        // Pass 2: Blue Notes (0, 2, 5, 7) - On Top
        [0, 2, 5, 7].forEach(idx => drawNotesForLane(idx));

        // Pass 3: Space (4)
        drawNotesForLane(4);

        // Draw Judgement
        if (judgementTimer > 0) {
            ctx.fillStyle = judgementColor;
            ctx.font = 'bold 40px Arial';
            ctx.textAlign = 'center';
            const lines = judgementText.split('\n');
            lines.forEach((line, i) => {
                ctx.fillText(line, canvas.width / 2, HIT_Y - 50 + (i * 40));
            });
        }
    }

    function loop(timestamp: number) {
        if (!lastTime) lastTime = timestamp;
        const deltaTime = timestamp - lastTime;
        lastTime = timestamp;

        if (isCalibrating && audioContext) {
            // Calibration Loop
            const now = audioContext.currentTime;
            const relative = now - calibrationStartTime;
            const beatInterval = 60 / CALIBRATION_BPM;
            // Beat progress 0..1
            // We want a flash at beat time.
            const beatProgress = (relative % beatInterval) / beatInterval;
            // Flash at start of beat (0.0 to 0.1)
            if (beatProgress < 0.2) {
                calibrationVisual.style.background = '#fff';
                calibrationVisual.style.transform = 'scale(1.2)';
            } else {
                calibrationVisual.style.background = '#333';
                calibrationVisual.style.transform = 'scale(1.0)';
            }

            // Update status
            const beatIndex = Math.floor(relative / beatInterval);
            if (beatIndex < 4) {
                calibrationStatus.textContent = `Get Ready... ${4 - beatIndex}`;
            } else if (beatIndex < CALIBRATION_BEATS) {
                calibrationStatus.textContent = "TAP!";
            } else {
                calibrationStatus.textContent = "Analyzing...";
            }
        } else {
            // Game Loop
            update(deltaTime);
            draw();
        }
        requestAnimationFrame(loop);
    }

    // ==========================================
    // Interaction Handlers
    // ==========================================

    function showResults() {
        if (resPerfect) resPerfect.textContent = stats.perfect.toString();
        if (resGreat) resGreat.textContent = stats.great.toString();
        if (resNice) resNice.textContent = stats.nice.toString();
        if (resBad) resBad.textContent = stats.bad.toString();
        if (resMiss) resMiss.textContent = stats.miss.toString();
        if (resCombo) resCombo.textContent = stats.maxCombo.toString();

        if (resAvg) {
            const avg = stats.hitCount > 0 ? (stats.totalErrorMs / stats.hitCount).toFixed(1) : '0';
            resAvg.textContent = avg;
        }

        resultsOverlay.style.display = 'block';
    }

    if (speedInput && speedDisplay) {
        speedInput.addEventListener('input', () => {
            const multiplier = parseFloat(speedInput.value);
            currentNoteSpeed = BASE_NOTE_SPEED * multiplier;
            speedDisplay.textContent = multiplier.toFixed(1);
        });
    }

    if (laneWidthInput && laneWidthDisplay) {
        laneWidthInput.addEventListener('input', () => {
            currentLaneWidth = parseInt(laneWidthInput.value);
            laneWidthDisplay.textContent = currentLaneWidth.toString();
            resize();
        });
    }

    if (btnRandom) {
        btnRandom.addEventListener('click', () => {
            currentMode = 'random';
            isPlaying = true;
            resetStats();
            notes.length = 0;
            stopAudio();
            if (controlsDiv) controlsDiv.style.display = 'none';
            if (startScreen) startScreen.style.display = 'none'; // Hide Start Screen
            // Loop is always running now
        });
    }

    if (btnChart) {
        btnChart.addEventListener('click', async () => {
            if (startScreen) startScreen.style.display = 'none'; // Hide Start Screen
            // 0. Initialize Audio Context (User Gesture)
            try {
                initAudio();
            } catch (e) {
                alert('Audio Context Error: ' + e);
                return;
            }

            // 1. Load Audio
            if (audioInput.files && audioInput.files[0]) {
                const file = audioInput.files[0];
                try {
                    const arrayBuffer = await file.arrayBuffer();
                    audioBuffer = await audioContext!.decodeAudioData(arrayBuffer);
                } catch (e) {
                    alert('Audio Decode Error: ' + e);
                    return;
                }
            } else {
                alert('Please select an audio file!');
                return;
            }

            // 2. Load or Generate Chart
            if (chartInput.files && chartInput.files[0]) {
                const file = chartInput.files[0];
                let text = await file.text();

                if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

                try {
                    const json = JSON.parse(text);
                    if (!json.notes || !Array.isArray(json.notes)) {
                        alert('Invalid Chart Data: Missing "notes" array.');
                        return;
                    }
                    chartData = parseChart(json);
                } catch (e) {
                    alert('Invalid JSON: ' + e);
                    return;
                }
            } else {
                // Auto-Generate
                chartData = generateAutoChart(110, audioBuffer.duration);
            }

            // 3. Start
            currentMode = 'chart';
            isPlaying = true; // START GAME
            resetStats();
            notes.length = 0;
            nextNoteIndex = 0;
            if (controlsDiv) controlsDiv.style.display = 'none';
            if (resultsOverlay) resultsOverlay.style.display = 'none';

            playAudio();

            // Loop check removed (always running)
        });
    }

    // Chart Helpers
    async function loadSongList() {
        try {
            const res = await fetch('songs/list.json');
            const list = await res.json();

            songListDiv.innerHTML = '';
            list.forEach((song: any) => {
                const div = document.createElement('div');
                div.style.background = '#333';
                div.style.padding = '20px';
                div.style.marginBottom = '10px';
                div.style.cursor = 'pointer';
                div.style.border = '1px solid #555';
                div.style.display = 'flex';
                div.style.justifyContent = 'space-between';
                div.style.alignItems = 'center';

                div.innerHTML = `
                    <div>
                        <div style="font-size:1.2em; color:white; font-weight:bold;">${song.title}</div>
                        <div style="font-size:0.9em; color:#aaa;">${song.artist} | BPM: ${song.bpm}</div>
                    </div>
                    <div style="color:#e040fb; font-weight:bold;">PLAY &rarr;</div>
                `;

                div.onclick = () => loadSong(song);
                songListDiv.appendChild(div);
            });
        } catch (e) {
            songListDiv.innerHTML = '<p style="color:red">Failed to load song list. Make sure "songs/list.json" exists.</p>';
        }
    }

    async function loadSong(song: any) {
        // 0. Init Audio
        try { initAudio(); } catch (e) { alert(e); return; }

        // 1. Fetch Audio & Chart
        try {
            const audioRes = await fetch(`songs/${song.folder}/${song.audio}`);
            const audioBuf = await audioRes.arrayBuffer();
            audioBuffer = await audioContext!.decodeAudioData(audioBuf);

            const chartRes = await fetch(`songs/${song.folder}/${song.chart}`);
            const chartText = await chartRes.text();
            // BOM removal not typically needed for fetch unless file saved with BOM
            let text = chartText;
            if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

            const json = JSON.parse(text);
            if (!json.notes || !Array.isArray(json.notes)) {
                alert('Invalid Chart Data');
                return;
            }
            chartData = parseChart(json);

            // 2. Start Game
            currentMode = 'chart';
            isPlaying = true;
            resetStats();
            notes.length = 0;
            nextNoteIndex = 0;

            songSelectOverlay.style.display = 'none'; // Close UI
            // Controls already hidden by Select button logic
            if (resultsOverlay) resultsOverlay.style.display = 'none';

            playAudio();

        } catch (e) {
            alert('Error loading song: ' + e);
        }
    }

    function parseChart(json: any): { time: number, lane: number, duration: number }[] {
        const bpm = json.bpm || 110;
        const offset = json.offset || 0;
        const msPerBeat = 60000 / bpm;

        return json.notes.map((n: any) => ({
            time: (n.beat * msPerBeat) + offset,
            lane: n.lane,
            duration: n.duration ? n.duration * msPerBeat : 0
        })).sort((a: any, b: any) => a.time - b.time);
    }

    function generateAutoChart(bpm: number, durationSec: number): { time: number, lane: number, duration: number }[] {
        const msPerBeat = 60000 / bpm;
        const totalBeats = (durationSec * 1000) / msPerBeat;
        const data = [];
        const laneMap = [0, 2, 5, 7];

        for (let i = 0; i < totalBeats; i++) {
            data.push({
                time: i * msPerBeat,
                lane: laneMap[i % 4],
                duration: 0
            });
        }
        return data;
    }

    // Resize handling
    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        HIT_Y = canvas.height - 100;

        // 1. Calculate Visual Lanes (Static Background 4 cols)
        VISUAL_LANES = [];
        LANE_CONFIGS = [];

        const totalPlayWidth = currentLaneWidth * 4;
        laneStartX = (canvas.width - totalPlayWidth) / 2;

        // Populate 4 main lanes
        for (let i = 0; i < 4; i++) {
            VISUAL_LANES.push({
                x: laneStartX + (i * currentLaneWidth),
                width: currentLaneWidth
            });
        }

        const assignLane = (keyIndex: number, laneVisIndex: number, label: string, color: string, xOffset: number = 0, widthScale: number = 1.0) => {
            LANE_CONFIGS[keyIndex] = {
                x: laneStartX + (laneVisIndex * currentLaneWidth) + xOffset,
                width: currentLaneWidth * widthScale,
                color: color,
                label: label
            };
        };

        const blueOffset = 0;
        const blueScale = 0.85;

        // E (0) & D (1) -> Lane 0
        assignLane(0, 0, '', '#7CA4FF', blueOffset, blueScale);
        assignLane(1, 0, 'E/D', '#ffffff');

        // R (2) & F (3) -> Lane 1
        assignLane(2, 1, '', '#7CA4FF', blueOffset, blueScale);
        assignLane(3, 1, 'R/F', '#ffffff');

        // Space (4) - Full Width
        LANE_CONFIGS[4] = {
            x: laneStartX,
            width: totalPlayWidth,
            color: '#e040fb',
            label: 'SPACE'
        };

        // U (5) & J (6) -> Lane 2
        assignLane(5, 2, '', '#7CA4FF', blueOffset, blueScale);
        assignLane(6, 2, 'U/J', '#ffffff');

        // I (7) & K (8) -> Lane 3
        assignLane(7, 3, '', '#7CA4FF', blueOffset, blueScale);
        assignLane(8, 3, 'I/K', '#ffffff');
    }
    window.addEventListener('resize', resize);
    resize();

    // Input handling
    window.addEventListener('keydown', (e) => {

        if (isCalibrating) {
            if (e.code === 'Space') {
                e.preventDefault(); // Stop scrolling
                if (!e.repeat && audioContext && audioContext.state === 'running') {
                    calibrationTaps.push(audioContext.currentTime);
                }
            }
            return; // Block game input
        }

        const keyIndex = KEYS.indexOf(e.key.toLowerCase());
        if (keyIndex !== -1 && !pressedKeys[keyIndex]) {
            pressedKeys[keyIndex] = true;

            // Hit Detection
            const targetNotes = notes.filter(n =>
                n.active &&
                n.laneIndex === keyIndex &&
                !n.processed
            ).sort((a, b) => b.y - a.y); // Sort by proximity (lowest/closest first)

            if (targetNotes.length > 0) {
                const note = targetNotes[0];
                const noteTime = HIT_Y;
                const notePos = note.y;
                const distance = notePos - HIT_Y;
                const msErrorRaw = distance / currentNoteSpeed;
                const msError = msErrorRaw - globalOffset; // Apply User Offset
                const absError = Math.abs(msError);

                if (absError < THRESHOLD_BAD) {
                    const sign = msError > 0 ? '+' : '';

                    if (absError < THRESHOLD_PERFECT) {
                        judgementText = `PERFECT\n${sign}${Math.floor(msError)}ms`;
                        judgementColor = '#00ffff';
                        addHit('perfect', msError);
                    } else if (absError < THRESHOLD_GREAT) {
                        judgementText = `GREAT\n${sign}${Math.floor(msError)}ms`;
                        judgementColor = '#ffeb3b';
                        addHit('great', msError);
                    } else if (absError < THRESHOLD_NICE) {
                        judgementText = `NICE\n${sign}${Math.floor(msError)}ms`;
                        judgementColor = '#00ff00';
                        addHit('nice', msError);
                    } else {
                        judgementText = `BAD\n${sign}${Math.floor(msError)}ms`;
                        judgementColor = '#ffae00';
                        addHit('bad', msError);
                    }
                    judgementTimer = 1000;

                    if (note.isLong) {
                        note.processed = true;
                        note.beingHeld = true;
                        heldNotes[keyIndex] = note;
                    } else {
                        note.active = false;
                    }
                } else {
                    // Manual Miss Logic (Too early hit?)
                    // Current logic: ignore clicks outside window? 
                    // Or if very close but outside BAD, count as Miss?
                    // Let's stick to "Ghost inputs" don't count unless close.
                }
            }
        }
    });

    window.addEventListener('keyup', (e) => {
        const keyIndex = KEYS.indexOf(e.key.toLowerCase());
        if (keyIndex !== -1) {
            pressedKeys[keyIndex] = false;

            // Release Long Note
            if (heldNotes[keyIndex]) {
                const note = heldNotes[keyIndex]!;
                heldNotes[keyIndex] = null;
                note.beingHeld = false;

                // If release too early?
                // Visual cleanup handles it
            }
        }
    });

    // Start Loop
    requestAnimationFrame(loop);

})();
