/* Column Rebuild — SPE UOB / Bahraini Engineers Day
   No frameworks, accounts, analytics, external requests or build step required.
   Game rules: 6 correct placements in a maximum of 20.0 seconds.
*/
(() => {
  'use strict';

  const DURATION_MS = 20_000;
  const PREVIEW_MS = 1120;
  const PARTS = Object.freeze([
    { id: 'tower', name: 'COLUMN SHELL' },
    { id: 'trays', name: 'DISTILLATION TRAYS' },
    { id: 'condenser', name: 'CONDENSER' },
    { id: 'reflux', name: 'REFLUX DRUM' },
    { id: 'reboiler', name: 'REBOILER' },
    { id: 'feed', name: 'FEED INLET' }
  ]);
  const partIds = PARTS.map(part => part.id);

  const el = id => document.getElementById(id);
  const board = el('boardStage');
  const blueprint = el('blueprint');
  const overlay = el('boardOverlay');
  const overlayCard = el('overlayCard');
  const cards = new Map([...document.querySelectorAll('.component-card')].map(card => [card.dataset.part, card]));
  const slots = new Map([...document.querySelectorAll('.target')].map(slot => [slot.dataset.part, slot]));
  const pips = [...document.querySelectorAll('#pipTrack i')];

  let phase = 'idle'; // idle | preview | playing | won | lost
  let installed = new Set();
  let selected = null;
  let startAt = 0;
  let frame = 0;
  let previewTimeout = 0;
  let toastTimeout = 0;
  let audio = null;
  let soundEnabled = true;
  let pointer = null;
  let ghost = null;
  let best = readBest();

  function readBest() {
    try {
      const number = Number(localStorage.getItem('spe-column-best-seconds'));
      return Number.isFinite(number) && number > 0 && number <= 20 ? number : null;
    } catch { return null; }
  }

  function storeBest(seconds) {
    best = seconds;
    try { localStorage.setItem('spe-column-best-seconds', String(seconds)); } catch { /* private browsing */ }
  }

  function setSystem(text, alert) {
    const status = el('systemStatus');
    status.innerHTML = `<i></i> ${text}`;
    status.classList.toggle('is-alert', Boolean(alert));
  }

  function playTone(frequency, duration = 0.085, type = 'sine', volume = 0.055, delay = 0) {
    if (!soundEnabled) return;
    try {
      audio ||= new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(frequency, audio.currentTime + delay);
      gain.gain.setValueAtTime(volume, audio.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + delay + duration);
      osc.connect(gain).connect(audio.destination);
      osc.start(audio.currentTime + delay);
      osc.stop(audio.currentTime + delay + duration);
    } catch { /* Audio is optional, gameplay is never dependent on it. */ }
  }


  // ORIGINAL 8-BIT ARCADE SOUNDTRACK
  // Entirely synthesized with Web Audio. No downloads, external assets or autoplay.
  // The game clock, mechanics and existing sound effects remain unchanged.
  const MUSIC_BEAT = 60 / 156 / 2; // upbeat 156 BPM, eighth-note steps
  const MUSIC_MELODY = [
    76, null, 79, 84, 79, 76, 74, null, 72, 74, 76, 79, 76, null, 74, null,
    76, null, 81, 84, 81, 79, 76, null, 72, 76, 79, 81, 79, null, 76, null,
    77, null, 81, 84, 81, 77, 76, null, 74, 72, 74, 77, 76, null, 72, null,
    79, null, 83, 86, 83, 79, 77, null, 76, 74, 76, 79, 84, null, 79, null
  ];
  const MUSIC_ROOTS = [48, 45, 41, 43]; // C, Am, F, G
  const MUSIC_ARPS = [
    [60, 64, 67, 72], [57, 60, 64, 69],
    [53, 57, 60, 65], [55, 59, 62, 67]
  ];
  let musicTimer = 0;
  let musicOutput = null;
  let musicStep = 0;
  let musicNextAt = 0;
  let noiseBuffer = null;

  function chipNote(note, time, duration, type, volume) {
    const oscillator = audio.createOscillator();
    const envelope = audio.createGain();
    const filter = audio.createBiquadFilter();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(440 * 2 ** ((note - 69) / 12), time);
    filter.type = 'lowpass';
    filter.frequency.value = type === 'square' ? 2600 : 3800;
    envelope.gain.setValueAtTime(0.0001, time);
    envelope.gain.exponentialRampToValueAtTime(volume, time + 0.012);
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    oscillator.connect(filter).connect(envelope).connect(musicOutput);
    oscillator.start(time);
    oscillator.stop(time + duration + 0.018);
  }

  function musicKick(time) {
    const oscillator = audio.createOscillator();
    const envelope = audio.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(155, time);
    oscillator.frequency.exponentialRampToValueAtTime(56, time + 0.11);
    envelope.gain.setValueAtTime(0.065, time);
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + 0.12);
    oscillator.connect(envelope).connect(musicOutput);
    oscillator.start(time);
    oscillator.stop(time + 0.125);
  }

  function musicNoise(time, duration, volume, cutoff) {
    if (!noiseBuffer) {
      noiseBuffer = audio.createBuffer(1, Math.floor(audio.sampleRate * 0.14), audio.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    const src = audio.createBufferSource();
    const filter = audio.createBiquadFilter();
    const envelope = audio.createGain();
    src.buffer = noiseBuffer;
    filter.type = 'highpass';
    filter.frequency.value = cutoff;
    envelope.gain.setValueAtTime(volume, time);
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    src.connect(filter).connect(envelope).connect(musicOutput);
    src.start(time);
    src.stop(time + duration + 0.01);
  }

  function scheduleMusic() {
    if (!musicOutput || !audio) return;
    // Look-ahead scheduling keeps the beat steady on lower-powered phones.
    while (musicNextAt < audio.currentTime + 0.22) {
      const time = musicNextAt;
      const index = musicStep % MUSIC_MELODY.length;
      const bar = Math.floor(index / 16);
      const beat = index % 16;
      const melody = MUSIC_MELODY[index];
      if (melody !== null) chipNote(melody, time, MUSIC_BEAT * 0.76, 'square', 0.031);
      if (beat % 4 === 0) chipNote(MUSIC_ROOTS[bar], time, MUSIC_BEAT * 2.5, 'triangle', 0.053);
      if (beat % 2 === 1) chipNote(MUSIC_ARPS[bar][Math.floor(beat / 2) % 4] + 12, time, MUSIC_BEAT * 0.45, 'triangle', 0.010);
      if (beat % 8 === 0) musicKick(time);
      if (beat % 8 === 4) musicNoise(time, 0.095, 0.021, 1200);
      if (beat % 2 === 0) musicNoise(time, 0.036, 0.009, 5700);
      musicStep++;
      musicNextAt += MUSIC_BEAT;
    }
  }

  function startMusic() {
    if (!soundEnabled || musicTimer || !['preview', 'playing'].includes(phase)) return;
    try {
      audio ||= new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
      musicOutput = audio.createGain();
      musicOutput.gain.setValueAtTime(0.0001, audio.currentTime);
      musicOutput.gain.linearRampToValueAtTime(0.78, audio.currentTime + 0.16);
      musicOutput.connect(audio.destination);
      musicStep = 0;
      musicNextAt = audio.currentTime + 0.035;
      scheduleMusic();
      musicTimer = window.setInterval(scheduleMusic, 70);
    } catch { /* Audio remains optional if a browser lacks Web Audio. */ }
  }

  function stopMusic() {
    if (musicTimer) window.clearInterval(musicTimer);
    musicTimer = 0;
    if (musicOutput && audio) {
      const now = audio.currentTime;
      musicOutput.gain.cancelScheduledValues(now);
      musicOutput.gain.setValueAtTime(musicOutput.gain.value, now);
      musicOutput.gain.linearRampToValueAtTime(0, now + 0.12);
    }
    musicOutput = null;
  }

  function toast(message) {
    const target = el('boardToast');
    clearTimeout(toastTimeout);
    target.textContent = message;
    target.classList.add('is-visible');
    toastTimeout = window.setTimeout(() => target.classList.remove('is-visible'), 1050);
  }

  function refreshMetrics(seconds = 20) {
    const remaining = Math.max(0, seconds);
    el('timerDisplay').textContent = remaining.toFixed(1);
    el('timerFill').style.transform = `scaleX(${remaining / 20})`;
    el('timerFill').style.background = remaining <= 5 ? '#d45b30' : '';
    const completedCount = (phase === 'idle' || phase === 'preview') ? 0 : installed.size;
    el('progressDisplay').textContent = String(completedCount);
    el('mobileTimer').textContent = remaining.toFixed(1);
    el('mobileProgress').textContent = `${completedCount} / 6`;
    el('bestDisplay').textContent = best === null ? '—' : best.toFixed(1);
    pips.forEach((pip, index) => pip.classList.toggle('is-filled', index < completedCount));
  }

  function setInstalled(ids) {
    installed = new Set(ids);
    for (const id of partIds) {
      slots.get(id).classList.toggle('is-placed', installed.has(id));
      const card = cards.get(id);
      const placed = installed.has(id);
      const completed = placed && (phase === 'playing' || phase === 'won' || phase === 'lost');
      card.classList.toggle('is-locked', completed);
      card.disabled = completed || phase !== 'playing';
      card.setAttribute('aria-label', `${placed ? 'Installed' : 'Select'} ${PARTS.find(p => p.id === id).name.toLowerCase()}`);
    }
  }

  function clearSelection() {
    selected = null;
    cards.forEach(card => card.classList.remove('is-selected'));
    slots.forEach(slot => slot.classList.remove('is-hinted', 'is-bad'));
  }

  function selectPart(id) {
    if (phase !== 'playing' || installed.has(id)) return;
    clearSelection();
    selected = id;
    cards.get(id).classList.add('is-selected');
    slots.get(id).classList.add('is-hinted');
    el('workbenchInstruction').textContent = `Place the ${PARTS.find(p => p.id === id).name.toLowerCase()} onto the outlined position.`;
    playTone(480, 0.05, 'sine', 0.025);
  }

  function hideOverlay() { overlay.hidden = true; }
  function showOverlay(html) { overlayCard.innerHTML = html; overlay.hidden = false; }

  function startGame() {
    if (!['idle', 'won', 'lost'].includes(phase)) return;
    cancelAnimationFrame(frame);
    clearTimeout(previewTimeout);
    clearTimeout(toastTimeout);
    destroyGhost();
    clearSelection();
    phase = 'preview';
    stopMusic();
    startMusic();
    setInstalled(partIds);
    refreshMetrics(20);
    hideOverlay();
    el('resetButton').disabled = false;
    el('workbenchInstruction').textContent = 'Watch closely: the system is about to come apart.';
    setSystem('DISASSEMBLING', true);
    board.classList.add('is-shaking');
    playTone(370, .2, 'sawtooth', .018);
    playTone(280, .25, 'sawtooth', .018, .2);
    for (const card of cards.values()) card.classList.remove('is-pop');

    previewTimeout = window.setTimeout(() => {
      if (phase !== 'preview') return;
      board.classList.remove('is-shaking');
      board.classList.add('is-disassembling');
      previewTimeout = window.setTimeout(() => {
        if (phase !== 'preview') return;
        board.classList.remove('is-disassembling');
        phase = 'playing';
        el('mobileLiveStrip').hidden = false;
        setInstalled([]);
        el('workbenchInstruction').textContent = 'GO! Tap a part and its matching outline—or drag it into position.';
        setSystem('REBUILD IN PROGRESS', true);
        [...cards.values()].forEach((card, i) => {
          card.style.setProperty('--pop-delay', `${i * 30}ms`);
          card.classList.add('is-pop');
        });
        startAt = performance.now();
        if (window.innerWidth <= 800) {
          // Fit the entire workbench into view on shorter phones, while leaving the diagram visible.
          const amount = el('componentGrid').getBoundingClientRect().bottom - window.innerHeight + 12;
          if (amount > 0) window.scrollBy({ top: amount, behavior: 'smooth' });
        }
        frame = requestAnimationFrame(tick);
        toast('THE CLOCK IS RUNNING — GO!');
        playTone(650, .1, 'triangle', .04);
      }, 650);
    }, PREVIEW_MS);
  }

  function tick(now) {
    if (phase !== 'playing') return;
    const remainingMs = Math.max(0, DURATION_MS - (now - startAt));
    refreshMetrics(remainingMs / 1000);
    if (remainingMs <= 0) { finish(false, 20); return; }
    frame = requestAnimationFrame(tick);
  }

  function isInsideSlot(id, x, y) {
    const box = slots.get(id).querySelector('.target-outline').getBoundingClientRect();
    const pad = Math.min(13, Math.max(7, box.width * 0.12));
    return x >= box.left - pad && x <= box.right + pad && y >= box.top - pad && y <= box.bottom + pad;
  }

  function attemptPlacement(id, x, y) {
    if (phase !== 'playing' || installed.has(id)) return;
    if (performance.now() - startAt >= DURATION_MS) { finish(false, 20); return; }
    if (!isInsideSlot(id, x, y)) {
      const slot = slots.get(id);
      slot.classList.add('is-bad');
      setTimeout(() => slot.classList.remove('is-bad'), 330);
      playTone(180, .13, 'square', .015);
      toast('NOT THERE — FOLLOW THE MATCHING OUTLINE');
      return;
    }
    installed.add(id);
    slots.get(id).classList.add('is-placed');
    clearSelection();
    setInstalled(installed);
    refreshMetrics(Math.max(0, (DURATION_MS - (performance.now() - startAt)) / 1000));
    playTone(550, .12, 'sine', .045);
    playTone(790, .14, 'sine', .03, .07);
    if (installed.size === PARTS.length) {
      const time = Math.min(20, (performance.now() - startAt) / 1000);
      finish(true, time);
    } else {
      toast(`${PARTS.find(part => part.id === id).name} INSTALLED ✓`);
      el('workbenchInstruction').textContent = `${installed.size} of 6 installed. Pick the next component!`;
    }
  }

  function timeSentence(seconds) {
    if (seconds < 7) return 'That was FAST. Your plant is back online.';
    if (seconds < 14) return 'Smooth operation. The plant is running again.';
    return 'Every part in place. Nicely engineered.';
  }

  function finish(won, elapsed) {
    if (phase !== 'playing') return;
    phase = won ? 'won' : 'lost';
    stopMusic();
    el('mobileLiveStrip').hidden = true;
    cancelAnimationFrame(frame);
    destroyGhost();
    clearSelection();
    setInstalled(installed);
    refreshMetrics(won ? 20 - elapsed : 0);
    cards.forEach(card => { card.disabled = true; });
    setSystem(won ? 'SYSTEM RESTORED' : 'SHIFT ENDED', !won);
    el('workbenchInstruction').textContent = won ? 'All six systems have been restored.' : 'Time is up. The next shift is yours!';

    if (won) {
      const rounded = Math.round(elapsed * 10) / 10;
      const newRecord = best === null || elapsed < best;
      if (newRecord) storeBest(elapsed);
      refreshMetrics(20 - elapsed);
      showOverlay(`
        <div class="overlay-kicker"><span class="signal-dot"></span> SHIFT COMPLETE / 06 OF 06</div>
        <div class="overlay-title">PLANT <em>RESTORED.</em></div>
        <div class="overlay-result"><strong>${rounded.toFixed(1)}</strong><span>SECONDS</span></div>
        <p>${timeSentence(elapsed)} ${newRecord ? '<strong>New personal best!</strong>' : ''}</p>
        <button class="primary-action" id="primaryAction" type="button">BEAT YOUR TIME <span aria-hidden="true">↗</span></button>
        <div class="overlay-footnote">SPE UOB <span>✦</span> BAHRAINI ENGINEERS DAY</div>`);
      el('primaryAction').addEventListener('click', startGame);
      confetti();
      playTone(523, .15, 'triangle', .045);
      playTone(659, .15, 'triangle', .045, .12);
      playTone(784, .25, 'triangle', .055, .24);
    } else {
      showOverlay(`
        <div class="overlay-kicker"><span class="signal-dot"></span> TIME'S UP / SHIFT ENDED</div>
        <div class="overlay-title">THE PLANT <em>NEEDS YOU.</em></div>
        <div class="overlay-result"><strong>${installed.size}<span style="font-size:22px;color:#6b7d7a;letter-spacing:0"> / 6</span></strong><span>PARTS</span></div>
        <p>Not quite finished. You know the equipment now—give the next shift a shot.</p>
        <button class="primary-action" id="primaryAction" type="button">TRY AGAIN <span aria-hidden="true">↗</span></button>
        <div class="overlay-footnote">20 SECONDS <span>✦</span> ONE MORE SHIFT?</div>`);
      el('primaryAction').addEventListener('click', startGame);
      playTone(310, .22, 'sawtooth', .023);
      playTone(230, .28, 'sawtooth', .018, .17);
    }
  }

  function confetti() {
    const layer = el('confettiLayer');
    layer.replaceChildren();
    const colors = ['#be293b', '#cf9c54', '#2b7b79', '#304f64', '#f7f0d9'];
    for (let i = 0; i < 33; i++) {
      const bit = document.createElement('span');
      bit.className = 'confetti-bit';
      bit.style.left = `${Math.random() * 100}%`;
      bit.style.setProperty('--color', colors[i % colors.length]);
      bit.style.setProperty('--duration', `${1.2 + Math.random() * 1.3}s`);
      bit.style.setProperty('--delay', `${Math.random() * .45}s`);
      bit.style.setProperty('--spin', `${Math.floor(Math.random() * 950 - 475)}deg`);
      bit.style.setProperty('--sway', `${Math.random() * 140 - 70}px`);
      layer.appendChild(bit);
    }
    setTimeout(() => layer.replaceChildren(), 3000);
  }

  function resetToIdle() {
    stopMusic();
    clearTimeout(previewTimeout);
    cancelAnimationFrame(frame);
    destroyGhost();
    phase = 'idle';
    el('mobileLiveStrip').hidden = true;
    clearSelection();
    board.classList.remove('is-disassembling', 'is-shaking');
    setInstalled(partIds);
    cards.forEach(card => { card.classList.remove('is-pop', 'is-selected'); card.classList.add('is-dormant'); });
    setSystem('SYSTEM INTACT', false);
    el('workbenchInstruction').textContent = 'Get ready. The complete column will come apart when you start.';
    el('resetButton').disabled = true;
    el('confettiLayer').replaceChildren();
    refreshMetrics(20);
    showOverlay(`
      <div class="overlay-kicker"><span class="signal-dot"></span> THE ENGINEERING CHALLENGE</div>
      <div class="overlay-title">CAN YOU PUT IT<br><em>BACK TOGETHER?</em></div>
      <p>Study the complete column. It will split into six parts—reassemble it before the clock runs out.</p>
      <button class="primary-action" id="primaryAction" type="button">START THE REBUILD <span aria-hidden="true">↗</span></button>
      <div class="overlay-footnote">6 PARTS <span>✦</span> 20 SECOND SHIFT <span>✦</span> NO ENGINEERING DEGREE REQUIRED</div>`);
    el('primaryAction').addEventListener('click', () => { cards.forEach(c => c.classList.remove('is-dormant')); startGame(); });
  }

  function destroyGhost() { if (ghost) { ghost.remove(); ghost = null; } pointer = null; }

  function createGhost(id) {
    const card = cards.get(id);
    ghost = document.createElement('div');
    ghost.className = 'floating-part';
    ghost.innerHTML = `<svg viewBox="${card.querySelector('svg').getAttribute('viewBox')}" aria-hidden="true"><use href="#part-${id}"/></svg><span>${PARTS.find(p => p.id === id).name}</span>`;
    document.body.appendChild(ghost);
  }

  function handlePointerDown(event) {
    const card = event.currentTarget;
    const id = card.dataset.part;
    if (phase !== 'playing' || installed.has(id) || (event.pointerType === 'mouse' && event.button !== 0)) return;
    pointer = { id, x: event.clientX, y: event.clientY, moving: false, pointerId: event.pointerId };
    card.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event) {
    if (!pointer || pointer.pointerId !== event.pointerId) return;
    if (!pointer.moving && Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 8) {
      pointer.moving = true;
      selectPart(pointer.id);
      createGhost(pointer.id);
      cards.get(pointer.id).classList.add('is-dragging');
    }
    if (pointer.moving && ghost) {
      ghost.style.left = `${event.clientX}px`;
      ghost.style.top = `${event.clientY}px`;
    }
  }

  function handlePointerUp(event) {
    if (!pointer || pointer.pointerId !== event.pointerId) return;
    const { id, moving } = pointer;
    if (moving) {
      if (ghost) { ghost.style.left = `${event.clientX}px`; ghost.style.top = `${event.clientY}px`; }
      attemptPlacement(id, event.clientX, event.clientY);
    } else { selectPart(id); }
    cards.get(id).classList.remove('is-dragging');
    destroyGhost();
  }

  // Input: tap-to-place works with one finger, a mouse, a keyboard, or a touchscreen.
  cards.forEach(card => {
    card.addEventListener('pointerdown', handlePointerDown);
    card.addEventListener('pointermove', handlePointerMove);
    card.addEventListener('pointerup', handlePointerUp);
    card.addEventListener('pointercancel', () => { card.classList.remove('is-dragging'); destroyGhost(); });
    card.addEventListener('keydown', event => {
      if ((event.key === 'Enter' || event.key === ' ') && phase === 'playing') {
        event.preventDefault(); selectPart(card.dataset.part);
      }
    });
  });
  blueprint.addEventListener('click', event => {
    if (phase === 'playing' && selected && Number.isFinite(event.clientX)) attemptPlacement(selected, event.clientX, event.clientY);
  });
  slots.forEach(slot => slot.addEventListener('keydown', event => {
    if (phase !== 'playing' || !selected || !['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    if (selected === slot.dataset.part) {
      const rect = slot.querySelector('.target-outline').getBoundingClientRect();
      attemptPlacement(selected, rect.left + rect.width / 2, rect.top + rect.height / 2);
    } else {
      playTone(180, .13, 'square', .015);
      toast('THAT PART BELONGS SOMEWHERE ELSE');
    }
  }));
  el('resetButton').addEventListener('click', resetToIdle);
  el('soundToggle').addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    el('soundToggle').classList.toggle('is-muted', !soundEnabled);
    el('soundLabel').textContent = soundEnabled ? 'SOUND ON' : 'SOUND OFF';
    el('soundToggle').setAttribute('aria-label', soundEnabled ? 'Mute game audio' : 'Unmute game audio');
    if (soundEnabled) {
      playTone(660, .08);
      startMusic();
    } else {
      stopMusic();
    }
  });
  resetToIdle();
})();
