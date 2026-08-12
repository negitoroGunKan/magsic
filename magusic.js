(function() {
  "use strict";
  function getTimeFromBeat(beat, bpmChanges) {
    if (bpmChanges.length === 0) return 0;
    let lastBp = bpmChanges[0];
    for (let i = 1; i < bpmChanges.length; i++) {
      if (bpmChanges[i].beat <= beat) {
        lastBp = bpmChanges[i];
      } else {
        break;
      }
    }
    const msPerBeat = 6e4 / lastBp.bpm;
    return lastBp.time + (beat - lastBp.beat) * msPerBeat;
  }
  function getBeatFromTime(time, bpmChanges) {
    if (bpmChanges.length === 0) return 0;
    let lastBp = bpmChanges[0];
    for (let i = 1; i < bpmChanges.length; i++) {
      if (bpmChanges[i].time <= time) {
        lastBp = bpmChanges[i];
      } else {
        break;
      }
    }
    const msPerBeat = 6e4 / lastBp.bpm;
    return lastBp.beat + (time - lastBp.time) / msPerBeat;
  }
  const JUDGMENT_THRESHOLDS = {
    critical: 40,
    great: 80,
    good: 133,
    fail: 150,
    miss: 180
  };
  const SCORE_WEIGHTS = {
    critical: 10,
    great: 6,
    good: 2,
    fail: 1,
    miss: 0
  };
  function calculateMaxScore(notes) {
    if (notes.length === 0) return 1;
    return notes.length * 10;
  }
  function calculateLoss(judgmentType) {
    return 10 - SCORE_WEIGHTS[judgmentType];
  }
  function calculateScore(totalMaxScore, lostScore, isClear) {
    const ratio = totalMaxScore > 0 ? (totalMaxScore - lostScore) / totalMaxScore : 0;
    const scaledScore = Math.floor(ratio * 1e6);
    let rank;
    if (!isClear) {
      rank = "F";
    } else if (ratio >= 0.95) {
      rank = "S";
    } else if (ratio >= 0.9) {
      rank = "A";
    } else if (ratio >= 0.8) {
      rank = "B";
    } else if (ratio >= 0.7) {
      rank = "C";
    } else {
      rank = "D";
    }
    return { scaledScore, ratio, rank };
  }
  const GAUGE_RECOVERY = {
    norma_easy: { critical: 1, great: 0.5, good: 0.5, fail: -1, miss: -3 },
    norma: { critical: 0.5, great: 0.2, good: 0.2, fail: -2, miss: -6 },
    life: { critical: 0.5, great: 0.2, good: 0.2, fail: -6, miss: -8 },
    life_hard: { critical: 0.5, great: 0.2, good: 0.2, fail: -10, miss: -15 },
    life_ex: { critical: 0.5, great: 0.2, good: 0.2, fail: -25, miss: -50 },
    sudden_death: { critical: 0, great: 0, good: 0, fail: -100, miss: -100 }
  };
  function applyGaugeHit(currentHealth, judgmentType, gaugeType) {
    const recovery = GAUGE_RECOVERY[gaugeType][judgmentType];
    const newHealth = Math.max(0, Math.min(100, currentHealth + recovery));
    const isDead = (gaugeType === "life" || gaugeType === "life_hard" || gaugeType === "life_ex" || gaugeType === "sudden_death") && newHealth <= 0;
    return { health: newHealth, isDead };
  }
  function getInitialHealth(gaugeType) {
    if (gaugeType === "norma_easy") return 65;
    if (gaugeType === "norma") return 80;
    return 100;
  }
  function isTrackCleared(gaugeType, finalHealth, isDead) {
    if (isDead) return false;
    if (gaugeType === "norma_easy") return finalHealth >= 65;
    if (gaugeType === "norma") return finalHealth >= 80;
    return true;
  }
  function parseChart(json) {
    const offset = json.offset || 0;
    let bpmChanges = [];
    if (json.bpmChanges && Array.isArray(json.bpmChanges)) {
      json.bpmChanges.forEach((bc) => {
        bpmChanges.push({
          beat: bc.beat,
          bpm: bc.bpm,
          time: 0
          // Will calculate
        });
      });
      bpmChanges.sort((a, b) => a.beat - b.beat);
    } else {
      bpmChanges.push({
        beat: 0,
        bpm: json.bpm || 120,
        time: 0
      });
    }
    if (bpmChanges.length === 0 || bpmChanges[0].beat > 0) {
      bpmChanges.unshift({ beat: 0, bpm: json.bpm || 120, time: 0 });
    }
    bpmChanges[0].time = offset;
    for (let i = 1; i < bpmChanges.length; i++) {
      const prev = bpmChanges[i - 1];
      const beatsPassed = bpmChanges[i].beat - prev.beat;
      const msPerBeat = 6e4 / prev.bpm;
      bpmChanges[i].time = prev.time + beatsPassed * msPerBeat;
    }
    const notes = (json.notes || []).map((n) => ({
      time: getTimeFromBeat(n.beat, bpmChanges),
      lane: n.lane,
      duration: n.duration ? getTimeFromBeat(n.beat + n.duration, bpmChanges) - getTimeFromBeat(n.beat, bpmChanges) : 0,
      isLong: n.duration > 0,
      hit: false,
      beat: n.beat,
      type: n.type || "normal",
      soundId: n.soundId
    })).sort((a, b) => a.time - b.time);
    const layoutChanges = [];
    if (Array.isArray(json.layoutChanges)) {
      json.layoutChanges.forEach((lc) => {
        layoutChanges.push({
          time: getTimeFromBeat(lc.beat, bpmChanges),
          type: lc.type
        });
      });
      layoutChanges.sort((a, b) => a.time - b.time);
    }
    return { notes, bpmChanges, layoutChanges };
  }
  function fisherYatesShuffle(arr, rng) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  function applyModifiers(notes, assist, random, keyMode, rng = Math.random) {
    const modified = JSON.parse(JSON.stringify(notes));
    const laneMap = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const ACTIVE_LANES = {
      "4key": [1, 3, 6, 8],
      "6key": [9, 1, 3, 6, 8, 10],
      "8key": [0, 1, 2, 3, 5, 6, 7, 8],
      "12key": [0, 1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12]
    };
    const currentActiveLanes = ACTIVE_LANES[keyMode] || ACTIVE_LANES["8key"];
    if (random === "shuffle_color") {
      const allBlues = [0, 2, 5, 7, 11, 12];
      const allWhites = [1, 3, 6, 8, 9, 10];
      const activeBlues = allBlues.filter((lane) => currentActiveLanes.includes(lane));
      const activeWhites = allWhites.filter((lane) => currentActiveLanes.includes(lane));
      const newBlues = fisherYatesShuffle([...activeBlues], rng);
      const newWhites = fisherYatesShuffle([...activeWhites], rng);
      activeBlues.forEach((original, i) => {
        laneMap[original] = newBlues[i];
      });
      activeWhites.forEach((original, i) => {
        laneMap[original] = newWhites[i];
      });
    } else if (random === "shuffle_chaos") {
      const newLanes = fisherYatesShuffle([...currentActiveLanes], rng);
      currentActiveLanes.forEach((original, i) => {
        laneMap[original] = newLanes[i];
      });
    } else if (random === "mirror") {
      const reversedLanes = [...currentActiveLanes].reverse();
      currentActiveLanes.forEach((original, i) => {
        laneMap[original] = reversedLanes[i];
      });
    }
    if (random !== "none") {
      modified.forEach((n) => {
        if (n.lane !== 4) {
          n.lane = laneMap[n.lane];
        }
      });
    }
    if (assist === "blue_to_white") {
      const map = { 0: 1, 2: 3, 5: 6, 7: 8 };
      modified.forEach((n) => {
        if (map[n.lane] !== void 0) {
          n.lane = map[n.lane];
        }
        if (map[n.lane] !== void 0) {
          n.lane = map[n.lane];
        }
      });
    } else if (keyMode === "6key") {
      const map = { 2: 3, 5: 6 };
      modified.forEach((n) => {
        if (map[n.lane] !== void 0) {
          n.lane = map[n.lane];
        }
      });
    } else if (assist === "space_boost") {
      modified.forEach((n) => {
        if (n.lane !== 4) {
          if (rng() < 0.25) {
            n.lane = 4;
          }
        }
      });
    }
    return modified;
  }
  (() => {
    console.log("Magusic script executing...");
    const BASE_NOTE_SPEED = 0.5;
    let currentNoteSpeed = BASE_NOTE_SPEED * 2.5;
    const KEYS = ["e", "d", "r", "f", " ", "u", "j", "i", "k", "s", "l", "w", "o"];
    const GAME_MODES = {
      "4key": { indices: [1, 3, 6, 8, 4], label: "4 KEY" },
      "6key": { indices: [9, 1, 3, 6, 8, 10, 4], label: "6 KEY" },
      "8key": { indices: [0, 1, 2, 3, 4, 5, 6, 7, 8], label: "8 KEY" },
      "12key": { indices: [0, 1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12, 4], label: "12 KEY" }
    };
    const SKIN = {
      white: null,
      blue: null,
      space: null,
      titleBg: null,
      gameBg: null,
      resBg: null,
      // In-game Judgements (PlayRoom)
      judgeCritical1: null,
      judgeCritical2: null,
      judgeGreat1: null,
      judgeGood1: null,
      judgeFail1: null,
      judgeMiss1: null,
      judgeMiss2: null,
      // Result Screen Judgements
      resCritical1: null,
      resCritical2: null,
      resGreat1: null,
      resGood1: null,
      resFail1: null,
      resMiss1: null,
      resMiss2: null
    };
    let currentPlayer = localStorage.getItem("magsic_player") || "Guest";
    let globalOffset = 0;
    let visualOffset = 0;
    let currentLaneWidth = 200;
    let isLaneCoverEnabled = false;
    let laneCoverHeight = 300;
    let laneCoverSpeedMult = 1;
    let gaugeType = "norma";
    let isAutoPlay = false;
    let isMVLayout = false;
    let laneOpacity = 1;
    let currentSkin = "default";
    let rivalPercent = 90;
    let isRivalShowEnabled = true;
    let scoreDisplayType = "percent";
    let rivalScoreEvents = [];
    let isRivalBarEnabled = true;
    let playerNickname = "";
    let playerBio = "";
    let rivalEventIndex = 0;
    let currentModeIndex = 0;
    let currentDaniIndex = 0;
    let rivalPassedMaxScore = 0;
    let playerIconBase64 = "";
    let isDaniMode = false;
    let currentLayoutType = "default";
    let targetLayoutType = "type-a";
    let LERP_SPEED = 0.15;
    const startScreen = document.getElementById("start-screen");
    const controlsDiv = document.getElementById("controls");
    const songSelectOverlay = document.getElementById("song-select-overlay");
    const resultsOverlay = document.getElementById("results-overlay");
    const calibrationOverlay = document.getElementById("calibration-overlay");
    const playerSelectOverlay = document.getElementById("player-select-overlay");
    const recordsOverlay = document.getElementById("records-overlay");
    const pauseOverlay = document.getElementById("pause-overlay");
    document.getElementById("loading-overlay");
    const shutterOverlay = document.getElementById("shutter-overlay");
    const introOverlay = document.getElementById("intro-overlay");
    const introSongTitle = document.getElementById("intro-song-title");
    const introSongLevel = document.getElementById("intro-song-level");
    let introBGM = null;
    const debugLog = document.getElementById("debug-log");
    const daniSelectOverlay = document.getElementById("dani-select-overlay");
    document.getElementById("dani-list");
    const btnCloseDani = document.getElementById("btn-close-dani");
    const canvas = document.getElementById("game-canvas");
    const ctx = canvas ? canvas.getContext("2d") : null;
    const titleBgVideo = document.getElementById("title-bg-video");
    const logo = document.getElementById("title-logo");
    let HIT_Y = 0;
    let judgementHeightOffset = 200;
    const NOTE_HEIGHT = 15;
    let currentKeyMode = "8key";
    const speedInput = document.getElementById("speed-input");
    const speedDisplay = document.getElementById("speed-display");
    const offsetInput = document.getElementById("offset-input");
    const offsetDisplay = document.getElementById("offset-display");
    const visualOffsetInput = document.getElementById("visual-offset-input");
    const visualOffsetDisplay = document.getElementById("visual-offset-display");
    const judgementHeightInput = document.getElementById("judgement-height-input");
    const judgementHeightDisplay = document.getElementById("judgement-height-display");
    const laneWidthInput = document.getElementById("lane-width-input");
    const laneWidthDisplay = document.getElementById("lane-width-display");
    const laneCoverCheckbox = document.getElementById("lane-cover-checkbox");
    const skinSelect = document.getElementById("skin-select");
    const laneCoverHeightInput = document.getElementById("lane-cover-height-input");
    const laneCoverHeightDisplay = document.getElementById("lane-cover-height-display");
    const laneCoverSpeedInput = document.getElementById("lane-cover-speed-input");
    const laneCoverSpeedDisplay = document.getElementById("lane-cover-speed-display");
    const autoPlayCheckbox = document.getElementById("auto-play-checkbox");
    const assistSelect = document.getElementById("assist-select");
    const randomSelect = document.getElementById("random-select");
    const audioInput = document.getElementById("audio-input");
    const chartInput = document.getElementById("chart-input");
    const laneOpacityInput = document.getElementById("lane-opacity-input");
    const laneOpacityDisplay = document.getElementById("lane-opacity-display");
    const rivalScoreInput = document.getElementById("rival-score-input");
    const rivalScoreDisplay = document.getElementById("rival-score-display");
    const rivalShowCheckbox = document.getElementById("rival-show-checkbox");
    const scoreDisplayTypeSelect = document.getElementById("score-display-type-select");
    const nicknameInput = document.getElementById("nickname-input");
    const bioInput = document.getElementById("bio-input");
    const optIconInput = document.getElementById("opt-icon-input");
    const optIconPreview = document.getElementById("opt-icon-preview");
    const optIconPlaceholder = document.getElementById("opt-icon-placeholder");
    const lobbyPlayerYouIcon = document.getElementById("lobby-player-you-icon");
    const lobbyPlayerYouPlaceholder = document.getElementById("lobby-player-you-placeholder");
    const rivalBarCheckbox = document.getElementById("rival-bar-checkbox");
    const btnGaugeRoll = document.getElementById("btn-gauge-roll");
    const gaugeRollName = document.getElementById("gauge-roll-name");
    const gaugeRollDesc = document.getElementById("gauge-roll-desc");
    const btnCalibrate = document.getElementById("btn-calibrate");
    const btnCancelCalibration = document.getElementById("btn-cancel-calibration");
    const btnSelectSong = document.getElementById("btn-select-song");
    const btnViewRecords = document.getElementById("btn-view-records");
    const btnCloseSelect = document.getElementById("btn-close-select");
    const btnCloseResults = document.getElementById("btn-close-results");
    const btnResume = document.getElementById("btn-resume");
    const btnRetry = document.getElementById("btn-retry");
    const btnQuit = document.getElementById("btn-quit");
    const btnOptionsToggle = document.getElementById("btn-options-toggle");
    const btnCloseOptions = document.getElementById("btn-close-options");
    const btnAddPlayer = document.getElementById("btn-add-player");
    const btnClosePlayer = document.getElementById("btn-close-player");
    const playerDisplay = document.getElementById("player-display");
    const playerDisplayInSelect = document.getElementById("player-display-in-select");
    const btnRandom = document.getElementById("btn-random");
    const btnChart = document.getElementById("btn-chart");
    const btnPauseUI = document.getElementById("btn-pause-ui");
    const playerListDiv = document.getElementById("player-list");
    const newPlayerNameInput = document.getElementById("new-player-name");
    document.getElementById("loading-text");
    const pauseStatusText = document.getElementById("pause-status");
    const calibrationVisual = document.getElementById("calibration-visual");
    const calibrationStatus = document.getElementById("calibration-status");
    const songListDiv = document.getElementById("song-list");
    const checkBtn = btnCalibrate;
    if (!checkBtn) {
      console.error("Critical: btn-calibrate NOT FOUND in DOM on load");
    } else {
      console.log("btn-calibrate found!");
    }
    let titleAnimRequestId = null;
    function startTitleLoop() {
      if (!logo || !startScreen || !titleBgVideo) return;
      if (titleAnimRequestId) return;
      let startTime = performance.now();
      function animLoop(time) {
        if (startScreen.style.display === "none") {
          titleAnimRequestId = null;
          return;
        }
        if (titleBgVideo.paused) {
          titleBgVideo.play().catch((e) => console.log("Video play deferred:", e));
        }
        const elapsed = (time - startTime) / 1e3;
        const scaleFactor = 1 + 0.03 * Math.sin(elapsed * 2);
        logo.style.transform = `scale(${scaleFactor})`;
        titleAnimRequestId = requestAnimationFrame(animLoop);
      }
      titleAnimRequestId = requestAnimationFrame(animLoop);
    }
    function showStartScreen(show) {
      if (!startScreen) return;
      if (show) {
        startScreen.style.display = "flex";
        startTitleLoop();
      } else {
        startScreen.style.display = "none";
      }
    }
    loadSkin();
    if (document.readyState === "complete" || document.readyState === "interactive") {
      showStartScreen(true);
    } else {
      window.addEventListener("load", () => showStartScreen(true));
    }
    let lastNPressTime = 0;
    let isNHolding = false;
    let isNDoubleTapHolding = false;
    let hasAdjustedDuringNHold = false;
    let originalLaneCoverHeight = 0;
    let originalIsLaneCoverEnabled = false;
    const DOUBLE_TAP_WINDOW = 400;
    if (autoPlayCheckbox) {
      autoPlayCheckbox.addEventListener("change", () => {
        isAutoPlay = autoPlayCheckbox.checked;
      });
    }
    const resCombo = document.getElementById("res-combo");
    const resAvg = document.getElementById("res-avg");
    const customResultScreen = document.getElementById("custom-results-screen");
    const valResCritical = document.getElementById("val-res-critical");
    const valResGreat = document.getElementById("val-res-great");
    const valResGood = document.getElementById("val-res-good");
    const valResFail = document.getElementById("val-res-fail");
    const valResMiss = document.getElementById("val-res-miss");
    const valResCombo = document.getElementById("val-res-combo");
    const valResScore = document.getElementById("val-res-score");
    const btnCloseCustomResults = document.getElementById("btn-close-custom-results");
    const imgResCritical = document.getElementById("img-res-critical");
    const imgResGreat = document.getElementById("img-res-great");
    const imgResGood = document.getElementById("img-res-good");
    const imgResFail = document.getElementById("img-res-fail");
    const imgResMiss = document.getElementById("img-res-miss");
    const resultStatusTitle = document.getElementById("result-status-title");
    document.getElementById("score-display");
    let rawScore = 0;
    let lostScore = 0;
    let currentHealth = 0;
    let totalMaxScore = 1;
    let isTrackFailed = false;
    let shutterHeight = 0;
    const layoutRadios = document.getElementsByName("layout-type");
    layoutRadios.forEach((radio) => {
      radio.addEventListener("change", (e) => {
        currentLayoutType = e.target.value;
        console.log("Layout changed to:", currentLayoutType);
        if (currentLayoutType !== "default") {
          targetLayoutType = currentLayoutType;
        }
        resize();
      });
    });
    if (btnPauseUI) {
      btnPauseUI.addEventListener("click", () => {
        console.log("Pause button clicked");
        togglePause();
      });
    }
    if (btnCloseResults) {
      btnCloseResults.addEventListener("click", () => {
        showStartScreen(true);
        controlsDiv.style.display = "block";
        if (controlsDiv.classList.contains("show-options")) controlsDiv.classList.remove("show-options");
        songSelectOverlay.style.display = "none";
      });
    }
    if (btnCloseCustomResults) {
      btnCloseCustomResults.addEventListener("click", () => {
        if (customResultScreen) customResultScreen.style.display = "none";
        stopResultBlinking();
        isTrackFailed = false;
        shutterHeight = 0;
        if (canvas) canvas.style.display = "block";
        if (isBattleSelectMode) {
          if (wsBattle) {
            wsBattle.close();
            wsBattle = null;
          }
          isBattleSelectMode = false;
          if (songSelectOverlay) {
            songSelectOverlay.style.display = "none";
            songSelectOverlay.classList.remove("battle-mode");
          }
          openBattleLobby();
          return;
        }
        openSongSelect();
      });
    }
    let selectedModeFilter = "6key";
    const menuOverlay = document.getElementById("menu-overlay");
    document.addEventListener("keydown", (e) => {
      if (menuOverlay && (menuOverlay.style.display === "flex" || menuOverlay.style.display === "block")) {
        const activeEl = document.activeElement;
        const isInputField = activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA");
        if (isInputField) return;
        const keyLower = e.key.toLowerCase();
        if (keyLower === "s" || e.key === "ArrowLeft") {
          e.preventDefault();
          currentModeIndex = (currentModeIndex - 1 + PLAY_MODES_INFO.length) % PLAY_MODES_INFO.length;
          renderModeCarousel();
          playSE("se_select");
        } else if (keyLower === "l" || e.key === "ArrowRight") {
          e.preventDefault();
          currentModeIndex = (currentModeIndex + 1) % PLAY_MODES_INFO.length;
          renderModeCarousel();
          playSE("se_select");
        } else if (keyLower === "d" || keyLower === "j" || e.key === "Enter") {
          e.preventDefault();
          executePlayModeAction();
        } else if (e.key === "Escape") {
          e.preventDefault();
          menuOverlay.style.display = "none";
          showStartScreen(true);
          playSE("se_back");
        }
      }
    });
    document.addEventListener("keydown", (e) => {
      if (daniSelectOverlay && (daniSelectOverlay.style.display === "flex" || daniSelectOverlay.style.display === "block")) {
        const activeEl = document.activeElement;
        const isInputField = activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA");
        if (isInputField) return;
        const keyLower = e.key.toLowerCase();
        if (keyLower === "d" || e.key === "ArrowUp") {
          e.preventDefault();
          currentDaniIndex = (currentDaniIndex - 1 + DANI_COURSES_DUMMY.length) % DANI_COURSES_DUMMY.length;
          renderDaniScrollList();
          playSE("se_select");
        } else if (keyLower === "k" || e.key === "ArrowDown") {
          e.preventDefault();
          currentDaniIndex = (currentDaniIndex + 1) % DANI_COURSES_DUMMY.length;
          renderDaniScrollList();
          playSE("se_select");
        } else if (keyLower === "f" || keyLower === "j" || e.key === "Enter") {
          e.preventDefault();
          const activeCourse = DANI_COURSES_DUMMY[currentDaniIndex];
          if (isDaniLocked(activeCourse.title)) {
            playSE("se_cancel");
            alert(`「${activeCourse.title}」はロックされています。1つ前の段位をクリアしてください。`);
          } else {
            playSE("se_decide");
            const confirmClear = confirm(`このダミー段位「${activeCourse.title}」に合格（クリア）したことにしますか？
（クリアすると曲名が公開され、上位段位が解放されます）`);
            if (confirmClear) {
              setDaniCleared(activeCourse.title);
              renderDaniScrollList();
              alert(`「${activeCourse.title}」をクリアしました！`);
            } else {
              alert(`「${activeCourse.title}」コースは近々実装予定です。`);
            }
          }
        } else if (e.key === "Escape") {
          e.preventDefault();
          playSE("se_cancel");
          if (daniSelectOverlay) daniSelectOverlay.style.display = "none";
          if (menuOverlay) {
            menuOverlay.style.display = "flex";
            renderModeCarousel();
          }
        }
      }
    });
    document.addEventListener("keydown", (e) => {
      if (battleLobbyOverlay && (battleLobbyOverlay.style.display === "flex" || battleLobbyOverlay.style.display === "block")) {
        const activeEl = document.activeElement;
        const isInputField = activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA");
        if (isInputField) return;
        const keyLower = e.key.toLowerCase();
        if (keyLower === "enter" || keyLower === "f" || keyLower === "j") {
          e.preventDefault();
          if (isMatched) {
            playSE("se_decide");
            enterBattleSelectScreen();
          } else {
            playSE("se_decide");
            triggerMatchFound();
            setTimeout(() => {
              enterBattleSelectScreen();
            }, 800);
          }
        } else if (e.key === "Escape") {
          e.preventDefault();
          playSE("se_cancel");
          if (matchingTimer) clearTimeout(matchingTimer);
          if (battleLobbyOverlay) battleLobbyOverlay.style.display = "none";
          if (menuOverlay) {
            menuOverlay.style.display = "flex";
            renderModeCarousel();
          }
        }
      }
    });
    if (startScreen) {
      startScreen.addEventListener("click", () => {
        try {
          initAudio();
        } catch (e) {
          console.error("Audio Init Error:", e);
        }
        playSE("se_start");
        currentModeIndex = 0;
        renderModeCarousel();
        if (menuOverlay) {
          menuOverlay.style.display = "flex";
        }
      });
    }
    function openSongSelectForReal() {
      console.log("openSongSelectForReal called");
      showStartScreen(false);
      if (controlsDiv) {
        controlsDiv.style.display = "block";
        controlsDiv.classList.remove("show-options");
      }
      if (menuOverlay) {
        menuOverlay.style.display = "none";
      }
      if (songSelectOverlay) {
        songSelectOverlay.style.display = "flex";
        if (isBattleSelectMode) {
          songSelectOverlay.classList.add("battle-mode");
        } else {
          songSelectOverlay.classList.remove("battle-mode");
        }
        console.log("songSelectOverlay display set to FLEX");
      } else {
        console.error("songSelectOverlay NOT FOUND");
      }
      if (!document.getElementById("mode-tabs-container")) {
        console.log("Initializing Mode Tabs");
        initModeTabs();
      }
      console.log("Loading Song List...");
      loadSongList();
    }
    function openSongSelect() {
      performImageShutterTransition(() => {
        openSongSelectForReal();
      }).then(() => {
        playBGM("bgm_select");
      });
    }
    async function performImageShutterTransition(midAction) {
      if (!shutterOverlay) {
        await midAction();
        return;
      }
      playSE("se_start");
      shutterOverlay.style.transition = "transform 0.6s cubic-bezier(0.4, 0, 0.2, 1)";
      shutterOverlay.classList.remove("opened-right");
      shutterOverlay.classList.add("closed");
      await new Promise((r) => setTimeout(r, 600));
      await midAction();
      await new Promise((r) => setTimeout(r, 200));
      shutterOverlay.classList.remove("closed");
      shutterOverlay.classList.add("opened-right");
      await new Promise((r) => setTimeout(r, 600));
      shutterOverlay.style.transition = "none";
      shutterOverlay.classList.remove("opened-right");
      void shutterOverlay.offsetWidth;
      shutterOverlay.style.transition = "";
    }
    function initModeTabs() {
      const container = document.createElement("div");
      container.id = "mode-tabs-container";
      container.style.display = "flex";
      container.style.justifyContent = "center";
      container.style.gap = "10px";
      container.style.marginBottom = "20px";
      container.style.padding = "10px";
      container.style.background = "#222";
      container.style.borderRadius = "8px";
      ["6key"].forEach((mode) => {
        const btn = document.createElement("button");
        btn.textContent = mode.toUpperCase();
        btn.className = "mode-tab-btn";
        btn.style.padding = "10px 20px";
        btn.style.cursor = "pointer";
        btn.style.border = "2px solid #555";
        btn.style.background = mode === selectedModeFilter ? "#00bcd4" : "#333";
        btn.style.color = "white";
        btn.style.fontWeight = "bold";
        btn.onclick = () => {
          selectedModeFilter = mode;
          loadSongList();
          updateModeTabsUI();
        };
        container.appendChild(btn);
      });
      songSelectOverlay.insertBefore(container, songListDiv);
    }
    const recordsBody = document.getElementById("records-body");
    const btnCloseRecords = document.getElementById("btn-close-records");
    async function openRecords() {
      showStartScreen(false);
      if (recordsOverlay) recordsOverlay.style.display = "flex";
      await fetchScoreHistory();
    }
    let bestChart = null;
    async function fetchScoreHistory() {
      if (!recordsBody) return;
      recordsBody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;">Loading...</td></tr>';
      try {
        const response = await fetch("/api/scores");
        if (!response.ok) throw new Error("Failed to fetch");
        const data = await response.json();
        recordsBody.innerHTML = "";
        const bestRecords = [];
        Object.keys(data).forEach((songId) => {
          const songScores = data[songId];
          if (Array.isArray(songScores) && songScores.length > 0) {
            let best = songScores[0];
            songScores.forEach((s) => {
              if ((s.score || 0) > (best.score || 0)) {
                best = s;
              }
            });
            best._songId = songId;
            bestRecords.push(best);
          }
        });
        renderBestChart(bestRecords);
        bestRecords.sort((a, b) => (b.score || 0) - (a.score || 0));
        if (bestRecords.length === 0) {
          recordsBody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;">No records yet.</td></tr>';
          return;
        }
        bestRecords.forEach((s) => {
          const tr = document.createElement("tr");
          tr.style.borderBottom = "1px solid #333";
          tr.className = "record-row";
          const songLabel = s._songId.split("/").pop() || s._songId;
          const acc = s.percentage ? s.percentage + "%" : "-";
          const isFailed = s.isClear === false || s.rank === "F";
          const resultText = isFailed ? "FAILED" : "CLEAR";
          const resultColor = isFailed ? "#f44" : "#0f0";
          tr.innerHTML = `
                    <td style="padding:12px 10px;">${songLabel}</td>
                    <td style="padding:12px 10px; color:${resultColor}; font-weight:bold;">${resultText}</td>
                    <td style="padding:12px 10px; font-weight:bold; color:${s.rank === "F" ? "#f44" : "#00ffff"};">${s.rank}</td>
                    <td style="padding:12px 10px;">${(s.score || 0).toLocaleString()}</td>
                    <td style="padding:12px 10px; font-size:0.9em;">${acc}</td>
                    <td style="padding:12px 10px; font-size:0.9em; color:#aaa;">${s.modifiers || "None"}</td>
                `;
          recordsBody.appendChild(tr);
        });
      } catch (e) {
        console.error(e);
        recordsBody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:#f44;">Error loading records.</td></tr>';
      }
    }
    function renderBestChart(bestRecords) {
      const ChartLib = window.Chart;
      if (!ChartLib) return;
      const sortedBests = [...bestRecords].sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 15);
      const labels = sortedBests.map((s) => s._songId.split("/").pop() || s._songId);
      const values = sortedBests.map((s) => s.score);
      if (bestChart) bestChart.destroy();
      bestChart = new ChartLib(document.getElementById("chart-best"), {
        type: "bar",
        data: {
          labels,
          datasets: [{
            label: "Personal Best",
            data: values,
            backgroundColor: "#00ffff",
            borderRadius: 5
          }]
        },
        options: {
          indexAxis: "y",
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: {
              beginAtZero: true,
              grid: { color: "#333" },
              ticks: { color: "#aaa" },
              max: 1e6
            },
            y: {
              grid: { display: false },
              ticks: { color: "#aaa", font: { size: 12 } }
            }
          },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (context) => `Score: ${context.raw.toLocaleString()}`
              }
            }
          }
        }
      });
    }
    if (btnViewRecords) {
      btnViewRecords.addEventListener("click", openRecords);
    }
    if (btnCloseRecords) {
      btnCloseRecords.addEventListener("click", () => {
        if (recordsOverlay) recordsOverlay.style.display = "none";
        if (startScreen) startScreen.style.display = "flex";
      });
    }
    if (btnSelectSong) {
      btnSelectSong.addEventListener("click", openSongSelect);
    }
    currentPlayer = localStorage.getItem("magsic_player") || "Guest";
    if (playerDisplay) playerDisplay.textContent = `Player: ${currentPlayer} ▼`;
    if (playerDisplayInSelect) playerDisplayInSelect.textContent = `Player: ${currentPlayer} ▼`;
    const GAUGE_ROLL_ORDER = ["norma_easy", "norma", "life", "life_hard", "life_ex", "sudden_death"];
    const GAUGE_ROLL_INFO = {
      norma_easy: { name: "NORMA-EASY", desc: "65%スタート。perfect +1%、great/good +0.5%、BAD -1%、MISS -3%。65%以上でクリア。" },
      norma: { name: "NORMA", desc: "80%スタート。perfect +0.5%、great/good +0.2%、BAD -2%、MISS -6%。80%以上でクリア。" },
      life: { name: "LIFE", desc: "100%スタート。perfect +0.5%、great/good +0.2%、BAD -6%、MISS -8%。0%で終了、完走でクリア。" },
      life_hard: { name: "LIFE HARD", desc: "100%スタート。perfect +0.5%、great/good +0.2%、BAD -10%、MISS -15%。0%で終了、完走でクリア。" },
      life_ex: { name: "LIFE EX", desc: "100%スタート。perfect +0.5%、great/good +0.2%、BAD -25%、MISS -50%。0%で終了、完走でクリア。" },
      sudden_death: { name: "即死 (SUDDEN DEATH)", desc: "100%スタート。BADまたはMISSを1回でも出すと即死終了、完走でクリア。" }
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
    const PLAY_MODES_INFO = [
      { id: "single", title: "SINGLE", desc: "今までの普通のプレイをおこないます。", disabled: false },
      { id: "battle", title: "バトル", desc: "オンラインで人とマッチし戦います。（マッチ準備室デモ）", disabled: false },
      { id: "express", title: "EXPRESS", desc: "決められたルールやお題の曲のミッションを達成していき、クリアを目指すアドベンチャーモード。（近々実装予定）", disabled: true },
      { id: "dani", title: "段位認定", desc: "実力測定用コースを連続プレイします。（形だけ実装済み）", disabled: false },
      { id: "training", title: "トレーニング", desc: "しばらくは実装しません。", disabled: true }
    ];
    const DANI_COURSES_DUMMY = [
      { title: "海伝", level: "★10+", songs: ["Sinking Feeling", "Forbidden Ritual", "Antigravity", "漁火"], color: "#ff3d00" },
      { title: "河伝", level: "★10", songs: ["Magusic Flow", "Cyber Stream", "Undercurrent", "Ceviche"], color: "#ff9100" },
      { title: "水伝", level: "★9+", songs: ["Hydro Rhythm", "Splash Wave", "Raindrop Drop", "Ocean Breeze"], color: "#2979ff" },
      { title: "Ⅶ", level: "★9", songs: ["Seven Seals", "Lucky Strike", "Rainbow Road", "Seventh Heaven"], color: "#e040fb" },
      { title: "Ⅵ", level: "★8+", songs: ["Hexa Force", "Six Degrees", "Prism Dance", "Hexagon"], color: "#00e5ff" },
      { title: "Ⅴ", level: "★8", songs: ["Pentagram", "High Five", "Vivid Lights", "Starry Sky"], color: "#00e676" },
      { title: "Ⅳ", level: "★7", songs: ["Square One", "Crossroad", "Windmill", "Gravity Fall"], color: "#ffea00" },
      { title: "Ⅲ", level: "★6", songs: ["Triangle", "Triple Play", "Three Wishes", "Trio"], color: "#ff9100" },
      { title: "Ⅱ", level: "★5", songs: ["Dual Core", "Double Time", "Echoes", "Binary Star"], color: "#ff5722" },
      { title: "Ⅰ", level: "★4", songs: ["First Step", "Beginning", "Tutorial", "Introduction"], color: "#9e9e9e" }
    ];
    function isDaniCleared(courseTitle) {
      const key = `magsic_dani_cleared_${currentPlayer}`;
      try {
        const saved = localStorage.getItem(key);
        if (saved) {
          const clearedList = JSON.parse(saved);
          return Array.isArray(clearedList) && clearedList.includes(courseTitle);
        }
      } catch (e) {
        console.error(e);
      }
      return false;
    }
    function isDaniLocked(courseTitle) {
      if (courseTitle === "海伝") return !isDaniCleared("河伝");
      if (courseTitle === "河伝") return !isDaniCleared("水伝");
      if (courseTitle === "水伝") return !isDaniCleared("Ⅶ");
      return false;
    }
    function setDaniCleared(courseTitle) {
      const key = `magsic_dani_cleared_${currentPlayer}`;
      try {
        const saved = localStorage.getItem(key);
        let clearedList = saved ? JSON.parse(saved) : [];
        if (!Array.isArray(clearedList)) clearedList = [];
        if (!clearedList.includes(courseTitle)) {
          clearedList.push(courseTitle);
          localStorage.setItem(key, JSON.stringify(clearedList));
        }
      } catch (e) {
        console.error(e);
      }
    }
    const modeCardsWrapper = document.getElementById("mode-cards-wrapper");
    const modeDescTitle = document.getElementById("mode-desc-title");
    const modeDescText = document.getElementById("mode-desc-text");
    function renderModeCarousel() {
      if (!modeCardsWrapper) return;
      modeCardsWrapper.innerHTML = "";
      PLAY_MODES_INFO.forEach((mode, idx) => {
        const card = document.createElement("div");
        card.className = "mode-card";
        if (idx === currentModeIndex) card.classList.add("active");
        if (mode.disabled) card.classList.add("disabled");
        card.innerHTML = `<div>${mode.title}</div>`;
        card.addEventListener("click", () => {
          currentModeIndex = idx;
          renderModeCarousel();
          playSE("se_select");
        });
        modeCardsWrapper.appendChild(card);
      });
      const activeMode = PLAY_MODES_INFO[currentModeIndex];
      if (modeDescTitle) modeDescTitle.textContent = activeMode.title;
      if (modeDescText) modeDescText.textContent = activeMode.desc;
    }
    const daniScrollList = document.getElementById("dani-scroll-list");
    const daniInfoTitle = document.getElementById("dani-info-title");
    const daniInfoLevel = document.getElementById("dani-info-level");
    const daniInfoSongs = document.getElementById("dani-info-songs");
    function renderDaniScrollList() {
      if (!daniScrollList) return;
      daniScrollList.innerHTML = "";
      DANI_COURSES_DUMMY.forEach((course, idx) => {
        const card = document.createElement("div");
        card.className = "dani-card";
        if (idx === currentDaniIndex) card.classList.add("active");
        const locked = isDaniLocked(course.title);
        const cleared = isDaniCleared(course.title);
        let titleText = course.title;
        let levelText = course.level;
        if (locked) {
          titleText += " 🔒";
          card.style.opacity = "0.4";
        } else if (cleared) {
          card.classList.add("cleared");
        }
        card.innerHTML = `
                <span style="font-weight: bold; border-left: 4px solid ${course.color}; padding-left: 10px;">${titleText}</span>
                <span style="font-size: 0.85em; color: ${course.color}; font-family: monospace; font-weight: bold;">${levelText}</span>
            `;
        card.addEventListener("click", () => {
          currentDaniIndex = idx;
          renderDaniScrollList();
          playSE("se_select");
        });
        daniScrollList.appendChild(card);
      });
      const activeEl = daniScrollList.children[currentDaniIndex];
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
      const activeCourse = DANI_COURSES_DUMMY[currentDaniIndex];
      const isLocked = isDaniLocked(activeCourse.title);
      const isCleared = isDaniCleared(activeCourse.title);
      if (daniInfoTitle) {
        daniInfoTitle.textContent = activeCourse.title;
        daniInfoTitle.style.color = activeCourse.color;
      }
      if (daniInfoLevel) {
        daniInfoLevel.textContent = activeCourse.level;
        daniInfoLevel.style.color = activeCourse.color;
      }
      if (daniInfoSongs) {
        daniInfoSongs.innerHTML = "";
        if (isLocked) {
          const lockDiv = document.createElement("div");
          lockDiv.style.cssText = "flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; color: rgba(255,255,255,0.4); text-align: center; gap: 15px; border: 2px dashed rgba(255,61,0,0.2); border-radius: 12px; padding: 30px; box-sizing: border-box; height: 100%;";
          lockDiv.innerHTML = `
                    <span style="font-size: 3em; filter: drop-shadow(0 0 10px rgba(255,61,0,0.3));">🔒</span>
                    <span style="font-weight: bold; font-size: 1.2em; color: #ff3d00; letter-spacing: 1px;">ロックされています</span>
                    <span style="font-size: 0.85em; line-height: 1.6; color: rgba(255,255,255,0.5);">このコースに挑戦するには、<br>1つ前の段位をクリアする必要があります。</span>
                `;
          daniInfoSongs.appendChild(lockDiv);
        } else {
          activeCourse.songs.forEach((song, sIdx) => {
            const songDiv = document.createElement("div");
            songDiv.style.cssText = "background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); padding: 12px 20px; border-radius: 8px; font-family: sans-serif; display: flex; align-items: center; justify-content: space-between;";
            const displaySongName = isCleared ? song : "？？？";
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
    const battleLobbyOverlay = document.getElementById("battle-lobby-overlay");
    const opponentIcon = document.getElementById("opponent-icon");
    const opponentName = document.getElementById("opponent-name");
    const opponentStatus = document.getElementById("opponent-status");
    const matchingStatusText = document.getElementById("matching-status-text");
    const btnLobbyBypass = document.getElementById("btn-lobby-bypass");
    const btnCloseLobby = document.getElementById("btn-close-lobby");
    let isMatched = false;
    let isBattleSelectMode = false;
    let wsBattle = null;
    let myBattleRole = null;
    let hasOpponentFinished = false;
    let opponentResultData = null;
    function connectBattleSocket() {
      if (wsBattle) {
        wsBattle.close();
        wsBattle = null;
      }
      const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${wsProtocol}//${window.location.host}`;
      wsBattle = new WebSocket(wsUrl);
      myBattleRole = null;
      hasOpponentFinished = false;
      opponentResultData = null;
      wsBattle.onopen = () => {
        console.log("[WS] Connected to battle transit");
        wsBattle?.send(JSON.stringify({
          type: "join",
          nickname: playerNickname || "Guest",
          icon: playerIconBase64 || ""
        }));
      };
      wsBattle.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleBattleSocketMessage(data);
        } catch (e) {
          console.error("[WS] Message parse error:", e);
        }
      };
      wsBattle.onerror = (e) => {
        console.error("[WS] Socket error:", e);
      };
      wsBattle.onclose = () => {
        console.log("[WS] Socket closed");
      };
    }
    function handleBattleSocketMessage(data) {
      switch (data.type) {
        case "waiting":
          isMatched = false;
          if (opponentIcon) {
            opponentIcon.textContent = "❓";
            opponentIcon.style.opacity = "0.3";
          }
          if (opponentName) {
            opponentName.textContent = "SEARCHING...";
            opponentName.style.color = "#666";
          }
          if (opponentStatus) {
            opponentStatus.textContent = "WAITING";
            opponentStatus.style.color = "#555";
            opponentStatus.style.background = "rgba(255,255,255,0.05)";
          }
          if (matchingStatusText) {
            matchingStatusText.textContent = "WAITING FOR OPPONENT...";
            matchingStatusText.style.color = "#ff007f";
          }
          break;
        case "matched":
          isMatched = true;
          myBattleRole = data.role;
          playSE("se_decide");
          if (opponentIcon) {
            if (data.opponent.icon) {
              opponentIcon.innerHTML = `<img src="${data.opponent.icon}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
            } else {
              opponentIcon.textContent = "👽";
            }
            opponentIcon.style.opacity = "1.0";
          }
          if (opponentName) {
            opponentName.textContent = data.opponent.nickname;
            opponentName.style.color = "#ff007f";
          }
          if (opponentStatus) {
            opponentStatus.textContent = "READY";
            opponentStatus.style.color = "#fff";
            opponentStatus.style.background = "rgba(255,0,127,0.3)";
          }
          if (matchingStatusText) {
            if (myBattleRole === "p1") {
              matchingStatusText.textContent = "MATCH FOUND! PRESS ENTER TO CHOOSE SONG";
            } else {
              matchingStatusText.textContent = "MATCH FOUND! WAITING FOR HOST TO CHOOSE SONG";
            }
            matchingStatusText.style.color = "#00ffff";
          }
          break;
        case "opponent_left":
          alert("対戦相手が退出しました。");
          isMatched = false;
          if (isPlaying) {
            isPlaying = false;
            if (wsBattle) wsBattle.close();
            wsBattle = null;
            if (canvas) canvas.style.display = "block";
            if (songSelectOverlay) {
              songSelectOverlay.style.display = "none";
              songSelectOverlay.classList.remove("battle-mode");
            }
            if (menuOverlay) {
              menuOverlay.style.display = "flex";
              renderModeCarousel();
            }
          } else {
            exitBattleSelectAndReturnToLobby();
          }
          break;
        case "cursor_move":
          if (myBattleRole === "p2" && songSelectOverlay && songSelectOverlay.style.display !== "none") {
            selectedSongIndex = data.index;
            renderSongSelectInternal();
          }
          break;
        case "diff_change":
          if (myBattleRole === "p2" && songSelectOverlay && songSelectOverlay.style.display !== "none") {
            selectedDiffIndex = data.index;
            renderRightColumn();
          }
          break;
        case "song_decide":
          if (myBattleRole === "p2") {
            playSE("se_decide");
            isBattleSelectMode = true;
            if (songSelectOverlay) {
              songSelectOverlay.style.display = "none";
            }
            loadSong(data.songFolder, data.chartName, data.audioName);
          }
          break;
        case "play_state":
          if (isPlaying) {
            rivalPassedMaxScore = data.score;
          }
          break;
        case "results":
          hasOpponentFinished = true;
          opponentResultData = data;
          if (!isPlaying && customResultScreen && customResultScreen.style.display === "flex") {
            refreshBattleWinnerDisplay();
          }
          break;
      }
    }
    function exitBattleSelectAndReturnToLobby() {
      isBattleSelectMode = false;
      if (songSelectOverlay) {
        songSelectOverlay.style.display = "none";
        songSelectOverlay.classList.remove("battle-mode");
      }
      openBattleLobby();
    }
    function openBattleLobby() {
      isMatched = false;
      if (battleLobbyOverlay) battleLobbyOverlay.style.display = "flex";
      updateIconElements();
      connectBattleSocket();
    }
    function triggerMatchFound() {
      if (isMatched) return;
      isMatched = true;
      myBattleRole = "p1";
      playSE("se_decide");
      if (opponentIcon) {
        opponentIcon.textContent = "😈";
        opponentIcon.style.opacity = "1.0";
      }
      if (opponentName) {
        opponentName.textContent = "CPU_Rival_99";
        opponentName.style.color = "#ff007f";
      }
      if (opponentStatus) {
        opponentStatus.textContent = "READY";
        opponentStatus.style.color = "#fff";
        opponentStatus.style.background = "rgba(255,0,127,0.3)";
      }
      if (matchingStatusText) {
        matchingStatusText.textContent = "MATCH FOUND (TEST)! PRESS ENTER TO START";
        matchingStatusText.style.color = "#00ffff";
      }
    }
    function enterBattleSelectScreen() {
      if (matchingTimer) clearTimeout(matchingTimer);
      if (battleLobbyOverlay) battleLobbyOverlay.style.display = "none";
      isBattleSelectMode = true;
      performImageShutterTransition(() => {
        showStartScreen(false);
        if (songSelectOverlay) {
          songSelectOverlay.style.display = "flex";
          songSelectOverlay.classList.add("battle-mode");
        }
        loadSongList();
      }).then(() => {
        playBGM("bgm_select");
      });
    }
    function broadcastPlayState() {
      if (isBattleSelectMode && wsBattle && wsBattle.readyState === WebSocket.OPEN) {
        const currentRatio = totalMaxScore > 0 ? (totalMaxScore - lostScore) / totalMaxScore : 0;
        const clearRate = currentRatio * 100;
        const currentScore = Math.floor(currentRatio * 1e6);
        wsBattle.send(JSON.stringify({
          type: "play_state",
          score: currentScore,
          health: currentHealth,
          combo,
          clearRate
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
          resultStatusTitle.style.color = "#ffd700";
        } else {
          resultStatusTitle.textContent = "YOU LOSE... 😢";
          resultStatusTitle.style.color = "#ff3d00";
        }
      }
    }
    function executePlayModeAction() {
      const activeMode = PLAY_MODES_INFO[currentModeIndex];
      playSE("se_decide");
      if (activeMode.id === "single") {
        if (menuOverlay) menuOverlay.style.display = "none";
        performImageShutterTransition(() => {
          openSongSelectForReal();
        }).then(() => {
          playBGM("bgm_select");
        });
      } else if (activeMode.id === "battle") {
        if (menuOverlay) menuOverlay.style.display = "none";
        performImageShutterTransition(() => {
          showStartScreen(false);
          openBattleLobby();
        });
      } else if (activeMode.id === "dani") {
        if (menuOverlay) menuOverlay.style.display = "none";
        performImageShutterTransition(() => {
          showStartScreen(false);
          if (daniSelectOverlay) daniSelectOverlay.style.display = "flex";
          renderDaniScrollList();
        }).then(() => {
          playBGM("bgm_select");
        });
      } else {
        alert(`「${activeMode.title}」モードは現在開発中（もしくは実装予定なし）です。`);
      }
    }
    function updateIconElements() {
      if (playerIconBase64) {
        if (optIconPreview) {
          optIconPreview.src = playerIconBase64;
          optIconPreview.style.display = "block";
        }
        if (optIconPlaceholder) {
          optIconPlaceholder.style.display = "none";
        }
        if (lobbyPlayerYouIcon) {
          lobbyPlayerYouIcon.src = playerIconBase64;
          lobbyPlayerYouIcon.style.display = "block";
        }
        if (lobbyPlayerYouPlaceholder) {
          lobbyPlayerYouPlaceholder.style.display = "none";
        }
      } else {
        if (optIconPreview) {
          optIconPreview.style.display = "none";
        }
        if (optIconPlaceholder) {
          optIconPlaceholder.style.display = "block";
        }
        if (lobbyPlayerYouIcon) {
          lobbyPlayerYouIcon.style.display = "none";
        }
        if (lobbyPlayerYouPlaceholder) {
          lobbyPlayerYouPlaceholder.style.display = "block";
        }
      }
    }
    function cropAndSaveIcon(file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas2 = document.createElement("canvas");
          canvas2.width = 128;
          canvas2.height = 128;
          const ctx2 = canvas2.getContext("2d");
          if (ctx2) {
            const size = Math.min(img.width, img.height);
            const sourceX = (img.width - size) / 2;
            const sourceY = (img.height - size) / 2;
            ctx2.drawImage(img, sourceX, sourceY, size, size, 0, 0, 128, 128);
            playerIconBase64 = canvas2.toDataURL("image/png");
            updateIconElements();
            savePlayerSettings();
          }
        };
        img.src = event.target?.result;
      };
      reader.readAsDataURL(file);
    }
    if (optIconInput) {
      optIconInput.addEventListener("change", (e) => {
        const file = e.target.files?.[0];
        if (file) {
          cropAndSaveIcon(file);
        }
      });
    }
    function loadPlayerSettings() {
      const key = `magsic_settings_${currentPlayer}`;
      try {
        const saved = localStorage.getItem(key);
        if (saved) {
          const settings = JSON.parse(saved);
          if (settings.speed) {
            const multiplier = parseFloat(settings.speed);
            if (!isNaN(multiplier)) {
              currentNoteSpeed = BASE_NOTE_SPEED * multiplier;
              if (speedInput) speedInput.value = multiplier.toString();
              if (speedDisplay) speedDisplay.textContent = multiplier.toFixed(1);
            }
          }
          if (settings.offset !== void 0) {
            const off = parseInt(settings.offset);
            if (!isNaN(off)) {
              globalOffset = off;
              if (offsetInput) offsetInput.value = off.toString();
              if (offsetDisplay) offsetDisplay.textContent = off.toString();
            }
          }
          if (settings.visualOffset !== void 0) {
            visualOffset = parseInt(settings.visualOffset);
            if (visualOffsetInput) visualOffsetInput.value = visualOffset.toString();
            if (visualOffsetDisplay) visualOffsetDisplay.textContent = visualOffset.toString();
          }
          if (settings.laneWidth !== void 0) {
            currentLaneWidth = parseInt(settings.laneWidth) || 100;
            if (laneWidthInput) laneWidthInput.value = currentLaneWidth.toString();
            if (laneWidthDisplay) laneWidthDisplay.textContent = currentLaneWidth.toString();
          }
          if (settings.laneCover !== void 0) {
            isLaneCoverEnabled = !!settings.laneCover.enabled;
            if (laneCoverCheckbox) laneCoverCheckbox.checked = isLaneCoverEnabled;
            laneCoverHeight = parseInt(settings.laneCover.height) || 300;
            if (laneCoverHeightInput) laneCoverHeightInput.value = laneCoverHeight.toString();
            if (laneCoverHeightDisplay) laneCoverHeightDisplay.textContent = laneCoverHeight.toString();
            laneCoverSpeedMult = parseFloat(settings.laneCover.speed) || 1;
            if (laneCoverSpeedInput) laneCoverSpeedInput.value = laneCoverSpeedMult.toString();
            if (laneCoverSpeedDisplay) laneCoverSpeedDisplay.textContent = laneCoverSpeedMult.toFixed(1);
          }
          if (settings.laneOpacity !== void 0) {
            laneOpacity = parseFloat(settings.laneOpacity);
            if (laneOpacityInput) laneOpacityInput.value = (laneOpacity * 100).toString();
            if (laneOpacityDisplay) laneOpacityDisplay.textContent = (laneOpacity * 100).toString();
          }
          if (settings.judgementHeight !== void 0) {
            judgementHeightOffset = parseInt(settings.judgementHeight);
            if (judgementHeightInput) judgementHeightInput.value = judgementHeightOffset.toString();
            if (judgementHeightDisplay) judgementHeightDisplay.textContent = judgementHeightOffset.toString();
          }
          if (settings.currentSkin !== void 0) {
            currentSkin = settings.currentSkin;
            if (skinSelect) skinSelect.value = currentSkin;
          }
          if (settings.rivalPercent !== void 0) {
            rivalPercent = parseInt(settings.rivalPercent);
            if (rivalScoreInput) rivalScoreInput.value = rivalPercent.toString();
            if (rivalScoreDisplay) rivalScoreDisplay.textContent = rivalPercent.toString();
          }
          if (settings.isRivalShowEnabled !== void 0) {
            isRivalShowEnabled = !!settings.isRivalShowEnabled;
            if (rivalShowCheckbox) rivalShowCheckbox.checked = isRivalShowEnabled;
          }
          if (settings.scoreDisplayType !== void 0) {
            scoreDisplayType = settings.scoreDisplayType;
            if (scoreDisplayTypeSelect) scoreDisplayTypeSelect.value = scoreDisplayType;
          }
          if (settings.isRivalBarEnabled !== void 0) {
            isRivalBarEnabled = !!settings.isRivalBarEnabled;
            if (rivalBarCheckbox) rivalBarCheckbox.checked = isRivalBarEnabled;
          }
          if (settings.playerNickname !== void 0) {
            playerNickname = settings.playerNickname;
            if (nicknameInput) nicknameInput.value = playerNickname;
          } else {
            playerNickname = "";
            if (nicknameInput) nicknameInput.value = "";
          }
          if (settings.playerBio !== void 0) {
            playerBio = settings.playerBio;
            if (bioInput) bioInput.value = playerBio;
          } else {
            playerBio = "";
            if (bioInput) bioInput.value = "";
          }
          if (settings.icon !== void 0) {
            playerIconBase64 = settings.icon;
          } else {
            playerIconBase64 = "";
          }
          updateIconElements();
          if (settings.gaugeType !== void 0) {
            gaugeType = settings.gaugeType;
          } else {
            gaugeType = "norma";
          }
          updateGaugeDisplay();
          resize();
        } else {
          currentNoteSpeed = BASE_NOTE_SPEED * 2.5;
          if (speedInput) speedInput.value = "2.5";
          if (speedDisplay) speedDisplay.textContent = "2.5";
          globalOffset = 0;
          if (offsetInput) offsetInput.value = "0";
          if (offsetDisplay) offsetDisplay.textContent = "0";
          visualOffset = 0;
          if (visualOffsetInput) visualOffsetInput.value = "0";
          if (visualOffsetDisplay) visualOffsetDisplay.textContent = "0";
          rivalPercent = 90;
          if (rivalScoreInput) rivalScoreInput.value = "90";
          if (rivalScoreDisplay) rivalScoreDisplay.textContent = "90";
          isRivalShowEnabled = true;
          if (rivalShowCheckbox) rivalShowCheckbox.checked = true;
          scoreDisplayType = "percent";
          if (scoreDisplayTypeSelect) scoreDisplayTypeSelect.value = "percent";
          isRivalBarEnabled = true;
          if (rivalBarCheckbox) rivalBarCheckbox.checked = true;
          playerNickname = "";
          if (nicknameInput) nicknameInput.value = "";
          playerBio = "";
          if (bioInput) bioInput.value = "";
          playerIconBase64 = "";
          updateIconElements();
          gaugeType = "norma";
          updateGaugeDisplay();
        }
      } catch (e) {
        console.error("Failed to load settings", e);
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
        laneOpacity,
        judgementHeight: judgementHeightOffset,
        currentSkin,
        rivalPercent,
        isRivalShowEnabled,
        scoreDisplayType,
        isRivalBarEnabled,
        playerNickname,
        playerBio,
        gaugeType,
        icon: playerIconBase64
      };
      localStorage.setItem(key, JSON.stringify(settings));
    }
    loadPlayerSettings();
    function updatePlayerList() {
      if (!playerListDiv) return;
      playerListDiv.innerHTML = "";
      let players = JSON.parse(localStorage.getItem("magsic_players_list") || '["Guest"]');
      players.forEach((name) => {
        const div = document.createElement("div");
        div.textContent = name;
        div.style.padding = "10px";
        div.style.background = "#333";
        div.style.color = "white";
        div.style.cursor = "pointer";
        div.style.border = "1px solid #555";
        if (name === currentPlayer) {
          div.style.background = "#00bcd4";
          div.style.fontWeight = "bold";
        }
        div.onclick = (e) => {
          e.stopPropagation();
          playSE("se_decide");
          currentPlayer = name;
          localStorage.setItem("magsic_player", currentPlayer);
          if (playerDisplay) playerDisplay.textContent = `Player: ${currentPlayer} ▼`;
          if (playerDisplayInSelect) playerDisplayInSelect.textContent = `Player: ${currentPlayer} ▼`;
          loadPlayerSettings();
          updatePlayerList();
          if (songSelectOverlay && songSelectOverlay.style.display !== "none") {
            loadSongList();
          }
        };
        playerListDiv.appendChild(div);
      });
    }
    if (playerDisplay) {
      playerDisplay.addEventListener("click", (e) => {
        e.stopPropagation();
        if (playerSelectOverlay) {
          playerSelectOverlay.style.display = "flex";
          updatePlayerList();
        }
      });
    }
    if (playerDisplayInSelect) {
      playerDisplayInSelect.addEventListener("click", () => {
        if (playerSelectOverlay) {
          playerSelectOverlay.style.display = "flex";
          updatePlayerList();
        }
      });
    }
    if (btnAddPlayer && newPlayerNameInput) {
      btnAddPlayer.addEventListener("click", () => {
        const name = newPlayerNameInput.value.trim();
        if (name) {
          let players = JSON.parse(localStorage.getItem("magsic_players_list") || '["Guest"]');
          if (!players.includes(name)) {
            players.push(name);
            localStorage.setItem("magsic_players_list", JSON.stringify(players));
            newPlayerNameInput.value = "";
            updatePlayerList();
          }
        }
      });
    }
    if (btnClosePlayer && playerSelectOverlay) {
      btnClosePlayer.addEventListener("click", () => {
        playerSelectOverlay.style.display = "none";
      });
    }
    if (btnCloseSelect) {
      btnCloseSelect.addEventListener("click", () => {
        playSE("se_cancel");
        songSelectOverlay.style.display = "none";
        if (isBattleSelectMode) {
          songSelectOverlay.classList.remove("battle-mode");
          openBattleLobby();
        } else {
          showStartScreen(true);
          playBGM("bgm_title");
        }
      });
    }
    if (btnCloseDani) {
      btnCloseDani.addEventListener("click", () => {
        playSE("se_cancel");
        if (daniSelectOverlay) daniSelectOverlay.style.display = "none";
        if (menuOverlay) {
          menuOverlay.style.display = "flex";
          renderModeCarousel();
        }
      });
    }
    if (laneCoverCheckbox) {
      laneCoverCheckbox.addEventListener("change", () => {
        isLaneCoverEnabled = laneCoverCheckbox.checked;
        savePlayerSettings();
      });
    }
    if (skinSelect) {
      skinSelect.addEventListener("change", () => {
        currentSkin = skinSelect.value;
        console.log("Skin changed to:", currentSkin);
        loadSkin();
        savePlayerSettings();
      });
    }
    if (rivalScoreInput && rivalScoreDisplay) {
      rivalScoreInput.addEventListener("input", () => {
        rivalPercent = parseInt(rivalScoreInput.value);
        rivalScoreDisplay.textContent = rivalPercent.toString();
        savePlayerSettings();
      });
    }
    if (rivalShowCheckbox) {
      rivalShowCheckbox.addEventListener("change", () => {
        isRivalShowEnabled = rivalShowCheckbox.checked;
        savePlayerSettings();
      });
    }
    if (scoreDisplayTypeSelect) {
      scoreDisplayTypeSelect.addEventListener("change", () => {
        scoreDisplayType = scoreDisplayTypeSelect.value;
        savePlayerSettings();
      });
    }
    if (nicknameInput) {
      nicknameInput.addEventListener("input", () => {
        playerNickname = nicknameInput.value;
        savePlayerSettings();
      });
    }
    if (bioInput) {
      bioInput.addEventListener("input", () => {
        playerBio = bioInput.value;
        savePlayerSettings();
      });
    }
    if (rivalBarCheckbox) {
      rivalBarCheckbox.addEventListener("change", () => {
        isRivalBarEnabled = rivalBarCheckbox.checked;
        savePlayerSettings();
      });
    }
    if (btnGaugeRoll) {
      btnGaugeRoll.addEventListener("click", () => {
        let idx = GAUGE_ROLL_ORDER.indexOf(gaugeType);
        idx = (idx + 1) % GAUGE_ROLL_ORDER.length;
        gaugeType = GAUGE_ROLL_ORDER[idx];
        updateGaugeDisplay();
        savePlayerSettings();
      });
    }
    if (laneCoverHeightInput && laneCoverHeightDisplay) {
      laneCoverHeightInput.addEventListener("input", () => {
        laneCoverHeight = parseInt(laneCoverHeightInput.value);
        laneCoverHeightDisplay.textContent = laneCoverHeight.toString();
        savePlayerSettings();
      });
    }
    if (laneCoverSpeedInput && laneCoverSpeedDisplay) {
      laneCoverSpeedInput.addEventListener("input", () => {
        laneCoverSpeedMult = parseFloat(laneCoverSpeedInput.value);
        laneCoverSpeedDisplay.textContent = laneCoverSpeedMult.toFixed(1);
        savePlayerSettings();
      });
    }
    const gaugeSelect = document.getElementById("gauge-select");
    if (gaugeSelect) {
      gaugeSelect.addEventListener("change", () => {
        gaugeType = gaugeSelect.value;
        console.log("Gauge Type changed to:", gaugeType);
        resetStats();
      });
    }
    if (btnCalibrate) {
      btnCalibrate.addEventListener("click", startCalibration);
    }
    if (btnCancelCalibration) {
      btnCancelCalibration.addEventListener("click", stopCalibration);
    }
    if (offsetInput && offsetDisplay) {
      offsetInput.addEventListener("input", () => {
        const val = parseInt(offsetInput.value);
        globalOffset = val;
        offsetDisplay.textContent = val.toString();
        savePlayerSettings();
      });
    }
    if (visualOffsetInput && visualOffsetDisplay) {
      visualOffsetInput.addEventListener("input", () => {
        const val = parseInt(visualOffsetInput.value);
        visualOffset = val;
        visualOffsetDisplay.textContent = val.toString();
        savePlayerSettings();
      });
    }
    if (judgementHeightInput && judgementHeightDisplay) {
      judgementHeightInput.addEventListener("input", () => {
        judgementHeightOffset = parseInt(judgementHeightInput.value);
        judgementHeightDisplay.textContent = judgementHeightOffset.toString();
        savePlayerSettings();
      });
    }
    if (laneWidthInput && laneWidthDisplay) {
      laneWidthInput.addEventListener("input", () => {
        currentLaneWidth = parseInt(laneWidthInput.value);
        laneWidthDisplay.textContent = currentLaneWidth.toString();
        resize();
        savePlayerSettings();
      });
    }
    if (btnOptionsToggle && controlsDiv) {
      btnOptionsToggle.addEventListener("click", (e) => {
        e.stopPropagation();
        controlsDiv.classList.toggle("show-options");
        playSE("se_option");
      });
      if (btnCloseOptions) {
        btnCloseOptions.addEventListener("click", () => {
          controlsDiv.classList.remove("show-options");
        });
      }
      let touchStartX = 0;
      controlsDiv.addEventListener("touchstart", (e) => {
        touchStartX = e.touches[0].clientX;
      }, { passive: true });
      controlsDiv.addEventListener("touchend", (e) => {
        const touchEndX = e.changedTouches[0].clientX;
        const diffX = touchEndX - touchStartX;
        if (diffX > 50) {
          controlsDiv.classList.remove("show-options");
        }
      }, { passive: true });
      document.addEventListener("click", (e) => {
        const target = e.target;
        if (controlsDiv.classList.contains("show-options")) {
          if (!controlsDiv.contains(target) && target !== btnOptionsToggle) {
            controlsDiv.classList.remove("show-options");
          }
        }
      });
    }
    async function loadSkin() {
      const tryPaths = async (key, candidates) => {
        for (const path of candidates) {
          try {
            const img = await new Promise((resolve, reject) => {
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
      const skinBase = `assets/スキン/${currentSkin}`;
      const defBase = `assets/スキン/default`;
      await tryPaths("lane", [
        `${skinBase}/${currentSkin}_レーン/レーン_${currentSkin}.png`,
        `${skinBase}/${currentSkin}_レーン/lane.png`,
        `${skinBase}/レーン_${currentSkin}.png`,
        `${skinBase}/lane.png`,
        `${defBase}/レーン_default.png`,
        `${defBase}/lane.png`
      ]);
      await tryPaths("white", [
        `${skinBase}/${currentSkin}_白ノーツ/note_white.png`,
        `${skinBase}/note_white_${currentSkin}.png`,
        `${skinBase}/note_white.png`,
        `${defBase}/note_white.png`
      ]);
      await tryPaths("blue", [
        `${skinBase}/${currentSkin}_青ノーツ/note_blue.png`,
        `${skinBase}/note_blue_${currentSkin}.png`,
        `${skinBase}/note_blue.png`,
        `${defBase}/note_blue.png`
      ]);
      await tryPaths("space", [
        `${skinBase}/${currentSkin}_スペースノーツ/note_space.png`,
        `${skinBase}/note_space_${currentSkin}.png`,
        `${skinBase}/note_space.png`,
        `${skinBase}/note_space_Tunared.png`,
        `${defBase}/note_space.png`
      ]);
      const staticAssets = [
        { key: "titleBg", src: "assets/initial2.png" },
        { key: "gameBg", src: "assets/initial2.png" },
        { key: "resBg", src: "assets/リザルト背景.png" },
        { key: "judgeCritical1", src: "assets/プレイ中判定文字/CRITICAL判定1.png" },
        { key: "judgeCritical2", src: "assets/プレイ中判定文字/CRITICAL判定2.png" },
        { key: "judgeGreat1", src: "assets/プレイ中判定文字/GREAT判定1.png" },
        { key: "judgeGood1", src: "assets/プレイ中判定文字/GOOD判定1.png" },
        { key: "judgeFail1", src: "assets/プレイ中判定文字/FAIL判定1.png" },
        { key: "judgeMiss1", src: "assets/プレイ中判定文字/MISS判定1.png" },
        { key: "judgeMiss2", src: "assets/プレイ中判定文字/MISS判定2.png" },
        { key: "resCritical1", src: "assets/リザルト文字/CRITICAL1.png" },
        { key: "resCritical2", src: "assets/リザルト文字/CRITICAL2.png" },
        { key: "resGreat1", src: "assets/リザルト文字/GREAT1.png" },
        { key: "resGood1", src: "assets/リザルト文字/GOOD1.png" },
        { key: "resFail1", src: "assets/リザルト文字/FAIL1.png" },
        { key: "resMiss1", src: "assets/リザルト文字/MISS1.png" },
        { key: "resMiss2", src: "assets/リザルト文字/MISS2.png" }
      ];
      staticAssets.forEach((a) => {
        const img = new Image();
        img.src = a.src;
        img.onload = () => {
          SKIN[a.key] = img;
        };
      });
    }
    let songPreviewBGM = null;
    let interpolatedSongIndex = 0;
    let isSongSelectAnimating = false;
    function fadeVolume(audio2, target, duration, callback) {
      const start = audio2.volume;
      const startTime = performance.now();
      const anim = (time) => {
        const elapsed = time - startTime;
        const p = Math.min(elapsed / duration, 1);
        audio2.volume = start + (target - start) * p;
        if (p < 1) {
          requestAnimationFrame(anim);
        } else {
          audio2.volume = target;
          if (callback) callback();
        }
      };
      requestAnimationFrame(anim);
    }
    const AUDIO_ASSETS = {
      bgm_title: null,
      bgm_select: null,
      se_start: null,
      se_option: null,
      se_decide: null,
      // Normal
      se_decide_extra: null,
      // Extra/Hard
      se_cancel: null,
      se_clear: null,
      se_fail: null
    };
    let currentBGM = null;
    let currentSongBackground = null;
    function loadAudioAssets() {
      const assets = [
        { key: "bgm_title", src: "assets/タイトル画面/タイトル画面でループして流れる曲.wav", loop: true, volume: 0.5 },
        { key: "bgm_select", src: "assets/選曲画面/選曲画面でループして流れる曲.wav", loop: true, volume: 0.5 },
        { key: "se_start", src: "assets/ゲームスタートボタンを押す.mp3", volume: 0.8 },
        { key: "se_option", src: "assets/設定画面を開く音.mp3", volume: 0.8 },
        { key: "se_decide", src: "assets/曲選択時効果音(通常).mp3", volume: 0.8 },
        { key: "se_decide_extra", src: "assets/曲選択時効果音(エキストラモード).mp3", volume: 0.8 },
        { key: "se_cancel", src: "assets/キャンセル音.mp3", volume: 0.8 },
        { key: "se_clear", src: "assets/クリアしたときに流れる効果音.mp3", volume: 0.8 },
        { key: "se_fail", src: "assets/クリア失敗したときに流れる効果音.mp3", volume: 0.8 }
      ];
      assets.forEach((a) => {
        const audio2 = new Audio(a.src);
        audio2.volume = a.volume || 1;
        if (a.loop) audio2.loop = true;
        audio2.load();
        AUDIO_ASSETS[a.key] = audio2;
      });
    }
    loadAudioAssets();
    applyDeviceShutterTuning();
    function playBGM(key) {
      const nextBGM = AUDIO_ASSETS[key];
      if (!nextBGM) return;
      if (currentBGM === nextBGM) {
        if (currentBGM.paused) {
          currentBGM.volume = 0;
          currentBGM.play().catch((e) => console.log("Autoplay blocked", e));
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
      currentBGM.play().catch((e) => console.log("Autoplay blocked", e));
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
        introBGM.src = "";
        introBGM = null;
      }
    }
    function playSE(key) {
      const audio2 = AUDIO_ASSETS[key];
      if (audio2) {
        const clone = audio2.cloneNode();
        clone.volume = audio2.volume;
        clone.play().catch((e) => console.log("SE play failed", e));
      }
    }
    loadSkin();
    document.body.addEventListener("init-audio", () => {
      playSE("se_start");
    });
    document.addEventListener("click", () => {
      if (!currentBGM) {
        playBGM("bgm_title");
      }
    }, { once: true });
    let LANE_CONFIGS = [];
    let laneStartX = 0;
    let laneEndX = 0;
    const THRESHOLD_CRITICAL = JUDGMENT_THRESHOLDS && JUDGMENT_THRESHOLDS.critical || 40;
    const THRESHOLD_GREAT = JUDGMENT_THRESHOLDS && JUDGMENT_THRESHOLDS.great || 80;
    const THRESHOLD_GOOD = JUDGMENT_THRESHOLDS && JUDGMENT_THRESHOLDS.good || 133;
    const THRESHOLD_FAIL = JUDGMENT_THRESHOLDS && JUDGMENT_THRESHOLDS.fail || 150;
    const MISS_BOUNDARY = JUDGMENT_THRESHOLDS && JUDGMENT_THRESHOLDS.miss || 180;
    new Audio();
    let bgVideo = null;
    let isVideoReady = false;
    let bpmChanges = [];
    function getBeatFromTime$1(time) {
      return getBeatFromTime(time, bpmChanges);
    }
    let stats = {
      critical: 0,
      great: 0,
      good: 0,
      fail: 0,
      miss: 0,
      combo: 0,
      maxCombo: 0,
      totalErrorMs: 0,
      hitCount: 0,
      score: 0
    };
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
      {
        currentHealth = getInitialHealth(gaugeType);
      }
      isTrackFailed = false;
      shutterHeight = 0;
      if (resultsOverlay) resultsOverlay.style.display = "none";
      if (customResultScreen) customResultScreen.style.display = "none";
      stopResultBlinking();
      totalMaxScore = calculateMaxScore(chartData || []);
      rivalScoreEvents = [];
      let rivalWeight = 9;
      if (isBattleSelectMode) {
        isRivalShowEnabled = true;
        isRivalBarEnabled = true;
        const buttonOrder = ["no", "st", "ad", "pr", "et"];
        const diffKey = buttonOrder[selectedDiffIndex];
        if (diffKey === "no") rivalWeight = 7.5;
        else if (diffKey === "st") rivalWeight = 8.2;
        else if (diffKey === "ad") rivalWeight = 8.8;
        else if (diffKey === "pr") rivalWeight = 9.3;
        else if (diffKey === "et") rivalWeight = 9.6;
      }
      (chartData || []).forEach((note) => {
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
        debugLog.innerHTML = "<div>Debug Log Started</div>";
      }
    }
    function addHit(type, errorMs = 0) {
      stats[type]++;
      if (type !== "miss") {
        stats.totalErrorMs += errorMs;
        stats.hitCount++;
      }
      if (type === "miss" || type === "fail") {
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
        {
          const gaugeResult = applyGaugeHit(currentHealth, type, gaugeType);
          currentHealth = gaugeResult.health;
          if (gaugeResult.isDead) {
            console.log("LIFE DEPLETED - GAME OVER");
            failGame();
          }
        }
      }
      broadcastPlayState();
    }
    let isCalibrating = false;
    let calibrationStartTime = 0;
    const CALIBRATION_BPM = 120;
    const CALIBRATION_BEATS = 8;
    let calibrationTaps = [];
    function startCalibration() {
      console.log("Starting Calibration...");
      if (btnCalibrate) btnCalibrate.blur();
      try {
        if (!audioContext) audioContext = new AudioContext();
        if (audioContext.state === "suspended") audioContext.resume();
      } catch (e) {
        alert("Audio Context Error: " + e);
        return;
      }
      isCalibrating = true;
      if (calibrationOverlay) {
        calibrationOverlay.style.display = "flex";
        if (calibrationStatus) calibrationStatus.textContent = "Listen & Tap...";
      } else {
        console.error("Calibration Overlay not found");
        alert("Error: Calibration Overlay element not found");
        return;
      }
      calibrationTaps = [];
      const now = audioContext.currentTime;
      const beatInterval = 60 / CALIBRATION_BPM;
      calibrationStartTime = now + 1;
      for (let i = 0; i < CALIBRATION_BEATS; i++) {
        const time = calibrationStartTime + i * beatInterval;
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        osc.connect(gain);
        gain.connect(audioContext.destination);
        osc.type = "sine";
        osc.frequency.value = i < 4 ? 440 : 880;
        osc.start(time);
        osc.stop(time + 0.1);
        gain.gain.setValueAtTime(0.5, time);
        gain.gain.exponentialRampToValueAtTime(0.01, time + 0.1);
      }
      setTimeout(() => {
        finishCalibration();
      }, (calibrationStartTime + CALIBRATION_BEATS * beatInterval + 1) * 1e3 - now * 1e3);
    }
    function stopCalibration() {
      isCalibrating = false;
      calibrationOverlay.style.display = "none";
    }
    function finishCalibration() {
      if (!isCalibrating) return;
      const beatInterval = 60 / CALIBRATION_BPM;
      let diffs = [];
      calibrationTaps.forEach((tapTime) => {
        const relative = tapTime - calibrationStartTime;
        const beatIndex = Math.round(relative / beatInterval);
        if (beatIndex >= 4 && beatIndex < CALIBRATION_BEATS) {
          const expected = calibrationStartTime + beatIndex * beatInterval;
          const diff = (tapTime - expected) * 1e3;
          if (Math.abs(diff) < 200) diffs.push(diff);
        }
      });
      if (diffs.length >= 3) {
        const sum = diffs.reduce((a, b) => a + b, 0);
        const avg = Math.round(sum / diffs.length);
        globalOffset = avg;
        offsetInput.value = globalOffset.toString();
        offsetDisplay.textContent = globalOffset.toString();
        alert(`Calibration Complete!
Average Latency: ${avg}ms
Offset Updated.`);
      } else {
        alert("Calibration Failed. Not enough valid taps.");
      }
      stopCalibration();
    }
    let audioContext = null;
    let audioBuffer = null;
    let audioSource = null;
    let audioStartTime = 0;
    const keysoundBank = /* @__PURE__ */ new Map();
    function playKeysound(soundId) {
      if (!soundId || !audioContext) return;
      const buffer = keysoundBank.get(soundId);
      if (!buffer) return;
      const src = audioContext.createBufferSource();
      src.buffer = buffer;
      src.connect(audioContext.destination);
      src.start();
    }
    function logDebug(msg) {
      if (!debugLog) return;
      const div = document.createElement("div");
      div.textContent = `[${getAudioTime().toFixed(3)}s] ${msg}`;
      debugLog.appendChild(div);
      debugLog.scrollTop = debugLog.scrollHeight;
      if (debugLog.childNodes.length > 50) {
        debugLog.removeChild(debugLog.firstChild);
      }
    }
    const notes = [];
    let lastTime = 0;
    let currentMode = "random";
    let isPlaying = false;
    let isPaused = false;
    let pausedOffset = 0;
    let isCountdown = false;
    let countdownValue = 0;
    let isStarting = false;
    let startSequenceStartTime = 0;
    const START_DELAY_MS = 3e3;
    let chartData = [];
    let layoutChanges = [];
    let nextNoteIndex = 0;
    let VISUAL_LANES = [];
    let judgementText = "";
    let judgementColor = "#fff";
    let judgementTimer = 0;
    const pressedKeys = new Array(KEYS.length).fill(false);
    const heldNotes = new Array(KEYS.length).fill(null);
    const hitEffects = [];
    const EFFECT_DURATION = 200;
    function spawnHitEffect(laneIndex, color) {
      const config = LANE_CONFIGS[laneIndex];
      if (!config) return;
      hitEffects.push({
        x: config.x,
        y: HIT_Y - 15,
        // Centered on hit line (approx note height is small)
        width: config.width,
        height: 30,
        // Frame height
        color,
        life: 1,
        maxLife: EFFECT_DURATION
      });
    }
    function initAudio() {
      if (!audioContext) {
        audioContext = new AudioContext();
      }
      if (audioContext.state === "suspended") {
        audioContext.resume();
      }
    }
    function playAudio(offset = 0) {
      if (!audioContext || !audioBuffer) return;
      if (audioSource) {
        audioSource.stop();
        audioSource.disconnect();
      }
      audioSource = audioContext.createBufferSource();
      audioSource.buffer = audioBuffer;
      audioSource.connect(audioContext.destination);
      if (offset < 0) {
        const delay = -offset;
        audioSource.start(audioContext.currentTime + delay, 0);
      } else {
        audioSource.start(0, offset);
      }
      audioStartTime = audioContext.currentTime - offset;
      audioSource.onended = () => {
        if (currentMode === "chart" && isPlaying && !isPaused && !isCountdown) {
          console.log("Song ended naturally");
          setTimeout(showResults, 1e3);
          isPlaying = false;
        }
      };
    }
    function stopAudio() {
      if (audioSource) {
        audioSource.onended = null;
        audioSource.stop();
        try {
          audioSource.disconnect();
        } catch (e) {
        }
        audioSource = null;
      }
    }
    function failGame() {
      if (isTrackFailed) return;
      isTrackFailed = true;
      stopAudio();
      if (bgVideo) bgVideo.pause();
      console.log("GAME FAILED - Closing Shutter");
    }
    function getAudioTime() {
      if (isStarting) {
        const now = performance.now();
        return (now - startSequenceStartTime - START_DELAY_MS) / 1e3;
      }
      if (!audioContext || !audioSource) return isPaused || isCountdown ? pausedOffset : 0;
      if (isPaused) return pausedOffset;
      if (isCountdown) return pausedOffset;
      return Math.max(0, audioContext.currentTime - audioStartTime);
    }
    function getNoteY(scheduledTime, beat = 0, currentTimeMs = -1) {
      const trueTimeMs = currentTimeMs === -1 ? getAudioTime() * 1e3 : currentTimeMs;
      const timeMs = trueTimeMs + visualOffset;
      const effectiveSpeed = currentNoteSpeed * (isLaneCoverEnabled ? laneCoverSpeedMult : 1);
      const currentBeat = getBeatFromTime$1(timeMs);
      const distBeats = beat - currentBeat;
      const baseBpm = bpmChanges.length > 0 ? bpmChanges[0].bpm : 120;
      const msPerBeatBaseline = 6e4 / baseBpm;
      return HIT_Y - distBeats * msPerBeatBaseline * effectiveSpeed;
    }
    function getSpawnAheadTime() {
      const speed = currentNoteSpeed * (isLaneCoverEnabled ? laneCoverSpeedMult : 1);
      return 2e3 / speed;
    }
    function applyDeviceShutterTuning() {
      if (!shutterOverlay) return;
      const ua = navigator.userAgent;
      console.log("Detecting platform for shutter tuning:", ua);
      if (ua.indexOf("Windows") !== -1) {
        console.log("Applying Windows-specific shutter tuning (+5% vertical offset)");
        shutterOverlay.style.setProperty("--shutter-y-offset", "5%");
      }
      if (/Android|iPhone|iPad|iPod/i.test(ua)) {
        console.log("Mobile device detected - using standard centering");
        shutterOverlay.style.setProperty("--shutter-scale", "2.8");
      }
    }
    function spawnNote(laneIndex, scheduledTime, isLong, duration, beat, noteType, soundId) {
      notes.push({
        laneIndex,
        scheduledTime,
        active: true,
        isLong,
        duration,
        processed: false,
        beingHeld: false,
        beat,
        type: noteType,
        soundId
      });
    }
    function update(deltaTime) {
      if (isTrackFailed) {
        const speed = canvas.height / 500;
        shutterHeight += speed * deltaTime;
        if (shutterHeight >= canvas.height) {
          shutterHeight = canvas.height;
          if (resultsOverlay && resultsOverlay.style.display !== "block" && (!customResultScreen || customResultScreen.style.display !== "flex")) {
            showResults();
            isPlaying = false;
            if (controlsDiv) controlsDiv.style.display = "block";
          }
        }
        return;
      }
      if (!isPlaying || isPaused || isCountdown) return;
      const currentTime = getAudioTime();
      const currentTimeMs = currentTime * 1e3;
      while (rivalEventIndex < rivalScoreEvents.length && currentTimeMs >= rivalScoreEvents[rivalEventIndex].time) {
        rivalPassedMaxScore += rivalScoreEvents[rivalEventIndex].weight;
        rivalEventIndex++;
      }
      if (currentLayoutType === "default" && layoutChanges.length > 0) {
        let activeType = "type-a";
        for (const lc of layoutChanges) {
          if (currentTimeMs >= lc.time) {
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
      updateLaneInterpolation();
      if (currentMode === "random") {
        if (Math.random() < 0.02) {
          const lane = Math.floor(Math.random() * KEYS.length);
          const spawnAheadTime = getSpawnAheadTime();
          const noteTime = currentTimeMs + spawnAheadTime;
          let noteBeat = 0;
          if (bpmChanges.length > 0) {
            noteBeat = getBeatFromTime$1(noteTime);
          }
          spawnNote(lane, noteTime, Math.random() < 0.2, Math.random() * 500, noteBeat, "normal");
        }
      } else {
        const spawnAheadTime = getSpawnAheadTime();
        while (nextNoteIndex < chartData.length) {
          const noteData = chartData[nextNoteIndex];
          if (noteData.time <= currentTimeMs + spawnAheadTime) {
            spawnNote(noteData.lane, noteData.time, noteData.duration > 0, noteData.duration, noteData.beat, noteData.type, noteData.soundId);
            nextNoteIndex++;
          } else {
            break;
          }
        }
      }
      if (isStarting && currentTime >= 0) {
        console.log("Start Delay Finished. Playing Audio.");
        isStarting = false;
        playAudio(0);
        if (bgVideo && isVideoReady) bgVideo.play();
      }
      if (isCountdown) return;
      notes.forEach((note) => {
        if (!note.active) return;
        const assistVal = assistSelect?.value || "none";
        if (note.isLong && note.beingHeld) {
          const tailTime = note.scheduledTime + note.duration;
          if (currentTimeMs >= tailTime) {
            note.active = false;
            judgementColor = "#00ffff";
            judgementTimer = 1e3;
            addHit("critical");
            spawnHitEffect(note.laneIndex, "#00ffff");
            if (isAutoPlay || assistVal === "auto_space" && note.laneIndex === 4) {
              pressedKeys[note.laneIndex] = false;
              heldNotes[note.laneIndex] = null;
            }
          }
        } else if ((isAutoPlay || assistVal === "auto_space" && note.laneIndex === 4) && !note.isLong && !note.processed && currentTimeMs >= note.scheduledTime) {
          note.active = false;
          judgementText = `CRITICAL
AUTO`;
          judgementColor = "#00ffff";
          judgementTimer = 1e3;
          addHit("critical");
          spawnHitEffect(note.laneIndex, "#00ffff");
          pressedKeys[note.laneIndex] = true;
          setTimeout(() => pressedKeys[note.laneIndex] = false, 50);
        } else if ((isAutoPlay || assistVal === "auto_space" && note.laneIndex === 4) && note.isLong && !note.processed && currentTimeMs >= note.scheduledTime && !note.beingHeld) {
          note.processed = true;
          note.beingHeld = true;
          heldNotes[note.laneIndex] = note;
          judgementText = `CRITICAL
AUTO`;
          judgementColor = "#00ffff";
          judgementTimer = 1e3;
          addHit("critical");
          spawnHitEffect(note.laneIndex, "#00ffff");
          pressedKeys[note.laneIndex] = true;
        } else if ((isAutoPlay || assistVal === "auto_space" && note.laneIndex === 4) && note.isLong && note.beingHeld && currentTimeMs >= note.scheduledTime + note.duration) {
          pressedKeys[note.laneIndex] = false;
        } else if (!note.isLong || !note.processed) {
          const msPassed = currentTimeMs - note.scheduledTime;
          if (msPassed > MISS_BOUNDARY && note.active) {
            note.active = false;
            if (note.type === "death") {
              logDebug(`DEATH NOTE IGNORED (Time): lane=${note.laneIndex} target=${(note.scheduledTime / 1e3).toFixed(3)}s`);
            } else {
              judgementText = `MISS`;
              judgementColor = "#ff0000";
              judgementTimer = 1e3;
              addHit("miss");
              if (note.isLong) addHit("miss");
              logDebug(`MISS (Time): lane=${note.laneIndex} target=${(note.scheduledTime / 1e3).toFixed(3)}s passed=${Math.floor(msPassed)}ms`);
              if (note.type === "sinking") {
                console.log("SINKING NOTE MISSED - FAIL");
                failGame();
              }
            }
          }
        } else {
          const tailTime = note.scheduledTime + note.duration;
          if (currentTimeMs > tailTime + MISS_BOUNDARY) note.active = false;
        }
      });
      for (let i = notes.length - 1; i >= 0; i--) {
        const note = notes[i];
        const tailTime = note.scheduledTime + note.duration;
        const tailBeat = getBeatFromTime$1(tailTime);
        const tailY = getNoteY(tailTime, tailBeat, currentTimeMs);
        if (tailY > canvas.height + 1e3) {
          if (note.active) {
            if (currentTimeMs > note.scheduledTime + MISS_BOUNDARY) {
              note.active = false;
              if (note.type === "death") {
                logDebug(`DEATH NOTE IGNORED (Spatial): lane=${note.laneIndex} target=${(note.scheduledTime / 1e3).toFixed(3)}s`);
              } else {
                judgementText = `MISS`;
                judgementColor = "#ff0000";
                judgementTimer = 1e3;
                addHit("miss");
                if (note.isLong) addHit("miss");
                logDebug(`MISS (Spatial): lane=${note.laneIndex} target=${(note.scheduledTime / 1e3).toFixed(3)}s tailY=${Math.floor(tailY)}`);
                if (note.type === "sinking") {
                  console.log("SINKING NOTE MISSED - FAIL");
                  failGame();
                }
              }
            } else {
              logDebug(`CULL (Safe): lane=${note.laneIndex} target=${(note.scheduledTime / 1e3).toFixed(3)}s tailY=${Math.floor(tailY)}`);
            }
          }
          notes.splice(i, 1);
        } else if (!note.active) {
          notes.splice(i, 1);
        }
      }
      for (let i = hitEffects.length - 1; i >= 0; i--) {
        const effect = hitEffects[i];
        effect.life -= deltaTime / effect.maxLife;
        if (effect.life <= 0) {
          hitEffects.splice(i, 1);
        }
      }
      if (judgementTimer > 0) judgementTimer -= deltaTime;
    }
    function draw() {
      if (!ctx) return;
      const isIntroActive = introOverlay && introOverlay.style.display === "flex";
      if (!isPlaying && !isIntroActive) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        requestAnimationFrame(draw);
        return;
      }
      const currentTime = getAudioTime();
      const currentTimeMs = currentTime * 1e3;
      if (isPlaying || isIntroActive) {
        if (bgVideo && isVideoReady) {
          ctx.drawImage(bgVideo, 0, 0, canvas.width, canvas.height);
        } else if (currentSongBackground) {
          ctx.drawImage(currentSongBackground, 0, 0, canvas.width, canvas.height);
        } else if (SKIN.gameBg) {
          ctx.drawImage(SKIN.gameBg, 0, 0, canvas.width, canvas.height);
        }
        if (!isMVLayout || isDaniMode) {
          ctx.fillStyle = "rgba(0,0,0,0.5)";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
      }
      VISUAL_LANES.forEach((lane) => {
        if (SKIN["lane"]) {
          ctx.drawImage(SKIN["lane"], lane.x, 0, lane.width, canvas.height);
        } else {
          ctx.fillStyle = `rgba(17, 17, 17, ${laneOpacity})`;
          ctx.fillRect(lane.x, 0, lane.width, canvas.height);
        }
        ctx.strokeStyle = "#555";
        ctx.lineWidth = 2;
        ctx.beginPath();
        const x = lane.x + lane.width;
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
        if (lane === VISUAL_LANES[0]) {
          ctx.beginPath();
          ctx.moveTo(lane.x, 0);
          ctx.lineTo(lane.x, canvas.height);
          ctx.stroke();
        }
      });
      if (bpmChanges.length > 0) {
        const speed = currentNoteSpeed * (isLaneCoverEnabled ? laneCoverSpeedMult : 1);
        const maxVisibleTime = currentTimeMs + HIT_Y / speed + 2e3;
        const minVisibleTime = currentTimeMs - (canvas.height - HIT_Y) / speed - 1e3;
        const allChanges = [{ time: -999999, bpm: bpmChanges[0]?.bpm || 120, beat: 0 }, ...bpmChanges];
        allChanges.sort((a, b) => a.time - b.time);
        for (let i = 0; i < allChanges.length; i++) {
          const change = allChanges[i];
          const nextChange = allChanges[i + 1];
          const segStart = Math.max(minVisibleTime, change.time);
          const segEnd = nextChange ? Math.min(maxVisibleTime, nextChange.time) : maxVisibleTime;
          if (segStart < segEnd) {
            const msPerBeat = 6e4 / change.bpm;
            const minGlobalBeat = change.beat + (segStart - change.time) / msPerBeat;
            const startGlobalBeat = Math.ceil(minGlobalBeat);
            let safeguard = 0;
            for (let g = startGlobalBeat; safeguard < 1e3; g++) {
              safeguard++;
              const beatTime = change.time + (g - change.beat) * msPerBeat;
              if (beatTime > segEnd + 1) break;
              const isMeasure = g % 4 === 0;
              const y = getNoteY(beatTime, g, currentTimeMs);
              if (isMeasure) {
                ctx.strokeStyle = "#888";
                ctx.lineWidth = 2;
              } else {
                ctx.strokeStyle = "#444";
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
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, HIT_Y);
      ctx.lineTo(canvas.width, HIT_Y);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, HIT_Y);
      ctx.lineTo(canvas.width, HIT_Y);
      ctx.stroke();
      ctx.save();
      hitEffects.forEach((effect) => {
        ctx.strokeStyle = effect.color;
        ctx.lineWidth = 4;
        ctx.globalAlpha = effect.life;
        const expand = (1 - effect.life) * 20;
        const x = effect.x - expand / 2;
        const w = effect.width + expand;
        const h = effect.height + expand / 2;
        const y = effect.y - expand / 4;
        ctx.strokeRect(x, y, w, h);
        ctx.fillStyle = effect.color;
        ctx.globalAlpha = effect.life * 0.3;
        ctx.fillRect(x, y, w, h);
      });
      ctx.restore();
      pressedKeys.forEach((pkg, index) => {
        if (pkg) {
          const config = LANE_CONFIGS[index];
          if (!config) return;
          if (config.label === "SPACE") {
            ctx.fillStyle = "rgba(224, 64, 251, 0.4)";
            ctx.fillRect(config.x, HIT_Y - 5, config.width, 10);
          } else {
            const color = config.color;
            let baseColor = "rgba(255, 255, 255,";
            if (color === "#7CA4FF") baseColor = "rgba(124, 164, 255,";
            else if (color === "#ffffff") baseColor = "rgba(255, 255, 255,";
            ctx.fillStyle = `${baseColor} 0.1)`;
            ctx.fillRect(config.x, 0, config.width, canvas.height);
            ctx.fillStyle = `${baseColor} 0.3)`;
            ctx.fillRect(config.x, HIT_Y - 10, config.width, 20);
          }
        }
      });
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.textAlign = "left";
      ctx.font = "20px monospace";
      const statsStartY = 150;
      const statsLineH = 30;
      ctx.fillText(`CRITICAL: ${stats.critical}`, 20, statsStartY);
      ctx.fillText(`GREAT:    ${stats.great}`, 20, statsStartY + statsLineH);
      ctx.fillText(`GOOD:     ${stats.good}`, 20, statsStartY + statsLineH * 2);
      ctx.fillText(`FAIL:     ${stats.fail}`, 20, statsStartY + statsLineH * 3);
      ctx.fillText(`MISS:     ${stats.miss}`, 20, statsStartY + statsLineH * 4);
      const avgVal = stats.hitCount > 0 ? (stats.totalErrorMs / stats.hitCount).toFixed(1) : "0";
      ctx.fillText(`AVG:     ${avgVal}ms`, 20, statsStartY + statsLineH * 5);
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      LANE_CONFIGS.forEach((c) => {
        if (c && c.label) {
          const fontSize = Math.min(20, Math.floor(c.width / 3));
          ctx.font = `${fontSize}px Arial`;
          let yPos = canvas.height - 30;
          if (c.label === "SPACE") yPos = canvas.height - 50;
          ctx.fillText(c.label, c.x + c.width / 2, yPos);
        }
      });
      ctx.fillStyle = "#fff";
      ctx.font = "bold 60px Arial";
      ctx.textAlign = "center";
      ctx.globalAlpha = 0.3;
      ctx.fillText(stats.combo.toString(), canvas.width / 2, canvas.height / 2);
      if (isAutoPlay) {
        ctx.font = "bold 30px Arial";
        ctx.fillText("AUTO PLAY", canvas.width / 2, canvas.height / 2 + 50);
      } else {
        let pct = 0;
        if (totalMaxScore > 0) {
          pct = (totalMaxScore - lostScore) / totalMaxScore * 100;
        }
        if (pct < 0) pct = 0;
        if (scoreDisplayType === "percent") {
          if (isRivalShowEnabled) {
            const playerAddPct = totalMaxScore > 0 ? rawScore / totalMaxScore * 100 : 0;
            const rivalAddPct = totalMaxScore > 0 ? rivalPassedMaxScore * (rivalPercent / 100) / totalMaxScore * 100 : 0;
            const diffPct = playerAddPct - rivalAddPct;
            ctx.font = "bold 30px Arial";
            ctx.fillStyle = "#fff";
            const scoreText = pct.toFixed(4) + "%";
            ctx.fillText(scoreText, canvas.width / 2, canvas.height / 2 + 40);
            ctx.font = "bold 20px Arial";
            ctx.fillStyle = diffPct >= 0 ? "#ffffff" : "#ff0000";
            const diffSign = diffPct >= 0 ? "+" : "";
            const diffText = `${diffSign}${diffPct.toFixed(4)}%`;
            ctx.fillText(diffText, canvas.width / 2, canvas.height / 2 + 70);
          } else {
            ctx.font = "bold 30px Arial";
            ctx.fillStyle = "#fff";
            const scoreText = pct.toFixed(4) + "%";
            ctx.fillText(scoreText, canvas.width / 2, canvas.height / 2 + 50);
          }
        } else {
          const playerVal = rawScore;
          const rivalVal = Math.round(rivalPassedMaxScore * (rivalPercent / 100));
          if (isRivalShowEnabled) {
            const diffVal = playerVal - rivalVal;
            ctx.font = "bold 30px Arial";
            ctx.fillStyle = "#fff";
            ctx.fillText(playerVal.toString(), canvas.width / 2, canvas.height / 2 + 40);
            ctx.font = "bold 20px Arial";
            ctx.fillStyle = diffVal >= 0 ? "#ffffff" : "#ff0000";
            const diffSign = diffVal >= 0 ? "+" : "";
            const diffText = `${diffSign}${diffVal}`;
            ctx.fillText(diffText, canvas.width / 2, canvas.height / 2 + 70);
          } else {
            ctx.font = "bold 30px Arial";
            ctx.fillStyle = "#fff";
            ctx.fillText(playerVal.toString(), canvas.width / 2, canvas.height / 2 + 50);
          }
        }
      }
      ctx.globalAlpha = 1;
      if (laneStartX > 150) {
        const statsX = laneStartX - 140;
        const statsStartTime = canvas.height / 2 - 100;
        const lineHeight = 35;
        ctx.textAlign = "right";
        ctx.font = "bold 24px Arial";
        ctx.fillStyle = "#00ffff";
        ctx.fillText(`CRITICAL: ${stats.critical}`, statsX, statsStartTime);
        ctx.fillStyle = "#ffeb3b";
        ctx.fillText(`GREAT: ${stats.great}`, statsX, statsStartTime + lineHeight);
        ctx.fillStyle = "#00ff00";
        ctx.fillText(`GOOD: ${stats.good}`, statsX, statsStartTime + lineHeight * 2);
        ctx.fillStyle = "#ffae00";
        ctx.fillText(`FAIL: ${stats.fail}`, statsX, statsStartTime + lineHeight * 3);
        ctx.fillStyle = "#ff0000";
        ctx.fillText(`MISS: ${stats.miss}`, statsX, statsStartTime + lineHeight * 4);
        ctx.fillStyle = "#ffffff";
        const sideAvg = stats.hitCount > 0 ? (stats.totalErrorMs / stats.hitCount).toFixed(1) : "0";
        ctx.fillText(`AVG: ${sideAvg}ms`, statsX, statsStartTime + lineHeight * 5);
      }
      if (laneStartX > 30) {
        const barW = 15;
        const barH = 400;
        const barX = laneStartX - 25;
        const barY = canvas.height / 2 - 200;
        ctx.fillStyle = "#333";
        ctx.fillRect(barX, barY, barW, barH);
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1;
        ctx.strokeRect(barX, barY, barW, barH);
        const fillH = currentHealth / 100 * barH;
        const fillY = barY + (barH - fillH);
        if (gaugeType === "norma") {
          if (currentHealth >= 70) ctx.fillStyle = "#ff0055";
          else if (currentHealth >= 40) ctx.fillStyle = "#00ffff";
          else ctx.fillStyle = "#ffff00";
        } else {
          if (currentHealth > 50) ctx.fillStyle = "#00ff00";
          else if (currentHealth > 20) ctx.fillStyle = "#ffff00";
          else ctx.fillStyle = "#ff0000";
        }
        ctx.fillRect(barX, fillY, barW, fillH);
        ctx.fillStyle = "#fff";
        ctx.font = "bold 12px Arial";
        ctx.textAlign = "center";
        ctx.fillText(`${Math.floor(currentHealth)}%`, barX + barW / 2, barY + barH + 15);
      }
      if (laneEndX > 0 && totalMaxScore > 0) {
        const barW = 15;
        const barH = 400;
        const barY = canvas.height / 2 - 200;
        const barX_player = laneEndX + 10;
        const barX_rival = laneEndX + 30;
        ctx.fillStyle = "#1a1a24";
        ctx.fillRect(barX_player, barY, barW, barH);
        ctx.strokeStyle = "rgba(0, 255, 255, 0.4)";
        ctx.lineWidth = 1;
        ctx.strokeRect(barX_player, barY, barW, barH);
        const playerAddPct = totalMaxScore > 0 ? rawScore / totalMaxScore * 100 : 0;
        const fillH_player = Math.min(barH, playerAddPct / 100 * barH);
        const fillY_player = barY + (barH - fillH_player);
        const grad_player = ctx.createLinearGradient(barX_player, barY, barX_player, barY + barH);
        grad_player.addColorStop(0, "#00ffff");
        grad_player.addColorStop(1, "#0055ff");
        ctx.fillStyle = grad_player;
        ctx.fillRect(barX_player, fillY_player, barW, fillH_player);
        let rivalScoreVal = 0;
        let rivalAddPct = 0;
        if (isRivalBarEnabled) {
          ctx.fillStyle = "#1a1a24";
          ctx.fillRect(barX_rival, barY, barW, barH);
          ctx.strokeStyle = "rgba(255, 152, 0, 0.4)";
          ctx.lineWidth = 1;
          ctx.strokeRect(barX_rival, barY, barW, barH);
          rivalScoreVal = Math.round(rivalPassedMaxScore * (rivalPercent / 100));
          rivalAddPct = totalMaxScore > 0 ? rivalScoreVal / totalMaxScore * 100 : 0;
          const fillH_rival = Math.min(barH, rivalAddPct / 100 * barH);
          const fillY_rival = barY + (barH - fillH_rival);
          const grad_rival = ctx.createLinearGradient(barX_rival, barY, barX_rival, barY + barH);
          grad_rival.addColorStop(0, "#ff9800");
          grad_rival.addColorStop(1, "#ff3d00");
          ctx.fillStyle = grad_rival;
          ctx.fillRect(barX_rival, fillY_rival, barW, fillH_rival);
        }
        ctx.fillStyle = "#fff";
        ctx.font = "bold 12px Arial";
        ctx.textAlign = "center";
        ctx.fillText("P", barX_player + barW / 2, barY + barH + 15);
        if (isRivalBarEnabled) {
          ctx.fillText("R", barX_rival + barW / 2, barY + barH + 15);
        }
        ctx.font = "bold 10px Arial";
        if (scoreDisplayType === "percent") {
          ctx.fillStyle = "#00ffff";
          ctx.fillText(`${Math.floor(playerAddPct)}%`, barX_player + barW / 2, barY - 8);
          if (isRivalBarEnabled) {
            ctx.fillStyle = "#ff9800";
            ctx.fillText(`${Math.floor(rivalAddPct)}%`, barX_rival + barW / 2, barY - 8);
          }
        } else {
          ctx.fillStyle = "#00ffff";
          ctx.fillText(rawScore.toString(), barX_player + barW / 2, barY - 8);
          if (isRivalBarEnabled) {
            ctx.fillStyle = "#ff9800";
            ctx.fillText(rivalScoreVal.toString(), barX_rival + barW / 2, barY - 8);
          }
        }
      }
      function drawNotesForLane(targetLaneIdx) {
        const assistVal = assistSelect?.value || "none";
        notes.forEach((note) => {
          if (note.laneIndex !== targetLaneIdx) return;
          const config = LANE_CONFIGS[note.laneIndex];
          if (!config) return;
          let bodyColor = "rgba(255, 255, 255, 0.5)";
          if (config.color === "#7CA4FF") bodyColor = "rgba(124, 164, 255, 0.5)";
          else if (config.color === "#e040fb") {
            if (assistVal === "auto_space") bodyColor = "rgba(0, 255, 0, 0.5)";
            else bodyColor = "rgba(224, 64, 251, 0.5)";
          }
          const x = config.x;
          const w = config.width;
          const H_GAP = 2;
          let drawHeight = NOTE_HEIGHT;
          if (note.laneIndex === 4) {
            drawHeight = 4.5;
          }
          let skinImg = null;
          if (config.label === "SPACE") {
            if (assistVal === "auto_space") skinImg = null;
            else skinImg = SKIN.space;
          } else if (config.color === "#7CA4FF") skinImg = SKIN.blue;
          else skinImg = SKIN.white;
          if (note.isLong) {
            const headY = getNoteY(note.scheduledTime, note.beat, currentTimeMs);
            const tailBeat = getBeatFromTime$1(note.scheduledTime + note.duration);
            const tailY = getNoteY(note.scheduledTime + note.duration, tailBeat, currentTimeMs);
            const originalAlpha = ctx.globalAlpha;
            ctx.globalAlpha = 0.5;
            if (note.type === "death") {
              ctx.fillStyle = "#330000";
            } else {
              ctx.fillStyle = bodyColor;
            }
            ctx.fillRect(x + H_GAP, tailY, w - H_GAP * 2, headY - tailY);
            ctx.globalAlpha = originalAlpha;
            const isSpecial = note.type === "sinking" || note.type === "death";
            if (skinImg && !isSpecial) {
              ctx.drawImage(skinImg, x + H_GAP, headY - drawHeight / 2, w - H_GAP * 2, drawHeight);
            } else {
              if (config.label === "SPACE" && assistVal === "auto_space") ctx.fillStyle = "#00ff00";
              else ctx.fillStyle = config.color;
              if (note.type === "sinking") {
                const blink = Math.floor(Date.now() / 100) % 2 === 0;
                ctx.fillStyle = blink ? "#ff0000" : "#ffaaaa";
              } else if (note.type === "death") {
                const blink = Math.floor(Date.now() / 100) % 2 === 0;
                ctx.fillStyle = blink ? "#ff0000" : "#000000";
              }
              ctx.fillRect(x + H_GAP, headY - drawHeight / 2, w - H_GAP * 2, drawHeight);
            }
          } else {
            const noteY = getNoteY(note.scheduledTime, note.beat, currentTimeMs);
            if (noteY > canvas.height + 100) return;
            const isSpecial = note.type === "sinking" || note.type === "death";
            if (skinImg && !isSpecial) {
              ctx.drawImage(skinImg, x + H_GAP, noteY - drawHeight / 2, w - H_GAP * 2, drawHeight);
            } else {
              if (config.label === "SPACE" && assistVal === "auto_space") ctx.fillStyle = "#00ff00";
              else ctx.fillStyle = config.color;
              if (note.type === "sinking") {
                const blink = Math.floor(Date.now() / 100) % 10 < 5;
                ctx.fillStyle = blink ? "#ff3333" : "#ff8888";
              } else if (note.type === "death") {
                const blink = Math.floor(Date.now() / 100) % 10 < 5;
                ctx.fillStyle = blink ? "#ff0000" : "#330000";
              }
              ctx.fillRect(x + H_GAP, noteY - drawHeight / 2, w - H_GAP * 2, drawHeight);
            }
            if (isSpecial) {
              ctx.fillStyle = "#fff";
              ctx.font = `bold ${Math.floor(drawHeight * 1.2)}px Arial`;
              ctx.textAlign = "center";
              ctx.fillText(note.type === "sinking" ? "!" : "X", x + config.width / 2, noteY + drawHeight / 3);
            }
          }
        });
      }
      const currentModeIndices = GAME_MODES[currentKeyMode].indices;
      if (currentModeIndices.includes(4)) drawNotesForLane(4);
      currentModeIndices.forEach((idx) => {
        if (idx === 4) return;
        const config = LANE_CONFIGS[idx];
        if (config && config.color !== "#7CA4FF") {
          drawNotesForLane(idx);
        }
      });
      currentModeIndices.forEach((idx) => {
        if (idx === 4) return;
        const config = LANE_CONFIGS[idx];
        if (config && config.color === "#7CA4FF") {
          drawNotesForLane(idx);
        }
      });
      if (isLaneCoverEnabled && VISUAL_LANES.length > 0) {
        const minX = VISUAL_LANES[0].x;
        const maxX = VISUAL_LANES[VISUAL_LANES.length - 1].x + VISUAL_LANES[VISUAL_LANES.length - 1].width;
        const coverW = maxX - minX;
        const gradient = ctx.createLinearGradient(minX, 0, minX, laneCoverHeight);
        gradient.addColorStop(0, "#000");
        gradient.addColorStop(0.8, "#222");
        gradient.addColorStop(1, "#444");
        ctx.fillStyle = gradient;
        ctx.fillRect(minX, 0, coverW, laneCoverHeight);
        ctx.strokeStyle = "#00ffff";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(minX, laneCoverHeight);
        ctx.lineTo(maxX, laneCoverHeight);
        ctx.stroke();
      }
      if (judgementTimer > 0 && ctx) {
        const centerLaneX = (laneStartX + laneEndX) / 2;
        ctx.fillStyle = judgementColor;
        ctx.font = "bold 40px Arial";
        ctx.textAlign = "center";
        const lines = judgementText.split("\n");
        lines.forEach((line, i) => {
          ctx.fillText(line, centerLaneX, HIT_Y - judgementHeightOffset / 2 + i * 40);
        });
      }
      if (isTrackFailed || shutterHeight > 0) {
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, canvas.width, shutterHeight);
        ctx.strokeStyle = "#555";
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(0, shutterHeight);
        ctx.lineTo(canvas.width, shutterHeight);
        ctx.stroke();
        if (shutterHeight > canvas.height / 2) {
          ctx.fillStyle = "#ff0000";
          ctx.font = "bold 80px Arial";
          ctx.textAlign = "center";
          ctx.fillText("TRACK FAILED", canvas.width / 2, canvas.height / 2);
        }
      }
      if (isNHolding && hasAdjustedDuringNHold) {
        const minX = VISUAL_LANES.length > 0 ? VISUAL_LANES[0].x : canvas.width / 2 - 200;
        const maxX = VISUAL_LANES.length > 0 ? VISUAL_LANES[VISUAL_LANES.length - 1].x + VISUAL_LANES[VISUAL_LANES.length - 1].width : canvas.width / 2 + 200;
        const coverW = maxX - minX;
        const uiW = 200;
        const uiH = 40;
        const uiX = minX + (coverW - uiW) / 2;
        const uiY = Math.min(canvas.height - uiH, laneCoverHeight);
        ctx.fillStyle = "rgba(0,0,0,0.85)";
        ctx.fillRect(uiX, uiY, uiW, uiH);
        ctx.strokeStyle = "#00ffff";
        ctx.lineWidth = 2;
        ctx.strokeRect(uiX, uiY, uiW, uiH);
        ctx.fillStyle = "#fff";
        ctx.font = "bold 20px Arial";
        ctx.textAlign = "center";
        if (isNDoubleTapHolding) {
          const spd = speedInput ? speedInput.value : "?.?";
          ctx.fillText(`SPEED: x${spd}`, uiX + uiW / 2, uiY + 27);
        } else {
          ctx.fillText(`HEIGHT: ${laneCoverHeight}px`, uiX + uiW / 2, uiY + 27);
        }
      }
    }
    function loop(timestamp) {
      if (!lastTime) lastTime = timestamp;
      const deltaTime = timestamp - lastTime;
      lastTime = timestamp;
      if (isCalibrating && audioContext) {
        const now = audioContext.currentTime;
        const relative = now - calibrationStartTime;
        const beatInterval = 60 / CALIBRATION_BPM;
        const beatProgress = relative % beatInterval / beatInterval;
        if (beatProgress < 0.2) {
          calibrationVisual.style.background = "#fff";
          calibrationVisual.style.transform = "scale(1.2)";
        } else {
          calibrationVisual.style.background = "#333";
          calibrationVisual.style.transform = "scale(1.0)";
        }
        const beatIndex = Math.floor(relative / beatInterval);
        if (beatIndex < 4) {
          calibrationStatus.textContent = `Get Ready... ${4 - beatIndex}`;
        } else if (beatIndex < CALIBRATION_BEATS) {
          calibrationStatus.textContent = "TAP!";
        } else {
          calibrationStatus.textContent = "Analyzing...";
        }
      } else {
        update(deltaTime);
        draw();
      }
      if (isCountdown && countdownValue > 0 && ctx) {
        ctx.fillStyle = "#e040fb";
        ctx.font = "bold 80px Arial";
        ctx.textAlign = "center";
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
      if (bgVideo) bgVideo.pause();
      pauseStatusText.textContent = "PAUSED";
      pauseOverlay.style.display = "flex";
      btnResume.style.display = "block";
    }
    function resumeGame() {
      isPaused = false;
      isCountdown = true;
      countdownValue = 3;
      pauseStatusText.textContent = "3";
      btnResume.style.display = "none";
      btnRetry.style.display = "none";
      btnQuit.style.display = "none";
      const timer = setInterval(() => {
        countdownValue--;
        if (countdownValue > 0) {
          pauseStatusText.textContent = countdownValue.toString();
        } else {
          clearInterval(timer);
          finishCountdown();
        }
      }, 1e3);
    }
    function finishCountdown() {
      console.log(`finishCountdown: resuming at ${pausedOffset.toFixed(3)}s`);
      isCountdown = false;
      isPlaying = true;
      pauseOverlay.style.display = "none";
      btnRetry.style.display = "block";
      btnQuit.style.display = "block";
      playAudio(pausedOffset);
      if (bgVideo && isVideoReady) {
        bgVideo.currentTime = pausedOffset;
        bgVideo.play();
      }
    }
    function retryGame() {
      isPaused = false;
      isCountdown = false;
      pauseOverlay.style.display = "none";
      if (currentSongFolder && currentChartFilename && currentSongAudio) {
        loadSong(currentSongFolder, currentChartFilename, currentSongAudio);
      }
    }
    function quitGame() {
      isPaused = false;
      isCountdown = false;
      isPlaying = false;
      stopAudio();
      if (bgVideo) bgVideo.pause();
      pauseOverlay.style.display = "none";
      showStartScreen(true);
      controlsDiv.style.display = "block";
      if (btnPauseUI) btnPauseUI.style.display = "none";
    }
    btnResume.addEventListener("click", resumeGame);
    btnRetry.addEventListener("click", retryGame);
    btnQuit.addEventListener("click", quitGame);
    async function showResults() {
      if (resCombo) resCombo.textContent = stats.maxCombo.toString();
      if (resAvg) {
        const avg = stats.hitCount > 0 ? (stats.totalErrorMs / stats.hitCount).toFixed(1) : "0";
        resAvg.textContent = avg;
      }
      const isClear = isTrackCleared(gaugeType, currentHealth, isTrackFailed);
      const scoreResult = calculateScore(totalMaxScore, lostScore, isClear);
      const scaledScore = scoreResult.scaledScore;
      let rank = scoreResult.rank;
      if (resultsOverlay) {
        resultsOverlay.style.display = "block";
        const resTitle = resultsOverlay.querySelector("h2");
        if (resTitle) {
          if (isClear) {
            resTitle.textContent = "TRACK CLEAR";
            resTitle.style.color = "#00ffff";
          } else {
            resTitle.textContent = "TRACK FAILED";
            resTitle.style.color = "#ff0000";
          }
        }
      }
      if (assistSelect?.value === "blue_to_white") ;
      else if (assistSelect?.value === "space_boost") ;
      else if (assistSelect?.value === "auto_space") ;
      if (randomSelect?.value === "shuffle_color") ;
      else if (randomSelect?.value === "shuffle_chaos") ;
      else if (randomSelect?.value === "mirror") ;
      if (isBattleSelectMode && wsBattle && wsBattle.readyState === WebSocket.OPEN) {
        wsBattle.send(JSON.stringify({
          type: "results",
          score: scaledScore,
          clearRate: scoreResult.ratio * 100,
          maxCombo: stats.maxCombo,
          isClear,
          rank
        }));
      }
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
                resultStatusTitle.style.color = "#ffd700";
                playSE("se_clear");
              } else {
                resultStatusTitle.textContent = "YOU LOSE... 😢";
                resultStatusTitle.style.color = "#ff3d00";
                playSE("se_fail");
              }
            } else if (opponentName && opponentName.textContent === "CPU_Rival_99") {
              const userRatio = scoreResult.ratio;
              const cpuRatio = totalMaxScore > 0 ? rivalPassedMaxScore / totalMaxScore : 0;
              if (userRatio >= cpuRatio) {
                resultStatusTitle.textContent = "YOU WIN! 🏆";
                resultStatusTitle.style.color = "#ffd700";
                playSE("se_clear");
              } else {
                resultStatusTitle.textContent = "YOU LOSE... 😢";
                resultStatusTitle.style.color = "#ff3d00";
                playSE("se_fail");
              }
            } else {
              resultStatusTitle.textContent = "WAITING FOR OPPONENT...";
              resultStatusTitle.style.color = "#888";
              if (isClear) playSE("se_clear");
              else playSE("se_fail");
            }
          } else {
            if (isClear) {
              resultStatusTitle.textContent = "TRACK CLEAR";
              resultStatusTitle.style.color = "#00ffff";
              playSE("se_clear");
            } else {
              resultStatusTitle.textContent = "TRACK FAILED";
              resultStatusTitle.style.color = "#ff0000";
              playSE("se_fail");
            }
          }
        }
        if (resultsOverlay) resultsOverlay.style.display = "none";
        if (canvas) canvas.style.display = "none";
        customResultScreen.style.display = "flex";
        startResultBlinking();
      }
    }
    let blinkingTimer = null;
    function startResultBlinking() {
      if (blinkingTimer) return;
      let toggle = false;
      blinkingTimer = window.setInterval(() => {
        toggle = !toggle;
        if (imgResCritical) imgResCritical.src = toggle ? SKIN.resCritical2.src : SKIN.resCritical1.src;
        if (imgResGreat) imgResGreat.src = SKIN.resGreat1.src;
        if (imgResGood) imgResGood.src = SKIN.resGood1.src;
        if (imgResFail) imgResFail.src = SKIN.resFail1.src;
        if (imgResMiss) imgResMiss.src = toggle ? SKIN.resMiss2.src : SKIN.resMiss1.src;
      }, 80);
    }
    function stopResultBlinking() {
      if (blinkingTimer) {
        clearInterval(blinkingTimer);
        blinkingTimer = null;
      }
    }
    if (speedInput && speedDisplay) {
      speedInput.addEventListener("input", () => {
        const multiplier = parseFloat(speedInput.value);
        currentNoteSpeed = BASE_NOTE_SPEED * multiplier;
        speedDisplay.textContent = multiplier.toFixed(1);
        savePlayerSettings();
      });
    }
    if (laneWidthInput && laneWidthDisplay) {
      laneWidthInput.addEventListener("input", () => {
        currentLaneWidth = parseInt(laneWidthInput.value);
        laneWidthDisplay.textContent = currentLaneWidth.toString();
        resize();
        savePlayerSettings();
      });
    }
    if (laneOpacityInput && laneOpacityDisplay) {
      laneOpacityInput.addEventListener("input", () => {
        laneOpacity = parseInt(laneOpacityInput.value) / 100;
        laneOpacityDisplay.textContent = laneOpacityInput.value;
        savePlayerSettings();
      });
    }
    if (btnRandom) {
      btnRandom.addEventListener("click", () => {
        currentMode = "random";
        isPlaying = true;
        resetStats();
        bpmChanges = [{ beat: 0, bpm: 120, time: 0 }];
        notes.length = 0;
        stopAudio();
        if (controlsDiv) controlsDiv.style.display = "none";
        if (startScreen) startScreen.style.display = "none";
      });
    }
    if (btnChart) {
      btnChart.addEventListener("click", async () => {
        if (startScreen) startScreen.style.display = "none";
        try {
          initAudio();
        } catch (e) {
          alert("Audio Context Error: " + e);
          return;
        }
        if (audioInput.files && audioInput.files[0]) {
          const file = audioInput.files[0];
          try {
            const arrayBuffer = await file.arrayBuffer();
            audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
          } catch (e) {
            alert("Audio Decode Error: " + e);
            return;
          }
        } else {
          alert("Please select an audio file!");
          return;
        }
        if (chartInput.files && chartInput.files[0]) {
          const file = chartInput.files[0];
          let text = await file.text();
          if (text.charCodeAt(0) === 65279) text = text.slice(1);
          try {
            const json = JSON.parse(text);
            if (!json.notes || !Array.isArray(json.notes)) {
              alert('Invalid Chart Data: Missing "notes" array.');
              return;
            }
            chartData = parseChart$1(json);
          } catch (e) {
            alert("Invalid JSON: " + e);
            return;
          }
        } else {
          chartData = generateAutoChart(110, audioBuffer.duration);
        }
        currentMode = "chart";
        isPlaying = true;
        resetStats();
        notes.length = 0;
        nextNoteIndex = 0;
        if (controlsDiv) controlsDiv.style.display = "none";
        if (resultsOverlay) resultsOverlay.style.display = "none";
        playAudio();
      });
    }
    const DIFF_LABELS = {
      "no": "Normal",
      "st": "Standard",
      "ad": "Advanced",
      "pr": "Provecta",
      "et": "Eternal"
    };
    const DIFF_COLORS = {
      "no": "#4caf50",
      // Green
      "st": "#2196f3",
      // Blue
      "ad": "#f5deb3",
      // Wheat (小麦色)
      "pr": "#f44336",
      // Red (Original)
      "et": "#e040fb"
      // Purple (Eternal)
    };
    const DIFF_FILTERS = {
      "no": "hue-rotate(120deg) saturate(1.2)",
      // Green
      "st": "hue-rotate(240deg) saturate(1.2)",
      // Blue
      "ad": "hue-rotate(40deg) brightness(1.7) saturate(0.6)",
      // Wheat
      "pr": "none",
      // Red (Original)
      "et": "hue-rotate(270deg) saturate(1.2)"
      // Purple
    };
    let selectedSongIndex = 0;
    let selectedDiffIndex = 0;
    let availableSongs = [];
    window.addEventListener("keydown", (e) => {
      if (songSelectOverlay.style.display !== "none") {
        const activeEl = document.activeElement;
        const isInputField = activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA");
        if (isInputField) return;
        if (isBattleSelectMode && myBattleRole === "p2") {
          if (e.key !== "Escape") {
            e.preventDefault();
            return;
          }
        }
        if (e.key === "Escape") {
          if (isInfosLoading) return;
          playSE("se_cancel");
          songSelectOverlay.style.display = "none";
          if (isBattleSelectMode) {
            songSelectOverlay.classList.remove("battle-mode");
            if (wsBattle) {
              wsBattle.close();
              wsBattle = null;
            }
            openBattleLobby();
          } else {
            if (startScreen) startScreen.style.display = "flex";
            playBGM("bgm_title");
          }
          return;
        }
        console.log("Song Select Nav Key:", e.key);
        const updateDiff = (delta) => {
          selectedDiffIndex = (selectedDiffIndex + delta + 5) % 5;
          renderRightColumn();
          playSE("se_select");
        };
        const startSelected = () => {
          const song = availableSongs[selectedSongIndex];
          if (!song || !song.charts) return;
          const buttonOrder = ["no", "st", "ad", "pr", "et"];
          const diffKey = buttonOrder[selectedDiffIndex];
          const chartInfos = song.chartInfos || {};
          const charts = song.charts;
          const matchingKey = Object.keys(charts).find((k) => {
            const filename = charts[k];
            const info = chartInfos[filename];
            let mode = "8key";
            if (filename.toLowerCase().includes("4k")) mode = "4key";
            else if (filename.toLowerCase().includes("6k")) mode = "6key";
            else if (filename.toLowerCase().includes("12k")) mode = "12key";
            if (mode !== selectedModeFilter) return false;
            let effectiveDiff = info && info.difficulty ? info.difficulty : k.split("_")[0];
            return effectiveDiff === diffKey;
          });
          if (matchingKey) {
            playSE("se_decide");
            if (isBattleSelectMode && wsBattle && wsBattle.readyState === WebSocket.OPEN && myBattleRole === "p1") {
              wsBattle.send(JSON.stringify({
                type: "song_decide",
                songFolder: song.folder,
                chartName: song.charts[matchingKey],
                audioName: song.audio
              }));
            }
            loadSong(song.folder, song.charts[matchingKey], song.audio);
          }
        };
        if (e.key.toLowerCase() === "k" || e.key === "ArrowDown") {
          e.preventDefault();
          selectedSongIndex = (selectedSongIndex + 1) % availableSongs.length;
          renderSongSelectInternal();
          playSE("se_select");
          if (isBattleSelectMode && wsBattle && wsBattle.readyState === WebSocket.OPEN && myBattleRole === "p1") {
            wsBattle.send(JSON.stringify({ type: "cursor_move", index: selectedSongIndex }));
          }
        } else if (e.key.toLowerCase() === "d" || e.key === "ArrowUp") {
          e.preventDefault();
          selectedSongIndex = (selectedSongIndex - 1 + availableSongs.length) % availableSongs.length;
          renderSongSelectInternal();
          playSE("se_select");
          if (isBattleSelectMode && wsBattle && wsBattle.readyState === WebSocket.OPEN && myBattleRole === "p1") {
            wsBattle.send(JSON.stringify({ type: "cursor_move", index: selectedSongIndex }));
          }
        } else if (e.key.toLowerCase() === "l" || e.key === "ArrowRight") {
          e.preventDefault();
          updateDiff(1);
          if (isBattleSelectMode && wsBattle && wsBattle.readyState === WebSocket.OPEN && myBattleRole === "p1") {
            wsBattle.send(JSON.stringify({ type: "diff_change", index: selectedDiffIndex }));
          }
        } else if (e.key.toLowerCase() === "s" || e.key === "ArrowLeft") {
          e.preventDefault();
          updateDiff(-1);
          if (isBattleSelectMode && wsBattle && wsBattle.readyState === WebSocket.OPEN && myBattleRole === "p1") {
            wsBattle.send(JSON.stringify({ type: "diff_change", index: selectedDiffIndex }));
          }
        } else if (e.key === "Enter" || e.key.toLowerCase() === "f" || e.key.toLowerCase() === "j") {
          e.preventDefault();
          startSelected();
        } else if (e.key === " " && !e.repeat) {
          if (controlsDiv) {
            const isShown = controlsDiv.classList.contains("show-options");
            if (isShown) {
              controlsDiv.classList.remove("show-options");
            } else {
              controlsDiv.classList.add("show-options");
              playSE("se_option");
            }
          }
          e.preventDefault();
        }
      }
    });
    function updateModeTabsUI() {
      const container = document.getElementById("mode-tabs-container");
      if (container) {
        Array.from(container.children).forEach((child) => {
          const isSelected = child.textContent.toLowerCase().replace(" ", "") === selectedModeFilter;
          child.style.background = isSelected ? "#00bcd4" : "#333";
          child.style.border = isSelected ? "2px solid #00bcd4" : "2px solid #555";
        });
      }
    }
    let isInfosLoading = false;
    async function loadSongList() {
      if (isInfosLoading) return;
      isInfosLoading = true;
      try {
        const res = await fetch(`songs/list.json?t=${Date.now()}`);
        const fullList = await res.json();
        const list = fullList.filter((song) => song.enabled !== false);
        await Promise.all(list.map(async (song) => {
          song.chartInfos = {};
          if (song.charts) {
            const filenames = Object.keys(song.charts).map((k) => song.charts[k]);
            const uniqueFilenames = [...new Set(filenames)];
            await Promise.all(uniqueFilenames.map(async (filename) => {
              try {
                const cRes = await fetch(`songs/${song.folder}/${filename}?t=${Date.now()}`);
                if (cRes.ok) {
                  const blob = await cRes.blob();
                  const text = await blob.text();
                  const cleanText = text.replace(/^\uFEFF/, "");
                  const val = JSON.parse(cleanText);
                  song.chartInfos[filename] = {};
                  if (val.difficulty) {
                    song.chartInfos[filename].difficulty = val.difficulty;
                  }
                  if (val.level !== void 0) {
                    song.chartInfos[filename].level = val.level;
                  }
                  console.log(`Loaded metadata for ${filename}:`, song.chartInfos[filename]);
                }
              } catch (e) {
              }
            }));
          }
        }));
        availableSongs = list;
        let allScores = {};
        try {
          const scoresRes = await fetch(`scores.json?t=${Date.now()}`);
          if (scoresRes.ok) {
            allScores = await scoresRes.json();
          }
        } catch (e) {
          console.error("Failed to fetch scores.json", e);
        }
        window.currentAllScores = allScores;
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
      songListDiv.innerHTML = "";
      songListDiv.style.display = "flex";
      songListDiv.style.overflow = "hidden";
      songListDiv.style.flexDirection = "column";
      const contentArea = document.createElement("div");
      contentArea.style.flex = "1";
      contentArea.style.display = "flex";
      contentArea.style.width = "100%";
      contentArea.style.overflow = "hidden";
      songListDiv.appendChild(contentArea);
      const leftCol = document.createElement("div");
      leftCol.id = "song-select-left-col";
      leftCol.style.flex = "1";
      leftCol.style.display = "flex";
      leftCol.style.flexDirection = "column";
      leftCol.style.alignItems = "center";
      leftCol.style.justifyContent = "center";
      leftCol.style.overflow = "hidden";
      leftCol.style.position = "relative";
      const rollContainer = document.createElement("div");
      rollContainer.id = "song-roll-container";
      rollContainer.style.position = "absolute";
      rollContainer.style.top = "50%";
      rollContainer.style.left = "0";
      rollContainer.style.width = "100%";
      rollContainer.style.height = "0";
      rollContainer.style.display = "block";
      availableSongs.forEach((song, idx) => {
        const banner = document.createElement("div");
        banner.className = "song-banner";
        banner.style.width = "600px";
        banner.style.height = "150px";
        banner.style.marginBottom = "30px";
        banner.style.transition = "all 0.4s cubic-bezier(0.16, 1, 0.3, 1)";
        banner.style.backgroundSize = "cover";
        banner.style.backgroundPosition = "center";
        banner.style.borderRadius = "12px";
        banner.style.border = "2px solid rgba(255,255,255,0.1)";
        banner.style.cursor = "pointer";
        banner.style.boxSizing = "border-box";
        if (song.icon) {
          banner.style.backgroundImage = `url('${song.icon}')`;
        } else {
          banner.style.backgroundColor = "#333";
          banner.textContent = song.title;
          banner.style.display = "flex";
          banner.style.justifyContent = "center";
          banner.style.alignItems = "center";
          banner.style.color = "white";
          banner.style.fontSize = "1.5em";
          banner.style.fontWeight = "bold";
        }
        banner.addEventListener("click", () => {
          selectedSongIndex = idx;
          renderSongSelectInternal();
          playSE("se_select");
        });
        rollContainer.appendChild(banner);
      });
      leftCol.appendChild(rollContainer);
      contentArea.appendChild(leftCol);
      const rightCol = document.createElement("div");
      rightCol.id = "song-select-right-col";
      rightCol.style.flex = "1";
      rightCol.style.display = "flex";
      rightCol.style.flexDirection = "column";
      rightCol.style.alignItems = "center";
      rightCol.style.justifyContent = "center";
      rightCol.style.gap = "20px";
      rightCol.style.background = "rgba(0,0,0,0.5)";
      rightCol.style.borderLeft = "1px solid #444";
      contentArea.appendChild(rightCol);
    }
    function updateSongSelectVisuals() {
      const rollContainer = document.getElementById("song-roll-container");
      if (!rollContainer || availableSongs.length === 0) return;
      const bannerHeight = 150;
      const bannerMargin = 30;
      const totalStep = bannerHeight + bannerMargin;
      Array.from(rollContainer.children).forEach((child, idx) => {
        const banner = child;
        let diff = idx - interpolatedSongIndex;
        const halfLen = availableSongs.length / 2;
        if (diff > halfLen) diff -= availableSongs.length;
        if (diff < -halfLen) diff += availableSongs.length;
        const targetY = diff * totalStep;
        const absDiff = Math.abs(diff);
        const scale = Math.max(0.6, 1.2 - absDiff * 0.4);
        const opacity = Math.max(0.2, 1 - absDiff * 0.5);
        const isSelected = Math.abs(diff) < 0.5;
        banner.style.position = "absolute";
        banner.style.left = "50%";
        banner.style.transform = `translate(-50%, ${targetY - bannerHeight / 2}px) scale(${scale})`;
        banner.style.opacity = opacity.toString();
        banner.style.zIndex = isSelected ? "10" : "5";
        if (isSelected) {
          const buttonOrder = ["no", "st", "ad", "pr", "et"];
          const diffKey = buttonOrder[selectedDiffIndex] || "no";
          const diffColor = DIFF_COLORS[diffKey] || "#e040fb";
          banner.style.border = `4px solid ${diffColor}`;
          banner.style.boxShadow = `0 0 40px ${diffColor}`;
        } else {
          banner.style.border = "2px solid rgba(255,255,255,0.2)";
          banner.style.boxShadow = "none";
        }
      });
    }
    function animateSongSelect() {
      if (!songSelectOverlay || songSelectOverlay.style.display === "none") {
        isSongSelectAnimating = false;
        return;
      }
      isSongSelectAnimating = true;
      let diff = selectedSongIndex - interpolatedSongIndex;
      const halfLen = availableSongs.length / 2;
      if (diff > halfLen) diff -= availableSongs.length;
      if (diff < -halfLen) diff += availableSongs.length;
      interpolatedSongIndex += diff * 0.1;
      if (interpolatedSongIndex < 0) interpolatedSongIndex += availableSongs.length;
      if (interpolatedSongIndex >= availableSongs.length) interpolatedSongIndex -= availableSongs.length;
      updateSongSelectVisuals();
      requestAnimationFrame(animateSongSelect);
    }
    function renderRightColumn() {
      const rightCol = document.getElementById("song-select-right-col");
      if (!rightCol) return;
      rightCol.innerHTML = "";
      const song = availableSongs[selectedSongIndex];
      if (!song) return;
      const allScores = window.currentAllScores || {};
      if (song && song.charts) {
        if (song.icon) {
          const iconImg = document.createElement("img");
          iconImg.src = song.icon;
          iconImg.style.width = "250px";
          iconImg.style.height = "250px";
          iconImg.style.objectFit = "cover";
          iconImg.style.borderRadius = "8px";
          iconImg.style.marginBottom = "10px";
          iconImg.style.boxShadow = "0 0 15px rgba(224, 64, 251, 0.3)";
          rightCol.appendChild(iconImg);
        }
        const title = document.createElement("h2");
        title.textContent = song.title;
        title.style.color = "white";
        title.style.margin = "0 0 30px 0";
        title.style.textShadow = "0 0 10px #e040fb";
        rightCol.appendChild(title);
        const buttonOrder = ["no", "st", "ad", "pr", "et"];
        const chartInfos = song.chartInfos || {};
        const btnContainer = document.createElement("div");
        btnContainer.style.display = "flex";
        btnContainer.style.flexDirection = "row";
        btnContainer.style.flexWrap = "wrap";
        btnContainer.style.justifyContent = "center";
        btnContainer.style.gap = "30px";
        btnContainer.style.marginTop = "20px";
        rightCol.appendChild(btnContainer);
        buttonOrder.forEach((diffKey2) => {
          const charts2 = song.charts || {};
          const matchingKey2 = Object.keys(charts2).find((k) => {
            const filename2 = charts2[k];
            const info = chartInfos[filename2];
            let mode = "8key";
            if (filename2.toLowerCase().includes("4k")) mode = "4key";
            else if (filename2.toLowerCase().includes("6k")) mode = "6key";
            else if (filename2.toLowerCase().includes("12k")) mode = "12key";
            if (mode !== selectedModeFilter) return false;
            let effectiveDiff = "";
            if (info && info.difficulty) {
              effectiveDiff = info.difficulty;
            } else {
              effectiveDiff = k.split("_")[0];
            }
            return effectiveDiff === diffKey2;
          });
          const btn = document.createElement("div");
          const color = DIFF_COLORS[diffKey2];
          const isSelected = buttonOrder.indexOf(diffKey2) === selectedDiffIndex;
          btn.style.display = "flex";
          btn.style.flexDirection = "column";
          btn.style.alignItems = "center";
          btn.style.cursor = matchingKey2 ? "pointer" : "default";
          btn.style.transition = "transform 0.2s";
          btn.style.padding = "10px";
          btn.style.borderRadius = "10px";
          if (isSelected) {
            btn.style.background = "rgba(224, 64, 251, 0.2)";
            btn.style.border = "2px solid #e040fb";
            btn.style.transform = "scale(1.1)";
          } else {
            btn.style.background = "transparent";
            btn.style.border = "2px solid transparent";
          }
          if (matchingKey2) {
            btn.onmouseover = () => {
              if (!isSelected) btn.style.transform = "scale(1.05)";
            };
            btn.onmouseout = () => {
              if (!isSelected) btn.style.transform = "scale(1.0)";
            };
          }
          const img = document.createElement("img");
          let imgSrc = "";
          const filename = matchingKey2 ? charts2[matchingKey2] : "";
          const chartInfo = filename ? chartInfos[filename] : null;
          if (matchingKey2 && chartInfo && chartInfo.level && chartInfo.level > 0) {
            const levelStr = chartInfo.level.toString();
            imgSrc = `assets/選曲画面/${encodeURIComponent("難易度ロゴ")}${levelStr}.png`;
          } else {
            imgSrc = `assets/選曲画面/${encodeURIComponent("難易度ロゴ譜面なし")}.png`;
          }
          img.src = imgSrc;
          img.alt = `${diffKey2.toUpperCase()}`;
          img.style.height = "100px";
          img.style.objectFit = "contain";
          img.style.display = "block";
          if (!matchingKey2) {
            img.style.opacity = "0.2";
            img.style.filter = "grayscale(1)";
          } else {
            img.style.filter = DIFF_FILTERS[diffKey2] || "none";
          }
          img.onerror = () => {
            img.style.display = "none";
            const textSpan = document.createElement("span");
            textSpan.textContent = DIFF_LABELS[diffKey2] || diffKey2.toUpperCase();
            textSpan.style.color = matchingKey2 ? color : "#333";
            textSpan.style.fontSize = "1.5em";
            textSpan.style.fontWeight = "bold";
            btn.prepend(textSpan);
          };
          btn.appendChild(img);
          if (matchingKey2) {
            const songScores = allScores[song.id] || [];
            const myBest = songScores.filter((s) => s.difficulty === filename && s.playerName === currentPlayer).sort((a, b) => b.score - a.score)[0];
            if (myBest) {
              const scoreSpan = document.createElement("span");
              scoreSpan.textContent = myBest.score.toLocaleString();
              scoreSpan.style.fontSize = "1em";
              scoreSpan.style.color = "#fff";
              scoreSpan.style.marginTop = "10px";
              scoreSpan.style.textShadow = "0 0 5px rgba(0,0,0,0.8)";
              btn.appendChild(scoreSpan);
            }
            btn.onclick = (e) => {
              e.stopPropagation();
              if (selectedModeFilter === "12key") playSE("se_decide_extra");
              else playSE("se_decide");
              const targetChartName = charts2[matchingKey2];
              loadSong(song.folder, targetChartName, song.audio);
            };
          }
          btnContainer.appendChild(btn);
        });
        const diffKey = buttonOrder[selectedDiffIndex];
        const charts = song.charts || {};
        const matchingKey = Object.keys(charts).find((k) => {
          const filename = charts[k];
          let mode = "8key";
          if (filename.toLowerCase().includes("4k")) mode = "4key";
          else if (filename.toLowerCase().includes("6k")) mode = "6key";
          else if (filename.toLowerCase().includes("12k")) mode = "12key";
          if (mode !== selectedModeFilter) return false;
          let effectiveDiff = chartInfos[filename]?.difficulty || k.split("_")[0];
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
          } catch (e) {
            console.error(e);
          }
          const bestPanel = document.createElement("div");
          bestPanel.style.cssText = "width: 80%; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.15); border-radius: 12px; padding: 15px 25px; margin-top: 25px; box-sizing: border-box; display: flex; flex-direction: column; gap: 8px; font-family: sans-serif; box-shadow: 0 5px 15px rgba(0,0,0,0.5);";
          if (bestData) {
            const rankColor = bestData.isClear ? "#ffd700" : "#ff4444";
            const statusText = bestData.isClear ? "CLEAR" : "FAILED";
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
    function renderSongSelectInternal() {
      if (!isSongSelectAnimating) {
        animateSongSelect();
      }
      const currentSong = availableSongs[selectedSongIndex];
      if (currentSong) {
        let previewSrc = "";
        if (currentSong.previewBgm) {
          if (currentSong.previewBgm.startsWith("assets/")) {
            previewSrc = currentSong.previewBgm;
          } else {
            previewSrc = `songs/${currentSong.folder}/${currentSong.previewBgm}`;
          }
        } else if (currentSong.title === "漁火") {
          previewSrc = "assets/曲/漁火_選曲画面.m4a";
        } else if (currentSong.title === "Ceviche") {
          previewSrc = "assets/曲/Ceviche_選曲画面.m4a";
        }
        if (previewSrc) {
          if (!songPreviewBGM || songPreviewBGM.src.indexOf(encodeURI(previewSrc)) === -1) {
            if (songPreviewBGM) {
              const prev = songPreviewBGM;
              fadeVolume(prev, 0, 300, () => {
                prev.pause();
              });
            }
            if (currentBGM) {
              fadeVolume(currentBGM, 0, 300);
            }
            songPreviewBGM = new Audio(previewSrc);
            songPreviewBGM.loop = false;
            songPreviewBGM.volume = 0;
            songPreviewBGM.addEventListener("ended", () => {
              if (AUDIO_ASSETS.bgm_select) {
                if (AUDIO_ASSETS.bgm_select.paused) {
                  AUDIO_ASSETS.bgm_select.volume = 0;
                  playBGM("bgm_select");
                } else {
                  fadeVolume(AUDIO_ASSETS.bgm_select, 0.5, 800);
                }
              }
            });
            songPreviewBGM.play().catch((e) => console.log("Preview play blocked", e));
            fadeVolume(songPreviewBGM, 0.5, 800);
          }
        } else {
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
              playBGM("bgm_select");
            } else {
              fadeVolume(AUDIO_ASSETS.bgm_select, 0.5, 800);
            }
          }
        }
      }
      updateSongSelectVisuals();
      renderRightColumn();
    }
    let currentChartFilename = "";
    let currentSongFolder = "";
    let currentSongAudio = "";
    async function loadSong(songFolder, chartFilename, audioFilename) {
      stopBGM();
      const song = availableSongs.find((s) => s.folder === songFolder);
      currentSongFolder = songFolder;
      currentChartFilename = chartFilename;
      currentSongAudio = audioFilename;
      currentSongBackground = null;
      isMVLayout = false;
      currentMode = "chart";
      if (chartFilename.toLowerCase().includes("4k")) currentKeyMode = "4key";
      else if (chartFilename.toLowerCase().includes("6k")) currentKeyMode = "6key";
      else if (chartFilename.toLowerCase().includes("8k")) currentKeyMode = "8key";
      else if (chartFilename.toLowerCase().includes("12k")) currentKeyMode = "12key";
      else currentKeyMode = "8key";
      resize();
      resetStats();
      notes.length = 0;
      nextNoteIndex = 0;
      songSelectOverlay.style.display = "none";
      if (resultsOverlay) resultsOverlay.style.display = "none";
      if (startScreen) startScreen.style.display = "none";
      if (controlsDiv) controlsDiv.style.display = "none";
      isPaused = false;
      isCountdown = false;
      pausedOffset = 0;
      if (btnPauseUI) btnPauseUI.style.display = "block";
      if (introOverlay) {
        const chartInfos = song ? song.chartInfos : {};
        const info = chartInfos ? chartInfos[chartFilename] : null;
        let diffKey = "";
        if (song && song.charts) {
          diffKey = Object.keys(song.charts).find((k) => song.charts[k] === chartFilename)?.split("_")[0] || "";
        }
        if (info && info.difficulty) diffKey = info.difficulty;
        const label = DIFF_LABELS[diffKey] || diffKey.toUpperCase();
        const color = DIFF_COLORS[diffKey] || "#ffffff";
        const levelStr = info && info.level ? info.level.toString() : "?";
        if (introSongTitle) introSongTitle.textContent = song ? song.title : "Unknown Song";
        if (introSongLevel) {
          introSongLevel.textContent = `${label} ${levelStr}`;
          introSongLevel.style.borderColor = color;
          introSongLevel.style.color = color;
          introSongLevel.style.textShadow = `0 0 10px ${color}`;
        }
        introOverlay.style.display = "flex";
        void introOverlay.offsetWidth;
        introOverlay.style.opacity = "1";
        if (introSongTitle) introSongTitle.style.animation = "introZoom 5s ease-out forwards";
        if (introSongLevel) introSongLevel.style.animation = "introZoom 5s ease-out forwards";
      }
      const introPromise = (async () => {
        if (introOverlay) {
          const introVideoElement = document.getElementById("intro-video");
          if (introVideoElement) {
            if (song && song.introVideo) {
              introVideoElement.src = `songs/${songFolder}/${song.introVideo}`;
              introVideoElement.style.display = "block";
              introVideoElement.play().catch((e) => console.log("Intro video play blocked", e));
            } else {
              introVideoElement.style.display = "none";
              introVideoElement.src = "";
            }
          }
          introBGM = new Audio();
          introBGM.volume = 0.8;
          const playIntro = (src) => {
            return new Promise((resolve) => {
              introBGM.src = encodeURI(src);
              introBGM.play().then(() => {
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
        await new Promise((r) => setTimeout(r, 5e3));
      })();
      const loadResourcesPromise = (async () => {
        try {
          initAudio();
        } catch (e) {
          alert(e);
          return;
        }
        try {
          if (song && song.video) {
            isMVLayout = true;
            if (bgVideo) {
              bgVideo.pause();
              bgVideo.src = "";
              bgVideo = null;
            }
            isVideoReady = false;
            bgVideo = document.createElement("video");
            bgVideo.src = `songs/${song.folder}/${song.video}`;
            bgVideo.muted = true;
            bgVideo.loop = false;
            bgVideo.preload = "auto";
            bgVideo.addEventListener("canplay", () => {
              isVideoReady = true;
            });
            bgVideo.load();
          }
          if (song && song.background) {
            const bgImg = new Image();
            bgImg.src = song.background;
            bgImg.onload = () => {
              currentSongBackground = bgImg;
            };
          }
          const audioRes = await fetch(`songs/${songFolder}/${audioFilename}`);
          const audioBuf = await audioRes.arrayBuffer();
          audioBuffer = await audioContext.decodeAudioData(audioBuf);
          const chartRes = await fetch(`songs/${songFolder}/${chartFilename}?t=${Date.now()}`);
          const chartText = await chartRes.text();
          let text = chartText;
          if (text.charCodeAt(0) === 65279) text = text.slice(1);
          const json = JSON.parse(text);
          if (json.mode && GAME_MODES[json.mode]) {
            currentKeyMode = json.mode;
          } else {
            if (currentChartFilename.toLowerCase().includes("4k")) currentKeyMode = "4key";
            else if (currentChartFilename.toLowerCase().includes("6k")) currentKeyMode = "6key";
            else if (currentChartFilename.toLowerCase().includes("8k")) currentKeyMode = "8key";
            else if (currentChartFilename.toLowerCase().includes("12k")) currentKeyMode = "12key";
            else currentKeyMode = "8key";
          }
          resize();
          if (!json.notes || !Array.isArray(json.notes)) {
            throw new Error("Invalid Chart Data");
          }
          chartData = parseChart$1(json);
          keysoundBank.clear();
          const uniqueSoundIds = Array.from(new Set(chartData.map((n) => n.soundId).filter((s) => !!s)));
          if (uniqueSoundIds.length > 0) {
            await Promise.all(uniqueSoundIds.map(async (soundId) => {
              try {
                const res = await fetch(`songs/${songFolder}/${soundId}`);
                if (res.ok) {
                  const buf = await res.arrayBuffer();
                  const keysoundBuf = await audioContext.decodeAudioData(buf);
                  keysoundBank.set(soundId, keysoundBuf);
                }
              } catch (e) {
                console.error(`Failed to load keysound: ${soundId}`, e);
              }
            }));
          }
          const assistMode = assistSelect?.value || "none";
          const randomMode = randomSelect?.value || "none";
          if (assistMode !== "none" || randomMode !== "none") {
            chartData = applyModifiers$1(chartData, assistMode, randomMode);
          }
        } catch (e) {
          alert("Error loading song: " + e);
        }
      })();
      await Promise.all([introPromise, loadResourcesPromise]);
      resetStats();
      if (introOverlay) {
        introOverlay.style.opacity = "0";
        setTimeout(() => {
          introOverlay.style.display = "none";
          if (introSongTitle) introSongTitle.style.animation = "none";
          if (introSongLevel) introSongLevel.style.animation = "none";
          const introVideoElement = document.getElementById("intro-video");
          if (introVideoElement) {
            introVideoElement.pause();
            introVideoElement.src = "";
            introVideoElement.style.display = "none";
          }
          if (introBGM) {
            introBGM.pause();
            introBGM.src = "";
            introBGM = null;
          }
          startCountdown();
        }, 500);
      } else {
        startCountdown();
      }
    }
    function startCountdown() {
      console.log("Initiating 3s Start Sequence (Falling Notes)...");
      isPlaying = true;
      isPaused = false;
      isCountdown = false;
      isStarting = true;
      startSequenceStartTime = performance.now();
    }
    function parseChart$1(json) {
      const result = parseChart(json);
      bpmChanges = result.bpmChanges;
      layoutChanges = result.layoutChanges;
      return result.notes;
    }
    function applyModifiers$1(notes2, assist, random) {
      return applyModifiers(notes2, assist, random, currentKeyMode);
    }
    function generateAutoChart(bpm, durationSec) {
      bpmChanges = [{ time: 0, bpm, beat: 0 }];
      const msPerBeat = 6e4 / bpm;
      const totalBeats = durationSec * 1e3 / msPerBeat;
      const data = [];
      const laneMap = [0, 2, 5, 7];
      for (let i = 0; i < totalBeats; i++) {
        data.push({
          time: i * msPerBeat,
          lane: laneMap[i % 4],
          duration: 0,
          isLong: false,
          hit: false,
          beat: i
          // Assign beat
        });
      }
      return data;
    }
    let VISUAL_LANE_TARGETS = [];
    let LANE_CONFIG_TARGETS = [];
    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      HIT_Y = canvas.height - 100;
      recalculateTargets();
      if (VISUAL_LANES.length === 0) {
        VISUAL_LANES = JSON.parse(JSON.stringify(VISUAL_LANE_TARGETS));
        LANE_CONFIGS = JSON.parse(JSON.stringify(LANE_CONFIG_TARGETS));
      }
    }
    function recalculateTargets() {
      const tempWidth = currentLaneWidth;
      const getLayoutData = (type) => {
        const vLanes = [];
        const lConfigs = [];
        let sx = 0;
        if (currentKeyMode === "8key") {
          if (type === "type-a") {
            const totalPlayWidth = tempWidth * 4;
            sx = (canvas.width - totalPlayWidth) / 2;
            laneStartX = sx;
            for (let i = 0; i < 4; i++) {
              vLanes.push({ x: sx + i * tempWidth, width: tempWidth });
            }
            const assign = (keyIdx, visIdx, lbl, clr, xOff = 0, wScale = 1) => {
              lConfigs[keyIdx] = { x: sx + visIdx * tempWidth + xOff, width: tempWidth * wScale, color: clr, label: lbl };
            };
            const blueScale = 1;
            assign(0, 0, "", "#7CA4FF", 0, blueScale);
            assign(1, 0, "E/D", "#ffffff");
            assign(2, 1, "", "#7CA4FF", 0, blueScale);
            assign(3, 1, "R/F", "#ffffff");
            lConfigs[4] = { x: sx, width: totalPlayWidth, color: "#e040fb", label: "SPACE" };
            assign(5, 2, "", "#7CA4FF", 0, blueScale);
            assign(6, 2, "U/J", "#ffffff");
            assign(7, 3, "", "#7CA4FF", 0, blueScale);
            assign(8, 3, "I/K", "#ffffff");
          } else {
            const bScale = 1, wScale = 1;
            const pairGap = tempWidth * 0.02;
            const groupGap = tempWidth * 0.1;
            const totalScale = 4 * bScale + 4 * wScale;
            const totalPlayWidth = tempWidth * totalScale + 4 * pairGap + 3 * groupGap;
            sx = (canvas.width - totalPlayWidth) / 2;
            laneStartX = sx;
            const ord = [
              { idx: 0, label: "E", color: "#7CA4FF", scale: bScale, gapAfter: pairGap },
              { idx: 1, label: "D", color: "#ffffff", scale: wScale, gapAfter: groupGap },
              { idx: 2, label: "R", color: "#7CA4FF", scale: bScale, gapAfter: pairGap },
              { idx: 3, label: "F", color: "#ffffff", scale: wScale, gapAfter: groupGap },
              { idx: 5, label: "U", color: "#7CA4FF", scale: bScale, gapAfter: pairGap },
              { idx: 6, label: "J", color: "#ffffff", scale: wScale, gapAfter: groupGap },
              { idx: 7, label: "I", color: "#7CA4FF", scale: bScale, gapAfter: pairGap },
              { idx: 8, label: "K", color: "#ffffff", scale: wScale, gapAfter: 0 }
            ];
            let cx = sx;
            ord.forEach((item) => {
              const w = tempWidth * item.scale;
              vLanes.push({ x: cx, width: w });
              lConfigs[item.idx] = { x: cx, width: w, color: item.color, label: item.label };
              cx += w + item.gapAfter;
            });
            lConfigs[4] = { x: sx, width: totalPlayWidth, color: "#e040fb", label: "SPACE" };
          }
        } else if (currentKeyMode === "4key") {
          const tempWidth2 = currentLaneWidth * 1.5;
          const totalPlayWidth = tempWidth2 * 4;
          sx = (canvas.width - totalPlayWidth) / 2;
          laneStartX = sx;
          const indices = [1, 3, 6, 8];
          const labels = ["D", "F", "J", "K"];
          const colors = ["#ffffff", "#7CA4FF", "#7CA4FF", "#ffffff"];
          indices.forEach((kIdx, i) => {
            const x = sx + i * tempWidth2;
            vLanes.push({ x, width: tempWidth2 });
            lConfigs[kIdx] = { x, width: tempWidth2, color: colors[i], label: labels[i] };
          });
          lConfigs[4] = { x: sx, width: totalPlayWidth, color: "#e040fb", label: "SPACE" };
        } else if (currentKeyMode === "6key") {
          const tempWidth2 = currentLaneWidth * 1.2;
          const totalPlayWidth = tempWidth2 * 6;
          const sx2 = (canvas.width - totalPlayWidth) / 2;
          laneStartX = sx2;
          const indices = [9, 1, 3, 6, 8, 10];
          const labels = ["S", "D", "F", "J", "K", "L"];
          const colors = ["#ffffff", "#ffffff", "#ffffff", "#ffffff", "#ffffff", "#ffffff"];
          indices.forEach((kIdx, i) => {
            const x = sx2 + i * tempWidth2;
            vLanes.push({ x, width: tempWidth2 });
            lConfigs[kIdx] = { x, width: tempWidth2, color: colors[i], label: labels[i] };
          });
          lConfigs[4] = { x: sx2, width: totalPlayWidth, color: "#e040fb", label: "SPACE" };
        } else if (currentKeyMode === "12key") {
          const tempWidth2 = currentLaneWidth * 1.5;
          const totalPlayWidth = tempWidth2 * 6;
          sx = (canvas.width - totalPlayWidth) / 2;
          laneStartX = sx;
          const pairs = [
            { white: 9, blue: 11, label: "S/W" },
            // Lane 0
            { white: 1, blue: 0, label: "D/E" },
            // Lane 1
            { white: 3, blue: 2, label: "F/R" },
            // Lane 2
            { white: 6, blue: 5, label: "J/U" },
            // Lane 3
            { white: 8, blue: 7, label: "K/I" },
            // Lane 4
            { white: 10, blue: 12, label: "L/O" }
            // Lane 5
          ];
          pairs.forEach((pair, i) => {
            const x = sx + i * tempWidth2;
            vLanes.push({ x, width: tempWidth2 });
            lConfigs[pair.white] = { x, width: tempWidth2, color: "#ffffff", label: pair.label };
            lConfigs[pair.blue] = { x, width: tempWidth2, color: "#7CA4FF", label: "" };
          });
        }
        laneEndX = vLanes.length > 0 ? vLanes[vLanes.length - 1].x + vLanes[vLanes.length - 1].width : sx;
        return { vLanes, lConfigs };
      };
      const targets = getLayoutData(targetLayoutType);
      VISUAL_LANE_TARGETS = targets.vLanes;
      LANE_CONFIG_TARGETS = targets.lConfigs;
    }
    function updateLaneInterpolation() {
      const lerp = (cur, tar) => cur + (tar - cur) * LERP_SPEED;
      if (VISUAL_LANES.length !== VISUAL_LANE_TARGETS.length) {
        VISUAL_LANES = JSON.parse(JSON.stringify(VISUAL_LANE_TARGETS));
      } else {
        for (let i = 0; i < VISUAL_LANES.length; i++) {
          VISUAL_LANES[i].x = lerp(VISUAL_LANES[i].x, VISUAL_LANE_TARGETS[i].x);
          VISUAL_LANES[i].width = lerp(VISUAL_LANES[i].width, VISUAL_LANE_TARGETS[i].width);
        }
      }
      if (LANE_CONFIGS.length !== LANE_CONFIG_TARGETS.length) {
        LANE_CONFIGS = JSON.parse(JSON.stringify(LANE_CONFIG_TARGETS));
      }
      for (let i = 0; i < LANE_CONFIGS.length; i++) {
        if (!LANE_CONFIGS[i] || !LANE_CONFIG_TARGETS[i]) continue;
        LANE_CONFIGS[i].x = lerp(LANE_CONFIGS[i].x, LANE_CONFIG_TARGETS[i].x);
        LANE_CONFIGS[i].width = lerp(LANE_CONFIGS[i].width, LANE_CONFIG_TARGETS[i].width);
        LANE_CONFIGS[i].label = LANE_CONFIG_TARGETS[i].label;
        LANE_CONFIGS[i].color = LANE_CONFIG_TARGETS[i].color;
      }
    }
    window.addEventListener("resize", resize);
    resize();
    window.addEventListener("keydown", (e) => {
      const activeEl = document.activeElement;
      activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA");
      if (isCalibrating) {
        if (e.code === "Space") {
          e.preventDefault();
          if (!e.repeat && audioContext && audioContext.state === "running") {
            calibrationTaps.push(audioContext.currentTime);
          }
        }
        return;
      }
      if (e.key === "Escape" || e.key === "Esc" || e.code === "Escape") {
        console.log("Escape key pressed, toggling pause...");
        togglePause();
        e.preventDefault();
        return;
      }
      const now = performance.now();
      const keyLower = e.key.toLowerCase();
      if (keyLower === "n" && !e.repeat) {
        isNHolding = true;
        hasAdjustedDuringNHold = false;
        if (now - lastNPressTime < DOUBLE_TAP_WINDOW) {
          isNDoubleTapHolding = true;
          originalLaneCoverHeight = laneCoverHeight;
          originalIsLaneCoverEnabled = isLaneCoverEnabled;
          laneCoverHeight = 0;
          isLaneCoverEnabled = false;
        }
        lastNPressTime = now;
      }
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        if (isNDoubleTapHolding) {
          e.preventDefault();
          hasAdjustedDuringNHold = true;
          if (speedInput) {
            const currentVal = parseFloat(speedInput.value);
            const step = 0.1;
            const newVal = e.key === "ArrowUp" ? currentVal + step : Math.max(0.1, currentVal - step);
            speedInput.value = newVal.toFixed(1);
            currentNoteSpeed = BASE_NOTE_SPEED * newVal;
            if (speedDisplay) speedDisplay.textContent = newVal.toFixed(1);
            savePlayerSettings();
          }
          return;
        } else if (isNHolding) {
          e.preventDefault();
          hasAdjustedDuringNHold = true;
          const step = 10;
          laneCoverHeight = e.key === "ArrowUp" ? Math.max(0, laneCoverHeight - step) : Math.min(canvas.height, laneCoverHeight + step);
          if (laneCoverHeightInput) laneCoverHeightInput.value = laneCoverHeight.toString();
          if (laneCoverHeightDisplay) laneCoverHeightDisplay.textContent = laneCoverHeight.toString();
          savePlayerSettings();
          return;
        }
      }
      const keyIndex = KEYS.indexOf(e.key.toLowerCase());
      console.log(`Key: ${keyLower}, Index: ${keyIndex}, Mode: ${currentKeyMode}`);
      if (keyIndex !== -1) {
        const allowedIndices = GAME_MODES[currentKeyMode].indices;
        if (!allowedIndices.includes(keyIndex)) {
          console.log(`Key ${keyIndex} NOT ALLOWED in ${currentKeyMode}`);
          return;
        }
      }
      if (keyIndex !== -1 && !pressedKeys[keyIndex]) {
        pressedKeys[keyIndex] = true;
        const currentTimeMs = getAudioTime() * 1e3;
        const forbiddenNote = notes.find(
          (n) => n.laneIndex === keyIndex && n.isLong && n.type === "death" && currentTimeMs >= n.scheduledTime && currentTimeMs <= n.scheduledTime + n.duration
        );
        if (forbiddenNote) {
          console.log("DEATH LONG NOTE HIT - FAIL");
          failGame();
          return;
        }
        const targetNotes = notes.filter(
          (n) => n.active && n.laneIndex === keyIndex && !n.processed
        ).sort((a, b) => a.scheduledTime - b.scheduledTime);
        if (targetNotes.length > 0) {
          const currentTimeMs2 = getAudioTime() * 1e3;
          const candidates = targetNotes.filter((n) => {
            const absError = Math.abs(currentTimeMs2 - n.scheduledTime - globalOffset);
            return absError < MISS_BOUNDARY;
          });
          if (candidates.length > 0) {
            const priorityNote = candidates.find((n) => n.type !== "death");
            const note = priorityNote || candidates[0];
            const msErrorRaw = currentTimeMs2 - note.scheduledTime;
            const msError = msErrorRaw - globalOffset;
            const absError = Math.abs(msError);
            if (note.type === "death") {
              console.log("DEATH NOTE HIT - FAIL");
              failGame();
              return;
            }
            const msRounded = Math.round(msError);
            const sign = msRounded >= 0 ? "+" : "";
            const msDisplay = `
${sign}${msRounded}ms`;
            if (absError < THRESHOLD_CRITICAL) {
              judgementText = `CRITICAL${msDisplay}`;
              judgementColor = "#00ffff";
              addHit("critical", msError);
              spawnHitEffect(note.laneIndex, "#00ffff");
            } else if (absError < THRESHOLD_GREAT) {
              judgementText = `GREAT${msDisplay}`;
              judgementColor = "#ffeb3b";
              addHit("great", msError);
              spawnHitEffect(note.laneIndex, "#ffeb3b");
            } else if (absError < THRESHOLD_GOOD) {
              judgementText = `GOOD${msDisplay}`;
              judgementColor = "#00ff00";
              addHit("good", msError);
              spawnHitEffect(note.laneIndex, "#00ff00");
            } else if (absError < THRESHOLD_FAIL) {
              judgementText = `FAIL${msDisplay}`;
              judgementColor = "#ffae00";
              addHit("fail", msError);
            } else {
              judgementText = `MISS${msDisplay}`;
              judgementColor = "#ff0000";
              addHit("miss", msError);
            }
            judgementTimer = 1e3;
            playKeysound(note.soundId);
            if (note.isLong) {
              note.processed = true;
              note.beingHeld = true;
              heldNotes[keyIndex] = note;
            } else {
              note.active = false;
            }
            logDebug(`HIT: lane=${keyIndex} error=${Math.floor(msError)}ms target=${(note.scheduledTime / 1e3).toFixed(3)}s judge=${judgementText.split("\n")[0]}`);
          } else {
            const note = targetNotes[0];
            const msError = currentTimeMs2 - note.scheduledTime - globalOffset;
            logDebug(`OUTSIDE: lane=${keyIndex} error=${Math.floor(msError)}ms target=${(note.scheduledTime / 1e3).toFixed(3)}s`);
          }
        } else {
          logDebug(`EMPTY: lane=${keyIndex}`);
        }
      }
    });
    window.addEventListener("keyup", (e) => {
      const keyLower = e.key.toLowerCase();
      if (keyLower === "n") {
        performance.now();
        if (isNDoubleTapHolding) {
          if (hasAdjustedDuringNHold) {
            laneCoverHeight = originalLaneCoverHeight;
            isLaneCoverEnabled = true;
          } else {
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
        if (!allowedIndices.includes(keyIndex)) return;
        pressedKeys[keyIndex] = false;
        if (heldNotes[keyIndex]) {
          const note = heldNotes[keyIndex];
          heldNotes[keyIndex] = null;
          note.beingHeld = false;
          const tailTime = note.scheduledTime + note.duration;
          const currentTimeMs = getAudioTime() * 1e3;
          if (currentTimeMs < tailTime - THRESHOLD_CRITICAL) {
            note.active = false;
            judgementText = "MISS\nRELEASE";
            judgementColor = "#ff0000";
            judgementTimer = 1e3;
            addHit("miss");
          }
        }
      }
    });
    requestAnimationFrame(loop);
    const sfxDecision = new Audio("assets/decision.mp3");
    sfxDecision.load();
    function playClickSound() {
      sfxDecision.currentTime = 0;
      sfxDecision.play().catch((e) => {
      });
    }
    const modeArrowLeft = document.getElementById("mode-arrow-left");
    const modeArrowRight = document.getElementById("mode-arrow-right");
    if (modeArrowLeft) {
      modeArrowLeft.addEventListener("click", () => {
        currentModeIndex = (currentModeIndex - 1 + PLAY_MODES_INFO.length) % PLAY_MODES_INFO.length;
        renderModeCarousel();
      });
    }
    if (modeArrowRight) {
      modeArrowRight.addEventListener("click", () => {
        currentModeIndex = (currentModeIndex + 1) % PLAY_MODES_INFO.length;
        renderModeCarousel();
      });
    }
    if (btnLobbyBypass) {
      btnLobbyBypass.addEventListener("click", () => {
        playSE("se_decide");
        triggerMatchFound();
        setTimeout(() => {
          enterBattleSelectScreen();
        }, 800);
      });
    }
    if (btnCloseLobby) {
      btnCloseLobby.addEventListener("click", () => {
        playSE("se_cancel");
        if (matchingTimer) clearTimeout(matchingTimer);
        if (battleLobbyOverlay) battleLobbyOverlay.style.display = "none";
        if (menuOverlay) {
          menuOverlay.style.display = "flex";
          renderModeCarousel();
        }
      });
    }
    const uiButtons = [
      btnSelectSong,
      btnCloseSelect,
      // btnStartSelect removed
      btnResume,
      btnRetry,
      btnQuit,
      btnCloseResults,
      btnPauseUI,
      btnCalibrate,
      btnCancelCalibration,
      btnOptionsToggle,
      btnRandom,
      btnChart,
      btnAddPlayer,
      btnClosePlayer,
      playerDisplay,
      playerDisplayInSelect,
      btnGaugeRoll,
      modeArrowLeft,
      modeArrowRight,
      btnLobbyBypass,
      btnCloseLobby
    ];
    uiButtons.forEach((btn) => {
      if (btn) {
        btn.addEventListener("click", playClickSound);
      }
    });
  })();
})();
