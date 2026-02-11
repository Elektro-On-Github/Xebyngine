import hashlib, shutil, sys, os, tempfile, time
from pathlib import Path
from PIL import Image
import imagehash

try:
    import cv2
    HAS_CV2 = True
except ImportError:
    HAS_CV2 = False
    print("[!] OpenCV non disponibile - supporto video disabilitato")

os.environ["CUDA_VISIBLE_DEVICES"]   = ""          # TF: niente GPU
os.environ["TF_CPP_MIN_LOG_LEVEL"]   = "3"         # TF: zittisci i warning
os.environ["TF_ENABLE_ONEDNN_OPTS"]  = "0"         # TF: no oneDNN noise
os.environ["YOLO_VERBOSE"]           = "false"      # YOLO: silenzioso

# ============================================================================
# DIRECTORY CONFIGURATION
# ============================================================================

# Pipeline di moderazione
MOD_RAW_DIR     = "uploads/moderation/raw"
MOD_BAN_DIR     = "uploads/moderation/ban"
MOD_REVIEW_DIR  = "uploads/moderation/review"
MOD_ALLOW_DIR   = "uploads/moderation/allow"

# Destinazioni finali dopo moderazione
FINAL_RAW_DIR   = "uploads/raw"            # foto approvate per avif.py
FINAL_VIDEO_DIR = "uploads/videos"         # video approvati

HASH_FILE       = "banned_hashes.txt"

