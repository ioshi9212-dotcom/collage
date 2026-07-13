from pathlib import Path

path = Path('public/cloud-auth.js')
source = path.read_text(encoding='utf-8')

old_start = """  async function saveCloud() {
    if (!state.user) return setStatus('Сначала войди в аккаунт');
"""
new_start = """  async function saveCloud(options = {}) {
    if (state.busy) return;
    const forceCreate = options?.forceCreate === true;
    if (!state.user) return setStatus('Сначала войди в аккаунт');
"""
if source.count(old_start) != 1:
    raise SystemExit('saveCloud start anchor not found exactly once')
source = source.replace(old_start, new_start, 1)

old_target = """      const existingId = localStorage.getItem(CURRENT_PROJECT_ID_KEY);
      const url = existingId ? `/api/projects/${existingId}` : '/api/projects';
      const method = existingId ? 'PUT' : 'POST';
"""
new_target = """      const existingId = forceCreate ? '' : localStorage.getItem(CURRENT_PROJECT_ID_KEY);
      const url = existingId ? `/api/projects/${existingId}` : '/api/projects';
      const method = existingId ? 'PUT' : 'POST';
"""
if source.count(old_target) != 1:
    raise SystemExit('save target anchor not found exactly once')
source = source.replace(old_target, new_target, 1)

old_as_new = """  async function saveAsNew() {
    localStorage.removeItem(CURRENT_PROJECT_ID_KEY);
    await saveCloud();
  }
"""
new_as_new = """  async function saveAsNew() {
    await saveCloud({ forceCreate: true });
  }
"""
if source.count(old_as_new) != 1:
    raise SystemExit('saveAsNew anchor not found exactly once')
source = source.replace(old_as_new, new_as_new, 1)

path.write_text(source, encoding='utf-8')
