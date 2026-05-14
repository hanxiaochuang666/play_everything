function connectSSE(taskId, handlers) {
  var es = new EventSource('/api/tasks/' + taskId + '/stream');
  console.log('[DEBUG] SSE connected for task:', taskId);

  es.addEventListener('status', function(e) {
    var data = JSON.parse(e.data);
    console.log('[SSE] status:', data);
    if (handlers.onStatus) handlers.onStatus(data);
  });

  es.addEventListener('log', function(e) {
    var data = JSON.parse(e.data);
    console.log('[SSE] log:', data.type, data.content && data.content.tool);
    if (handlers.onLog) handlers.onLog(data);
  });

  es.addEventListener('complete', function(e) {
    var data = JSON.parse(e.data);
    console.log('[SSE] complete:', data);
    es.close();
    if (handlers.onComplete) handlers.onComplete(data);
  });

  es.addEventListener('error_event', function(e) {
    var data = JSON.parse(e.data);
    console.log('[SSE] error:', data);
    es.close();
    if (handlers.onError) handlers.onError(data);
  });

  es.onerror = function(e) {
    console.error('[SSE] connection error:', e);
    if (handlers.onError) handlers.onError({ error: 'SSE连接断开' });
  };

  return es;
}

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
