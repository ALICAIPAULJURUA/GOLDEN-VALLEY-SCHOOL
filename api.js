export async function apiRequest(path, options = {}) {
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const headers = {
    ...(options.body && !isFormData ? { 'Content-Type': 'application/json' } : {}),
    ...options.headers,
  };
  const response = await fetch(path, {
    ...options,
    credentials: 'same-origin',
    headers,
  });
  if (response.status === 204) return null;
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.error || 'The request could not be completed. Please try again.');
  }
  return result;
}

export function whatsappUrl(message = '', phoneNumber = '') {
  const configuredNumber = phoneNumber || import.meta.env.VITE_WHATSAPP_NUMBER || '256777627421';
  const number = configuredNumber.replace(/\D/g, '');
  return `https://wa.me/${number}${message ? `?text=${encodeURIComponent(message)}` : ''}`;
}

export function formatDate(value, options = { day: 'numeric', month: 'short', year: 'numeric' }) {
  if (!value) return '';
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.valueOf())
    ? value
    : new Intl.DateTimeFormat('en-UG', options).format(date);
}

export function schoolGreeting(date = new Date()) {
  const hour = Number(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Kampala',
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(date));

  if (hour < 5 || hour >= 17) return 'Good evening';
  if (hour < 12) return 'Good morning';
  return 'Good afternoon';
}
