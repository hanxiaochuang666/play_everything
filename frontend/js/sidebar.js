function initSidebar() {
  document.getElementById('btn-new-task').addEventListener('click', function() {
    document.getElementById('chat-input').focus();
  });
}

var statusDots = {
  pending: '#ffc107',
  planning: '#2196f3',
  executing: '#ff9800',
  completed: '#4caf50',
  failed: '#f44336',
  cancelled: '#9e9e9e'
};

var statusLabels = {
  pending: '等待',
  planning: '规划',
  executing: '执行中',
  completed: '完成',
  failed: '失败',
  cancelled: '取消'
};

function renderTaskList(tasks) {
  var el = document.getElementById('task-list');
  if (!tasks || !tasks.length) {
    el.innerHTML = '<div style="padding:8px;color:#999;font-size:11px;text-align:center">暂无任务</div>';
    return;
  }

  el.innerHTML = tasks.map(function(t) {
    var active = State.currentTaskId === t.id ? ' active' : '';
    var dot = statusDots[t.status] || '#999';
    var title = escHtml(t.instruction || t.title || '未命名').slice(0, 30);
    var time = t.created_at ? new Date(t.created_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '';
    return '<div class="task-strip-item' + active + '" data-id="' + t.id + '">' +
      '<span><span class="task-status-dot" style="background:' + dot + '"></span>' +
      '<span class="task-title">' + title + '</span></span>' +
      '<span class="task-time">' + time + '</span>' +
      '</div>';
  }).join('');

  el.querySelectorAll('.task-strip-item').forEach(function(item) {
    item.addEventListener('click', function() {
      var id = this.getAttribute('data-id');
      State.setCurrentTask(id);
      renderTaskList(State.tasks);
      loadTaskToChat(id);
    });
  });
}

async function loadTaskToChat(taskId) {
  try {
    var task = await API.getTask(taskId);
    if (!task) return;

    var chatMessages = document.getElementById('chat-messages');
    chatMessages.innerHTML = '';
    addMessage('user', task.instruction);

    if (task.logs && task.logs.length) {
      task.logs.forEach(function(log) {
        if (log.type === 'tool_call') {
          addMessage('tool', formatToolCall(log.content));
        } else if (log.type === 'tool_result') {
          addMessage('tool_result', formatToolResult(log.content));
        }
      });
    }

    if (task.status === 'completed' && task.result_summary) {
      addMessage('agent', task.result_summary);
    } else if (task.status === 'failed' && task.error_message) {
      addMessage('error', task.error_message);
    } else if (task.status === 'executing' || task.status === 'planning') {
      if (task.status === 'executing') {
        addMessage('status', '任务执行中...');
      }
      subscribeToTask(taskId);
    }

    if (task.artifacts && task.artifacts.length) {
      showArtifacts(task.artifacts);
    }
  } catch (err) {
    console.error('[DEBUG] loadTaskToChat error:', err);
  }
}
