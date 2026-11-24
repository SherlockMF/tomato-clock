# 持续旅途 · 自主模拟引擎

M3.3「持续旅途」基于行动、路程、关系和账本推进人物生活。M4 从已记录的事实生成专注回顾，M5 提供 25 或 50 分钟计时、到期提交和下次接续。

## 运行

需要 Node.js 24.15.0 或更高版本。在本目录运行 `npm start`，打开 [持续旅途](http://127.0.0.1:4333/life32r3?mode=journey)。原持续旅途实验室的 SQLite 存档位于 `experiments/studio/life32r3/`，也可以按四种背景新建实验。

用 `npm start -- --port 4334` 可沿用先前的 `4334` 访问地址。默认使用规则叙事。若本机已有支持 `/completion` 的 llama.cpp 服务，可指定 `--narrator-port`。

## 开发与核验

- `src/journey/` 和 `src/life32r3/` 是持续旅途规则和运行时。更早的底层模块仍参与对照、重放及存档版本校验。
- 安装开发依赖后运行 `npm run check`，执行类型检查、lint、测试及编译。
- [M5 计时与验证记录](reports/m33-journey/专注计时与连续十窗.md) · [第 7 版回顾对照](reports/m33-journey/连续值班与下班后的回顾.md)
