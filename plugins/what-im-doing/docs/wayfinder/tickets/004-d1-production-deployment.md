# [Grilling] 确定生产环境 D1 数据库实例与管理端 Cloudflare Access 隔离策略

- **Parent Map**: [../map.md](../map.md)
- **Type**: `wayfinder:grilling` (HITL)
- **Status**: Closed
- **Resolution**: 生产环境 D1 数据库注入与管理端隔离策略已确立并代码落地。采用 Cloudflare Access 邮箱 OTP 作为第一道零信任网关，并在 `worker.js` / `admin-ui.js` 中内置 `ADMIN_KEY` 双模自动鉴权机制；`wrangler.toml` 及全套部署清单在 `SERVERLESS_FLEET_DEPLOYMENT_SPEC.md` 中脱敏规范化；通过 28 项自动化测试。

## Question

在真实将 Worker 部署上线至 Cloudflare 边缘节点时，D1 数据库与管理后台 `/admin` 的访问控制应采用何种防护策略，如何平衡管理员录入设备的便捷性与接口的安全性？

## Acceptance Criteria

1. 确认 Cloudflare 账号下 D1 数据库创建与绑定变量注入方式；
2. 确认 `/admin` 页面是否通过 Cloudflare Zero Trust (Access) 进行免密邮箱 OTP 认证，或者是否采用静态环境变量 `ADMIN_KEY` 快速兜底；
3. 形成可执行的 `wrangler.toml` 生产部署清单。
