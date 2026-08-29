// 音频管理（单例）：音效 + 背景音乐
const SFX_FILES = {
  click: '/audio/click.wav',
  clear: '/audio/clear.wav',
  drop: '/audio/drop.wav',
  rotate: '/audio/rotate.wav',
  hold: '/audio/hold.wav',
  level: '/audio/level.wav',
  over: '/audio/over.wav'
};

class AudioManager {
  constructor() {
    this.sfxOn = true;
    this.bgmOn = true;
    this.bgm = null;
    this._bgmPlaying = false;
    this._sfx = {};
    this._loadPrefs();
  }

  _loadPrefs() {
    try {
      const sfx = wx.getStorageSync('sfxOn');
      const bgm = wx.getStorageSync('bgmOn');
      this.sfxOn = sfx === '' ? true : !!sfx;
      this.bgmOn = bgm === '' ? true : !!bgm;
    } catch (e) {}
  }

  setSfx(on) {
    this.sfxOn = on;
    try { wx.setStorageSync('sfxOn', on); } catch (e) {}
  }

  setBgm(on) {
    this.bgmOn = on;
    try { wx.setStorageSync('bgmOn', on); } catch (e) {}
    if (on) this.playBgm();
    else this.stopBgm();
  }

  getSfx() { return this.sfxOn; }
  getBgm() { return this.bgmOn; }

  _create(file, volume) {
    const ctx = wx.createInnerAudioContext();
    ctx.src = file;
    ctx.volume = volume;
    ctx.obeyMuteSwitch = false;
    ctx.onError(() => {});
    return ctx;
  }

  play(name) {
    if (!this.sfxOn) return;
    const file = SFX_FILES[name];
    if (!file) return;
    if (!this._sfx[name]) {
      this._sfx[name] = this._create(file, name === 'over' ? 0.9 : 0.6);
    }
    const ctx = this._sfx[name];
    ctx.stop();
    ctx.play();
  }

  playBgm() {
    if (!this.bgmOn) return;
    if (!this.bgm) {
      this.bgm = this._create('/audio/bgm.wav', 0.5);
      this.bgm.loop = true;
    }
    if (!this._bgmPlaying) {
      this.bgm.play();
      this._bgmPlaying = true;
    }
  }

  stopBgm() {
    if (this.bgm && this._bgmPlaying) {
      this.bgm.stop();
      this._bgmPlaying = false;
    }
  }

  pauseBgm() {
    if (this.bgm && this._bgmPlaying) {
      this.bgm.pause();
      this._bgmPlaying = false;
    }
  }

  resumeBgm() {
    if (!this.bgmOn) return;
    if (this.bgm && !this._bgmPlaying) {
      this.bgm.play();
      this._bgmPlaying = true;
    }
  }
}

module.exports = new AudioManager();
