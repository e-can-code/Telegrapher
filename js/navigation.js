// Workspace navigation is independent of audio initialization.
// Both workspaces remain mounted so switching preserves their state.
export function initNavigation() {
  const compose = document.getElementById('composeView');
  const listen = document.getElementById('listenView');
  const buttons = [...document.querySelectorAll('[data-workspace]')];
  if (!compose || !listen || buttons.length === 0) {
    throw new Error('Workspace navigation elements are missing.');
  }

  function show(name) {
    if (name !== 'compose' && name !== 'listen') return;
    compose.hidden = name !== 'compose';
    listen.hidden = name !== 'listen';
    for (const button of buttons) {
      const active = button.dataset.workspace === name;
      button.setAttribute('aria-selected', String(active));
      button.classList.toggle('active', active);
    }
    document.dispatchEvent(new CustomEvent('morse:workspace', {detail: {name}}));
  }

  for (const button of buttons) {
    button.addEventListener('click', () => show(button.dataset.workspace));
  }
  show('compose');
}
