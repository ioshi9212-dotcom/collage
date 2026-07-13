from pathlib import Path

path = Path('server.js')
text = path.read_text(encoding='utf-8')


def replace_once(old, new, label):
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, found {count}')
    text = text.replace(old, new, 1)


replace_once(
    "import pg from 'pg';\n",
    "import pg from 'pg';\nimport {\n  ProjectNotFoundError,\n  ProjectQuotaError,\n  createProjectWithQuota,\n  getProjectQuotaLimits,\n  updateProjectWithQuota,\n} from './server/projectQuotas.js';\n",
    'quota import',
)

replace_once(
    "const jsonLimitBytes = Number(process.env.JSON_LIMIT_BYTES || 60 * 1024 * 1024);\n",
    "const jsonLimitBytes = Number(process.env.JSON_LIMIT_BYTES || 60 * 1024 * 1024);\nconst projectQuotaLimits = getProjectQuotaLimits({\n  MAX_PROJECTS_PER_USER: process.env.MAX_PROJECTS_PER_USER,\n  MAX_USER_STORAGE_BYTES: process.env.MAX_USER_STORAGE_BYTES,\n});\n",
    'quota config',
)

replace_once(
    "        data_json JSONB NOT NULL,\n        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),",
    "        data_json JSONB NOT NULL,\n        data_bytes BIGINT NOT NULL DEFAULT 0,\n        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),",
    'new table data_bytes',
)

replace_once(
    "      CREATE INDEX IF NOT EXISTS projects_user_updated_idx ON projects(user_id, updated_at DESC);",
    "      ALTER TABLE projects ADD COLUMN IF NOT EXISTS data_bytes BIGINT NOT NULL DEFAULT 0;\n      UPDATE projects SET data_bytes = OCTET_LENGTH(data_json::text) WHERE data_bytes = 0;\n\n      CREATE INDEX IF NOT EXISTS projects_user_updated_idx ON projects(user_id, updated_at DESC);",
    'quota migration',
)

replace_once(
    "async function requireUser(request, response) {\n  const user = readToken(request);\n  if (!user) {\n    sendJson(response, 401, { error: 'not_authenticated' });\n    return null;\n  }\n  return user;\n}\n",
    "async function requireUser(request, response) {\n  const user = readToken(request);\n  if (!user) {\n    sendJson(response, 401, { error: 'not_authenticated' });\n    return null;\n  }\n  return user;\n}\n\nfunction sendProjectMutationError(response, error) {\n  if (error instanceof ProjectQuotaError || error instanceof ProjectNotFoundError) {\n    sendJson(response, error.status, {\n      error: error.code,\n      message: error.message,\n      ...(error.details ? { quota: error.details } : {}),\n    });\n    return true;\n  }\n  return false;\n}\n",
    'quota error response',
)

replace_once(
    "  if (method === 'POST' && path === '/api/projects') {\n    const user = await requireUser(request, response);\n    if (!user) return true;\n    const body = await readBody(request);\n    const id = randomUUID();\n    const title = String(body.title || 'Без названия').trim().slice(0, 120) || 'Без названия';\n    const data = body.data || {};\n    const result = await pool.query(\n      'INSERT INTO projects(id, user_id, title, data_json) VALUES ($1, $2, $3, $4) RETURNING id, title, created_at, updated_at',\n      [id, user.id, title, JSON.stringify(data)]\n    );\n    sendJson(response, 200, { project: result.rows[0] });\n    return true;\n  }",
    "  if (method === 'POST' && path === '/api/projects') {\n    const user = await requireUser(request, response);\n    if (!user) return true;\n    const body = await readBody(request);\n    const id = randomUUID();\n    const title = String(body.title || 'Без названия').trim().slice(0, 120) || 'Без названия';\n    const data = body.data || {};\n\n    try {\n      const result = await createProjectWithQuota({\n        pool,\n        userId: user.id,\n        id,\n        title,\n        data,\n        limits: projectQuotaLimits,\n      });\n      sendJson(response, 200, result);\n    } catch (error) {\n      if (!sendProjectMutationError(response, error)) throw error;\n    }\n    return true;\n  }",
    'project create route',
)

replace_once(
    "    if (method === 'PUT') {\n      const body = await readBody(request);\n      const title = String(body.title || 'Без названия').trim().slice(0, 120) || 'Без названия';\n      const data = body.data || {};\n      const result = await pool.query(\n        'UPDATE projects SET title = $1, data_json = $2, updated_at = NOW() WHERE id = $3 AND user_id = $4 RETURNING id, title, created_at, updated_at',\n        [title, JSON.stringify(data), projectId, user.id]\n      );\n      if (!result.rows[0]) return sendJson(response, 404, { error: 'project_not_found' });\n      sendJson(response, 200, { project: result.rows[0] });\n      return true;\n    }",
    "    if (method === 'PUT') {\n      const body = await readBody(request);\n      const title = String(body.title || 'Без названия').trim().slice(0, 120) || 'Без названия';\n      const data = body.data || {};\n\n      try {\n        const result = await updateProjectWithQuota({\n          pool,\n          userId: user.id,\n          projectId,\n          title,\n          data,\n          limits: projectQuotaLimits,\n        });\n        sendJson(response, 200, result);\n      } catch (error) {\n        if (!sendProjectMutationError(response, error)) throw error;\n      }\n      return true;\n    }",
    'project update route',
)

path.write_text(text, encoding='utf-8')

test_path = Path('server/projectQuotas.test.mjs')
test_text = test_path.read_text(encoding='utf-8')
old_test = "const replacementData = { payload: 'x'.repeat(35) };"
new_test = "const replacementData = { payload: 'x'.repeat(100) };"
if test_text.count(old_test) != 1:
    raise SystemExit('quota growth test: expected exactly one old scenario')
test_path.write_text(test_text.replace(old_test, new_test, 1), encoding='utf-8')
