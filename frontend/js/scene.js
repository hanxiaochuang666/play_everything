var CHARACTERS = [
  { id: 'boss', name: 'Boss', role: 'boss', color: 0xd32f2f, x: 650, y: 130, room: 'boss_office' },
  { id: 'dev1', name: '开发工程师', role: 'developer', color: 0x1976d2, x: 180, y: 380, room: 'work_area' },
  { id: 'pm', name: '产品经理', role: 'pm', color: 0x388e3c, x: 420, y: 360, room: 'work_area' },
  { id: 'dev2', name: '前端工程师', role: 'developer', color: 0xe65100, x: 650, y: 390, room: 'work_area' },
];

var ROOMS = [
  { name: 'boss_office', label: 'Boss 办公室', x: 520, y: 10, w: 270, h: 230, color: 0xfff3e0 },
  { name: 'meeting_room', label: '会议室', x: 10, y: 10, w: 250, h: 230, color: 0xe8f5e9 },
  { name: 'common_area', label: '休息区', x: 270, y: 10, w: 240, h: 230, color: 0xf3e5f5 },
  { name: 'work_area', label: '开放工位区', x: 10, y: 250, w: 780, h: 340, color: 0xe3f2fd },
];

var DESKS = [
  { x: 150, y: 395, w: 80, h: 45 },
  { x: 380, y: 375, w: 80, h: 45 },
  { x: 610, y: 405, w: 80, h: 45 },
  { x: 620, y: 145, w: 100, h: 50 },
];

window._sceneCallbacks = {};

