const audio = require('../../utils/audio.js');

Page({
  data: {
    bgmOn: true,
    sfxOn: true,
    bestText: '暂无'
  },

  onShow() {
    const best = wx.getStorageSync('tetris_high');
    this.setData({
      bgmOn: audio.getBgm(),
      sfxOn: audio.getSfx(),
      bestText: best ? String(best) : '暂无'
    });
  },

  onStart() {
    audio.play('click');
    wx.navigateTo({ url: '/pages/game/game' });
  },

  onToggleBgm(e) {
    const on = e.detail.value;
    audio.setBgm(on);
    this.setData({ bgmOn: on });
    if (on) audio.playBgm();
    else audio.stopBgm();
  },

  onToggleSfx(e) {
    const on = e.detail.value;
    audio.setSfx(on);
    this.setData({ sfxOn: on });
    if (on) audio.play('click');
  }
});