IMG_SIZE        = (512, 512)
IMG_EXTENSIONS  = {".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".tiff", ".avif"}
VIDEO_EXTENSIONS = {".mp4", ".webm", ".mov", ".avi", ".mkv", ".flv", ".wmv"}

# Thresholds
NN_SEVERE_TH    = 0.50
NN_BORDER_TH    = 0.30
NSFW_HIGH_TH    = 0.65
NSFW_REVIEW_TH  = 0.55
VIOLENCE_TH     = 0.60
VIOLENCE_MODEL  = None
YOLO_MODEL      = "yolov8m.pt"
YOLO_CONF       = 0.50

YOLO_TARGETS    = {
    "knife", "scissors",
    "gun", "pistol", "rifle", "handgun", "weapon",
    "syringe", "pills", "drugs", "marijuana",
}

NN_SEVERE_LABELS = {
    "FEMALE_GENITALIA_EXPOSED", "MALE_GENITALIA_EXPOSED",
    "FEMALE_BREAST_EXPOSED", "ANUS_EXPOSED",
}
NN_BORDER_LABELS = {
    "BUTTOCKS_EXPOSED", "BELLY_EXPOSED",
    "FEMALE_BREAST_COVERED", "MALE_BREAST_EXPOSED", "ARMPITS_EXPOSED",
}

WEAPON_IDX = [413, 734, 764, 499, 596, 583]

SLEEP_IDLE = 0.5
STABILITY_DELAY = 1.0

# ============================================================================
# HASH MANAGEMENT
# ============================================================================

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

# ============================================================================
# MODEL LOADING (Lazy)
# ============================================================================

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

# ============================================================================
# INDIVIDUAL MODEL ANALYSIS
# ============================================================================

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

# ============================================================================
# CASCADE DECISION ENGINE
# ============================================================================

def process_image(filepath, banned_hashes):
    """Moderazione cascata per immagine singola."""
    filepath = str(filepath)
    fname = os.path.basename(filepath)

    try:
        img = Image.open(filepath).convert("RGB").resize(IMG_SIZE, Image.LANCZOS)
    except Exception as e:
        print(f"    [!] Impossibile aprire: {e}")
        return "REVIEW", "file corrotto/illeggibile", banned_hashes

    # 1) Hash dedup
    phash = compute_phash(img)
    if phash in banned_hashes:
        print(f"    [HASH] Match hash bannato")
        return "BLOCK", "hash bannato (duplicato)", banned_hashes

    # 2) NudeNet severe
    nn_severe, nn_border = analyze_nudenet(filepath)
    print(f"    [NN]   severe={nn_severe:.3f}  border={nn_border:.3f}")
    if nn_severe >= NN_SEVERE_TH:
        banned_hashes.add(phash)
        return "BLOCK", f"NudeNet severe ({nn_severe:.2f})", banned_hashes

    # 3) OpenNSFW2 high + NudeNet borderline
    nsfw = analyze_nsfw(filepath)
    print(f"    [NSFW] score={nsfw:.3f}")
    if nsfw >= NSFW_HIGH_TH and nn_border >= NN_BORDER_TH:
        banned_hashes.add(phash)
        return "BLOCK", f"NSFW({nsfw:.2f})+NNborder({nn_border:.2f})", banned_hashes

    # 4) ResNet50 violence
    vscore = analyze_violence(img)
    print(f"    [VIOL] score={vscore:.3f}")
    if vscore > VIOLENCE_TH:
        banned_hashes.add(phash)
        return "BLOCK", f"violence ({vscore:.2f})", banned_hashes

    # 5) YOLO weapons/drugs
    yolo_hits = analyze_yolo(filepath)
    if yolo_hits:
        tag = ", ".join(f"{n}({c:.2f})" for n, c in yolo_hits)
        print(f"    [YOLO] FOUND: {tag}")
        banned_hashes.add(phash)
        return "BLOCK", f"YOLO: {tag}", banned_hashes
    else:
        print(f"    [YOLO] clean")

    # 6) NSFW borderline → REVIEW
    if nsfw >= NSFW_REVIEW_TH:
        return "REVIEW", f"NSFW borderline ({nsfw:.2f})", banned_hashes

    # 7) ALLOW
    return "ALLOW", "passed all checks", banned_hashes

# ============================================================================
# VIDEO PROCESSING
# ============================================================================

def get_file_type(filename):
    """Determina tipo file: image, video, unknown."""
    ext = Path(filename).suffix.lower()
    if ext in IMG_EXTENSIONS:
        return "image"
    elif ext in VIDEO_EXTENSIONS:
        return "video"
    else:
        return "unknown"

def extract_video_frames(video_path, frame_step=10, max_frames=100):
    """Estrae frame da video ogni frame_step frame."""
    if not HAS_CV2:
        return None
    
    try:
        cap = cv2.VideoCapture(video_path)
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        frames = []
        frame_indices = []
        
        for i in range(0, total_frames, frame_step):
            cap.set(cv2.CAP_PROP_POS_FRAMES, i)
            ret, frame = cap.read()
            if not ret:
                break
            
            frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            frames.append(Image.fromarray(frame_rgb))
            frame_indices.append(i)
            
            if len(frames) >= max_frames:
                break
        
        cap.release()
        return frames, frame_indices
    except Exception as e:
        print(f"    [WARN] Errore lettura video: {e}")
        return None

def process_video(video_path, banned_hashes):
    """Moderazione video: traccia MASSIMI di ogni modello, applica thresholds ai massimi."""
    frames_data = extract_video_frames(video_path, frame_step=10, max_frames=100)
    
    if frames_data is None:
        print(f"    [WARN] Impossibile estrarre frame")
        return "REVIEW", "Errore lettura video", banned_hashes
    
    frames, frame_indices = frames_data
    if not frames:
        print(f"    [WARN] Nessun frame estratto")
        return "REVIEW", "Nessun frame disponibile", banned_hashes
    
    # Traccia i MASSIMI di ogni modello
    max_nn_severe = 0.0
    max_nn_border = 0.0
    max_nsfw = 0.0
    max_viol = 0.0
    yolo_hits = []
    
    has_block = False
    block_reason = None
    
    for frame, frame_num in zip(frames, frame_indices):
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
            frame.save(tmp.name)
            tmp_path = tmp.name
        
        try:
            print(f"    [Frame {frame_num}] scanning...")
            img = Image.open(tmp_path).convert("RGB").resize(IMG_SIZE, Image.LANCZOS)
            
            # 1) Hash dedup
            phash = compute_phash(img)
            if phash in banned_hashes:
                has_block = True
                block_reason = "hash bannato"
                break
            
            # 2) NudeNet severe + borderline
            nn_severe, nn_border = analyze_nudenet(tmp_path)
            print(f"      [NN] severe={nn_severe:.3f} border={nn_border:.3f}")
            
            if nn_severe >= NN_SEVERE_TH:
                has_block = True
                block_reason = f"NudeNet severe ({nn_severe:.2f})"
                break
            
            max_nn_severe = max(max_nn_severe, nn_severe)
            max_nn_border = max(max_nn_border, nn_border)
            
            # 3) NSFW
            nsfw = analyze_nsfw(tmp_path)
            print(f"      [NSFW] score={nsfw:.3f}")
            max_nsfw = max(max_nsfw, nsfw)
            
            # 4) Violence
            vscore = analyze_violence(img)
            print(f"      [VIOL] score={vscore:.3f}")
            
            if vscore > VIOLENCE_TH:
                has_block = True
                block_reason = f"violence ({vscore:.2f})"
                break
            
            max_viol = max(max_viol, vscore)
            
            # 5) YOLO
            yolo_detections = analyze_yolo(tmp_path)
            if yolo_detections:
                print(f"      [YOLO] FOUND: {yolo_detections}")
                has_block = True
                block_reason = f"YOLO: {', '.join(f'{n}({c:.2f})' for n, c in yolo_detections)}"
                break
            else:
                print(f"      [YOLO] clean")
        
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)

            print(f"\n    [DEBUG] Frame-by-frame analysis complete")
        print(f"    [DEBUG] Max values: nn_severe={max_nn_severe:.4f}, nn_border={max_nn_border:.4f}, nsfw={max_nsfw:.4f}, viol={max_viol:.4f}")
    
    # Decidi verdetto finale basato sui MASSIMI
    if has_block:
        banned_hashes.add(phash)
        return "BLOCK", block_reason, banned_hashes
    
    # Applica thresholds ai massimi
    # 1) NSFW HIGH + NN BORDER
    if max_nsfw >= NSFW_HIGH_TH and max_nn_border >= NN_BORDER_TH:
        return "REVIEW", f"NSFW({max_nsfw:.2f})+NNborder({max_nn_border:.2f})", banned_hashes
    
    # 2) NSFW REVIEW
    if max_nsfw >= NSFW_REVIEW_TH:
        return "REVIEW", f"NSFW borderline ({max_nsfw:.2f})", banned_hashes
    
    # 3) Tutti i modelli OK → ALLOW
    return "ALLOW", "video clean", banned_hashes

