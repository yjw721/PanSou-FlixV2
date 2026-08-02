"""多网盘通用 Provider 框架。

每个网盘抽象为 NetdiskProvider，统一接口：
  - provider_id / display_name
  - driver            : AList 驱动名
  - mount_kind        : "share"  (挂载别人分享，免转存，如阿里云盘分享)
                        "own"    (挂载自己账号，播放他人分享需先转存，如夸克)
  - paste_fields      : 页面「粘贴凭据」表单字段定义
  - supports_qr       : 是否支持页面内二维码登录
  - login_qr()        : 拉取登录二维码（返回图片/文本 + poll token）
  - poll_login(tok)   : 轮询登录结果，返回 creds 或 None
  - build_addition(creds, mount_path, share) : 生成 AList create_storage 的 addition
  - ensure_mounted(creds, share, mount_path)  : 保证 AList 已挂载，返回根路径
  - resolve_play_path(share, creds, root)     : 返回待播放文件的 AList 路径

注意：夸克二维码/转存 API 与阿里 token 工具均依赖各网盘未公开接口，下方为社区已知端点，
「需真机验证」，若字段变动请按返回错误微调。粘贴 cookie 路径不依赖这些，最稳。
"""
import json
import re
import urllib.request
import urllib.error

from alist import create_storage, list_files, ensure_token
import transfer


# ---------------- 分享链接解析 ----------------
_SHARE_RE = {
    "quark": r"pan\.quark\.cn/s/([A-Za-z0-9_-]+)",
    "aliyun": r"aliyundrive\.com/s/([A-Za-z0-9_-]+)",
    "115": r"115\.com/[?]password=&r=([A-Za-z0-9_-]+)",
    "baidu": r"pan\.baidu\.com/s/([A-Za-z0-9_-]+)",
    "tianyi": r"cloud\.189\.cn/(?:web|t|s)/([A-Za-z0-9_-]+)",
    "123": r"123pan\.com/s/([A-Za-z0-9_-]+)",
    "xunlei": r"pan\.xunlei\.com/s/([A-Za-z0-9_-]+)",
}


def parse_share(provider, url):
    """从分享链接提取分享ID。"""
    pat = _SHARE_RE.get(provider)
    if not pat:
        return None
    m = re.search(pat, url or "")
    return m.group(1) if m else None


def _http_post_json(api_url, payload, headers=None, timeout=20):
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(api_url, data=data, method="POST")
    req.add_header("Content-Type", "application/json")
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return {"__error__": f"{e.code}: {e.read().decode('utf-8','ignore')[:200]}"}
    except urllib.error.URLError as e:
        return {"__error__": str(e.reason)}


class NetdiskProvider:
    provider_id = ""
    display_name = ""
    driver = ""
    mount_kind = "own"
    supports_qr = False
    paste_fields = []  # [{"key","label","placeholder","secret"}]

    def login_qr(self):
        raise NotImplementedError("该网盘暂未接入二维码登录，请用「粘贴凭据」")

    def poll_login(self, token):
        return None

    def build_addition(self, creds, mount_path, share_id, pwd):
        raise NotImplementedError

    def ensure_mounted(self, creds, share_id, pwd, mount_path):
        # 默认：把分享挂成一个临时存储
        addition = self.build_addition(creds, mount_path, share_id, pwd)
        try:
            create_storage(self.driver, mount_path, addition)
        except RuntimeError as e:
            if "exist" not in str(e).lower():
                # 已存在则忽略，其他抛出
                if "already" not in str(e).lower() and "存在" not in str(e):
                    raise
        return mount_path

    def resolve_play_path(self, share_id, pwd, creds, root):
        # 在挂载根下列出文件，挑体积最大的视频
        items = list_files(root)
        videos = [i for i in items if (i.get("type") == 2 or _is_video(i.get("name", "")))]
        if not videos:
            # 可能是文件夹，取第一个文件夹深入一层
            folders = [i for i in items if i.get("type") == 1]
            if folders:
                items = list_files(f"{root}/{folders[0]['name']}")
                videos = [i for i in items if (i.get("type") == 2 or _is_video(i.get("name", "")))]
        if not videos:
            raise RuntimeError(f"在 {root} 下未找到可播放视频文件")
        videos.sort(key=lambda v: v.get("size", 0), reverse=True)
        pick = videos[0]
        return f"{root}/{pick['name']}" if root.endswith("/") else f"{root}/{pick['name']}"


