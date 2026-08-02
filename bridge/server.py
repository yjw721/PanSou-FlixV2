"""零依赖 HTTP 服务：把 pansou-flix 前端 与 本地 AList / PotPlayer 接通。

运行：python run.py  （默认 http://127.0.0.1:8787）
前端在 src/lib/bridge.js 中以 BRIDGE_BASE 指向它（默认同机 8787）。
"""
import sys
import os
import json
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import store
from alist import login as alist_login, ensure_token, get_file, list_storages
from providers import get_provider, parse_share, REGISTRY
from potplayer import launch as potplayer_launch

PORT = 8787


def _mask(s, n=6):
    if not s or len(s) <= n:
        return "***"
    return s[:n] + "***" + s[-2:]


def _json(handler, obj, code=200):
    body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
    handler.send_response(code)
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type")
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def _read_body(handler):
    length = int(handler.headers.get("Content-Length", "0") or "0")
    if not length:
        return {}
    raw = handler.rfile.read(length)
    try:
        return json.loads(raw.decode("utf-8"))
    except Exception:
        return {}


def _accounts_public():
    out = []
    for a in store.list_accounts():
        creds = a.get("creds", {})
        masked = {k: (_mask(v) if isinstance(v, str) else v) for k, v in creds.items()}
        b = dict(a)
        b["creds"] = masked
        out.append(b)
    return out


# ---------------- 路由处理 ----------------
def handle_route(method, path, body):
    # AList
    if method == "POST" and path == "/api/alist/configure":
        a = store.set_alist(body.get("base_url", ""), body.get("username", ""),
                            body.get("password", ""))
        try:
            alist_login()
            a["token_ok"] = True
        except Exception as e:
            a["token_ok"] = False
            a["login_error"] = str(e)
        return a

    if method == "GET" and path == "/api/alist/status":
        cfg = store.get_alist()
        ok = bool(cfg.get("base_url"))
        token_ok = False
        try:
            ensure_token()
            token_ok = True
        except Exception:
            token_ok = False
        return {"configured": ok, "base_url": cfg.get("base_url"),
                "token_ok": token_ok, "username": cfg.get("username")}

    # PotPlayer 路径
    if method == "POST" and path == "/api/potplayer/path":
        store.set_potplayer_path(body.get("path", ""))
        return {"path": store.get_potplayer_path()}
    if method == "GET" and path == "/api/potplayer/path":
        return {"path": store.get_potplayer_path()}

    # 账号
    if method == "GET" and path == "/api/accounts":
        return {"accounts": _accounts_public(), "supported": [
            {"id": p.provider_id, "name": p.display_name,
             "supports_qr": p.supports_qr,
             "paste_fields": p.paste_fields} for p in REGISTRY.values()
        ]}

    if method == "POST" and path == "/api/accounts":
        pid = body.get("provider")
        get_provider(pid)  # 校验
        acc = store.add_account(pid, body.get("name", ""), body.get("mount_path", f"/{pid}"),
                                body.get("creds", {}))
        return {"account": acc}

    m = re.match(r"^/api/accounts/([\w-]+)$", path)
    if method == "DELETE" and m:
        removed = store.remove_account(m.group(1))
        return {"removed": removed}

    # 二维码登录
    if method == "POST" and path == "/api/accounts/qr/start":
        pid = body.get("provider")
        p = get_provider(pid)
        if not p.supports_qr:
            return {"error": "该网盘暂未接入二维码登录，请用粘贴凭据"}, 400
        info = p.login_qr()
        return info

    if method == "POST" and path == "/api/accounts/qr/poll":
        pid = body.get("provider")
        p = get_provider(pid)
        creds = p.poll_login(body.get("poll"))
        if creds is None:
            return {"pending": True}
        acc = store.add_account(pid, body.get("name", p.display_name),
                                body.get("mount_path", f"/{pid}"), creds)
        return {"account": acc, "creds": creds}

    # 解析可播放直链
    if method == "POST" and path == "/api/play/resolve":
        return _resolve_play(body)

    # 拉起 PotPlayer
    if method == "POST" and path == "/api/potplayer/play":
        try:
            r = potplayer_launch(body.get("url", ""), store.get_potplayer_path())
            return r
        except Exception as e:
            return {"error": str(e)}, 400

    return {"error": "not found"}, 404


def _resolve_play(body):
    pid = body.get("provider")
    url = body.get("url", "")
    pwd = body.get("pwd", "")
    p = get_provider(pid)
    share_id = parse_share(pid, url)
    if not share_id:
        return {"error": f"无法从链接解析分享ID：{url}"}, 400
    acc = store.get_account(pid)
    if not acc:
        return {"error": f"请先在账号面板登录 {p.display_name}"}, 400
    creds = acc.get("creds", {})
    mount_path = acc.get("mount_path") or f"/{pid}"
    try:
        if p.mount_kind == "share":
            root = f"/share-{share_id}"
            p.ensure_mounted(creds, share_id, pwd, root)
        else:
            root = mount_path
            p.ensure_mounted(creds, share_id, pwd, root)
        alist_path = p.resolve_play_path(share_id, pwd, creds, root)
        info = get_file(alist_path)
        return {"provider": pid, "alist_path": alist_path,
                "raw_url": info["raw_url"], "webdav_url": info["webdav_url"],
                "name": info["name"]}
    except Exception as e:
        return {"error": f"解析播放直链失败：{e}"}, 500


class Handler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        self._handle()

    def do_POST(self):
        self._handle()

    def do_DELETE(self):
        self._handle()

    def _handle(self):
        parsed = urlparse(self.path)
        path = parsed.path
        body = _read_body(self) if self.command != "OPTIONS" else {}
        try:
            res = handle_route(self.command, path, body)
            if isinstance(res, tuple):
                resp, code = res
            else:
                resp, code = res, 200
        except Exception as e:
            resp, code = {"error": str(e)}, 500
        _json(self, resp, code)

    def log_message(self, *a):
        pass  # 静默


def main():
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"[bridge] 监听 http://127.0.0.1:{PORT}  (Ctrl+C 退出)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.shutdown()


if __name__ == "__main__":
    main()
