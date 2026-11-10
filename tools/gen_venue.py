# -*- coding: utf-8 -*-
"""批量生成一座真实体育馆的一致图集

空间架构（同一栋建筑，统一材质语言：玻璃幕墙 + 清水混凝土 + 木色格栅）：
  1 exterior   黄昏外景，台阶、人群
  2 entrance   入口大厅，闸机、指示牌
  3 court      主馆篮球场，木地板磨损、线痕
  4 stands     看台，座椅、横幅、散落水瓶
  5 badminton  羽毛球场，地胶、侧光
  6 lounge     休息区/咖啡吧，桌面杯子和书
  7 locker     更衣室，铁皮柜、长凳、拖鞋
  8 night      夜间外景，灯光透出

一致性靠：同一段"建筑与摄影"前缀 + 同一座城市 + 同一天气。
生活痕迹靠：明确写"磨损、水渍、散落物品、使用中"。
"""
import os
import sys
import concurrent.futures as cf

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from genimg import gen  # noqa: E402

OUT = r"C:\Users\001\WorkBuddy\2026-11-05-21-07-50\venue-booking\web\public\img\venue"

# 统一前缀：决定"是不是同一座场馆"
BASE = (
    "纪实建筑摄影，中国南宁，一栋 2023 年建成的室内体育馆，"
    "玻璃幕墙 + 清水混凝土 + 木色竖向格栅，钢结构屋盖，"
    "阴天转黄昏的自然光，柯达 Portra 胶片颗粒，35mm 定焦，真实感，非渲染图，"
)

SHOTS = {
    "exterior": "建筑外景，主入口大台阶，三五个人坐在台阶上聊天，地面有雨水痕迹和落叶，玻璃幕墙映出街道",
    "entrance": "室内入口大厅，两道闸机，头顶悬挂指路牌，地面浅灰水磨石有鞋印，远处能看到场馆内灯光",
    "court": "主馆篮球场，枫木地板有明显使用痕迹和球鞋擦痕，场地线略褪色，篮架下方护垫磨损，边线外堆着几颗球",
    "stands": "看台视角看向球场，成排深蓝座椅，前排椅背挂着一件外套，台阶上放着矿泉水瓶和毛巾",
    "badminton": "羽毛球馆，绿色地胶有拖痕，四片场地挂着球网，侧窗透进斜光，场边放着球拍包",
    "tennis": "室内网球场，蓝色硬地球场，白色场地线略有磨损，中间拉着球网，场边有一筐训练球和一张裁判椅，高侧窗投进条状光斑",
    "lounge": "自习室内部，成排的浅木色长桌和带靠背的椅子，每张桌上有一盏鹅颈台灯和摊开的书，靠墙是通到顶的书架，窗户有百叶帘，桌面有橡皮屑和便利贴",
    "locker": "更衣室，灰色铁皮储物柜有掉漆和贴纸，中间木质长凳，地上放着运动鞋和毛巾",
    "night": "夜间外景，场馆灯光从玻璃幕墙透出，门口路灯亮起，地面湿润反光，远处有零星行人",
}

SIZES = {
    "exterior": "1536x1024", "entrance": "1536x1024", "court": "1536x1024", "stands": "1536x1024",
    "badminton": "1536x1024", "tennis": "1536x1024", "lounge": "1536x1024", "locker": "1536x1024", "night": "1536x1024",
}


def one(key):
    prompt = BASE + SHOTS[key]
    out = os.path.join(OUT, key + ".png")
    if not os.environ.get("FORCE") and os.path.exists(out) and os.path.getsize(out) > 20000:
        return key, True, "已存在，跳过"
    ok, info = gen(prompt, out, SIZES.get(key, "1536x1024"))
    return key, ok, info


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    only = sys.argv[1:] or list(SHOTS.keys())
    results = []
    with cf.ThreadPoolExecutor(max_workers=3) as ex:
        for key, ok, info in ex.map(one, only):
            print(f"[{key}] {'OK' if ok else 'FAIL'} {info}", flush=True)
            results.append(ok)
    print(f"\n完成 {sum(results)}/{len(results)}")
