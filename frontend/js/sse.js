function connectSSE(taskId, handlers) {
    const es = new EventSource(`/api/tasks/${taskId}/stream`);
    es.addEventListener('status', e => handlers.onStatus(JSON.parse(e.data)));
    es.addEventListener('log', e => handlers.onLog(JSON.parse(e.data)));
    es.addEventListener('complete', e => {
        handlers.onComplete(JSON.parse(e.data));
        es.close();
    });
    es.addEventListener('error', e => {
        try {
            handlers.onError(JSON.parse(e.data));
        } catch (_) {
            handlers.onError({ error: '连接异常' });
        }
        es.close();
    });
    es.onerror = () => {};
    return es;
}
