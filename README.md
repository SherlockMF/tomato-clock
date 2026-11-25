# 虚拟人生番茄钟

想直接用番茄钟，可打开[第一季《南下十五日》](annual-product/南下十五日/index.html)。要逐段校稿，可打开[可跳过计时的试读版](annual-product/第一季·南下十五日试读.html)。两份网页均可单文件转发。

本工作区包含两个可以独立运行的 Node.js 工程。开发服务需要 Node.js 24.15.0 或更高版本。

| 工程 | 用途 | 启动后的入口 |
| --- | --- | --- |
| [annual-product](annual-product/README.md) | 平行人生 · 年度旅居番茄钟 | [localhost:4317/annual](http://localhost:4317/annual) |
| [journey-engine](journey-engine/README.md) | 持续旅途模拟与 M5 专注原型 | [127.0.0.1:4333/life32r3?mode=journey](http://127.0.0.1:4333/life32r3?mode=journey) |

在对应工程目录运行 `npm start`。可以同时启动两个工程。
