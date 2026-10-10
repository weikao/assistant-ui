import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // 二开 vendored 包：specs 位于 test/ 目录（与上游同构）。
    // vitest 4 默认 include 仅扫 src/**，须显式纳入 test/，否则 `vitest run` 空转。
    include: ["test/**/*.spec.ts", "src/**/*.{test,spec}.ts"],
    // ag-ui-thread-runtime-core.spec（3000+ 行）在本仓库 Windows + Node 24
    // 环境存在既有 worker OOM（已用无本地改动的基线对照验证：同样崩溃，
    // 堆扩至 8GB 亦无效），暂排除出本地默认门禁；上游 CI 仍覆盖该规格。
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "test/ag-ui-thread-runtime-core.spec.ts",
    ],
    environment: "node",
  },
});
