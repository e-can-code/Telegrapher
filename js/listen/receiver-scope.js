// The receiver owns exactly one selection and one loop preference. The HTMLAudioElement
// remains the only playback clock; this class has no timers or media dependencies.
export class ReceiverScope {
  constructor() { this.reset([], 0); }
  reset(words, duration) {
    this.words = words.map((word, index) => ({ ...word, index }));
    this.duration = Math.max(0, Number(duration) || 0);
    this.view = this.words.length === 1 ? 'focus' : 'overview';
    this.selected = this.words.length === 1 ? 0 : -1;
    this.group = -1;
    this.queued = 0;
    this.loop = false;
    this.groups = [];
  }
  setGroups(groups) { this.groups = groups; }
  interval() { return this.selected >= 0 && this.view === 'focus'
    ? this.words[this.selected]
    : { start: 0, end: this.duration }; }
  focus(index) {
    if (!Number.isInteger(index) || index < 0 || index >= this.words.length) return null;
    this.selected = index;
    this.queued = index;
    this.view = 'focus';
    return this.words[index].start;
  }
  enterGroup(index) {
    if (!this.groups[index]) return null;
    this.group = index;
    this.selected = -1;
    this.view = 'group';
    return this.groups[index].start;
  }
  back() {
    if (this.words.length <= 1) return null;
    if (this.view === 'focus') {
      const last = this.selected;
      this.queued = Math.min(this.words.length - 1, last + 1);
      this.selected = -1;
      if (this.groups.length > 1) {
        const parent = this.groups.findIndex(group => last >= group.first && last < group.last);
        this.group = Math.max(0, parent);
        this.view = 'group';
      } else { this.group = -1; this.view = 'overview'; }
      return this.words[last + 1]?.start ?? this.duration;
    }
    if (this.view === 'group') {
      this.view = 'overview';
      this.group = -1;
      return this.words[this.queued]?.start ?? this.duration;
    }
    return null;
  }
  overview() { this.view = this.words.length === 1 ? 'focus' : 'overview'; this.selected = this.words.length === 1 ? 0 : -1; this.group = -1; }
  neighbor(direction) {
    if (!this.words.length) return null;
    const from = this.view === 'focus' ? this.selected : this.queued;
    const next = Math.max(0, Math.min(this.words.length - 1, from + direction));
    if (this.view === 'focus') this.focus(next);
    else this.queued = next;
    return this.words[next].start;
  }
  setLoop(enabled) { this.loop = Boolean(enabled); return this.loop; }
  wordAt(time) {
    // In the inter-word silence the visual indicator rests, not guesses a word.
    let low = 0, high = this.words.length - 1;
    while (low <= high) {
      const mid = (low + high) >> 1, w = this.words[mid];
      if (time < w.start) high = mid - 1;
      else if (time >= w.end) low = mid + 1;
      else return mid;
    }
    return -1;
  }
}
