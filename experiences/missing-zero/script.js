// Holding the 0 key puts the missing zero back. Letting go takes it away again.
const heading = document.querySelector('h1');
const setFound = (found) => heading.classList.toggle('found', found);

addEventListener('keydown', (event) => {
  if (event.key === '0' && !event.ctrlKey && !event.metaKey && !event.altKey) setFound(true);
});
addEventListener('keyup', (event) => {
  if (event.key === '0') setFound(false);
});
// The key-up never arrives if focus leaves while 0 is held.
addEventListener('blur', () => setFound(false));
