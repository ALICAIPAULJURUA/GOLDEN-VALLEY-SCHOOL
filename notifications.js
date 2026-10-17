export function showToast(message, type = 'success') {
  if (!message) return;
  window.dispatchEvent(new CustomEvent('gv-toast', {
    detail: { message, type: type === 'error' ? 'error' : 'success' },
  }));
}
