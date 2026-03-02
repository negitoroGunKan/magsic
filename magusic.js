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
    perfect: 40,
    great: 80,
    nice: 133,
    bad: 150,
    miss: 180
  };
  const SCORE_WEIGHTS = {
    perfect: 9,
    great: 8,
    nice: 2,
    bad: 1,
    miss: 0
  };
  function calculateMaxScore(notes) {
    if (notes.length === 0) return 1;
    return notes.reduce((acc, n) => acc + (n.duration > 0 ? 18 : 9), 0);
  }
  function calculateLoss(judgmentType) {
    return 9 - SCORE_WEIGHTS[judgmentType];
  }
  const GAUGE_RECOVERY = {
    norma: { perfect: 2, great: 1, nice: 0.2, bad: -2, miss: -5 },
    life: { perfect: 0.2, great: 0.1, nice: 0, bad: -4, miss: -5 },
    life_hard: { perfect: 0.2, great: 0.1, nice: 0, bad: -5, miss: -10 }
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
      beat: n.beat
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
      gameBg: null
    };
    let currentPlayer = localStorage.getItem("magsic_player") || "Guest";
    let globalOffset = 0;
    let currentLaneWidth = 100;
    let isLaneCoverEnabled = false;
    let laneCoverHeight = 300;
    let laneCoverSpeedMult = 1;
    let gaugeType = "norma";
    let isAutoPlay = false;
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
    const canvas = document.getElementById("game-canvas");
    const ctx = canvas ? canvas.getContext("2d") : null;
    const titleCanvas = document.getElementById("title-rain-canvas");
    const logo = document.getElementById("title-logo");
    let HIT_Y = 0;
    const NOTE_HEIGHT = 15;
    let currentKeyMode = "8key";
    const speedInput = document.getElementById("speed-input");
    const speedDisplay = document.getElementById("speed-display");
    const offsetInput = document.getElementById("offset-input");
    const offsetDisplay = document.getElementById("offset-display");
    const laneWidthInput = document.getElementById("lane-width-input");
    const laneWidthDisplay = document.getElementById("lane-width-display");
    const laneCoverCheckbox = document.getElementById("lane-cover-checkbox");
    const laneCoverHeightInput = document.getElementById("lane-cover-height-input");
    const laneCoverHeightDisplay = document.getElementById("lane-cover-height-display");
    const laneCoverSpeedInput = document.getElementById("lane-cover-speed-input");
    const laneCoverSpeedDisplay = document.getElementById("lane-cover-speed-display");
    const autoPlayCheckbox = document.getElementById("auto-play-checkbox");
    const assistSelect = document.getElementById("assist-select");
    const randomSelect = document.getElementById("random-select");
    const audioInput = document.getElementById("audio-input");
    const chartInput = document.getElementById("chart-input");
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
    function initTitleAnimation() {
      if (!titleCanvas || !logo || !startScreen) {
        console.error("Title Animation Init Failed: Missing Elements", { titleCanvas, logo, startScreen });
        return;
      }
      const titleCtx = titleCanvas.getContext("2d");
      if (!titleCtx) {
        console.error("Title Animation Init Failed: No Context");
        return;
      }
      console.log("Title Animation Initialized Successfully", {
        canvasW: titleCanvas.width,
        canvasH: titleCanvas.height,
        screenWidth: startScreen.offsetWidth,
        screenHeight: startScreen.offsetHeight
      });
      const resizeAnim = () => {
        if (startScreen.style.display !== "none") {
          titleCanvas.width = startScreen.offsetWidth;
          titleCanvas.height = startScreen.offsetHeight;
        }
      };
      window.addEventListener("resize", resizeAnim);
      resizeAnim();
      const sprites = [];
      const loadSprite = (src, prob) => {
        const img = new Image();
        img.onload = () => console.log(`Sprite loaded: ${src}`, { w: img.naturalWidth, h: img.naturalHeight });
        img.onerror = () => console.error(`Sprite load FAILED: ${src}`);
        img.src = src;
        sprites.push({ img, prob });
      };
      loadSprite("assets/sprite1.svg", 0.94);
      loadSprite("assets/sprite3.svg", 0.03);
      loadSprite("assets/sprite5.svg", 0.03);
      const particles = [];
      const SPAWN_RATE = 2;
      let startTime = performance.now();
      let frameCount = 0;
      function animLoop(time) {
        frameCount++;
        if (frameCount % 180 === 0) {
          console.log("AnimLoop Running...", {
            display: startScreen.style.display,
            particles: particles.length,
            canvas: `${titleCanvas.width}x${titleCanvas.height}`,
            sprites: sprites.map((s) => ({ src: s.img.src.split("/").pop(), complete: s.img.complete, nw: s.img.naturalWidth }))
          });
        }
        if (startScreen.style.display === "none") {
          requestAnimationFrame(animLoop);
          return;
        }
        const elapsed = (time - startTime) / 1e3;
        const scaleFactor = 1 + 0.03 * Math.sin(elapsed * 2);
        logo.style.transform = `scale(${scaleFactor})`;
        titleCtx.clearRect(0, 0, titleCanvas.width, titleCanvas.height);
        for (let i = 0; i < SPAWN_RATE; i++) {
          const r = Math.random();
          let selectedImg = sprites[0]?.img;
          if (r > 0.97) selectedImg = sprites[2]?.img;
          else if (r > 0.94) selectedImg = sprites[1]?.img;
          else selectedImg = sprites[0]?.img;
          if (selectedImg && selectedImg.complete && selectedImg.naturalWidth > 0) {
            const size = 20 + Math.random() * 30;
            const speed = 2 + Math.random() * 3;
            let startX, startY;
            if (Math.random() < 0.5) {
              startX = Math.random() * titleCanvas.width * 1.5;
              startY = -50;
            } else {
              startX = titleCanvas.width + 50;
              startY = Math.random() * titleCanvas.height;
            }
            particles.push({
              x: startX,
              y: startY,
              speed,
              img: selectedImg,
              size
            });
          }
        }
        const vx = -0.707;
        const vy = 0.707;
        for (let i = particles.length - 1; i >= 0; i--) {
          const p = particles[i];
          p.x += p.speed * vx * 3;
          p.y += p.speed * vy * 3;
          if (p.img.complete && p.img.naturalWidth > 0) {
            titleCtx.drawImage(p.img, p.x, p.y, p.size, p.size);
          }
          if (p.y > titleCanvas.height + 50 || p.x < -50) {
            particles.splice(i, 1);
          }
        }
        requestAnimationFrame(animLoop);
      }
      requestAnimationFrame(animLoop);
    }
    if (document.readyState === "complete" || document.readyState === "interactive") {
      initTitleAnimation();
    } else {
      window.addEventListener("load", initTitleAnimation);
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
    const resPerfect = document.getElementById("res-perfect");
    const resGreat = document.getElementById("res-great");
    const resNice = document.getElementById("res-nice");
    const resBad = document.getElementById("res-bad");
    const resMiss = document.getElementById("res-miss");
    const resCombo = document.getElementById("res-combo");
    const resAvg = document.getElementById("res-avg");
    document.getElementById("score-display");
    let lostScore = 0;
    let currentHealth = 0;
    let totalMaxScore = 1;
    let isTrackFailed = false;
    let shutterHeight = 0;
    const scrollModeSelect = document.getElementById("scroll-mode-select");
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
        resultsOverlay.style.display = "none";
        isTrackFailed = false;
        shutterHeight = 0;
        if (recordsOverlay && recordsOverlay.style.display !== "none") {
          fetchScoreHistory();
        }
        if (startScreen) startScreen.style.display = "flex";
        controlsDiv.style.display = "block";
        if (controlsDiv.classList.contains("open")) controlsDiv.classList.remove("open");
        songSelectOverlay.style.display = "none";
      });
    }
    let selectedModeFilter = "8key";
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
        alert("Coming Soon...");
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
      if (startScreen) {
        startScreen.style.display = "none";
        console.log("startScreen display set to none");
      }
      if (controlsDiv) controlsDiv.classList.remove("open");
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
      ["4key", "6key", "8key", "12key"].forEach((mode) => {
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
      if (startScreen) startScreen.style.display = "none";
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
    let scrollMode = "beat";
    let bpmNormalize = true;
    const bpmNormalizeCheckbox = document.getElementById("bpm-normalize-checkbox");
    if (bpmNormalizeCheckbox) {
      bpmNormalizeCheckbox.addEventListener("change", () => {
        bpmNormalize = bpmNormalizeCheckbox.checked;
        savePlayerSettings();
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
          if (settings.scrollMode) {
            scrollMode = settings.scrollMode;
            if (scrollModeSelect) scrollModeSelect.value = scrollMode;
          }
          if (settings.bpmNormalize !== void 0) {
            bpmNormalize = !!settings.bpmNormalize;
            if (bpmNormalizeCheckbox) bpmNormalizeCheckbox.checked = bpmNormalize;
          }
          resize();
        } else {
          currentNoteSpeed = BASE_NOTE_SPEED * 2.5;
          if (speedInput) speedInput.value = "2.5";
          if (speedDisplay) speedDisplay.textContent = "2.5";
          globalOffset = 0;
          if (offsetInput) offsetInput.value = "0";
          if (offsetDisplay) offsetDisplay.textContent = "0";
          bpmNormalize = true;
          if (bpmNormalizeCheckbox) bpmNormalizeCheckbox.checked = true;
        }
      } catch (e) {
        console.error("Failed to load settings", e);
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
        },
        scrollMode: scrollModeSelect ? scrollModeSelect.value : "beat",
        bpmNormalize: bpmNormalizeCheckbox ? bpmNormalizeCheckbox.checked : true
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
        if (startScreen) startScreen.style.display = "flex";
        playBGM("bgm_title");
      });
    }
    if (laneCoverCheckbox) {
      laneCoverCheckbox.addEventListener("change", () => {
        isLaneCoverEnabled = laneCoverCheckbox.checked;
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
    if (laneWidthInput && laneWidthDisplay) {
      laneWidthInput.addEventListener("input", () => {
        currentLaneWidth = parseInt(laneWidthInput.value);
        laneWidthDisplay.textContent = currentLaneWidth.toString();
        resize();
        savePlayerSettings();
      });
    }
    if (scrollModeSelect) {
      scrollModeSelect.addEventListener("change", () => {
        savePlayerSettings();
      });
    }
    if (btnOptionsToggle && controlsDiv) {
      btnOptionsToggle.addEventListener("click", (e) => {
        e.stopPropagation();
        controlsDiv.classList.toggle("open");
        playSE("se_option");
      });
      if (btnCloseOptions) {
        btnCloseOptions.addEventListener("click", () => {
          controlsDiv.classList.remove("open");
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
          controlsDiv.classList.remove("open");
        }
      }, { passive: true });
      document.addEventListener("click", (e) => {
        const target = e.target;
        if (controlsDiv.classList.contains("open")) {
          if (!controlsDiv.contains(target) && target !== btnOptionsToggle) {
            controlsDiv.classList.remove("open");
          }
        }
      });
    }
    function loadSkin() {
      const assets = [
        { key: "white", src: "assets/note_white.png" },
        { key: "blue", src: "assets/note_blue.png" },
        { key: "space", src: "assets/note_space.png" },
        { key: "titleBg", src: "assets/backdrop1.png" },
        // Use backdrop1 for title as requested
        { key: "gameBg", src: "assets/initial2.png" }
        // Fallback
      ];
      assets.forEach((a) => {
        const img = new Image();
        img.src = a.src;
        img.onload = () => {
          SKIN[a.key] = img;
          if (songSelectOverlay) {
            songSelectOverlay.style.background = "rgba(0,0,0,0.95)";
          }
        };
      });
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
      se_cancel: null
    };
    let currentBGM = null;
    let currentSongBackground = null;
    function loadAudioAssets() {
      const assets = [
        { key: "bgm_title", src: "assets/タイトル画面でループして流れる曲.wav", loop: true, volume: 0.5 },
        { key: "bgm_select", src: "assets/選曲画面でループして流れる曲.wav", loop: true, volume: 0.5 },
        { key: "se_start", src: "assets/ゲームスタートボタンを押す.mp3", volume: 0.8 },
        { key: "se_option", src: "assets/設定画面を開く音.mp3", volume: 0.8 },
        { key: "se_decide", src: "assets/曲選択時効果音(通常).mp3", volume: 0.8 },
        { key: "se_decide_extra", src: "assets/曲選択時効果音(エキストラモード).mp3", volume: 0.8 },
        { key: "se_cancel", src: "assets/キャンセル音.mp3", volume: 0.8 }
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
        if (currentBGM.paused) currentBGM.play().catch((e) => console.log("Autoplay blocked", e));
        return;
      }
      if (currentBGM) {
        currentBGM.pause();
        currentBGM.currentTime = 0;
      }
      currentBGM = nextBGM;
      currentBGM.currentTime = 0;
      currentBGM.play().catch((e) => console.log("Autoplay blocked", e));
    }
    function stopBGM() {
      if (currentBGM) {
        currentBGM.pause();
        currentBGM.currentTime = 0;
        currentBGM = null;
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
    const THRESHOLD_PERFECT = JUDGMENT_THRESHOLDS.perfect;
    const THRESHOLD_GREAT = JUDGMENT_THRESHOLDS.great;
    const THRESHOLD_NICE = JUDGMENT_THRESHOLDS.nice;
    const THRESHOLD_BAD = JUDGMENT_THRESHOLDS.bad;
    const MISS_BOUNDARY = JUDGMENT_THRESHOLDS.miss;
    new Audio();
    let bgVideo = null;
    let isVideoReady = false;
    let bpmChanges = [];
    function getBeatFromTime$1(time) {
      return getBeatFromTime(time, bpmChanges);
    }
    let stats = {
      perfect: 0,
      great: 0,
      nice: 0,
      bad: 0,
      miss: 0,
      combo: 0,
      maxCombo: 0,
      totalErrorMs: 0,
      hitCount: 0,
      score: 0
    };
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
      lostScore = 0;
      currentHealth = getInitialHealth(gaugeType);
      isTrackFailed = false;
      shutterHeight = 0;
      if (resultsOverlay) resultsOverlay.style.display = "none";
      totalMaxScore = calculateMaxScore(chartData || []);
    }
    function addHit(type, errorMs = 0) {
      stats[type]++;
      if (type !== "miss") {
        stats.totalErrorMs += errorMs;
        stats.hitCount++;
      }
      if (type === "miss" || type === "bad") {
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
        const gaugeResult = applyGaugeHit(currentHealth, type, gaugeType);
        currentHealth = gaugeResult.health;
        if (gaugeResult.isDead) {
          console.log("LIFE DEPLETED - GAME OVER");
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
    function getNoteY(scheduledTime, beat = 0) {
      if (scrollMode === "beat") {
        const currentBeat = getBeatFromTime$1(getAudioTime() * 1e3);
        const distBeats = beat - currentBeat;
        const effectiveSpeed = currentNoteSpeed * (isLaneCoverEnabled ? laneCoverSpeedMult : 1);
        let msPerBeatBaseline = 500;
        if (bpmNormalize) {
          const baseBpm = bpmChanges.length > 0 ? bpmChanges[0].bpm : 120;
          msPerBeatBaseline = 6e4 / baseBpm;
        }
        return HIT_Y - distBeats * msPerBeatBaseline * effectiveSpeed;
      } else {
        const currentTimeMs = getAudioTime() * 1e3;
        const speed = currentNoteSpeed * (isLaneCoverEnabled ? laneCoverSpeedMult : 1);
        return HIT_Y - (scheduledTime - currentTimeMs) * speed;
      }
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
    function spawnNote(laneIndex, scheduledTime, isLong, duration, beat) {
      notes.push({
        laneIndex,
        scheduledTime,
        active: true,
        isLong,
        duration,
        processed: false,
        beingHeld: false,
        beat
      });
    }
    function update(deltaTime) {
      if (isTrackFailed) {
        const speed = canvas.height / 500;
        shutterHeight += speed * deltaTime;
        if (shutterHeight >= canvas.height) {
          shutterHeight = canvas.height;
          if (resultsOverlay && resultsOverlay.style.display !== "block") {
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
          spawnNote(lane, noteTime, Math.random() < 0.2, Math.random() * 500, noteBeat);
        }
      } else {
        const spawnAheadTime = getSpawnAheadTime();
        while (nextNoteIndex < chartData.length) {
          const noteData = chartData[nextNoteIndex];
          if (noteData.time <= currentTimeMs + spawnAheadTime) {
            spawnNote(noteData.lane, noteData.time, noteData.duration > 0, noteData.duration, noteData.beat);
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
            addHit("perfect");
            spawnHitEffect(note.laneIndex, "#00ffff");
            if (isAutoPlay || assistSelect.value === "auto_space" && note.laneIndex === 4) {
              pressedKeys[note.laneIndex] = false;
              heldNotes[note.laneIndex] = null;
            }
          }
        } else if ((isAutoPlay || assistSelect.value === "auto_space" && note.laneIndex === 4) && !note.isLong && !note.processed && currentTimeMs >= note.scheduledTime) {
          note.active = false;
          judgementText = `PERFECT
AUTO`;
          judgementColor = "#00ffff";
          judgementTimer = 1e3;
          addHit("perfect");
          spawnHitEffect(note.laneIndex, "#00ffff");
          pressedKeys[note.laneIndex] = true;
          setTimeout(() => pressedKeys[note.laneIndex] = false, 50);
        } else if ((isAutoPlay || assistSelect.value === "auto_space" && note.laneIndex === 4) && note.isLong && !note.processed && currentTimeMs >= note.scheduledTime && !note.beingHeld) {
          note.processed = true;
          note.beingHeld = true;
          heldNotes[note.laneIndex] = note;
          judgementText = `PERFECT
AUTO`;
          judgementColor = "#00ffff";
          judgementTimer = 1e3;
          addHit("perfect");
          spawnHitEffect(note.laneIndex, "#00ffff");
          pressedKeys[note.laneIndex] = true;
        } else if ((isAutoPlay || assistSelect.value === "auto_space" && note.laneIndex === 4) && note.isLong && note.beingHeld && currentTimeMs >= note.scheduledTime + note.duration) {
          pressedKeys[note.laneIndex] = false;
        } else if (!note.isLong || !note.processed) {
          const msPassed = currentTimeMs - note.scheduledTime;
          if (msPassed > MISS_BOUNDARY && note.active) {
            note.active = false;
            judgementText = `MISS`;
            judgementColor = "#ff0000";
            judgementTimer = 1e3;
            addHit("miss");
            if (note.isLong) addHit("miss");
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
        const tailY = getNoteY(tailTime, tailBeat);
        if (tailY > canvas.height + 100) {
          if (note.active) {
            note.active = false;
            judgementText = `MISS`;
            judgementColor = "#ff0000";
            judgementTimer = 1e3;
            addHit("miss");
            if (note.isLong) addHit("miss");
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
      if (!isPlaying && SKIN.titleBg) {
        ctx.drawImage(SKIN.titleBg, 0, 0, canvas.width, canvas.height);
      } else if (isPlaying) {
        if (bgVideo && isVideoReady) {
          ctx.drawImage(bgVideo, 0, 0, canvas.width, canvas.height);
        } else if (currentSongBackground) {
          ctx.drawImage(currentSongBackground, 0, 0, canvas.width, canvas.height);
        } else if (SKIN.gameBg) {
          ctx.drawImage(SKIN.gameBg, 0, 0, canvas.width, canvas.height);
        }
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      } else {
        ctx.fillStyle = "#222";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      VISUAL_LANES.forEach((lane) => {
        ctx.fillStyle = "#111";
        ctx.fillRect(lane.x, 0, lane.width, canvas.height);
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
        const currentTime = getAudioTime();
        const currentTimeMs = currentTime * 1e3;
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
              const y = HIT_Y - (beatTime - currentTimeMs) * speed;
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
      ctx.fillText(`PERFECT: ${stats.perfect}`, 20, statsStartY);
      ctx.fillText(`GREAT:   ${stats.great}`, 20, statsStartY + statsLineH);
      ctx.fillText(`NICE:    ${stats.nice}`, 20, statsStartY + statsLineH * 2);
      ctx.fillText(`BAD:     ${stats.bad}`, 20, statsStartY + statsLineH * 3);
      ctx.fillText(`MISS:    ${stats.miss}`, 20, statsStartY + statsLineH * 4);
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
        let pct = (totalMaxScore - lostScore) / totalMaxScore * 100;
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
        ctx.fillText(`PERFECT: ${stats.perfect}`, statsX, statsStartTime);
        ctx.fillStyle = "#ffeb3b";
        ctx.fillText(`GREAT: ${stats.great}`, statsX, statsStartTime + lineHeight);
        ctx.fillStyle = "#00ff00";
        ctx.fillText(`NICE: ${stats.nice}`, statsX, statsStartTime + lineHeight * 2);
        ctx.fillStyle = "#ffae00";
        ctx.fillText(`BAD: ${stats.bad}`, statsX, statsStartTime + lineHeight * 3);
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
        ctx.font = "10px Arial";
        ctx.textAlign = "center";
        ctx.fillText(`${Math.floor(currentHealth)}%`, barX + barW / 2, barY + barH + 15);
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
            const headY = getNoteY(note.scheduledTime, note.beat);
            const tailBeat = getBeatFromTime$1(note.scheduledTime + note.duration);
            const tailY = getNoteY(note.scheduledTime + note.duration, tailBeat);
            const originalAlpha = ctx.globalAlpha;
            ctx.globalAlpha = 0.5;
            ctx.fillStyle = bodyColor;
            ctx.fillRect(x + H_GAP, tailY, w - H_GAP * 2, headY - tailY);
            ctx.globalAlpha = originalAlpha;
            if (skinImg) {
              ctx.drawImage(skinImg, x + H_GAP, headY - drawHeight / 2, w - H_GAP * 2, drawHeight);
            } else {
              if (config.label === "SPACE" && assistSelect.value === "auto_space") ctx.fillStyle = "#00ff00";
              else ctx.fillStyle = config.color;
              ctx.fillRect(x + H_GAP, headY - drawHeight / 2, w - H_GAP * 2, drawHeight);
            }
          } else {
            const noteY = getNoteY(note.scheduledTime, note.beat);
            if (noteY > canvas.height + 100) return;
            if (skinImg) {
              ctx.drawImage(skinImg, x + H_GAP, noteY - drawHeight / 2, w - H_GAP * 2, drawHeight);
            } else {
              if (config.label === "SPACE" && assistSelect.value === "auto_space") ctx.fillStyle = "#00ff00";
              else ctx.fillStyle = config.color;
              ctx.fillRect(x + H_GAP, noteY - drawHeight / 2, w - H_GAP * 2, drawHeight);
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
      if (judgementTimer > 0) {
        ctx.fillStyle = judgementColor;
        ctx.font = "bold 40px Arial";
        ctx.textAlign = "center";
        const lines = judgementText.split("\n");
        lines.forEach((line, i) => {
          ctx.fillText(line, canvas.width / 2, HIT_Y - 50 + i * 40);
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
      if (startScreen) startScreen.style.display = "flex";
      controlsDiv.style.display = "block";
      if (btnPauseUI) btnPauseUI.style.display = "none";
    }
    btnResume.addEventListener("click", resumeGame);
    btnRetry.addEventListener("click", retryGame);
    btnQuit.addEventListener("click", quitGame);
    async function showResults() {
      if (resPerfect) resPerfect.textContent = stats.perfect.toString();
      if (resGreat) resGreat.textContent = stats.great.toString();
      if (resNice) resNice.textContent = stats.nice.toString();
      if (resBad) resBad.textContent = stats.bad.toString();
      if (resMiss) resMiss.textContent = stats.miss.toString();
      if (resCombo) resCombo.textContent = stats.maxCombo.toString();
      if (resAvg) {
        const avg = stats.hitCount > 0 ? (stats.totalErrorMs / stats.hitCount).toFixed(1) : "0";
        resAvg.textContent = avg;
      }
      const isClear = isTrackCleared(gaugeType, currentHealth, isTrackFailed);
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
      if (assistSelect?.value === "blue_to_white") ;
      else if (assistSelect?.value === "space_boost") ;
      else if (assistSelect?.value === "auto_space") ;
      if (randomSelect?.value === "shuffle_color") ;
      else if (randomSelect?.value === "shuffle_chaos") ;
      else if (randomSelect?.value === "mirror") ;
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
        if (e.key.toLowerCase() === "k") {
          selectedSongIndex = (selectedSongIndex + 1) % availableSongs.length;
          renderSongSelectInternal();
          playSE("se_select");
        } else if (e.key.toLowerCase() === "d") {
          selectedSongIndex = (selectedSongIndex - 1 + availableSongs.length) % availableSongs.length;
          renderSongSelectInternal();
          playSE("se_select");
        } else if (e.key.toLowerCase() === "s") {
          const modes = ["4key", "6key", "8key", "12key"];
          const curIdx = modes.indexOf(selectedModeFilter);
          const nextIdx = (curIdx - 1 + modes.length) % modes.length;
          selectedModeFilter = modes[nextIdx];
          updateModeTabsUI();
          loadSongList();
          playSE("se_select");
        } else if (e.key.toLowerCase() === "l") {
          const modes = ["4key", "6key", "8key", "12key"];
          const curIdx = modes.indexOf(selectedModeFilter);
          const nextIdx = (curIdx + 1) % modes.length;
          selectedModeFilter = modes[nextIdx];
          updateModeTabsUI();
          loadSongList();
          playSE("se_select");
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
      const header = document.createElement("div");
      header.style.width = "100%";
      header.style.height = "60px";
      header.style.background = "#222";
      header.style.borderBottom = "1px solid #444";
      header.style.display = "flex";
      header.style.justifyContent = "center";
      header.style.alignItems = "center";
      header.style.gap = "20px";
      header.id = "mode-tabs-container";
      const modes = ["4key", "6key", "8key", "12key"];
      modes.forEach((mode) => {
        const tab = document.createElement("div");
        tab.textContent = mode.toUpperCase();
        tab.style.padding = "10px 20px";
        tab.style.cursor = "pointer";
        tab.style.color = "white";
        tab.style.fontWeight = "bold";
        tab.style.borderBottom = "3px solid transparent";
        tab.style.transition = "all 0.2s";
        tab.addEventListener("click", () => {
          selectedModeFilter = mode;
          updateModeTabsUI();
          playSE("se_select");
          renderRightColumn();
        });
        header.appendChild(tab);
      });
      songListDiv.appendChild(header);
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
      rollContainer.style.display = "flex";
      rollContainer.style.flexDirection = "column";
      rollContainer.style.alignItems = "center";
      rollContainer.style.transition = "transform 0.3s cubic-bezier(0.25, 1, 0.5, 1)";
      rollContainer.style.position = "absolute";
      rollContainer.style.top = "50%";
      rollContainer.style.width = "100%";
      availableSongs.forEach((song, idx) => {
        const banner = document.createElement("div");
        banner.className = "song-banner";
        banner.style.width = "400px";
        banner.style.height = "100px";
        banner.style.marginBottom = "20px";
        banner.style.transition = "all 0.3s cubic-bezier(0.25, 1, 0.5, 1)";
        banner.style.backgroundSize = "cover";
        banner.style.backgroundPosition = "center";
        banner.style.borderRadius = "10px";
        banner.style.border = "2px solid transparent";
        banner.style.transformOrigin = "center";
        banner.style.cursor = "pointer";
        if (song.id === "knight_of_nights") {
          banner.style.backgroundImage = `url('assets/選曲ロゴ-ナイトオブナイツ.png')`;
        } else if (song.id === "shining_star") {
          banner.style.backgroundImage = `url('assets/選曲ロゴ-シャイニングスター.png')`;
        } else if (song.id === "seimeisei_syndrome") {
          banner.style.backgroundImage = `url('assets/選曲ロゴ-生命性シンドロウム.png')`;
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
      if (rollContainer) {
        const translateY = -(selectedSongIndex * 120 + 50);
        rollContainer.style.transform = `translateY(${translateY}px)`;
        Array.from(rollContainer.children).forEach((child, idx) => {
          const banner = child;
          if (idx === selectedSongIndex) {
            banner.style.opacity = "1.0";
            banner.style.transform = "scale(1.1)";
            banner.style.border = "2px solid #e040fb";
            banner.style.boxShadow = "0 0 20px rgba(224, 64, 251, 0.5)";
            banner.style.zIndex = "10";
          } else {
            banner.style.opacity = "0.5";
            banner.style.transform = "scale(0.9)";
            banner.style.border = "2px solid transparent";
            banner.style.boxShadow = "none";
            banner.style.zIndex = "1";
          }
        });
      }
      renderRightColumn();
    }
    function renderRightColumn() {
      const rightCol = document.getElementById("song-select-right-col");
      if (!rightCol) return;
      rightCol.innerHTML = "";
      const song = availableSongs[selectedSongIndex];
      const allScores = window.currentAllScores || {};
      if (song && song.charts) {
        const title = document.createElement("h2");
        title.textContent = song.title;
        title.style.color = "white";
        title.style.marginBottom = "30px";
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
          btn.style.display = "flex";
          btn.style.flexDirection = "column";
          btn.style.alignItems = "center";
          btn.style.cursor = matchingKey ? "pointer" : "default";
          btn.style.transition = "transform 0.2s";
          if (matchingKey) {
            btn.onmouseover = () => btn.style.transform = "scale(1.1)";
            btn.onmouseout = () => btn.style.transform = "scale(1.0)";
          }
          const img = document.createElement("img");
          let imgSrc = "";
          const filename = matchingKey ? charts[matchingKey] : "";
          const chartInfo = filename ? chartInfos[filename] : null;
          if (matchingKey && chartInfo && chartInfo.level && chartInfo.level > 0) {
            const levelStr = chartInfo.level.toString();
            imgSrc = `assets/${encodeURIComponent("難易度ロゴ")}${levelStr}.png`;
          } else {
            imgSrc = `assets/${encodeURIComponent("難易度ロゴ譜面なし")}.png`;
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
      updateSongSelectVisuals();
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
        if (currentKeyMode === "8key") {
          if (type === "type-a") {
            const totalPlayWidth = tempWidth * 4;
            const sx = (canvas.width - totalPlayWidth) / 2;
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
            const sx = (canvas.width - totalPlayWidth) / 2;
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
          const sx = (canvas.width - totalPlayWidth) / 2;
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
          const sx = (canvas.width - totalPlayWidth) / 2;
          laneStartX = sx;
          const indices = [9, 1, 3, 6, 8, 10];
          const labels = ["S", "D", "F", "J", "K", "L"];
          const colors = ["#ffffff", "#ffffff", "#ffffff", "#ffffff", "#ffffff", "#ffffff"];
          indices.forEach((kIdx, i) => {
            const x = sx + i * tempWidth2;
            vLanes.push({ x, width: tempWidth2 });
            lConfigs[kIdx] = { x, width: tempWidth2, color: colors[i], label: labels[i] };
          });
          lConfigs[4] = { x: sx, width: totalPlayWidth, color: "#e040fb", label: "SPACE" };
        } else if (currentKeyMode === "12key") {
          const tempWidth2 = currentLaneWidth * 0.8;
          const totalPlayWidth = tempWidth2 * 12;
          const sx = (canvas.width - totalPlayWidth) / 2;
          laneStartX = sx;
          const indices = [9, 11, 1, 0, 3, 2, 5, 6, 7, 8, 12, 10];
          const labels = ["S", "W", "D", "E", "F", "R", "U", "J", "I", "K", "O", "L"];
          const colors = [
            "#ffffff",
            "#7CA4FF",
            "#ffffff",
            "#7CA4FF",
            "#ffffff",
            "#7CA4FF",
            "#7CA4FF",
            "#ffffff",
            "#7CA4FF",
            "#ffffff",
            "#7CA4FF",
            "#ffffff"
          ];
          indices.forEach((kIdx, i) => {
            const x = sx + i * tempWidth2;
            vLanes.push({ x, width: tempWidth2 });
            lConfigs[kIdx] = { x, width: tempWidth2, color: colors[i], label: labels[i] };
          });
        }
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
        const targetNotes = notes.filter(
          (n) => n.active && n.laneIndex === keyIndex && !n.processed
        ).sort((a, b) => a.scheduledTime - b.scheduledTime);
        if (targetNotes.length > 0) {
          const note = targetNotes[0];
          const currentTimeMs = getAudioTime() * 1e3;
          const msErrorRaw = currentTimeMs - note.scheduledTime;
          const msError = msErrorRaw - globalOffset;
          const absError = Math.abs(msError);
          if (absError < MISS_BOUNDARY) {
            const sign = msError > 0 ? "+" : "";
            let msDisplay = `
${sign}${Math.floor(msError)}ms`;
            if (absError <= 20) {
              msDisplay = "";
            }
            if (absError < THRESHOLD_PERFECT) {
              judgementText = `PERFECT${msDisplay}`;
              judgementColor = "#00ffff";
              addHit("perfect", msError);
              spawnHitEffect(note.laneIndex, "#00ffff");
            } else if (absError < THRESHOLD_GREAT) {
              judgementText = `GREAT${msDisplay}`;
              judgementColor = "#ffeb3b";
              addHit("great", msError);
              spawnHitEffect(note.laneIndex, "#ffeb3b");
            } else if (absError < THRESHOLD_NICE) {
              judgementText = `NICE${msDisplay}`;
              judgementColor = "#00ff00";
              addHit("nice", msError);
              spawnHitEffect(note.laneIndex, "#00ff00");
            } else if (absError < THRESHOLD_BAD) {
              judgementText = `BAD${msDisplay}`;
              judgementColor = "#ffae00";
              addHit("bad", msError);
            } else {
              judgementText = `MISS${msDisplay}`;
              judgementColor = "#ff0000";
              addHit("miss", msError);
            }
            judgementTimer = 1e3;
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
          if (currentTimeMs < tailTime - THRESHOLD_PERFECT) {
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
