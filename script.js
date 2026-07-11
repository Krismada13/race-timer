(function(){
  const html = document.documentElement;
  const stage = document.getElementById('stage');
  const displayZone = document.getElementById('displayZone');
  const trackFill = document.getElementById('trackFill');
  const trackBg = document.querySelector('.track-bg');
  const runner = document.getElementById('runner');
  const timeDisplay = document.getElementById('timeDisplay');
  const trackWrap = document.querySelector('.track-wrap');
  const statusLabel = document.getElementById('statusLabel');
  const startBtn = document.getElementById('startBtn');
  const resetBtn = document.getElementById('resetBtn');
  const splitBtn = document.getElementById('splitBtn');
  const fsSplitBtn = document.getElementById('fsSplitBtn');
  const tabCountdown = document.getElementById('tabCountdown');
  const tabStopwatch = document.getElementById('tabStopwatch');
  const timeSetter = document.getElementById('timeSetter');
  const presetsWrap = document.getElementById('presets');
  const hInput = document.getElementById('hInput');
  const mInput = document.getElementById('mInput');
  const sInput = document.getElementById('sInput');
  const presetBtns = document.querySelectorAll('#presets button');
  const splitsList = document.getElementById('splitsList');
  const splitsEmpty = document.getElementById('splitsEmpty');
  const splitCount = document.getElementById('splitCount');
  const wakeBtn = document.getElementById('wakeBtn');
  const themeBtn = document.getElementById('themeBtn');
  const themeIcon = document.getElementById('themeIcon');

  const ICON_MOON = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z"></path>';
  const ICON_SUN = '<circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"></path>';

  function setTheme(t){
    html.setAttribute('data-theme', t);
    themeIcon.innerHTML = t === 'dark' ? ICON_SUN : ICON_MOON;
    try{ localStorage.setItem('race-timer-theme', t); }catch(e){}
  }
  let savedTheme = 'dark';
  try{ savedTheme = localStorage.getItem('race-timer-theme') || 'dark'; }catch(e){}
  setTheme(savedTheme);
  themeBtn.addEventListener('click', () => {
    setTheme(html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  });

  const trackLen = trackFill.getTotalLength();
  trackFill.style.strokeDasharray = trackLen;
  trackBg.style.strokeDasharray = trackLen;

  let mode = 'countdown';
  let running = false;
  let targetMs = 90 * 60 * 1000;
  let startTs = null;
  let accumulatedMs = 0;
  let overtimeAlarmed = false;
  let splits = [];
  let rafId = null;
  let wakeLock = null;

  function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }
  function pad(n){ return String(n).padStart(2,'0'); }
  function formatHMS(ms){
    const totalSec = Math.floor(ms/1000);
    const h = Math.floor(totalSec/3600);
    const m = Math.floor((totalSec%3600)/60);
    const s = totalSec%60;
    return pad(h)+':'+pad(m)+':'+pad(s);
  }
  function currentElapsed(){
    if(running){ return accumulatedMs + (performance.now() - startTs); }
    return accumulatedMs;
  }
  function setInputsFromTarget(){
    const totalSec = Math.round(targetMs/1000);
    hInput.value = Math.floor(totalSec/3600);
    mInput.value = Math.floor((totalSec%3600)/60);
    sInput.value = totalSec%60;
  }
  function readTargetFromInputs(){
    const h = clamp(parseInt(hInput.value||0,10),0,23);
    const m = clamp(parseInt(mInput.value||0,10),0,59);
    const s = clamp(parseInt(sInput.value||0,10),0,59);
    return (h*3600 + m*60 + s) * 1000;
  }
  function setPoint(progress){
    const p = trackFill.getPointAtLength(clamp(progress,0,1)*trackLen);
    runner.setAttribute('cx', p.x);
    runner.setAttribute('cy', p.y);
  }
  function playAlarm(){
    try{
      const ctx = new (window.AudioContext||window.webkitAudioContext)();
      const beep = (t, freq)=>{
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, ctx.currentTime + t);
        gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.28);
        osc.connect(gain).connect(ctx.destination);
        osc.start(ctx.currentTime + t);
        osc.stop(ctx.currentTime + t + 0.3);
      };
      beep(0, 880); beep(0.32, 880); beep(0.64, 1046);
    }catch(e){}
  }

  function render(){
    const elapsed = currentElapsed();
    let progress, overtime = false, label;

    if(mode === 'countdown'){
      const remaining = targetMs - elapsed;
      overtime = remaining <= 0;
      timeDisplay.textContent = (overtime ? '-' : '') + formatHMS(Math.abs(remaining));
      progress = clamp(elapsed / targetMs, 0, 1);
      if(overtime){
        if(!overtimeAlarmed && running){ playAlarm(); overtimeAlarmed = true; }
        label = running ? 'Waktu habis · overtime' : (accumulatedMs>0 ? 'Jeda · overtime' : 'Siap mulai');
      } else {
        label = running ? 'Berjalan' : (accumulatedMs>0 ? 'Jeda' : 'Siap mulai');
      }
    } else {
      const loopMs = 10*60*1000;
      timeDisplay.textContent = formatHMS(elapsed);
      progress = (elapsed % loopMs) / loopMs;
      label = running ? 'Berjalan' : (accumulatedMs>0 ? 'Jeda' : 'Siap mulai');
    }

    timeDisplay.classList.toggle('overtime', overtime);
    statusLabel.classList.toggle('overtime', overtime);
    trackFill.classList.toggle('overtime', overtime);
    runner.classList.toggle('overtime', overtime);
    statusLabel.textContent = label;
    trackFill.style.strokeDashoffset = trackLen * (1 - (overtime ? 1 : progress));
    setPoint(overtime ? 1 : progress);
  }

  function loop(){ render(); rafId = requestAnimationFrame(loop); }
  function startLoopIfNeeded(){ if(rafId === null){ loop(); } }
  function stopLoop(){ if(rafId !== null){ cancelAnimationFrame(rafId); rafId = null; } }

  function setControlsForRunning(isRunning){
    startBtn.textContent = isRunning ? 'Jeda' : (accumulatedMs > 0 ? 'Lanjut' : 'Mulai');
    startBtn.classList.toggle('running', isRunning);
    splitBtn.disabled = !isRunning;
    fsSplitBtn.disabled = !isRunning;
    tabCountdown.disabled = isRunning;
    tabStopwatch.disabled = isRunning;
    [hInput,mInput,sInput,...presetBtns].forEach(el => el.disabled = isRunning || accumulatedMs > 0);
  }

  function handleStart(){
    if(!running){
      if(accumulatedMs === 0 && mode === 'countdown'){
        targetMs = readTargetFromInputs();
        if(targetMs <= 0){ targetMs = 1000; }
      }
      running = true;
      startTs = performance.now();
      setControlsForRunning(true);
      startLoopIfNeeded();
    } else {
      accumulatedMs = currentElapsed();
      running = false;
      setControlsForRunning(false);
    }
  }

  function handleReset(){
    running = false;
    stopLoop();
    accumulatedMs = 0;
    overtimeAlarmed = false;
    splits = [];
    renderSplits();
    if(mode === 'countdown'){ targetMs = readTargetFromInputs(); }
    setControlsForRunning(false);
    render();
  }

  function playSplitAnimation(){
    [timeDisplay, trackWrap].forEach(el => {
      el.classList.remove('split-pulse');
      void el.offsetWidth; // restart animation
      el.classList.add('split-pulse');
    });
    setTimeout(() => {
      timeDisplay.classList.remove('split-pulse');
      trackWrap.classList.remove('split-pulse');
    }, 600);
  }

  function handleSplit(){
    if(!running) return;
    const elapsed = currentElapsed();
    const prevElapsed = splits.length ? splits[splits.length-1].elapsedMs : 0;
    const delta = elapsed - prevElapsed;
    splits.push({
      n: splits.length + 1,
      elapsedMs: elapsed,
      deltaMs: delta,
      remainingMs: mode === 'countdown' ? (targetMs - elapsed) : null
    });
    playSplitAnimation();
    renderSplits();
  }

  function renderSplits(){
    splitsList.innerHTML = '';
    splitsEmpty.classList.toggle('hidden', splits.length > 0);
    splitCount.textContent = splits.length + ' split';
    [...splits].reverse().forEach(sp => {
      const li = document.createElement('li');
      const totalLabel = mode === 'countdown'
        ? (sp.remainingMs >= 0 ? 'sisa ' + formatHMS(sp.remainingMs) : 'lewat ' + formatHMS(Math.abs(sp.remainingMs)))
        : formatHMS(sp.elapsedMs);
      li.innerHTML =
        '<span class="split-n">'+sp.n+'</span>' +
        '<span class="split-delta">+'+formatHMS(sp.deltaMs)+'</span>' +
        '<span class="split-total">'+totalLabel+'</span>';
      splitsList.appendChild(li);
    });
  }

  function switchMode(newMode){
    if(running) return;
    mode = newMode;
    tabCountdown.classList.toggle('active', mode === 'countdown');
    tabStopwatch.classList.toggle('active', mode === 'stopwatch');
    timeSetter.classList.toggle('hidden', mode === 'stopwatch');
    presetsWrap.classList.toggle('hidden', mode === 'stopwatch');
    handleReset();
  }

  tabCountdown.addEventListener('click', () => switchMode('countdown'));
  tabStopwatch.addEventListener('click', () => switchMode('stopwatch'));
  startBtn.addEventListener('click', handleStart);
  resetBtn.addEventListener('click', handleReset);
  splitBtn.addEventListener('click', handleSplit);
  fsSplitBtn.addEventListener('click', handleSplit);

  presetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      if(running || accumulatedMs > 0) return;
      const secs = parseInt(btn.dataset.preset, 10);
      hInput.value = Math.floor(secs/3600);
      mInput.value = Math.floor((secs%3600)/60);
      sInput.value = secs%60;
      targetMs = secs*1000;
      render();
    });
  });

  [hInput,mInput,sInput].forEach(inp => {
    inp.addEventListener('input', () => {
      if(running || accumulatedMs > 0) return;
      targetMs = readTargetFromInputs();
      render();
    });
    inp.addEventListener('click', e => e.stopPropagation());
  });

  // Click timer display to toggle fullscreen on the stage
  function toggleStageFullscreen(){
    const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
    if(!fsEl){
      const req = stage.requestFullscreen || stage.webkitRequestFullscreen;
      if(req) req.call(stage).catch(()=>{});
    } else {
      const exit = document.exitFullscreen || document.webkitExitFullscreen;
      if(exit) exit.call(document).catch(()=>{});
    }
  }
  displayZone.addEventListener('click', toggleStageFullscreen);

  // Wake lock
  if(!('wakeLock' in navigator)){
    wakeBtn.style.display = 'none';
  } else {
    wakeBtn.addEventListener('click', async () => {
      try{
        if(!wakeLock){
          wakeLock = await navigator.wakeLock.request('screen');
          wakeBtn.classList.add('on');
          wakeLock.addEventListener('release', () => { wakeBtn.classList.remove('on'); wakeLock = null; });
        } else {
          await wakeLock.release();
          wakeLock = null;
          wakeBtn.classList.remove('on');
        }
      }catch(e){}
    });
  }

  // init
  setInputsFromTarget();
  setControlsForRunning(false);
  render();
})();