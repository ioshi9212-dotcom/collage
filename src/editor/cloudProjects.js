export async function saveCloudProject(project) {
  const response = await fetch('/api/projects', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: project.title || 'Альбом без названия',
      data: project,
    }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload?.message || payload?.error || 'Cloud save failed');
  }

  return payload?.project || payload;
}
