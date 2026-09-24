const BASE_URL = process.env.NEXT_PUBLIC_CONTROL_PLANE_URL;

async function apiFetch(path, options) {
  const res = await fetch(`${BASE_URL}${path}`, options);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `${path} returned ${res.status}`);
  }
  return res.json();
}

export function getServices() {
  return apiFetch('/services');
}

export function getIncidents(limit = 20) {
  return apiFetch(`/incidents?limit=${limit}`);
}

export function getIncident(id) {
  return apiFetch(`/incidents/${encodeURIComponent(id)}`);
}

export function breakIt(service, faultType) {
  return apiFetch('/break-it', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ service, faultType }),
  });
}

export function breakItScenario(scenario) {
  return apiFetch('/break-it', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scenario }),
  });
}
