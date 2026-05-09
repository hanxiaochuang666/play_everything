const State = {
    tasks: [],
    currentTaskId: null,

    setCurrentTask(id) {
        this.currentTaskId = id;
        document.querySelectorAll('.task-item').forEach(el => {
            el.classList.toggle('active', el.dataset.taskId === id);
        });
    },

    addTask(task) {
        const idx = this.tasks.findIndex(t => t.id === task.id);
        if (idx >= 0) {
            this.tasks[idx] = { ...this.tasks[idx], ...task };
        } else {
            this.tasks.unshift(task);
        }
    },

    updateTask(id, updates) {
        const task = this.tasks.find(t => t.id === id);
        if (task) Object.assign(task, updates);
    },

    getTask(id) {
        return this.tasks.find(t => t.id === id);
    }
};
