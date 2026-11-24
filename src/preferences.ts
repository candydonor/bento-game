type Preferences = {
  sound: boolean;
  tutorialSeen: boolean;
  tutorialSkipped: boolean;
  completed: number[];
};

const storageKey = 'bento-orders.preferences.v1';

export function readPreferences(levelIds: readonly number[]): Preferences {
  const defaults: Preferences = { sound: true, tutorialSeen: false, tutorialSkipped: false, completed: [] };
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
    if (!saved || typeof saved !== 'object') return defaults;
    return {
      sound: typeof saved.sound === 'boolean' ? saved.sound : defaults.sound,
      tutorialSeen: saved.tutorialSeen === true,
      tutorialSkipped: saved.tutorialSkipped === true,
      completed: Array.isArray(saved.completed)
        ? [...new Set<number>(saved.completed.filter((id: unknown) => typeof id === 'number' && levelIds.includes(id)))]
        : [],
    };
  } catch {
    return defaults;
  }
}

export function savePreferences(preferences: Preferences) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(preferences));
  } catch {
    // Keep this session usable when browser storage is restricted.
  }
}