def _is_video(name):
    return bool(re.search(r"\.(mkv|mp4|ts|avi|mov|m2ts|webm|iso|rmvb|flv)$", (name or "").lower()))


# ---------------- 夸克 ----------------
class QuarkProvider(NetdiskProvider):
    provider_id = "quark"
    display_name = "夸克网盘"
    driver = "Quark"
    mount_kind = "own"
    supports_qr = True
    paste_fields = [
        {"key": "cookie", "label": "Cookie", "placeholder": "从 pan.quark.cn 复制的完整 cookie", "secret": True},
    ]

    def login_qr(self):
        # 拉取夸克登录二维码；返回 {qr, poll}。端点需真机验证，URL 必须为 ASCII。
        api = "https://account.quark.cn/account/accountLoginQRCode"
        resp = _http_post_json(api, {}, timeout=15)
        if resp.get("__error__"):
            raise RuntimeError(f"夸克二维码获取失败：{resp['__error__']}")
        data = resp.get("data", {})
        return {"qr": data.get("qrcode") or data.get("url"), "poll": data.get("qrcode_id")}

    def poll_login(self, qrcode_id):
        api = f"https://account.quark.cn/account/accountLoginQRCodePoll?qrcode_id={qrcode_id}"
        resp = _http_post_json(api, {}, timeout=15)
        if resp.get("__error__"):
            return None
        if (resp.get("data") or {}).get("status") == 2:  # 2=已扫描确认
            return {"cookie": resp["data"].get("cookie")}
        return None

    def build_addition(self, creds, mount_path, share_id, pwd):
        return {"cookie": creds.get("cookie", ""), "root_folder_id": "0"}

    def ensure_mounted(self, creds, share_id, pwd, mount_path):
        # 用户自己的夸克盘：仅挂载一次（storage 已存在则跳过）
        try:
            create_storage(self.driver, mount_path, self.build_addition(creds, mount_path, share_id, pwd))
        except RuntimeError as e:
            msg = str(e)
            if "存在" in msg or "already" in msg.lower() or "exist" in msg.lower():
                pass  # 已挂载，忽略
            else:
                raise
        return mount_path

    def resolve_play_path(self, share_id, pwd, creds, root):
        # 第一步：把分享转存进 root 下的 /PanSou/<share_id>
        dest = transfer.quark_save_share(creds.get("cookie", ""), share_id, pwd, root)
        # dest 为转存后文件所在的 AList 路径
        return super().resolve_play_path(share_id, pwd, creds, dest)


# ---------------- 阿里云盘（分享驱动，免转存） ----------------
class AliyunProvider(NetdiskProvider):
    provider_id = "aliyun"
    display_name = "阿里云盘"
    driver = "AliyundriveShare"
    mount_kind = "share"
    supports_qr = True
    paste_fields = [
        {"key": "refresh_token", "label": "Refresh Token",
         "placeholder": "用阿里云盘APP扫码得到的 refresh_token", "secret": True},
    ]

    def login_qr(self):
        # 阿里获取 token 的二维码由 alistgo 工具提供，这里返回其二维码获取入口说明。
        # 真机可用 https://alistgo.com/tool/aliyundrive/request.html 扫码；页面内后续接入。
        return {"qr": "https://alistgo.com/tool/aliyundrive/request.html",
                "poll": "alistgo", "note": "打开此页用阿里云盘APP扫码，将得到的 refresh_token 粘贴到「粘贴凭据」"}

    def poll_login(self, token):
        return None  # 阿里走粘贴 token，不轮询

    def build_addition(self, creds, mount_path, share_id, pwd):
        return {
            "share_id": share_id,
            "share_pwd": pwd or "",
            "refresh_token": creds.get("refresh_token", ""),
        }

    def ensure_mounted(self, creds, share_id, pwd, mount_path):
        # 每个分享挂成一个独立存储（share 驱动只读、不占空间）
        try:
            create_storage(self.driver, mount_path, self.build_addition(creds, mount_path, share_id, pwd))
        except RuntimeError as e:
            msg = str(e)
            if "存在" in msg or "already" in msg.lower() or "exist" in msg.lower():
                pass
            else:
                raise
        return mount_path


REGISTRY = {p.provider_id: p for p in (QuarkProvider(), AliyunProvider())}


def get_provider(pid):
    p = REGISTRY.get(pid)
    if not p:
        raise RuntimeError(f"未支持的网盘：{pid}（已支持：{', '.join(REGISTRY)}）")
    return p
