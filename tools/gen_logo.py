# -*- coding: utf-8 -*-
"""生成 Logo 候选：透明底、1024×1024、多变体并行"""
import os, sys, json, time, urllib.request, urllib.error
import concurrent.futures as cf

HOST = "https://api.lk888.ai"
KEY = os.environ.get("PROVIDER_API_KEY", "").strip()
MODEL = "tt-image-2.6"
OUT = r"C:\Users\001\WorkBuddy\2026-11-05-21-07-50\venue-booking\web\public\img\logo"


def http_json(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(HOST + path, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    req.add_header("Authorization", "Bearer " + KEY)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return {"_http": e.code, "_body": e.read().decode()[:300]}


def gen(prompt, out_path, bg="transparent"):
    body = {
        "model": MODEL, "prompt": prompt, "n": 1,
        "size": "1024x1024", "version": "flare", "quality": "auto",
        "background": bg, "output_format": "png",
    }
    j = http_json("POST", "/v1/media/generate", body)
    d = j.get("data") or {}
    tid = d.get("task_id") or (d.get("task_ids") or [None])[0]
    if not tid:
        if bg == "transparent":
            return gen(prompt, out_path, bg="opaque")
        return False, "no_task:" + json.dumps(j)[:160]

    started = time.time()
    while time.time() - started < 420:
        time.sleep(4)
        st = http_json("GET", "/v1/media/status?task_id=" + str(tid))
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
            msg = str(st.get("error") or st.get("status"))
            if bg == "transparent" and ("透明" in msg or "transparent" in msg.lower() or "alpha" in msg.lower()):
                return gen(prompt, out_path, bg="opaque")
            return False, "state:" + msg[:120]
    return False, "timeout"


CONCEPTS = {
    "a_arch_court": (
        "Flat vector logo mark for a sports venue brand. A geometric stadium roof arch "
        "made of three clean curved bands, with a basketball court center circle nested under it. "
        "Blue to violet gradient (#3b6ef5 to #7f5cff). No text, no letters. "
        "Perfectly centered, generous padding, sharp vector edges, flat 2D, app icon style, transparent background."
    ),
    "b_c_truss": (
        "Minimal flat vector logo mark: an abstract letter C built from a curved stadium roof truss, "
        "geometric, single continuous thick stroke, deep blue #3b6ef5 with a violet accent, "
        "no other text, centered, transparent background, crisp edges, modern sports brand identity."
    ),
    "c_glyph_chang": (
        "Minimal geometric monogram logo on transparent background: the Chinese character 场 abstracted "
        "into court lines and a stadium roof, all strokes equal weight, flat deep blue, "
        "no other text, centered, vector, sharp, modern sports facility brand."
    ),
    "d_emblem": (
        "Flat vector emblem logo: three concentric arches suggesting stadium stands, "
        "a single court line crossing them diagonally, gradient blue violet, "
        "no text, transparent background, geometric, balanced, app icon, sharp vector."
    ),
}


def one(item):
    key, prompt = item
    out = os.path.join(OUT, key + ".png")
    ok, info = gen(prompt, out)
    return key, ok, info


if __name__ == "__main__":
    if not KEY:
        print("NO_KEY"); sys.exit(2)
    os.makedirs(OUT, exist_ok=True)
    only = sys.argv[1:] or list(CONCEPTS.keys())
    items = [(k, CONCEPTS[k]) for k in only]
    with cf.ThreadPoolExecutor(max_workers=4) as ex:
        for key, ok, info in ex.map(one, items):
            print(f"[{key}] {'OK' if ok else 'FAIL'} {info}", flush=True)
