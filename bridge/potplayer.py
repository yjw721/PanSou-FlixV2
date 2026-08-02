"""本地拉起 PotPlayer 播放指定 URL。

浏览器无法直接启动本地程序，故由本后端（运行在用户本机）调用 PotPlayer。
路径自动探测常见安装位置；也可在账号面板里手动指定。
"""
import os
import subprocess
import shutil

_CANDIDATES = [
    r"C:\Program Files\PotPlayer\PotPlayerMini64.exe",
    r"C:\Program Files (x86)\PotPlayer\PotPlayerMini64.exe",
    r"D:\Program Files\PotPlayer\PotPlayerMini64.exe",
    r"C:\Program Files\PotPlayer\PotPlayerMini.exe",
]


def _detect():
    for p in _CANDIDATES:
        if os.path.exists(p):
            return p
    # 尝试 PATH
    found = shutil.which("PotPlayerMini64.exe") or shutil.which("PotPlayerMini.exe")
    return found or ""


def launch(url, exe_path=""):
    exe = exe_path or _detect()
    if not exe or not os.path.exists(exe):
        raise RuntimeError(
            "未找到 PotPlayer，请在账号面板手动填写 PotPlayer 可执行文件路径"
        )
    # PotPlayer 支持直接以 URL 作为参数打开网络流
    subprocess.Popen([exe, url], shell=False)
    return {"exe": exe, "url": url}
