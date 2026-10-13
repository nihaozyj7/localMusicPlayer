/* ==========================================================================
   ai-automation.js — 播放器会自动使用 AI 的那些地方（唯一一份清单）
   --------------------------------------------------------------------------
   为什么需要这个模块：AI 的两个「自动化」开关（aiLyricsClean / aiDownloadTag）
   默认都是**开**的，也就是说刚装好、填完 Base URL 与 API Key 之后，播放器会在
   用户没有盯着的时候自己调用 AI —— 匹配歌词前来一次清洗、下载完成后来一次
   元数据整理（后者还会**改写用户文件里的标签**）。

   这属于「必须被看见」的行为，所以清单只有一份，三处共用：
     · 设置 → AI 相关的提示块（列出自动化项、触发时机、当前开关状态）；
     · 用户拨开某个开关时的那条提醒（说清接下来会自动做什么）；
     · 测试（断言两项都在、状态跟着配置走）。

   注意：这里只描述**行为**，不发请求 —— 真正的调用在服务端侧
   （services_ai.go / ai_tags.go）与歌词匹配链路（services.go#aiEnabled）。
   ========================================================================== */

/**
 * 自动化清单。
 *
 * key 与配置键同名（bootstrap.Config 的 json 名），`off` 是「关掉之后会怎样」，
 * 让用户可以据此判断要不要留着一个开关。
 */
export const AI_AUTOMATIONS = [
  {
    key: "aiLyricsClean",
    label: "匹配歌词前用 AI 清洗元数据",
    when: "每次自动匹配歌词之前（本地标签匹配不到、要联网找歌词时）",
    detail: "AI 从文件名还原真实的标题 / 歌手，再拿它去匹配；一次调用可能要十几秒",
  },
  {
    key: "aiDownloadTag",
    label: "下载完成后用 AI 整理元数据",
    when: "每次下载结束之后，在后台进行（含从试听缓存复制的那条路径）",
    detail: "AI 还原标题 / 歌手 / 专辑，并**写回歌曲文件的标签**（m4a / flac），不可撤销",
  },
];

/**
 * 每一项的当前状态。
 *
 * 与界面上的开关判定同一套口径：只有**显式**为 false 才算关
 * （配置缺字段时视为默认开，与 bootstrap 的默认值一致）。
 */
export function aiAutomationState(cfg = {}) {
  return AI_AUTOMATIONS.map((a) => ({ ...a, on: cfg?.[a.key] !== false }));
}

/** 是否有任何一项自动化开着（= 播放器会在背后自己调用 AI） */
export function aiAutomationActive(cfg = {}) {
  return aiAutomationState(cfg).some((a) => a.on);
}

/**
 * 用户把某个自动化开关**打开**时的提醒文案。
 *
 * 不是「已开启」三个字了事：这两个开关的效果发生在用户看不见的时候
 * （下载结束后台改写文件标签 / 匹配歌词前多等十几秒），所以这一下必须说清
 * 「从现在起会发生什么、怎么关掉」。未知 key 返回空串（调用方不发提示）。
 */
export function aiAutomationNotice(key) {
  const item = AI_AUTOMATIONS.find((a) => a.key === key);
  if (!item) return "";
  if (key === "aiDownloadTag") {
    return `已开启「${item.label}」：${item.when}会把文件名与现有标签交给 AI，并写回文件标签（不可撤销）；随时可在设置里关掉`;
  }
  return `已开启「${item.label}」：${item.when}会先等一次 AI 调用（可能十几秒）；随时可在设置里关掉`;
}
