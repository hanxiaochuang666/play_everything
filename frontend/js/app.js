(function() {
  var game;
  var currentTargetChar = 'boss';
  var pendingStatusQueue = [];
  var sceneReady = false;

  function initGame() {
    game = new Phaser.Game({
      type: Phaser.AUTO,
      width: 800,
      height: 600,
      parent: 'game-container',
      backgroundColor: '#f5f5f5',
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      scene: OfficeScene,
    });

    game.events.on('ready', function() {
      console.log('[DEBUG] Phaser game ready, sceneReady=', sceneReady);
    });
  }

  window._sceneCallbacks.onSelect = function(charId, charData) {
    currentTargetChar = charId;
    var nameMap = { boss: 'Boss', dev1: '开发工程师', pm: '产品经理', dev2: '前端工程师' };
    document.getElementById('char-name').textContent = nameMap[charId] || charId;
    document.getElementById('char-role').textContent = (charData && charData.role) || '';
    document.getElementById('input-target').textContent = '发给: ' + (nameMap[charId] || charId);
    console.log('[DEBUG] Character selected:', charId);
  };

  window.setSceneCharStatus = function(charId, status) {
    console.log('[DEBUG] setSceneCharStatus called:', charId, status, 'sceneReady=', sceneReady);
    if (!sceneReady) {
      pendingStatusQueue.push({ charId: charId, status: status });
      return;
    }
    if (window.gameScene) {
      window.gameScene.setCharacterStatus(charId, status);
    }
  };

  window.getCurrentTarget = function() {
    return currentTargetChar;
  };

  window.showCharBubble = function(charId, text, duration) {
    console.log('[DEBUG] showCharBubble called:', charId, text);
    if (window.gameScene && sceneReady) {
      window.gameScene.showCharacterBubble(charId, text, duration);
    }
  };

  window.onSceneReady = function() {
    console.log('[DEBUG] Scene reported ready, flushing queue:', pendingStatusQueue.length);
    sceneReady = true;
    pendingStatusQueue.forEach(function(item) {
      if (window.gameScene) {
        window.gameScene.setCharacterStatus(item.charId, item.status);
      }
    });
    pendingStatusQueue = [];
  };

  initGame();
  initChat();
  initSidebar();
  loadInitialTasks();
})();

async function loadInitialTasks() {
  try {
    var tasks = await API.listTasks();
    State.tasks = tasks;
    renderTaskList(State.tasks);
    if (tasks.length && !State.currentTaskId) {
      State.setCurrentTask(tasks[0].id);
      await loadTaskToChat(tasks[0].id);
    }
  } catch (err) {
    console.error('[DEBUG] loadInitialTasks error:', err);
  }
}
