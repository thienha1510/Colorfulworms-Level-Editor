/* Editor-only play rules. The normal game loads this file without installing it. */
(function (root) {
  'use strict';
  const hiddenPaths = ['ui/tili', 'ui/btn_shezhi_01', 'ui/btn_jiashi', 'ui/btn_tishi', 'ui/timeStop', 'yindao', 'ui/allTc/newItem'];
  function nodeAt(controller, path) {
    if (controller.view?.[path]) return controller.view[path];
    let node = controller.node;
    for (const name of path.split('/')) node = node?.getChildByName(name);
    return node;
  }
  function hideHud(controller) {
    for (const path of ['ui/dataShow', 'ui/dataShow/time']) { const node = nodeAt(controller, path); if (node) node.active = true; }
    for (const path of hiddenPaths) { const node = nodeAt(controller, path); if (node) node.active = false; }
    const hand = controller.getHand?.(); if (hand) hand.active = false;
    controller.yinDaoBol = true;
  }
  function boardCleared(controller) {
    if (!controller.__levelReady || controller.over || controller.__trackingBoardHidden ||
        !controller.node || controller.node.isValid === false || controller.node.activeInHierarchy === false ||
        !controller.jianTouArr?.length || !controller.xyArr) return false;
    for (const row of controller.xyArr) for (const node of row || []) {
      if (node && node.isValid !== false && node.getComponent?.('role')) return false;
    }
    for (const node of controller.jianTouArr) {
      if (!node || node.isValid === false) continue;
      const role = node.getComponent?.('role');
      if (!role) continue;
      if (!role.goBol && !role.over) return false;
      if (!role.atkArrowBol && role.allNode?.some(body => body && body.isValid !== false &&
          (typeof body.activeInHierarchy === 'boolean' ? body.activeInHierarchy : body.active))) return false;
    }
    return true;
  }
  function install(LevelClass, onLost, onWon = () => {}) {
    const proto = LevelClass?.prototype;
    if (!proto || proto.__cwTestRules) return false;
    Object.defineProperty(proto, '__cwTestRules', { value: true });
    // Native geometry uses rows from the top and may also reflect them by
    // level. Normalize each geometry input once to the editor's bottom origin.
    for (const method of ['initRole2', 'initChuanSong', 'initBlackHole', 'initYaoShi']) {
      const original = proto[method];
      if (typeof original !== 'function') continue;
      proto[method] = function (cells, ...args) {
        if (!Array.isArray(cells)) return original.call(this, cells, ...args);
        const reflected = Object.assign([], cells);
        for (let i = 0; i < cells.length; i++) reflected[i] = { ...cells[i], y: this.nowY - 1 - cells[i].y };
        const ownReflection = Object.prototype.hasOwnProperty.call(this, 'fanGet'), reflection = this.fanGet;
        this.fanGet = value => value;
        try { return original.call(this, reflected, ...args); }
        finally { if (ownReflection) this.fanGet = reflection; else delete this.fanGet; }
      };
    }
    const init = proto.init, update = proto.update, initHp = proto.initHp, tcAct = proto.tcAct;
    proto.init = function () {
      root.CWEnemySpeed?.reset(this);
      this.__cwTestLost = false; this.__cwTestWon = false; this.__cwTestHadWorm = false; this.over = false; this.foeStop = false;
      this.timeUp = true; this.timeStart = false; this.autoBol = false; this.firstStop = false;
      this.yinDaoBol = true; this.useSaveData = false;
      this.unschedule?.(this.__normalClearPending); this.__normalClearPending = null;
      this.closeAlltc?.();
      const generation = this.__cwTestGeneration = (this.__cwTestGeneration || 0) + 1;
      this.unschedule?.(this.timeUP); hideHud(this);
      const result = init.apply(this, arguments);
      if (result?.then) return result.then(value => { if (generation === this.__cwTestGeneration) hideHud(this); return value; });
      hideHud(this); return result;
    };
    // Native countdown and invasion remain active. Once a test ends, native
    // timer callbacks must not open an extra add-time/revival popup over it.
    proto.tcAct = function () {
      if (this.__cwTestLost || this.__cwTestWon) return;
      return tcAct?.apply(this, arguments);
    };
    proto.changeWin = function () {
      if (!this.__cwTestLost && !this.__cwTestWon) this.jianIce?.();
    };
    proto.update = function () {
      if (this.__cwTestLost || this.__cwTestWon) return;
      // The bundled normal-mode gate captures its original win method. Suppress
      // that gate during its update, then detect the fully animated clear here.
      const hidden = this.__trackingBoardHidden;
      this.__trackingBoardHidden = true;
      let result;
      try { result = update?.apply(this, arguments); }
      finally { this.__trackingBoardHidden = hidden; }
      hideHud(this);
      // A warm controller can briefly retain the previous empty board while the
      // next map initializes. Arm completion only after seeing its live worms.
      if (this.__levelReady && !hidden && this.xyArr?.some(row => row?.some(node =>
          node && node.isValid !== false && node.getComponent?.('role')))) this.__cwTestHadWorm = true;
      if (this.__cwTestHadWorm && boardCleared(this)) this.win();
      return result;
    };
    proto.initHp = function () { const result = initHp?.apply(this, arguments); hideHud(this); return result; };
    proto.lose = function () {
      if (this.__cwTestLost || this.__cwTestWon) return;
      this.__cwTestLost = true; this.over = true; this.foeStop = true; this.timeUp = false;
      this.unschedule?.(this.timeUP); this.unschedule?.(this.saveData);
      this.closeAlltc?.();
      const popup = nodeAt(this, 'ui/allTc/jituiFoe') || nodeAt(this, 'ui/allTc/addHp');
      if (popup) { if (tcAct) tcAct.call(this, popup); else popup.active = true; }
      hideHud(this); onLost(this, popup);
    };
    proto.foeLose = proto.lose;
    proto.jianHp = function () {
      if (this.__cwTestLost || this.over) return;
      this.nowHp = Math.max(0, this.nowHp - 1); this.initHp();
      if (this.nowHp === 0) this.lose();
    };
    proto.win = function () {
      if (this.__cwTestLost || this.__cwTestWon) return;
      this.__cwTestWon = true; this.over = true; this.foeStop = true; this.timeUp = false;
      this.unschedule?.(this.timeUP); this.unschedule?.(this.saveData);
      this.closeAlltc?.(); hideHud(this); onWon(this);
    };
    // Restart and revival belong to the editor toolbar, never to the game popup.
    for (const method of ['clickSetting', 'openReload', 'reload', 'addHp', 'jituiFoe', 'addTime', 'addTimeOver', 'addTimeOver2', 'itemAddTime', 'videoskillTimeStopOver']) proto[method] = function () {};
    return true;
  }
  function configureGlobals(game) {
    // Use the normal stage's invasion, destination and countdown.
    game.noTime = false; game.noTimeMode = false; game.xunHuanBol = true; game.twoLvWin = false;
  }
  const api = { install, hideHud, nodeAt, configureGlobals };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CWPlaytestRules = api;
})(typeof window !== 'undefined' ? window : globalThis);
