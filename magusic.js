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
    critical: 9,
    great: 8,
    good: 2,
    fail: 1,
    miss: 0
  };
  function calculateMaxScore(notes) {
    if (notes.length === 0) return 1;
    const maxWeight = SCORE_WEIGHTS.critical;
    return notes.reduce((acc, n) => acc + (n.duration > 0 ? maxWeight * 2 : maxWeight), 0);
  }
  function calculateLoss(judgmentType) {
    return 9 - SCORE_WEIGHTS[judgmentType];
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
    norma: { critical: 2, great: 1, good: 0.2, fail: -2, miss: -5 },
    life: { critical: 0.2, great: 0.1, good: 0, fail: -4, miss: -5 },
    life_hard: { critical: 0.2, great: 0.1, good: 0, fail: -5, miss: -10 }
  };
  function applyGaugeHit(currentHealth, judgmentType, gaugeType) {
    const recovery = GAUGE_RECOVERY[gaugeType][judgmentType];
    const newHealth = Math.max(0, Math.min(100, currentHealth + recovery));
    const isDead = (gaugeType === "life" || gaugeType === "life_hard") && newHealth <= 0;
    return { health: newHealth, isDead };
  }
  function getInitialHealth(gaugeType) {
    return gaugeType === "life" || gaugeType === "life_hard" ? 100 : 0;
  }
  function isTrackCleared(gaugeType, finalHealth, isDead) {
    if (isDead) return false;
    if (gaugeType === "norma") return finalHealth >= 70;
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
    let currentLaneWidth = 100;
    let isLaneCoverEnabled = false;
    let laneCoverHeight = 300;
    let laneCoverSpeedMult = 1;
    let gaugeType = "norma";
    let isAutoPlay = false;
    let isMVLayout = false;
    let laneOpacity = 1;
    let currentSkin = "default";
    let isDaniMode = false;
    let daniCourses = [];
    let currentDaniCourse = null;
    let daniSongIndex = 0;
    let daniHealth = 100;
    const DANI_PENALTIES = {
      miss: 6,
      fail: 6,
      good: 2,
      great: 0,
      critical: -0.5
    };
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
    const loadingOverlay = document.getElementById("loading-overlay");
    const shutterOverlay = document.getElementById("shutter-overlay");
    const debugLog = document.getElementById("debug-log");
    const daniSelectOverlay = document.getElementById("dani-select-overlay");
    const daniListDiv = document.getElementById("dani-list");
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
    const loadingText = document.getElementById("loading-text");
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
    let previewNotes = [];
    let previewJudgementText = "";
    let previewJudgementColor = "#fff";
    let previewJudgementTimer = 0;
    let lastPreviewSpawnTime = 0;
    const PREVIEW_INTERVAL = 1e3;
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
        if (isDaniMode && currentDaniCourse) {
          daniSongIndex++;
          if (daniSongIndex < 4) {
            const nextSong = currentDaniCourse.songs[daniSongIndex];
            loadSong(nextSong.folder, nextSong.chart, nextSong.audio);
            return;
          } else {
            alert(`Congratulations! You passed ${currentDaniCourse.title}!`);
            isDaniMode = false;
            currentDaniCourse = null;
          }
        }
        openSongSelect();
      });
    }
    let selectedModeFilter = "6key";
    const menuOverlay = document.getElementById("menu-overlay");
    const menuBtnPlay = document.getElementById("menu-btn-play");
    const menuBtnDani = document.getElementById("menu-btn-dani");
    const menuBtnRecords = document.getElementById("menu-btn-records");
    const menuBtnBack = document.getElementById("menu-btn-back");
    const menuItems = [menuBtnPlay, menuBtnDani, menuBtnRecords, menuBtnBack];
    let selectedMenuIndex = 0;
    function updateMenuSelection() {
      menuItems.forEach((item, index) => {
        if (!item) return;
        if (index === selectedMenuIndex) {
          item.classList.add("selected");
        } else {
          item.classList.remove("selected");
        }
      });
    }
    function executeMenuAction() {
      if (!menuOverlay || menuOverlay.style.display === "none") return;
      playSE("se_select");
      if (selectedMenuIndex === 0) {
        menuOverlay.style.display = "none";
        performImageShutterTransition(() => {
          openSongSelectForReal();
        }).then(() => {
          playBGM("bgm_select");
        });
      } else if (selectedMenuIndex === 1) {
        menuOverlay.style.display = "none";
        performImageShutterTransition(() => {
          showStartScreen(false);
          if (daniSelectOverlay) daniSelectOverlay.style.display = "flex";
          loadDaniCourses();
        }).then(() => {
          playBGM("bgm_select");
        });
      } else if (selectedMenuIndex === 2) {
        openRecords();
      } else if (selectedMenuIndex === 3) {
        menuOverlay.style.display = "none";
      }
    }
    if (menuOverlay) {
      menuItems.forEach((item, index) => {
        if (item) {
          item.addEventListener("mouseenter", () => {
            selectedMenuIndex = index;
            updateMenuSelection();
            playSE("se_select");
          });
          item.addEventListener("click", () => {
            selectedMenuIndex = index;
            updateMenuSelection();
            executeMenuAction();
          });
        }
      });
    }
    document.addEventListener("keydown", (e) => {
      if (menuOverlay && menuOverlay.style.display === "flex") {
        if (e.key === "ArrowLeft") {
          selectedMenuIndex = (selectedMenuIndex - 1 + menuItems.length) % menuItems.length;
          updateMenuSelection();
          playSE("se_select");
        } else if (e.key === "ArrowRight") {
          selectedMenuIndex = (selectedMenuIndex + 1) % menuItems.length;
          updateMenuSelection();
          playSE("se_select");
        } else if (e.key === "Enter") {
          executeMenuAction();
        } else if (e.key === "Escape") {
          menuOverlay.style.display = "none";
          playSE("se_back");
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
        selectedMenuIndex = 0;
        updateMenuSelection();
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
    async function loadDaniCourses() {
      try {
        const res = await fetch("songs/courses.json");
        daniCourses = await res.json();
        initDaniSelect();
      } catch (e) {
        console.error("Failed to load dani courses", e);
      }
    }
    function initDaniSelect() {
      if (!daniListDiv) return;
      daniListDiv.innerHTML = "";
      daniCourses.forEach((course) => {
        const btn = document.createElement("div");
        btn.className = "dani-course-card";
        btn.style.width = "200px";
        btn.style.padding = "20px";
        btn.style.background = "#222";
        btn.style.border = "2px solid #ff0000";
        btn.style.borderRadius = "10px";
        btn.style.cursor = "pointer";
        btn.style.textAlign = "center";
        btn.style.transition = "transform 0.2s";
        btn.innerHTML = `
                <div style="font-size: 1.5em; color: #ff0000; font-family: 'Sawarabi Mincho', serif; margin-bottom: 10px;">${course.title}</div>
                <div style="font-size: 0.8em; color: #aaa;">4 SONGS SURVIVAL</div>
            `;
        btn.onmouseenter = () => {
          btn.style.transform = "scale(1.05)";
          btn.style.boxShadow = "0 0 15px rgba(255, 0, 0, 0.5)";
        };
        btn.onmouseleave = () => {
          btn.style.transform = "scale(1)";
          btn.style.boxShadow = "none";
        };
        btn.onclick = () => {
          playSE("se_decide");
          startDaniCourse(course);
        };
        daniListDiv.appendChild(btn);
      });
    }
    function startDaniCourse(course) {
      isDaniMode = true;
      currentDaniCourse = course;
      daniSongIndex = 0;
      daniHealth = 100;
      if (daniSelectOverlay) daniSelectOverlay.style.display = "none";
      if (controlsDiv) controlsDiv.style.display = "none";
      const song = course.songs[0];
      loadSong(song.folder, song.chart, song.audio);
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
        currentSkin
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
        showStartScreen(true);
        playBGM("bgm_title");
      });
    }
    if (btnCloseDani) {
      btnCloseDani.addEventListener("click", () => {
        playSE("se_cancel");
        if (daniSelectOverlay) daniSelectOverlay.style.display = "none";
        showStartScreen(true);
        playBGM("bgm_title");
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
      lostScore = 0;
      if (isDaniMode) {
        if (daniSongIndex === 0) {
          daniHealth = 100;
        }
        currentHealth = daniHealth;
      } else {
        currentHealth = getInitialHealth(gaugeType);
      }
      isTrackFailed = false;
      shutterHeight = 0;
      if (resultsOverlay) resultsOverlay.style.display = "none";
      if (customResultScreen) customResultScreen.style.display = "none";
      stopResultBlinking();
      totalMaxScore = calculateMaxScore(chartData || []);
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
        if (isDaniMode) {
          applyDaniHit(type);
        } else {
          const gaugeResult = applyGaugeHit(currentHealth, type, gaugeType);
          currentHealth = gaugeResult.health;
          if (gaugeResult.isDead) {
            console.log("LIFE DEPLETED - GAME OVER");
            failGame();
          }
        }
      }
    }
    function applyDaniHit(type) {
      const penalty = DANI_PENALTIES[type];
      if (penalty !== 0) {
        daniHealth -= penalty;
        if (daniHealth > 100) daniHealth = 100;
        if (daniHealth < 0) daniHealth = 0;
        currentHealth = daniHealth;
        if (daniHealth <= 0) {
          daniHealth = 0;
          currentHealth = 0;
          console.log("DANI LIFE DEPLETED - GAME OVER");
          failGame();
        }
      }
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
        if (note.isLong && note.beingHeld) {
          const tailTime = note.scheduledTime + note.duration;
          if (currentTimeMs >= tailTime) {
            note.active = false;
            judgementColor = "#00ffff";
            judgementTimer = 1e3;
            addHit("critical");
            spawnHitEffect(note.laneIndex, "#00ffff");
            if (isAutoPlay || assistSelect.value === "auto_space" && note.laneIndex === 4) {
              pressedKeys[note.laneIndex] = false;
              heldNotes[note.laneIndex] = null;
            }
          }
        } else if ((isAutoPlay || assistSelect.value === "auto_space" && note.laneIndex === 4) && !note.isLong && !note.processed && currentTimeMs >= note.scheduledTime) {
          note.active = false;
          judgementText = `CRITICAL
AUTO`;
          judgementColor = "#00ffff";
          judgementTimer = 1e3;
          addHit("critical");
          spawnHitEffect(note.laneIndex, "#00ffff");
          pressedKeys[note.laneIndex] = true;
          setTimeout(() => pressedKeys[note.laneIndex] = false, 50);
        } else if ((isAutoPlay || assistSelect.value === "auto_space" && note.laneIndex === 4) && note.isLong && !note.processed && currentTimeMs >= note.scheduledTime && !note.beingHeld) {
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
        } else if ((isAutoPlay || assistSelect.value === "auto_space" && note.laneIndex === 4) && note.isLong && note.beingHeld && currentTimeMs >= note.scheduledTime + note.duration) {
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
      if (!isPlaying) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        requestAnimationFrame(draw);
        return;
      }
      const currentTime = getAudioTime();
      const currentTimeMs = currentTime * 1e3;
      if (isPlaying) {
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
      ctx.font = "bold 30px Arial";
      if (isAutoPlay) {
        ctx.fillText("AUTO PLAY", canvas.width / 2, canvas.height / 2 + 50);
      } else {
        let pct = 0;
        if (totalMaxScore > 0) {
          pct = (totalMaxScore - lostScore) / totalMaxScore * 100;
        }
        if (pct < 0) pct = 0;
        const scoreText = pct.toFixed(4) + "%";
        ctx.fillText(scoreText, canvas.width / 2, canvas.height / 2 + 50);
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
        if (isDaniMode) {
          const grad = ctx.createLinearGradient(barX, barY, barX, barY + barH);
          grad.addColorStop(0, "#ff0000");
          grad.addColorStop(1, "#000000");
          ctx.fillStyle = grad;
        } else if (gaugeType === "norma") {
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
        if (isDaniMode && currentDaniCourse) {
          ctx.fillStyle = "#ff0000";
          ctx.font = 'bold 16px "Sawarabi Mincho", serif';
          ctx.textAlign = "left";
          ctx.fillText(currentDaniCourse.title, 20, 40);
          ctx.fillStyle = "#fff";
          ctx.font = "14px Arial";
          ctx.fillText(`STAGE ${daniSongIndex + 1} / 4`, 20, 65);
        }
      }
      function drawNotesForLane(targetLaneIdx) {
        notes.forEach((note) => {
          if (note.laneIndex !== targetLaneIdx) return;
          const config = LANE_CONFIGS[note.laneIndex];
          if (!config) return;
          let bodyColor = "rgba(255, 255, 255, 0.5)";
          if (config.color === "#7CA4FF") bodyColor = "rgba(124, 164, 255, 0.5)";
          else if (config.color === "#e040fb") {
            if (assistSelect.value === "auto_space") bodyColor = "rgba(0, 255, 0, 0.5)";
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
            if (assistSelect.value === "auto_space") skinImg = null;
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
              if (config.label === "SPACE" && assistSelect.value === "auto_space") ctx.fillStyle = "#00ff00";
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
              if (config.label === "SPACE" && assistSelect.value === "auto_space") ctx.fillStyle = "#00ff00";
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
    function drawPreview(deltaTime) {
      const previewCanvas = document.getElementById("preview-canvas");
      if (!previewCanvas) return;
      const pCtx = previewCanvas.getContext("2d");
      if (!pCtx) return;
      const modeRadios = document.getElementsByName("preview-mode");
      let previewLanes = 4;
      for (const radio of modeRadios) {
        if (radio.checked && radio.value === "6key") previewLanes = 6;
      }
      const laneW = currentLaneWidth;
      const totalW = laneW * previewLanes;
      if (previewCanvas.height !== window.innerHeight) previewCanvas.height = window.innerHeight;
      if (previewCanvas.width !== totalW) previewCanvas.width = totalW;
      pCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
      const nowMs = performance.now();
      if (nowMs - lastPreviewSpawnTime > PREVIEW_INTERVAL) {
        lastPreviewSpawnTime = nowMs;
        previewNotes.push({ timeMs: nowMs + 2e3, active: true, hit: false });
      }
      previewNotes = previewNotes.filter((n) => n.timeMs > nowMs - 1e3 && !n.hit);
      const hitY = previewCanvas.height - 100;
      const w = previewCanvas.width;
      const h = previewCanvas.height;
      pCtx.fillStyle = "rgba(255, 255, 255, 0.05)";
      pCtx.fillRect(0, 0, w, h);
      pCtx.fillStyle = "#ff00ff";
      pCtx.fillRect(0, hitY, w, 2);
      pCtx.strokeStyle = "rgba(255, 255, 255, 0.2)";
      pCtx.lineWidth = 1;
      pCtx.beginPath();
      for (let i = 1; i < previewLanes; i++) {
        pCtx.moveTo(i * laneW, 0);
        pCtx.lineTo(i * laneW, h);
      }
      pCtx.stroke();
      const effectiveSpeed = currentNoteSpeed * (isLaneCoverEnabled ? laneCoverSpeedMult : 1);
      const currentVisualTime = nowMs + visualOffset;
      const noteHeight = 15;
      for (const note of previewNotes) {
        if (note.hit) continue;
        const y = hitY - (note.timeMs - currentVisualTime) * effectiveSpeed;
        if (y > -50 && y < h + 50) {
          for (let i = 0; i < previewLanes; i++) {
            const gap = 2;
            pCtx.fillStyle = i % 2 === 0 ? "#ffffff" : "#7CA4FF";
            pCtx.fillRect(i * laneW + gap, y, laneW - gap * 2, noteHeight);
          }
        }
      }
      if (isLaneCoverEnabled) {
        pCtx.fillStyle = "rgba(0,0,0,0.8)";
        pCtx.fillRect(0, 0, w, laneCoverHeight);
        pCtx.fillStyle = "#00ffff";
        pCtx.fillRect(0, laneCoverHeight - 2, w, 2);
      }
      if (previewJudgementTimer > 0) {
        previewJudgementTimer -= deltaTime;
        pCtx.fillStyle = previewJudgementColor;
        pCtx.font = "bold 24px Arial";
        pCtx.textAlign = "center";
        pCtx.fillText(previewJudgementText, w / 2, hitY - judgementHeightOffset / 2);
      }
    }
    function testPreviewHit() {
      const nowMs = performance.now();
      let nearestNote = null;
      let minDiff = 9999;
      for (const n of previewNotes) {
        if (n.hit) continue;
        const msError = Math.abs(nowMs - n.timeMs - globalOffset);
        if (msError < minDiff) {
          minDiff = msError;
          nearestNote = n;
        }
      }
      const THRESHOLD_CRITICAL2 = 40;
      const THRESHOLD_GREAT2 = 80;
      const THRESHOLD_GOOD2 = 133;
      const THRESHOLD_FAIL2 = 150;
      const MISS_BOUNDARY2 = 180;
      if (nearestNote && minDiff <= MISS_BOUNDARY2) {
        nearestNote.hit = true;
        let result = "MISS";
        let color = "#ff0000";
        if (minDiff <= THRESHOLD_CRITICAL2) {
          result = "CRITICAL";
          color = "#ffff00";
        } else if (minDiff <= THRESHOLD_GREAT2) {
          result = "GREAT";
          color = "#00ff00";
        } else if (minDiff <= THRESHOLD_GOOD2) {
          result = "GOOD";
          color = "#00ffff";
        } else if (minDiff <= THRESHOLD_FAIL2) {
          result = "BAD";
          color = "#ff00ff";
        }
        previewJudgementText = result;
        previewJudgementColor = color;
        previewJudgementTimer = 1e3;
        playSE("se_tap");
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
      if (controlsDiv && controlsDiv.classList.contains("show-options")) {
        drawPreview(deltaTime);
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
      if (customResultScreen) {
        if (valResCritical) valResCritical.textContent = stats.critical.toString();
        if (valResGreat) valResGreat.textContent = stats.great.toString();
        if (valResGood) valResGood.textContent = stats.good.toString();
        if (valResFail) valResFail.textContent = stats.fail.toString();
        if (valResMiss) valResMiss.textContent = stats.miss.toString();
        if (valResCombo) valResCombo.textContent = stats.maxCombo.toString();
        if (valResScore) valResScore.textContent = scaledScore.toLocaleString();
        if (resultStatusTitle) {
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
        if (e.key === "Escape") {
          if (isInfosLoading) return;
          playSE("se_cancel");
          songSelectOverlay.style.display = "none";
          if (startScreen) startScreen.style.display = "flex";
          playBGM("bgm_title");
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
            loadSong(song.folder, song.charts[matchingKey], song.audio);
          }
        };
        if (e.key.toLowerCase() === "k" || e.key === "ArrowDown") {
          e.preventDefault();
          selectedSongIndex = (selectedSongIndex + 1) % availableSongs.length;
          renderSongSelectInternal();
          playSE("se_select");
        } else if (e.key.toLowerCase() === "d" || e.key === "ArrowUp") {
          e.preventDefault();
          selectedSongIndex = (selectedSongIndex - 1 + availableSongs.length) % availableSongs.length;
          renderSongSelectInternal();
          playSE("se_select");
        } else if (e.key.toLowerCase() === "l" || e.key === "ArrowRight") {
          e.preventDefault();
          updateDiff(1);
        } else if (e.key.toLowerCase() === "s" || e.key === "ArrowLeft") {
          e.preventDefault();
          updateDiff(-1);
        } else if (e.key === "Enter" || e.key.toLowerCase() === "f" || e.key.toLowerCase() === "j") {
          e.preventDefault();
          startSelected();
        } else if (e.key === " " && !e.repeat) {
          if (controlsDiv) {
            controlsDiv.classList.add("show-options");
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
        const list = await res.json();
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
          banner.style.border = "4px solid #e040fb";
          banner.style.boxShadow = "0 0 40px rgba(224, 64, 251, 0.8)";
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
        buttonOrder.forEach((diffKey) => {
          const charts = song.charts || {};
          const matchingKey = Object.keys(charts).find((k) => {
            const filename2 = charts[k];
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
            return effectiveDiff === diffKey;
          });
          const btn = document.createElement("div");
          const color = DIFF_COLORS[diffKey];
          const isSelected = buttonOrder.indexOf(diffKey) === selectedDiffIndex;
          btn.style.display = "flex";
          btn.style.flexDirection = "column";
          btn.style.alignItems = "center";
          btn.style.cursor = matchingKey ? "pointer" : "default";
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
          if (matchingKey) {
            btn.onmouseover = () => {
              if (!isSelected) btn.style.transform = "scale(1.05)";
            };
            btn.onmouseout = () => {
              if (!isSelected) btn.style.transform = "scale(1.0)";
            };
          }
          const img = document.createElement("img");
          let imgSrc = "";
          const filename = matchingKey ? charts[matchingKey] : "";
          const chartInfo = filename ? chartInfos[filename] : null;
          if (matchingKey && chartInfo && chartInfo.level && chartInfo.level > 0) {
            const levelStr = chartInfo.level.toString();
            imgSrc = `assets/選曲画面/${encodeURIComponent("難易度ロゴ")}${levelStr}.png`;
          } else {
            imgSrc = `assets/選曲画面/${encodeURIComponent("難易度ロゴ譜面なし")}.png`;
          }
          img.src = imgSrc;
          img.alt = `${diffKey.toUpperCase()}`;
          img.style.height = "100px";
          img.style.objectFit = "contain";
          img.style.display = "block";
          if (!matchingKey) {
            img.style.opacity = "0.2";
            img.style.filter = "grayscale(1)";
          } else {
            img.style.filter = DIFF_FILTERS[diffKey] || "none";
          }
          img.onerror = () => {
            img.style.display = "none";
            const textSpan = document.createElement("span");
            textSpan.textContent = DIFF_LABELS[diffKey] || diffKey.toUpperCase();
            textSpan.style.color = matchingKey ? color : "#333";
            textSpan.style.fontSize = "1.5em";
            textSpan.style.fontWeight = "bold";
            btn.prepend(textSpan);
          };
          btn.appendChild(img);
          if (matchingKey) {
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
              const targetChartName = charts[matchingKey];
              loadSong(song.folder, targetChartName, song.audio);
            };
          }
          btnContainer.appendChild(btn);
        });
      }
    }
    function renderSongSelectInternal() {
      if (!isSongSelectAnimating) {
        animateSongSelect();
      }
      const currentSong = availableSongs[selectedSongIndex];
      if (currentSong) {
        let previewSrc = "";
        if (currentSong.title === "漁火") {
          previewSrc = "assets/曲/漁火_選曲画面.m4a";
        } else if (currentSong.title === "Ceviche") {
          previewSrc = "assets/曲/Ceviche_選曲画面.m4a";
        }
        if (previewSrc) {
          if (!songPreviewBGM || songPreviewBGM.src.indexOf(encodeURI(previewSrc)) === -1) {
            if (songPreviewBGM) {
              const prev = songPreviewBGM;
              fadeVolume(prev, 0, 800, () => {
                prev.pause();
              });
            }
            if (currentBGM) {
              fadeVolume(currentBGM, 0, 800);
            }
            songPreviewBGM = new Audio(previewSrc);
            songPreviewBGM.loop = true;
            songPreviewBGM.volume = 0;
            songPreviewBGM.play().catch((e) => console.log("Preview play blocked", e));
            fadeVolume(songPreviewBGM, 0.5, 800);
          }
        } else {
          if (songPreviewBGM) {
            const prev = songPreviewBGM;
            fadeVolume(prev, 0, 800, () => {
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
      performImageShutterTransition(async () => {
        stopBGM();
        currentSongFolder = songFolder;
        currentChartFilename = chartFilename;
        currentSongAudio = audioFilename;
        currentSongBackground = null;
        isMVLayout = false;
        if (loadingOverlay) {
          loadingOverlay.style.display = "flex";
          if (loadingText) loadingText.textContent = `LOADING...`;
        }
        try {
          initAudio();
        } catch (e) {
          alert(e);
          return;
        }
        try {
          const song = availableSongs.find((s) => s.folder === songFolder);
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
            alert("Invalid Chart Data");
            return;
          }
          chartData = parseChart$1(json);
          keysoundBank.clear();
          const uniqueSoundIds = Array.from(new Set(chartData.map((n) => n.soundId).filter((s) => !!s)));
          if (uniqueSoundIds.length > 0) {
            if (loadingText) loadingText.textContent = `LOADING KEYSOUNDS (0/${uniqueSoundIds.length})...`;
            let loadedCount = 0;
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
              loadedCount++;
              if (loadingText) loadingText.textContent = `LOADING KEYSOUNDS (${loadedCount}/${uniqueSoundIds.length})...`;
            }));
          }
          if (assistSelect && randomSelect) {
            const assistMode = assistSelect.value;
            const randomMode = randomSelect.value;
            if (assistMode !== "none" || randomMode !== "none") {
              chartData = applyModifiers$1(chartData, assistMode, randomMode);
            }
          }
          if (loadingOverlay) loadingOverlay.style.display = "none";
          currentMode = "chart";
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
        } catch (e) {
          if (loadingOverlay) loadingOverlay.style.display = "none";
          alert("Error loading song: " + e);
        }
      }).then(() => {
        startCountdown();
      });
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
      if (controlsDiv && controlsDiv.classList.contains("show-options")) {
        const keyLower2 = e.key.toLowerCase();
        if (["d", "f", "j", "k"].includes(keyLower2) && !e.repeat) {
          testPreviewHit();
          e.preventDefault();
          return;
        }
      }
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
      if (e.code === "Space") e.preventDefault();
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
      if (e.key === " ") {
        if (controlsDiv) {
          controlsDiv.classList.remove("show-options");
        }
      }
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
      playerDisplayInSelect
    ];
    uiButtons.forEach((btn) => {
      if (btn) {
        btn.addEventListener("click", playClickSound);
      }
    });
  })();
})();
