export async function apiRequest(path, options = {}) {
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const headers = {
    ...(options.body && !isFormData ? { 'Content-Type': 'application/json' } : {}),
    ...options.headers,
  };
  if (path.includes('/likes')) headers['X-GV-Visitor-Id'] = getVisitorId();
  let response;
  try {
    response = await fetch(path, {
      ...options,
      credentials: 'same-origin',
      headers,
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new Error('Unable to reach the school service. Check your connection and try again.');
  }
  if (response.status === 204) return null;
  const contentType = response.headers?.get?.('content-type') || '';
  let result = {};
  if (contentType.toLowerCase().includes('application/json')) {
    try {
      result = await response.json();
    } catch {
      if (response.ok) throw new Error('The school service returned an invalid response. Please try again.');
    }
  } else if (response.ok) {
    throw new Error('The school service returned an invalid response. Please try again.');
  }
  if (!response.ok) {
    if (typeof result?.error === 'string' && result.error.trim()) throw new Error(result.error);
    if (response.status === 404) {
      throw new Error('The school service endpoint is unavailable. Please contact the site administrator.');
    }
    if (response.status >= 500) {
      throw new Error('The school service is temporarily unavailable. Please try again shortly.');
    }
    throw new Error(`The request was rejected (HTTP ${response.status}). Please check the information and try again.`);
  }
  return result;
}

function getVisitorId() {
  try {
    let visitorId = localStorage.getItem('gv-visitor-id');
    if (!visitorId) {
      visitorId = crypto.randomUUID();
      localStorage.setItem('gv-visitor-id', visitorId);
    }
    return visitorId;
  } catch {
    return crypto.randomUUID();
  }
}

export function mediaUrl(media) {
  if (media?.url) return media.url;
  if (!media?.filename) return '';
  return /^https?:\/\//i.test(media.filename) ? media.filename : `/uploads/${media.filename}`;
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
