async function api(method, path, body) {
    const opts = {
        method,
        headers: { 'Content-Type': 'application/json' },
    };
    if (body) opts.body = JSON.stringify(body);
    const resp = await fetch(path, opts);
    if (!resp.ok) {
        const err = await resp.json().catch(() => ({ detail: resp.statusText }));
        throw new Error(err.detail || resp.statusText);
    }
    return resp.json();
}

const API = {
    createTask(instruction) {
        return api('POST', '/api/tasks', { instruction });
    },
    listTasks() {
        return api('GET', '/api/tasks');
    },
    getTask(id) {
        return api('GET', `/api/tasks/${id}`);
    },
    cancelTask(id) {
        return api('POST', `/api/tasks/${id}/cancel`);
    },
    getArtifacts(id) {
        return api('GET', `/api/tasks/${id}/artifacts`);
    },
    downloadUrl(artifactId) {
        return `/api/artifacts/${artifactId}/download`;
    },
};
