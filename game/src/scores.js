// scores.js — best score kept in local storage, per mission.
const KEY = 'skyline-archipelago-best';

export function loadBestScores() {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}');
  } catch {
    return {};
  }
}

export function loadBest(missionId) {
  return loadBestScores()[missionId] ?? 0;
}

export function saveBest(missionId, score) {
  const all = loadBestScores();
  const best = Math.max(all[missionId] ?? 0, score);
  all[missionId] = best;
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* storage unavailable */ }
  return best;
}

export function loadOverallBest() {
  const all = loadBestScores();
  return Math.max(0, ...Object.values(all));
}
