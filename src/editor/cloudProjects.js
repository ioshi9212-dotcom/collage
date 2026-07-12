
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

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || 'Cloud save failed');
  }

  return response.json();
}
