var currentSSE = null;
var sending = false;

function initChat() {
  document.getElementById('chat-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    if (sending) return;
    var input = document.getElementById('chat-input');
    var instruction = input.value.trim();
    if (!instruction) return;
    input.value = '';
    sending = true;
    await sendTask(instruction);
    sending = false;
  });

  document.getElementById('chat-input').addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      document.getElementById('chat-form').dispatchEvent(new Event('submit'));
    }
  });
}

async function sendTask(instruction) {
  var targetChar = window.getCurrentTarget ? window.getCurrentTarget() : 'boss';
  var nameMap = { boss: 'Boss', dev1: '开发工程师', pm: '产品经理', dev2: '前端工程师' };
  var charName = nameMap[targetChar] || targetChar;
  var fullInstruction = '@' + charName + ' ' + instruction;

  addMessage('user', fullInstruction);
  var statusEl = addMessage('status', '⏳ 正在准备...');

  if (window.setSceneCharStatus) {
    window.setSceneCharStatus(targetChar, 'thinking');
  }

  try {
    var task = await API.createTask(fullInstruction);
    State.addTask(task);
    State.setCurrentTask(task.id);
    renderTaskList(State.tasks);

    if (statusEl) statusEl.remove();

    subscribeToTask(task.id, targetChar);
  } catch (err) {
    if (statusEl) statusEl.remove();
    addMessage('error', '创建任务失败: ' + err.message);
    if (window.setSceneCharStatus) {
      window.setSceneCharStatus(targetChar, 'error');
    }
  }
}

function subscribeToTask(taskId, charId) {
  if (currentSSE) { currentSSE.close(); currentSSE = null; }

  var statusEl = null;
  var resolvedChar = charId || window.getCurrentTarget ? window.getCurrentTarget() : 'boss';

  currentSSE = connectSSE(taskId, {
    onStatus: function(data) {
      State.updateTask(taskId, { status: data.status });
      renderTaskList(State.tasks);

      if (window.setSceneCharStatus) {
        if (data.status === 'planning' || data.status === 'executing') {
          window.setSceneCharStatus(resolvedChar, 'working');
        }
      }

      var tips = {
        creating_sandbox: '正在创建沙箱环境...',
        planning: '正在分析任务...',
        executing: '正在执行...',
        copying_artifacts: '正在提取产物文件...'
      };
      var tip = tips[data.status];
      if (tip) {
        if (statusEl) statusEl.remove();
        statusEl = addMessage('status', '⏳ ' + tip);
      }
    },
    onLog: function(data) {
      if (statusEl) { statusEl.remove(); statusEl = null; }

      if (data.type === 'tool_call') {
        addMessage('tool', formatToolCall(data.content));
        if (window.showCharBubble && data.content && data.content.tool) {
          var toolNames = { execute_command: '执行命令...', write_file: '写文件...', read_file: '读文件...', list_files: '浏览目录...', task_complete: '打包完成...' };
          var shortName = toolNames[data.content.tool] || data.content.tool;
          window.showCharBubble(resolvedChar, shortName, 2000);
        }
      } else if (data.type === 'tool_result') {
        addMessage('tool_result', formatToolResult(data.content));
      }
    },
    onComplete: function(data) {
      if (statusEl) { statusEl.remove(); statusEl = null; }

      State.updateTask(taskId, { status: 'completed', result_summary: data.summary });
      renderTaskList(State.tasks);
      addMessage('agent', data.summary || '任务已完成');
      if (data.artifacts && data.artifacts.length) {
        showArtifacts(data.artifacts);
      }

      if (window.setSceneCharStatus) {
        window.setSceneCharStatus(resolvedChar, 'completed');
        setTimeout(function() { window.setSceneCharStatus(resolvedChar, 'idle'); }, 2000);
      }
      currentSSE = null;
    },
    onError: function(data) {
      if (statusEl) { statusEl.remove(); statusEl = null; }

      State.updateTask(taskId, { status: 'failed', error_message: data.error });
      renderTaskList(State.tasks);
      addMessage('error', data.error || '任务失败');

      if (window.setSceneCharStatus) {
        window.setSceneCharStatus(resolvedChar, 'error');
      }
      currentSSE = null;
    },
  });
}

function addMessage(type, content) {
  var chatMessages = document.getElementById('chat-messages');
  var div = document.createElement('div');
  div.className = 'message msg-' + type;

  if (type === 'user') {
    div.innerHTML = '<div class="msg-bubble user-bubble">' + escHtml(content) + '</div>';
  } else if (type === 'status') {
    div.innerHTML = '<div class="msg-bubble thinking-bubble">' + escHtml(content) + '</div>';
  } else if (type === 'tool') {
    div.innerHTML = '<div class="msg-bubble tool-bubble">' + escHtml(typeof content === 'string' ? content : content.tool || '') + '</div>';
  } else if (type === 'tool_result') {
    var text = typeof content === 'string' ? content.slice(0, 500) : JSON.stringify(content, null, 2).slice(0, 500);
    div.innerHTML = '<div class="msg-bubble result-bubble"><details><summary>📋 查看结果</summary><pre>' + escHtml(text) + '</pre></details></div>';
  } else if (type === 'agent') {
    div.innerHTML = '<div class="msg-bubble agent-bubble">' + escHtml(content) + '</div>';
  } else if (type === 'error') {
    div.innerHTML = '<div class="msg-bubble error-bubble">❌ ' + escHtml(content) + '</div>';
  }

  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return div;
}

function formatToolCall(content) {
  try {
    if (content.tool === 'execute_command') {
      return '执行命令: ' + content.input;
    } else if (content.tool === 'write_file') {
      var inp = content.input;
      if (typeof inp === 'string') inp = JSON.parse(inp);
      return '写入文件: ' + (inp.path || '');
    } else if (content.tool === 'read_file') {
      var inp = content.input;
      if (typeof inp === 'string') inp = JSON.parse(inp);
      return '读取文件: ' + (inp.path || '');
    } else if (content.tool === 'list_files') {
      return '浏览目录结构';
    } else if (content.tool === 'task_complete') {
      return '✅ 标记任务完成';
    }
  } catch (e) {
    console.log('[DEBUG] formatToolCall error:', e);
  }
  return '调用工具: ' + (content.tool || '');
}

function formatToolResult(content) {
  try {
    if (typeof content.output === 'string') {
      return content.output.slice(0, 300);
    } else if (content.output && content.output.stdout) {
      return content.output.stdout.slice(0, 300);
    }
  } catch (e) {}
  return JSON.stringify(content).slice(0, 300);
}

function showArtifacts(artifacts) {
  var el = document.getElementById('file-list');
  el.innerHTML = artifacts.map(function(a) {
    var url = '/api/artifacts/' + (a.id || '') + '/download';
    return '<div class="file-item">' +
      '<span>📄 ' + escHtml(a.file_name) + '</span>' +
      '<span class="file-size">' + formatSize(a.file_size) + '</span>' +
      '<a href="' + url + '" download class="file-dl">⬇ 下载</a>' +
      '</div>';
  }).join('');
}

function formatSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}
