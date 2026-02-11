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
STABILITY_DELAY = 1.0

def is_stable(path, delay=STABILITY_DELAY):
    if not os.path.exists(path):
        return False
    size1 = os.path.getsize(path)
    time.sleep(delay)
    size2 = os.path.getsize(path)
    return size1 == size2

def process_one():
    files = sorted(os.listdir(RAW))
    if not files:
        return False

    name = files[0]
    raw = os.path.join(RAW, name)
    
    if not is_stable(raw):
        print(f"[SKIP] {name}: upload in corso")
        return True
    
    proc = os.path.join(PROC, name)
    out = os.path.join(OUT, os.path.splitext(name)[0] + ".avif")
    fail = os.path.join(FAIL, name)

    try:
        os.rename(raw, proc)
        img = Image.open(proc).convert("RGB")
        img.save(out, format="AVIF", quality=QUALITY, speed=SPEED)
        os.remove(proc)
        print(f"[OK] {name}")
    except Exception as e:
        if os.path.exists(proc):
            os.rename(proc, fail)
        print(f"[FAIL] {name}: {e}")

    return True

if __name__ == "__main__":
    print("AVIF batch worker avviato")
    while True:
        if not process_one():
            time.sleep(SLEEP_IDLE)
