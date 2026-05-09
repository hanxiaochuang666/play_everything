function initSidebar() {
    document.getElementById('btn-new-task').addEventListener('click', () => {
        const input = document.getElementById('chat-input');
        input.focus();
    });
}

function renderTaskList(tasks) {
    const el = document.getElementById('task-list');
    if (!tasks.length) {
        el.innerHTML = '<div class="task-empty">暂无任务</div>';
        return;
    }
    el.innerHTML = tasks.map(t => {
        const icon = { pending: '○', planning: '◌', creating_sandbox: '◌', executing: '◐', completed: '●', failed: '✕', cancelled: '⊘' }[t.status] || '○';
        const cls = t.status === 'executing' || t.status === 'planning' || t.status === 'creating_sandbox' ? 'task-active' : '';
        const active = t.id === State.currentTaskId ? 'active' : '';
        return `<div class="task-item ${cls} ${active}" data-task-id="${t.id}">
          <span class="task-icon ${t.status}">${icon}</span>
          <span class="task-title">${escHtml(t.title || t.instruction.slice(0, 30))}</span>
          <span class="task-status">${statusLabel(t.status)}</span>
        </div>`;
    }).join('');

    document.querySelectorAll('.task-item').forEach(item => {
        item.addEventListener('click', async () => {
            const id = item.dataset.taskId;
            State.setCurrentTask(id);
            await loadTaskToChat(id);
        });
    });
}

function statusLabel(s) {
    const m = { pending: '等待中', planning: '规划中', creating_sandbox: '准备环境', executing: '执行中', completed: '已完成', failed: '失败', cancelled: '已取消' };
    return m[s] || s;
}

function escHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
}
