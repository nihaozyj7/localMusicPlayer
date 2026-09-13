/* ==========================================================================
   register.mjs — 测试入口的模块钩子注册（见 css-stub-loader.mjs）
   用法：node --import ./frontend/tests/register.mjs --test frontend/tests/
   ========================================================================== */

import { register } from "node:module";

register("./css-stub-loader.mjs", import.meta.url);
