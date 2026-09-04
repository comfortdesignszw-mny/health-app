// Pure calculation helpers — BMI, daily calorie needs, and a fitness plan
// aimed at moving BMI toward the 18.5–24.9 "normal" range.

function calcBMI(weightKg, heightCm) {
  if (!weightKg || !heightCm) return null;
  const h = heightCm / 100;
  return weightKg / (h * h);
}

function bmiCategory(bmi) {
  if (bmi == null) return null;
  if (bmi < 18.5) return { key: 'under', label: 'Below range', color: '#6E9BE2' };
  if (bmi < 25) return { key: 'normal', label: 'Normal range', color: '#6FBF8B' };
  if (bmi < 30) return { key: 'over', label: 'Above range', color: '#E8A33D' };
  return { key: 'obese', label: 'Well above range', color: '#E2694B' };
}

// Weight range (kg) that puts this height in a BMI of 18.5–24.9
function healthyWeightRange(heightCm) {
  if (!heightCm) return null;
  const h = heightCm / 100;
  return { min: 18.5 * h * h, max: 24.9 * h * h };
}

const ACTIVITY_FACTORS = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9
};

const ACTIVITY_LABELS = {
  sedentary: 'Sedentary — desk-based, little exercise',
  light: 'Light — exercise 1–3 days/week',
  moderate: 'Moderate — exercise 3–5 days/week',
  active: 'Active — exercise 6–7 days/week',
  very_active: 'Very active — hard training or physical job'
};

// Mifflin-St Jeor equation
function calcBMR({ weightKg, heightCm, age, sex }) {
  if (!weightKg || !heightCm || !age) return null;
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return sex === 'male' ? base + 5 : base - 161;
}

function calcTDEE(profile) {
  const bmr = calcBMR(profile);
  if (!bmr) return null;
  const factor = ACTIVITY_FACTORS[profile.activityLevel] || 1.375;
  return bmr * factor;
}

// Recommended daily calorie target given the profile's goal and current BMI.
function calcCalorieGoal(profile) {
  if (profile.calorieGoalOverride) return profile.calorieGoalOverride;
  const tdee = calcTDEE(profile);
  if (!tdee) return null;
  const bmi = calcBMI(profile.weightKg, profile.heightCm);
  const cat = bmiCategory(bmi);

  let goal = profile.goal;
  // If no explicit goal makes sense for the BMI, nudge toward normal range automatically
  if (cat && cat.key === 'under' && goal === 'lose') goal = 'gain';
  if (cat && (cat.key === 'over' || cat.key === 'obese') && goal === 'gain') goal = 'lose';

  if (goal === 'lose') return Math.round(Math.max(tdee - tdee * 0.2, 1200));
  if (goal === 'gain') return Math.round(tdee + tdee * 0.15);
  return Math.round(tdee);
}

// Weeks to reach the nearer edge of the normal BMI range at a safe ~0.5 kg/week pace
function weeksToNormalRange(profile) {
  const bmi = calcBMI(profile.weightKg, profile.heightCm);
  const range = healthyWeightRange(profile.heightCm);
  if (!bmi || !range) return null;
  const cat = bmiCategory(bmi);
  if (!cat || cat.key === 'normal') return 0;
  const targetKg = cat.key === 'under' ? range.min : range.max;
  const deltaKg = Math.abs(profile.weightKg - targetKg);
  return Math.max(1, Math.round(deltaKg / 0.5));
}

function buildFitnessPlan(profile) {
  const bmi = calcBMI(profile.weightKg, profile.heightCm);
  const cat = bmiCategory(bmi);
  if (!bmi || !cat) return null;

  const weeks = weeksToNormalRange(profile);
  const range = healthyWeightRange(profile.heightCm);
  const steps = [];

  if (cat.key === 'normal') {
    steps.push('Your BMI is already in the normal range — the focus now is holding steady, not losing or gaining.');
    steps.push('Keep logging meals a few times a week so you notice drift early.');
    steps.push('Aim for 150 minutes of moderate activity (e.g. brisk walking, cycling) across the week, plus two strength sessions.');
    steps.push('Re-weigh yourself weekly, same time of day, to catch trends rather than daily noise.');
  } else if (cat.key === 'under') {
    steps.push(`A gentle surplus of roughly 300–400 kcal/day above maintenance, spread across 3 meals + 2 snacks, should add weight at a safe ~0.5 kg/week.`);
    steps.push('Prioritise protein (aim ~1.6 g per kg body weight) and calorie-dense whole foods — nuts, avocado, dairy, oats, olive oil.');
    steps.push('Add 2–3 resistance-training sessions a week so the extra calories build muscle, not just fat.');
    steps.push(`At this pace, reaching ${range.min.toFixed(1)} kg (bottom of the normal range) would take roughly ${weeks} week${weeks === 1 ? '' : 's'}.`);
  } else {
    steps.push(`A moderate deficit of roughly 15–20% below maintenance supports a safe ~0.5 kg/week loss without excessive hunger or muscle loss.`);
    steps.push('Fill half your plate with vegetables, keep protein high (~1.6 g/kg) to protect muscle, and go easy on liquid calories and fried food.');
    steps.push('Combine 150–200 minutes/week of brisk cardio (walking, cycling, swimming) with 2–3 strength sessions.');
    steps.push(`At this pace, reaching ${range.max.toFixed(1)} kg (top of the normal range) would take roughly ${weeks} week${weeks === 1 ? '' : 's'}.`);
  }

  steps.push('This is general guidance, not medical advice — check with a doctor before starting a new eating or exercise plan, especially with any existing health condition.');

  return { category: cat, weeks, range, steps };
}

function dailyRecommendations({ profile, todayCalories, calorieGoal }) {
  const tips = [];
  const remaining = calorieGoal != null ? calorieGoal - todayCalories : null;

  if (calorieGoal == null) {
    tips.push('Fill in your profile (age, height, weight) to unlock a personalised calorie target.');
    return tips;
  }
  if (remaining < -300) {
    tips.push(`You're ${Math.abs(Math.round(remaining))} kcal over today's target — a lighter dinner or a walk can help balance the day, not undo it.`);
  } else if (remaining > 600) {
    tips.push(`You've got ${Math.round(remaining)} kcal of headroom left today — make sure you're eating enough, especially protein.`);
  } else if (remaining >= 0) {
    tips.push(`On track — ${Math.round(remaining)} kcal left for the rest of today.`);
  } else {
    tips.push(`Right at target for today. Nice and steady.`);
  }

  const bmi = calcBMI(profile.weightKg, profile.heightCm);
  const cat = bmiCategory(bmi);
  if (cat && cat.key !== 'normal') {
    tips.push(`Your BMI is currently in the "${cat.label.toLowerCase()}" band — see the Fitness tab for a plan to bring it toward normal.`);
  }
  tips.push('Water, sleep, and consistent meal timing all matter as much as the calorie count.');
  return tips;
}
