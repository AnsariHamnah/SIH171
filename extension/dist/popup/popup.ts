console.log('[SIH-26171] Popup loaded');

const statusEl = document.getElementById('status');
const testBtn = document.getElementById('testBtn');

testBtn?.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'PING' }, (response) => {
    if (statusEl) {
      statusEl.textContent = response?.received ? 'Background connected' : 'No response';
      statusEl.className = 'status ok';
    }
  });
});