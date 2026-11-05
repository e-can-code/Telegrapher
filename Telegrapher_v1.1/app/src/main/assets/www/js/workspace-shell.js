// Navigation is independent of the Compose and Listen modules.
(function () {
  const views = {compose: document.getElementById('composeView'), listen: document.getElementById('listenView')};
  const tabs = [...document.querySelectorAll('[data-workspace]')];
  function open(name) {
    if (!views[name]) return;
    for (const [id, view] of Object.entries(views)) {
      view.hidden = id !== name;
      view.setAttribute('aria-hidden', String(id !== name));
    }
    for (const tab of tabs) {
      const active = tab.dataset.workspace === name;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    }
    document.dispatchEvent(new CustomEvent('morse:workspace', {detail: {name}}));
  }
  for (const tab of tabs) tab.addEventListener('click', () => open(tab.dataset.workspace));
  window.MorseWorkspace = Object.freeze({open});
  open('compose');
})();
