"""AList 客户端（标准库 urllib 实现，零依赖）。

关键点：
- 管理后台 API 需要鉴权：先 POST /api/auth/login 拿 token，后续请求带 Authorization: Bearer <token>。
- 动态挂载网盘：POST /api/admin/storage/create（driver / mount_path / addition / order）。
- 取直链播放：POST /api/fs/get 返回 raw_url（网盘 CDN 签名直链，即点即生成，无需 AList 鉴权，
  直接喂给 PotPlayer 最省事）；同时提供 WebDAV 地址 http://<host>/dav/<path> 作为备选。
"""
import json
import urllib.request
import urllib.error

from store import get_alist, set_alist_token


def _url(path):
    base = (get_alist().get("base_url") or "").rstrip("/")
    if not base:
        raise RuntimeError("AList 未配置：请先在账号面板填写 AList 地址与管理员账号")
    return base + path


def _post(path, payload, token=None, anon=False):
    url = _url(path)
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, method="POST")
    req.add_header("Content-Type", "application/json")
    if not anon:
        t = token or get_alist().get("token")
        if t:
            req.add_header("Authorization", f"Bearer {t}")
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "ignore")
        raise RuntimeError(f"AList {path} -> {e.code}: {body[:300]}")
    except urllib.error.URLError as e:
        raise RuntimeError(f"无法连接 AList（{url}）：{e.reason}")


def _get(path, token=None):
    url = _url(path)
    req = urllib.request.Request(url, method="GET")
    t = token or get_alist().get("token")
    if t:
        req.add_header("Authorization", f"Bearer {t}")
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "ignore")
        raise RuntimeError(f"AList {path} -> {e.code}: {body[:300]}")
    except urllib.error.URLError as e:
        raise RuntimeError(f"无法连接 AList（{url}）：{e.reason}")


def login():
    """用管理员账号登录，刷新并持久化 token。"""
    a = get_alist()
    if not a.get("username") or not a.get("password"):
        raise RuntimeError("AList 账号未配置")
    resp = _post("/api/auth/login",
                 {"username": a["username"], "password": a["password"]}, anon=True)
    token = (resp.get("data") or {}).get("token")
    if not token:
        raise RuntimeError(f"AList 登录失败：{resp}")
    set_alist_token(token)
    return token


def ensure_token():
    t = get_alist().get("token")
    if t:
        return t
    return login()


def create_storage(driver, mount_path, addition, order=0):
    """动态挂载一个网盘。addition 为驱动专属参数（dict）。"""
    token = ensure_token()
    payload = {
        "driver": driver,
        "mount_path": mount_path,
        "addition": addition,
        "order": order,
        "cache_expiration": 30,
        "webdav_policy": "302",
        "web_proxy": False,
    }
    return _post("/api/admin/storage/create", payload, token=token)


def list_storages():
    token = ensure_token()
    return _get("/api/admin/storage/list", token=token).get("data", {}).get("content", [])


def list_files(path):
    """列出 AList 某路径下文件。path 以 / 开头。"""
    token = ensure_token()
    resp = _post("/api/fs/list", {"path": path, "per_page": 100, "page": 1}, token=token)
    return (resp.get("data") or {}).get("content", [])


def get_file(path):
    """解析某文件的直链。返回 {raw_url, webdav_url, name, size}。"""
    token = ensure_token()
    resp = _post("/api/fs/get", {"path": path}, token=token)
    data = resp.get("data") or {}
    base = (get_alist().get("base_url") or "").rstrip("/")
    webdav = f"{base}/dav{path}" if path.startswith("/") else f"{base}/dav/{path}"
    return {
        "raw_url": data.get("raw_url") or data.get("url") or "",
        "webdav_url": webdav,
        "name": data.get("name", ""),
        "size": data.get("size", 0),
    }
