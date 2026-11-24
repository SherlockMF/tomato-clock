# 平行人生 · 年度旅居番茄钟

选择昵称、初始 MBTI 和性别，专注 25 分钟后读一段旅居故事。默认内容来自修订版年度读本，旅人档案中的偏好会影响后续情节。已读进度、偏好和计时状态保存在当前浏览器的 IndexedDB。

## 运行

需要 Node.js 24.15.0 或更高版本。在本目录运行 `npm start`，打开 [年度旅居番茄钟](http://localhost:4317/annual)。已有进度绑定到原来使用的浏览器和地址，同一个浏览器中 `localhost` 与 `127.0.0.1` 的进度各自独立。

## 开发与核验

- `studio/` 存放页面、计时状态和分享图素材；`src/travel-story/` 存放年度故事与偏好逻辑。
- [年度读本](reports/roaming-year/beijing-365d-revised/年度旅居试读.html) 是默认正文和收支的运行数据。
- [16 条年度旅途手记](平行人生·16条年度旅途手记.html) 可单独在浏览器中打开。
- 安装开发依赖后运行 `npm run check`，执行类型检查、lint、测试及编译。
- 浏览器回归可用 `python tools/annual-browser-smoke.py http://localhost:4317/annual`，需要本机安装 Python Playwright 和 Chrome。
