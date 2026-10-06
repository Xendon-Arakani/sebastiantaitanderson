(() => {
  const button = document.querySelector('#copy-email');
  const label = button.querySelector('span');
  const address = button.dataset.email;
  let feedbackTimeout;

  button.addEventListener('click', async () => {
    clearTimeout(feedbackTimeout);
    try {
      await navigator.clipboard.writeText(address);
      label.textContent = 'Copied';
    } catch {
      label.textContent = 'Copy failed — ' + address;
    }
    feedbackTimeout = setTimeout(() => {
      label.textContent = address + ' ⧉';
    }, 2500);
  });
})();