var OfficeScene = new Phaser.Class({
  Extends: Phaser.Scene,
  initialize: function OfficeScene() {
    Phaser.Scene.call(this, { key: 'OfficeScene' });
  },

  preload: function() {
    this._generateTextures();
  },

  create: function() {
    console.log('[DEBUG] OfficeScene.create() starting');
    this.cameras.main.setBackgroundColor('#f5f5f5');
    this.charSprites = {};
    this._workTimers = {};

    this._drawRooms();
    this._drawFurniture();
    this._createCharacters();
    this._setupCamera();

    // 暴露全局引用
    window.gameScene = this;
    console.log('[DEBUG] window.gameScene set, charSprites keys:', Object.keys(this.charSprites));

    // 通知外部场景就绪
    if (window.onSceneReady) {
      window.onSceneReady();
    }

    // 初始选中 Boss
    var self = this;
    this.time.delayedCall(300, function() {
      self.selectCharacter('boss');
    });
  },

  _generateTextures: function() {
    var self = this;
    CHARACTERS.forEach(function(ch) {
      var key = 'char_' + ch.id;
      if (self.textures.exists(key)) return;
      var g = self.make.graphics({ add: false });
      g.fillStyle(ch.color, 1);
      g.fillRoundedRect(8, 20, 16, 18, 3);
      var skin = ch.role === 'boss' ? 0xffcc80 : 0xffcc99;
      g.fillStyle(skin, 1);
      g.fillCircle(16, 14, 8);
      g.fillStyle(0x333333, 1);
      g.fillCircle(13, 13, 1.5);
      g.fillCircle(19, 13, 1.5);
      g.fillStyle(0x424242, 1);
      g.fillRect(10, 38, 5, 8);
      g.fillRect(17, 38, 5, 8);
      g.generateTexture(key, 32, 48);
      g.destroy();
    });
  },

  _drawRooms: function() {
    var g = this.add.graphics();
    ROOMS.forEach(function(r) {
      g.fillStyle(r.color, 1);
      g.fillRect(r.x, r.y, r.w, r.h);
      g.lineStyle(3, 0xbdbdbd, 1);
      g.strokeRect(r.x, r.y, r.w, r.h);
    });

    g.fillStyle(0xeeeeee, 1);
    g.fillRect(265, 130, 25, 40);
    g.fillRect(525, 130, 25, 40);
    g.fillRect(400, 235, 40, 20);
    g.fillRect(650, 245, 40, 15);

    var self = this;
    ROOMS.forEach(function(r) {
      self.add.text(r.x + r.w / 2, r.y + 12, r.label, {
        fontSize: '11px', color: '#9e9e9e', fontFamily: 'sans-serif'
      }).setOrigin(0.5, 0).setDepth(1);
    });
  },

  _drawFurniture: function() {
    var g = this.add.graphics();

    DESKS.forEach(function(d) {
      g.fillStyle(0x8d6e63, 1);
      g.fillRoundedRect(d.x - d.w / 2, d.y - d.h / 2, d.w, d.h, 4);
      g.fillStyle(0x37474f, 1);
      g.fillRect(d.x - 10, d.y - d.h / 2 - 12, 20, 14);
      g.fillStyle(0x78909c, 1);
      g.fillRect(d.x - 8, d.y - d.h / 2 - 10, 16, 10);
    });

    g.fillStyle(0xa1887f, 1);
    g.fillRoundedRect(40, 80, 200, 100, 8);
    g.fillStyle(0xbdbdbd, 1);
    for (var i = 0; i < 4; i++) {
      var cx = 80 + i * 50;
      g.fillCircle(cx, 65, 8);
      g.fillCircle(cx, 195, 8);
    }
    g.fillCircle(25, 130, 8);
    g.fillCircle(255, 130, 8);

    g.fillStyle(0x7cb342, 1);
    g.fillRoundedRect(290, 60, 100, 40, 6);
    g.fillRoundedRect(290, 120, 100, 40, 6);
    g.fillStyle(0x8bc34a, 1);
    g.fillRoundedRect(400, 60, 40, 100, 6);
    g.fillStyle(0x8d6e63, 1);
    g.fillRect(340, 100, 40, 25);

    var plants = [[30, 400], [760, 280], [400, 440]];
    plants.forEach(function(p) {
      g.fillStyle(0x795548, 1);
      g.fillRoundedRect(p[0] - 5, p[1] + 5, 10, 10, 2);
      g.fillStyle(0x4caf50, 1);
      g.fillCircle(p[0], p[1], 8);
      g.fillStyle(0x66bb6a, 1);
      g.fillCircle(p[0] - 3, p[1] - 2, 5);
      g.fillCircle(p[0] + 3, p[1] - 2, 5);
    });
  },

  _createCharacters: function() {
    var self = this;
    CHARACTERS.forEach(function(ch) {
      var spr = self.add.sprite(ch.x, ch.y, 'char_' + ch.id)
        .setInteractive({ useHandCursor: true }).setDepth(10);
      spr.setData('charId', ch.id);

      spr.on('pointerdown', function() { self.selectCharacter(ch.id); });
      spr.on('pointerover', function() { spr.setTint(0xdddddd); });
      spr.on('pointerout', function() {
        if (self._selectedId !== ch.id) spr.clearTint();
      });

      var label = self.add.text(ch.x, ch.y - 30, ch.name, {
        fontSize: '10px', color: '#555', fontFamily: 'sans-serif',
        backgroundColor: '#ffffffcc', padding: { x: 3, y: 1 }
      }).setOrigin(0.5).setDepth(20);

      var bubble = self.add.text(ch.x, ch.y - 50, '', {
        fontSize: '10px', color: '#333', fontFamily: 'sans-serif',
        backgroundColor: '#ffff88', padding: { x: 5, y: 3 },
        stroke: '#e0a800', strokeThickness: 1
      }).setOrigin(0.5).setDepth(25).setVisible(false);

      self.charSprites[ch.id] = { spr: spr, label: label, bubble: bubble };
    });
  },

  _setupCamera: function() {
    var self = this;
    this.input.on('pointermove', function(pointer) {
      if (!pointer.isDown) return;
      var cam = self.cameras.main;
      cam.scrollX -= (pointer.x - pointer.prevPosition.x) / cam.zoom;
      cam.scrollY -= (pointer.y - pointer.prevPosition.y) / cam.zoom;
    });
    this.input.on('wheel', function(pointer, gameObjects, deltaX, deltaY) {
      var cam = self.cameras.main;
      var newZoom = Phaser.Math.Clamp(cam.zoom - deltaY * 0.001, 0.7, 2);
      cam.setZoom(newZoom);
    });
  },

  selectCharacter: function(charId) {
    this._selectedId = charId;
    var self = this;
    Object.keys(this.charSprites).forEach(function(k) {
      if (k === charId) {
        self.charSprites[k].spr.setTint(0xffff88);
      } else {
        self.charSprites[k].spr.clearTint();
      }
    });
    if (window._sceneCallbacks.onSelect) {
      var data = null;
      CHARACTERS.forEach(function(c) { if (c.id === charId) data = c; });
      window._sceneCallbacks.onSelect(charId, data);
    }
  },

  setCharacterStatus: function(charId, status) {
    console.log('[DEBUG] setCharacterStatus called:', charId, status);
    var ch = this.charSprites[charId];
    if (!ch) {
      console.log('[DEBUG]  charSprites not found for:', charId, 'keys:', Object.keys(this.charSprites));
      return;
    }
    var icons = { idle: '', thinking: '💭 思考中...', working: '⌨ 工作中...', meeting: '会议中...', reporting: '汇报中...', completed: '✅ 完成!', error: '❌ 出错...' };
    var text = icons[status] || status;
    console.log('[DEBUG]  setting bubble text to:', text);
    ch.bubble.setText(text);
    if (text) {
      ch.bubble.setVisible(true);
      // 确保位置正确
      var orig = CHARACTERS.find(function(c) { return c.id === charId; });
      if (orig) {
        ch.bubble.setPosition(orig.x, orig.y - 50);
      }
      console.log('[DEBUG]  bubble visible, pos:', ch.bubble.x, ch.bubble.y);
    } else {
      ch.bubble.setVisible(false);
    }

    if (status === 'working') {
      this._startWorkAnim(charId);
    } else {
      this._stopWorkAnim(charId);
    }
  },

  showCharacterBubble: function(charId, text, duration) {
    var ch = this.charSprites[charId];
    if (!ch) return;
    ch.bubble.setText(text).setVisible(true);
    var orig = CHARACTERS.find(function(c) { return c.id === charId; });
    if (orig) ch.bubble.setPosition(orig.x, orig.y - 50);
    if (this._bubbleTimer) clearTimeout(this._bubbleTimer);
    var self = this;
    this._bubbleTimer = setTimeout(function() { ch.bubble.setVisible(false); }, duration || 3000);
  },

  _startWorkAnim: function(charId) {
    if (this._workTimers[charId]) return;
    var self = this;
    var spr = this.charSprites[charId].spr;
    var baseY = spr.y;
    var bounce = 0;
    this._workTimers[charId] = this.time.addEvent({
      delay: 200,
      loop: true,
      callback: function() {
        spr.y = baseY + (bounce ? -1 : 1);
        bounce = 1 - bounce;
      }
    });
  },

  _stopWorkAnim: function(charId) {
    if (this._workTimers[charId]) {
      this._workTimers[charId].remove();
      delete this._workTimers[charId];
    }
  }
});
