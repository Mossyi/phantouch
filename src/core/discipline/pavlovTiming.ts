export const PAVLOV_FEEDBACK_DURATION_MS = 2_000;
export const PAVLOV_EMS_COOLDOWN_MS = 2_500;
export const PAVLOV_REWARD_COOLDOWN_MS = 2_500;
export const PAVLOV_IMPRINT_CUE_LEAD_MS = 1_000;
export const PAVLOV_IMPRINT_TRIAL_INTERVAL_MS = 4_000;
export const PAVLOV_IMPRINT_TARGET = 100;

export type PavlovImprintTrial = 'reward' | 'punish';

export const createBalancedPavlovImprintTrials = (
  count: number,
  random: () => number = Math.random,
): PavlovImprintTrial[] => {
  const safeCount = Number.isFinite(count) ? Math.max(0, Math.min(1_000, Math.floor(count))) : 0;
  let rewardsLeft = Math.ceil(safeCount / 2);
  let punishmentsLeft = Math.floor(safeCount / 2);
  let previous: PavlovImprintTrial | null = null;
  let streak = 0;
  const trials: PavlovImprintTrial[] = [];

  while (rewardsLeft + punishmentsLeft > 0) {
    const isFeasibleRemainder = (rewards: number, punishments: number) => (
      rewards <= (punishments + 1) * 3 && punishments <= (rewards + 1) * 3
    );
    const candidates = (['reward', 'punish'] as const).filter(candidate => {
      if (candidate === 'reward' && rewardsLeft === 0) return false;
      if (candidate === 'punish' && punishmentsLeft === 0) return false;
      if (candidate === previous && streak >= 3) return false;
      const nextRewards = rewardsLeft - (candidate === 'reward' ? 1 : 0);
      const nextPunishments = punishmentsLeft - (candidate === 'punish' ? 1 : 0);
      return isFeasibleRemainder(nextRewards, nextPunishments);
    });

    let next: PavlovImprintTrial;
    if (candidates.length === 1) next = candidates[0];
    else if (candidates.length === 2) {
      const roll = random();
      const normalizedRoll = Number.isFinite(roll) ? Math.max(0, Math.min(1, roll)) : 0.5;
      next = normalizedRoll < rewardsLeft / (rewardsLeft + punishmentsLeft) ? 'reward' : 'punish';
    } else break;

    trials.push(next);
    if (next === 'reward') rewardsLeft -= 1;
    else punishmentsLeft -= 1;
    if (next === previous) streak += 1;
    else {
      previous = next;
      streak = 1;
    }
  }
  return trials;
};

export const canStartPavlovFeedback = (
  lastStartedAt: number,
  now: number,
  cooldownMs: number,
): boolean => (
  Number.isFinite(now)
  && Number.isFinite(lastStartedAt)
  && Number.isFinite(cooldownMs)
  && cooldownMs >= 0
  && (lastStartedAt <= 0 || now - lastStartedAt >= cooldownMs)
);
