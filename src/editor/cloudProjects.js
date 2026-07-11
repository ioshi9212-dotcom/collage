const API_PREFIX = '/api';

async function request(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }

  if (!response.ok) {
    const error = new Error(payload.error || `Request failed: ${response.status}`);
    error.status = response.status;
    throw error;
  }

  return payload;
}

export function saveCloudProject({ title, data, id = null }) {
  if (id) {
    return request(`${API_PREFIX}/projects/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ title, data }),
    });
  }

  return request(`${API_PREFIX}/projects`, {
    method: 'POST',
    body: JSON.stringify({ title, data }),
  });
}

export function getCloudProjects() {
  return request(`${API_PREFIX}/projects`);
}

export function loadCloudProject(id) {
  return request(`${API_PREFIX}/projects/${id}`);
}

export function deleteCloudProject(id) {
  return request(`${API_PREFIX}/projects/${id}`, {
    method: 'DELETE',
  });
}
