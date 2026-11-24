// Applies the saved theme and accent before first paint to avoid a flash.
(function () {
  try {
    var t = localStorage.getItem('foundy:theme') || 'system';
    var dark = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (dark) document.documentElement.classList.add('dark');
    var a = localStorage.getItem('foundy:accent');
    if (a) document.documentElement.dataset.accent = a;
    if (localStorage.getItem('foundy:motion') === 'reduced') document.documentElement.dataset.motion = 'reduced';
  } catch (e) {}
})();
