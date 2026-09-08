// Exercise catalog, calorie math, and the day-by-day plan generator.
// Calorie figures use standard MET (Metabolic Equivalent of Task) and
// per-km estimates — reasonable everyday approximations, not clinical
// measurements. Actual burn varies with pace, terrain, fitness and more.

const EXERCISE_CATALOG = {
  walking: {
    id: 'walking', name: 'Walking', unit: 'km', step: 0.5, calcType: 'distance',
    kcalPerKgPerKm: 0.53,
    desc: 'Low-impact cardio anyone can start with — great daily baseline.',
    icon: `<circle cx="12" cy="4" r="2"/><path d="M12 6v6l-3 3M12 9l3 2.5M9 15l-2 5M12 12l4 2 1 5"/>`
  },
  running: {
    id: 'running', name: 'Running', unit: 'km', step: 0.5, calcType: 'distance',
    kcalPerKgPerKm: 1.036,
    desc: 'Higher-intensity cardio that burns roughly double walking\u2019s rate.',
    icon: `<circle cx="14" cy="4" r="2"/><path d="M13 6l-2 4-4 1M11 10l3 2 1 5M14 12l3-1 3 3M9 11l-3 3 1 4"/>`
  },
  pushups: {
    id: 'pushups', name: 'Push-ups', unit: 'reps', step: 5, calcType: 'reps',
    met: 8, secPerRep: 3,
    desc: 'Builds chest, shoulder and arm strength — no equipment needed.',
    icon: `<circle cx="18" cy="9" r="1.6"/><path d="M16.5 10.5l-9 2-4-1M7.5 12.5l1 5M8.5 12l3 1 1 4M16.5 10.5l1.5 2-1 3.5"/>`
  },
  situps: {
    id: 'situps', name: 'Sit-ups', unit: 'reps', step: 5, calcType: 'reps',
    met: 8, secPerRep: 3,
    desc: 'Classic core exercise targeting the abdominals.',
    icon: `<circle cx="6" cy="8" r="1.6"/><path d="M6 9.6l2 4h5M8 13.6l4-1.5 3 1M13.5 12l2.5-3M6 9.6l3 3-1 4"/>`
  },
  squats: {
    id: 'squats', name: 'Squats', unit: 'reps', step: 5, calcType: 'reps',
    met: 5, secPerRep: 3,
    desc: 'Strengthens legs and glutes — foundational lower-body move.',
    icon: `<circle cx="12" cy="4" r="2"/><path d="M12 6v4l-3 2v4M12 10l3 2v4M9 12h6"/>`
  },
  jumpingjacks: {
    id: 'jumpingjacks', name: 'Jumping jacks', unit: 'reps', step: 10, calcType: 'reps',
    met: 8, secPerRep: 1.5,
    desc: 'Full-body cardio burst — a quick way to raise your heart rate.',
    icon: `<circle cx="12" cy="4" r="2"/><path d="M12 6v6M12 6l-5-3M12 6l5-3M12 12l-5 6M12 12l5 6"/>`
  },
  plank: {
    id: 'plank', name: 'Plank', unit: 'min', step: 1, calcType: 'duration',
    met: 4,
    desc: 'Isometric hold that builds core and shoulder stability.',
    icon: `<circle cx="4" cy="9" r="1.6"/><path d="M5.5 9.5l13 2-1.5 4M18.5 11.5l2-3M5.5 9.5l-1 5"/>`
  },
  stretching: {
    id: 'stretching', name: 'Stretching', unit: 'min', step: 5, calcType: 'duration',
    met: 2.5,
    desc: 'Improves flexibility and helps recovery between harder days.',
    icon: `<circle cx="12" cy="4" r="2"/><path d="M12 6v6M12 6l-4-2M12 6l4-2M12 12l-3 6M12 12l3 6"/>`
  }
};

function calcExerciseCalories(exerciseId, amount, weightKg) {
  const ex = EXERCISE_CATALOG[exerciseId];
  const w = weightKg || 70; // fall back to an average adult weight if profile is incomplete
  if (!ex || !amount || amount <= 0) return 0;

  if (ex.calcType === 'distance') {
    return Math.round(amount * w * ex.kcalPerKgPerKm);
  }
  if (ex.calcType === 'reps') {
    const hours = (amount * ex.secPerRep) / 3600;
    return Math.round(ex.met * w * hours);
  }
  if (ex.calcType === 'duration') {
    const hours = amount / 60;
    return Math.round(ex.met * w * hours);
  }
  return 0;
}

