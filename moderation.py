import hashlib, shutil, sys, os
from pathlib import Path
from PIL import Image
import imagehash

os.environ["CUDA_VISIBLE_DEVICES"]   = ""          # TF: niente GPU
os.environ["TF_CPP_MIN_LOG_LEVEL"]   = "3"         # TF: zittisci i warning
os.environ["TF_ENABLE_ONEDNN_OPTS"]  = "0"         # TF: no oneDNN noise
os.environ["YOLO_VERBOSE"]           = "false"      # YOLO: silenzioso

INPUT_PATH      = "/home/elektrowindows/nsfwimgs"   # file o cartella

ALLOW_DIR       = "./Allow"
REVIEW_DIR      = "./Review"
BAN_DIR         = "./Ban"
HASH_FILE       = "hashes.txt"

IMG_SIZE        = (512, 512)
EXTENSIONS      = {".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".tiff", ".avif"}

# NudeNet v3
NN_SEVERE_TH    = 0.50
NN_BORDER_TH    = 0.30

# OpenNSFW2
NSFW_HIGH_TH    = 0.45
NSFW_REVIEW_TH  = 0.30

# ResNet50 violence
VIOLENCE_TH     = 0.60
VIOLENCE_MODEL  = None          # None = heuristic ImageNet, oppure "path.pth"

# YOLOv8
YOLO_MODEL      = "yolov8m.pt"
YOLO_CONF       = 0.50
YOLO_TARGETS    = {
    "knife", "scissors",
    "gun", "pistol", "rifle", "handgun", "weapon",
    "syringe", "pills", "drugs", "marijuana",
}

# NudeNet labels
NN_SEVERE_LABELS = {
    "FEMALE_GENITALIA_EXPOSED", "MALE_GENITALIA_EXPOSED",
    "FEMALE_BREAST_EXPOSED", "ANUS_EXPOSED",
}
NN_BORDER_LABELS = {
    "BUTTOCKS_EXPOSED", "BELLY_EXPOSED",
    "FEMALE_BREAST_COVERED", "MALE_BREAST_EXPOSED", "ARMPITS_EXPOSED",
}

# ResNet50 ImageNet weapon indices (fallback heuristic)
WEAPON_IDX = [413, 734, 764, 499, 596, 583]

# ╚════════════════════════════════════════════════════════════╝


# ─── Hash banned ────────────────────────────────────────────

def load_hashes():
    h = set()
    if os.path.exists(HASH_FILE):
        with open(HASH_FILE) as f:
            for line in f:
                line = line.strip()
                if line:
                    h.add(line)
    return h

def save_hashes(hset):
    with open(HASH_FILE, "w") as f:
        for h in sorted(hset):
            f.write(h + "\n")

def compute_phash(img):
    return str(imagehash.phash(img, hash_size=16))


# ─── Caricamento modelli (lazy, una volta sola) ────────────

_models = {}

def get_nudenet():
    if "nn" not in _models:
        from nudenet import NudeDetector
        print("[*] Loading NudeNet v3...")
        _models["nn"] = NudeDetector()
    return _models["nn"]

def get_nsfw():
    if "nsfw" not in _models:
        print("[*] Loading OpenNSFW2...")
        import opennsfw2
        _models["nsfw"] = opennsfw2
    return _models["nsfw"]

def get_violence():
    if "viol" not in _models:
        import torch
        from torchvision.models import resnet50, ResNet50_Weights
        import torchvision.transforms as T

        if VIOLENCE_MODEL:
            print(f"[*] Loading custom violence model: {VIOLENCE_MODEL}")
            model = resnet50()
            model.fc = torch.nn.Linear(model.fc.in_features, 2)
            model.load_state_dict(torch.load(VIOLENCE_MODEL, map_location="cpu", weights_only=True))
        else:
            print("[*] Loading ResNet50 ImageNet (weapon heuristic)...")
            model = resnet50(weights=ResNet50_Weights.IMAGENET1K_V2)

        model.eval()
        transform = T.Compose([
            T.Resize(IMG_SIZE),
            T.ToTensor(),
            T.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
        ])
        _models["viol"] = (model, transform, torch)
    return _models["viol"]

def get_yolo():
    if "yolo" not in _models:
        from ultralytics import YOLO
        print(f"[*] Loading YOLOv8: {YOLO_MODEL}")
        _models["yolo"] = YOLO(YOLO_MODEL)
    return _models["yolo"]


# ─── Analisi singoli modelli ────────────────────────────────

def analyze_nudenet(filepath):
    det = get_nudenet()
    results = det.detect(filepath)
    severe_max = 0.0
    border_max = 0.0
    for d in results:
        label, score = d["class"], d["score"]
        if label in NN_SEVERE_LABELS:
            severe_max = max(severe_max, score)
        if label in NN_BORDER_LABELS:
            border_max = max(border_max, score)
    return severe_max, border_max

def analyze_nsfw(filepath):
    n2 = get_nsfw()
    return float(n2.predict_image(filepath))

def analyze_violence(img_pil):
    model, transform, torch = get_violence()
    x = transform(img_pil.convert("RGB")).unsqueeze(0)
    with torch.inference_mode():
        logits = model(x)
        probs = torch.softmax(logits, dim=1)
    if VIOLENCE_MODEL:
        return float(probs[0, 1])
    return float(probs[0, WEAPON_IDX].sum().clamp(max=1.0))

def analyze_yolo(filepath):
    model = get_yolo()
    results = model(filepath, imgsz=512, conf=YOLO_CONF, verbose=False, device="cpu")
    hits = []
    for r in results:
        for box in r.boxes:
            name = r.names[int(box.cls[0])].lower()
            conf = float(box.conf[0])
            if name in YOLO_TARGETS:
                hits.append((name, conf))
    return hits


# ─── Cascade decision ──────────────────────────────────────

def process_image(filepath, banned_hashes):
    filepath = str(filepath)
    fname = os.path.basename(filepath)

    # apri e ridimensiona
    try:
        img = Image.open(filepath).convert("RGB").resize(IMG_SIZE, Image.LANCZOS)
    except Exception as e:
        print(f"  [!] Impossibile aprire: {e}")
        return "REVIEW", "file corrotto/illeggibile", banned_hashes

    # 1) Hash dedup
    phash = compute_phash(img)
    if phash in banned_hashes:
        print(f"  [HASH] Match con hash bannato")
        return "BLOCK", "hash bannato (duplicato)", banned_hashes

    # 2) NudeNet severe
    nn_severe, nn_border = analyze_nudenet(filepath)
    print(f"  [NN]   severe={nn_severe:.3f}  borderline={nn_border:.3f}")
    if nn_severe >= NN_SEVERE_TH:
        banned_hashes.add(phash)
        return "BLOCK", f"NudeNet severe ({nn_severe:.2f})", banned_hashes

    # 3) OpenNSFW2 high + NudeNet borderline
    nsfw = analyze_nsfw(filepath)
    print(f"  [NSFW] score={nsfw:.3f}")
    if nsfw >= NSFW_HIGH_TH and nn_border >= NN_BORDER_TH:
        banned_hashes.add(phash)
        return "BLOCK", f"NSFW({nsfw:.2f}) + NudeNet border({nn_border:.2f})", banned_hashes

    # 4) ResNet50 violence
    vscore = analyze_violence(img)
    print(f"  [VIOL] score={vscore:.3f}")
    if vscore > VIOLENCE_TH:
        banned_hashes.add(phash)
        return "BLOCK", f"violence ({vscore:.2f})", banned_hashes

    # 5) YOLO armi/droga
    yolo_hits = analyze_yolo(filepath)
    if yolo_hits:
        tag = ", ".join(f"{n}({c:.2f})" for n, c in yolo_hits)
        print(f"  [YOLO] FOUND: {tag}")
        banned_hashes.add(phash)
        return "BLOCK", f"YOLO: {tag}", banned_hashes
    else:
        print(f"  [YOLO] clean")

    # 6) NSFW borderline → REVIEW
    if nsfw >= NSFW_REVIEW_TH:
        return "REVIEW", f"NSFW borderline ({nsfw:.2f})", banned_hashes

    # 7) ALLOW
    return "ALLOW", "tutti i controlli superati", banned_hashes


# ─── File mover (no sovrascrittura) ────────────────────────

def safe_move(src, dest_dir):
    Path(dest_dir).mkdir(parents=True, exist_ok=True)
    dest = Path(dest_dir) / Path(src).name
    n = 1
    while dest.exists():
        dest = Path(dest_dir) / f"{Path(src).stem}_{n}{Path(src).suffix}"
        n += 1
    shutil.move(str(src), str(dest))
    return dest


# ─── Raccolta file da scansionare ──────────────────────────

def collect_files(path):
    p = Path(path)
    if p.is_file():
        if p.suffix.lower() in EXTENSIONS:
            return [p]
        print(f"[!] Estensione non supportata: {p.suffix}")
        return []
    if p.is_dir():
        return sorted(f for f in p.iterdir() if f.is_file() and f.suffix.lower() in EXTENSIONS)
    print(f"[!] Path non trovato: {path}")
    return []


# ─── Main ──────────────────────────────────────────────────

def main():
    files = collect_files(INPUT_PATH)
    if not files:
        print("[!] Nessuna immagine trovata.")
        sys.exit(1)

    banned = load_hashes()
    stats = {"BLOCK": 0, "REVIEW": 0, "ALLOW": 0}

    dest_map = {
        "BLOCK":  BAN_DIR,
        "REVIEW": REVIEW_DIR,
        "ALLOW":  ALLOW_DIR,
    }

    print(f"\n{'='*60}")
    print(f"  Moderation Pipeline — {len(files)} immagini (batch=1, CPU)")
    print(f"{'='*60}\n")

    for i, fpath in enumerate(files, 1):
        print(f"[{i}/{len(files)}] {fpath.name}")

        try:
            verdict, reason, banned = process_image(fpath, banned)
        except Exception as e:
            print(f"  [!] Errore: {e}")
            verdict, reason = "REVIEW", f"errore pipeline: {e}"

        dest = safe_move(fpath, dest_map[verdict])
        stats[verdict] += 1
        print(f"{verdict} — {reason}")
        print(f"{dest}\n")

    # salva solo hash bannati
    save_hashes(banned)

    print(f"{'='*60}")
    print(f"BLOCK  : {stats['BLOCK']}")
    print(f"REVIEW : {stats['REVIEW']}")
    print(f"ALLOW  : {stats['ALLOW']}")
    print(f"Hash bannati salvati: {len(banned)}")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    main()
