export const DAILY_MISSION_TARGET = 3;
export const DAILY_MISSION_COIN_REWARD = 120;

export function calculateStoryCoinPrice(story) {
  const unlockPrice = Number(story?.unlockPrice || 0);
  if (!story?.licensed || unlockPrice <= 0) {
    return 0;
  }

  return Math.max(100, Math.ceil(unlockPrice / 10));
}

export function getMissionProgressLabel(mission) {
  if (!mission) {
    return `0/${DAILY_MISSION_TARGET}`;
  }

  return `${mission.progressCount || 0}/${mission.target || DAILY_MISSION_TARGET}`;
}
