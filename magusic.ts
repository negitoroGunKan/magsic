import type { BPMChange, ChartNote, JudgmentType, GaugeType, KeyMode } from './src/core/types';
import type { LayoutChangeEvent } from './src/core/chart';
import { getTimeFromBeat as _getTimeFromBeat, getBeatFromTime as _getBeatFromTime } from './src/core/bpm';
import { JUDGMENT_THRESHOLDS } from './src/core/judgment';
import { SCORE_WEIGHTS, calculateMaxScore, calculateLoss, calculateScore } from './src/core/score';
import { getInitialHealth, applyGaugeHit, isTrackCleared } from './src/core/gauge';
import { parseChart as _parseChart } from './src/core/chart';
import { applyModifiers as _applyModifiers, AssistMode, RandomMode } from './src/core/modifiers';

(() => {
    console.log('Magusic script executing...');

    // --- Constants and Types ---
    const BASE_NOTE_SPEED = 0.5;
    let currentNoteSpeed = BASE_NOTE_SPEED * 2.5;
    const KEYS = ['e', 'd', 'r', 'f', ' ', 'u', 'j', 'i', 'k', 's', 'l', 'w', 'o'];
    const GAME_MODES: { [key in KeyMode]: { indices: number[], label: string } } = {
        '4key': { indices: [1, 3, 6, 8, 4], label: '4 KEY' },
        '6key': { indices: [9, 1, 3, 6, 8, 10, 4], label: '6 KEY' },
        '8key': { indices: [0, 1, 2, 3, 4, 5, 6, 7, 8], label: '8 KEY' },
        '12key': { indices: [0, 1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12, 4], label: '12 KEY' }
    };
    const SKIN: { [key: string]: HTMLImageElement | null } = {
        white: null, blue: null, space: null, titleBg: null, gameBg: null,
        resBg: null,
        // In-game Judgements (PlayRoom)
        judgeCritical1: null, judgeCritical2: null,
        judgeGreat1: null,
        judgeGood1: null,
        judgeFail1: null,
        judgeMiss1: null, judgeMiss2: null,
        // Result Screen Judgements
        resCritical1: null, resCritical2: null,
        resGreat1: null,
        resGood1: null,
        resFail1: null,
        resMiss1: null, resMiss2: null
    };

    // --- State Variables (Hoisted for Initialization) ---
    let currentPlayer = localStorage.getItem('magsic_player') || 'Guest';
    let globalOffset = 0;
    let visualOffset = 0;
    let currentLaneWidth = 200;
    let isLaneCoverEnabled = false;
    let laneCoverHeight = 300;
    let laneCoverSpeedMult = 1.0;
    let gaugeType: 'norma' | 'life' | 'life_hard' = 'norma';
    let isAutoPlay = false;
    let isMVLayout = false;
    let laneOpacity = 1.0;
    let currentSkin = 'default';

    // Rival State
    interface RivalScoreEvent {
        time: number;
        weight: number;
    }
    let rivalPercent = 90;
    let isRivalShowEnabled = true;
    let scoreDisplayType: 'percent' | 'value' = 'percent';
    let rivalScoreEvents: RivalScoreEvent[] = [];
    let isRivalBarEnabled = true;
    let playerNickname = '';
    let playerBio = '';
    let rivalEventIndex = 0;
    let currentModeIndex = 0;
    let currentDaniIndex = 0;
    let rivalPassedMaxScore = 0;
    let playerIconBase64 = '';
    let battleServerUrl = '';

    // Ranked Mode (Dani Nintei) State
    let isDaniMode = false;
    let daniCourses: any[] = [];
    let currentDaniCourse: any = null;
    let daniSongIndex = 0;
    let daniHealth = 100; // Survival health (0-100)
    const DANI_PENALTIES = {
        miss: 6,
        fail: 6,
        good: 2,
        great: 0,
        critical: -0.5
    };

    // Layout and Interpolation State
    let currentLayoutType: 'type-a' | 'type-b' | 'default' = 'default';
    let targetLayoutType: 'type-a' | 'type-b' = 'type-a';
    let LERP_SPEED = 0.15;
    let currentLaneWidthState = 200;

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
    const shutterOverlay = document.getElementById('shutter-overlay') as HTMLDivElement;
    const introOverlay = document.getElementById('intro-overlay') as HTMLDivElement;
    const introSongTitle = document.getElementById('intro-song-title') as HTMLHeadingElement;
    const introSongLevel = document.getElementById('intro-song-level') as HTMLDivElement;
    let introBGM: HTMLAudioElement | null = null;
    const debugLog = document.getElementById('debug-log') as HTMLDivElement;
    const daniSelectOverlay = document.getElementById('dani-select-overlay') as HTMLDivElement;
    const daniListDiv = document.getElementById('dani-list') as HTMLDivElement;
    const btnCloseDani = document.getElementById('btn-close-dani') as HTMLButtonElement;

    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    const ctx = canvas ? canvas.getContext('2d') : null;

    const titleBgVideo = document.getElementById('title-bg-video') as HTMLVideoElement;
    const logo = document.getElementById('title-logo') as HTMLImageElement;

    let HIT_Y = 0;
    let judgementHeightOffset = 200; // Default height for judgement display
    const NOTE_HEIGHT = 15;
    let currentKeyMode: KeyMode = '8key';

    const speedInput = document.getElementById('speed-input') as HTMLInputElement;
    const speedDisplay = document.getElementById('speed-display') as HTMLSpanElement;
    const offsetInput = document.getElementById('offset-input') as HTMLInputElement;
    const offsetDisplay = document.getElementById('offset-display') as HTMLSpanElement;
    const visualOffsetInput = document.getElementById('visual-offset-input') as HTMLInputElement;
    const visualOffsetDisplay = document.getElementById('visual-offset-display') as HTMLSpanElement;
    const judgementHeightInput = document.getElementById('judgement-height-input') as HTMLInputElement;
    const judgementHeightDisplay = document.getElementById('judgement-height-display') as HTMLSpanElement;
    const laneWidthInput = document.getElementById('lane-width-input') as HTMLInputElement;
    const laneWidthDisplay = document.getElementById('lane-width-display') as HTMLSpanElement;
    const laneCoverCheckbox = document.getElementById('lane-cover-checkbox') as HTMLInputElement;
    const skinSelect = document.getElementById('skin-select') as HTMLSelectElement;
    const laneCoverHeightInput = document.getElementById('lane-cover-height-input') as HTMLInputElement;
    const laneCoverHeightDisplay = document.getElementById('lane-cover-height-display') as HTMLSpanElement;
    const laneCoverSpeedInput = document.getElementById('lane-cover-speed-input') as HTMLInputElement;
    const laneCoverSpeedDisplay = document.getElementById('lane-cover-speed-display') as HTMLSpanElement;
    const autoPlayCheckbox = document.getElementById('auto-play-checkbox') as HTMLInputElement;
    const assistSelect = document.getElementById('assist-select') as HTMLSelectElement;
    const randomSelect = document.getElementById('random-select') as HTMLSelectElement;
    const audioInput = document.getElementById('audio-input') as HTMLInputElement;
    const chartInput = document.getElementById('chart-input') as HTMLInputElement;
    const laneOpacityInput = document.getElementById('lane-opacity-input') as HTMLInputElement;
    const laneOpacityDisplay = document.getElementById('lane-opacity-display') as HTMLSpanElement;

    const rivalScoreInput = document.getElementById('rival-score-input') as HTMLInputElement;
    const rivalScoreDisplay = document.getElementById('rival-score-display') as HTMLSpanElement;
    const rivalShowCheckbox = document.getElementById('rival-show-checkbox') as HTMLInputElement;
    const scoreDisplayTypeSelect = document.getElementById('score-display-type-select') as HTMLSelectElement;
    const nicknameInput = document.getElementById('nickname-input') as HTMLInputElement;
    const bioInput = document.getElementById('bio-input') as HTMLInputElement;

    const optIconInput = document.getElementById('opt-icon-input') as HTMLInputElement;
    const optIconPreview = document.getElementById('opt-icon-preview') as HTMLImageElement;
    const optIconPlaceholder = document.getElementById('opt-icon-placeholder') as HTMLSpanElement;
    const lobbyPlayerYouIcon = document.getElementById('lobby-player-you-icon') as HTMLImageElement;
    const lobbyPlayerYouPlaceholder = document.getElementById('lobby-player-you-placeholder') as HTMLSpanElement;
    const rivalBarCheckbox = document.getElementById('rival-bar-checkbox') as HTMLInputElement;
    const btnGaugeRoll = document.getElementById('btn-gauge-roll') as HTMLButtonElement;
    const gaugeRollName = document.getElementById('gauge-roll-name') as HTMLDivElement;
    const gaugeRollDesc = document.getElementById('gauge-roll-desc') as HTMLDivElement;

    const btnCalibrate = document.getElementById('btn-calibrate') as HTMLButtonElement;
    const btnCancelCalibration = document.getElementById('btn-cancel-calibration') as HTMLButtonElement;
    const btnSelectSong = document.getElementById('btn-select-song') as HTMLButtonElement;
    // btnStartSelect removed (using startScreen click instead)
    const btnViewRecords = document.getElementById('btn-view-records') as HTMLButtonElement;
    const btnCloseSelect = document.getElementById('btn-close-select') as HTMLButtonElement;
    const btnCloseResults = document.getElementById('btn-close-results') as HTMLButtonElement;
    const btnResume = document.getElementById('btn-resume') as HTMLButtonElement;
    const btnRetry = document.getElementById('btn-retry') as HTMLButtonElement;
    const btnQuit = document.getElementById('btn-quit') as HTMLButtonElement;
    const btnOptionsToggle = document.getElementById('btn-options-toggle') as HTMLButtonElement;
    const btnCloseOptions = document.getElementById('btn-close-options') as HTMLButtonElement;
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
    let titleAnimRequestId: number | null = null;

    // --- Preview Canvas Logic ---
    let previewNotes: { timeMs: number, active: boolean, hit: boolean }[] = [];
    let previewJudgementText: string = "";
    let previewJudgementColor: string = "#fff";
    let previewJudgementTimer: number = 0;
    let lastPreviewSpawnTime: number = 0;
    const PREVIEW_INTERVAL = 1000;

    function startTitleLoop() {
        if (!logo || !startScreen || !titleBgVideo) return;
        if (titleAnimRequestId) return; // Already running

        let startTime = performance.now();
        function animLoop(time: number) {
            if (startScreen.style.display === 'none') {
                titleAnimRequestId = null;
                return;
            }

            if (titleBgVideo.paused) {
                titleBgVideo.play().catch(e => console.log("Video play deferred:", e));
            }

            const elapsed = (time - startTime) / 1000;
            const scaleFactor = 1 + (0.03 * Math.sin(elapsed * 2));
            logo.style.transform = `scale(${scaleFactor})`;

            titleAnimRequestId = requestAnimationFrame(animLoop);
        }
        titleAnimRequestId = requestAnimationFrame(animLoop);
    }

    function showStartScreen(show: boolean) {
        if (!startScreen) return;
        if (show) {
            startScreen.style.display = 'flex';
            startTitleLoop();
        } else {
            startScreen.style.display = 'none';
        }
    }

    // Call initial show
    loadSkin(); // Load assets
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        showStartScreen(true);
    } else {
        window.addEventListener('load', () => showStartScreen(true));
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
    const resCombo = document.getElementById('res-combo') as HTMLSpanElement;
    const resAvg = document.getElementById('res-avg') as HTMLSpanElement;
    
    // Custom Result Screen Elements
    const customResultScreen = document.getElementById('custom-results-screen') as HTMLDivElement;
    const valResCritical = document.getElementById('val-res-critical') as HTMLSpanElement;
    const valResGreat = document.getElementById('val-res-great') as HTMLSpanElement;
    const valResGood = document.getElementById('val-res-good') as HTMLSpanElement;
    const valResFail = document.getElementById('val-res-fail') as HTMLSpanElement;
    const valResMiss = document.getElementById('val-res-miss') as HTMLSpanElement;
    const valResCombo = document.getElementById('val-res-combo') as HTMLSpanElement;
    const valResScore = document.getElementById('val-res-score') as HTMLSpanElement;
    const btnCloseCustomResults = document.getElementById('btn-close-custom-results') as HTMLButtonElement;
    const imgResCritical = document.getElementById('img-res-critical') as HTMLImageElement;
    const imgResGreat = document.getElementById('img-res-great') as HTMLImageElement;
    const imgResGood = document.getElementById('img-res-good') as HTMLImageElement;
    const imgResFail = document.getElementById('img-res-fail') as HTMLImageElement;
    const imgResMiss = document.getElementById('img-res-miss') as HTMLImageElement;
    const resultStatusTitle = document.getElementById('result-status-title') as HTMLHeadingElement;
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
            // Return to start screen or controls? 
            showStartScreen(true);
            controlsDiv.style.display = 'block'; // Make drawer available
            if (controlsDiv.classList.contains('show-options')) controlsDiv.classList.remove('show-options');
            songSelectOverlay.style.display = 'none';
        });
    }

    if (btnCloseCustomResults) {
        btnCloseCustomResults.addEventListener('click', () => {
            if (customResultScreen) customResultScreen.style.display = 'none';
            stopResultBlinking();
            
            // Reset state
            isTrackFailed = false;
            shutterHeight = 0;
            if (canvas) canvas.style.display = 'block'; // Restore canvas for next time

            if (isBattleSelectMode) {
                if (wsBattle) {
                    wsBattle.close();
                    wsBattle = null;
                }
                isBattleSelectMode = false;
                if (songSelectOverlay) {
                    songSelectOverlay.style.display = 'none';
                    songSelectOverlay.classList.remove('battle-mode');
                }
                openBattleLobby();
                return;
            }

            if (isDaniMode && currentDaniCourse) {
                daniSongIndex++;
                if (daniSongIndex < 4) {
                    // Start next song
                    const nextSong = currentDaniCourse.songs[daniSongIndex];
                    loadSong(nextSong.folder, nextSong.chart, nextSong.audio);
                    return;
                } else {
                    // Completed the course!
                    alert(`Congratulations! You passed ${currentDaniCourse.title}!`);
                    isDaniMode = false;
                    currentDaniCourse = null;
                }
            }

            // Transition to Song Select instead of Title
            openSongSelect();
        });
    }

    // State
    let selectedModeFilter: '4key' | '6key' | '8key' | '12key' = '6key'; // Default to 6Key

    // --- Select Menu State ---
    const menuOverlay = document.getElementById('menu-overlay') as HTMLDivElement;

    // Global Keyboard Navigation for Play Mode Select Menu
    document.addEventListener('keydown', (e) => {
        if (menuOverlay && (menuOverlay.style.display === 'flex' || menuOverlay.style.display === 'block')) {
            const activeEl = document.activeElement;
            const isInputField = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');
            if (isInputField) return;

            const keyLower = e.key.toLowerCase();
            if (keyLower === 's' || e.key === 'ArrowLeft') {
                e.preventDefault();
                currentModeIndex = (currentModeIndex - 1 + PLAY_MODES_INFO.length) % PLAY_MODES_INFO.length;
                renderModeCarousel();
                playSE('se_select');
            } else if (keyLower === 'l' || e.key === 'ArrowRight') {
                e.preventDefault();
                currentModeIndex = (currentModeIndex + 1) % PLAY_MODES_INFO.length;
                renderModeCarousel();
                playSE('se_select');
            } else if (keyLower === 'd' || keyLower === 'j' || e.key === 'Enter') {
                e.preventDefault();
                executePlayModeAction();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                menuOverlay.style.display = 'none';
                showStartScreen(true);
                playSE('se_back');
            }
        }
    });

    // Global Keyboard Navigation for Dani Select Menu
    document.addEventListener('keydown', (e) => {
        if (daniSelectOverlay && (daniSelectOverlay.style.display === 'flex' || daniSelectOverlay.style.display === 'block')) {
            const activeEl = document.activeElement;
            const isInputField = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');
            if (isInputField) return;

            const keyLower = e.key.toLowerCase();
            if (keyLower === 'd' || e.key === 'ArrowUp') {
                e.preventDefault();
                currentDaniIndex = (currentDaniIndex - 1 + DANI_COURSES_DUMMY.length) % DANI_COURSES_DUMMY.length;
                renderDaniScrollList();
                playSE('se_select');
            } else if (keyLower === 'k' || e.key === 'ArrowDown') {
                e.preventDefault();
                currentDaniIndex = (currentDaniIndex + 1) % DANI_COURSES_DUMMY.length;
                renderDaniScrollList();
                playSE('se_select');
            } else if (keyLower === 'f' || keyLower === 'j' || e.key === 'Enter') {
                e.preventDefault();
                const activeCourse = DANI_COURSES_DUMMY[currentDaniIndex];
                if (isDaniLocked(activeCourse.title)) {
                    playSE('se_cancel');
                    alert(`「${activeCourse.title}」はロックされています。1つ前の段位をクリアしてください。`);
                } else {
                    playSE('se_decide');
                    const confirmClear = confirm(`このダミー段位「${activeCourse.title}」に合格（クリア）したことにしますか？\n（クリアすると曲名が公開され、上位段位が解放されます）`);
                    if (confirmClear) {
                        setDaniCleared(activeCourse.title);
                        renderDaniScrollList();
                        alert(`「${activeCourse.title}」をクリアしました！`);
                    } else {
                        alert(`「${activeCourse.title}」コースは近々実装予定です。`);
                    }
                }
            } else if (e.key === 'Escape') {
                e.preventDefault();
                playSE('se_cancel');
                if (daniSelectOverlay) daniSelectOverlay.style.display = 'none';
                if (menuOverlay) {
                    menuOverlay.style.display = 'flex';
                    renderModeCarousel();
                }
            }
        }
    });

    // Global Keyboard Navigation for Battle Matching Lobby
    document.addEventListener('keydown', (e) => {
        if (battleLobbyOverlay && (battleLobbyOverlay.style.display === 'flex' || battleLobbyOverlay.style.display === 'block')) {
            const activeEl = document.activeElement;
            const isInputField = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');
            if (isInputField) return;

            const keyLower = e.key.toLowerCase();
            if (keyLower === 'enter' || keyLower === 'f' || keyLower === 'j') {
                e.preventDefault();
                if (isMatched) {
                    playSE('se_decide');
                    enterBattleSelectScreen();
                } else {
                    // Force start shortcut for testing convenience
                    playSE('se_decide');
                    triggerMatchFound();
                    setTimeout(() => {
                        enterBattleSelectScreen();
                    }, 800);
                }
            } else if (e.key === 'Escape') {
                e.preventDefault();
                playSE('se_cancel');
                if (matchingTimer) clearTimeout(matchingTimer);
                if (battleLobbyOverlay) battleLobbyOverlay.style.display = 'none';
                if (menuOverlay) {
                    menuOverlay.style.display = 'flex';
                    renderModeCarousel();
                }
            }
        }
    });

    // Start Screen Click Transition (Press Button) -> Open Menu
    if (startScreen) {
        startScreen.addEventListener('click', () => {
            // 1. Initialize Audio Context (User Gesture)
            try {
                initAudio();
            } catch (e) { console.error('Audio Init Error:', e); }

            playSE('se_start');
            currentModeIndex = 0;
            renderModeCarousel();
            if (menuOverlay) {
                menuOverlay.style.display = 'flex';
            }
        });
    }

    function openSongSelectForReal() {
        console.log('openSongSelectForReal called'); // DEBUG
        showStartScreen(false);
        if (controlsDiv) {
            controlsDiv.style.display = 'block';
            controlsDiv.classList.remove('show-options'); // Close drawer if open
        }

        if (menuOverlay) {
            menuOverlay.style.display = 'none';
        }

        if (songSelectOverlay) {
            songSelectOverlay.style.display = 'flex'; // Fix: Use FLEX not BLOCK
            if (isBattleSelectMode) {
                songSelectOverlay.classList.add('battle-mode');
            } else {
                songSelectOverlay.classList.remove('battle-mode');
            }
            console.log('songSelectOverlay display set to FLEX'); // DEBUG
        } else {
            console.error('songSelectOverlay NOT FOUND');
        }

        // Add Mode Tabs if not present
        if (!document.getElementById('mode-tabs-container')) {
            console.log('Initializing Mode Tabs'); // DEBUG
            initModeTabs();
        }

        console.log('Loading Song List...'); // DEBUG
        loadSongList();
    }

    // Wrap openSongSelect to handle transition if called elsewhere
    function openSongSelect() {
        performImageShutterTransition(() => {
            openSongSelectForReal();
        }).then(() => {
            playBGM('bgm_select');
        });
    }

    async function performImageShutterTransition(midAction: () => void | Promise<void>) {
        if (!shutterOverlay) {
            await midAction();
            return;
        }

        // 1. Play Shutter SE
        playSE('se_start');

        // 2. Slide In (Left to Center)
        shutterOverlay.style.transition = 'transform 0.6s cubic-bezier(0.4, 0, 0.2, 1)';
        shutterOverlay.classList.remove('opened-right');
        shutterOverlay.classList.add('closed');

        // Wait for slide-in
        await new Promise(r => setTimeout(r, 600));

        // 3. Middle Action
        await midAction();

        // Buffer
        await new Promise(r => setTimeout(r, 200));

        // 4. Slide Out (Center to Right)
        shutterOverlay.classList.remove('closed');
        shutterOverlay.classList.add('opened-right');

        // Wait for slide-out
        await new Promise(r => setTimeout(r, 600));

        // 5. Reset for next time (teleport to left)
        shutterOverlay.style.transition = 'none';
        shutterOverlay.classList.remove('opened-right');
        void shutterOverlay.offsetWidth; // Force reflow
        shutterOverlay.style.transition = '';
    }

    // Factored out mode tabs init
    function initModeTabs() {
        const container = document.createElement('div');
        container.id = 'mode-tabs-container';
        container.style.display = 'flex';
        container.style.justifyContent = 'center';
        container.style.gap = '10px';
        container.style.marginBottom = '20px';
        container.style.padding = '10px';
        container.style.background = '#222';
        container.style.borderRadius = '8px';

        ['6key'].forEach(mode => {
            const btn = document.createElement('button');
            btn.textContent = mode.toUpperCase();
            btn.className = 'mode-tab-btn';
            btn.style.padding = '10px 20px';
            btn.style.cursor = 'pointer';
            btn.style.border = '2px solid #555';
            btn.style.background = mode === selectedModeFilter ? '#00bcd4' : '#333';
            btn.style.color = 'white';
            btn.style.fontWeight = 'bold';

            btn.onclick = () => {
                selectedModeFilter = mode as any;
                loadSongList();
                updateModeTabsUI();
            };
            container.appendChild(btn);
        });
        songSelectOverlay.insertBefore(container, songListDiv);
    }



    // Records Overlay Logic
    const recordsBody = document.getElementById('records-body') as HTMLTableSectionElement;
    const btnCloseRecords = document.getElementById('btn-close-records');
    // (recordsOverlay and btnViewRecords handled at top)

    async function openRecords() {
        showStartScreen(false);
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


    // --- Gauge Roll Setup ---
    const GAUGE_ROLL_ORDER: GaugeType[] = ['norma_easy', 'norma', 'life', 'life_hard', 'life_ex', 'sudden_death'];
    const GAUGE_ROLL_INFO: Record<GaugeType, { name: string; desc: string }> = {
        norma_easy: { name: 'NORMA-EASY', desc: '65%スタート。perfect +1%、great/good +0.5%、BAD -1%、MISS -3%。65%以上でクリア。' },
        norma: { name: 'NORMA', desc: '80%スタート。perfect +0.5%、great/good +0.2%、BAD -2%、MISS -6%。80%以上でクリア。' },
        life: { name: 'LIFE', desc: '100%スタート。perfect +0.5%、great/good +0.2%、BAD -6%、MISS -8%。0%で終了、完走でクリア。' },
        life_hard: { name: 'LIFE HARD', desc: '100%スタート。perfect +0.5%、great/good +0.2%、BAD -10%、MISS -15%。0%で終了、完走でクリア。' },
        life_ex: { name: 'LIFE EX', desc: '100%スタート。perfect +0.5%、great/good +0.2%、BAD -25%、MISS -50%。0%で終了、完走でクリア。' },
        sudden_death: { name: '即死 (SUDDEN DEATH)', desc: '100%スタート。BADまたはMISSを1回でも出すと即死終了、完走でクリア。' }
    };

    function updateGaugeDisplay() {
        if (gaugeRollName && gaugeRollDesc) {
            const info = GAUGE_ROLL_INFO[gaugeType];
            if (info) {
                gaugeRollName.textContent = info.name;
                gaugeRollDesc.textContent = info.desc;
            }
        }
    }


    // --- Play Mode & Dani Redesign Setup ---
    interface PlayModeInfo {
        id: string;
        title: string;
        desc: string;
        disabled: boolean;
    }

    const PLAY_MODES_INFO: PlayModeInfo[] = [
        { id: 'single', title: 'SINGLE', desc: '今までの普通のプレイをおこないます。', disabled: false },
        { id: 'battle', title: 'バトル', desc: 'オンラインで人とマッチし戦います。（マッチ準備室デモ）', disabled: false },
        { id: 'express', title: 'EXPRESS', desc: '決められたルールやお題の曲のミッションを達成していき、クリアを目指すアドベンチャーモード。（近々実装予定）', disabled: true },
        { id: 'dani', title: '段位認定', desc: '実力測定用コースを連続プレイします。（形だけ実装済み）', disabled: false },
        { id: 'training', title: 'トレーニング', desc: 'しばらくは実装しません。', disabled: true }
    ];

    interface DaniCourseDummy {
        title: string;
        level: string;
        songs: string[];
        color: string;
    }

    const DANI_COURSES_DUMMY: DaniCourseDummy[] = [
        { title: '海伝', level: '★10+', songs: ['Sinking Feeling', 'Forbidden Ritual', 'Antigravity', '漁火'], color: '#ff3d00' },
        { title: '河伝', level: '★10', songs: ['Magusic Flow', 'Cyber Stream', 'Undercurrent', 'Ceviche'], color: '#ff9100' },
        { title: '水伝', level: '★9+', songs: ['Hydro Rhythm', 'Splash Wave', 'Raindrop Drop', 'Ocean Breeze'], color: '#2979ff' },
        { title: 'Ⅶ', level: '★9', songs: ['Seven Seals', 'Lucky Strike', 'Rainbow Road', 'Seventh Heaven'], color: '#e040fb' },
        { title: 'Ⅵ', level: '★8+', songs: ['Hexa Force', 'Six Degrees', 'Prism Dance', 'Hexagon'], color: '#00e5ff' },
        { title: 'Ⅴ', level: '★8', songs: ['Pentagram', 'High Five', 'Vivid Lights', 'Starry Sky'], color: '#00e676' },
        { title: 'Ⅳ', level: '★7', songs: ['Square One', 'Crossroad', 'Windmill', 'Gravity Fall'], color: '#ffea00' },
        { title: 'Ⅲ', level: '★6', songs: ['Triangle', 'Triple Play', 'Three Wishes', 'Trio'], color: '#ff9100' },
        { title: 'Ⅱ', level: '★5', songs: ['Dual Core', 'Double Time', 'Echoes', 'Binary Star'], color: '#ff5722' },
        { title: 'Ⅰ', level: '★4', songs: ['First Step', 'Beginning', 'Tutorial', 'Introduction'], color: '#9e9e9e' }
    ];

    // Helper functions for Dani clear / lock states
    function isDaniCleared(courseTitle: string): boolean {
        const key = `magsic_dani_cleared_${currentPlayer}`;
        try {
            const saved = localStorage.getItem(key);
            if (saved) {
                const clearedList = JSON.parse(saved);
                return Array.isArray(clearedList) && clearedList.includes(courseTitle);
            }
        } catch (e) { console.error(e); }
        return false;
    }

    function isDaniLocked(courseTitle: string): boolean {
        if (courseTitle === '海伝') return !isDaniCleared('河伝');
        if (courseTitle === '河伝') return !isDaniCleared('水伝');
        if (courseTitle === '水伝') return !isDaniCleared('Ⅶ');
        return false; // Ⅶ以下はロックされない
    }

    function setDaniCleared(courseTitle: string) {
        const key = `magsic_dani_cleared_${currentPlayer}`;
        try {
            const saved = localStorage.getItem(key);
            let clearedList = saved ? JSON.parse(saved) : [];
            if (!Array.isArray(clearedList)) clearedList = [];
            if (!clearedList.includes(courseTitle)) {
                clearedList.push(courseTitle);
                localStorage.setItem(key, JSON.stringify(clearedList));
            }
        } catch (e) { console.error(e); }
    }

    const modeCardsWrapper = document.getElementById('mode-cards-wrapper');
    const modeDescTitle = document.getElementById('mode-desc-title');
    const modeDescText = document.getElementById('mode-desc-text');

    function renderModeCarousel() {
        if (!modeCardsWrapper) return;
        modeCardsWrapper.innerHTML = '';
        
        PLAY_MODES_INFO.forEach((mode, idx) => {
            const card = document.createElement('div');
            card.className = 'mode-card';
            if (idx === currentModeIndex) card.classList.add('active');
            if (mode.disabled) card.classList.add('disabled');
            
            card.innerHTML = `<div>${mode.title}</div>`;
            
            card.addEventListener('click', () => {
                currentModeIndex = idx;
                renderModeCarousel();
                playSE('se_select');
            });
            
            modeCardsWrapper.appendChild(card);
        });

        const activeMode = PLAY_MODES_INFO[currentModeIndex];
        if (modeDescTitle) modeDescTitle.textContent = activeMode.title;
        if (modeDescText) modeDescText.textContent = activeMode.desc;
    }

    const daniScrollList = document.getElementById('dani-scroll-list');
    const daniInfoTitle = document.getElementById('dani-info-title');
    const daniInfoLevel = document.getElementById('dani-info-level');
    const daniInfoSongs = document.getElementById('dani-info-songs');

    function renderDaniScrollList() {
        if (!daniScrollList) return;
        daniScrollList.innerHTML = '';
        
        DANI_COURSES_DUMMY.forEach((course, idx) => {
            const card = document.createElement('div');
            card.className = 'dani-card';
            if (idx === currentDaniIndex) card.classList.add('active');
            
            const locked = isDaniLocked(course.title);
            const cleared = isDaniCleared(course.title);
            
            let titleText = course.title;
            let levelText = course.level;
            
            if (locked) {
                titleText += ' 🔒';
                card.style.opacity = '0.4';
            } else if (cleared) {
                card.classList.add('cleared'); // Apply Gold style
            }
            
            card.innerHTML = `
                <span style="font-weight: bold; border-left: 4px solid ${course.color}; padding-left: 10px;">${titleText}</span>
                <span style="font-size: 0.85em; color: ${course.color}; font-family: monospace; font-weight: bold;">${levelText}</span>
            `;

            card.addEventListener('click', () => {
                currentDaniIndex = idx;
                renderDaniScrollList();
                playSE('se_select');
            });

            daniScrollList.appendChild(card);
        });

        const activeEl = daniScrollList.children[currentDaniIndex] as HTMLElement;
        if (activeEl) {
            activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }

        const activeCourse = DANI_COURSES_DUMMY[currentDaniIndex];
        const isLocked = isDaniLocked(activeCourse.title);
        const isCleared = isDaniCleared(activeCourse.title);
        
        if (daniInfoTitle) {
            // Remove text suffixes like (LOCKED) or (CLEARED)
            daniInfoTitle.textContent = activeCourse.title;
            daniInfoTitle.style.color = activeCourse.color;
        }
        if (daniInfoLevel) {
            daniInfoLevel.textContent = activeCourse.level;
            daniInfoLevel.style.color = activeCourse.color;
        }
        
        if (daniInfoSongs) {
            daniInfoSongs.innerHTML = '';
            
            if (isLocked) {
                const lockDiv = document.createElement('div');
                lockDiv.style.cssText = 'flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; color: rgba(255,255,255,0.4); text-align: center; gap: 15px; border: 2px dashed rgba(255,61,0,0.2); border-radius: 12px; padding: 30px; box-sizing: border-box; height: 100%;';
                lockDiv.innerHTML = `
                    <span style="font-size: 3em; filter: drop-shadow(0 0 10px rgba(255,61,0,0.3));">🔒</span>
                    <span style="font-weight: bold; font-size: 1.2em; color: #ff3d00; letter-spacing: 1px;">ロックされています</span>
                    <span style="font-size: 0.85em; line-height: 1.6; color: rgba(255,255,255,0.5);">このコースに挑戦するには、<br>1つ前の段位をクリアする必要があります。</span>
                `;
                daniInfoSongs.appendChild(lockDiv);
            } else {
                activeCourse.songs.forEach((song, sIdx) => {
                    const songDiv = document.createElement('div');
                    songDiv.style.cssText = 'background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); padding: 12px 20px; border-radius: 8px; font-family: sans-serif; display: flex; align-items: center; justify-content: space-between;';
                    
                    const displaySongName = isCleared ? song : '？？？';
                    
                    songDiv.innerHTML = `
                        <span style="color: rgba(255,255,255,0.5); font-family: monospace; font-size: 0.9em; margin-right: 15px;">STAGE ${sIdx + 1}</span>
                        <span style="color: #fff; font-weight: bold; flex: 1;">${displaySongName}</span>
                        <span style="color: ${activeCourse.color}; font-size: 0.8em; font-family: monospace;">★ DUMMY</span>
                    `;
                    daniInfoSongs.appendChild(songDiv);
                });
            }
        }
    }

    // --- Online Battle Lobby Setup ---
    const battleLobbyOverlay = document.getElementById('battle-lobby-overlay') as HTMLDivElement;
    const opponentIcon = document.getElementById('opponent-icon') as HTMLDivElement;
    const opponentName = document.getElementById('opponent-name') as HTMLDivElement;
    const opponentStatus = document.getElementById('opponent-status') as HTMLDivElement;
    const matchingStatusText = document.getElementById('matching-status-text') as HTMLDivElement;
    const btnLobbyBypass = document.getElementById('btn-lobby-bypass') as HTMLButtonElement;
    const btnCloseLobby = document.getElementById('btn-close-lobby') as HTMLButtonElement;
    
    let isMatched = false;
    let isBattleSelectMode = false;
    let wsBattle: WebSocket | null = null;
    let myBattleRole: 'p1' | 'p2' | null = null;
    let hasOpponentFinished = false;
    let opponentResultData: any = null;

    function connectBattleSocket() {
        if (wsBattle) {
            wsBattle.close();
            wsBattle = null;
        }

        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${wsProtocol}//${window.location.host}`;
        
        wsBattle = new WebSocket(wsUrl);
        myBattleRole = null;
        hasOpponentFinished = false;
        opponentResultData = null;

        wsBattle.onopen = () => {
            console.log('[WS] Connected to battle transit');
            wsBattle?.send(JSON.stringify({
                type: 'join',
                nickname: playerNickname || 'Guest',
                icon: playerIconBase64 || ''
            }));
        };

        wsBattle.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                handleBattleSocketMessage(data);
            } catch(e) { console.error('[WS] Message parse error:', e); }
        };

        wsBattle.onerror = (e) => {
            console.error('[WS] Socket error:', e);
        };

        wsBattle.onclose = () => {
            console.log('[WS] Socket closed');
        };
    }

    function handleBattleSocketMessage(data: any) {
        switch(data.type) {
            case 'waiting':
                isMatched = false;
                if (opponentIcon) { opponentIcon.textContent = '❓'; opponentIcon.style.opacity = '0.3'; }
                if (opponentName) { opponentName.textContent = 'SEARCHING...'; opponentName.style.color = '#666'; }
                if (opponentStatus) { opponentStatus.textContent = 'WAITING'; opponentStatus.style.color = '#555'; opponentStatus.style.background = 'rgba(255,255,255,0.05)'; }
                if (matchingStatusText) { matchingStatusText.textContent = 'WAITING FOR OPPONENT...'; matchingStatusText.style.color = '#ff007f'; }
                break;

            case 'matched':
                isMatched = true;
                myBattleRole = data.role;
                playSE('se_decide');

                if (opponentIcon) {
                    if (data.opponent.icon) {
                        opponentIcon.innerHTML = `<img src="${data.opponent.icon}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
                    } else {
                        opponentIcon.textContent = '👽';
                    }
                    opponentIcon.style.opacity = '1.0';
                }
                if (opponentName) {
                    opponentName.textContent = data.opponent.nickname;
                    opponentName.style.color = '#ff007f';
                }
                if (opponentStatus) {
                    opponentStatus.textContent = 'READY';
                    opponentStatus.style.color = '#fff';
                    opponentStatus.style.background = 'rgba(255,0,127,0.3)';
                }
                if (matchingStatusText) {
                    if (myBattleRole === 'p1') {
                        matchingStatusText.textContent = 'MATCH FOUND! PRESS ENTER TO CHOOSE SONG';
                    } else {
                        matchingStatusText.textContent = 'MATCH FOUND! WAITING FOR HOST TO CHOOSE SONG';
                    }
                    matchingStatusText.style.color = '#00ffff';
                }
                break;

            case 'opponent_left':
                alert('対戦相手が退出しました。');
                isMatched = false;
                if (isPlaying) {
                    isPlaying = false;
                    if (wsBattle) wsBattle.close();
                    wsBattle = null;
                    if (canvas) canvas.style.display = 'block';
                    if (songSelectOverlay) {
                        songSelectOverlay.style.display = 'none';
                        songSelectOverlay.classList.remove('battle-mode');
                    }
                    if (menuOverlay) {
                        menuOverlay.style.display = 'flex';
                        renderModeCarousel();
                    }
                } else {
                    exitBattleSelectAndReturnToLobby();
                }
                break;

            case 'cursor_move':
                if (myBattleRole === 'p2' && songSelectOverlay && songSelectOverlay.style.display !== 'none') {
                    selectedSongIndex = data.index;
                    renderSongSelectInternal();
                }
                break;

            case 'diff_change':
                if (myBattleRole === 'p2' && songSelectOverlay && songSelectOverlay.style.display !== 'none') {
                    selectedDiffIndex = data.index;
                    renderRightColumn();
                }
                break;

            case 'song_decide':
                if (myBattleRole === 'p2') {
                    playSE('se_decide');
                    isBattleSelectMode = true;
                    if (songSelectOverlay) {
                        songSelectOverlay.style.display = 'none';
                    }
                    loadSong(data.songFolder, data.chartName, data.audioName);
                }
                break;

            case 'play_state':
                if (isPlaying) {
                    rivalPassedMaxScore = data.score;
                }
                break;

            case 'results':
                hasOpponentFinished = true;
                opponentResultData = data;
                if (!isPlaying && customResultScreen && customResultScreen.style.display === 'flex') {
                    refreshBattleWinnerDisplay();
                }
                break;
        }
    }

    function exitBattleSelectAndReturnToLobby() {
        isBattleSelectMode = false;
        if (songSelectOverlay) {
            songSelectOverlay.style.display = 'none';
            songSelectOverlay.classList.remove('battle-mode');
        }
        openBattleLobby();
    }

    function openBattleLobby() {
        isMatched = false;
        if (battleLobbyOverlay) battleLobbyOverlay.style.display = 'flex';
        
        // Sync custom icon
        updateIconElements();
        
        // Connect to WS Matching
        connectBattleSocket();
    }

    function triggerMatchFound() {
        if (isMatched) return;
        isMatched = true;
        myBattleRole = 'p1'; // Assume P1 role for test bypass
        playSE('se_decide');
        
        if (opponentIcon) { opponentIcon.textContent = '😈'; opponentIcon.style.opacity = '1.0'; }
        if (opponentName) { opponentName.textContent = 'CPU_Rival_99'; opponentName.style.color = '#ff007f'; }
        if (opponentStatus) { opponentStatus.textContent = 'READY'; opponentStatus.style.color = '#fff'; opponentStatus.style.background = 'rgba(255,0,127,0.3)'; }
        if (matchingStatusText) { matchingStatusText.textContent = 'MATCH FOUND (TEST)! PRESS ENTER TO START'; matchingStatusText.style.color = '#00ffff'; }
    }

    function enterBattleSelectScreen() {
        if (matchingTimer) clearTimeout(matchingTimer);
        if (battleLobbyOverlay) battleLobbyOverlay.style.display = 'none';
        
        isBattleSelectMode = true;
        performImageShutterTransition(() => {
            showStartScreen(false);
            if (songSelectOverlay) {
                songSelectOverlay.style.display = 'flex';
                songSelectOverlay.classList.add('battle-mode');
            }
            loadSongList();
        }).then(() => {
            playBGM('bgm_select');
        });
    }

    function broadcastPlayState() {
        if (isBattleSelectMode && wsBattle && wsBattle.readyState === WebSocket.OPEN) {
            const currentRatio = totalMaxScore > 0 ? (totalMaxScore - lostScore) / totalMaxScore : 0;
            const clearRate = currentRatio * 100;
            const currentScore = Math.floor(currentRatio * 1000000);
            
            wsBattle.send(JSON.stringify({
                type: 'play_state',
                score: currentScore,
                health: currentHealth,
                combo: combo,
                clearRate: clearRate
            }));
        }
    }

    function refreshBattleWinnerDisplay() {
        if (!resultStatusTitle) return;
        if (hasOpponentFinished && opponentResultData) {
            const userRatio = totalMaxScore > 0 ? (totalMaxScore - lostScore) / totalMaxScore : 0;
            const cpuRatio = opponentResultData.clearRate / 100;

            if (userRatio >= cpuRatio) {
                resultStatusTitle.textContent = "YOU WIN! 🏆";
                resultStatusTitle.style.color = "#ffd700"; // Gold
            } else {
                resultStatusTitle.textContent = "YOU LOSE... 😢";
                resultStatusTitle.style.color = "#ff3d00"; // Red
            }
        }
    }

    function executePlayModeAction() {
        const activeMode = PLAY_MODES_INFO[currentModeIndex];
        playSE('se_decide');
        
        if (activeMode.id === 'single') {
            if (menuOverlay) menuOverlay.style.display = 'none';
            performImageShutterTransition(() => {
                openSongSelectForReal();
            }).then(() => {
                playBGM('bgm_select');
            });
        } else if (activeMode.id === 'battle') {
            if (menuOverlay) menuOverlay.style.display = 'none';
            performImageShutterTransition(() => {
                showStartScreen(false);
                openBattleLobby();
            });
        } else if (activeMode.id === 'dani') {
            if (menuOverlay) menuOverlay.style.display = 'none';
            performImageShutterTransition(() => {
                showStartScreen(false);
                if (daniSelectOverlay) daniSelectOverlay.style.display = 'flex';
                renderDaniScrollList();
            }).then(() => {
                playBGM('bgm_select');
            });
        } else {
            alert(`「${activeMode.title}」モードは現在開発中（もしくは実装予定なし）です。`);
        }
    }

    function updateIconElements() {
        if (playerIconBase64) {
            if (optIconPreview) { optIconPreview.src = playerIconBase64; optIconPreview.style.display = 'block'; }
            if (optIconPlaceholder) { optIconPlaceholder.style.display = 'none'; }
            if (lobbyPlayerYouIcon) { lobbyPlayerYouIcon.src = playerIconBase64; lobbyPlayerYouIcon.style.display = 'block'; }
            if (lobbyPlayerYouPlaceholder) { lobbyPlayerYouPlaceholder.style.display = 'none'; }
        } else {
            if (optIconPreview) { optIconPreview.style.display = 'none'; }
            if (optIconPlaceholder) { optIconPlaceholder.style.display = 'block'; }
            if (lobbyPlayerYouIcon) { lobbyPlayerYouIcon.style.display = 'none'; }
            if (lobbyPlayerYouPlaceholder) { lobbyPlayerYouPlaceholder.style.display = 'block'; }
        }
    }

    function cropAndSaveIcon(file: File) {
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = 128;
                canvas.height = 128;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    const size = Math.min(img.width, img.height);
                    const sourceX = (img.width - size) / 2;
                    const sourceY = (img.height - size) / 2;
                    ctx.drawImage(img, sourceX, sourceY, size, size, 0, 0, 128, 128);
                    
                    playerIconBase64 = canvas.toDataURL('image/png');
                    updateIconElements();
                    savePlayerSettings();
                }
            };
            img.src = event.target?.result as string;
        };
        reader.readAsDataURL(file);
    }

    if (optIconInput) {
        optIconInput.addEventListener('change', (e: any) => {
            const file = e.target.files?.[0];
            if (file) {
                cropAndSaveIcon(file);
            }
        });
    }

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

                if (settings.visualOffset !== undefined) {
                    visualOffset = parseInt(settings.visualOffset);
                    if (visualOffsetInput) visualOffsetInput.value = visualOffset.toString();
                    if (visualOffsetDisplay) visualOffsetDisplay.textContent = visualOffset.toString();
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


                if (settings.laneOpacity !== undefined) {
                    laneOpacity = parseFloat(settings.laneOpacity);
                    if (laneOpacityInput) laneOpacityInput.value = (laneOpacity * 100).toString();
                    if (laneOpacityDisplay) laneOpacityDisplay.textContent = (laneOpacity * 100).toString();
                }

                // Judgement Height
                if (settings.judgementHeight !== undefined) {
                    judgementHeightOffset = parseInt(settings.judgementHeight);
                    if (judgementHeightInput) judgementHeightInput.value = judgementHeightOffset.toString();
                    if (judgementHeightDisplay) judgementHeightDisplay.textContent = judgementHeightOffset.toString();
                }

                if (settings.currentSkin !== undefined) {
                    currentSkin = settings.currentSkin;
                    if (skinSelect) skinSelect.value = currentSkin;
                }

                // Rival settings
                if (settings.rivalPercent !== undefined) {
                    rivalPercent = parseInt(settings.rivalPercent);
                    if (rivalScoreInput) rivalScoreInput.value = rivalPercent.toString();
                    if (rivalScoreDisplay) rivalScoreDisplay.textContent = rivalPercent.toString();
                }
                if (settings.isRivalShowEnabled !== undefined) {
                    isRivalShowEnabled = !!settings.isRivalShowEnabled;
                    if (rivalShowCheckbox) rivalShowCheckbox.checked = isRivalShowEnabled;
                }
                if (settings.scoreDisplayType !== undefined) {
                    scoreDisplayType = settings.scoreDisplayType as 'percent' | 'value';
                    if (scoreDisplayTypeSelect) scoreDisplayTypeSelect.value = scoreDisplayType;
                }
                if (settings.isRivalBarEnabled !== undefined) {
                    isRivalBarEnabled = !!settings.isRivalBarEnabled;
                    if (rivalBarCheckbox) rivalBarCheckbox.checked = isRivalBarEnabled;
                }

                // Nickname & Bio
                if (settings.playerNickname !== undefined) {
                    playerNickname = settings.playerNickname;
                    if (nicknameInput) nicknameInput.value = playerNickname;
                } else {
                    playerNickname = '';
                    if (nicknameInput) nicknameInput.value = '';
                }
                if (settings.playerBio !== undefined) {
                    playerBio = settings.playerBio;
                    if (bioInput) bioInput.value = playerBio;
                } else {
                    playerBio = '';
                    if (bioInput) bioInput.value = '';
                }

                if (settings.icon !== undefined) {
                    playerIconBase64 = settings.icon;
                } else {
                    playerIconBase64 = '';
                }
                updateIconElements();

                // Gauge Type
                if (settings.gaugeType !== undefined) {
                    gaugeType = settings.gaugeType as GaugeType;
                } else {
                    gaugeType = 'norma';
                }
                updateGaugeDisplay();

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

                visualOffset = 0;
                if (visualOffsetInput) visualOffsetInput.value = '0';
                if (visualOffsetDisplay) visualOffsetDisplay.textContent = '0';

                rivalPercent = 90;
                if (rivalScoreInput) rivalScoreInput.value = '90';
                if (rivalScoreDisplay) rivalScoreDisplay.textContent = '90';
                isRivalShowEnabled = true;
                if (rivalShowCheckbox) rivalShowCheckbox.checked = true;
                scoreDisplayType = 'percent';
                if (scoreDisplayTypeSelect) scoreDisplayTypeSelect.value = 'percent';
                isRivalBarEnabled = true;
                if (rivalBarCheckbox) rivalBarCheckbox.checked = true;
                playerNickname = '';
                if (nicknameInput) nicknameInput.value = '';
                playerBio = '';
                if (bioInput) bioInput.value = '';
                playerIconBase64 = '';
                updateIconElements();
                gaugeType = 'norma';
                updateGaugeDisplay();
            }
        } catch (e) {
            console.error('Failed to load settings', e);
        }
    }

    function savePlayerSettings() {
        const key = `magsic_settings_${currentPlayer}`;
        const multiplier = speedInput ? parseFloat(speedInput.value) : 2.5;
        const off = offsetInput ? parseInt(offsetInput.value) : 0;
        const vOff = visualOffsetInput ? parseInt(visualOffsetInput.value) : 0;

        const settings = {
            speed: multiplier,
            offset: off,
            visualOffset: vOff,
            laneWidth: currentLaneWidth,
            laneCover: {
                enabled: isLaneCoverEnabled,
                height: laneCoverHeight,
                speed: laneCoverSpeedMult
            },
            laneOpacity: laneOpacity,
            judgementHeight: judgementHeightOffset,
            currentSkin: currentSkin,
            rivalPercent: rivalPercent,
            isRivalShowEnabled: isRivalShowEnabled,
            scoreDisplayType: scoreDisplayType,
            isRivalBarEnabled: isRivalBarEnabled,
            playerNickname: playerNickname,
            playerBio: playerBio,
            gaugeType: gaugeType,
            icon: playerIconBase64
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
            if (isBattleSelectMode) {
                songSelectOverlay.classList.remove('battle-mode');
                openBattleLobby();
            } else {
                showStartScreen(true);
                playBGM('bgm_title');
            }
        });
    }

    if (btnCloseDani) {
        btnCloseDani.addEventListener('click', () => {
            playSE('se_cancel');
            if (daniSelectOverlay) daniSelectOverlay.style.display = 'none';
            if (menuOverlay) {
                menuOverlay.style.display = 'flex';
                renderModeCarousel();
            }
        });
    }

    if (laneCoverCheckbox) {
        laneCoverCheckbox.addEventListener('change', () => {
            isLaneCoverEnabled = laneCoverCheckbox.checked;
            savePlayerSettings();
        });
    }

    if (skinSelect) {
        skinSelect.addEventListener('change', () => {
            currentSkin = skinSelect.value;
            console.log('Skin changed to:', currentSkin);
            loadSkin(); // Reload assets
            savePlayerSettings();
        });
    }

    if (rivalScoreInput && rivalScoreDisplay) {
        rivalScoreInput.addEventListener('input', () => {
            rivalPercent = parseInt(rivalScoreInput.value);
            rivalScoreDisplay.textContent = rivalPercent.toString();
            savePlayerSettings();
        });
    }

    if (rivalShowCheckbox) {
        rivalShowCheckbox.addEventListener('change', () => {
            isRivalShowEnabled = rivalShowCheckbox.checked;
            savePlayerSettings();
        });
    }

    if (scoreDisplayTypeSelect) {
        scoreDisplayTypeSelect.addEventListener('change', () => {
            scoreDisplayType = scoreDisplayTypeSelect.value as 'percent' | 'value';
            savePlayerSettings();
        });
    }

    if (nicknameInput) {
        nicknameInput.addEventListener('input', () => {
            playerNickname = nicknameInput.value;
            savePlayerSettings();
        });
    }

    if (bioInput) {
        bioInput.addEventListener('input', () => {
            playerBio = bioInput.value;
            savePlayerSettings();
        });
    }

    if (rivalBarCheckbox) {
        rivalBarCheckbox.addEventListener('change', () => {
            isRivalBarEnabled = rivalBarCheckbox.checked;
            savePlayerSettings();
        });
    }

    if (btnGaugeRoll) {
        btnGaugeRoll.addEventListener('click', () => {
            let idx = GAUGE_ROLL_ORDER.indexOf(gaugeType);
            idx = (idx + 1) % GAUGE_ROLL_ORDER.length;
            gaugeType = GAUGE_ROLL_ORDER[idx];
            updateGaugeDisplay();
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
            savePlayerSettings();
        });
    }

    if (visualOffsetInput && visualOffsetDisplay) {
        visualOffsetInput.addEventListener('input', () => {
            const val = parseInt(visualOffsetInput.value);
            visualOffset = val;
            visualOffsetDisplay.textContent = val.toString();
            savePlayerSettings();
        });
    }

    if (judgementHeightInput && judgementHeightDisplay) {
        judgementHeightInput.addEventListener('input', () => {
            judgementHeightOffset = parseInt(judgementHeightInput.value);
            judgementHeightDisplay.textContent = judgementHeightOffset.toString();
            savePlayerSettings();
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
            controlsDiv.classList.toggle('show-options');
            playSE('se_option');
        });

        if (btnCloseOptions) {
            btnCloseOptions.addEventListener('click', () => {
                controlsDiv.classList.remove('show-options');
            });
        }

        // Touch swipe-to-close logic (can keep it or remove it, but renaming class is safe)
        let touchStartX = 0;
        controlsDiv.addEventListener('touchstart', (e) => {
            touchStartX = e.touches[0].clientX;
        }, { passive: true });

        controlsDiv.addEventListener('touchend', (e) => {
            const touchEndX = e.changedTouches[0].clientX;
            const diffX = touchEndX - touchStartX;
            // If swiped significantly to the right (e.g. > 50px), close drawer
            if (diffX > 50) {
                controlsDiv.classList.remove('show-options');
            }
        }, { passive: true });

        document.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            if (controlsDiv.classList.contains('show-options')) {
                // If click is NOT inside drawer AND NOT the toggle button
                if (!controlsDiv.contains(target) && target !== btnOptionsToggle) {
                    controlsDiv.classList.remove('show-options');
                }
            }
        });
    }

    // Game Config (Values assigned at top)
    // NOTE_HEIGHT, currentKeyMode, HIT_Y handled at top

    async function loadSkin() {
        const tryPaths = async (key: string, candidates: string[]) => {
            for (const path of candidates) {
                try {
                    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
                        const i = new Image();
                        i.onload = () => resolve(i);
                        i.onerror = () => reject();
                        i.src = encodeURI(path);
                    });
                    SKIN[key] = img;
                    console.log(`Loaded ${key}: ${path}`);
                    return true;
                } catch (e) {
                    continue;
                }
            }
            return false;
        };

        // Define candidates for each part
        const skinBase = `assets/スキン/${currentSkin}`;
        const defBase = `assets/スキン/default`;

        // Lane
        await tryPaths('lane', [
            `${skinBase}/${currentSkin}_レーン/レーン_${currentSkin}.png`,
            `${skinBase}/${currentSkin}_レーン/lane.png`,
            `${skinBase}/レーン_${currentSkin}.png`,
            `${skinBase}/lane.png`,
            `${defBase}/レーン_default.png`,
            `${defBase}/lane.png`
        ]);

        // White Note
        await tryPaths('white', [
            `${skinBase}/${currentSkin}_白ノーツ/note_white.png`,
            `${skinBase}/note_white_${currentSkin}.png`,
            `${skinBase}/note_white.png`,
            `${defBase}/note_white.png`
        ]);

        // Blue Note
        await tryPaths('blue', [
            `${skinBase}/${currentSkin}_青ノーツ/note_blue.png`,
            `${skinBase}/note_blue_${currentSkin}.png`,
            `${skinBase}/note_blue.png`,
            `${defBase}/note_blue.png`
        ]);

        // Space Note
        await tryPaths('space', [
            `${skinBase}/${currentSkin}_スペースノーツ/note_space.png`,
            `${skinBase}/note_space_${currentSkin}.png`,
            `${skinBase}/note_space.png`,
            `${skinBase}/note_space_Tunared.png`,
            `${defBase}/note_space.png`
        ]);

        // UI Backgrounds & Other static assets
        const staticAssets = [
            { key: 'titleBg', src: 'assets/initial2.png' },
            { key: 'gameBg', src: 'assets/initial2.png' },
            { key: 'resBg', src: 'assets/リザルト背景.png' },
            { key: 'judgeCritical1', src: 'assets/プレイ中判定文字/CRITICAL判定1.png' },
            { key: 'judgeCritical2', src: 'assets/プレイ中判定文字/CRITICAL判定2.png' },
            { key: 'judgeGreat1', src: 'assets/プレイ中判定文字/GREAT判定1.png' },
            { key: 'judgeGood1', src: 'assets/プレイ中判定文字/GOOD判定1.png' },
            { key: 'judgeFail1', src: 'assets/プレイ中判定文字/FAIL判定1.png' },
            { key: 'judgeMiss1', src: 'assets/プレイ中判定文字/MISS判定1.png' },
            { key: 'judgeMiss2', src: 'assets/プレイ中判定文字/MISS判定2.png' },
            { key: 'resCritical1', src: 'assets/リザルト文字/CRITICAL1.png' },
            { key: 'resCritical2', src: 'assets/リザルト文字/CRITICAL2.png' },
            { key: 'resGreat1', src: 'assets/リザルト文字/GREAT1.png' },
            { key: 'resGood1', src: 'assets/リザルト文字/GOOD1.png' },
            { key: 'resFail1', src: 'assets/リザルト文字/FAIL1.png' },
            { key: 'resMiss1', src: 'assets/リザルト文字/MISS1.png' },
            { key: 'resMiss2', src: 'assets/リザルト文字/MISS2.png' }
        ];

        staticAssets.forEach(a => {
            const img = new Image();
            img.src = a.src;
            img.onload = () => { SKIN[a.key] = img; };
        });

        // songSelectOverlay background is managed in index.html for transparency
    }
    
    let songPreviewBGM: HTMLAudioElement | null = null;
    let interpolatedSongIndex = 0;
    let isSongSelectAnimating = false;

    function fadeVolume(audio: HTMLAudioElement, target: number, duration: number, callback?: () => void) {
        const start = audio.volume;
        const startTime = performance.now();
        const anim = (time: number) => {
            const elapsed = time - startTime;
            const p = Math.min(elapsed / duration, 1);
            audio.volume = start + (target - start) * p;
            if (p < 1) {
                requestAnimationFrame(anim);
            } else {
                audio.volume = target;
                if (callback) callback();
            }
        };
        requestAnimationFrame(anim);
    }
    // Audio Assets (BGM & SE)
    const AUDIO_ASSETS: { [key: string]: HTMLAudioElement | null } = {
        bgm_title: null,
        bgm_select: null,
        se_start: null,
        se_option: null,
        se_decide: null, // Normal
        se_decide_extra: null, // Extra/Hard
        se_cancel: null,
        se_clear: null,
        se_fail: null
    };

    let currentBGM: HTMLAudioElement | null = null;
    let currentSongBackground: HTMLImageElement | null = null;

    function loadAudioAssets() {
        const assets = [
            { key: 'bgm_title', src: 'assets/タイトル画面/タイトル画面でループして流れる曲.wav', loop: true, volume: 0.5 },
            { key: 'bgm_select', src: 'assets/選曲画面/選曲画面でループして流れる曲.wav', loop: true, volume: 0.5 },
            { key: 'se_start', src: 'assets/ゲームスタートボタンを押す.mp3', volume: 0.8 },
            { key: 'se_option', src: 'assets/設定画面を開く音.mp3', volume: 0.8 },
            { key: 'se_decide', src: 'assets/曲選択時効果音(通常).mp3', volume: 0.8 },
            { key: 'se_decide_extra', src: 'assets/曲選択時効果音(エキストラモード).mp3', volume: 0.8 },
            { key: 'se_cancel', src: 'assets/キャンセル音.mp3', volume: 0.8 },
            { key: 'se_clear', src: 'assets/クリアしたときに流れる効果音.mp3', volume: 0.8 },
            { key: 'se_fail', src: 'assets/クリア失敗したときに流れる効果音.mp3', volume: 0.8 }
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
    applyDeviceShutterTuning();

    function playBGM(key: string) {
        const nextBGM = AUDIO_ASSETS[key];
        if (!nextBGM) return;

        if (currentBGM === nextBGM) {
            if (currentBGM.paused) {
                currentBGM.volume = 0;
                currentBGM.play().catch(e => console.log('Autoplay blocked', e));
                fadeVolume(currentBGM, 0.5, 800);
            }
            return;
        }

        if (currentBGM) {
            const prevBGM = currentBGM;
            fadeVolume(prevBGM, 0, 800, () => {
                prevBGM.pause();
                prevBGM.currentTime = 0;
            });
        }

        currentBGM = nextBGM;
        currentBGM.currentTime = 0;
        currentBGM.volume = 0;
        currentBGM.play().catch(e => console.log('Autoplay blocked', e));
        fadeVolume(currentBGM, 0.5, 800);
    }

    function stopBGM() {
        if (currentBGM) {
            const prevBGM = currentBGM;
            fadeVolume(prevBGM, 0, 500, () => {
                prevBGM.pause();
                prevBGM.currentTime = 0;
            });
            currentBGM = null;
        }
        if (songPreviewBGM) {
            const prevPreview = songPreviewBGM;
            fadeVolume(prevPreview, 0, 500, () => {
                prevPreview.pause();
                prevPreview.currentTime = 0;
            });
            songPreviewBGM = null;
        }
        if (introBGM) {
            introBGM.pause();
            introBGM.src = '';
            introBGM = null;
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
    let laneEndX = 0;

    // Judgement Configuration (ms) — delegated to src/core/judgment
    const THRESHOLD_CRITICAL = (JUDGMENT_THRESHOLDS && JUDGMENT_THRESHOLDS.critical) || 40;
    const THRESHOLD_GREAT = (JUDGMENT_THRESHOLDS && JUDGMENT_THRESHOLDS.great) || 80;
    const THRESHOLD_GOOD = (JUDGMENT_THRESHOLDS && JUDGMENT_THRESHOLDS.good) || 133;
    const THRESHOLD_FAIL = (JUDGMENT_THRESHOLDS && JUDGMENT_THRESHOLDS.fail) || 150;
    const MISS_BOUNDARY = (JUDGMENT_THRESHOLDS && JUDGMENT_THRESHOLDS.miss) || 180;

    // Stats
    // ChartNote, LayoutChangeEvent → imported from src/core/types and src/core/chart

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
        icon?: string;
        enabled?: boolean;
        previewBgm?: string;
        introAudio?: string;
        introVideo?: string;
    }

    let audio: HTMLAudioElement = new Audio();
    let bgVideo: HTMLVideoElement | null = null;
    let isVideoReady = false;
    let chart: any = null;
    let bpmChanges: BPMChange[] = [];
    // BPMChange → imported from src/core/types

    // Helper: Beat <-> Time Conversions (delegated to src/core/bpm)
    function getTimeFromBeat(beat: number): number {
        return _getTimeFromBeat(beat, bpmChanges);
    }
    function getBeatFromTime(time: number): number {
        return _getBeatFromTime(time, bpmChanges);
    }


    interface GameStats {
        critical: number;
        great: number;
        good: number;
        fail: number;
        miss: number;
        combo: number;
        maxCombo: number;
        totalErrorMs: number;
        hitCount: number;
        score: number;
    }
    let stats: GameStats = {
        critical: 0, great: 0, good: 0, fail: 0, miss: 0, combo: 0, maxCombo: 0, totalErrorMs: 0, hitCount: 0, score: 0
    };




    // SCORE_WEIGHTS → imported from src/core/score

    function resetStats() {
        stats = {
            critical: 0,
            great: 0,
            good: 0,
            fail: 0,
            miss: 0,
            combo: 0,
            maxCombo: 0,
            score: 0,
            hitCount: 0,
            totalErrorMs: 0
        };
        rawScore = 0;
        lostScore = 0;
        if (isDaniMode) {
            // Keep health if it's not the first song? 
            // Actually resetStats is called at the start of EACH song.
            // But we want to preserve health.
            // So we only set to 100 if daniSongIndex is 0.
            if (daniSongIndex === 0) {
                daniHealth = 100;
            }
            currentHealth = daniHealth; // Sync if needed
        } else {
            currentHealth = getInitialHealth(gaugeType);
        }
        isTrackFailed = false;
        shutterHeight = 0;
        if (resultsOverlay) resultsOverlay.style.display = 'none';
        if (customResultScreen) customResultScreen.style.display = 'none';
        stopResultBlinking();

        // Calculate Max Score based on current chart
        totalMaxScore = calculateMaxScore(chartData || []);

        // Initialize rival events
        rivalScoreEvents = [];
        let rivalWeight = 9.0;
        if (isBattleSelectMode) {
            isRivalShowEnabled = true;
            isRivalBarEnabled = true;
            
            // Adjust Rival AI Strength based on difficulty
            const buttonOrder = ['no', 'st', 'ad', 'pr', 'et'];
            const diffKey = buttonOrder[selectedDiffIndex];
            if (diffKey === 'no') rivalWeight = 7.5; // ~75%
            else if (diffKey === 'st') rivalWeight = 8.2; // ~82%
            else if (diffKey === 'ad') rivalWeight = 8.8; // ~88%
            else if (diffKey === 'pr') rivalWeight = 9.3; // ~93%
            else if (diffKey === 'et') rivalWeight = 9.6; // ~96%
        }

        (chartData || []).forEach(note => {
            if (note.duration > 0) {
                rivalScoreEvents.push({ time: note.time, weight: rivalWeight });
                rivalScoreEvents.push({ time: note.time + note.duration, weight: rivalWeight });
            } else {
                rivalScoreEvents.push({ time: note.time, weight: rivalWeight });
            }
        });
        rivalScoreEvents.sort((a, b) => a.time - b.time);
        rivalEventIndex = 0;
        rivalPassedMaxScore = 0;

        if (debugLog) {
            debugLog.innerHTML = '<div>Debug Log Started</div>';
        }
    }

    function addHit(type: JudgmentType, errorMs: number = 0) {
        stats[type]++;
        if (type !== 'miss') {
            stats.totalErrorMs += errorMs;
            stats.hitCount++;
        }

        if (type === 'miss' || type === 'fail') {
            stats.combo = 0;
        } else {
            stats.combo++;
            if (stats.combo > stats.maxCombo) {
                stats.maxCombo = stats.combo;
            }
        }

        if (!isAutoPlay) {
            const loss = calculateLoss(type);
            lostScore += loss;
            rawScore += SCORE_WEIGHTS[type];

            // Health Logic
            if (isDaniMode) {
                applyDaniHit(type);
            } else {
                const gaugeResult = applyGaugeHit(currentHealth, type, gaugeType);
                currentHealth = gaugeResult.health;
                if (gaugeResult.isDead) {
                    console.log('LIFE DEPLETED - GAME OVER');
                    failGame();
                }
            }
        }
        broadcastPlayState();
    }

    function applyDaniHit(type: keyof typeof DANI_PENALTIES) {
        const penalty = DANI_PENALTIES[type];
        if (penalty !== 0) {
            daniHealth -= penalty;
            
            // Clamp health between 0 and 100
            if (daniHealth > 100) daniHealth = 100;
            if (daniHealth < 0) daniHealth = 0;
            
            currentHealth = daniHealth; // Sync for visual rendering
            
            if (daniHealth <= 0) {
                daniHealth = 0;
                currentHealth = 0;
                console.log('DANI LIFE DEPLETED - GAME OVER');
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

    const keysoundBank: Map<string, AudioBuffer> = new Map();

    function playKeysound(soundId: string | undefined) {
        if (!soundId || !audioContext) return;
        const buffer = keysoundBank.get(soundId);
        if (!buffer) return;

        const src = audioContext.createBufferSource();
        src.buffer = buffer;
        src.connect(audioContext.destination);
        src.start();
    }

    // Notes
    interface Note {
        laneIndex: number; // 0-8 for KEYS
        scheduledTime: number; // absolute time in song (ms)
        active: boolean;
        isLong: boolean;
        duration: number; // ms
        processed: boolean; // for long note head hit
        beingHeld: boolean;
        beat: number; // [NEW] For beat-based scrolling
        type?: 'normal' | 'sinking' | 'death';
        soundId?: string;
    }

    function logDebug(msg: string) {
        if (!debugLog) return;
        const div = document.createElement('div');
        div.textContent = `[${(getAudioTime()).toFixed(3)}s] ${msg}`;
        debugLog.appendChild(div);
        debugLog.scrollTop = debugLog.scrollHeight;
        if (debugLog.childNodes.length > 50) {
            debugLog.removeChild(debugLog.firstChild!);
        }
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
    let currentJudgementType: JudgmentType = 'miss';

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

        // Fix for negative offset (e.g. resuming during start sequence)
        if (offset < 0) {
            // Schedule start in the future
            const delay = -offset;
            audioSource.start(audioContext.currentTime + delay, 0);
        } else {
            // Start immediately from offset
            audioSource.start(0, offset);
        }

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

    function getNoteY(scheduledTime: number, beat: number = 0, currentTimeMs: number = -1): number {
        const trueTimeMs = currentTimeMs === -1 ? getAudioTime() * 1000 : currentTimeMs;
        const timeMs = trueTimeMs + visualOffset;
        const effectiveSpeed = currentNoteSpeed * (isLaneCoverEnabled ? laneCoverSpeedMult : 1.0);

        // Normalized Beat-based Scrolling (Always ON)
        const currentBeat = getBeatFromTime(timeMs);
        const distBeats = beat - currentBeat;

        // Use song's initial BPM as reference for normalization.
        // This ensures all songs scroll at the same speed at their base BPM,
        // while mid-song BPM changes are reflected as relative speed changes.
        const baseBpm = bpmChanges.length > 0 ? bpmChanges[0].bpm : 120;
        const msPerBeatBaseline = 60000 / baseBpm;

        return HIT_Y - distBeats * msPerBeatBaseline * effectiveSpeed;
    }

    function getSpawnAheadTime(): number {
        const speed = currentNoteSpeed * (isLaneCoverEnabled ? laneCoverSpeedMult : 1.0);
        // Spawn notes at least 2000 pixels before they hit. 
        // This ensures they start way off-screen at any speed.
        return 2000 / speed;
    }

    function applyDeviceShutterTuning() {
        if (!shutterOverlay) return;

        const ua = navigator.userAgent;
        console.log('Detecting platform for shutter tuning:', ua);

        // Windows Detection
        if (ua.indexOf('Windows') !== -1) {
            console.log('Applying Windows-specific shutter tuning (+5% vertical offset)');
            // Shift down more to correct the "too high" issue
            shutterOverlay.style.setProperty('--shutter-y-offset', '5%');
        }

        // Potential Mobile Detection
        if (/Android|iPhone|iPad|iPod/i.test(ua)) {
            console.log('Mobile device detected - using standard centering');
            shutterOverlay.style.setProperty('--shutter-scale', '2.8'); // Slightly larger for safety
        }
    }



    // Overload or just update spawnNote call sites?
    // Let's update spawnNote signature.
    function spawnNote(laneIndex: number, scheduledTime: number, isLong: boolean, duration: number, beat: number, noteType?: 'normal' | 'sinking' | 'death', soundId?: string) {
        notes.push({
            laneIndex: laneIndex,
            scheduledTime: scheduledTime,
            active: true,
            isLong: isLong,
            duration: duration,
            processed: false,
            beingHeld: false,
            beat: beat,
            type: noteType,
            soundId: soundId
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
                if (resultsOverlay && resultsOverlay.style.display !== 'block' && (!customResultScreen || customResultScreen.style.display !== 'flex')) {
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

        // Update rival progress based on passed notes
        while (rivalEventIndex < rivalScoreEvents.length && currentTimeMs >= rivalScoreEvents[rivalEventIndex].time) {
            rivalPassedMaxScore += rivalScoreEvents[rivalEventIndex].weight;
            rivalEventIndex++;
        }

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
                // Random mode beats are approximate or just ignore beat-scrolling
                const noteTime = currentTimeMs + spawnAheadTime;
                // Ensure valid beat for random mode
                let noteBeat = 0;
                if (bpmChanges.length > 0) {
                    noteBeat = getBeatFromTime(noteTime);
                }
                spawnNote(lane, noteTime, Math.random() < 0.2, Math.random() * 500, noteBeat, 'normal');
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
                    spawnNote(noteData.lane, noteData.time, noteData.duration > 0, noteData.duration, noteData.beat, noteData.type, noteData.soundId);
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

            const assistVal = assistSelect?.value || 'none';

            // MISS Detection Logic
            if (note.isLong && note.beingHeld) {
                const tailTime = note.scheduledTime + note.duration;
                if (currentTimeMs >= tailTime) {
                    note.active = false;
                    judgementColor = '#00ffff';
                    judgementTimer = 1000;
                    addHit('critical');
                    spawnHitEffect(note.laneIndex, '#00ffff');

                    if (isAutoPlay || (assistVal === 'auto_space' && note.laneIndex === 4)) {
                        pressedKeys[note.laneIndex] = false;
                        heldNotes[note.laneIndex] = null;
                    }
                }
            } else if ((isAutoPlay || (assistVal === 'auto_space' && note.laneIndex === 4)) && !note.isLong && !note.processed && currentTimeMs >= note.scheduledTime) {
                // AUTO PLAY HIT (Head)
                note.active = false;
                judgementText = `CRITICAL\nAUTO`;
                judgementColor = '#00ffff'; // Cyan for perfect
                judgementTimer = 1000;
                addHit('critical');
                spawnHitEffect(note.laneIndex, '#00ffff');

                // Simulate Key Press Visual
                pressedKeys[note.laneIndex] = true;
                setTimeout(() => pressedKeys[note.laneIndex] = false, 50);

            } else if ((isAutoPlay || (assistVal === 'auto_space' && note.laneIndex === 4)) && note.isLong && !note.processed && currentTimeMs >= note.scheduledTime && !note.beingHeld) {
                // AUTO PLAY HOLD START
                note.processed = true;
                note.beingHeld = true;
                heldNotes[note.laneIndex] = note;

                judgementText = `CRITICAL\nAUTO`;
                judgementColor = '#00ffff';
                judgementTimer = 1000;
                addHit('critical'); // Count head? 
                spawnHitEffect(note.laneIndex, '#00ffff');

                // Visualize Hold
                pressedKeys[note.laneIndex] = true;
                // We don't release key yet

            } else if ((isAutoPlay || (assistVal === 'auto_space' && note.laneIndex === 4)) && note.isLong && note.beingHeld && currentTimeMs >= note.scheduledTime + note.duration) {
                // AUTO PLAY HOLD END
                // The first block (line 536 in original) handles the end of hold if it's being held.
                // But we need to ensure the key is released.
                pressedKeys[note.laneIndex] = false;
                // Logic above (lines 536-544) will catch the completion and add 'perfect'.

            } else if (!note.isLong || !note.processed) { // Check Head
                const msPassed = currentTimeMs - note.scheduledTime;

                if (msPassed > MISS_BOUNDARY && note.active) {
                    note.active = false;
                    
                    if (note.type === 'death') {
                        // Death notes are ignored when missed (no penalty, no combo break)
                        logDebug(`DEATH NOTE IGNORED (Time): lane=${note.laneIndex} target=${(note.scheduledTime / 1000).toFixed(3)}s`);
                    } else {
                        judgementText = `MISS`;
                        judgementColor = '#ff0000';
                        judgementTimer = 1000;
                        addHit('miss');
                        if (note.isLong) addHit('miss'); // Penalize tail too for complete ignore
                        logDebug(`MISS (Time): lane=${note.laneIndex} target=${(note.scheduledTime / 1000).toFixed(3)}s passed=${Math.floor(msPassed)}ms`);

                        if (note.type === 'sinking') {
                            console.log('SINKING NOTE MISSED - FAIL');
                            failGame();
                        }
                    }
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
            const tailBeat = getBeatFromTime(tailTime);
            const tailY = getNoteY(tailTime, tailBeat, currentTimeMs);

            // 1. Check if Off Screen
            if (tailY > canvas.height + 1000) { // Large buffer for high speeds
                // If it's still active and going off screen, it's a MISS!
                // (Fix for high speed notes skipping the time-based miss check)
                if (note.active) {
                    if (currentTimeMs > note.scheduledTime + MISS_BOUNDARY) {
                        note.active = false;
                        
                        if (note.type === 'death') {
                            // Death notes are ignored when missed (no penalty, no combo break)
                            logDebug(`DEATH NOTE IGNORED (Spatial): lane=${note.laneIndex} target=${(note.scheduledTime / 1000).toFixed(3)}s`);
                        } else {
                            judgementText = `MISS`;
                            judgementColor = '#ff0000';
                            judgementTimer = 1000;
                            addHit('miss');
                            if (note.isLong) addHit('miss'); // Penalize tail
                            logDebug(`MISS (Spatial): lane=${note.laneIndex} target=${(note.scheduledTime / 1000).toFixed(3)}s tailY=${Math.floor(tailY)}`);
                            
                            if (note.type === 'sinking') {
                                console.log('SINKING NOTE MISSED - FAIL');
                                failGame();
                            }
                        }
                    } else {
                        logDebug(`CULL (Safe): lane=${note.laneIndex} target=${(note.scheduledTime / 1000).toFixed(3)}s tailY=${Math.floor(tailY)}`);
                    }
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

        const isIntroActive = introOverlay && introOverlay.style.display === 'flex';

        if (!isPlaying && !isIntroActive) {
            // Title or Song Select screen: Clear canvas to show background video
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            requestAnimationFrame(draw);
            return;
        }

        const currentTime = getAudioTime(); // Capture ONCE per frame
        const currentTimeMs = currentTime * 1000;

        // Clear / Draw Background
        if (isPlaying || isIntroActive) {
            // Game BG
            if (bgVideo && isVideoReady) {
                // Draw MV full screen as background
                ctx.drawImage(bgVideo, 0, 0, canvas.width, canvas.height);
            } else if (currentSongBackground) {
                // Song Specific Background
                ctx.drawImage(currentSongBackground, 0, 0, canvas.width, canvas.height);
            } else if (SKIN.gameBg) {
                // Fallback Image
                ctx.drawImage(SKIN.gameBg, 0, 0, canvas.width, canvas.height);
            }

            // Alpha dark overlay for playability
            if (!isMVLayout || isDaniMode) {
                ctx.fillStyle = 'rgba(0,0,0,0.5)';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            }
        }

        // Draw STATIC VISUAL LANES (Background)
        VISUAL_LANES.forEach(lane => {
            // Lane BG (if skin part exists, tile it)
            if (SKIN['lane']) {
                ctx.drawImage(SKIN['lane'], lane.x, 0, lane.width, canvas.height);
            } else {
                ctx.fillStyle = `rgba(17, 17, 17, ${laneOpacity})`;
                ctx.fillRect(lane.x, 0, lane.width, canvas.height);
            }

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

        // Draw Beat Grid (Measure Lines) [NEW]
        if (bpmChanges.length > 0) {
            const speed = currentNoteSpeed * (isLaneCoverEnabled ? laneCoverSpeedMult : 1.0);

            // We need to draw lines that are within the visible range
            // Visible range: [currentTimeMs, currentTimeMs + (HIT_Y / speed) + margin] (roughly)
            // But since lines move down, a line at time T has Y = HIT_Y - (T - current) * speed
            // Visible if Y >= 0 && Y <= canvas.height
            // 0 <= HIT_Y - (T - C) * speed <= H
            // ... solving for T is complex, simpler to iterate segments that overlap visible time.

            // Visible Time Window
            const maxVisibleTime = currentTimeMs + (HIT_Y / speed) + 2000; // Extra buffer
            const minVisibleTime = currentTimeMs - ((canvas.height - HIT_Y) / speed) - 1000;

            const allChanges = [{ time: -999999, bpm: bpmChanges[0]?.bpm || 120, beat: 0 }, ...bpmChanges];
            // Sort just in case
            allChanges.sort((a, b) => a.time - b.time);

            for (let i = 0; i < allChanges.length; i++) {
                const change = allChanges[i];
                const nextChange = allChanges[i + 1];

                // Segment Time Range
                const segStart = Math.max(minVisibleTime, change.time);
                const segEnd = nextChange ? Math.min(maxVisibleTime, nextChange.time) : maxVisibleTime;

                if (segStart < segEnd) {
                    const msPerBeat = 60000 / change.bpm;

                    const minGlobalBeat = change.beat + (segStart - change.time) / msPerBeat;
                    const startGlobalBeat = Math.ceil(minGlobalBeat);

                    let safeguard = 0;
                    for (let g = startGlobalBeat; safeguard < 1000; g++) {
                        safeguard++;
                        const beatTime = change.time + (g - change.beat) * msPerBeat;

                        if (beatTime > segEnd + 1) break;

                        const isMeasure = (g % 4 === 0);
                        const y = getNoteY(beatTime, g, currentTimeMs);

                        if (isMeasure) {
                            ctx.strokeStyle = '#888';
                            ctx.lineWidth = 2;
                        } else {
                            ctx.strokeStyle = '#444'; 
                            ctx.lineWidth = 1;
                        }

                        ctx.beginPath();
                        ctx.moveTo(0, y);
                        ctx.lineTo(canvas.width, y);
                        ctx.stroke();
                    }
                }
            }
        }

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
        ctx.fillText(`CRITICAL: ${stats.critical}`, 20, statsStartY);
        ctx.fillText(`GREAT:    ${stats.great}`, 20, statsStartY + statsLineH);
        ctx.fillText(`GOOD:     ${stats.good}`, 20, statsStartY + statsLineH * 2);
        ctx.fillText(`FAIL:     ${stats.fail}`, 20, statsStartY + statsLineH * 3);
        ctx.fillText(`MISS:     ${stats.miss}`, 20, statsStartY + statsLineH * 4);
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
        if (isAutoPlay) {
            ctx.font = 'bold 30px Arial';
            ctx.fillText('AUTO PLAY', canvas.width / 2, (canvas.height / 2) + 50);
        } else {
            let pct = 0;
            if (totalMaxScore > 0) {
                pct = ((totalMaxScore - lostScore) / totalMaxScore) * 100;
            }
            if (pct < 0) pct = 0;
            
            if (scoreDisplayType === 'percent') {
                if (isRivalShowEnabled) {
                    const playerAddPct = totalMaxScore > 0 ? (rawScore / totalMaxScore) * 100 : 0;
                    const rivalAddPct = totalMaxScore > 0 ? ((rivalPassedMaxScore * (rivalPercent / 100)) / totalMaxScore) * 100 : 0;
                    const diffPct = playerAddPct - rivalAddPct;

                    // Main Score %
                    ctx.font = 'bold 30px Arial';
                    ctx.fillStyle = '#fff';
                    const scoreText = pct.toFixed(4) + '%';
                    ctx.fillText(scoreText, canvas.width / 2, (canvas.height / 2) + 40);

                    // Difference %
                    ctx.font = 'bold 20px Arial';
                    ctx.fillStyle = diffPct >= 0 ? '#ffffff' : '#ff0000'; // プラスなら白、マイナスなら赤
                    const diffSign = diffPct >= 0 ? '+' : '';
                    const diffText = `${diffSign}${diffPct.toFixed(4)}%`;
                    ctx.fillText(diffText, canvas.width / 2, (canvas.height / 2) + 70);
                } else {
                    ctx.font = 'bold 30px Arial';
                    ctx.fillStyle = '#fff';
                    const scoreText = pct.toFixed(4) + '%';
                    ctx.fillText(scoreText, canvas.width / 2, (canvas.height / 2) + 50);
                }
            } else {
                // VALUE (数値) 表示
                const playerVal = rawScore;
                const rivalVal = Math.round(rivalPassedMaxScore * (rivalPercent / 100));
                
                if (isRivalShowEnabled) {
                    const diffVal = playerVal - rivalVal;

                    // Main Score Value
                    ctx.font = 'bold 30px Arial';
                    ctx.fillStyle = '#fff';
                    ctx.fillText(playerVal.toString(), canvas.width / 2, (canvas.height / 2) + 40);

                    // Difference Value
                    ctx.font = 'bold 20px Arial';
                    ctx.fillStyle = diffVal >= 0 ? '#ffffff' : '#ff0000'; // プラスなら白、マイナスなら赤
                    const diffSign = diffVal >= 0 ? '+' : '';
                    const diffText = `${diffSign}${diffVal}`;
                    ctx.fillText(diffText, canvas.width / 2, (canvas.height / 2) + 70);
                } else {
                    ctx.font = 'bold 30px Arial';
                    ctx.fillStyle = '#fff';
                    ctx.fillText(playerVal.toString(), canvas.width / 2, (canvas.height / 2) + 50);
                }
            }
        }

        ctx.globalAlpha = 1.0;

        // Draw Judgement Stats (Left of Lanes)
        if (laneStartX > 150) { // Only if there's space
            const statsX = laneStartX - 140;
            const statsStartTime = canvas.height / 2 - 100;
            const lineHeight = 35;

            ctx.textAlign = 'right';
            ctx.font = 'bold 24px Arial';

            // Critical
            ctx.fillStyle = '#00ffff';
            ctx.fillText(`CRITICAL: ${stats.critical}`, statsX, statsStartTime);

            // Great
            ctx.fillStyle = '#ffeb3b';
            ctx.fillText(`GREAT: ${stats.great}`, statsX, statsStartTime + lineHeight);

            // Good
            ctx.fillStyle = '#00ff00';
            ctx.fillText(`GOOD: ${stats.good}`, statsX, statsStartTime + lineHeight * 2);

            // Fail
            ctx.fillStyle = '#ffae00';
            ctx.fillText(`FAIL: ${stats.fail}`, statsX, statsStartTime + lineHeight * 3);

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
            if (isDaniMode) {
                // DANI survival gauge: Red/Black
                const grad = ctx.createLinearGradient(barX, barY, barX, barY + barH);
                grad.addColorStop(0, '#ff0000'); // Top is Red
                grad.addColorStop(1, '#000000'); // Bottom is Black
                ctx.fillStyle = grad;
            } else if (gaugeType === 'norma') {
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
            ctx.font = 'bold 12px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(`${Math.floor(currentHealth)}%`, barX + barW / 2, barY + barH + 15);
            
            // Dani Course Title & Index
            if (isDaniMode && currentDaniCourse) {
                ctx.fillStyle = '#ff0000';
                ctx.font = 'bold 16px "Sawarabi Mincho", serif';
                ctx.textAlign = 'left';
                ctx.fillText(currentDaniCourse.title, 20, 40);
                ctx.fillStyle = '#fff';
                ctx.font = '14px Arial';
                ctx.fillText(`STAGE ${daniSongIndex + 1} / 4`, 20, 65);
            }
        }

        // Draw Score Bars (Vertical, Right of Lanes)
        if (laneEndX > 0 && totalMaxScore > 0) {
            const barW = 15;
            const barH = 400; // Fixed height (matches health bar)
            const barY = (canvas.height / 2) - 200; // Centered vertically (matches health bar)
            
            const barX_player = laneEndX + 10;
            const barX_rival = laneEndX + 30;

            // --- 1. Player Score Bar ---
            // Background
            ctx.fillStyle = '#1a1a24';
            ctx.fillRect(barX_player, barY, barW, barH);
            ctx.strokeStyle = 'rgba(0, 255, 255, 0.4)';
            ctx.lineWidth = 1;
            ctx.strokeRect(barX_player, barY, barW, barH);

            // Fill (加算方式のプレイヤー現在の獲得スコア割合)
            const playerAddPct = totalMaxScore > 0 ? (rawScore / totalMaxScore) * 100 : 0;
            const fillH_player = Math.min(barH, (playerAddPct / 100) * barH);
            const fillY_player = barY + (barH - fillH_player);

            // Gradient: Cyan to Royal Blue
            const grad_player = ctx.createLinearGradient(barX_player, barY, barX_player, barY + barH);
            grad_player.addColorStop(0, '#00ffff'); // Top
            grad_player.addColorStop(1, '#0055ff'); // Bottom
            ctx.fillStyle = grad_player;
            ctx.fillRect(barX_player, fillY_player, barW, fillH_player);

            // --- 2. Rival Score Bar ---
            let rivalScoreVal = 0;
            let rivalAddPct = 0;
            if (isRivalBarEnabled) {
                // Background
                ctx.fillStyle = '#1a1a24';
                ctx.fillRect(barX_rival, barY, barW, barH);
                ctx.strokeStyle = 'rgba(255, 152, 0, 0.4)';
                ctx.lineWidth = 1;
                ctx.strokeRect(barX_rival, barY, barW, barH);

                // Fill (加算方式のライバル進行度)
                rivalScoreVal = Math.round(rivalPassedMaxScore * (rivalPercent / 100));
                rivalAddPct = totalMaxScore > 0 ? (rivalScoreVal / totalMaxScore) * 100 : 0;
                const fillH_rival = Math.min(barH, (rivalAddPct / 100) * barH);
                const fillY_rival = barY + (barH - fillH_rival);

                // Gradient: Orange to Red
                const grad_rival = ctx.createLinearGradient(barX_rival, barY, barX_rival, barY + barH);
                grad_rival.addColorStop(0, '#ff9800'); // Top
                grad_rival.addColorStop(1, '#ff3d00'); // Bottom
                ctx.fillStyle = grad_rival;
                ctx.fillRect(barX_rival, fillY_rival, barW, fillH_rival);
            }

            // --- 3. Text Labels (P / R) & Value / Percentages ---
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 12px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('P', barX_player + barW / 2, barY + barH + 15);
            if (isRivalBarEnabled) {
                ctx.fillText('R', barX_rival + barW / 2, barY + barH + 15);
            }

            // Text above the bars (Percent or Value)
            ctx.font = 'bold 10px Arial';
            if (scoreDisplayType === 'percent') {
                ctx.fillStyle = '#00ffff';
                ctx.fillText(`${Math.floor(playerAddPct)}%`, barX_player + barW / 2, barY - 8);
                if (isRivalBarEnabled) {
                    ctx.fillStyle = '#ff9800';
                    ctx.fillText(`${Math.floor(rivalAddPct)}%`, barX_rival + barW / 2, barY - 8);
                }
            } else {
                ctx.fillStyle = '#00ffff';
                ctx.fillText(rawScore.toString(), barX_player + barW / 2, barY - 8);
                if (isRivalBarEnabled) {
                    ctx.fillStyle = '#ff9800';
                    ctx.fillText(rivalScoreVal.toString(), barX_rival + barW / 2, barY - 8);
                }
            }
        }

        // Draw Notes (Multi-pass: White -> Blue -> Space)
        function drawNotesForLane(targetLaneIdx: number) {
            const assistVal = assistSelect?.value || 'none';
            notes.forEach(note => {
                if (note.laneIndex !== targetLaneIdx) return;
                const config = LANE_CONFIGS[note.laneIndex];
                if (!config) return;

                let bodyColor = 'rgba(255, 255, 255, 0.5)';
                if (config.color === '#7CA4FF') bodyColor = 'rgba(124, 164, 255, 0.5)';
                else if (config.color === '#e040fb') {
                    if (assistVal === 'auto_space') bodyColor = 'rgba(0, 255, 0, 0.5)'; // Green for Auto
                    else bodyColor = 'rgba(224, 64, 251, 0.5)';
                }

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
                if (config.label === 'SPACE') {
                    if (assistVal === 'auto_space') skinImg = null; // Use code color for Green
                    else skinImg = SKIN.space;
                }
                else if (config.color === '#7CA4FF') skinImg = SKIN.blue;
                else skinImg = SKIN.white;

                if (note.isLong) {
                    const headY = getNoteY(note.scheduledTime, note.beat, currentTimeMs);
                    // Calculate tail beat
                    // We can approximate or calculate exactly.
                    // note.duration is time.
                    const tailBeat = getBeatFromTime(note.scheduledTime + note.duration);
                    const tailY = getNoteY(note.scheduledTime + note.duration, tailBeat, currentTimeMs);

                    // Set transparency for long notes (50% as requested)
                    const originalAlpha = ctx!.globalAlpha;
                    ctx!.globalAlpha = 0.5;
                    
                    // Simple rect for long note Body
                    if (note.type === 'death') {
                        ctx!.fillStyle = '#330000'; // Dark Red/Black for Death Note Body
                    } else {
                        ctx!.fillStyle = bodyColor;
                    }
                    ctx!.fillRect(x + H_GAP, tailY, w - (H_GAP * 2), headY - tailY);

                    // Reset Alpha for Head to be fully visible
                    ctx!.globalAlpha = originalAlpha;

                    // Head (Draw as normal note)
                    const isSpecial = note.type === 'sinking' || note.type === 'death';
                    if (skinImg && !isSpecial) {
                        ctx!.drawImage(skinImg, x + H_GAP, headY - (drawHeight / 2), w - (H_GAP * 2), drawHeight);
                    } else {
                        if (config.label === 'SPACE' && assistVal === 'auto_space') ctx!.fillStyle = '#00ff00';
                        else ctx!.fillStyle = config.color;

                        if (note.type === 'sinking') {
                            const blink = (Math.floor(Date.now() / 100) % 2 === 0);
                            ctx!.fillStyle = blink ? '#ff0000' : '#ffaaaa';
                        } else if (note.type === 'death') {
                            const blink = (Math.floor(Date.now() / 100) % 2 === 0);
                            ctx!.fillStyle = blink ? '#ff0000' : '#000000';
                        }
                        ctx!.fillRect(x + H_GAP, headY - (drawHeight / 2), w - (H_GAP * 2), drawHeight);
                    }
                } else {
                    const noteY = getNoteY(note.scheduledTime, note.beat, currentTimeMs);
                    if (noteY > canvas.height + 100) return; // Optimization check?

                    // Draw regular note
                    // ...
                    const isSpecial = note.type === 'sinking' || note.type === 'death';
                    if (skinImg && !isSpecial) {
                        ctx!.drawImage(skinImg, x + H_GAP, noteY - (drawHeight / 2), w - (H_GAP * 2), drawHeight);
                    } else {
                        if (config.label === 'SPACE' && assistVal === 'auto_space') ctx!.fillStyle = '#00ff00';
                        else ctx!.fillStyle = config.color;

                        // Special Note Rendering
                        if (note.type === 'sinking') {
                            // Blinking bright red
                            const blink = (Math.floor(Date.now() / 100) % 10 < 5); // Smoother blink
                            ctx!.fillStyle = blink ? '#ff3333' : '#ff8888';
                        } else if (note.type === 'death') {
                            // Blinking red-black
                            const blink = (Math.floor(Date.now() / 100) % 10 < 5);
                            ctx!.fillStyle = blink ? '#ff0000' : '#330000';
                        }

                        ctx!.fillRect(x + H_GAP, noteY - (drawHeight / 2), w - (H_GAP * 2), drawHeight);
                    }
                    
                    // Add indicators even with skinImg if it's special
                    if (isSpecial) {
                        ctx!.fillStyle = '#fff';
                        ctx!.font = `bold ${Math.floor(drawHeight * 1.2)}px Arial`;
                        ctx!.textAlign = 'center';
                        ctx!.fillText(note.type === 'sinking' ? '!' : 'X', x + config.width / 2, noteY + (drawHeight / 3));
                    }
                }
            });
        }

        // Draw Notes (Multi-pass based on Layering)
        const currentModeIndices = GAME_MODES[currentKeyMode].indices;

        // 1. Space Layers (at the back)
        if (currentModeIndices.includes(4)) drawNotesForLane(4);

        // 2. Main Layers (Non-Blue)
        currentModeIndices.forEach(idx => {
            if (idx === 4) return;
            const config = LANE_CONFIGS[idx];
            if (config && config.color !== '#7CA4FF') {
                drawNotesForLane(idx);
            }
        });

        // 3. Highlight Layers (Blue Notes on Top)
        currentModeIndices.forEach(idx => {
            if (idx === 4) return;
            const config = LANE_CONFIGS[idx];
            if (config && config.color === '#7CA4FF') {
                drawNotesForLane(idx);
            }
        });

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
        if (judgementTimer > 0 && ctx) {
            const centerLaneX = (laneStartX + laneEndX) / 2;

            // Reverted to traditional text-only judgment as requested
            // Reset to default size (40px) as requested
            ctx.fillStyle = judgementColor;
            ctx.font = 'bold 40px Arial'; 
            ctx.textAlign = 'center';
            const lines = judgementText.split('\n');
            lines.forEach((line, i) => {
                ctx.fillText(line, centerLaneX, HIT_Y - (judgementHeightOffset / 2) + (i * 40)); 
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
        if (currentSongFolder && currentChartFilename && currentSongAudio) {
            loadSong(currentSongFolder, currentChartFilename, currentSongAudio); // Restart
        }
    }

    function quitGame() {
        isPaused = false;
        isCountdown = false;
        isPlaying = false;
        stopAudio();
        if (bgVideo) bgVideo.pause(); // Stop video
        pauseOverlay.style.display = 'none';
        showStartScreen(true);
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
        // Populate Old Result Overlay (Backwards compatibility / Debug)
        if (resCombo) resCombo.textContent = stats.maxCombo.toString();

        if (resAvg) {
            const avg = stats.hitCount > 0 ? (stats.totalErrorMs / stats.hitCount).toFixed(1) : '0';
            resAvg.textContent = avg;
        }

        // Calculate Final Score and Rank
        const isClear = isTrackCleared(gaugeType, currentHealth, isTrackFailed);

        const scoreResult = calculateScore(totalMaxScore, lostScore, isClear);
        const scaledScore = scoreResult.scaledScore;
        let rank = scoreResult.rank;

        if (resultsOverlay) {
            resultsOverlay.style.display = 'block';
            const resTitle = resultsOverlay.querySelector('h2');
            if (resTitle) {
                if (isClear) {
                    resTitle.textContent = "TRACK CLEAR";
                    resTitle.style.color = "#00ffff"; // Cyan
                } else {
                    resTitle.textContent = "TRACK FAILED";
                    resTitle.style.color = "#ff0000"; // Red
                }
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
        else if (assistSelect?.value === 'auto_space') descriptiveModifiers += "-AUTOSPACE";

        // 3. Random
        if (randomSelect?.value === 'shuffle_color') descriptiveModifiers += "-RANDOM";
        else if (randomSelect?.value === 'shuffle_chaos') descriptiveModifiers += "-CHAOS";
        else if (randomSelect?.value === 'mirror') descriptiveModifiers += "-MIRROR";

        // Save Personal Best Score (Skip if AutoPlay)
        if (currentSongData && !isAutoPlay) {
            const buttonOrder = ['no', 'st', 'ad', 'pr', 'et'];
            const diffKey = buttonOrder[selectedDiffIndex];
            const matchingKey = Object.keys(currentSongData.charts || {}).find(k => {
                const filename = currentSongData.charts[k];
                let mode = '8key';
                if (filename.toLowerCase().includes('4k')) mode = '4key';
                else if (filename.toLowerCase().includes('6k')) mode = '6key';
                else if (filename.toLowerCase().includes('12k')) mode = '12key';
                if (mode !== selectedModeFilter) return false;
                
                const chartInfos = (currentSongData as any).chartInfos || {};
                let effectiveDiff = chartInfos[filename]?.difficulty || k.split('_')[0];
                return effectiveDiff === diffKey;
            });

            if (matchingKey) {
                const filename = currentSongData.charts[matchingKey];
                const scoreKey = `${currentSongData.id}_${filename}`;
                const bestScoresKey = `magsic_best_scores_${currentPlayer}`;

                try {
                    const saved = localStorage.getItem(bestScoresKey);
                    let bestScores = saved ? JSON.parse(saved) : {};
                    const prevBest = bestScores[scoreKey];
                    const clearRateValue = scoreResult.ratio * 100;

                    if (!prevBest || scaledScore > prevBest.score) {
                        bestScores[scoreKey] = {
                            score: scaledScore,
                            clearRate: clearRateValue,
                            maxCombo: stats.maxCombo,
                            isClear: isClear,
                            rank: rank,
                            updatedAt: Date.now()
                        };
                        localStorage.setItem(bestScoresKey, JSON.stringify(bestScores));
                    }
                } catch(e) { console.error('Failed to save best score', e); }
            }
        }

        // Send final results to opponent if in battle
        if (isBattleSelectMode && wsBattle && wsBattle.readyState === WebSocket.OPEN) {
            wsBattle.send(JSON.stringify({
                type: 'results',
                score: scaledScore,
                clearRate: scoreResult.ratio * 100,
                maxCombo: stats.maxCombo,
                isClear: isClear,
                rank: rank
            }));
        }

        // Show New Premium Result Screen
        if (customResultScreen) {
            if (valResCritical) valResCritical.textContent = stats.critical.toString();
            if (valResGreat) valResGreat.textContent = stats.great.toString();
            if (valResGood) valResGood.textContent = stats.good.toString();
            if (valResFail) valResFail.textContent = stats.fail.toString();
            if (valResMiss) valResMiss.textContent = stats.miss.toString();
            if (valResCombo) valResCombo.textContent = stats.maxCombo.toString();
            if (valResScore) valResScore.textContent = scaledScore.toLocaleString();

            if (resultStatusTitle) {
                if (isBattleSelectMode) {
                    if (hasOpponentFinished && opponentResultData) {
                        const userRatio = scoreResult.ratio;
                        const cpuRatio = opponentResultData.clearRate / 100;
                        
                        if (userRatio >= cpuRatio) {
                            resultStatusTitle.textContent = "YOU WIN! 🏆";
                            resultStatusTitle.style.color = "#ffd700"; // Gold
                            playSE('se_clear');
                        } else {
                            resultStatusTitle.textContent = "YOU LOSE... 😢";
                            resultStatusTitle.style.color = "#ff3d00"; // Orange-Red
                            playSE('se_fail');
                        }
                    } else if (opponentName && opponentName.textContent === 'CPU_Rival_99') {
                        // Fallback for CPU solo matching test
                        const userRatio = scoreResult.ratio;
                        const cpuRatio = totalMaxScore > 0 ? (rivalPassedMaxScore / totalMaxScore) : 0;
                        
                        if (userRatio >= cpuRatio) {
                            resultStatusTitle.textContent = "YOU WIN! 🏆";
                            resultStatusTitle.style.color = "#ffd700";
                            playSE('se_clear');
                        } else {
                            resultStatusTitle.textContent = "YOU LOSE... 😢";
                            resultStatusTitle.style.color = "#ff3d00";
                            playSE('se_fail');
                        }
                    } else {
                        // Real opponent not finished yet: wait for results
                        resultStatusTitle.textContent = "WAITING FOR OPPONENT...";
                        resultStatusTitle.style.color = "#888";
                        if (isClear) playSE('se_clear');
                        else playSE('se_fail');
                    }
                } else {
                    if (isClear) {
                        resultStatusTitle.textContent = "TRACK CLEAR";
                        resultStatusTitle.style.color = "#00ffff";
                        playSE('se_clear');
                    } else {
                        resultStatusTitle.textContent = "TRACK FAILED";
                        resultStatusTitle.style.color = "#ff0000";
                        playSE('se_fail');
                    }
                }
            }

            if (resultsOverlay) resultsOverlay.style.display = 'none'; // Ensure old overlay is hidden
            if (canvas) canvas.style.display = 'none'; // Make play screen black (hidden)
            customResultScreen.style.display = 'flex';
            startResultBlinking();
        }
    }

    let blinkingTimer: number | null = null;
    function startResultBlinking() {
        if (blinkingTimer) return;
        let toggle = false;
        blinkingTimer = window.setInterval(() => {
            toggle = !toggle;
            if (imgResCritical) imgResCritical.src = toggle ? SKIN.resCritical2!.src : SKIN.resCritical1!.src;
            if (imgResGreat) imgResGreat.src = SKIN.resGreat1!.src; 
            if (imgResGood) imgResGood.src = SKIN.resGood1!.src;
            if (imgResFail) imgResFail.src = SKIN.resFail1!.src;
            if (imgResMiss) imgResMiss.src = toggle ? SKIN.resMiss2!.src : SKIN.resMiss1!.src;
        }, 80);
    }

    function stopResultBlinking() {
        if (blinkingTimer) {
            clearInterval(blinkingTimer);
            blinkingTimer = null;
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
    
    if (laneOpacityInput && laneOpacityDisplay) {
        laneOpacityInput.addEventListener('input', () => {
            laneOpacity = parseInt(laneOpacityInput.value) / 100;
            laneOpacityDisplay.textContent = laneOpacityInput.value;
            savePlayerSettings();
        });
    }

    if (btnRandom) {
        btnRandom.addEventListener('click', () => {
            currentMode = 'random';
            isPlaying = true;
            resetStats();
            // Ensure BPM changes exist for random mode (beat calculation)
            bpmChanges = [{ beat: 0, bpm: 120, time: 0 }];
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
        'no': '#4caf50', // Green
        'st': '#2196f3', // Blue
        'ad': '#f5deb3', // Wheat (小麦色)
        'pr': '#f44336', // Red (Original)
        'et': '#e040fb'  // Purple (Eternal)
    };

    const DIFF_FILTERS: { [key: string]: string } = {
        'no': 'hue-rotate(120deg) saturate(1.2)', // Green
        'st': 'hue-rotate(240deg) saturate(1.2)', // Blue
        'ad': 'hue-rotate(40deg) brightness(1.7) saturate(0.6)', // Wheat
        'pr': 'none', // Red (Original)
        'et': 'hue-rotate(270deg) saturate(1.2)'  // Purple
    };

    let selectedSongIndex = 0;
    let selectedDiffIndex = 0; // 0..4 (no, st, ad, pr, et)
    let availableSongs: Song[] = [];

    // Handle Song Select Navigation
    window.addEventListener('keydown', (e) => {
        // Fix: Allow 'flex' or just check not hidden
        if (songSelectOverlay.style.display !== 'none') {
            const activeEl = document.activeElement;
            const isInputField = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');
            if (isInputField) return; // Prevent key events while typing inside text fields

            if (isBattleSelectMode && myBattleRole === 'p2') {
                if (e.key !== 'Escape') {
                    e.preventDefault();
                    return;
                }
            }

            // ESCAPE to Close
            if (e.key === 'Escape') {
                if (isInfosLoading) return; // Prevent closing if loading (fixes spam bug)

                playSE('se_cancel');
                songSelectOverlay.style.display = 'none';
                if (isBattleSelectMode) {
                    songSelectOverlay.classList.remove('battle-mode');
                    if (wsBattle) {
                        wsBattle.close();
                        wsBattle = null;
                    }
                    openBattleLobby();
                } else {
                    if (startScreen) startScreen.style.display = 'flex';
                    playBGM('bgm_title');
                }
                return;
            }

            console.log('Song Select Nav Key:', e.key); // DEBUG
            const updateDiff = (delta: number) => {
                selectedDiffIndex = (selectedDiffIndex + delta + 5) % 5;
                renderRightColumn();
                playSE('se_select');
            };

            const startSelected = () => {

                const song = availableSongs[selectedSongIndex];
                if (!song || !song.charts) return;
                
                const buttonOrder = ['no', 'st', 'ad', 'pr', 'et'];
                const diffKey = buttonOrder[selectedDiffIndex];
                const chartInfos = (song as any).chartInfos || {};
                const charts = song.charts;

                const matchingKey = Object.keys(charts).find(k => {
                    const filename = charts[k];
                    const info = chartInfos[filename];
                    let mode = '8key';
                    if (filename.toLowerCase().includes('4k')) mode = '4key';
                    else if (filename.toLowerCase().includes('6k')) mode = '6key';
                    else if (filename.toLowerCase().includes('12k')) mode = '12key';
                    if (mode !== selectedModeFilter) return false;
                    let effectiveDiff = (info && info.difficulty) ? info.difficulty : k.split('_')[0];
                    return effectiveDiff === diffKey;
                });

                if (matchingKey) {
                    playSE('se_decide');
                    if (isBattleSelectMode && wsBattle && wsBattle.readyState === WebSocket.OPEN && myBattleRole === 'p1') {
                        wsBattle.send(JSON.stringify({
                            type: 'song_decide',
                            songFolder: song.folder,
                            chartName: song.charts[matchingKey],
                            audioName: song.audio
                        }));
                    }
                    loadSong(song.folder, song.charts[matchingKey], song.audio);
                }
            };

            if (e.key.toLowerCase() === 'k' || e.key === 'ArrowDown') {
                e.preventDefault();
                selectedSongIndex = (selectedSongIndex + 1) % availableSongs.length;
                renderSongSelectInternal();
                playSE('se_select');
                if (isBattleSelectMode && wsBattle && wsBattle.readyState === WebSocket.OPEN && myBattleRole === 'p1') {
                    wsBattle.send(JSON.stringify({ type: 'cursor_move', index: selectedSongIndex }));
                }
            } else if (e.key.toLowerCase() === 'd' || e.key === 'ArrowUp') {
                e.preventDefault();
                selectedSongIndex = (selectedSongIndex - 1 + availableSongs.length) % availableSongs.length;
                renderSongSelectInternal();
                playSE('se_select');
                if (isBattleSelectMode && wsBattle && wsBattle.readyState === WebSocket.OPEN && myBattleRole === 'p1') {
                    wsBattle.send(JSON.stringify({ type: 'cursor_move', index: selectedSongIndex }));
                }
            } else if (e.key.toLowerCase() === 'l' || e.key === 'ArrowRight') {
                e.preventDefault();
                updateDiff(1);
                if (isBattleSelectMode && wsBattle && wsBattle.readyState === WebSocket.OPEN && myBattleRole === 'p1') {
                    wsBattle.send(JSON.stringify({ type: 'diff_change', index: selectedDiffIndex }));
                }
            } else if (e.key.toLowerCase() === 's' || e.key === 'ArrowLeft') {
                e.preventDefault();
                updateDiff(-1);
                if (isBattleSelectMode && wsBattle && wsBattle.readyState === WebSocket.OPEN && myBattleRole === 'p1') {
                    wsBattle.send(JSON.stringify({ type: 'diff_change', index: selectedDiffIndex }));
                }
            } else if (e.key === 'Enter' || e.key.toLowerCase() === 'f' || e.key.toLowerCase() === 'j') {
                e.preventDefault();
                startSelected();
            } else if (e.key === ' ' && !e.repeat) {
                if (controlsDiv) {
                    const isShown = controlsDiv.classList.contains('show-options');
                    if (isShown) {
                        controlsDiv.classList.remove('show-options');
                    } else {
                        controlsDiv.classList.add('show-options');
                        playSE('se_option');
                    }
                }
                e.preventDefault();
            }
        }
    });

    function updateModeTabsUI() {
        const container = document.getElementById('mode-tabs-container');
        if (container) {
            Array.from(container.children).forEach((child: any) => {
                const isSelected = child.textContent.toLowerCase().replace(' ', '') === selectedModeFilter;
                child.style.background = isSelected ? '#00bcd4' : '#333';
                child.style.border = isSelected ? '2px solid #00bcd4' : '2px solid #555';
            });
        }
    }

    let isInfosLoading = false;

    async function loadSongList() {
        if (isInfosLoading) return;
        isInfosLoading = true;

        // Show loading indicator if needed, or just rely on speed
        // songListDiv.innerHTML = '<p style="color:white; padding:20px;">Loading...</p>';

        try {
            const res = await fetch(`songs/list.json?t=${Date.now()}`);
            const fullList = await res.json();
            const list = fullList.filter((song: any) => song.enabled !== false);

            // Fetch Chart Details (Difficulty)
            // We need to fetch every chart to know its internal difficulty setting
            await Promise.all(list.map(async (song: any) => {
                song.chartInfos = {}; // filename -> { difficulty: string }
                if (song.charts) {
                    const filenames = Object.keys(song.charts).map(k => song.charts[k]) as string[];
                    // Deduplicate filenames to avoid double fetching
                    const uniqueFilenames = [...new Set(filenames)];

                    await Promise.all(uniqueFilenames.map(async (filename) => {
                        try {
                            const cRes = await fetch(`songs/${song.folder}/${filename}?t=${Date.now()}`);
                            if (cRes.ok) {
                                // handling BOM
                                const blob = await cRes.blob();
                                const text = await blob.text();
                                // simple parse, ignoring BOM for now or relying on JSON.parse laxity? 
                                // JSON.parse usually hates BOM.
                                const cleanText = text.replace(/^\uFEFF/, '');
                                const val = JSON.parse(cleanText);

                                song.chartInfos[filename] = {};
                                if (val.difficulty) {
                                    song.chartInfos[filename].difficulty = val.difficulty;
                                }
                                if (val.level !== undefined) {
                                    song.chartInfos[filename].level = val.level;
                                }
                                console.log(`Loaded metadata for ${filename}:`, song.chartInfos[filename]);
                            }
                        } catch (e) {
                            // console.warn('Diff check failed', filename);
                        }
                    }));
                }
            }));

            availableSongs = list;

            // Fetch High Scores (Keep existing logic)
            let allScores: { [key: string]: any[] } = {};
            try {
                const scoresRes = await fetch(`scores.json?t=${Date.now()}`);
                if (scoresRes.ok) {
                    allScores = await scoresRes.json();
                }
            } catch (e) {
                console.error('Failed to fetch scores.json', e);
            }

            (window as any).currentAllScores = allScores;

            // Initial Render
            initSongSelect();
            updateSongSelectVisuals();
            renderRightColumn();

            isInfosLoading = false;

        } catch (e) {
            songListDiv.innerHTML = '<p style="color:red">Failed to load song list. Make sure "songs/list.json" exists.</p>';
            isInfosLoading = false;
        }
    }

    function initSongSelect() {
        songListDiv.innerHTML = '';
        songListDiv.style.display = 'flex';
        songListDiv.style.overflow = 'hidden';
        songListDiv.style.flexDirection = 'column'; // Change to column to allow Header + Content

        // --- Main Content Area (Columns) ---
        const contentArea = document.createElement('div');
        contentArea.style.flex = '1';
        contentArea.style.display = 'flex';
        contentArea.style.width = '100%';
        contentArea.style.overflow = 'hidden';
        songListDiv.appendChild(contentArea);

        // --- LEFT COLUMN: Song Roll ---
        const leftCol = document.createElement('div');
        leftCol.id = 'song-select-left-col';
        leftCol.style.flex = '1';
        leftCol.style.display = 'flex';
        leftCol.style.flexDirection = 'column'; // ... rest of existing leftCol style
        leftCol.style.alignItems = 'center';
        leftCol.style.justifyContent = 'center';
        leftCol.style.overflow = 'hidden';
        leftCol.style.position = 'relative';

        const rollContainer = document.createElement('div');

        rollContainer.id = 'song-roll-container';
        rollContainer.style.position = 'absolute';
        rollContainer.style.top = '50%';
        rollContainer.style.left = '0';
        rollContainer.style.width = '100%';
        rollContainer.style.height = '0'; // Center point anchor
        rollContainer.style.display = 'block';

        // Render ALL songs into roll
        availableSongs.forEach((song, idx) => {
            const banner = document.createElement('div');
            banner.className = 'song-banner'; // Class specifically for easier selection
            banner.style.width = '600px';
            banner.style.height = '150px'; // 4:1 aspect scaled up
            banner.style.marginBottom = '30px';
            banner.style.transition = 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)'; // Faster, snappy response
            banner.style.backgroundSize = 'cover';
            banner.style.backgroundPosition = 'center';
            banner.style.borderRadius = '12px';
            banner.style.border = '2px solid rgba(255,255,255,0.1)';
            banner.style.cursor = 'pointer';
            banner.style.boxSizing = 'border-box';

            // Image
            if (song.icon) {
                banner.style.backgroundImage = `url('${song.icon}')`;
            } else {
                // Fallback / Placeholder
                banner.style.backgroundColor = '#333';
                banner.textContent = song.title; // Text if no image
                banner.style.display = 'flex';
                banner.style.justifyContent = 'center';
                banner.style.alignItems = 'center';
                banner.style.color = 'white';
                banner.style.fontSize = '1.5em';
                banner.style.fontWeight = 'bold';
            }

            // Allow clicking banner to select
            banner.addEventListener('click', () => {
                selectedSongIndex = idx;
                renderSongSelectInternal();
                playSE('se_select');
            });

            rollContainer.appendChild(banner);
        });

        leftCol.appendChild(rollContainer);
        contentArea.appendChild(leftCol);

        const rightCol = document.createElement('div');
        rightCol.id = 'song-select-right-col';
        rightCol.style.flex = '1';
        rightCol.style.display = 'flex';
        rightCol.style.flexDirection = 'column';
        rightCol.style.alignItems = 'center';
        rightCol.style.justifyContent = 'center';
        rightCol.style.gap = '20px';
        rightCol.style.background = 'rgba(0,0,0,0.5)';
        rightCol.style.borderLeft = '1px solid #444';

        contentArea.appendChild(rightCol);
    }

    function updateSongSelectVisuals() {
        const rollContainer = document.getElementById('song-roll-container');
        if (!rollContainer || availableSongs.length === 0) return;

        const bannerHeight = 150;
        const bannerMargin = 30;
        const totalStep = bannerHeight + bannerMargin;

        Array.from(rollContainer.children).forEach((child, idx) => {
            const banner = child as HTMLElement;
            
            // Calculate smooth difference for infinite loop
            let diff = idx - interpolatedSongIndex;
            const halfLen = availableSongs.length / 2;
            if (diff > halfLen) diff -= availableSongs.length;
            if (diff < -halfLen) diff += availableSongs.length;

            const targetY = diff * totalStep;
            const absDiff = Math.abs(diff);

            // Scale and opacity based on distance from center
            const scale = Math.max(0.6, 1.2 - (absDiff * 0.4));
            const opacity = Math.max(0.2, 1.0 - (absDiff * 0.5));
            const isSelected = Math.abs(diff) < 0.5;

            banner.style.position = 'absolute';
            banner.style.left = '50%';
            banner.style.transform = `translate(-50%, ${targetY - bannerHeight/2}px) scale(${scale})`;
            banner.style.opacity = opacity.toString();
            banner.style.zIndex = isSelected ? '10' : '5';
            
            if (isSelected) {
                const buttonOrder = ['no', 'st', 'ad', 'pr', 'et'];
                const diffKey = buttonOrder[selectedDiffIndex] || 'no';
                const diffColor = DIFF_COLORS[diffKey] || '#e040fb';
                banner.style.border = `4px solid ${diffColor}`;
                banner.style.boxShadow = `0 0 40px ${diffColor}`;
            } else {
                banner.style.border = '2px solid rgba(255,255,255,0.2)';
                banner.style.boxShadow = 'none';
            }
        });

        // Update right column if needed (usually only on actual selection change, but here we do it to be safe)
        // renderRightColumn();
    }

    function animateSongSelect() {
        if (!songSelectOverlay || songSelectOverlay.style.display === 'none') {
            isSongSelectAnimating = false;
            return;
        }

        isSongSelectAnimating = true;

        // Smoothly interpolate towards target selectedSongIndex
        let diff = selectedSongIndex - interpolatedSongIndex;
        const halfLen = availableSongs.length / 2;
        if (diff > halfLen) diff -= availableSongs.length;
        if (diff < -halfLen) diff += availableSongs.length;

        interpolatedSongIndex += diff * 0.1; // Smooth factor

        // Wrap around
        if (interpolatedSongIndex < 0) interpolatedSongIndex += availableSongs.length;
        if (interpolatedSongIndex >= availableSongs.length) interpolatedSongIndex -= availableSongs.length;

        updateSongSelectVisuals();
        requestAnimationFrame(animateSongSelect);
    }

    function renderRightColumn() {
        const rightCol = document.getElementById('song-select-right-col');
        if (!rightCol) return;
        rightCol.innerHTML = ''; // Clear old buttons

        const song = availableSongs[selectedSongIndex];
        if (!song) return;
        const allScores = (window as any).currentAllScores || {};

        if (song && song.charts) {
            // Icon above Title [NEW]
            if (song.icon) {
                const iconImg = document.createElement('img');
                iconImg.src = song.icon;
                iconImg.style.width = '250px';
                iconImg.style.height = '250px'; 
                iconImg.style.objectFit = 'cover';
                iconImg.style.borderRadius = '8px';
                iconImg.style.marginBottom = '10px';
                iconImg.style.boxShadow = '0 0 15px rgba(224, 64, 251, 0.3)';
                rightCol.appendChild(iconImg);
            }

            // Title Header for Right Col
            const title = document.createElement('h2');
            title.textContent = song.title;
            title.style.color = 'white';
            title.style.margin = '0 0 30px 0'; // Adjust margin
            title.style.textShadow = '0 0 10px #e040fb';
            rightCol.appendChild(title);

            // Diff Buttons
            // Fixed 5 slots: Normal, Standard, Advanced, Provecta, Eternal
            const buttonOrder = ['no', 'st', 'ad', 'pr', 'et'];

            // Need chartInfos map
            const chartInfos = (song as any).chartInfos || {};

            // Horizontal Container for Icons
            const btnContainer = document.createElement('div');
            btnContainer.style.display = 'flex';
            btnContainer.style.flexDirection = 'row';
            btnContainer.style.flexWrap = 'wrap';
            btnContainer.style.justifyContent = 'center';
            btnContainer.style.gap = '30px';
            btnContainer.style.marginTop = '20px';
            rightCol.appendChild(btnContainer);

            buttonOrder.forEach(diffKey => {
                // Find chart for this diffKey AND selectedModeFilter
                const charts = song.charts || {};

                // Find a chartKey where the EFFECTIVE difficulty matches diffKey
                const matchingKey = Object.keys(charts).find(k => {
                    const filename = charts[k];
                    const info = chartInfos[filename];

                    // Determine Mode
                    let mode = '8key';
                    if (filename.toLowerCase().includes('4k')) mode = '4key';
                    else if (filename.toLowerCase().includes('6k')) mode = '6key';
                    else if (filename.toLowerCase().includes('12k')) mode = '12key';

                    if (mode !== selectedModeFilter) return false;

                    // Determine Difficulty
                    let effectiveDiff = '';
                    if (info && info.difficulty) {
                        effectiveDiff = info.difficulty;
                    } else {
                        effectiveDiff = k.split('_')[0];
                    }

                    return effectiveDiff === diffKey;
                });

                const btn = document.createElement('div'); // Using div instead of button to avoid default styles
                const label = DIFF_LABELS[diffKey];
                const color = DIFF_COLORS[diffKey];

                const isSelected = (buttonOrder.indexOf(diffKey) === selectedDiffIndex);
                btn.style.display = 'flex';
                btn.style.flexDirection = 'column';
                btn.style.alignItems = 'center';
                btn.style.cursor = matchingKey ? 'pointer' : 'default';
                btn.style.transition = 'transform 0.2s';
                btn.style.padding = '10px';
                btn.style.borderRadius = '10px';
                
                if (isSelected) {
                    btn.style.background = 'rgba(224, 64, 251, 0.2)';
                    btn.style.border = '2px solid #e040fb';
                    btn.style.transform = 'scale(1.1)';
                } else {
                    btn.style.background = 'transparent';
                    btn.style.border = '2px solid transparent';
                }

                if (matchingKey) {
                    btn.onmouseover = () => { if (!isSelected) btn.style.transform = 'scale(1.05)'; };
                    btn.onmouseout = () => { if (!isSelected) btn.style.transform = 'scale(1.0)'; };
                }

                const img = document.createElement('img');

                // Determine Image Source
                let imgSrc = '';
                const filename = matchingKey ? charts[matchingKey] : '';
                const chartInfo = filename ? chartInfos[filename] : null;

                if (matchingKey && chartInfo && chartInfo.level && chartInfo.level > 0) {
                    const levelStr = chartInfo.level.toString();
                    // Robust encoding for Japanese filenames
                    imgSrc = `assets/選曲画面/${encodeURIComponent('難易度ロゴ')}${levelStr}.png`;
                } else {
                    // Use "No Chart" icon if missing or level not set
                    imgSrc = `assets/選曲画面/${encodeURIComponent('難易度ロゴ譜面なし')}.png`;
                }

                img.src = imgSrc;
                img.alt = `${diffKey.toUpperCase()}`;
                img.style.height = '100px'; // Significantly larger
                img.style.objectFit = 'contain';
                img.style.display = 'block';

                if (!matchingKey) {
                    img.style.opacity = '0.2';
                    img.style.filter = 'grayscale(1)';
                } else {
                    img.style.filter = DIFF_FILTERS[diffKey] || 'none';
                }

                // Fallback to text if image missing
                img.onerror = () => {
                    img.style.display = 'none';
                    const textSpan = document.createElement('span');
                    textSpan.textContent = DIFF_LABELS[diffKey] || diffKey.toUpperCase();
                    textSpan.style.color = matchingKey ? color : '#333';
                    textSpan.style.fontSize = '1.5em';
                    textSpan.style.fontWeight = 'bold';
                    btn.prepend(textSpan);
                };

                btn.appendChild(img);

                // Score display below icon
                if (matchingKey) {
                    const songScores = allScores[song.id] || [];
                    const myBest = songScores
                        .filter((s: any) => s.difficulty === filename && s.playerName === currentPlayer)
                        .sort((a: any, b: any) => b.score - a.score)[0];

                    if (myBest) {
                        const scoreSpan = document.createElement('span');
                        scoreSpan.textContent = myBest.score.toLocaleString();
                        scoreSpan.style.fontSize = '1em';
                        scoreSpan.style.color = '#fff';
                        scoreSpan.style.marginTop = '10px';
                        scoreSpan.style.textShadow = '0 0 5px rgba(0,0,0,0.8)';
                        btn.appendChild(scoreSpan);
                    }

                    btn.onclick = (e) => {
                        e.stopPropagation();
                        if (selectedModeFilter === '12key') playSE('se_decide_extra');
                        else playSE('se_decide');
                        const targetChartName = charts[matchingKey];
                        loadSong(song.folder, targetChartName, song.audio);
                    };
                }

                btnContainer.appendChild(btn);
            });

            // --- Premium Personal Best Display Panel ---
            const diffKey = buttonOrder[selectedDiffIndex];
            const charts = song.charts || {};
            const matchingKey = Object.keys(charts).find(k => {
                const filename = charts[k];
                let mode = '8key';
                if (filename.toLowerCase().includes('4k')) mode = '4key';
                else if (filename.toLowerCase().includes('6k')) mode = '6key';
                else if (filename.toLowerCase().includes('12k')) mode = '12key';
                if (mode !== selectedModeFilter) return false;
                let effectiveDiff = chartInfos[filename]?.difficulty || k.split('_')[0];
                return effectiveDiff === diffKey;
            });

            if (matchingKey) {
                const filename = charts[matchingKey];
                const scoreKey = `${song.id}_${filename}`;
                const bestScoresKey = `magsic_best_scores_${currentPlayer}`;
                let bestData = null;
                try {
                    const saved = localStorage.getItem(bestScoresKey);
                    if (saved) {
                        const parsed = JSON.parse(saved);
                        bestData = parsed[scoreKey];
                    }
                } catch(e) { console.error(e); }

                const bestPanel = document.createElement('div');
                bestPanel.style.cssText = 'width: 80%; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.15); border-radius: 12px; padding: 15px 25px; margin-top: 25px; box-sizing: border-box; display: flex; flex-direction: column; gap: 8px; font-family: sans-serif; box-shadow: 0 5px 15px rgba(0,0,0,0.5);';

                if (bestData) {
                    const rankColor = bestData.isClear ? '#ffd700' : '#ff4444';
                    const statusText = bestData.isClear ? 'CLEAR' : 'FAILED';
                    
                    bestPanel.innerHTML = `
                        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 6px; margin-bottom: 4px;">
                            <span style="font-weight: bold; color: #aaa; font-size: 0.85em; letter-spacing: 1px;">PERSONAL BEST</span>
                            <span style="font-weight: bold; color: ${rankColor}; font-size: 0.9em; letter-spacing: 1px; text-shadow: 0 0 8px ${rankColor}44;">${statusText} (Rank ${bestData.rank})</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span style="color: #888; font-size: 0.9em;">Score:</span>
                            <span style="color: #fff; font-weight: bold; font-family: monospace; font-size: 1.1em;">${bestData.score.toLocaleString()}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span style="color: #888; font-size: 0.9em;">Clear Rate:</span>
                            <span style="color: #00ffff; font-weight: bold; font-family: monospace; font-size: 1.1em;">${bestData.clearRate.toFixed(2)}%</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span style="color: #888; font-size: 0.9em;">Max Combo:</span>
                            <span style="color: #ff9100; font-weight: bold; font-family: monospace; font-size: 1.1em;">${bestData.maxCombo}</span>
                        </div>
                    `;
                } else {
                    bestPanel.innerHTML = `
                        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 6px; margin-bottom: 4px;">
                            <span style="font-weight: bold; color: #888; font-size: 0.85em; letter-spacing: 1px;">PERSONAL BEST</span>
                            <span style="font-weight: bold; color: #555; font-size: 0.9em; letter-spacing: 1px;">NO PLAY DATA</span>
                        </div>
                        <div style="text-align: center; color: #555; font-size: 0.85em; padding: 10px 0;">Play this chart to save your personal best!</div>
                    `;
                }
                rightCol.appendChild(bestPanel);
            }
        }
    }

    // Keep renderSongSelectInternal as a stub or remove usage?
    // Key handler calls renderSongSelectInternal()
    function renderSongSelectInternal() {
        // Start animation loop if not running
        if (!isSongSelectAnimating) {
            animateSongSelect();
        }
        
        // Handle Song Preview BGM
        const currentSong = availableSongs[selectedSongIndex];
        if (currentSong) {
            let previewSrc = '';
            if (currentSong.previewBgm) {
                if (currentSong.previewBgm.startsWith('assets/')) {
                    previewSrc = currentSong.previewBgm;
                } else {
                    previewSrc = `songs/${currentSong.folder}/${currentSong.previewBgm}`;
                }
            } else if (currentSong.title === '漁火') {
                previewSrc = 'assets/曲/漁火_選曲画面.m4a';
            } else if (currentSong.title === 'Ceviche') {
                previewSrc = 'assets/曲/Ceviche_選曲画面.m4a';
            }

            if (previewSrc) {
                // If this preview is already playing, do nothing
                if (!songPreviewBGM || songPreviewBGM.src.indexOf(encodeURI(previewSrc)) === -1) {
                    // Stop current preview if exists
                    if (songPreviewBGM) {
                        const prev = songPreviewBGM;
                        fadeVolume(prev, 0, 300, () => {
                            prev.pause();
                        });
                    }
                    // Fade out general selection BGM
                    if (currentBGM) {
                        fadeVolume(currentBGM, 0, 300);
                    }
                    
                    songPreviewBGM = new Audio(previewSrc);
                    songPreviewBGM.loop = false; // Do not loop preview
                    songPreviewBGM.volume = 0;

                    // When the preview ends, fade the main selection BGM back in
                    songPreviewBGM.addEventListener('ended', () => {
                        if (AUDIO_ASSETS.bgm_select) {
                            if (AUDIO_ASSETS.bgm_select.paused) {
                                AUDIO_ASSETS.bgm_select.volume = 0;
                                playBGM('bgm_select');
                            } else {
                                fadeVolume(AUDIO_ASSETS.bgm_select, 0.5, 800);
                            }
                        }
                    });

                    songPreviewBGM.play().catch(e => console.log('Preview play blocked', e));
                    fadeVolume(songPreviewBGM, 0.5, 800);
                }
            } else {
                // No special preview: stop any songPreviewBGM and resume general BGM
                if (songPreviewBGM) {
                    const prev = songPreviewBGM;
                    fadeVolume(prev, 0, 300, () => {
                        prev.pause();
                    });
                    songPreviewBGM = null;
                }
                if (AUDIO_ASSETS.bgm_select) {
                    if (AUDIO_ASSETS.bgm_select.paused) {
                        AUDIO_ASSETS.bgm_select.volume = 0;
                        playBGM('bgm_select');
                    } else {
                        fadeVolume(AUDIO_ASSETS.bgm_select, 0.5, 800);
                    }
                }
            }
        }

        updateSongSelectVisuals();
        renderRightColumn();
    }

    // No need for scrollIntoView anymore

    // --- RIGHT COLUMN: Diff Buttons ---


    // --- RIGHT COLUMN: Diff Buttons ---
    // This block is now handled by initSongSelect and renderRightColumn
    // const rightCol = document.createElement('div');
    // rightCol.style.flex = '1';
    // rightCol.style.display = 'flex';
    // rightCol.style.flexDirection = 'column';
    // rightCol.style.alignItems = 'center';
    // rightCol.style.justifyContent = 'center';
    // rightCol.style.gap = '20px';
    // rightCol.style.background = 'rgba(0,0,0,0.5)'; // Slight dim backdrop
    // rightCol.style.borderLeft = '1px solid #444';

    // const song = availableSongs[selectedSongIndex];
    // if (song && song.charts) {
    //     // Title Header for Right Col
    //     const title = document.createElement('h2');
    //     title.textContent = song.title;
    //     title.style.color = 'white';
    //     title.style.marginBottom = '30px';
    //     title.style.textShadow = '0 0 10px #e040fb';
    //     rightCol.appendChild(title);

    //     // Diff Buttons
    //     // Fixed 5 slots: Normal, Standard, Advanced, Provecta, Eternal
    //     const buttonOrder = ['no', 'st', 'ad', 'pr', 'et'];

    //     buttonOrder.forEach(diffKey => {
    //         // Check if chart exists
    //         let chartKey = '';
    //         // Need to find key in song.charts that matches baseDiff
    //         // e.g. "et", "et_6k", etc. based on SELECTED MODE?
    //         // The prompt says "Right side has 5 difficulties... button function".
    //         // Does it filter by Mode?
    //         // Previously logic filtered by `selectedModeFilter`. Let's assume we maintain that.

    //         // Find chart for this diffKey AND selectedModeFilter
    //         const charts = song.charts || {};
    //         const chartInfos = (song as any).chartInfos || {};

    //         // Find a chartKey where the EFFECTIVE difficulty matches diffKey
    //         const matchingKey = Object.keys(charts).find(k => {
    //             const filename = charts[k];
    //             const info = chartInfos[filename];

    //             // Determine Mode
    //             let mode = '8key';
    //             if (filename.toLowerCase().includes('4k')) mode = '4key';
    //             else if (filename.toLowerCase().includes('6k')) mode = '6key';
    //             else if (filename.toLowerCase().includes('12k')) mode = '12key';

    //             if (mode !== selectedModeFilter) return false;

    //             // Determine Difficulty
    //             // 1. JSON 'difficulty'
    //             // 2. Key prefix (legacy)
    //             let effectiveDiff = '';
    //             if (info && info.difficulty) {
    //                 effectiveDiff = info.difficulty;
    //             } else {
    //                 effectiveDiff = k.split('_')[0];
    //             }

    //             return effectiveDiff === diffKey;
    //         });

    //         const btn = document.createElement('button');
    //         const label = DIFF_LABELS[diffKey];
    //         const color = DIFF_COLORS[diffKey];

    //         btn.style.width = '300px';
    //         btn.style.height = '60px';
    //         btn.style.fontSize = '1.2em';
    //         btn.style.fontWeight = 'bold';
    //         btn.style.color = 'white';
    //         btn.style.background = matchingKey ? color : '#330000'; // Dim/Red if disabled? "Base image is Red" -> Red bg?
    //         if (!matchingKey) {
    //             // "Base is Red" - maybe standard unselected state? 
    //             // User said: "Original image is Red... Eternal Purple..."
    //             // If chart exists -> Color. If not -> Gray/Disabled? or Red?
    //             // Let's use Red (#500) for disabled/missing states to match "Red base"? 
    //             // Or maybe the user meant the button graphic is red. 
    //             // I'll stick to Dark Red for disabled/missing.
    //             btn.style.background = '#330000';
    //             btn.style.opacity = '0.5';
    //             btn.style.cursor = 'default';
    //         } else {
    //             btn.style.cursor = 'pointer';
    //             btn.style.boxShadow = `0 0 10px ${color}`;
    //             btn.style.border = `2px solid ${color}`;
    //         }

    //         btn.style.border = matchingKey ? `2px solid ${color}` : '1px solid #550000';
    //         btn.style.display = 'flex';
    //         btn.style.alignItems = 'center';
    //         btn.style.justifyContent = 'space-between';
    //         btn.style.padding = '0 20px';
    //         btn.style.borderRadius = '10px'; // Rounded

    //         // Inner content
    //         btn.innerHTML = `<span>${label.toUpperCase()}</span>`;

    //         if (matchingKey) {
    //             btn.onclick = (e) => {
    //                 e.stopPropagation();
    //                 // Mode specific SE
    //                 if (selectedModeFilter === '12key') playSE('se_decide_extra');
    //                 else playSE('se_decide');

    //                 stopBGM();
    //                 loadSong(song, charts[matchingKey]);
    //             };

    //             // Add High Score if available
    //             // Logic for score lookup
    //             const filename = charts[matchingKey];
    //             const songScores = allScores[song.id] || [];
    //             const myBest = songScores
    //                 .filter((s: any) => s.difficulty === filename && s.playerName === currentPlayer)
    //                 .sort((a: any, b: any) => b.score - a.score)[0];

    //             if (myBest) {
    //                 const scoreSpan = document.createElement('span');
    //                 scoreSpan.textContent = myBest.score.toLocaleString();
    //                 scoreSpan.style.fontSize = '0.9em';
    //                 scoreSpan.style.color = '#fff';
    //                 btn.appendChild(scoreSpan);
    //             }
    //         }

    //         rightCol.appendChild(btn);
    //     });
    // }

    // songListDiv.appendChild(rightCol);
    // }

    // State for Retry
    let currentChartFilename = '';
    let currentSongFolder = '';
    let currentSongAudio = '';

    async function loadSong(songFolder: string, chartFilename: string, audioFilename: string) {
        stopBGM(); // Stop selection BGM immediately
        const song = availableSongs.find(s => s.folder === songFolder);
        currentSongFolder = songFolder;
        currentChartFilename = chartFilename;
        currentSongAudio = audioFilename;
        currentSongBackground = null; // Reset background
        isMVLayout = false; // Reset layout [NEW]

        // 1. Immediately switch to play screen behind the scenes
        currentMode = 'chart';
        
        // Determine KeyMode immediately based on filename
        if (chartFilename.toLowerCase().includes('4k')) currentKeyMode = '4key';
        else if (chartFilename.toLowerCase().includes('6k')) currentKeyMode = '6key';
        else if (chartFilename.toLowerCase().includes('8k')) currentKeyMode = '8key';
        else if (chartFilename.toLowerCase().includes('12k')) currentKeyMode = '12key';
        else currentKeyMode = '8key';
        
        resize(); // Instantly update lane layout

        resetStats();
        notes.length = 0;
        nextNoteIndex = 0;
        
        songSelectOverlay.style.display = 'none';
        if (resultsOverlay) resultsOverlay.style.display = 'none';
        if (startScreen) startScreen.style.display = 'none';
        if (controlsDiv) controlsDiv.style.display = 'none';

        isPaused = false;
        isCountdown = false;
        pausedOffset = 0;
        if (btnPauseUI) btnPauseUI.style.display = 'block';

        // 2. Immediately show opaque intro screen over it
        if (introOverlay) {
            // Determine difficulty info
            const chartInfos = song ? (song as any).chartInfos : {};
            const info = chartInfos ? chartInfos[chartFilename] : null;
            
            let diffKey = '';
            if (song && song.charts) {
                diffKey = Object.keys(song.charts).find(k => song.charts![k] === chartFilename)?.split('_')[0] || '';
            }
            
            if (info && info.difficulty) diffKey = info.difficulty;

            const label = DIFF_LABELS[diffKey] || diffKey.toUpperCase();
            const color = DIFF_COLORS[diffKey] || '#ffffff';
            const levelStr = (info && info.level) ? info.level.toString() : '?';
            
            if (introSongTitle) introSongTitle.textContent = song ? song.title : 'Unknown Song';
            if (introSongLevel) {
                introSongLevel.textContent = `${label} ${levelStr}`;
                introSongLevel.style.borderColor = color;
                introSongLevel.style.color = color;
                introSongLevel.style.textShadow = `0 0 10px ${color}`;
            }

            introOverlay.style.display = 'flex';
            // Trigger reflow
            void introOverlay.offsetWidth;
            introOverlay.style.opacity = '1';
            
            if (introSongTitle) introSongTitle.style.animation = 'introZoom 5s ease-out forwards';
            if (introSongLevel) introSongLevel.style.animation = 'introZoom 5s ease-out forwards';
        }

        // 2. Play intro audio & video & wait for 5 seconds in parallel
        const introPromise = (async () => {
            if (introOverlay) {
                // Play intro video if configured
                const introVideoElement = document.getElementById('intro-video') as HTMLVideoElement;
                if (introVideoElement) {
                    if (song && song.introVideo) {
                        introVideoElement.src = `songs/${songFolder}/${song.introVideo}`;
                        introVideoElement.style.display = 'block';
                        introVideoElement.play().catch(e => console.log('Intro video play blocked', e));
                    } else {
                        introVideoElement.style.display = 'none';
                        introVideoElement.src = '';
                    }
                }

                // Play intro audio
                introBGM = new Audio();
                introBGM.volume = 0.8;
                
                const playIntro = (src: string): Promise<boolean> => {
                    return new Promise((resolve) => {
                        introBGM!.src = encodeURI(src);
                        introBGM!.play().then(() => {
                            resolve(true);
                        }).catch(() => {
                            resolve(false);
                        });
                    });
                };
                
                let successAudio = false;
                if (song && song.introAudio) {
                    successAudio = await playIntro(`songs/${songFolder}/${song.introAudio}`);
                }
                if (!successAudio) {
                    const successWav = await playIntro(`songs/${songFolder}/intro.wav`);
                    if (!successWav) {
                        const successMp3 = await playIntro(`songs/${songFolder}/intro.mp3`);
                        if (!successMp3) {
                            await playIntro(`songs/デフォルト開始前画面.mp3`);
                        }
                    }
                }
            }
            // Wait for 5 seconds
            await new Promise(r => setTimeout(r, 5000));
        })();

        // 3. Load game resources in background
        const loadResourcesPromise = (async () => {
            try { initAudio(); } catch (e) { alert(e); return; }

            try {
                // Load Video if exists
                if (song && song.video) {
                    isMVLayout = true; // [NEW]
                    if (bgVideo) {
                        bgVideo.pause();
                        bgVideo.src = "";
                        bgVideo = null;
                    }
                    isVideoReady = false;
                    bgVideo = document.createElement('video');
                    bgVideo.src = `songs/${song.folder}/${song.video}`;
                    bgVideo.muted = true;
                    bgVideo.loop = false;
                    bgVideo.preload = 'auto';
                    bgVideo.addEventListener('canplay', () => {
                        isVideoReady = true;
                    });
                    bgVideo.load();
                }

                // Load Background Image if exists
                if (song && (song as any).background) {
                    const bgImg = new Image();
                    bgImg.src = (song as any).background;
                    bgImg.onload = () => {
                        currentSongBackground = bgImg;
                    };
                }

                const audioRes = await fetch(`songs/${songFolder}/${audioFilename}`);
                const audioBuf = await audioRes.arrayBuffer();
                audioBuffer = await audioContext!.decodeAudioData(audioBuf);

                const chartRes = await fetch(`songs/${songFolder}/${chartFilename}?t=${Date.now()}`);
                const chartText = await chartRes.text();
                let text = chartText;
                if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
                const json = JSON.parse(text);

                // Determine Mode
                if (json.mode && GAME_MODES[json.mode as KeyMode]) {
                    currentKeyMode = json.mode as KeyMode;
                } else {
                    if (currentChartFilename.toLowerCase().includes('4k')) currentKeyMode = '4key';
                    else if (currentChartFilename.toLowerCase().includes('6k')) currentKeyMode = '6key';
                    else if (currentChartFilename.toLowerCase().includes('8k')) currentKeyMode = '8key';
                    else if (currentChartFilename.toLowerCase().includes('12k')) currentKeyMode = '12key';
                    else currentKeyMode = '8key';
                }

                // Recalculate layout
                resize();

                if (!json.notes || !Array.isArray(json.notes)) {
                    throw new Error('Invalid Chart Data');
                }
                chartData = parseChart(json);

                // Pre-load Keysounds
                keysoundBank.clear();
                const uniqueSoundIds = Array.from(new Set(chartData.map(n => n.soundId).filter(s => !!s))) as string[];
                if (uniqueSoundIds.length > 0) {
                    await Promise.all(uniqueSoundIds.map(async (soundId) => {
                        try {
                            const res = await fetch(`songs/${songFolder}/${soundId}`);
                            if (res.ok) {
                                const buf = await res.arrayBuffer();
                                const keysoundBuf = await audioContext!.decodeAudioData(buf);
                                keysoundBank.set(soundId, keysoundBuf);
                            }
                        } catch (e) {
                            console.error(`Failed to load keysound: ${soundId}`, e);
                        }
                    }));
                }

                // Apply Modifiers
                const assistMode = assistSelect?.value || 'none';
                const randomMode = randomSelect?.value || 'none';
                if (assistMode !== 'none' || randomMode !== 'none') {
                    chartData = applyModifiers(chartData, assistMode, randomMode);
                }

                // Data is loaded, gameplay will begin after intro fades out
            } catch (e) {
                alert('Error loading song: ' + e);
            }
        })();

        // 4. Wait for both intro (5s) and resources loading to finish
        await Promise.all([introPromise, loadResourcesPromise]);

        // Reset stats now that chartData is fully loaded to avoid incorrect totalMaxScore
        resetStats();

        // 5. Fade out and transition to game start
        if (introOverlay) {
            introOverlay.style.opacity = '0';
            setTimeout(() => {
                introOverlay.style.display = 'none';
                if (introSongTitle) introSongTitle.style.animation = 'none';
                if (introSongLevel) introSongLevel.style.animation = 'none';
                const introVideoElement = document.getElementById('intro-video') as HTMLVideoElement;
                if (introVideoElement) {
                    introVideoElement.pause();
                    introVideoElement.src = '';
                    introVideoElement.style.display = 'none';
                }
                if (introBGM) {
                    introBGM.pause();
                    introBGM.src = '';
                    introBGM = null;
                }
                startCountdown();
            }, 500); // 0.5s fade out
        } else {
            startCountdown();
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
        const result = _parseChart(json);
        bpmChanges = result.bpmChanges;
        layoutChanges = result.layoutChanges;
        return result.notes;
    }

    function applyModifiers(notes: ChartNote[], assist: string, random: string): ChartNote[] {
        return _applyModifiers(notes, assist as AssistMode, random as RandomMode, currentKeyMode);
    }

    function generateAutoChart(bpm: number, durationSec: number): ChartNote[] {
        // Initialize BPM for grid
        bpmChanges = [{ time: 0, bpm: bpm, beat: 0 }];

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
                hit: false,
                beat: i // Assign beat
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
            let sx = 0;

            // --- 9 KEY (Original Logic) ---
            if (currentKeyMode === '8key') {
                if (type === 'type-a') {
                    const totalPlayWidth = tempWidth * 4;
                    sx = (canvas.width - totalPlayWidth) / 2;
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
                    sx = (canvas.width - totalPlayWidth) / 2;
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
                sx = (canvas.width - totalPlayWidth) / 2;
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
                // Pattern: All White (S D F J K L = White)
                // User requested: "sdfjkl is white, weruio is blue"
                const colors = ['#ffffff', '#ffffff', '#ffffff', '#ffffff', '#ffffff', '#ffffff'];

                indices.forEach((kIdx, i) => {
                    const x = sx + (i * tempWidth);
                    vLanes.push({ x, width: tempWidth });
                    lConfigs[kIdx] = { x, width: tempWidth, color: colors[i], label: labels[i] };
                });
                lConfigs[4] = { x: sx, width: totalPlayWidth, color: '#e040fb', label: 'SPACE' };
            }
            // --- 8 KEY (e, d, r, f, u, j, i, k) ---

            // --- 12 KEY (6 doubled lanes) ---
            else if (currentKeyMode === '12key') {
                const tempWidth = currentLaneWidth * 1.5;
                const totalPlayWidth = tempWidth * 6;
                sx = (canvas.width - totalPlayWidth) / 2;
                laneStartX = sx;

                const pairs = [
                    { white: 9, blue: 11, label: 'S/W' }, // Lane 0
                    { white: 1, blue: 0, label: 'D/E' },  // Lane 1
                    { white: 3, blue: 2, label: 'F/R' },  // Lane 2
                    { white: 6, blue: 5, label: 'J/U' },  // Lane 3
                    { white: 8, blue: 7, label: 'K/I' },  // Lane 4
                    { white: 10, blue: 12, label: 'L/O' } // Lane 5
                ];

                pairs.forEach((pair, i) => {
                    const x = sx + (i * tempWidth);
                    vLanes.push({ x, width: tempWidth });
                    // White Key Config
                    lConfigs[pair.white] = { x, width: tempWidth, color: '#ffffff', label: pair.label };
                    // Blue Key Config (same visual space)
                    lConfigs[pair.blue] = { x, width: tempWidth, color: '#7CA4FF', label: '' };
                });
            }

            laneEndX = vLanes.length > 0 ? (vLanes[vLanes.length - 1].x + vLanes[vLanes.length - 1].width) : sx;

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
        // Always ensure length match or structure copy if target differs significantly
        if (LANE_CONFIGS.length !== LANE_CONFIG_TARGETS.length) {
            // Need to resize LANE_CONFIGS array to match target size (sparse array size)
            // Or just copy structure for safety if we are changing modes
            // If we just expand, interpolation might be weird for new elements (undefined -> target)
            // Let's just snap if length mismatch (Mode Change)
            LANE_CONFIGS = JSON.parse(JSON.stringify(LANE_CONFIG_TARGETS));
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
        const activeEl = document.activeElement;
        const isInputField = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');







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
        console.log(`Key: ${keyLower}, Index: ${keyIndex}, Mode: ${currentKeyMode}`); // DEBUG

        // Filter by Mode
        if (keyIndex !== -1) {
            const allowedIndices = GAME_MODES[currentKeyMode].indices;
            if (!allowedIndices.includes(keyIndex)) {
                console.log(`Key ${keyIndex} NOT ALLOWED in ${currentKeyMode}`); // DEBUG
                return;
            }
        }

        if (keyIndex !== -1 && !pressedKeys[keyIndex]) {
            pressedKeys[keyIndex] = true;

            const currentTimeMs = getAudioTime() * 1000;

            // Check for Death Long Notes (Forbidden Zones)
            const forbiddenNote = notes.find(n => 
                n.laneIndex === keyIndex && 
                n.isLong && 
                n.type === 'death' && 
                currentTimeMs >= n.scheduledTime && 
                currentTimeMs <= n.scheduledTime + n.duration
            );

            if (forbiddenNote) {
                console.log('DEATH LONG NOTE HIT - FAIL');
                failGame();
                return;
            }

            // Hit Detection
            const targetNotes = notes.filter(n =>
                n.active &&
                n.laneIndex === keyIndex &&
                !n.processed
            ).sort((a, b) => a.scheduledTime - b.scheduledTime);

            if (targetNotes.length > 0) {
                const currentTimeMs = getAudioTime() * 1000;
                
                // Find potential candidates within the miss boundary
                const candidates = targetNotes.filter(n => {
                    const absError = Math.abs(currentTimeMs - n.scheduledTime - globalOffset);
                    return absError < MISS_BOUNDARY;
                });

                if (candidates.length > 0) {
                    // Prioritize: Check if there's an ACTIVE normal/sinking note among candidates
                    const priorityNote = candidates.find(n => n.type !== 'death');
                    
                    // If a priority note exists, use it. Otherwise, use the closest Death Note.
                    const note = priorityNote || candidates[0];

                    const msErrorRaw = currentTimeMs - note.scheduledTime;
                    const msError = msErrorRaw - globalOffset; // Apply User Offset
                    const absError = Math.abs(msError);

                    if (note.type === 'death') {
                        console.log('DEATH NOTE HIT - FAIL');
                        failGame();
                        return;
                    }

                    const msRounded = Math.round(msError);
                    const sign = msRounded >= 0 ? '+' : ''; 
                    const msDisplay = `\n${sign}${msRounded}ms`;

                    if (absError < THRESHOLD_CRITICAL) {
                        judgementText = `CRITICAL${msDisplay}`;
                        judgementColor = '#00ffff';
                        addHit('critical', msError);
                        spawnHitEffect(note.laneIndex, '#00ffff');
                        currentJudgementType = 'critical';
                    } else if (absError < THRESHOLD_GREAT) {
                        judgementText = `GREAT${msDisplay}`;
                        judgementColor = '#ffeb3b';
                        addHit('great', msError);
                        spawnHitEffect(note.laneIndex, '#ffeb3b');
                        currentJudgementType = 'great';
                    } else if (absError < THRESHOLD_GOOD) {
                        judgementText = `GOOD${msDisplay}`;
                        judgementColor = '#00ff00';
                        addHit('good', msError);
                        spawnHitEffect(note.laneIndex, '#00ff00');
                        currentJudgementType = 'good';
                    } else if (absError < THRESHOLD_FAIL) {
                        judgementText = `FAIL${msDisplay}`;
                        judgementColor = '#ffae00';
                        addHit('fail', msError);
                        currentJudgementType = 'fail';
                    } else {
                        judgementText = `MISS${msDisplay}`;
                        judgementColor = '#ff0000';
                        addHit('miss', msError);
                        currentJudgementType = 'miss';
                    }
                    judgementTimer = 1000;
                    playKeysound(note.soundId);

                    if (note.isLong) {
                        note.processed = true;
                        note.beingHeld = true;
                        heldNotes[keyIndex] = note;
                    } else {
                        note.active = false;
                    }
                    logDebug(`HIT: lane=${keyIndex} error=${Math.floor(msError)}ms target=${(note.scheduledTime / 1000).toFixed(3)}s judge=${judgementText.split('\n')[0]}`);
                } else {
                    const note = targetNotes[0];
                    const msError = currentTimeMs - note.scheduledTime - globalOffset;
                    logDebug(`OUTSIDE: lane=${keyIndex} error=${Math.floor(msError)}ms target=${(note.scheduledTime / 1000).toFixed(3)}s`);
                }
            } else {
                logDebug(`EMPTY: lane=${keyIndex}`);
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

                const tailTime = note.scheduledTime + note.duration;
                const currentTimeMs = getAudioTime() * 1000;
                if (currentTimeMs < tailTime - THRESHOLD_CRITICAL) {
                    note.active = false;
                    judgementText = "MISS\nRELEASE";
                    judgementColor = "#ff0000";
                    judgementTimer = 1000;
                    currentJudgementType = 'miss';
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

    const modeArrowLeft = document.getElementById('mode-arrow-left');
    const modeArrowRight = document.getElementById('mode-arrow-right');
    if (modeArrowLeft) {
        modeArrowLeft.addEventListener('click', () => {
            currentModeIndex = (currentModeIndex - 1 + PLAY_MODES_INFO.length) % PLAY_MODES_INFO.length;
            renderModeCarousel();
        });
    }
    if (modeArrowRight) {
        modeArrowRight.addEventListener('click', () => {
            currentModeIndex = (currentModeIndex + 1) % PLAY_MODES_INFO.length;
            renderModeCarousel();
        });
    }
    if (btnLobbyBypass) {
        btnLobbyBypass.addEventListener('click', () => {
            playSE('se_decide');
            triggerMatchFound();
            setTimeout(() => {
                enterBattleSelectScreen();
            }, 800);
        });
    }
    if (btnCloseLobby) {
        btnCloseLobby.addEventListener('click', () => {
            playSE('se_cancel');
            if (matchingTimer) clearTimeout(matchingTimer);
            if (battleLobbyOverlay) battleLobbyOverlay.style.display = 'none';
            if (menuOverlay) {
                menuOverlay.style.display = 'flex';
                renderModeCarousel();
            }
        });
    }

    // Attach to UI Buttons
    const uiButtons = [
        btnSelectSong, btnCloseSelect, // btnStartSelect removed
        btnResume, btnRetry, btnQuit, btnCloseResults,
        btnPauseUI, btnCalibrate, btnCancelCalibration,
        btnOptionsToggle, btnRandom, btnChart,
        btnAddPlayer, btnClosePlayer, playerDisplay, playerDisplayInSelect,
        btnGaugeRoll, modeArrowLeft, modeArrowRight, btnLobbyBypass, btnCloseLobby
    ];

    uiButtons.forEach(btn => {
        if (btn) {
            btn.addEventListener('click', playClickSound);
        }
    });

})(); // Correct end of IIFE



