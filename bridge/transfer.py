"""网盘转存：把别人的分享存进「自己已挂载」的网盘，从而在 AList 里可播放。

当前实现夸克网盘的转存（需真机验证，端点为社区已知形态）。
阿里云盘分享驱动走 AList 免转存，不经过这里。
"""
import json
import urllib.request
import urllib.error

_QUARK_API = "https://drive.quark.cn/1/clouddrive"


def _post(api_url, payload, cookie, timeout=20):
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(api_url, data=data, method="POST")
    req.add_header("Content-Type", "application/json")
    if cookie:
        req.add_header("Cookie", cookie)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return {"__error__": f"{e.code}: {e.read().decode('utf-8','ignore')[:200]}"}
    except urllib.error.URLError as e:
        return {"__error__": str(e.reason)}


def quark_find_folder(cookie, name, pdir="0"):
    """在 pdir 下查找名为 name 的文件夹，返回 fid 或 None。"""
    api = f"{_QUARK_API}/file/getlist"
    resp = _post(api, {"pdir_fid": pdir, "_page": "1", "_size": "50", "_sort": ""}, cookie)
    if resp.get("__error__"):
        raise RuntimeError(f"夸克列目录失败：{resp['__error__']}")
    items = (resp.get("data") or {}).get("list", [])
    for it in items:
        if it.get("file_name") == name and it.get("dir") == 1:
            return it.get("fid")
    return None


def quark_mkdir(cookie, name, pdir="0"):
    api = f"{_QUARK_API}/file?pr=ucpro&rid={_rid()}"
    resp = _post(api, {"pdir_fid": pdir, "file_name": name, "dir": 1}, cookie)
    if resp.get("__error__"):
        raise RuntimeError(f"夸克建文件夹失败：{resp['__error__']}")
    return (resp.get("data") or {}).get("fid")


def quark_share_detail(cookie, share_id, pwd):
    api = f"{_QUARK_API}/share/sharepage/detail"
    resp = _post(api, {"pwd_id": share_id, "pwd": pwd or "", "page": 1, "size": 100, "scene": "link"}, cookie)
    if resp.get("__error__"):
        raise RuntimeError(f"夸克分享解析失败：{resp['__error__']}")
    return resp.get("data", {})


def quark_save(cookie, share_id, pwd, fid_list, fid_token_list, to_pdir_fid):
    api = f"{_QUARK_API}/share/sharepage/save"
    resp = _post(api, {
        "fid_list": fid_list,
        "fid_token_list": fid_token_list,
        "to_pdir_fid": to_pdir_fid,
        "pwd_id": share_id,
        "pdir_fid": "0",
        "scene": "link",
    }, cookie)
    if resp.get("__error__"):
        raise RuntimeError(f"夸克转存失败：{resp['__error__']}")
    return resp.get("data", {})


def quark_save_share(cookie, share_id, pwd, root_alist_path):
    """把夸克分享转存进用户夸克盘的 PanSou 文件夹，返回该文件夹的 AList 路径。"""
    # 1. 找到/创建 PanSou 文件夹
    fid = quark_find_folder(cookie, "PanSou")
    if not fid:
        fid = quark_mkdir(cookie, "PanSou")
    # 2. 取分享内文件清单
    detail = quark_share_detail(cookie, share_id, pwd)
    items = detail.get("list", []) or []
    if not items:
        # 分享本身是一个文件夹，取其子文件
        items = detail.get("file_list", {}).get("list", []) or []
    if not items:
        raise RuntimeError("夸克分享内未解析到文件")
    fid_list = [it["fid"] for it in items if it.get("fid")]
    fid_token_list = [it.get("fid_token", "") for it in items]
    # 3. 转存
    quark_save(cookie, share_id, pwd, fid_list, fid_token_list, fid)
    base = root_alist_path.rstrip("/")
    return f"{base}/PanSou"


def _rid():
    import uuid
    return uuid.uuid4().hex
