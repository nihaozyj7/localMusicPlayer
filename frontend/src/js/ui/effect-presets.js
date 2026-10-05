/* ==========================================================================
   ui/effect-presets.js — 音效档位表（选项面板与设置界面共用）
   --------------------------------------------------------------------------
   ★ 这份列表必须与 Go 侧 audioplay.EffectPresets / bootstrap.EffectPresets
     完全一致（值、顺序）。三处列表靠两侧的测试守住：
       · internal/bootstrap/config_effect_test.go（比对前两处）
       · frontend/tests/settings-effect.test.js（比对前端这一处）
     值写错的表现是"点了没反应"（后端收敛成 off），顺序不同的表现是
     按钮排列与后端文档不符 —— 都属于很难一眼看出的漂移。

   为什么单独成模块而不是留在设置界面里：档位按钮现在渲染在**播放选项面板**
   （底栏「选项」按钮）上，而设置界面里已经不再有音效卡片。测试仍然从
   settings-view 拿这份表（它 re-export），所以两边不会各留一份。
   ========================================================================== */

export const EFFECT_PRESETS = [
  { value: "off", label: "关闭" },
  { value: "vocal", label: "清澈人声" },
  { value: "bass", label: "低音增强" },
  { value: "surround", label: "3D 环绕" },
  { value: "live", label: "现场感" },
  { value: "hall", label: "大厅混响" },
];
