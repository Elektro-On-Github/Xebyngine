import os
import time
from pathlib import Path
from PIL import Image

# Directory configuration
RAW = "uploads/raw"
PROC = "uploads/processing"
AVIF_OUT = "uploads/avif"
FAIL = "uploads/failed"

for d in (RAW, PROC, AVIF_OUT, FAIL):
    os.makedirs(d, exist_ok=True)

# AVIF conversion settings
QUALITY = 50
SPEED = 4
SLEEP_IDLE = 0.5
STABILITY_DELAY = 1.0


def is_stable(path, delay=STABILITY_DELAY):
    """Verifica che il file sia completamente caricato (size stabile)."""
    if not os.path.exists(path):
        return False
    try:
        size1 = os.path.getsize(path)
        time.sleep(delay)
        if not os.path.exists(path):
            return False
        size2 = os.path.getsize(path)
        return size1 == size2
    except (OSError, FileNotFoundError):
        return False


def process_one():
    """Processa un file da uploads/raw/: converte in AVIF."""
    files = sorted(os.listdir(RAW))
    if not files:
        return False

    name = files[0]
    raw_path = os.path.join(RAW, name)

    # Verifica che il file esista PRIMA di is_stable()
    if not os.path.exists(raw_path):
        print(f"[SKIP] {name}: file non trovato (in transito?)")
        return True
    
    if not is_stable(raw_path):
        print(f"[SKIP] {name}: upload in corso")
        return True
    
    # Prepara path di processing
    proc_path = os.path.join(PROC, name)
    out_name = Path(name).stem + ".avif"
    out_path = os.path.join(AVIF_OUT, out_name)
    fail_path = os.path.join(FAIL, name)

    try:
        # Sposta in processing
        os.rename(raw_path, proc_path)
        
        # Converti in AVIF
        img = Image.open(proc_path).convert("RGB")
        img.save(out_path, format="AVIF", quality=QUALITY, speed=SPEED)
        
        # Pulisci
        os.remove(proc_path)
        print(f"[OK] {name} → {out_name}")
        
    except Exception as e:
        print(f"[FAIL] {name}: {e}")
        if os.path.exists(proc_path):
            os.rename(proc_path, fail_path)

    return True


if __name__ == "__main__":
    print("AVIF batch worker started")
    while True:
        if not process_one():
            time.sleep(SLEEP_IDLE)
