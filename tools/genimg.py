# -*- coding: utf-8 -*-
"""调用 lk888 图像生成：提交 → 轮询 → 下载"""
import json, os, sys, time, urllib.request, urllib.error

HOST = "https://api.lk888.ai"
KEY = os.environ.get("PROVIDER_API_KEY", "").strip()
MODEL = "tt-image-2.6"


def post(path, body):
    req = urllib.request.Request(HOST + path, data=json.dumps(body).encode(), method="POST")
    req.add_header("Content-Type", "application/json")
    req.add_header("Authorization", "Bearer " + KEY)
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode())


def get(path):
    req = urllib.request.Request(HOST + path, method="GET")
    req.add_header("Authorization", "Bearer " + KEY)
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode())


def gen(prompt, out_path, size="1536x1024"):
    body = {
        "model": MODEL, "prompt": prompt, "n": 1,
        "size": size, "version": "flare", "quality": "auto",
        "background": "opaque", "output_format": "png",
    }
    j = post("/v1/media/generate", body)
    d = j.get("data") or {}
    tid = d.get("task_id") or (d.get("task_ids") or [None])[0]
    tid = str(tid) if tid is not None else None
    if not tid:
        return False, "no_task:" + json.dumps(j)[:200]

    started = time.time()
    while time.time() - started < 420:
        time.sleep(4)
        try:
            st = get("/v1/media/status?task_id=" + str(tid))
        except Exception as e:
            continue
        if st.get("is_final"):
            if st.get("state") == "success":
                url = st.get("result_url") or (st.get("result_urls") or [None])[0]
                if not url:
                    return False, "no_url"
                with urllib.request.urlopen(url, timeout=120) as r:
                    data = r.read()
                os.makedirs(os.path.dirname(out_path), exist_ok=True)
                open(out_path, "wb").write(data)
                return True, f"{len(data)/1024:.0f} KB"
            return False, "state:" + str(st.get("error") or st.get("status"))[:120]
    return False, "timeout"


if __name__ == "__main__":
    if not KEY:
        print("NO_KEY")
        sys.exit(2)
    prompt = sys.argv[1]
    out = sys.argv[2]
    ok, info = gen(prompt, out)
    print(("OK " if ok else "FAIL ") + info)
