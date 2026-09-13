/* ==========================================================================
   eslint.config.js — ESLint 9 扁平配置
   --------------------------------------------------------------------------
   覆盖范围：
     · frontend/src/**            浏览器端源码（原生 ESM）
     · frontend/packages/**       抽离出的包（皮肤等）
     · frontend/tests/**          单测（node --test）
     · tools/**、*.config.js      构建脚本（Node 环境）
   忽略：dist / bindings（生成物）、build/ffmpeg（第三方源码）、bin、node_modules
   ========================================================================== */

import js from "@eslint/js";
import globals from "globals";

const COMMON_RULES = {
  // 未使用变量：允许以 _ 开头的占位参数，允许 catch 里省略绑定
  "no-unused-vars": [
    "error",
    { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none", ignoreRestSiblings: true },
  ],
  "no-empty": ["error", { allowEmptyCatch: true }],
  // 本项目大量使用「先声明后按需初始化」的模块级变量
  "no-fallthrough": ["error", { commentPattern: "falls?[ -]?through" }],
  eqeqeq: ["error", "smart"],
  "no-var": "error",
  "prefer-const": ["error", { destructuring: "all" }],
  "object-shorthand": ["warn", "properties"],
  "no-console": "off",
};

export default [
  {
    ignores: [
      "node_modules/**",
      "bin/**",
      "build/**",
      "internal/ffmpeg/**",
      "frontend/dist/**",
      "frontend/bindings/**",
      "frontend/.bindings-tmp-*/**",
      ".task/**",
      "frontend/packages/*/dist/**",
    ],
  },

  /* ---- 前端（浏览器） ---- */
  {
    files: ["frontend/src/**/*.js", "frontend/packages/**/*.js"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.browser },
    },
    rules: { ...js.configs.recommended.rules, ...COMMON_RULES },
  },

  /* ---- 单测（Node） ---- */
  {
    files: ["frontend/tests/**/*.js", "**/*.test.js"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.node },
    },
    rules: { ...js.configs.recommended.rules, ...COMMON_RULES },
  },

  /* ---- 构建脚本 / 配置文件（Node） ---- */
  {
    files: ["tools/**/*.js", "tools/**/*.mjs", "*.config.js", "frontend/*.config.js"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.node },
    },
    rules: { ...js.configs.recommended.rules, ...COMMON_RULES },
  },
];