function exerciseIconSvg(exerciseId, size = 24) {
  const ex = EXERCISE_CATALOG[exerciseId];
  const paths = ex ? ex.icon : `<circle cx="12" cy="12" r="8"/>`;
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
}

// ---------------- Weekly plan templates, by activity level ----------------
// Each day is a list of { exerciseId, amount } tasks. Day index: 0=Sun..6=Sat.
const WEEKLY_TEMPLATES = {
  sedentary: [
    [{ exerciseId: 'stretching', amount: 10 }],
    [{ exerciseId: 'walking', amount: 1.5 }],
    [{ exerciseId: 'stretching', amount: 10 }],
    [{ exerciseId: 'walking', amount: 2 }, { exerciseId: 'pushups', amount: 5 }],
    [{ exerciseId: 'stretching', amount: 10 }],
    [{ exerciseId: 'walking', amount: 2 }, { exerciseId: 'situps', amount: 5 }],
    [{ exerciseId: 'stretching', amount: 10 }]
  ],
  light: [
    [{ exerciseId: 'walking', amount: 3 }],
    [{ exerciseId: 'situps', amount: 15 }, { exerciseId: 'stretching', amount: 10 }],
    [{ exerciseId: 'walking', amount: 3 }, { exerciseId: 'pushups', amount: 10 }],
    [{ exerciseId: 'squats', amount: 10 }, { exerciseId: 'stretching', amount: 10 }],
    [{ exerciseId: 'walking', amount: 4 }],
    [{ exerciseId: 'jumpingjacks', amount: 20 }, { exerciseId: 'situps', amount: 15 }],
    [{ exerciseId: 'stretching', amount: 15 }]
  ],
  moderate: [
    [{ exerciseId: 'walking', amount: 5 }],
    [{ exerciseId: 'running', amount: 3 }, { exerciseId: 'pushups', amount: 15 }],
    [{ exerciseId: 'situps', amount: 20 }, { exerciseId: 'squats', amount: 15 }],
    [{ exerciseId: 'running', amount: 3 }],
    [{ exerciseId: 'pushups', amount: 20 }, { exerciseId: 'jumpingjacks', amount: 30 }],
    [{ exerciseId: 'walking', amount: 6 }, { exerciseId: 'plank', amount: 1 }],
    [{ exerciseId: 'stretching', amount: 15 }]
  ],
  active: [
    [{ exerciseId: 'running', amount: 5 }, { exerciseId: 'pushups', amount: 20 }],
    [{ exerciseId: 'situps', amount: 30 }, { exerciseId: 'squats', amount: 25 }, { exerciseId: 'plank', amount: 1 }],
    [{ exerciseId: 'running', amount: 4 }],
    [{ exerciseId: 'pushups', amount: 25 }, { exerciseId: 'jumpingjacks', amount: 40 }],
    [{ exerciseId: 'running', amount: 6 }],
    [{ exerciseId: 'situps', amount: 30 }, { exerciseId: 'squats', amount: 30 }, { exerciseId: 'plank', amount: 2 }],
    [{ exerciseId: 'walking', amount: 5 }, { exerciseId: 'stretching', amount: 10 }]
  ],
  very_active: [
    [{ exerciseId: 'running', amount: 10 }, { exerciseId: 'pushups', amount: 30 }],
    [{ exerciseId: 'situps', amount: 40 }, { exerciseId: 'squats', amount: 40 }, { exerciseId: 'plank', amount: 3 }],
    [{ exerciseId: 'running', amount: 8 }],
    [{ exerciseId: 'pushups', amount: 40 }, { exerciseId: 'jumpingjacks', amount: 60 }],
    [{ exerciseId: 'running', amount: 10 }],
    [{ exerciseId: 'situps', amount: 40 }, { exerciseId: 'squats', amount: 40 }, { exerciseId: 'jumpingjacks', amount: 40 }],
    [{ exerciseId: 'walking', amount: 8 }, { exerciseId: 'stretching', amount: 15 }]
  ]
};

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function getWeeklyPlan(activityLevel) {
  return WEEKLY_TEMPLATES[activityLevel] || WEEKLY_TEMPLATES.light;
}

function getPlanForDay(activityLevel, dayIndex) {
  const plan = getWeeklyPlan(activityLevel);
  return plan[dayIndex] || [];
}

function getTodaysPlan(activityLevel, d = new Date()) {
  return getPlanForDay(activityLevel, d.getDay());
}
