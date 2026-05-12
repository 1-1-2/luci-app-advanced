# Changelog

## [2.0.0] - 2026-05-12

### 重构
- 全面迁移至新 LuCI JS-based 范式，替代旧式 Lua CBI 架构
- 删除旧式 Lua 控制器、CBI 表单和视图模板
- 删除文件管理功能及相关资源
- 删除网络模式切换脚本（ipmode4/ipmode6/normalmode/nuc）

### 新增
- 模板化选项卡配置：通过 UCI `config tab` 定义选项卡，支持自由增删改
- 动态选项卡排序：通过 `order` 选项控制选项卡显示顺序
- JavaScript 客户端渲染视图，支持大文本编辑（默认 25 行）
- 国际化支持（i18n）：翻译模板和简体中文翻译
- GitHub Actions 自动构建工作流（x86_64 / aarch64_generic）

### 变更
- Makefile 迁移至标准 `luci.mk` 模板
- 菜单声明迁移至 `menu.d` JSON 配置
- 权限控制迁移至 `acl.d` JSON 配置
- UCI 配置扩展为模板化选项卡定义格式

## [1.20] - 2022-02-18

### 功能
- 高级设置支持多配置文件编辑
- 文件管理器支持上传、删除、重命名、安装
- 网络模式一键切换（IPv4/IPv6/默认）
