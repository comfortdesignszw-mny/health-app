(() => {
  const RING_CIRC = 2 * Math.PI * 56; // 351.86

  let profile = null;
  let pendingPhotoFile = null;
  let pendingThumb = null;
  let historyDate = todayStr();

  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));

  function toast(msg, ms = 2600) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('show'), ms);
  }

  function fmtDateHeading(d) {
    const opts = { weekday: 'long', month: 'short', day: 'numeric' };
    return new Date(d + 'T00:00:00').toLocaleDateString(undefined, opts);
  }

  // ---------------- Navigation ----------------
  function showScreen(name) {
    $$('.screen').forEach(s => s.classList.toggle('active', s.id === `screen-${name}`));
    $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.screen === name));
    if (name === 'today') renderToday();
    if (name === 'log') renderHistory();
    if (name === 'fitness') renderFitness();
    if (name === 'profile') fillProfileForm();
  }

  $$('.tab').forEach(t => t.addEventListener('click', () => showScreen(t.dataset.screen)));

  // ---------------- Today screen ----------------
  async function renderToday() {
    $('#topDate').textContent = new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

    const logs = await getLogsForDate(todayStr());
    const eaten = logs.reduce((s, l) => s + l.calories, 0);
    const protein = logs.reduce((s, l) => s + (l.protein || 0), 0);
    const goal = calcCalorieGoal(profile);
    const remaining = goal != null ? Math.max(goal - eaten, 0) : null;

    $('#statEaten').textContent = `${eaten} kcal`;
    $('#statGoal').textContent = goal != null ? `${goal} kcal` : 'Set up profile';
    $('#statProtein').textContent = `${Math.round(protein)} g`;
    $('#statMeals').textContent = logs.length;
    $('#ringNum').textContent = goal != null ? Math.round(remaining) : '—';

    const frac = goal ? Math.min(eaten / goal, 1) : 0;
    const offset = RING_CIRC * (1 - frac);
    $('#ringProgress').style.strokeDashoffset = offset;
    $('#ringProgress').style.stroke = goal && eaten > goal ? 'var(--warn)' : 'var(--accent)';

    renderLogList($('#todayLogList'), logs);

    const tips = dailyRecommendations({ profile, todayCalories: eaten, calorieGoal: goal });
    $('#tipsList').innerHTML = tips.map(t => `<div class="tip">${escapeHtml(t)}</div>`).join('');
  }

  function renderLogList(container, logs) {
    if (!logs.length) {
      container.innerHTML = `<div class="empty-state">Nothing logged yet. Take a photo of your next meal to get started.</div>`;
      return;
    }
    container.innerHTML = logs.map(l => `
      <div class="log-item" data-id="${l.id}">
        ${l.photo
          ? `<img class="log-thumb" src="${l.photo}" alt="">`
          : `<div class="log-thumb placeholder">🍽</div>`}
        <div class="log-info">
          <div class="name">${escapeHtml(l.name)}</div>
          <div class="meta">${escapeHtml(l.portion || '')}${l.source === 'ai' ? ' · AI estimate' : ''}</div>
        </div>
        <div class="log-cal">${l.calories}</div>
        <button class="log-del" data-del="${l.id}" aria-label="Delete">&times;</button>
      </div>
    `).join('');
    container.querySelectorAll('[data-del]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await deleteFoodLog(Number(btn.dataset.del));
        toast('Removed');
        showScreen(currentScreenName());
      });
    });
  }

  function currentScreenName() {
    const active = $('.screen.active');
    return active ? active.id.replace('screen-', '') : 'today';
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  // ---------------- Capture flow ----------------
  $('#cameraInput').addEventListener('change', e => handleFileChosen(e.target.files[0]));
  $('#galleryInput').addEventListener('change', e => handleFileChosen(e.target.files[0]));
  $('#btnManualAdd').addEventListener('click', () => openFoodSheet({ manual: true }));

  async function handleFileChosen(file) {
    if (!file) return;
    pendingPhotoFile = file;
    const previewUrl = URL.createObjectURL(file);
    openFoodSheet({ manual: false, previewUrl });

    try {
      pendingThumb = await makeThumbnail(file);
    } catch { pendingThumb = null; }

    try {
      const result = await analyseFoodPhoto(file, profile);
      $('#fName').value = result.name;
      $('#fPortion').value = result.portion;
      $('#fCalories').value = result.calories;
      $('#fProtein').value = result.protein || '';
      const bits = [];
      if (result.note) bits.push(`${result.note} (${result.confidence} confidence — feel free to adjust)`);
      if (result.remaining !== null) bits.push(`${result.remaining} free AI analysis${result.remaining === 1 ? '' : 'es'} left today.`);
      if (bits.length) {
        $('#sheetNote').style.display = 'block';
        $('#sheetNote').textContent = bits.join(' ');
      }
    } catch (err) {
      handleAiError(err);
    } finally {
      $('#sheetAnalysing').style.display = 'none';
      $('#sheetForm').style.display = 'block';
    }
    // reset inputs so choosing the same file again still fires 'change'
    $('#cameraInput').value = '';
    $('#galleryInput').value = '';
  }

  function handleAiError(err) {
    const msg = String(err && err.message || err);
    if (msg === 'offline') {
      toast("You're offline — enter the calories manually and save.");
    } else if (msg === 'rate-limited') {
      toast("Daily analysis limit reached for this network — enter the calories manually.");
    } else if (msg === 'server-not-configured') {
      toast("AI analysis isn't set up on this deployment yet — enter the calories manually.");
    } else {
      toast("Couldn't analyse the photo — enter the details manually.");
    }
  }

  function openFoodSheet({ manual, previewUrl }) {
    $('#foodSheetBackdrop').classList.add('open');
    $('#sheetPhoto').style.display = 'none';
    $('#sheetNote').style.display = 'none';
    $('#fName').value = ''; $('#fPortion').value = ''; $('#fCalories').value = ''; $('#fProtein').value = '';

    if (manual) {
      $('#sheetTitle').textContent = 'Add food manually';
      $('#sheetSub').textContent = 'No photo needed — just fill in what you had.';
      $('#sheetAnalysing').style.display = 'none';
      $('#sheetForm').style.display = 'block';
      pendingPhotoFile = null;
      pendingThumb = null;
    } else {
      $('#sheetTitle').textContent = 'Analysing your photo';
      $('#sheetSub').textContent = 'Check the estimate below, then adjust anything that looks off.';
      $('#sheetPhoto').src = previewUrl;
      $('#sheetPhoto').style.display = 'block';
      $('#sheetAnalysing').style.display = 'block';
      $('#sheetForm').style.display = 'none';
    }
  }

  $('#btnCancelFood').addEventListener('click', closeFoodSheet);
  function closeFoodSheet() {
    $('#foodSheetBackdrop').classList.remove('open');
    pendingPhotoFile = null;
    pendingThumb = null;
  }

  $('#btnSaveFood').addEventListener('click', async () => {
    const name = $('#fName').value.trim() || 'Food item';
    const calories = Number($('#fCalories').value) || 0;
    if (calories <= 0) { toast('Enter a calorie amount greater than 0'); return; }
    await addFoodLog({
      name,
      portion: $('#fPortion').value.trim(),
      calories,
      protein: Number($('#fProtein').value) || null,
      photo: pendingThumb,
      source: pendingPhotoFile ? 'ai' : 'manual'
    });
    closeFoodSheet();
    toast('Saved to today\u2019s log');
    showScreen('today');
  });

  // ---------------- History screen ----------------
  $('#histPrev').addEventListener('click', () => shiftHistoryDate(-1));
  $('#histToday').addEventListener('click', () => { historyDate = todayStr(); renderHistory(); });

  function shiftHistoryDate(deltaDays) {
    const d = new Date(historyDate + 'T00:00:00');
    d.setDate(d.getDate() + deltaDays);
    historyDate = todayStr(d);
    renderHistory();
  }

  async function renderHistory() {
    $('#logDateLabel').textContent = fmtDateHeading(historyDate);
    const logs = await getLogsForDate(historyDate);
    const total = logs.reduce((s, l) => s + l.calories, 0);
    $('#histTotal').textContent = `${total} kcal`;
    renderLogList($('#histLogList'), logs);
  }

  // ---------------- Fitness screen ----------------
  function bmiToPercent(bmi) {
    const stops = [[15, 0], [18.5, 15], [25, 45], [30, 70], [40, 100]];
    const b = Math.min(Math.max(bmi, 15), 40);
    for (let i = 0; i < stops.length - 1; i++) {
      const [b1, p1] = stops[i], [b2, p2] = stops[i + 1];
      if (b >= b1 && b <= b2) return p1 + (b - b1) / (b2 - b1) * (p2 - p1);
    }
    return 50;
  }

  async function renderFitness() {
    const bmi = calcBMI(profile.weightKg, profile.heightCm);
    const cat = bmiCategory(bmi);

    if (bmi) {
      $('#bmiValue').textContent = bmi.toFixed(1);
      $('#bmiPill').textContent = cat.label;
      $('#bmiPill').className = 'pill ' + (cat.key === 'normal' ? 'good' : (cat.key === 'obese' ? 'warn' : ''));
      $('#bmiMarker').style.left = bmiToPercent(bmi) + '%';
      const range = healthyWeightRange(profile.heightCm);
      $('#bmiHealthyRange').textContent = range ? `Healthy weight for your height:\n${range.min.toFixed(1)}–${range.max.toFixed(1)} kg` : '';
    } else {
      $('#bmiValue').textContent = '—';
      $('#bmiPill').textContent = 'Add height & weight in Profile';
      $('#bmiPill').className = 'pill';
      $('#bmiMarker').style.left = '0%';
      $('#bmiHealthyRange').textContent = '';
    }

    const tdee = calcTDEE(profile);
    const goal = calcCalorieGoal(profile);
    $('#tdeeVal').textContent = tdee ? Math.round(tdee) : '—';
    $('#goalVal').textContent = goal ? Math.round(goal) : '—';

    const plan = buildFitnessPlan(profile);
    $('#planPanel').innerHTML = plan
      ? plan.steps.map(s => `<div class="plan-step"><div class="dot"></div><div class="txt">${escapeHtml(s)}</div></div>`).join('')
      : `<div class="empty-state">Add your age, height and weight in Profile to get a personalised plan.</div>`;

    const weights = await getRecentWeights(10);
    renderWeightTrend(weights);
  }

  function renderWeightTrend(weights) {
    const el = $('#weightTrend');
    if (!weights.length) { el.innerHTML = `<div class="empty-state">No weigh-ins yet.</div>`; return; }
    const rows = weights.slice().reverse().map((w, i, arr) => {
      const prev = arr[i + 1];
      const delta = prev ? (w.weightKg - prev.weightKg) : null;
      const deltaTxt = delta == null ? '' : (delta === 0 ? '±0.0' : (delta > 0 ? `+${delta.toFixed(1)}` : delta.toFixed(1)));
      return `<div class="log-item"><div class="log-info"><div class="name">${w.date}</div></div><div class="log-cal" style="font-size:15px">${w.weightKg} kg</div>${deltaTxt ? `<span class="small muted" style="width:44px;text-align:right">${deltaTxt}</span>` : ''}</div>`;
    }).join('');
    el.innerHTML = rows;
  }

  $('#btnLogWeight').addEventListener('click', async () => {
    const val = Number($('#weightInput').value);
    if (!val || val < 20 || val > 400) { toast('Enter a valid weight in kg'); return; }
    await addWeightLog(val);
    profile = await saveProfile({ weightKg: val });
    $('#weightInput').value = '';
    toast('Weight logged');
    renderFitness();
  });

  // ---------------- Profile screen ----------------
  function fillProfileForm() {
    $('#pName').value = profile.name || '';
    $('#pSex').value = profile.sex || 'female';
    $('#pAge').value = profile.age || '';
    $('#pHeight').value = profile.heightCm || '';
    $('#pWeight').value = profile.weightKg || '';
    $('#pActivity').value = profile.activityLevel || 'light';
    $('#pGoal').value = profile.goal || 'lose';
    $('#pApiKey').value = profile.aiApiKey || '';
  }

  $('#btnSaveProfile').addEventListener('click', async () => {
    const patch = {
      name: $('#pName').value.trim(),
      sex: $('#pSex').value,
      age: Number($('#pAge').value) || null,
      heightCm: Number($('#pHeight').value) || null,
      weightKg: Number($('#pWeight').value) || null,
      activityLevel: $('#pActivity').value,
      goal: $('#pGoal').value,
      onboarded: true
    };
    profile = await saveProfile(patch);
    toast('Profile saved');
    showScreen('fitness');
  });

  $('#btnSaveKey').addEventListener('click', async () => {
    const key = $('#pApiKey').value.trim();
    profile = await saveProfile({ aiApiKey: key });
    toast(key ? 'API key saved on this device' : 'API key cleared');
  });

  $('#btnExport').addEventListener('click', async () => {
    const [logs, weights, prof] = await Promise.all([
      db.foodLogs.toArray(), db.weightLogs.toArray(), getProfile()
    ]);
    const safeProfile = { ...prof, aiApiKey: undefined };
    const blob = new Blob([JSON.stringify({ profile: safeProfile, foodLogs: logs, weightLogs: weights }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `comfort-health-export-${todayStr()}.json`;
    a.click();
  });

  $('#btnReset').addEventListener('click', async () => {
    if (!confirm('This deletes every meal, weigh-in, and your profile from this device. This cannot be undone. Continue?')) return;
    await Promise.all([db.profile.clear(), db.foodLogs.clear(), db.weightLogs.clear()]);
    localStorage.clear();
    location.reload();
  });

  // ---------------- Boot ----------------
  async function boot() {
    profile = await getProfile();
    showScreen('today');
    if (!profile.onboarded) {
      setTimeout(() => { toast('Welcome! Set up your profile to get a personalised calorie goal.', 4000); }, 600);
    }
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
