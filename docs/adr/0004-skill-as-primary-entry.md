# Skill 作为产品第一入口

Skill 不是文档的附属品，而是与 CLI 并列的核心用户入口。设计原则：Skill 负责理解意图、澄清模糊、组装命令；CLI 是唯一的执行层。CLI 的输出要同时为人类可读和 Skill 可解析而设计（支持 `--json` 结构化输出）。

这意味着 CLI 的参数设计、错误信息、输出格式都需要考虑"被 agent 调用"的场景，而非仅面向人类用户。Skill 通过 `context: fork` 在子 agent 中执行长时间操作，通过 `allowed-tools` 预授权 CLI 调用，避免反复确认权限。

## Consequences

- CLI 必须支持 `--json` flag，输出结构化结果供 Skill 解析。
- 错误信息需要机器可解析的 error code，不能只有人类可读文本。
- Skill 的 SKILL.md 需要持续迭代，补充 Gotchas（基于真实使用中 agent 犯的错误）。
