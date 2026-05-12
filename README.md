# luci-app-advanced

<p align="center">
  <a href="https://openwrt.org"><img alt="OpenWrt" src="https://img.shields.io/badge/OpenWrt-%E2%89%A524.10-ff0000?logo=openwrt&logoColor=white"></a>
  <a href="https://github.com/sirpdboy/luci-app-advanced/releases"><img alt="GitHub release" src="https://img.shields.io/github/v/release/sirpdboy/luci-app-advanced"></a>
</p>

luci-app-advanced 是一个 OpenWrt LuCI 应用，提供多配置文件编辑功能，支持通过 Web 界面直接编辑系统配置文件。

## 功能特性

- **模板化选项卡配置**：通过 UCI 配置定义选项卡，自由增删改配置文件编辑项
- **多配置文件支持**：DNSMASQ、网络、无线、Hosts、防火墙、DHCP、DDNS、SmartDNS、OpenClash、Bypass、ARP绑定、家长控制、定时设置、网络唤醒、负载均衡等
- **大文本编辑**：默认 25 行编辑框，等宽字体，适合配置文件编辑
- **变更检测**：保存时自动比对文件内容，仅在变更时重启服务
- **动态排序**：通过 UCI `order` 选项控制选项卡显示顺序

## 架构

本项目采用新 LuCI JS-based 范式：

- **前端**：客户端 JavaScript 渲染（`htdocs/luci-static/resources/view/`）
- **菜单**：JSON 声明（`root/usr/share/luci/menu.d/`）
- **权限**：ACL JSON 独立配置（`root/usr/share/rpcd/acl.d/`）
- **配置**：UCI 模板化定义（`root/etc/config/advanced`）

## 选项卡配置

选项卡通过 UCI 配置文件 `/etc/config/advanced` 中的 `config tab` 段定义：

```uci
config tab 'example'
    option title '示例配置'           # 选项卡标题
    option description '说明文字'      # 选项卡描述
    option filepath '/etc/config/example'  # 配置文件路径
    option restart '/etc/init.d/example restart'  # 保存后执行的重启命令
    option rows '25'                  # 编辑框行数
    option order '100'                # 排序权重（越小越靠前）
```

### 添加新选项卡

复制一个现有的 `config tab` 块，修改对应参数即可，无需修改任何代码。

### 删除选项卡

删除对应的 `config tab` 块。

### 调整顺序

修改 `order` 值，数值越小排序越靠前。

## 手动构建

```bash
# 进入 OpenWrt SDK 目录
cd openwrt-sdk

# 克隆本仓库到 package 目录
git clone https://github.com/sirpdboy/luci-app-advanced.git package/luci-app-advanced

# 编译
make menuconfig  # 选择 LuCI -> Applications -> luci-app-advanced
make package/luci-app-advanced/compile V=s
```

## GitHub Actions

本项目配置了 GitHub Actions 自动构建：

- **触发条件**：push 到 main/master 分支，或手动触发 `workflow_dispatch`
- **构建架构**：x86_64、aarch64_generic
- **SDK 版本**：OpenWrt 24.10.4
- **产物**：`.ipk` 软件包（Actions artifacts 中下载）

## 授权

Apache-2.0

## 相关项目

- [luci-app-autotimeset](https://github.com/sirpdboy/luci-app-autotimeset) - 定时设置插件
- [luci-app-ddns-go](https://github.com/sirpdboy/luci-app-ddns-go) - DDNS动态域名
- [luci-app-advancedplus](https://github.com/sirpdboy/luci-app-advancedplus) - 进阶设置