# ============================================================================
# FILE OPERATIONS
# ============================================================================

def is_stable(path, delay=STABILITY_DELAY):
    """Verifica se il file è stabile (non in upload)."""
    if not os.path.exists(path):
        return False
    size1 = os.path.getsize(path)
    time.sleep(delay)
    size2 = os.path.getsize(path)
    return size1 == size2

def safe_move(src, dest_dir):
    """Sposta file senza sovrascrivere."""
    Path(dest_dir).mkdir(parents=True, exist_ok=True)
    dest = Path(dest_dir) / Path(src).name
    n = 1
    while dest.exists():
        dest = Path(dest_dir) / f"{Path(src).stem}_{n}{Path(src).suffix}"
        n += 1
    shutil.move(str(src), str(dest))
    return dest

# ============================================================================
# MAIN PIPELINE WORKER
# ============================================================================

def process_one():
    """Processa un file da uploads/moderation/raw/ - routing verso ban/review/allow."""
    Path(MOD_RAW_DIR).mkdir(parents=True, exist_ok=True)
    
    files = sorted(os.listdir(MOD_RAW_DIR))
    if not files:
        return False
    
    name = files[0]
    raw_path = os.path.join(MOD_RAW_DIR, name)
    
    # NUOVO: Verifica che il file esista PRIMA di verificare stabilità
    if not os.path.exists(raw_path):
        print(f"[SKIP] {name}: file non trovato (già processato?)")
        return True
    
    if not is_stable(raw_path):
        print(f"[SKIP] {name}: upload in corso")
        return True
    
    banned_hashes = load_hashes()
    file_type = get_file_type(name)
    
    if file_type == "unknown":
        print(f"[FAIL] {name}: tipo non supportato")
        Path(MOD_BAN_DIR).mkdir(parents=True, exist_ok=True)
        shutil.move(raw_path, os.path.join(MOD_BAN_DIR, name))
        return True
    
    print(f"[MOD] {name} ({file_type})")
    
    try:
        if file_type == "image":
            verdict, reason, banned_hashes = process_image(raw_path, banned_hashes)
        else:  # video
            verdict, reason, banned_hashes = process_video(raw_path, banned_hashes)
        
        save_hashes(banned_hashes)
        print(f"  → {verdict}: {reason}")
        
        # ROUTING
        if verdict == "BLOCK":
            Path(MOD_BAN_DIR).mkdir(parents=True, exist_ok=True)
            shutil.move(raw_path, os.path.join(MOD_BAN_DIR, name))
            print(f"[BAN] {name}\n")
        
        elif verdict == "REVIEW":
            Path(MOD_REVIEW_DIR).mkdir(parents=True, exist_ok=True)
            shutil.move(raw_path, os.path.join(MOD_REVIEW_DIR, name))
            print(f"[REVIEW] {name}\n")
        
        elif verdict == "ALLOW":
            Path(MOD_ALLOW_DIR).mkdir(parents=True, exist_ok=True)
            shutil.move(raw_path, os.path.join(MOD_ALLOW_DIR, name))
            
            # Sposta nella directory finale
            if file_type == "image":
                Path(FINAL_RAW_DIR).mkdir(parents=True, exist_ok=True)
                shutil.move(os.path.join(MOD_ALLOW_DIR, name), os.path.join(FINAL_RAW_DIR, name))
                print(f"[ALLOW→avif] {name}\n")
            else:  # video
                Path(FINAL_VIDEO_DIR).mkdir(parents=True, exist_ok=True)
                shutil.move(os.path.join(MOD_ALLOW_DIR, name), os.path.join(FINAL_VIDEO_DIR, name))
                print(f"[ALLOW→video] {name}\n")
    
    except Exception as e:
        print(f"[ERROR] {name}: {e}")
        Path(MOD_REVIEW_DIR).mkdir(parents=True, exist_ok=True)
        if os.path.exists(raw_path):
            shutil.move(raw_path, os.path.join(MOD_REVIEW_DIR, name))
        return True
    
    return True
