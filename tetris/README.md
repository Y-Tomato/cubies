# 俄罗斯方块（微信小游戏）

一个适配 **微信小游戏** 的俄罗斯方块游戏，包含消行特效、背景音乐与音效。全部画面由单个 Canvas 实时绘制，支持触屏操作、竖屏自适应缩放。

## 功能特性

- 🧩 **经典玩法**：七种方块（I/O/T/S/Z/J/L）、7-bag 随机、软降/硬降、旋转、暂存、幽灵投影
- 💥 **消行特效**：整行闪烁后一次性消除，多行同消正确处理
- 📈 **计分与等级**：分数 / 等级 / 消行数，等级提升重力加快
- 🏆 **最高分纪录**：本地持久化存储
- 📱💻 **自适应布局**：根据窗口尺寸自动计算格子大小，竖屏下自适应缩放
- 🎮 **触屏按钮**：方向、旋转、硬降、暂存，长按方向键可连续移动，支持双拇指多点触控
- 🔊 **音效**：旋转、消行、硬降、暂存、升级、游戏结束等反馈
- 🎵 **背景音乐**：循环播放 8-bit 旋律，可独立开关

## 运行方式

1. 下载并安装 [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)
2. 打开微信开发者工具 → 导入项目 → 选择本项目根目录（`tetris`）
3. 项目类型会自动识别为「小游戏」（`project.config.json` 中 `compileType` 为 `game`）
4. 将 `project.config.json` 中的 `appid` 改为你自己的小游戏 AppID（当前为 `touristappid` 游客模式，仅用于本地预览）
5. 编译运行即可

## 目录结构

```
.
├── game.js                          # 小游戏入口：初始化、场景、主循环、触控、渲染
├── game.json                        # 小游戏配置（屏幕方向、状态栏等）
├── project.config.json              # 微信开发者工具项目配置
├── audio/                           # 音效与背景音乐（WAV）
│   ├── click.wav  clear.wav  drop.wav  rotate.wav
│   ├── hold.wav  level.wav  over.wav  bgm.wav
├── utils/
│   ├── engine.js                    # 俄罗斯方块核心逻辑（纯 JS，与渲染无关）
│   └── audio.js                     # 音频管理
└── tools/
    └── gen-audio.js                 # 音频资源生成脚本
```

## 重新生成音频

音频文件由脚本合成，无需外部素材。如需重新生成：

```bash
node tools/gen-audio.js
```

## 操作说明

| 操作 | 效果 |
|------|------|
| ◀ / ▶ | 左右移动 |
| ▼ | 加速下落（长按连续） |
| ↻ | 旋转 |
| ⤓ | 硬降 |
| H | 暂存 |
| 顶部 ⏸ / ▶ | 暂停 / 继续 |
| 顶部 🔊 / 🔇 | 背景音乐开关 |
| 顶部 🔔 / 🔕 | 音效开关 |

## 与微信小程序版本的区别

小游戏没有 WXML/WXSS 页面体系，本版本改为：

- 以 `game.js` 作为唯一入口（取代 `app.js` + `pages/`）
- 所有界面（菜单、游戏、弹窗）均由 Canvas 2D 实时绘制
- 触控输入使用 `wx.onTouchStart/Move/End` 替代 `bindtap`/`bindtouchstart`
- 主循环使用 `requestAnimationFrame` 驱动
- 核心逻辑 `utils/engine.js` 与小程序版完全一致
