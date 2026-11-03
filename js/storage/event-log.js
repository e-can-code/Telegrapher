const KEY = 'morse-composer-v03-events';
const PROFILE = 'morse-composer-v03-profile';
const HISTORY = 'morse-composer-v03-history';
const MAX_SESSIONS = 30;
const MAX_EVENTS = 1500;
function read(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
function write(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }
export function loadSessions() { return read(KEY, []); }
export function saveSession(session) {
  const sessions = loadSessions().filter(s => s.id !== session.id);
  if (session.events.length) sessions.push({...session, events: session.events.slice(-MAX_EVENTS)});
  write(KEY, sessions.slice(-MAX_SESSIONS));
}
export function loadProfile() { return read(PROFILE, null); }
export function saveProfile(profile) { write(PROFILE, profile); }
export function loadHistory() { return read(HISTORY, []); }
export function archiveMessage(chars) {
  if (!chars.length) return;
  write(HISTORY, [{date: new Date().toISOString(), chars}, ...loadHistory()].slice(0, 40));
}
export function clearLearningData() { try { localStorage.removeItem(KEY); localStorage.removeItem(PROFILE); } catch {} }
