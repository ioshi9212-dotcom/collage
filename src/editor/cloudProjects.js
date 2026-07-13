const CURRENT_PROJECT_ID_KEY = 'collage-cloud-current-project-id';
const CURRENT_PROJECT_TITLE_KEY = 'collage-cloud-current-project-title';

function resolveProjectTitle(project) {
  const editorTitle = document.querySelector('.cloud-project-title')?.value;
  const storedTitle = localStorage.getItem(CURRENT_PROJECT_TITLE_KEY);
  return String(editorTitle || storedTitle || project?.title || 'Альбом без названия')
    .trim()
    .slice(0, 120) || 'Альбом без названия';
}

async function requestCloudSave(url, method, project, title) {
  const response = await fetch(url, {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, data: project }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(payload?.message || payload?.error || 'Cloud save failed');
    error.status = response.status;
    throw error;
  }

  return payload?.project || payload;
}

function rememberCloudProject(project, fallbackTitle) {
  if (!project?.id) return;
  localStorage.setItem(CURRENT_PROJECT_ID_KEY, project.id);
  localStorage.setItem(CURRENT_PROJECT_TITLE_KEY, project.title || fallbackTitle);
}

export async function saveCloudProject(project) {
  const title = resolveProjectTitle(project);
  const existingId = localStorage.getItem(CURRENT_PROJECT_ID_KEY);

  if (existingId) {
    try {
      const updated = await requestCloudSave(
        `/api/projects/${encodeURIComponent(existingId)}`,
        'PUT',
        project,
        title,
      );
      rememberCloudProject(updated, title);
      return updated;
    } catch (error) {
      if (error?.status !== 404) throw error;
      localStorage.removeItem(CURRENT_PROJECT_ID_KEY);
      localStorage.removeItem(CURRENT_PROJECT_TITLE_KEY);
    }
  }

  const created = await requestCloudSave('/api/projects', 'POST', project, title);
  rememberCloudProject(created, title);
  return created;
}
