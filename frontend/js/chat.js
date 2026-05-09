let currentSSE = null;
const chatMessages = document.getElementById('chat-messages');

function initChat() {
  document.getElementById('chat-form').addEventListener('submit', async e => {
    e.preventDefault();
    const input = document.getElementById('chat-input');
    const instruction = input.value.trim();
    if (!instruction) return;
    input.value = '';
    await sendTask(instruction);
  });

  document.getElementById('chat-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      document.getElementById('chat-form').dispatchEvent(new Event('submit'));
    }
  });
}

async function sendTask(instruction) {
  try {
    const task = await API.createTask(instruction);
    State.addTask(task);
    State.setCurrentTask(task.id);
    renderTaskList(State.tasks);
    clearChat();
    addMessage('user', instruction);
    subscribeToTask(task.id);
  } catch (err) {
    addMessage('error', `创建任务失败: ${err.message}`);
  }
}

async function loadTaskToChat(taskId) {
  if (currentSSE) { currentSSE.close(); currentSSE = null; }
  clearChat();
  const task = State.getTask(taskId);
  if (!task) return;
  addMessage('user', task.instruction);
  try {
    const detail = await API.getTask(taskId);
    if (detail.status === 'completed') {
      addMessage('agent', detail.result_summary || '任务已完成');
      if (taskId === State.currentTaskId) {
        await loadArtifacts(taskId);
      }
    } else if (detail.status === 'failed') {
      addMessage('error', detail.error_message || '任务执行失败');
    } else {
      subscribeToTask(taskId);
    }
  } catch (err) {
    addMessage('error', `加载任务失败: ${err.message}`);
  }
}

function subscribeToTask(taskId) {
  if (currentSSE) { currentSSE.close(); currentSSE = null; }
  const task = State.getTask(taskId);
  if (!task) return;

  const lastSeq = { thinking: 0, tool_call: 0, tool_result: 0 };

  currentSSE = connectSSE(taskId, {
    onStatus(data) {
      State.updateTask(taskId, { status: data.status });
      renderTaskList(State.tasks);
    },
    onLog(data) {
      if (data.type === 'thinking') {
        lastSeq.thinking++;
        if (lastSeq.thinking > 3) return;
        addMessage('thinking', data.content.text || '');
      } else if (data.type === 'tool_call') {
        lastSeq.tool_call++;
        addMessage('tool', formatToolCall(data.content));
      } else if (data.type === 'tool_result') {
        lastSeq.tool_result++;
        addMessage('tool_result', formatToolResult(data.content));
      }
    },
    onComplete(data) {
      State.updateTask(taskId, { status: 'completed', result_summary: data.summary });
      renderTaskList(State.tasks);
      addMessage('agent', data.summary || '任务已完成');
      if (data.artifacts && data.artifacts.length) {
        showArtifacts(data.artifacts);
      }
      currentSSE = null;
    },
    onError(data) {
      State.updateTask(taskId, { status: 'failed', error_message: data.error });
      renderTaskList(State.tasks);
      addMessage('error', data.error || '任务失败');
      currentSSE = null;
    },
  });
}

function addMessage(type, content) {
  const div = document.createElement('div');
  div.className = `message msg-${type}`;
  if (type === 'user') {
    div.innerHTML = `<div class="msg-bubble user-bubble">${escHtml(content)}</div>`;
  } else if (type === 'thinking') {
    div.innerHTML = `<div class="msg-bubble thinking-bubble">💭 ${escHtml(content)}</div>`;
  } else if (type === 'tool') {
    div.innerHTML = `<div class="msg-bubble tool-bubble">🔧 <code>${escHtml(typeof content === 'string' ? content : content.tool || '')}</code></div>`;
  } else if (type === 'tool_result') {
    div.innerHTML = `<div class="msg-bubble result-bubble"><details><summary>📋 结果</summary><pre>${escHtml(typeof content === 'string' ? content.slice(0, 300) : JSON.stringify(content, null, 2).slice(0, 300))}</pre></details></div>`;
  } else if (type === 'agent') {
    div.innerHTML = `<div class="msg-bubble agent-bubble">${escHtml(content)}</div>`;
  } else if (type === 'error') {
    div.innerHTML = `<div class="msg-bubble error-bubble">❌ ${escHtml(content)}</div>`;
  }
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function formatToolCall(content) {
  if (content.tool === 'execute_command') {
    return `执行命令: ${content.input}`;
  } else if (content.tool === 'write_file') {
    const inp = typeof content.input === 'string' ? JSON.parse(content.input) : content.input;
    return `写入文件: ${inp.path || ''}`;
  } else if (content.tool === 'read_file') {
    const inp = typeof content.input === 'string' ? JSON.parse(content.input) : content.input;
    return `读取文件: ${inp.path || ''}`;
  } else if (content.tool === 'list_files') {
    return '浏览目录结构';
  } else if (content.tool === 'task_complete') {
    return '标记任务完成';
  }
  return `调用工具: ${content.tool || ''}`;
}

function formatToolResult(content) {
  if (typeof content.output === 'string') {
    return content.output.slice(0, 200);
  } else if (content.output && content.output.stdout) {
    return content.output.stdout.slice(0, 200);
  }
  return JSON.stringify(content).slice(0, 200);
}

function showArtifacts(artifacts) {
  const el = document.getElementById('file-list');
  el.innerHTML = artifacts.map(a => {
    const url = `/api/artifacts/${a.id || ''}/download`;
    return `<div class="file-item">
      <span>📄 ${escHtml(a.file_name)}</span>
      <span class="file-size">${formatSize(a.file_size)}</span>
      <a href="${url}" download class="file-dl">⬇ 下载</a>
    </div>`;
  }).join('');
}

async function loadArtifacts(taskId) {
  try {
    const artifacts = await API.getArtifacts(taskId);
    if (artifacts.length) {
      showArtifacts(artifacts);
    }
  } catch (_) {}
}

function clearChat() {
  chatMessages.innerHTML = '';
  document.getElementById('file-list').innerHTML = '';
}

function formatSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}
