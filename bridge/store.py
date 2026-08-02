"""本地配置持久化：AList 连接信息 + 已登录的网盘账号。

数据存于 bridge/bridge_data.json（已加入 .gitignore，不入库）。
结构：
{
  "alist":   {"base_url": "http://127.0.0.1:5244", "username": "admin", "password": "***", "token": "..."},
  "potplayer_path": "C:\\Program Files\\PotPlayer\\PotPlayerMini64.exe",
  "accounts": [
    {"id": "quark-xxxx", "provider": "quark", "name": "我的夸克",
     "mount_path": "/quark", "creds": {"cookie": "..."}, "added_at": "..."}
  ]
}
"""
import json
import os
import threading
import time
import uuid

_DATA_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "bridge_data.json")
_lock = threading.Lock()
_cache = None


def _load():
    global _cache
    if _cache is None:
        if os.path.exists(_DATA_FILE):
            try:
                with open(_DATA_FILE, "r", encoding="utf-8") as f:
                    _cache = json.load(f)
            except Exception:
                _cache = {}
        else:
            _cache = {}
        _cache.setdefault("alist", {})
        _cache.setdefault("accounts", [])
        _cache.setdefault("potplayer_path", "")
    return _cache


def _save():
    with _lock:
        tmp = _DATA_FILE + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(_cache, f, ensure_ascii=False, indent=2)
        os.replace(tmp, _DATA_FILE)


# ---------- AList ----------
def get_alist():
    return dict(_load().get("alist", {}))


def set_alist(base_url, username, password, token=None):
    d = _load()
    d["alist"] = {
        "base_url": (base_url or "").rstrip("/"),
        "username": username,
        "password": password,
        "token": token or "",
    }
    _save()
    return d["alist"]


def set_alist_token(token):
    d = _load()
    d.setdefault("alist", {})["token"] = token or ""
    _save()


# ---------- PotPlayer ----------
def get_potplayer_path():
    return _load().get("potplayer_path", "")


def set_potplayer_path(p):
    d = _load()
    d["potplayer_path"] = p or ""
    _save()


# ---------- 账号 ----------
def list_accounts():
    return [dict(a) for a in _load().get("accounts", [])]


def get_account(provider):
    for a in _load().get("accounts", []):
        if a.get("provider") == provider:
            return dict(a)
    return None


def add_account(provider, name, mount_path, creds):
    d = _load()
    acc = {
        "id": f"{provider}-{uuid.uuid4().hex[:8]}",
        "provider": provider,
        "name": name or provider,
        "mount_path": mount_path,
        "creds": creds or {},
        "added_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
    }
    # 同 provider 视为更新（一个网盘只保留一份凭据）
    d["accounts"] = [a for a in d["accounts"] if a.get("provider") != provider]
    d["accounts"].append(acc)
    _save()
    return dict(acc)


def remove_account(provider):
    d = _load()
    before = len(d["accounts"])
    d["accounts"] = [a for a in d["accounts"] if a.get("provider") != provider]
    _save()
    return before != len(d["accounts"])
