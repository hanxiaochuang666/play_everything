function connectSSE(taskId, handlers) {
    const url = `/api/tasks/${taskId}/stream`;
    console.log('[SSE] 连接中:', url);
    const es = new EventSource(url);

    es.addEventListener('open', () => {
        console.log('[SSE] 已连接:', taskId.slice(0, 8));
    });

    es.addEventListener('status', e => {
        console.log('[SSE] status:', e.data.slice(0, 80));
        handlers.onStatus(JSON.parse(e.data));
    });

    es.addEventListener('log', e => {
        console.log('[SSE] log:', e.data.slice(0, 80));
        handlers.onLog(JSON.parse(e.data));
    });

    es.addEventListener('complete', e => {
        console.log('[SSE] complete:', e.data.slice(0, 80));
        handlers.onComplete(JSON.parse(e.data));
        es.close();
    });

    es.addEventListener('error', e => {
        if (e.data) {
            try {
                handlers.onError(JSON.parse(e.data));
            } catch (_) {
                handlers.onError({ error: 'SSE 解析失败' });
            }
        }
        console.log('[SSE] 连接关闭:', taskId.slice(0, 8));
        es.close();
    });

    return es;
}
