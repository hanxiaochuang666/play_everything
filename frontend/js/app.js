(function() {
  initSidebar();
  initChat();
  loadInitialTasks();
})();

async function loadInitialTasks() {
  try {
    const tasks = await API.listTasks();
    State.tasks = tasks;
    renderTaskList(State.tasks);
    if (tasks.length && !State.currentTaskId) {
      State.setCurrentTask(tasks[0].id);
      await loadTaskToChat(tasks[0].id);
    }
  } catch (err) {
    console.error('[DEBUG] 加载任务列表失败:', err);
  }
}
