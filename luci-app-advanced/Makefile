# SPDX-License-Identifier: Apache-2.0

include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-advanced
PKG_VERSION:=2.0.0
PKG_RELEASE:=1

LUCI_TITLE:=LuCI support for Advanced Settings & File Assistant
LUCI_DEPENDS:=+luci-base +rpcd +rpcd-mod-file +apk
LUCI_PKGARCH:=all

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature