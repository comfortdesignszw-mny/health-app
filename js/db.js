// Local database — everything lives on-device via IndexedDB (Dexie).
// No data ever leaves the phone except the single photo sent to the AI
// endpoint for calorie estimation (only when the user taps "Analyse").

const db = new Dexie('ComfortHealthDB');

db.version(1).stores({
  profile: 'id',                                   // single row, id: 1
  foodLogs: '++id, date, timestamp',                // one row per logged food item
  weightLogs: '++id, date'                          // one row per weigh-in
});

const DEFAULT_PROFILE = {
  id: 1,
  name: '',
  sex: 'female',
  age: null,
  heightCm: null,
  weightKg: null,
  activityLevel: 'light',   // sedentary | light | moderate | active | very_active
  goal: 'lose',             // lose | maintain | gain
  calorieGoalOverride: null,
  aiProvider: 'anthropic',
  aiApiKey: '',
  aiModel: 'claude-sonnet-5',
  onboarded: false
};

async function getProfile() {
  const p = await db.profile.get(1);
  return p || { ...DEFAULT_PROFILE };
}

async function saveProfile(patch) {
  const current = await getProfile();
  const next = { ...current, ...patch, id: 1 };
  await db.profile.put(next);
  return next;
}

function todayStr(d = new Date()) {
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 10);
}

async function addFoodLog(entry) {
  const row = {
    date: entry.date || todayStr(),
    timestamp: Date.now(),
    name: entry.name || 'Food item',
    calories: Math.round(entry.calories || 0),
    protein: entry.protein ?? null,
    carbs: entry.carbs ?? null,
    fat: entry.fat ?? null,
    portion: entry.portion || '',
    photo: entry.photo || null,   // base64 thumbnail, optional
    source: entry.source || 'manual',
    confidence: entry.confidence || null
  };
  return db.foodLogs.add(row);
}

async function deleteFoodLog(id) {
  return db.foodLogs.delete(id);
}

async function getLogsForDate(date) {
  return db.foodLogs.where('date').equals(date).sortBy('timestamp').then(r => r.reverse());
}

async function getLogsBetween(startDate, endDate) {
  return db.foodLogs.where('date').between(startDate, endDate, true, true).toArray();
}

async function addWeightLog(weightKg, date) {
  const d = date || todayStr();
  const existing = await db.weightLogs.where('date').equals(d).first();
  if (existing) {
    await db.weightLogs.update(existing.id, { weightKg });
    return existing.id;
  }
  return db.weightLogs.add({ date: d, weightKg });
}

async function getRecentWeights(limit = 30) {
  const all = await db.weightLogs.orderBy('date').toArray();
  return all.slice(-limit);
}
