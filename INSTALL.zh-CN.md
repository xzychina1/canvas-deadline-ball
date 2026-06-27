# 安装 Canvas Deadline Ball

[English](INSTALL.md) · **简体中文**

> 目前**仅支持 Windows**(这是个 Tauri 应用,以后可能扩到 macOS/Linux)。

## 下载

去 [**Releases 页面**](../../releases/latest) 拿最新版:

- **`…-setup.exe`** —— 安装版(推荐,~2 MB),装好应用 + 开始菜单快捷方式。
- **`…-portable.exe`** —— 绿色单文件(~9 MB),免安装,双击即用。

两个都行,拿不准就用安装版。

## "Windows 已保护你的电脑" —— 正常现象,这样运行就行

因为这是个免费的小型独立应用、**没做代码签名**(签名证书要花钱),第一次运行时 Windows SmartScreen 会弹一个蓝色提示:

> **Windows 已保护你的电脑**
> Microsoft Defender SmartScreen 阻止了无法识别的应用启动…

这对新的独立软件是**正常**的 —— 只是 Windows 还不认识这个发布者,**不代表有问题**。运行方法:

1. 点对话框里的 **更多信息**(那个小链接)。
2. 点出现的 **仍要运行** 按钮。

就这样 —— 只需做这一次。

> **想先确认安全?** 应用[完全开源](../../)(每一行都能看),你也可以把下载的 `.exe` 传到 [VirusTotal](https://www.virustotal.com/) 用 70+ 个杀毒引擎扫一遍。

## 杀软误报

全新、未签名的程序有时会被杀软的启发式规则**误报** —— 不是真检测到病毒,纯粹因为跑过它的人还少。真遇到了,上面的 VirusTotal 扫描通常会显示干净。如果被隔离了,可以手动允许/恢复,或改用绿色版 `.exe`。

## 卸载

- **安装版**:*设置 → 应用 → Canvas Deadline Ball → 卸载*(或用开始菜单里的卸载程序)。
- **绿色版**:直接删掉那个 `.exe`。

你保存的源/设置在 `%APPDATA%\com.canvasdeadlineball.app\`,想彻底清干净就把这个文件夹也删了。
