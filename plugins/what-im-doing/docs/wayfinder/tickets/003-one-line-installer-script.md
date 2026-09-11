# [Task] 编写数十台设备一键安装与注册探针脚本 (collector/install.sh)

- **Parent Map**: [../map.md](../map.md)
- **Type**: `wayfinder:task` (AFK)
- **Status**: Open (Frontier)

## Question

如何为 Linux 终端设备设计一个单行一键安装脚本（`install.sh`），使得管理员在任意一台新设备上只需执行一行命令，即可完成配置生成、依赖校验（检测 KDE/D-Bus 或通用环境）以及 `systemd --user` 定时任务的无缝开机自启？

## Acceptance Criteria

1. 脚本支持参数：`--endpoint <URL>`, `--id <device-id>`, `--name <friendly-name>`, `--type <desktop|laptop|server>`, `--token <sk_xxx>`；
2. 自动在 `~/.config/what-im-doing/config.json` 写入标准配置文件；
3. 自动安装 `what-im-doing.sh` 采集脚本并赋予执行权限；
4. 自动注册并启用 `what-im-doing.service` 与 `what-im-doing.timer` 用户单元（支持无 root 权限执行）；
5. 脚本运行具备自测能力，安装完成立即上报一次心跳以验证通信。
