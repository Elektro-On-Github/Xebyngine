import os
import time
from PIL import Image

RAW = "uploads/raw"
PROC = "uploads/processing"
OUT = "uploads/avif"
FAIL = "uploads/failed"

for d in (RAW, PROC, OUT, FAIL):
    os.makedirs(d, exist_ok=True)

QUALITY = 50
SPEED = 4
SLEEP_IDLE = 0.5

def process_one():
    files = sorted(os.listdir(RAW))
    if not files:
        return False

    name = files[0]
    raw = os.path.join(RAW, name)
    proc = os.path.join(PROC, name)
    out = os.path.join(OUT, os.path.splitext(name)[0] + ".avif")

    try:
        os.rename(raw, proc)  # lock atomico

        img = Image.open(proc).convert("RGB")
        img.save(out, format="AVIF", quality=QUALITY, speed=SPEED)

        os.remove(proc)
        print(f"[OK] {name}")

    except Exception as e:
        os.rename(proc, os.path.join(FAIL, name))
        print(f"[FAIL] {name}: {e}")

    return True

if __name__ == "__main__":
    print("AVIF batch worker avviato")

    while True:
        worked = process_one()
        if not worked:
            time.sleep(SLEEP_IDLE)
