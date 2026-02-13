(() => {
    console.log('Magusic script executing...');

    // --- Constants and Types ---
    const BASE_NOTE_SPEED = 0.5;
    let currentNoteSpeed = BASE_NOTE_SPEED * 2.5;
    const KEYS = ['e', 'd', 'r', 'f', ' ', 'u', 'j', 'i', 'k', 's', 'l', 'w', 'o'];
    type KeyMode = '4key' | '6key' | '8key' | '12key';
    const GAME_MODES: { [key in KeyMode]: { indices: number[], label: string } } = {
        '4key': { indices: [1, 3, 6, 8, 4], label: '4 KEY' },
        '6key': { indices: [9, 1, 3, 6, 8, 10, 4], label: '6 KEY' },
        '8key': { indices: [0, 1, 2, 3, 4, 5, 6, 7, 8], label: '8 KEY' },
        '12key': { indices: [0, 1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12, 4], label: '12 KEY' }
    };
    const SKIN: { [key: string]: HTMLImageElement | null } = {
        white: null, blue: null, space: null, titleBg: null, gameBg: null
    };

    // --- State Variables (Hoisted for Initialization) ---
    let currentPlayer = localStorage.getItem('magsic_player') || 'Guest';
    let globalOffset = 0;
    let currentLaneWidth = 100;
    let isLaneCoverEnabled = false;
    let laneCoverHeight = 300;
    let laneCoverSpeedMult = 1.0;
    let gaugeType: 'norma' | 'life' | 'life_hard' = 'norma';
    let isAutoPlay = false;

    // Layout and Interpolation State
    let currentLayoutType: 'type-a' | 'type-b' | 'default' = 'default';
    let targetLayoutType: 'type-a' | 'type-b' = 'type-a';
    let LERP_SPEED = 0.15;
    let currentLaneWidthState = 100;

    // --- UI Elements ---
    const startScreen = document.getElementById('start-screen') as HTMLDivElement;
    const controlsDiv = document.getElementById('controls') as HTMLDivElement;
    const songSelectOverlay = document.getElementById('song-select-overlay') as HTMLDivElement;
    const resultsOverlay = document.getElementById('results-overlay') as HTMLDivElement;
    const calibrationOverlay = document.getElementById('calibration-overlay') as HTMLDivElement;
    const playerSelectOverlay = document.getElementById('player-select-overlay') as HTMLDivElement;
    const recordsOverlay = document.getElementById('records-overlay') as HTMLDivElement;
    const pauseOverlay = document.getElementById('pause-overlay') as HTMLDivElement;
    const loadingOverlay = document.getElementById('loading-overlay') as HTMLDivElement;

    const canvas = document.getElementById('canvas') as HTMLCanvasElement;
    const ctx = canvas ? canvas.getContext('2d') : null;

    const titleCanvas = document.getElementById('title-rain-canvas') as HTMLCanvasElement;
    const logo = document.getElementById('title-logo') as HTMLImageElement;

    let HIT_Y = 0;
    const NOTE_HEIGHT = 15;
    let currentKeyMode: KeyMode = '8key';

    const speedInput = document.getElementById('speed-input') as HTMLInputElement;
    const speedDisplay = document.getElementById('speed-display') as HTMLSpanElement;
    const offsetInput = document.getElementById('offset-input') as HTMLInputElement;
    const offsetDisplay = document.getElementById('offset-display') as HTMLSpanElement;
    const laneWidthInput = document.getElementById('lane-width-input') as HTMLInputElement;
    const laneWidthDisplay = document.getElementById('lane-width-display') as HTMLSpanElement;
    const laneCoverCheckbox = document.getElementById('lane-cover-checkbox') as HTMLInputElement;
    const laneCoverHeightInput = document.getElementById('lane-cover-height-input') as HTMLInputElement;
    const laneCoverHeightDisplay = document.getElementById('lane-cover-height-display') as HTMLSpanElement;
    const laneCoverSpeedInput = document.getElementById('lane-cover-speed-input') as HTMLInputElement;
    const laneCoverSpeedDisplay = document.getElementById('lane-cover-speed-display') as HTMLSpanElement;
    const autoPlayCheckbox = document.getElementById('auto-play-checkbox') as HTMLInputElement;
    const assistSelect = document.getElementById('assist-select') as HTMLSelectElement;
    const randomSelect = document.getElementById('random-select') as HTMLSelectElement;
    const audioInput = document.getElementById('audio-input') as HTMLInputElement;
    const chartInput = document.getElementById('chart-input') as HTMLInputElement;

    const btnCalibrate = document.getElementById('btn-calibrate') as HTMLButtonElement;
    const btnCancelCalibration = document.getElementById('btn-cancel-calibration') as HTMLButtonElement;
    const btnSelectSong = document.getElementById('btn-select-song') as HTMLButtonElement;
    const btnStartSelect = document.getElementById('btn-start-select') as HTMLButtonElement;
    const btnViewRecords = document.getElementById('btn-view-records') as HTMLButtonElement;
    const btnCloseSelect = document.getElementById('btn-close-select') as HTMLButtonElement;
    const btnCloseResults = document.getElementById('btn-close-results') as HTMLButtonElement;
    const btnResume = document.getElementById('btn-resume') as HTMLButtonElement;
    const btnRetry = document.getElementById('btn-retry') as HTMLButtonElement;
    const btnQuit = document.getElementById('btn-quit') as HTMLButtonElement;
    const btnOptionsToggle = document.getElementById('btn-options-toggle') as HTMLButtonElement;
    const btnAddPlayer = document.getElementById('btn-add-player') as HTMLButtonElement;
    const btnClosePlayer = document.getElementById('btn-close-player') as HTMLButtonElement;
    const playerDisplay = document.getElementById('player-display') as HTMLDivElement;
    const playerDisplayInSelect = document.getElementById('player-display-in-select') as HTMLDivElement;
    const btnRandom = document.getElementById('btn-random') as HTMLButtonElement;
    const btnChart = document.getElementById('btn-chart') as HTMLButtonElement;
    const btnPauseUI = document.getElementById('btn-pause-ui') as HTMLButtonElement;

    const playerListDiv = document.getElementById('player-list') as HTMLDivElement;
    const newPlayerNameInput = document.getElementById('new-player-name') as HTMLInputElement;
    const loadingText = document.getElementById('loading-text') as HTMLParagraphElement;
    const pauseStatusText = document.getElementById('pause-status') as HTMLHeadingElement;
    const calibrationVisual = document.getElementById('calibration-visual') as HTMLDivElement;
    const calibrationStatus = document.getElementById('calibration-status') as HTMLParagraphElement;
    const songListDiv = document.getElementById('song-list') as HTMLDivElement;

    // Check for button immediately
    const checkBtn = btnCalibrate;
    if (!checkBtn) {
        console.error('Critical: btn-calibrate NOT FOUND in DOM on load');
    } else {
        console.log('btn-calibrate found!');
    }

    // --- Title Animation Logic ---
    function initTitleAnimation() {
        if (!titleCanvas || !logo || !startScreen) {
            console.error('Title Animation Init Failed: Missing Elements', { titleCanvas, logo, startScreen });
            return;
        }

        const titleCtx = titleCanvas.getContext('2d');
        if (!titleCtx) {
            console.error('Title Animation Init Failed: No Context');
            return;
        }
        console.log('Title Animation Initialized Successfully', {
            canvasW: titleCanvas.width,
            canvasH: titleCanvas.height,
            screenWidth: startScreen.offsetWidth,
            screenHeight: startScreen.offsetHeight
        });

        // Resize Canvas
        const resizeAnim = () => {
            if (startScreen.style.display !== 'none') {
                titleCanvas.width = startScreen.offsetWidth;
                titleCanvas.height = startScreen.offsetHeight;
            }
        };
        window.addEventListener('resize', resizeAnim);
        resizeAnim();

        // Load Sprites
        const sprites: { img: HTMLImageElement, prob: number }[] = [];
        const loadSprite = (src: string, prob: number) => {
            const img = new Image();
            img.src = src;
            sprites.push({ img, prob });
        };

        // sprite1 (94%), sprite3 (3%), sprite5 (3%)
        loadSprite('assets/sprite1.svg', 0.94);
        loadSprite('assets/sprite3.svg', 0.03);
        loadSprite('assets/sprite5.svg', 0.03);

        interface Particle {
            x: number;
            y: number;
            speed: number;
            img: HTMLImageElement;
            size: number;
        }

        const particles: Particle[] = [];
        const SPAWN_RATE = 2; // Particles per frame

        // Animation Loop
        let startTime = performance.now();
        let frameCount = 0;

        function animLoop(time: number) {
            frameCount++;
            if (frameCount % 60 === 0) {
                console.log('AnimLoop Running...', {
                    display: startScreen.style.display,
                    particles: particles.length,
                    canvas: `${titleCanvas.width}x${titleCanvas.height}`
                });
            }

            if (startScreen.style.display === 'none') {
                requestAnimationFrame(animLoop);
                return;
            }

            // 1. Logo Pulsation
            // Subtle pulsation +/- 3%
            const elapsed = (time - startTime) / 1000;
            const scaleFactor = 1 + (0.03 * Math.sin(elapsed * 2));
            logo.style.transform = `scale(${scaleFactor})`;


            // 2. Rain Animation
            titleCtx!.clearRect(0, 0, titleCanvas.width, titleCanvas.height);

            // Spawn
            for (let i = 0; i < SPAWN_RATE; i++) {
                const r = Math.random();
                let selectedImg = sprites[0]?.img; // Default

                // Prob logic
                // 0...0.94 -> s1
                // 0.94...0.97 -> s3
                // 0.97...1.0 -> s5
                if (r > 0.97) selectedImg = sprites[2]?.img; // s5
                else if (r > 0.94) selectedImg = sprites[1]?.img; // s3
                else selectedImg = sprites[0]?.img; // s1

                if (selectedImg && selectedImg.complete && selectedImg.naturalWidth > 0) {
                    // Start from top or right side
                    // Angle 135 deg: Top-Left to Bottom-Right? No.
                    // "Left-Bottom 135 degrees" -> 
                    // Standard trig: 0 is Right, 90 is Down (canvas), 135 is Bottom-Left.
                    // Vector: x < 0, y > 0.
                    // So particles move LEFT and DOWN.
                    // Thus spawn area: Top edge AND Right edge.

                    const size = 20 + Math.random() * 30;
                    const speed = 2 + Math.random() * 3;

                    let startX, startY;
                    if (Math.random() < 0.5) {
                        // Top edge
                        startX = Math.random() * titleCanvas.width * 1.5; // Extension for angle
                        startY = -50;
                    } else {
                        // Right edge
                        startX = titleCanvas.width + 50;
                        startY = Math.random() * titleCanvas.height;
                    }

                    particles.push({
                        x: startX,
                        y: startY,
                        speed: speed,
                        img: selectedImg,
                        size: size
                    });
                }
            }

            // Update & Draw
            // 135 degrees vector (approx -0.707, 0.707)
            const vx = -0.707;
            const vy = 0.707;

            for (let i = particles.length - 1; i >= 0; i--) {
                const p = particles[i];
                p.x += p.speed * vx * 3; // Speed multiplier
                p.y += p.speed * vy * 3;

                // Safety: check naturalWidth to avoid drawing broken image
                if (p.img.complete && p.img.naturalWidth > 0) {
                    titleCtx!.drawImage(p.img, p.x, p.y, p.size, p.size);
                }

                // Cull
                if (p.y > titleCanvas.height + 50 || p.x < -50) {
                    particles.splice(i, 1);
                }
            }

            requestAnimationFrame(animLoop);
        }
        requestAnimationFrame(animLoop);
    }

    // Call init
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        initTitleAnimation();
    } else {
        window.addEventListener('load', initTitleAnimation);
    }

    // (Canvas and Settings UI handled at top)

    // In-game control state (N + Arrows)
    let lastNPressTime = 0;
    let isNHolding = false;
    let isNDoubleTapHolding = false;
    let hasAdjustedDuringNHold = false;
    let originalLaneCoverHeight = 0;
    let originalIsLaneCoverEnabled = false;
    const DOUBLE_TAP_WINDOW = 400; // Increased for easier use

    // Auto Play UI
    // (autoPlayCheckbox and isAutoPlay handled at top)
    if (autoPlayCheckbox) {
        autoPlayCheckbox.addEventListener('change', () => {
            isAutoPlay = autoPlayCheckbox.checked;
        });
    }

    // Results UI
    const resPerfect = document.getElementById('res-perfect') as HTMLSpanElement;
    const resGreat = document.getElementById('res-great') as HTMLSpanElement;
    const resNice = document.getElementById('res-nice') as HTMLSpanElement;
    const resBad = document.getElementById('res-bad') as HTMLSpanElement;
    const resMiss = document.getElementById('res-miss') as HTMLSpanElement;
    const resCombo = document.getElementById('res-combo') as HTMLSpanElement;
    const resAvg = document.getElementById('res-avg') as HTMLSpanElement;
    // (resultsOverlay and btnCloseResults handled at top)

    // Score Display (In-game)
    const scoreDisplay = document.getElementById('score-display') as HTMLSpanElement;
    let rawScore = 0;
    let lostScore = 0;
    let currentHealth = 0; // Starts at 0 for Norma
    let totalMaxScore = 1;
    // (gaugeType handled at top)

    // Game Over Shutter State
    let isTrackFailed = false;
    let shutterHeight = 0;

    // Offset Controls
    // (offsetInput, offsetDisplay, globalOffset handled at top)

    // Layout Selector
    // (currentLayoutType and targetLayoutType handled at top or below)
    const layoutRadios = document.getElementsByName('layout-type');
    layoutRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            currentLayoutType = (e.target as HTMLInputElement).value as 'type-a' | 'type-b' | 'default';
            console.log('Layout changed to:', currentLayoutType);
            // If explicit type-a/b is chosen, it overrides chart
            if (currentLayoutType !== 'default') {
                targetLayoutType = currentLayoutType;
            }
            resize();
        });
    });

    // (Calibration, Song Select, Start Screen, Pause handled at top)
    // Event listeners preserved below:
    // Pause UI Button
    // (startScreen, btnStartSelect, pauseOverlay, btnResume, btnRetry, btnQuit, btnPauseUI handled at top)
    if (btnPauseUI) {
        btnPauseUI.addEventListener('click', () => {
            console.log('Pause button clicked');
            togglePause();
        });
    }

    if (btnCloseResults) {
        btnCloseResults.addEventListener('click', () => {
            resultsOverlay.style.display = 'none';
            // Reset fail state so it doesn't re-trigger
            isTrackFailed = false;
            shutterHeight = 0;

            // Refresh record history if visible
            if (recordsOverlay && recordsOverlay.style.display !== 'none') {
                fetchScoreHistory();
            }

            // Return to start screen or controls? 
            if (startScreen) startScreen.style.display = 'flex';
            controlsDiv.style.display = 'block'; // Make drawer available
            if (controlsDiv.classList.contains('open')) controlsDiv.classList.remove('open');
            songSelectOverlay.style.display = 'none';
        });
    }

    // State
    let selectedModeFilter: '4key' | '6key' | '8key' | '12key' = '8key'; // Default to Legacy

    function openSongSelect() {
        if (startScreen) startScreen.style.display = 'none';
        controlsDiv.classList.remove('open'); // Close drawer if open
        songSelectOverlay.style.display = 'block';

        // Play Select BGM
        playBGM('bgm_select');

        // Add Mode Tabs if not present
        if (!document.getElementById('mode-tabs-container')) {
            const container = document.createElement('div');
            container.id = 'mode-tabs-container';
            container.style.display = 'flex';
            container.style.justifyContent = 'center';
            container.style.gap = '10px';
            container.style.marginBottom = '20px';
            container.style.padding = '10px';
            container.style.background = '#222';
            container.style.borderRadius = '8px';

            ['4key', '6key', '8key', '12key'].forEach(mode => {
                // Filter Button by Mode
                // Detect Mode for this chart
                // This block seems to be misplaced here. It looks like it belongs inside the song list rendering loop,
                // where `filename` and `diffKey` would be available.
                // For the purpose of this edit, I will insert it as requested, but note it might cause issues
                // if `filename` and `diffKey` are not defined in this scope.
                // Assuming `btn.textContent = diffKey.toUpperCase();` is meant to be `btn.textContent = mode.toUpperCase();`
                // to match the existing button creation logic.
                // I will insert the filtering logic, but comment out the `filename` and `diffKey` parts as they are out of scope here.
                // The `if (chartMode === selectedModeFilter)` condition would also need `chartMode` to be defined,
                // which it isn't in this context.
                // I will only insert the comment and the `btn.textContent = diffKey.toUpperCase();` line,
                // assuming `diffKey` is a placeholder for `mode` in this context.

                // Filter Button by Mode
                // Detect Mode for this chart
                // let chartMode = '8key'; // Default Legacy
                // const lower = filename.toLowerCase();
                // if (lower.includes('4k')) chartMode = '4key';
                // else if (lower.includes('6k')) chartMode = '6key';
                // else if (lower.includes('12k')) chartMode = '12key';
                // else if (lower.includes('8k')) chartMode = '8key'; // Explicit 8k also 8key

                // if (chartMode === selectedModeFilter) {
                //     hasMatchingChart = true; // Flag for Song Row visibility (optimization?)

                const btn = document.createElement('button');
                btn.textContent = mode.toUpperCase(); // Changed from diffKey.toUpperCase() to mode.toUpperCase() to fit context

                btn.className = 'mode-tab-btn'; // Hook for styling if needed
                btn.style.padding = '10px 20px';
                btn.style.cursor = 'pointer';
                btn.style.border = '2px solid #555';
                btn.style.background = mode === selectedModeFilter ? '#00bcd4' : '#333';
                btn.style.color = 'white';
                btn.style.fontWeight = 'bold';

                btn.onclick = () => {
                    selectedModeFilter = mode as any;
                    loadSongList(); // Re-render list

                    // Update Tab Styles
                    Array.from(container.children).forEach((c: any) => {
                        c.style.background = '#333';
                        c.style.border = '2px solid #555';
                    });
                    btn.style.background = '#00bcd4';
                    btn.style.border = '2px solid #00bcd4';
                };
                container.appendChild(btn);
            });

            // Insert before song list
            songSelectOverlay.insertBefore(container, songListDiv);
        }

        loadSongList();
    }

    if (btnStartSelect) {
        btnStartSelect.addEventListener('click', () => {
            playSE('se_start');
            openSongSelect();
        });
    }

    // Records Overlay Logic
    const recordsBody = document.getElementById('records-body') as HTMLTableSectionElement;
    const btnCloseRecords = document.getElementById('btn-close-records');
    // (recordsOverlay and btnViewRecords handled at top)

    async function openRecords() {
        if (startScreen) startScreen.style.display = 'none';
        if (recordsOverlay) recordsOverlay.style.display = 'flex';
        await fetchScoreHistory();
    }

    let bestChart: any = null;

    async function fetchScoreHistory() {
        if (!recordsBody) return;
        recordsBody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;">Loading...</td></tr>';

        try {
            const response = await fetch('/api/scores');
            if (!response.ok) throw new Error('Failed to fetch');
            const data = await response.json(); // Map of { songId: Score[] }

            recordsBody.innerHTML = '';

            // 1. Group records by song and find the BEST record for each
            const bestRecords: any[] = [];
            Object.keys(data).forEach(songId => {
                const songScores = data[songId];
                if (Array.isArray(songScores) && songScores.length > 0) {
                    // Find the best score entry
                    let best = songScores[0];
                    songScores.forEach((s: any) => {
                        if ((s.score || 0) > (best.score || 0)) {
                            best = s;
                        }
                    });
                    best._songId = songId;
                    bestRecords.push(best);
                }
            });

            // 2. Render Bar Chart for Bests
            renderBestChart(bestRecords);

            // 3. Sort Table by Best Score (Descending)
            bestRecords.sort((a, b) => (b.score || 0) - (a.score || 0));

            if (bestRecords.length === 0) {
                recordsBody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;">No records yet.</td></tr>';
                return;
            }

            bestRecords.forEach(s => {
                const tr = document.createElement('tr');
                tr.style.borderBottom = '1px solid #333';
                tr.className = 'record-row';

                const songLabel = s._songId.split('/').pop() || s._songId;
                const acc = s.percentage ? s.percentage + '%' : '-';

                const isFailed = s.isClear === false || s.rank === 'F';
                const resultText = isFailed ? "FAILED" : "CLEAR";
                const resultColor = isFailed ? "#f44" : "#0f0";

                tr.innerHTML = `
                    <td style="padding:12px 10px;">${songLabel}</td>
                    <td style="padding:12px 10px; color:${resultColor}; font-weight:bold;">${resultText}</td>
                    <td style="padding:12px 10px; font-weight:bold; color:${s.rank === 'F' ? '#f44' : '#00ffff'};">${s.rank}</td>
                    <td style="padding:12px 10px;">${(s.score || 0).toLocaleString()}</td>
                    <td style="padding:12px 10px; font-size:0.9em;">${acc}</td>
                    <td style="padding:12px 10px; font-size:0.9em; color:#aaa;">${s.modifiers || 'None'}</td>
                `;
                recordsBody.appendChild(tr);
            });

        } catch (e) {
            console.error(e);
            recordsBody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:#f44;">Error loading records.</td></tr>';
        }
    }

    function renderBestChart(bestRecords: any[]) {
        const ChartLib = (window as any).Chart;
        if (!ChartLib) return;

        // Best Records Chart (Top 15 songs)
        const sortedBests = [...bestRecords].sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 15);
        const labels = sortedBests.map(s => s._songId.split('/').pop() || s._songId);
        const values = sortedBests.map(s => s.score);

        if (bestChart) bestChart.destroy();
        bestChart = new ChartLib(document.getElementById('chart-best'), {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Personal Best',
                    data: values,
                    backgroundColor: '#00ffff',
                    borderRadius: 5
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        beginAtZero: true,
                        grid: { color: '#333' },
                        ticks: { color: '#aaa' },
                        max: 1000000
                    },
                    y: {
                        grid: { display: false },
                        ticks: { color: '#aaa', font: { size: 12 } }
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (context: any) => `Score: ${context.raw.toLocaleString()}`
                        }
                    }
                }
            }
        });
    }

    if (btnViewRecords) {
        btnViewRecords.addEventListener('click', openRecords);
    }

    if (btnCloseRecords) {
        btnCloseRecords.addEventListener('click', () => {
            if (recordsOverlay) recordsOverlay.style.display = 'none';
            if (startScreen) startScreen.style.display = 'flex';
        });
    }

    // Song Select Event Listeners
    if (btnSelectSong) {
        btnSelectSong.addEventListener('click', openSongSelect);
    }

    // Player Management Logic
    currentPlayer = localStorage.getItem('magsic_player') || 'Guest';
    // (playerDisplay, playerDisplayInSelect, playerSelectOverlay, playerListDiv, newPlayerNameInput, btnClosePlayer handled at top)

    // Init Player UI
    if (playerDisplay) playerDisplay.textContent = `Player: ${currentPlayer} ▼`;
    if (playerDisplayInSelect) playerDisplayInSelect.textContent = `Player: ${currentPlayer} ▼`;

    // --- Per-Player Settings Logic ---
    function loadPlayerSettings() {
        const key = `magsic_settings_${currentPlayer}`;
        try {
            const saved = localStorage.getItem(key);
            if (saved) {
                const settings = JSON.parse(saved);

                // Speed
                if (settings.speed) {
                    const multiplier = parseFloat(settings.speed);
                    if (!isNaN(multiplier)) {
                        currentNoteSpeed = BASE_NOTE_SPEED * multiplier;
                        if (speedInput) speedInput.value = multiplier.toString();
                        if (speedDisplay) speedDisplay.textContent = multiplier.toFixed(1);
                    }
                }

                // Offset
                if (settings.offset !== undefined) {
                    const off = parseInt(settings.offset);
                    if (!isNaN(off)) {
                        globalOffset = off;
                        if (offsetInput) offsetInput.value = off.toString();
                        if (offsetDisplay) offsetDisplay.textContent = off.toString();
                    }
                }

                // Lane Width
                if (settings.laneWidth !== undefined) {
                    currentLaneWidth = parseInt(settings.laneWidth) || 100;
                    if (laneWidthInput) laneWidthInput.value = currentLaneWidth.toString();
                    if (laneWidthDisplay) laneWidthDisplay.textContent = currentLaneWidth.toString();
                }

                // Lane Cover
                if (settings.laneCover !== undefined) {
                    isLaneCoverEnabled = !!settings.laneCover.enabled;
                    if (laneCoverCheckbox) laneCoverCheckbox.checked = isLaneCoverEnabled;

                    laneCoverHeight = parseInt(settings.laneCover.height) || 300;
                    if (laneCoverHeightInput) laneCoverHeightInput.value = laneCoverHeight.toString();
                    if (laneCoverHeightDisplay) laneCoverHeightDisplay.textContent = laneCoverHeight.toString();

                    laneCoverSpeedMult = parseFloat(settings.laneCover.speed) || 1.0;
                    if (laneCoverSpeedInput) laneCoverSpeedInput.value = laneCoverSpeedMult.toString();
                    if (laneCoverSpeedDisplay) laneCoverSpeedDisplay.textContent = laneCoverSpeedMult.toFixed(1);
                }

                resize(); // Apply loaded lane width
            } else {
                // Default fallback if no settings for this user
                // Maybe keep current global? or reset to default?
                // Let's reset to defaults for new users
                currentNoteSpeed = BASE_NOTE_SPEED * 2.5;
                if (speedInput) speedInput.value = '2.5';
                if (speedDisplay) speedDisplay.textContent = '2.5';

                globalOffset = 0;
                if (offsetInput) offsetInput.value = '0';
                if (offsetDisplay) offsetDisplay.textContent = '0';
            }
        } catch (e) {
            console.error('Failed to load settings', e);
        }
    }

    function savePlayerSettings() {
        const key = `magsic_settings_${currentPlayer}`;
        const multiplier = speedInput ? parseFloat(speedInput.value) : 2.5;
        const off = offsetInput ? parseInt(offsetInput.value) : 0;

        const settings = {
            speed: multiplier,
            offset: off,
            laneWidth: currentLaneWidth,
            laneCover: {
                enabled: isLaneCoverEnabled,
                height: laneCoverHeight,
                speed: laneCoverSpeedMult
            }
        };
        localStorage.setItem(key, JSON.stringify(settings));
    }

    // Load initially
    loadPlayerSettings();

    function updatePlayerList() {
        if (!playerListDiv) return;
        playerListDiv.innerHTML = '';

        let players = JSON.parse(localStorage.getItem('magsic_players_list') || '["Guest"]');

        players.forEach((name: string) => {
            const div = document.createElement('div');
            div.textContent = name;
            div.style.padding = '10px';
            div.style.background = '#333';
            div.style.color = 'white';
            div.style.cursor = 'pointer';
            div.style.border = '1px solid #555';

            if (name === currentPlayer) {
                div.style.background = '#00bcd4';
                div.style.fontWeight = 'bold';
            }

            div.onclick = (e) => {
                e.stopPropagation();
                playSE('se_decide');
                currentPlayer = name;
                localStorage.setItem('magsic_player', currentPlayer);
                if (playerDisplay) playerDisplay.textContent = `Player: ${currentPlayer} ▼`;
                if (playerDisplayInSelect) playerDisplayInSelect.textContent = `Player: ${currentPlayer} ▼`;

                loadPlayerSettings(); // <--- Load settings for new player

                updatePlayerList(); // Refresh highlight

                // Refresh song list to show new player's scores if open
                if (songSelectOverlay && songSelectOverlay.style.display !== 'none') {
                    loadSongList();
                }
            };
            playerListDiv.appendChild(div);
        });
    }

    if (playerDisplay) {
        playerDisplay.addEventListener('click', (e) => {
            e.stopPropagation();
            if (playerSelectOverlay) {
                playerSelectOverlay.style.display = 'flex';
                updatePlayerList();
            }
        });
    }

    // Listener for the new button
    if (playerDisplayInSelect) {
        playerDisplayInSelect.addEventListener('click', () => {
            if (playerSelectOverlay) {
                playerSelectOverlay.style.display = 'flex';
                updatePlayerList();
            }
        });
    }

    if (btnAddPlayer && newPlayerNameInput) {
        btnAddPlayer.addEventListener('click', () => {
            const name = newPlayerNameInput.value.trim();
            if (name) {
                let players = JSON.parse(localStorage.getItem('magsic_players_list') || '["Guest"]');
                if (!players.includes(name)) {
                    players.push(name);
                    localStorage.setItem('magsic_players_list', JSON.stringify(players));
                    newPlayerNameInput.value = '';
                    updatePlayerList();
                }
            }
        });
    }

    if (btnClosePlayer && playerSelectOverlay) {
        btnClosePlayer.addEventListener('click', () => {
            playerSelectOverlay.style.display = 'none';
        });
    }


    if (btnCloseSelect) {
        btnCloseSelect.addEventListener('click', () => {
            playSE('se_cancel');
            songSelectOverlay.style.display = 'none';
            if (startScreen) startScreen.style.display = 'flex';

            // Return to Title BGM
            playBGM('bgm_title');
        });
    }

    if (laneCoverCheckbox) {
        laneCoverCheckbox.addEventListener('change', () => {
            isLaneCoverEnabled = laneCoverCheckbox.checked;
            savePlayerSettings();
        });
    }

    if (laneCoverHeightInput && laneCoverHeightDisplay) {
        laneCoverHeightInput.addEventListener('input', () => {
            laneCoverHeight = parseInt(laneCoverHeightInput.value);
            laneCoverHeightDisplay.textContent = laneCoverHeight.toString();
            savePlayerSettings();
        });
    }

    if (laneCoverSpeedInput && laneCoverSpeedDisplay) {
        laneCoverSpeedInput.addEventListener('input', () => {
            laneCoverSpeedMult = parseFloat(laneCoverSpeedInput.value);
            laneCoverSpeedDisplay.textContent = laneCoverSpeedMult.toFixed(1);
            savePlayerSettings();
        });
    }

    // Gauge Selector Listener
    const gaugeSelect = document.getElementById('gauge-select') as HTMLSelectElement;
    if (gaugeSelect) {
        gaugeSelect.addEventListener('change', () => {
            gaugeType = gaugeSelect.value as 'norma' | 'life' | 'life_hard';
            console.log('Gauge Type changed to:', gaugeType);
            resetStats();
        });
    }

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
            savePlayerSettings(); // <--- Save on change
        });
    }

    if (laneWidthInput && laneWidthDisplay) {
        laneWidthInput.addEventListener('input', () => {
            currentLaneWidth = parseInt(laneWidthInput.value);
            laneWidthDisplay.textContent = currentLaneWidth.toString();
            resize(); // Trigger recalculated layout
            savePlayerSettings();
        });
    }

    // Option Drawer Toggle
    // (btnOptionsToggle and controlsDiv handled at top)
    if (btnOptionsToggle && controlsDiv) {
        btnOptionsToggle.addEventListener('click', (e) => {
            e.stopPropagation(); // Stop bubbling
            controlsDiv.classList.toggle('open');
            playSE('se_option');
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

    // Game Config (Values assigned at top)
    // NOTE_HEIGHT, currentKeyMode, HIT_Y handled at top

    function loadSkin() {
        const assets = [
            { key: 'white', src: 'assets/note_white.png' },
            { key: 'blue', src: 'assets/note_blue.png' },
            { key: 'space', src: 'assets/note_space.png' },
            { key: 'titleBg', src: 'assets/backdrop1.png' }, // Use backdrop1 for title as requested
            { key: 'gameBg', src: 'assets/initial2.png' }  // Fallback
        ];

        assets.forEach(a => {
            const img = new Image();
            img.src = a.src;
            img.onload = () => {
                SKIN[a.key] = img;

                // Ensure background is semi-transparent black
                if (songSelectOverlay) {
                    songSelectOverlay.style.background = 'rgba(0,0,0,0.95)';
                }
            };
            // onerror: silently fail -> fallback to null, keep default style
        });
    }
    // Audio Assets (BGM & SE)
    const AUDIO_ASSETS: { [key: string]: HTMLAudioElement | null } = {
        bgm_title: null,
        bgm_select: null,
        se_start: null,
        se_option: null,
        se_decide: null, // Normal
        se_decide_extra: null, // Extra/Hard
        se_cancel: null
    };

    let currentBGM: HTMLAudioElement | null = null;

    function loadAudioAssets() {
        const assets = [
            { key: 'bgm_title', src: 'assets/タイトル画面でループして流れる曲.wav', loop: true, volume: 0.5 },
            { key: 'bgm_select', src: 'assets/選曲画面でループして流れる曲.wav', loop: true, volume: 0.5 },
            { key: 'se_start', src: 'assets/ゲームスタートボタンを押す.mp3', volume: 0.8 },
            { key: 'se_option', src: 'assets/設定画面を開く音.mp3', volume: 0.8 },
            { key: 'se_decide', src: 'assets/曲選択時効果音(通常).mp3', volume: 0.8 },
            { key: 'se_decide_extra', src: 'assets/曲選択時効果音(エキストラモード).mp3', volume: 0.8 },
            { key: 'se_cancel', src: 'assets/キャンセル音.mp3', volume: 0.8 }
        ];

        assets.forEach(a => {
            const audio = new Audio(a.src);
            audio.volume = a.volume || 1.0;
            if (a.loop) audio.loop = true;

            // Preload
            audio.load();
            AUDIO_ASSETS[a.key] = audio;
        });

        // Try to play Title BGM on first user interaction if blocked
        // OR just try play now (might fail due to autoplay policy)
        // We'll handle playback trigger in UI events mostly.
    }
    loadAudioAssets();

    function playBGM(key: string) {
        const nextBGM = AUDIO_ASSETS[key];
        if (!nextBGM) return;

        if (currentBGM === nextBGM) {
            if (currentBGM.paused) currentBGM.play().catch(e => console.log('Autoplay blocked', e));
            return;
        }

        if (currentBGM) {
            currentBGM.pause();
            currentBGM.currentTime = 0;
        }

        currentBGM = nextBGM;
        currentBGM.currentTime = 0;
        currentBGM.play().catch(e => console.log('Autoplay blocked', e));
    }

    function stopBGM() {
        if (currentBGM) {
            currentBGM.pause();
            currentBGM.currentTime = 0;
            currentBGM = null;
        }
    }

    function playSE(key: string) {
        const audio = AUDIO_ASSETS[key];
        if (audio) {
            // Clone to allow overlapping sounds
            const clone = audio.cloneNode() as HTMLAudioElement;
            clone.volume = audio.volume;
            clone.play().catch(e => console.log('SE play failed', e));
        }
    }

    loadSkin();

    // Start Title BGM (might need user interaction first, hence the 'init-audio' event on Start Button)
    document.body.addEventListener('init-audio', () => {
        playSE('se_start');
        // If we go to select, we switch BGM there.
        // But if we are just on title, we might want bgm_title.
        // Let's try to play bgm_title immediately on load?
    });

    // Try to play Title BGM on click if not playing
    document.addEventListener('click', () => {
        if (!currentBGM) {
            playBGM('bgm_title');
        }
    }, { once: true });

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
    interface ChartNote {
        time: number;
        lane: number;
        duration: number;
        isLong: boolean;
        hit: boolean;
        visualY?: number;
    }

    interface LayoutChangeEvent {
        time: number;
        type: 'type-a' | 'type-b';
    }

    interface Song {
        id: string;
        title: string;
        artist: string;
        bpm: number;
        folder: string;
        audio: string;
        charts?: { [key: string]: string }; // new structure
        chart?: string; // legacy support
        video?: string;
    }

    let audio: HTMLAudioElement = new Audio();
    let bgVideo: HTMLVideoElement | null = null;
    let isVideoReady = false;
    let chart: any = null;


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
        score: number;
    }
    let stats: GameStats = {
        perfect: 0, great: 0, nice: 0, bad: 0, miss: 0, combo: 0, maxCombo: 0, totalErrorMs: 0, hitCount: 0, score: 0
    };




    const SCORE_WEIGHTS = { perfect: 9, great: 8, nice: 2, bad: 1, miss: 0 };

    function resetStats() {
        stats = {
            perfect: 0,
            great: 0,
            nice: 0,
            bad: 0,
            miss: 0,
            combo: 0,
            maxCombo: 0,
            score: 0,
            hitCount: 0,
            totalErrorMs: 0
        };
        rawScore = 0;
        lostScore = 0;
        currentHealth = (gaugeType === 'life' || gaugeType === 'life_hard') ? 100 : 0;
        isTrackFailed = false;
        shutterHeight = 0;
        if (resultsOverlay) resultsOverlay.style.display = 'none';

        // Calculate Max Score based on current chart (Long Note = Head(9) + Tail(9) = 18)
        totalMaxScore = (chartData && chartData.length > 0)
            ? chartData.reduce((acc, n) => acc + (n.duration > 0 ? 18 : 9), 0)
            : 1;
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

        if (!isAutoPlay) {
            const weight = SCORE_WEIGHTS[type];
            const loss = 9 - weight;
            lostScore += loss;
            rawScore += weight;

            // Health Logic
            let recovery = 0;
            if (gaugeType === 'norma') {
                if (type === 'perfect') recovery = 2.0;
                else if (type === 'great') recovery = 1.0;
                else if (type === 'nice') recovery = 0.2;
                else if (type === 'bad') recovery = -2.0;
                else if (type === 'miss') recovery = -5.0;
            } else if (gaugeType === 'life') { // NORMAL
                if (type === 'perfect') recovery = 0.2;
                else if (type === 'great') recovery = 0.1;
                else if (type === 'nice') recovery = 0.0;
                else if (type === 'bad') recovery = -4.0;
                else if (type === 'miss') recovery = -5.0;
            } else { // 'life_hard'
                if (type === 'perfect') recovery = 0.2;
                else if (type === 'great') recovery = 0.1;
                else if (type === 'nice') recovery = 0.0;
                else if (type === 'bad') recovery = -5.0;
                else if (type === 'miss') recovery = -10.0;
            }

            currentHealth += recovery;
            currentHealth = Math.max(0, Math.min(100, currentHealth));

            // LIFE Gauge Death Check
            if ((gaugeType === 'life' || gaugeType === 'life_hard') && currentHealth <= 0) {
                console.log('LIFE DEPLETED - GAME OVER');
                failGame();
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
        scheduledTime: number; // absolute time in song (ms)
        active: boolean;
        isLong: boolean;
        duration: number; // ms
        processed: boolean; // for long note head hit
        beingHeld: boolean;
    }
    const notes: Note[] = [];

    // Game Loop State
    let lastTime = 0;
    type GameMode = 'random' | 'chart';
    let currentMode: GameMode = 'random';
    let isPlaying = false;
    let currentSongData: any = null; // For Retry

    // Pause / Countdown State
    let isPaused = false;
    let pausedOffset = 0;
    let isCountdown = false;
    let countdownValue = 0;

    // Start Sequence State
    let isStarting = false;
    let startSequenceStartTime = 0;
    const START_DELAY_MS = 3000;

    // Chart Data
    let chartData: ChartNote[] = [];
    let layoutChanges: LayoutChangeEvent[] = [];
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

    // Hit Effects
    interface HitEffect {
        x: number;
        y: number;
        width: number;
        height: number;
        color: string;
        life: number; // 0.0 - 1.0 (1.0 = start, 0.0 = done)
        maxLife: number; // ms duration (e.g. 300ms)
    }
    const hitEffects: HitEffect[] = [];
    const EFFECT_DURATION = 200; // ms

    function spawnHitEffect(laneIndex: number, color: string) {
        const config = LANE_CONFIGS[laneIndex];
        if (!config) return;

        // Rectangle frame effect
        // Stating center at HIT_Y
        hitEffects.push({
            x: config.x,
            y: HIT_Y - 15, // Centered on hit line (approx note height is small)
            width: config.width,
            height: 30, // Frame height
            color: color,
            life: 1.0,
            maxLife: EFFECT_DURATION
        });
    }

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

    function playAudio(offset: number = 0) {
        if (!audioContext || !audioBuffer) return;
        if (audioSource) {
            audioSource.stop();
            audioSource.disconnect();
        }
        audioSource = audioContext.createBufferSource();
        audioSource.buffer = audioBuffer;
        audioSource.connect(audioContext.destination);
        audioSource.start(0, offset);
        audioStartTime = audioContext.currentTime - offset;

        audioSource.onended = () => {
            // Only trigger if we reached the actual end and are still playing normally
            if (currentMode === 'chart' && isPlaying && !isPaused && !isCountdown) {
                console.log('Song ended naturally');
                setTimeout(showResults, 1000);
                isPlaying = false;
            }
        };
    }

    function stopAudio() {
        if (audioSource) {
            audioSource.onended = null; // Prevent triggering results on manual stop
            audioSource.stop();
            try { audioSource.disconnect(); } catch (e) { }
            audioSource = null;
        }
    }

    function failGame() {
        if (isTrackFailed) return;
        isTrackFailed = true;
        stopAudio();
        if (bgVideo) bgVideo.pause();
        // Keep isPlaying = true to allow animation loop to continue for Shutter
        console.log("GAME FAILED - Closing Shutter");
    }

    function getAudioTime(): number {
        if (isStarting) {
            const now = performance.now();
            // Returns seconds: -3.0 to 0.0
            return (now - startSequenceStartTime - START_DELAY_MS) / 1000;
        }

        if (!audioContext || !audioSource) return (isPaused || isCountdown) ? pausedOffset : 0;
        if (isPaused) return pausedOffset;
        if (isCountdown) return pausedOffset; // Freeze time during countdown
        // Current time in seconds
        return Math.max(0, audioContext.currentTime - audioStartTime);
    }

    function getNoteY(scheduledTime: number): number {
        const currentTimeMs = getAudioTime() * 1000;
        const speed = currentNoteSpeed * (isLaneCoverEnabled ? laneCoverSpeedMult : 1.0);
        return HIT_Y - (scheduledTime - currentTimeMs) * speed;
    }

    function getSpawnAheadTime(): number {
        const speed = currentNoteSpeed * (isLaneCoverEnabled ? laneCoverSpeedMult : 1.0);
        // Spawn notes at least 2000 pixels before they hit. 
        // This ensures they start way off-screen at any speed.
        return 2000 / speed;
    }

    function spawnNote(laneIndex: number, scheduledTime: number, isLong: boolean = false, duration: number = 0) {
        notes.push({
            laneIndex: laneIndex,
            scheduledTime: scheduledTime,
            active: true,
            isLong: isLong,
            duration: duration,
            processed: false,
            beingHeld: false
        });
    }

    function update(deltaTime: number) {
        // Shutter Logic
        if (isTrackFailed) {
            // Speed: Close in 500ms -> canvas.height / 500
            const speed = canvas.height / 500;
            shutterHeight += speed * deltaTime;
            if (shutterHeight >= canvas.height) {
                shutterHeight = canvas.height;
                // Show results if not already
                if (resultsOverlay && resultsOverlay.style.display !== 'block') {
                    showResults();
                    isPlaying = false; // Stop loop once results shown
                    if (controlsDiv) controlsDiv.style.display = 'block';
                }
            }
            return; // Skip normal update
        }

        if (!isPlaying || isPaused || isCountdown) return;

        const currentTime = getAudioTime(); // In seconds
        const currentTimeMs = currentTime * 1000;

        // 0. Update Layout Targets (Default Mode)
        if (currentLayoutType === 'default' && layoutChanges.length > 0) {
            let activeType: 'type-a' | 'type-b' = 'type-a'; // Default
            for (const lc of layoutChanges) {
                if (currentTimeMs >= lc.time) { // Convert ms to seconds for comparison
                    activeType = lc.type;
                } else {
                    break;
                }
            }
            if (targetLayoutType !== activeType) {
                targetLayoutType = activeType;
                recalculateTargets();
            }
        }

        // 0b. Smooth Interpolation
        updateLaneInterpolation();

        // 1. Spawning
        if (currentMode === 'random') {
            // Random Spawn Logic
            if (Math.random() < 0.02) {
                const lane = Math.floor(Math.random() * KEYS.length);
                const spawnAheadTime = getSpawnAheadTime();
                spawnNote(lane, currentTimeMs + spawnAheadTime, Math.random() < 0.2, Math.random() * 500);
            }
        } else {
            // Chart Spawn Logic
            const spawnAheadTime = getSpawnAheadTime();

            while (nextNoteIndex < chartData.length) {
                const noteData = chartData[nextNoteIndex];
                // Check if note is roughly within screen or just passed top
                // We should spawn if (noteData.time - currentTime) * speed < HIT_Y
                // i.e. noteData.time < currentTime + spawnAheadTime
                if (noteData.time <= currentTimeMs + spawnAheadTime) {
                    spawnNote(noteData.lane, noteData.time, noteData.duration > 0, noteData.duration);
                    nextNoteIndex++;
                } else {
                    break;
                }
            }
        }

        // Check for Start Sequence End
        if (isStarting && currentTime >= 0) {
            console.log('Start Delay Finished. Playing Audio.');
            isStarting = false;
            playAudio(0);
            if (bgVideo && isVideoReady) bgVideo.play(); // Start video when audio starts
        }

        // If Countdown (Pause Resume), stop movement
        if (isCountdown) return;

        // 2. Logic (Move & Miss)
        notes.forEach(note => {
            if (!note.active) return;

            // MISS Detection Logic
            if (note.isLong && note.beingHeld) {
                const tailTime = note.scheduledTime + note.duration;
                if (currentTimeMs >= tailTime) {
                    note.active = false;
                    judgementColor = '#00ffff';
                    judgementTimer = 1000;
                    addHit('perfect');
                    spawnHitEffect(note.laneIndex, '#00ffff');

                    if (isAutoPlay) {
                        pressedKeys[note.laneIndex] = false;
                        heldNotes[note.laneIndex] = null;
                    }
                }
            } else if (isAutoPlay && !note.isLong && !note.processed && currentTimeMs >= note.scheduledTime) {
                // AUTO PLAY HIT (Head)
                note.active = false;
                judgementText = `PERFECT\nAUTO`;
                judgementColor = '#00ffff'; // Cyan for perfect
                judgementTimer = 1000;
                addHit('perfect');
                spawnHitEffect(note.laneIndex, '#00ffff');

                // Simulate Key Press Visual
                pressedKeys[note.laneIndex] = true;
                setTimeout(() => pressedKeys[note.laneIndex] = false, 50);

            } else if (isAutoPlay && note.isLong && !note.processed && currentTimeMs >= note.scheduledTime && !note.beingHeld) {
                // AUTO PLAY HOLD START
                note.processed = true;
                note.beingHeld = true;
                heldNotes[note.laneIndex] = note;

                judgementText = `PERFECT\nAUTO`;
                judgementColor = '#00ffff';
                judgementTimer = 1000;
                addHit('perfect'); // Count head? 
                spawnHitEffect(note.laneIndex, '#00ffff');

                // Visualize Hold
                pressedKeys[note.laneIndex] = true;
                // We don't release key yet

            } else if (isAutoPlay && note.isLong && note.beingHeld && currentTimeMs >= note.scheduledTime + note.duration) {
                // AUTO PLAY HOLD END
                // The first block (line 536 in original) handles the end of hold if it's being held.
                // But we need to ensure the key is released.
                pressedKeys[note.laneIndex] = false;
                // Logic above (lines 536-544) will catch the completion and add 'perfect'.

            } else if (!note.isLong || !note.processed) { // Check Head
                const msPassed = currentTimeMs - note.scheduledTime;

                if (msPassed > MISS_BOUNDARY && note.active) {
                    note.active = false;
                    judgementText = `MISS`;
                    judgementColor = '#ff0000';
                    judgementTimer = 1000;
                    addHit('miss');
                    if (note.isLong) addHit('miss'); // Penalize tail too for complete ignore
                }
            } else { // Long note processed but lost hold?
                const tailTime = note.scheduledTime + note.duration;
                if (currentTimeMs > tailTime + MISS_BOUNDARY) note.active = false;
            }
        });

        // Cleanup
        for (let i = notes.length - 1; i >= 0; i--) {
            const note = notes[i];
            const tailTime = note.scheduledTime + note.duration;
            const tailY = getNoteY(tailTime);

            // 1. Check if Off Screen
            if (tailY > canvas.height + 100) {
                // If it's still active and going off screen, it's a MISS!
                // (Fix for high speed notes skipping the time-based miss check)
                if (note.active) {
                    note.active = false;
                    judgementText = `MISS`;
                    judgementColor = '#ff0000';
                    judgementTimer = 1000;
                    addHit('miss');
                    if (note.isLong) addHit('miss'); // Penalize tail
                }
                notes.splice(i, 1);
            }
            // 2. Check if already processed (inactive)
            else if (!note.active) {
                notes.splice(i, 1);
            }
        }

        // Update Hit Effects
        for (let i = hitEffects.length - 1; i >= 0; i--) {
            const effect = hitEffects[i];
            // Decrease life based on deltaTime?
            // Life is 1.0 -> 0.0
            // We need to decrease by deltaTime / maxLife
            effect.life -= deltaTime / effect.maxLife;
            if (effect.life <= 0) {
                hitEffects.splice(i, 1);
            }
        }

        if (judgementTimer > 0) judgementTimer -= deltaTime;
    }

    function draw() {
        if (!ctx) return;

        // Clear / Draw Background
        if (!isPlaying && SKIN.titleBg) {
            // Title Screen BG (Static)
            ctx.drawImage(SKIN.titleBg, 0, 0, canvas.width, canvas.height);
        } else if (isPlaying) {
            // Game BG
            if (bgVideo && isVideoReady) {
                // Draw Video Frame
                // Maintain Aspect Ratio? Or Fill? Fill for now.
                ctx.drawImage(bgVideo, 0, 0, canvas.width, canvas.height);
            } else if (SKIN.gameBg) {
                // Fallback Image
                ctx.drawImage(SKIN.gameBg, 0, 0, canvas.width, canvas.height);
            }

            // Alpha dark overlay for playability
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
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, HIT_Y);
        ctx.lineTo(canvas.width, HIT_Y);
        ctx.stroke();

        // Draw Hit Effects (Below Label, Above Lines)
        ctx.save();
        hitEffects.forEach(effect => {
            ctx.strokeStyle = effect.color;
            ctx.lineWidth = 4;
            ctx.globalAlpha = effect.life; // Fade out

            // Effect: Expanding Rectangle or just blinking frame?
            // User requested "Rectangular frame-like effect"
            // Let's expand slightly as it fades
            const expand = (1.0 - effect.life) * 20; // 0 -> 20px expansion
            const x = effect.x - expand / 2;
            const w = effect.width + expand;
            const h = effect.height + expand / 2;
            const y = effect.y - expand / 4;

            ctx.strokeRect(x, y, w, h);

            // Inner fill with low opacity
            ctx.fillStyle = effect.color;
            ctx.globalAlpha = effect.life * 0.3;
            ctx.fillRect(x, y, w, h);
        });
        ctx.restore();

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

        // Draw Judgement Counts (Side)
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.textAlign = 'left';
        ctx.font = '20px monospace';
        const statsStartY = 150;
        const statsLineH = 30;
        ctx.fillText(`PERFECT: ${stats.perfect}`, 20, statsStartY);
        ctx.fillText(`GREAT:   ${stats.great}`, 20, statsStartY + statsLineH);
        ctx.fillText(`NICE:    ${stats.nice}`, 20, statsStartY + statsLineH * 2);
        ctx.fillText(`BAD:     ${stats.bad}`, 20, statsStartY + statsLineH * 3);
        ctx.fillText(`MISS:    ${stats.miss}`, 20, statsStartY + statsLineH * 4);
        const avgVal = stats.hitCount > 0 ? (stats.totalErrorMs / stats.hitCount).toFixed(1) : '0';
        ctx.fillText(`AVG:     ${avgVal}ms`, 20, statsStartY + statsLineH * 5);

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

        // Draw Combo & Score
        // Draw Combo & Score (Always Visible)
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 60px Arial';
        ctx.textAlign = 'center';
        ctx.globalAlpha = 0.3;
        ctx.fillText(stats.combo.toString(), canvas.width / 2, canvas.height / 2);

        // Subtraction Score Display (Under Combo)
        ctx.font = 'bold 30px Arial';
        if (isAutoPlay) {
            ctx.fillText('AUTO PLAY', canvas.width / 2, (canvas.height / 2) + 50);
        } else {
            let pct = ((totalMaxScore - lostScore) / totalMaxScore) * 100;
            if (pct < 0) pct = 0;
            const scoreText = pct.toFixed(4) + '%';
            ctx.fillText(scoreText, canvas.width / 2, (canvas.height / 2) + 50);
        }

        ctx.globalAlpha = 1.0;

        // Draw Judgement Stats (Left of Lanes)
        if (laneStartX > 150) { // Only if there's space
            const statsX = laneStartX - 140;
            const statsStartTime = canvas.height / 2 - 100;
            const lineHeight = 35;

            ctx.textAlign = 'right';
            ctx.font = 'bold 24px Arial';

            // Perfect
            ctx.fillStyle = '#00ffff';
            ctx.fillText(`PERFECT: ${stats.perfect}`, statsX, statsStartTime);

            // Great
            ctx.fillStyle = '#ffeb3b';
            ctx.fillText(`GREAT: ${stats.great}`, statsX, statsStartTime + lineHeight);

            // Nice
            ctx.fillStyle = '#00ff00';
            ctx.fillText(`NICE: ${stats.nice}`, statsX, statsStartTime + lineHeight * 2);

            // Bad
            ctx.fillStyle = '#ffae00';
            ctx.fillText(`BAD: ${stats.bad}`, statsX, statsStartTime + lineHeight * 3);

            // Miss
            ctx.fillStyle = '#ff0000';
            ctx.fillText(`MISS: ${stats.miss}`, statsX, statsStartTime + lineHeight * 4);

            // Avg Latency (Real-time)
            ctx.fillStyle = '#ffffff';
            const sideAvg = stats.hitCount > 0 ? (stats.totalErrorMs / stats.hitCount).toFixed(1) : '0';
            ctx.fillText(`AVG: ${sideAvg}ms`, statsX, statsStartTime + lineHeight * 5);
        }

        // Draw Health Gauge (Vertical, Left of Stats or Lanes)
        // Let's put it to the far left of lanes, or between stats and lanes?
        // Stats are at laneStartX - 140. Let's put bar at laneStartX - 20 ?
        if (laneStartX > 30) {
            const barW = 15;
            const barH = 400; // Fixed height
            const barX = laneStartX - 25;
            const barY = (canvas.height / 2) - 200; // Centered vertically relative to play area?

            // Background
            ctx.fillStyle = '#333';
            ctx.fillRect(barX, barY, barW, barH);
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1;
            ctx.strokeRect(barX, barY, barW, barH);

            // Fill
            const fillH = (currentHealth / 100) * barH;
            const fillY = barY + (barH - fillH);

            // Color based on Gauge Type
            if (gaugeType === 'norma') {
                // NORMA: Cyan/Yellow -> RED if >= 70%
                if (currentHealth >= 70) ctx.fillStyle = '#ff0055'; // Pinkish Red for Clear
                else if (currentHealth >= 40) ctx.fillStyle = '#00ffff'; // Cyan
                else ctx.fillStyle = '#ffff00'; // Yellowish for low? Or keep Cyan.
            } else {
                // LIFE (NORMAL & HARD): Green -> Yellow -> Red
                if (currentHealth > 50) ctx.fillStyle = '#00ff00'; // Green
                else if (currentHealth > 20) ctx.fillStyle = '#ffff00'; // Yellow
                else ctx.fillStyle = '#ff0000'; // Red
            }

            ctx.fillRect(barX, fillY, barW, fillH);

            // Text Label
            ctx.fillStyle = '#fff';
            ctx.font = '10px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(`${Math.floor(currentHealth)}%`, barX + barW / 2, barY + barH + 15);
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

                // Determine Note Height (Blue is same size, Space is thinner)
                let drawHeight = NOTE_HEIGHT;
                if (note.laneIndex === 4) {
                    drawHeight = 4.5;
                }

                // Determine Skin Image
                let skinImg = null;
                if (config.label === 'SPACE') skinImg = SKIN.space;
                else if (config.color === '#7CA4FF') skinImg = SKIN.blue;
                else skinImg = SKIN.white;

                if (note.isLong) {
                    const tailTime = note.scheduledTime + note.duration;
                    const headY = getNoteY(note.scheduledTime);
                    const tailY = getNoteY(tailTime);

                    // Set transparency for long notes (50% as requested)
                    const originalAlpha = ctx!.globalAlpha;
                    ctx!.globalAlpha = 0.5;

                    // Simple rect for long note Body
                    ctx!.fillStyle = bodyColor;
                    ctx!.fillRect(x + H_GAP, tailY, w - (H_GAP * 2), headY - tailY);

                    // Reset Alpha for Head to be fully visible
                    ctx!.globalAlpha = originalAlpha;

                    // Head (Draw as normal note)
                    if (skinImg) {
                        ctx!.drawImage(skinImg, x + H_GAP, headY - (drawHeight / 2), w - (H_GAP * 2), drawHeight);
                    } else {
                        ctx!.fillStyle = config.color;
                        ctx!.fillRect(x + H_GAP, headY - (drawHeight / 2), w - (H_GAP * 2), drawHeight);
                    }
                } else {
                    const noteY = getNoteY(note.scheduledTime);
                    if (skinImg) {
                        ctx!.drawImage(skinImg, x + H_GAP, noteY - (drawHeight / 2), w - (H_GAP * 2), drawHeight);
                    } else {
                        ctx!.fillStyle = config.color;
                        ctx!.fillRect(x + H_GAP, noteY - (drawHeight / 2), w - (H_GAP * 2), drawHeight);
                    }
                }
            });
        }

        // Pass 1: Space (4) - Behind
        drawNotesForLane(4);

        // Pass 2: White Notes (1, 3, 6, 8)
        [1, 3, 6, 8].forEach(idx => drawNotesForLane(idx));

        // Pass 3: Blue Notes (0, 2, 5, 7) - On Top
        [0, 2, 5, 7].forEach(idx => drawNotesForLane(idx));

        // Draw Lane Cover (Hidden Bar)
        if (isLaneCoverEnabled && VISUAL_LANES.length > 0) {
            const minX = VISUAL_LANES[0].x;
            const maxX = VISUAL_LANES[VISUAL_LANES.length - 1].x + VISUAL_LANES[VISUAL_LANES.length - 1].width;
            const coverW = maxX - minX;

            // Gradient for better look
            const gradient = ctx.createLinearGradient(minX, 0, minX, laneCoverHeight);
            gradient.addColorStop(0, '#000');
            gradient.addColorStop(0.8, '#222');
            gradient.addColorStop(1, '#444');

            ctx.fillStyle = gradient;
            ctx.fillRect(minX, 0, coverW, laneCoverHeight);

            // Bottom line
            ctx.strokeStyle = '#00ffff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(minX, laneCoverHeight);
            ctx.lineTo(maxX, laneCoverHeight);
            ctx.stroke();
        }

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

        // Draw Shutter (Fail Effect)
        if (isTrackFailed || shutterHeight > 0) {
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, canvas.width, shutterHeight);

            // Bottom line for shutter
            ctx.strokeStyle = '#555';
            ctx.lineWidth = 5;
            ctx.beginPath();
            ctx.moveTo(0, shutterHeight);
            ctx.lineTo(canvas.width, shutterHeight);
            ctx.stroke();

            if (shutterHeight > canvas.height / 2) {
                ctx.fillStyle = '#ff0000';
                ctx.font = 'bold 80px Arial';
                ctx.textAlign = 'center';
                ctx.fillText("TRACK FAILED", canvas.width / 2, canvas.height / 2);
            }
        }

        // Draw Speed/Height adjustment UI (At the bottom edge of lane cover)
        if (isNHolding && hasAdjustedDuringNHold) {
            const minX = (VISUAL_LANES.length > 0) ? VISUAL_LANES[0].x : canvas.width / 2 - 200;
            const maxX = (VISUAL_LANES.length > 0) ? (VISUAL_LANES[VISUAL_LANES.length - 1].x + VISUAL_LANES[VISUAL_LANES.length - 1].width) : canvas.width / 2 + 200;
            const coverW = maxX - minX;

            const uiW = 200;
            const uiH = 40;
            const uiX = minX + (coverW - uiW) / 2;
            // Place UI just below the cover line, but keep it on screen
            const uiY = Math.min(canvas.height - uiH, laneCoverHeight);

            ctx.fillStyle = 'rgba(0,0,0,0.85)';
            ctx.fillRect(uiX, uiY, uiW, uiH);
            ctx.strokeStyle = '#00ffff';
            ctx.lineWidth = 2;
            ctx.strokeRect(uiX, uiY, uiW, uiH);

            ctx.fillStyle = '#fff';
            ctx.font = 'bold 20px Arial';
            ctx.textAlign = 'center';
            if (isNDoubleTapHolding) {
                const spd = speedInput ? speedInput.value : '?.?';
                ctx.fillText(`SPEED: x${spd}`, uiX + uiW / 2, uiY + 27);
            } else {
                ctx.fillText(`HEIGHT: ${laneCoverHeight}px`, uiX + uiW / 2, uiY + 27);
            }
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
        if (isCountdown && countdownValue > 0 && ctx) {
            ctx.fillStyle = '#e040fb';
            ctx.font = 'bold 80px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(countdownValue.toString(), canvas.width / 2, canvas.height / 2);
        }

        requestAnimationFrame(loop);
    }

    function togglePause() {
        console.log(`togglePause() called. isPlaying=${isPlaying}, isCountdown=${isCountdown}, isPaused=${isPaused}`);
        if (!isPlaying) return;
        if (isCountdown) return;

        if (isPaused) {
            resumeGame();
        } else {
            pauseGame();
        }
    }

    function pauseGame() {
        pausedOffset = getAudioTime();
        isPaused = true;
        console.log(`pauseGame: paused at ${pausedOffset.toFixed(3)}s`);
        stopAudio();
        if (bgVideo) bgVideo.pause(); // Pause video

        pauseStatusText.textContent = "PAUSED";
        pauseOverlay.style.display = 'flex';
        btnResume.style.display = 'block';
    }

    function resumeGame() {
        // Start countdown
        isPaused = false;
        isCountdown = true;
        countdownValue = 3;

        pauseStatusText.textContent = "3";
        btnResume.style.display = 'none'; // Hide buttons during countdown
        btnRetry.style.display = 'none';
        btnQuit.style.display = 'none';

        const timer = setInterval(() => {
            countdownValue--;
            if (countdownValue > 0) {
                pauseStatusText.textContent = countdownValue.toString();
            } else {
                clearInterval(timer);
                finishCountdown();
            }
        }, 1000);
    }

    function finishCountdown() {
        console.log(`finishCountdown: resuming at ${pausedOffset.toFixed(3)}s`);
        isCountdown = false;
        isPlaying = true; // Ensure game is active
        pauseOverlay.style.display = 'none';
        btnRetry.style.display = 'block'; // Restore display for next pause
        btnQuit.style.display = 'block';
        playAudio(pausedOffset);
        if (bgVideo && isVideoReady) {
            bgVideo.currentTime = pausedOffset; // Sync video to audio
            bgVideo.play();
        }
    }

    function updateCountdown() {
        // No heavy processing needed here, setInterval handles value
    }

    function retryGame() {
        isPaused = false;
        isCountdown = false;
        pauseOverlay.style.display = 'none';
        if (currentSongData && currentChartFilename) {
            loadSong(currentSongData, currentChartFilename); // Restart
        }
    }

    function quitGame() {
        isPaused = false;
        isCountdown = false;
        isPlaying = false;
        stopAudio();
        if (bgVideo) bgVideo.pause(); // Stop video
        pauseOverlay.style.display = 'none';
        if (startScreen) startScreen.style.display = 'flex';
        controlsDiv.style.display = 'block';
        if (btnPauseUI) btnPauseUI.style.display = 'none';
    }

    // Add Pause Menu Listeners
    btnResume.addEventListener('click', resumeGame);
    btnRetry.addEventListener('click', retryGame);
    btnQuit.addEventListener('click', quitGame);

    // ==========================================
    // Interaction Handlers
    // ==========================================

    async function showResults() {
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

        // Calculate Final Scaled Score (0 - 1,000,000)
        const finalRatio = totalMaxScore > 0 ? (totalMaxScore - lostScore) / totalMaxScore : 0;
        const scaledScore = Math.floor(finalRatio * 1000000);

        // Calculate Rank
        let rank = 'D';
        if (finalRatio >= 0.95) rank = 'S';
        else if (finalRatio >= 0.9) rank = 'A';
        else if (finalRatio >= 0.8) rank = 'B';
        else if (finalRatio >= 0.7) rank = 'C';

        resultsOverlay.style.display = 'block';

        // Update Title based on Gauge Result
        const resTitle = resultsOverlay.querySelector('h2');
        let isClear = true;
        if (resTitle) {
            if (isTrackFailed) isClear = false;
            else if (gaugeType === 'norma' && currentHealth < 70) isClear = false;

            if (isClear) {
                resTitle.textContent = "TRACK CLEAR";
                resTitle.style.color = "#00ffff"; // Cyan
            } else {
                resTitle.textContent = "TRACK FAILED";
                resTitle.style.color = "#ff0000"; // Red
                rank = 'F'; // Force Rank F?
            }
        }

        // Format Descriptive Modifiers (e.g. NORMAL-white-RANDOM)

        // Format Descriptive Modifiers (e.g. NORMAL-white-RANDOM)
        let descriptiveModifiers = "";

        // 1. Gauge
        if (gaugeType === 'norma') descriptiveModifiers = "NORMA";
        else if (gaugeType === 'life') descriptiveModifiers = "NORMAL";
        else if (gaugeType === 'life_hard') descriptiveModifiers = "HARD";

        // 2. Assist
        if (assistSelect?.value === 'blue_to_white') descriptiveModifiers += "-white";
        else if (assistSelect?.value === 'space_boost') descriptiveModifiers += "-boost";

        // 3. Random
        if (randomSelect?.value === 'shuffle_color') descriptiveModifiers += "-RANDOM";
        else if (randomSelect?.value === 'shuffle_chaos') descriptiveModifiers += "-CHAOS";

        // Send to Server (Skip if AutoPlay)
        if (currentSongData && !isAutoPlay) {
            try {
                const response = await fetch('/api/score', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        songId: currentSongData.id,
                        difficulty: currentChartFilename, // Use filename as diff identifier
                        score: scaledScore,
                        rank: rank,
                        isClear: isClear,
                        layout: currentLayoutType,
                        modifiers: descriptiveModifiers,
                        combo: stats.maxCombo,
                        perfect: stats.perfect,
                        great: stats.great,
                        nice: stats.nice,
                        bad: stats.bad,
                        miss: stats.miss,
                        percentage: (finalRatio * 100).toFixed(4)
                    })
                });
                if (!response.ok) console.error('Failed to save score');
            } catch (e) {
                console.error('Error sending score:', e);
            }
        }
    }

    if (speedInput && speedDisplay) {
        speedInput.addEventListener('input', () => {
            const multiplier = parseFloat(speedInput.value);
            currentNoteSpeed = BASE_NOTE_SPEED * multiplier;
            speedDisplay.textContent = multiplier.toFixed(1);
            savePlayerSettings(); // <--- Save on change
        });
    }

    if (laneWidthInput && laneWidthDisplay) {
        laneWidthInput.addEventListener('input', () => {
            currentLaneWidth = parseInt(laneWidthInput.value);
            laneWidthDisplay.textContent = currentLaneWidth.toString();
            resize();
            savePlayerSettings(); // <--- Save on change
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
    const DIFF_ORDER = ['no', 'st', 'ad', 'pr', 'et'];
    const DIFF_LABELS: { [key: string]: string } = {
        'no': 'Normal', 'st': 'Standard', 'ad': 'Advanced', 'pr': 'Provecta', 'et': 'Eternal'
    };
    const DIFF_COLORS: { [key: string]: string } = {
        'no': '#4caf50', 'st': '#2196f3', 'ad': '#ffeb3b', 'pr': '#ff5722', 'et': '#9c27b0'
    };

    async function loadSongList() {
        try {
            const res = await fetch(`songs/list.json?t=${Date.now()}`);
            const list = await res.json();

            // Fetch High Scores
            let allScores: { [key: string]: any[] } = {};
            try {
                const scoresRes = await fetch(`scores.json?t=${Date.now()}`);
                if (scoresRes.ok) {
                    allScores = await scoresRes.json();
                }
            } catch (e) {
                console.error('Failed to fetch scores.json', e);
            }

            songListDiv.innerHTML = '';
            list.forEach((song: Song) => {
                const div = document.createElement('div');
                div.style.background = '#333';
                div.style.padding = '15px';
                div.style.marginBottom = '10px';
                div.style.border = '1px solid #555';
                div.style.display = 'flex';
                div.style.flexDirection = 'column';
                div.style.gap = '10px';

                // Header
                div.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <div style="font-size:1.2em; color:white; font-weight:bold;">${song.title}</div>
                            <div style="font-size:0.9em; color:#aaa;">${song.artist} | BPM: ${song.bpm}</div>
                        </div>
                    </div>
                `;

                // Difficulty Buttons Container
                const btnContainer = document.createElement('div');
                btnContainer.style.display = 'flex';
                btnContainer.style.gap = '15px';
                btnContainer.style.marginTop = '5px';
                btnContainer.style.flexWrap = 'wrap';

                // Render Buttons
                if (song.charts) {
                    let visibleButtons = 0;
                    DIFF_ORDER.forEach(diffKey => {
                        if (song.charts && song.charts[diffKey]) {
                            const filename = song.charts[diffKey];

                            // Detect Mode
                            let chartMode = '8key'; // Default Legacy
                            const lower = filename.toLowerCase();
                            if (lower.includes('4k')) chartMode = '4key';
                            else if (lower.includes('6k')) chartMode = '6key';
                            else if (lower.includes('12k')) chartMode = '12key';
                            // else if (lower.includes('8k')) chartMode = '8key';

                            // Filter
                            if (chartMode !== selectedModeFilter) return;

                            visibleButtons++;
                            const btnWrapper = document.createElement('div');
                            btnWrapper.style.display = 'flex';
                            btnWrapper.style.flexDirection = 'column';
                            btnWrapper.style.alignItems = 'center';
                            btnWrapper.style.gap = '5px';

                            const btn = document.createElement('button');
                            btn.style.border = 'none';
                            btn.style.background = 'transparent';
                            btn.style.cursor = 'pointer';
                            btn.style.padding = '0';

                            const img = document.createElement('img');
                            img.src = `assets/diff_${diffKey}.png`;
                            img.alt = diffKey.toUpperCase();
                            img.style.height = '40px'; // Adjust size as needed
                            img.style.objectFit = 'contain';
                            img.style.display = 'block';

                            // Hover effect
                            img.onmouseover = () => img.style.filter = 'brightness(1.2)';
                            img.onmouseout = () => img.style.filter = 'brightness(1.0)';

                            // Fallback to text if image missing
                            img.onerror = () => {
                                btn.textContent = DIFF_LABELS[diffKey] || diffKey.toUpperCase();
                                btn.style.padding = '5px 10px';
                                btn.style.borderRadius = '4px';
                                btn.style.color = '#fff';
                                btn.style.fontWeight = 'bold';
                                btn.style.background = DIFF_COLORS[diffKey] || '#777';
                            };

                            btn.appendChild(img);

                            btn.onclick = (e) => {
                                e.stopPropagation();

                                // Decide SE
                                if (selectedModeFilter === '12key') playSE('se_decide_extra');
                                else playSE('se_decide');

                                stopBGM();
                                loadSong(song, filename);
                            };

                            btnWrapper.appendChild(btn);

                            // High Score Label
                            const songScores = allScores[song.id] || [];

                            // Overall Best
                            const overallBest = songScores
                                .filter((s: any) => s.difficulty === filename)
                                .sort((a: any, b: any) => b.score - a.score)[0];

                            // Personal Best
                            const myBest = songScores
                                .filter((s: any) => s.difficulty === filename && s.playerName === currentPlayer)
                                .sort((a: any, b: any) => b.score - a.score)[0];

                            if (overallBest || myBest) {
                                const scoreDiv = document.createElement('div');
                                scoreDiv.style.fontSize = '10px';
                                scoreDiv.style.color = '#ccc';
                                scoreDiv.style.fontFamily = 'monospace';
                                scoreDiv.style.marginTop = '2px';

                                let text = '';
                                if (myBest) text += `My: ${myBest.score.toLocaleString()}`;
                                if (overallBest && (!myBest || overallBest.score > myBest.score)) {
                                    text += ` (Top: ${overallBest.score.toLocaleString()} ${overallBest.playerName})`;
                                }
                                scoreDiv.textContent = text;
                                btnWrapper.appendChild(scoreDiv);
                            }

                            btnContainer.appendChild(btnWrapper);
                        }
                    });

                    if (visibleButtons === 0) {
                        div.style.display = 'none';
                    }
                } else if (song.chart) {
                    // Legacy Fallback (Single Chart)
                    // Infer mode for single chart too
                    let chartMode = '8key';
                    if (song.chart) {
                        const lower = song.chart.toLowerCase();
                        if (lower.includes('4k')) chartMode = '4key';
                        else if (lower.includes('6k')) chartMode = '6key';
                        else if (lower.includes('12k')) chartMode = '12key';
                    }

                    if (chartMode === selectedModeFilter) {
                        const btn = document.createElement('button');
                        btn.textContent = 'PLAY';
                        btn.style.padding = '5px 15px';
                        btn.style.background = '#e040fb';
                        btn.style.border = 'none';
                        btn.style.color = 'white';
                        btn.style.cursor = 'pointer';
                        btn.onclick = (e) => {
                            e.stopPropagation();
                            // Decide SE
                            playSE('se_decide'); // Legacy charts are usually Normal/Hard, treat as Normal for now.
                            // Or check mode?
                            if (selectedModeFilter === '12key') playSE('se_decide_extra');
                            else playSE('se_decide');

                            loadSong(song, song.chart!);
                            stopBGM();
                            // playSE('se_start'); // loadSong already plays se_start? 
                            // Wait, loadSong had "playClickSound()" which was undefined.
                            // I should remove playClickSound() from loadSong or define it.
                            // NEW: User wants "Game Start Button" sound on start.
                            // Where is "Game Start"? Title -> Select -> Song -> Load -> Start Countdown.
                            // loadSong starts the sequence.
                            // se_decide is for CHOOSING the song.
                            // se_start is for TITLE SCREEN start? "Game Start Button Press".
                            // Usage:
                            // Title -> Click "Select Song" (Start Button?) -> se_start
                            // Song Select -> Click Song -> se_decide
                            // loadSong -> Countdown.
                            // I put se_start on btnStartSelect above.
                            // So here just se_decide.
                            // And remove se_start from loadSong if I added it?
                            // In step 616 I added:
                            // loadSong(song, song.chart!);
                            // stopBGM();
                            // playSE('se_start');
                            // This might be redundant or wrong if se_start is for Title.

                            // Let's assume:
                            // Title Screen Start -> se_start
                            // Song Choose -> se_decide
                        };
                        btnContainer.appendChild(btn);
                    } else {
                        div.style.display = 'none';
                    }
                }

                div.appendChild(btnContainer);
                songListDiv.appendChild(div);
            });
        } catch (e) {
            songListDiv.innerHTML = '<p style="color:red">Failed to load song list. Make sure "songs/list.json" exists.</p>';
        }
    }

    // State for Retry
    let currentChartFilename = '';

    async function loadSong(song: Song, chartFilename: string) {
        currentSongData = song; // Store for Retry
        currentChartFilename = chartFilename;

        // 0. Init Audio & Show Loading
        if (loadingOverlay) {
            loadingOverlay.style.display = 'flex';
            if (loadingText) loadingText.textContent = `LOADING...`;
        }

        try { initAudio(); } catch (e) { alert(e); return; }



        // 1. Fetch Audio & Chart
        try {
            // Load Audio
            console.log(`Loading audio: songs/${song.folder}/${song.audio}`);

            // Clean up previous video
            if (bgVideo) {
                bgVideo.pause();
                bgVideo.src = "";
                bgVideo = null;
            }
            isVideoReady = false;

            // Load Video if exists
            if (song.video) {
                console.log(`Loading video: songs/${song.folder}/${song.video}`);
                bgVideo = document.createElement('video');
                bgVideo.src = `songs/${song.folder}/${song.video}`;
                bgVideo.muted = true; // Audio handles sound
                bgVideo.loop = false;
                bgVideo.preload = 'auto';
                bgVideo.addEventListener('canplay', () => {
                    isVideoReady = true;
                    console.log('Video ready');
                });
                bgVideo.load();
            }

            const audioRes = await fetch(`songs/${song.folder}/${song.audio}`);
            const audioBuf = await audioRes.arrayBuffer();
            audioBuffer = await audioContext!.decodeAudioData(audioBuf);

            const chartRes = await fetch(`songs/${song.folder}/${chartFilename}?t=${Date.now()}`);
            const chartText = await chartRes.text();
            // BOM removal not typically needed for fetch unless file saved with BOM
            let text = chartText;
            if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

            const json = JSON.parse(text);

            // Determine Mode from Chart or Filename
            if (json.mode && GAME_MODES[json.mode as KeyMode]) {
                currentKeyMode = json.mode as KeyMode;
                console.log(`Mode set from chart: ${currentKeyMode}`);
            } else {
                if (currentChartFilename.toLowerCase().includes('4k')) currentKeyMode = '4key';
                else if (currentChartFilename.toLowerCase().includes('6k')) currentKeyMode = '6key';
                else if (currentChartFilename.toLowerCase().includes('8k')) currentKeyMode = '8key';
                else if (currentChartFilename.toLowerCase().includes('12k')) currentKeyMode = '12key';
                else if (currentChartFilename.toLowerCase().includes('12k')) currentKeyMode = '12key';
                else currentKeyMode = '8key';
                console.log(`Mode inferred from file: ${currentKeyMode}`);
            }

            // Recalculate layout for the new mode
            resize();

            if (!json.notes || !Array.isArray(json.notes)) {
                alert('Invalid Chart Data');
                return;
            }
            chartData = parseChart(json);

            // Apply Modifiers
            if (assistSelect && randomSelect) {
                const assistMode = assistSelect.value;
                const randomMode = randomSelect.value;
                if (assistMode !== 'none' || randomMode !== 'none') {
                    console.log(`Applying Modifiers: Assist=${assistMode}, Random=${randomMode}`);
                    chartData = applyModifiers(chartData, assistMode, randomMode);
                }
            }

            // 2. Start Game Logic (with Loading & Countdown)

            // Hide Loading
            if (loadingOverlay) loadingOverlay.style.display = 'none';

            currentMode = 'chart';
            resetStats();
            notes.length = 0;
            nextNoteIndex = 0;

            songSelectOverlay.style.display = 'none'; // Close UI
            // Controls already hidden by Select button logic
            if (resultsOverlay) resultsOverlay.style.display = 'none';
            if (startScreen) startScreen.style.display = 'none';

            // Reset pause states
            isPaused = false;
            isCountdown = false; // Will trigger via startCountdown
            pausedOffset = 0;
            if (btnPauseUI) btnPauseUI.style.display = 'block';

            // Start Countdown instead of immediate play
            startCountdown();

        } catch (e) {
            if (loadingOverlay) loadingOverlay.style.display = 'none';
            if (loadingOverlay) loadingOverlay.style.display = 'none';
            alert('Error loading song: ' + e);
        }
    }

    function startCountdown() {
        console.log('Initiating 3s Start Sequence (Falling Notes)...');

        isPlaying = true;
        isPaused = false;
        isCountdown = false;

        isStarting = true;
        startSequenceStartTime = performance.now();

        // Audio will be triggered in update() when getAudioTime() >= 0
    }

    function parseChart(json: any): ChartNote[] {
        const bpm = json.bpm || 120;
        const offset = json.offset || 0;
        const msPerBeat = 60000 / bpm;

        // Parse Notes
        const notes = json.notes.map((n: any) => ({
            time: offset + (n.beat * msPerBeat),
            lane: n.lane,
            duration: (n.duration || 0) * msPerBeat,
            isLong: (n.duration > 0),
            hit: false
        })).sort((a: any, b: any) => a.time - b.time);

        // Parse Layout Changes
        layoutChanges = [];
        if (Array.isArray(json.layoutChanges)) {
            json.layoutChanges.forEach((lc: any) => {
                layoutChanges.push({
                    time: offset + (lc.beat * msPerBeat),
                    type: lc.type
                });
            });
            layoutChanges.sort((a, b) => a.time - b.time);
        }

        return notes;
    }

    function applyModifiers(notes: ChartNote[], assist: string, random: string): ChartNote[] {
        let modified = JSON.parse(JSON.stringify(notes)); // Deep copy

        // 1. Random (Lane Shuffle)
        // Map original lanes to new lanes
        let laneMap = [0, 1, 2, 3, 4, 5, 6, 7, 8]; // Identity

        if (random === 'shuffle_color') {
            // Shuffle Blues [0, 2, 5, 7] independent of Whites [1, 3, 6, 8]
            const blues = [0, 2, 5, 7];
            const whites = [1, 3, 6, 8];

            // Helper shuffle
            const shuffle = (arr: number[]) => {
                for (let i = arr.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [arr[i], arr[j]] = [arr[j], arr[i]];
                }
                return arr;
            };

            const newBlues = shuffle([...blues]);
            const newWhites = shuffle([...whites]);

            // Assign back to map
            // Original Blue at index i goes to New Blue at index i?
            // No, we need to map "Lane X" -> "Lane Y".
            // Since original chart has fixed lanes, we map semantic position?
            // Actually, we just want to swap them around.
            // Map: if note is in blues[i], move to newBlues[i].

            blues.forEach((original, i) => { laneMap[original] = newBlues[i]; });
            whites.forEach((original, i) => { laneMap[original] = newWhites[i]; });

        } else if (random === 'shuffle_chaos') {
            // Shuffle all except Space (4)
            const lanes = [0, 1, 2, 3, 5, 6, 7, 8];
            const newLanes = [0, 1, 2, 3, 5, 6, 7, 8];
            // Fisher-Yates
            for (let i = newLanes.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [newLanes[i], newLanes[j]] = [newLanes[j], newLanes[i]];
            }

            lanes.forEach((original, i) => { laneMap[original] = newLanes[i]; });
        }

        // Apply Shuffle
        if (random !== 'none') {
            modified.forEach((n: any) => {
                if (n.lane !== 4) { // Don't move space usually
                    n.lane = laneMap[n.lane];
                }
            });
        }

        // 2. Assist
        if (assist === 'blue_to_white') {
            // Convert Blue to nearest White
            // 0(e)->1(d), 2(r)->3(f), 5(u)->6(j), 7(i)->8(k)
            const map: { [key: number]: number } = { 0: 1, 2: 3, 5: 6, 7: 8 };
            modified.forEach((n: any) => {
                if (map[n.lane] !== undefined) {
                    n.lane = map[n.lane];
                }
            });
        } else if (assist === 'space_boost') {
            // Convert random % of non-space notes to space
            // Let's say 20%? or maybe simplify complex streams?
            // "Increase space, decrease others"
            modified.forEach((n: any) => {
                if (n.lane !== 4) {
                    if (Math.random() < 0.25) { // 25% chance
                        n.lane = 4;
                    }
                }
            });
        }

        return modified;
    }

    function generateAutoChart(bpm: number, durationSec: number): ChartNote[] {
        const msPerBeat = 60000 / bpm;
        const totalBeats = (durationSec * 1000) / msPerBeat;
        const data = [];
        const laneMap = [0, 2, 5, 7];

        for (let i = 0; i < totalBeats; i++) {
            data.push({
                time: i * msPerBeat,
                lane: laneMap[i % 4],
                duration: 0,
                isLong: false,
                hit: false
            });
        }
        return data;
    }

    // Target structures for interpolation
    let VISUAL_LANE_TARGETS: VisualLane[] = [];
    let LANE_CONFIG_TARGETS: LaneConfig[] = [];

    // Resize handling
    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        HIT_Y = canvas.height - 100;
        currentLaneWidthState = currentLaneWidth;

        recalculateTargets();

        // If it's the first time or we want immediate snap, sync
        if (VISUAL_LANES.length === 0) {
            VISUAL_LANES = JSON.parse(JSON.stringify(VISUAL_LANE_TARGETS));
            LANE_CONFIGS = JSON.parse(JSON.stringify(LANE_CONFIG_TARGETS));
        }
    }

    function recalculateTargets() {
        const tempWidth = currentLaneWidth;

        const getLayoutData = (type: 'type-a' | 'type-b') => {
            const vLanes: VisualLane[] = [];
            const lConfigs: LaneConfig[] = [];

            // --- 9 KEY (Original Logic) ---
            if (currentKeyMode === '8key') {
                if (type === 'type-a') {
                    const totalPlayWidth = tempWidth * 4;
                    const sx = (canvas.width - totalPlayWidth) / 2;
                    laneStartX = sx;

                    for (let i = 0; i < 4; i++) {
                        vLanes.push({ x: sx + (i * tempWidth), width: tempWidth });
                    }

                    const assign = (keyIdx: number, visIdx: number, lbl: string, clr: string, xOff = 0, wScale = 1.0) => {
                        lConfigs[keyIdx] = { x: sx + (visIdx * tempWidth) + xOff, width: tempWidth * wScale, color: clr, label: lbl };
                    };
                    const blueScale = 1.0;
                    assign(0, 0, '', '#7CA4FF', 0, blueScale);
                    assign(1, 0, 'E/D', '#ffffff');
                    assign(2, 1, '', '#7CA4FF', 0, blueScale);
                    assign(3, 1, 'R/F', '#ffffff');
                    lConfigs[4] = { x: sx, width: totalPlayWidth, color: '#e040fb', label: 'SPACE' };
                    assign(5, 2, '', '#7CA4FF', 0, blueScale);
                    assign(6, 2, 'U/J', '#ffffff');
                    assign(7, 3, '', '#7CA4FF', 0, blueScale);
                    assign(8, 3, 'I/K', '#ffffff');

                } else {
                    const bScale = 1.0, wScale = 1.0;
                    const pairGap = tempWidth * 0.02;
                    const groupGap = tempWidth * 0.1;
                    const totalScale = (4 * bScale) + (4 * wScale);
                    const totalPlayWidth = (tempWidth * totalScale) + (4 * pairGap) + (3 * groupGap);
                    const sx = (canvas.width - totalPlayWidth) / 2;
                    laneStartX = sx;

                    const ord = [
                        { idx: 0, label: 'E', color: '#7CA4FF', scale: bScale, gapAfter: pairGap },
                        { idx: 1, label: 'D', color: '#ffffff', scale: wScale, gapAfter: groupGap },
                        { idx: 2, label: 'R', color: '#7CA4FF', scale: bScale, gapAfter: pairGap },
                        { idx: 3, label: 'F', color: '#ffffff', scale: wScale, gapAfter: groupGap },
                        { idx: 5, label: 'U', color: '#7CA4FF', scale: bScale, gapAfter: pairGap },
                        { idx: 6, label: 'J', color: '#ffffff', scale: wScale, gapAfter: groupGap },
                        { idx: 7, label: 'I', color: '#7CA4FF', scale: bScale, gapAfter: pairGap },
                        { idx: 8, label: 'K', color: '#ffffff', scale: wScale, gapAfter: 0 }
                    ];

                    let cx = sx;
                    ord.forEach(item => {
                        const w = tempWidth * item.scale;
                        vLanes.push({ x: cx, width: w });
                        lConfigs[item.idx] = { x: cx, width: w, color: item.color, label: item.label };
                        cx += w + item.gapAfter;
                    });
                    lConfigs[4] = { x: sx, width: totalPlayWidth, color: '#e040fb', label: 'SPACE' };
                }
            }
            // --- 4 KEY (d, f, j, k) ---
            else if (currentKeyMode === '4key') {
                const tempWidth = currentLaneWidth * 1.5;
                const totalPlayWidth = tempWidth * 4;
                const sx = (canvas.width - totalPlayWidth) / 2;
                laneStartX = sx;

                const indices = [1, 3, 6, 8];
                const labels = ['D', 'F', 'J', 'K'];
                const colors = ['#ffffff', '#7CA4FF', '#7CA4FF', '#ffffff']; // White Blue Blue White pattern

                indices.forEach((kIdx, i) => {
                    const x = sx + (i * tempWidth);
                    vLanes.push({ x, width: tempWidth });
                    lConfigs[kIdx] = { x, width: tempWidth, color: colors[i], label: labels[i] };
                });
                lConfigs[4] = { x: sx, width: totalPlayWidth, color: '#e040fb', label: 'SPACE' };
            }
            // --- 6 KEY (s, d, f, j, k, l) ---
            else if (currentKeyMode === '6key') {
                const tempWidth = currentLaneWidth * 1.2;
                const totalPlayWidth = tempWidth * 6;
                const sx = (canvas.width - totalPlayWidth) / 2;
                laneStartX = sx;

                const indices = [9, 1, 3, 6, 8, 10];
                const labels = ['S', 'D', 'F', 'J', 'K', 'L'];
                // Pattern: Blue White Blue | Blue White Blue?
                const colors = ['#7CA4FF', '#ffffff', '#7CA4FF', '#7CA4FF', '#ffffff', '#7CA4FF'];

                indices.forEach((kIdx, i) => {
                    const x = sx + (i * tempWidth);
                    vLanes.push({ x, width: tempWidth });
                    lConfigs[kIdx] = { x, width: tempWidth, color: colors[i], label: labels[i] };
                });
                lConfigs[4] = { x: sx, width: totalPlayWidth, color: '#e040fb', label: 'SPACE' };
            }
            // --- 8 KEY (e, d, r, f, u, j, i, k) ---

            // --- 12 KEY (s, l, w, o + others) ---
            else if (currentKeyMode === '12key') {
                const tempWidth = currentLaneWidth * 0.8;
                const totalPlayWidth = tempWidth * 12;
                const sx = (canvas.width - totalPlayWidth) / 2;
                laneStartX = sx;

                // Visual Order: S, W, D, E, F, R | U, J, I, K, O, L ? 
                // Or maybe just strictly linear?
                // Let's try to simulate a 2-row layout flattened.
                // Left hand: [S, W, D, E, F, R] -> [9, 11, 1, 0, 3, 2]
                // Right hand: [U, J, I, K, O, L] -> [5, 6, 7, 8, 12, 10]
                // But typically U, I, O are top row. J, K, L are bottom.
                // Top row: W, E, R, U, I, O
                // Bottom row: S, D, F, J, K, L
                // Flatten strategies: Zigzag? Or linear?
                // Linear: S, W, D, E, F, R ...
                // Let's use user supplied order: "sdfjklweruio"
                // Indices from user string: 9, 1, 3, 6, 8, 10, 11, 0, 2, 5, 7, 12.
                // Let's just create 12 lanes in that specific order, maybe it's meaningful to them.
                // Or maybe they just listed keys available.
                // Let's use a logical linear order based on key position.
                // S(9), D(1), F(3), J(6), K(8), L(10) -> Home Row
                // W(11), E(0), R(2), U(5), I(7), O(12) -> Top Row
                // Standard VSRG linear mapping often follows columns:
                // 1(S), 2(W), 3(D), 4(E), 5(F), 6(R), 7(U), 8(J), 9(I), 10(K), 11(O), 12(L)? 
                // (Note: U is index, J is index. U is above J. So U, J typically same column or adjacent? Usually adjacent in 7k+1)

                // My proposed linear order: [S, W, D, E, F, R, U, J, I, K, O, L]
                // Indices:
                const indices = [9, 11, 1, 0, 3, 2, 5, 6, 7, 8, 12, 10];
                const labels = ['S', 'W', 'D', 'E', 'F', 'R', 'U', 'J', 'I', 'K', 'O', 'L'];
                const colors = [
                    '#7CA4FF', '#e040fb', '#ffffff', '#e040fb', '#7CA4FF', '#e040fb',
                    '#e040fb', '#7CA4FF', '#e040fb', '#ffffff', '#e040fb', '#7CA4FF'
                ];

                indices.forEach((kIdx, i) => {
                    const x = sx + (i * tempWidth);
                    vLanes.push({ x, width: tempWidth });
                    lConfigs[kIdx] = { x, width: tempWidth, color: colors[i], label: labels[i] };
                });
            }

            return { vLanes, lConfigs };
        };

        const targets = getLayoutData(targetLayoutType);
        VISUAL_LANE_TARGETS = targets.vLanes;
        LANE_CONFIG_TARGETS = targets.lConfigs;
    }

    function updateLaneInterpolation() {
        // Linear Interpolate VISUAL_LANES and LANE_CONFIGS towards targets
        const lerp = (cur: number, tar: number) => cur + (tar - cur) * LERP_SPEED;

        // Visual Lanes
        if (VISUAL_LANES.length !== VISUAL_LANE_TARGETS.length) {
            // If length changed (e.g. Type A (4) -> Type B (8)), we just snap or rebuild
            VISUAL_LANES = JSON.parse(JSON.stringify(VISUAL_LANE_TARGETS));
        } else {
            for (let i = 0; i < VISUAL_LANES.length; i++) {
                VISUAL_LANES[i].x = lerp(VISUAL_LANES[i].x, VISUAL_LANE_TARGETS[i].x);
                VISUAL_LANES[i].width = lerp(VISUAL_LANES[i].width, VISUAL_LANE_TARGETS[i].width);
            }
        }

        // Lane Configs
        for (let i = 0; i < LANE_CONFIGS.length; i++) {
            if (!LANE_CONFIGS[i] || !LANE_CONFIG_TARGETS[i]) continue;
            LANE_CONFIGS[i].x = lerp(LANE_CONFIGS[i].x, LANE_CONFIG_TARGETS[i].x);
            LANE_CONFIGS[i].width = lerp(LANE_CONFIGS[i].width, LANE_CONFIG_TARGETS[i].width);
            // Snap label and color
            LANE_CONFIGS[i].label = LANE_CONFIG_TARGETS[i].label;
            LANE_CONFIGS[i].color = LANE_CONFIG_TARGETS[i].color;
        }
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

        if (e.key === 'Escape' || e.key === 'Esc' || e.code === 'Escape') {
            console.log('Escape key pressed, toggling pause...');
            togglePause();
            e.preventDefault();
            return;
        }

        if (e.code === 'Space') e.preventDefault();

        const now = performance.now();
        const keyLower = e.key.toLowerCase();

        // 1. "N" Combos (Cover & Speed)
        if (keyLower === 'n' && !e.repeat) {
            isNHolding = true;
            hasAdjustedDuringNHold = false; // Reset on new press

            if (now - lastNPressTime < DOUBLE_TAP_WINDOW) {
                // Second tap: Start holding mode for Speed
                isNDoubleTapHolding = true;

                // Capture original state
                originalLaneCoverHeight = laneCoverHeight;
                originalIsLaneCoverEnabled = isLaneCoverEnabled;

                // Hide cover during adjustment (temporarily)
                laneCoverHeight = 0;
                isLaneCoverEnabled = false;
            }
            lastNPressTime = now;
        }

        // 3. Arrow Keys (Combo interactions)
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            if (isNDoubleTapHolding) {
                e.preventDefault();
                hasAdjustedDuringNHold = true;
                if (speedInput) {
                    const currentVal = parseFloat(speedInput.value);
                    const step = 0.1;
                    const newVal = e.key === 'ArrowUp' ? currentVal + step : Math.max(0.1, currentVal - step);
                    speedInput.value = newVal.toFixed(1);
                    // Update currentNoteSpeed immediately
                    currentNoteSpeed = BASE_NOTE_SPEED * newVal;
                    if (speedDisplay) speedDisplay.textContent = newVal.toFixed(1);
                    savePlayerSettings();
                }
                return;
            } else if (isNHolding) {
                e.preventDefault();
                hasAdjustedDuringNHold = true;
                const step = 10; // 10px adjustment
                laneCoverHeight = e.key === 'ArrowUp' ? Math.max(0, laneCoverHeight - step) : Math.min(canvas.height, laneCoverHeight + step);

                if (laneCoverHeightInput) laneCoverHeightInput.value = laneCoverHeight.toString();
                if (laneCoverHeightDisplay) laneCoverHeightDisplay.textContent = laneCoverHeight.toString();
                savePlayerSettings();
                return;
            }
        }

        const keyIndex = KEYS.indexOf(e.key.toLowerCase());

        // Filter by Mode
        if (keyIndex !== -1) {
            const allowedIndices = GAME_MODES[currentKeyMode].indices;
            if (!allowedIndices.includes(keyIndex)) return;
        }

        if (keyIndex !== -1 && !pressedKeys[keyIndex]) {
            pressedKeys[keyIndex] = true;

            // Hit Detection
            const targetNotes = notes.filter(n =>
                n.active &&
                n.laneIndex === keyIndex &&
                !n.processed
            ).sort((a, b) => a.scheduledTime - b.scheduledTime);

            if (targetNotes.length > 0) {
                const note = targetNotes[0];
                const currentTimeMs = getAudioTime() * 1000;
                const msErrorRaw = currentTimeMs - note.scheduledTime;
                const msError = msErrorRaw - globalOffset; // Apply User Offset
                const absError = Math.abs(msError);

                if (absError < THRESHOLD_BAD) {
                    const sign = msError > 0 ? '+' : '';

                    if (absError < THRESHOLD_PERFECT) {
                        judgementText = `PERFECT\n${sign}${Math.floor(msError)}ms`;
                        judgementColor = '#00ffff';
                        addHit('perfect', msError);
                        spawnHitEffect(note.laneIndex, '#00ffff');
                    } else if (absError < THRESHOLD_GREAT) {
                        judgementText = `GREAT\n${sign}${Math.floor(msError)}ms`;
                        judgementColor = '#ffeb3b';
                        addHit('great', msError);
                        spawnHitEffect(note.laneIndex, '#ffeb3b');
                    } else if (absError < THRESHOLD_NICE) {
                        judgementText = `NICE\n${sign}${Math.floor(msError)}ms`;
                        judgementColor = '#00ff00';
                        addHit('nice', msError);
                        spawnHitEffect(note.laneIndex, '#00ff00');
                    } else {
                        judgementText = `BAD\n${sign}${Math.floor(msError)}ms`;
                        judgementColor = '#ffae00';
                        addHit('bad', msError);
                        // No effect for BAD? optional
                    }
                    judgementTimer = 1000;

                    if (note.isLong) {
                        note.processed = true;
                        note.beingHeld = true;
                        heldNotes[keyIndex] = note;
                    } else {
                        note.active = false;
                    }
                }
            }
        }
    });

    window.addEventListener('keyup', (e) => {
        const keyLower = e.key.toLowerCase();
        if (keyLower === 'n') {
            const now = performance.now();

            if (isNDoubleTapHolding) {
                if (hasAdjustedDuringNHold) {
                    // Restore cover and Force ON (Reverted scaling logic here)
                    laneCoverHeight = originalLaneCoverHeight;
                    isLaneCoverEnabled = true;
                } else {
                    // Quick double tap (no adjustment) -> Toggle!
                    isLaneCoverEnabled = !originalIsLaneCoverEnabled;
                    laneCoverHeight = originalLaneCoverHeight;
                }
                if (laneCoverCheckbox) laneCoverCheckbox.checked = isLaneCoverEnabled;
                savePlayerSettings();
            }

            isNHolding = false;
            isNDoubleTapHolding = false;
            hasAdjustedDuringNHold = false;
        }

        const keyIndex = KEYS.indexOf(keyLower);
        if (keyIndex !== -1) {
            const allowedIndices = GAME_MODES[currentKeyMode].indices;
            // Allow keyup if previously pressed? Or just filter strictly?
            // Strict filter is safer to avoid released ghost keys
            if (!allowedIndices.includes(keyIndex)) return;

            pressedKeys[keyIndex] = false;

            // Release Long Note
            if (heldNotes[keyIndex]) {
                const note = heldNotes[keyIndex]!;
                heldNotes[keyIndex] = null;
                note.beingHeld = false;

                // If released before completion, deactivate and count as BAD
                const tailTime = note.scheduledTime + note.duration;
                const currentTimeMs = getAudioTime() * 1000;
                if (currentTimeMs < tailTime - THRESHOLD_PERFECT) {
                    note.active = false;
                    judgementText = "MISS\nRELEASE";
                    judgementColor = "#ff0000";
                    judgementTimer = 1000;
                    addHit('miss');
                }
            }
        }
    });
    // Start Loop
    requestAnimationFrame(loop);

    // --- Sound Effects ---
    const sfxDecision = new Audio('assets/decision.mp3');
    sfxDecision.load();

    function playClickSound() {
        sfxDecision.currentTime = 0;
        sfxDecision.play().catch(e => {
            // console.log('SFX Play blocked', e);
        });
    }

    // Attach to UI Buttons
    const uiButtons = [
        btnSelectSong, btnCloseSelect, btnStartSelect,
        btnResume, btnRetry, btnQuit, btnCloseResults,
        btnPauseUI, btnCalibrate, btnCancelCalibration,
        btnOptionsToggle, btnRandom, btnChart,
        btnAddPlayer, btnClosePlayer, playerDisplay, playerDisplayInSelect
    ];

    uiButtons.forEach(btn => {
        if (btn) {
            btn.addEventListener('click', playClickSound);
        }
    });

})(); // Correct end of IIFE



