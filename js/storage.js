// localStorage wrapper. Stores Schedule + Settings.
const Storage = (() => {
  const SCHEDULE_KEY = 'cs.schedule.v1';
  const SETTINGS_KEY = 'cs.settings.v1';
  const DEFAULT_SETTINGS = {
    notifEnabled: false,
    notifMinutesBefore: 30,
    weekOneOverride: null, // ISO date string if user manually corrected
  };

  return {
    loadSchedule() {
      try {
        const raw = localStorage.getItem(SCHEDULE_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch (e) {
        console.error('loadSchedule failed', e);
        return null;
      }
    },
    saveSchedule(schedule) {
      localStorage.setItem(SCHEDULE_KEY, JSON.stringify(schedule));
    },
    clearSchedule() {
      localStorage.removeItem(SCHEDULE_KEY);
    },
    loadSettings() {
      try {
        const raw = localStorage.getItem(SETTINGS_KEY);
        return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
      } catch (e) {
        return { ...DEFAULT_SETTINGS };
      }
    },
    saveSettings(settings) {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    },
    clearAll() {
      localStorage.removeItem(SCHEDULE_KEY);
      localStorage.removeItem(SETTINGS_KEY);
    }
  };
})();
