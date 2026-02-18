import hashlib, shutil, sys, os, tempfile, time, json, re, unicodedata
from datetime import datetime, timezone
from typing import Dict, List, Tuple, Optional
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
os.environ["TOKENIZERS_PARALLELISM"] = "false"      # HF: evita warning

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

# Text moderation (OCR -> NLP) - CPU only
OCR_LANGS = ["it", "en"]
OCR_MIN_CONF = 0.35
TEXT_MODEL_NAME = os.environ.get("TEXT_MODEL_NAME", "textdetox/twitter-xlmr-toxicity-classifier")
TEXT_MAX_TOKENS = 256
TEXT_MIN_CHARS = 1
TEXT_MAX_CHARS = 2000
TEXT_SIM_SCALE = 8.0
TEXT_SIM_CENTER = 0.05

TEXT_BLOCK_TH = {
    "insulto": 0.90,
    "sarcasmo_negativo": 0.88,
    "minaccia": 0.85,
    "parolaccie": 0.80,
    "contenuto sessuale": 0.80,
}
TEXT_REVIEW_TH = {
    "insulto": 0.72,
    "sarcasmo_negativo": 0.70,
    "minaccia": 0.68,
    "parolaccie": 0.65,
    "contenuto sessuale": 0.65,
}

TEXT_LABEL_PROTOTYPES = {
    "insulto": [
        "insulto", "offesa", "sei stupido", "sei idiota", "sei un imbecille",
        "fai schifo"
    ],
    "sarcasmo_negativo": [
        "sarcasmo negativo", "ironia cattiva", "complimento falso",
        "fai schifo", "non capisci nulla a prescindere"
    ],
    "minaccia": [
        "ti uccido", "ti ammazzo", "ti faccio male", "ti distruggo",
        "espldi", "ti faccio sparire", "sei inutile"
    ],
    "parolaccie": [
        "coglione", "imbecille", "stupido", "cretino", "stronzo", "fanculo", "vaffanculo", "pezzo di merda"
    ],
    "contenuto sessuale": [
        "contenuto sessuale", "porno", "nudo", "sesso", "genitali", "nuda", "nudità", "nudo integrale", "porn", "ass", "tette", "culo", "boobs", "tits", "pussy", "dick", "cock", "penis", "vagina", "clit", "cazzo", "fica", "figa", "troia", "puttana", "stronza", "escort", "private"
    ]
}

TEXT_NEUTRAL_PROTOTYPES = [
    "ciao",
    "salve",
    "buongiorno",
    "buonasera",
    "buonanotte",
    "ok",
    "va bene",
    "grazie",
    "hello",
    "hi",
    "testo neutro",
    "messaggio normale",
]

TEXT_STATE_FILE = "uploads/moderation/text_state.json"
TEXT_SCAN_LIMIT = 200

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

def load_text_state():
    state = {
        "last_post_id": 0,
        "last_comment_id": 0,
        "last_poll_id": 0,
        "last_poll_option_id": 0,
        "last_profile_ts": 0.0,
    }
    if os.path.exists(TEXT_STATE_FILE):
        try:
            with open(TEXT_STATE_FILE) as f:
                data = json.load(f)
                if isinstance(data, dict):
                    state.update(data)
        except Exception:
            pass
    return state

def save_text_state(state):
    Path(TEXT_STATE_FILE).parent.mkdir(parents=True, exist_ok=True)
    with open(TEXT_STATE_FILE, "w") as f:
        json.dump(state, f)

# ============================================================================
# MODEL LOADING (Lazy)
# ============================================================================

_models = {}

def configure_torch_cpu():
    """Imposta un numero di thread ragionevole per CPU."""
    if _models.get("torch_configured"):
        return
    try:
        import torch
        threads = min(8, os.cpu_count() or 1)
        torch.set_num_threads(threads)
        torch.set_num_interop_threads(max(1, threads // 2))
        _models["torch_configured"] = True
    except Exception:
        _models["torch_configured"] = False

def get_ocr_reader():
    if "ocr" not in _models:
        try:
            import easyocr
            print("[*] Loading EasyOCR...")
            _models["ocr"] = ("easyocr", easyocr.Reader(OCR_LANGS, gpu=False))
        except Exception:
            try:
                import pytesseract
                print("[*] Using pytesseract OCR...")
                _models["ocr"] = ("pytesseract", pytesseract)
            except Exception:
                print("[!] OCR non disponibile - text moderation disabilitata")
                _models["ocr"] = None
    return _models["ocr"]

def get_text_encoder():
    if "text_encoder" not in _models:
        configure_torch_cpu()
        try:
            from transformers import AutoTokenizer, AutoModel
        except Exception as e:
            print(f"[!] Transformers non disponibile: {e}")
            _models["text_encoder"] = None
            return None

        print(f"[*] Loading text encoder: {TEXT_MODEL_NAME}")
        tokenizer = AutoTokenizer.from_pretrained(TEXT_MODEL_NAME)
        model = AutoModel.from_pretrained(TEXT_MODEL_NAME)
        model.eval()
        model.to("cpu")
        _models["text_encoder"] = (tokenizer, model)
    return _models["text_encoder"]

def get_text_label_embeddings():
    if "text_label_embeddings" not in _models:
        encoder = get_text_encoder()
        if encoder is None:
            _models["text_label_embeddings"] = None
            return None
        tokenizer, model = encoder
        label_texts = []
        label_indices = {}
        cursor = 0
        for label, phrases in TEXT_LABEL_PROTOTYPES.items():
            label_indices[label] = list(range(cursor, cursor + len(phrases)))
            label_texts.extend(phrases)
            cursor += len(phrases)

        embeddings = encode_texts(label_texts, tokenizer, model)
        label_embeddings = {}
        for label, idxs in label_indices.items():
            label_embeddings[label] = embeddings[idxs].mean(dim=0)
        _models["text_label_embeddings"] = label_embeddings
    return _models["text_label_embeddings"]

def get_text_neutral_embedding():
    if "text_neutral_embedding" not in _models:
        encoder = get_text_encoder()
        if encoder is None:
            _models["text_neutral_embedding"] = None
            return None
        tokenizer, model = encoder
        embeddings = encode_texts(TEXT_NEUTRAL_PROTOTYPES, tokenizer, model)
        _models["text_neutral_embedding"] = embeddings.mean(dim=0)
    return _models["text_neutral_embedding"]

EMOJI_PATTERN = re.compile(
    "["
    "\U0001F1E6-\U0001F1FF"
    "\U0001F300-\U0001FAFF"
    "\U00002700-\U000027BF"
    "]+",
    flags=re.UNICODE,
)

LEET_MAP = str.maketrans({
    "4": "a", "@": "a",
    "0": "o",
    "1": "i", "!": "i",
    "3": "e",
    "5": "s", "$": "s",
    "7": "t",
    "8": "b",
    "9": "g",
})

LEET_PATTERNS = [
    (re.compile(r"\b4ss0\b"), "ass"),
]

def normalize_text(text: str) -> str:
    if not text:
        return ""
    text = unicodedata.normalize("NFKC", text)
    text = text.lower()
    text = EMOJI_PATTERN.sub(" ", text)
    for pattern, replacement in LEET_PATTERNS:
        text = pattern.sub(replacement, text)
    text = text.translate(LEET_MAP)
    text = re.sub(r"[^a-z0-9\s'’]+", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text

def extract_text_from_image(filepath: str) -> Tuple[str, Optional[float]]:
    ocr = get_ocr_reader()
    if ocr is None:
        return "", None
    engine, reader = ocr
    if engine == "easyocr":
        results = reader.readtext(filepath, detail=1, paragraph=True)
        if not results:
            return "", None
        texts = []
        confidences = []
        for entry in results:
            if len(entry) >= 3:
                texts.append(entry[1])
                confidences.append(float(entry[2]))
        if not texts:
            return "", None
        avg_conf = sum(confidences) / len(confidences) if confidences else None
        return " ".join(texts), avg_conf

    try:
        image = Image.open(filepath).convert("RGB")
        text = reader.image_to_string(image, lang="ita+eng")
    except Exception:
        return "", None
    return text, None

def encode_texts(texts: List[str], tokenizer, model):
    import torch

    encoded = tokenizer(
        texts,
        padding=True,
        truncation=True,
        max_length=TEXT_MAX_TOKENS,
        return_tensors="pt",
    )
    with torch.inference_mode():
        output = model(**encoded)
    token_embeddings = output.last_hidden_state
    attention_mask = encoded["attention_mask"].unsqueeze(-1).expand(token_embeddings.size()).float()
    summed = (token_embeddings * attention_mask).sum(dim=1)
    summed_mask = attention_mask.sum(dim=1).clamp(min=1e-9)
    pooled = summed / summed_mask
    return torch.nn.functional.normalize(pooled, p=2, dim=1)

def classify_text(text: str, normalized: bool = False) -> Tuple[str, Dict[str, float], Dict[str, bool], str]:
    cleaned = text if normalized else normalize_text(text)
    if len(cleaned) < TEXT_MIN_CHARS:
        return "ALLOW", {}, {}, "text too short"

    encoder = get_text_encoder()
    label_embeddings = get_text_label_embeddings()
    neutral_embedding = get_text_neutral_embedding()
    if encoder is None or label_embeddings is None or neutral_embedding is None:
        return "ALLOW", {}, {}, "text model not available"

    tokenizer, model = encoder

    embedding = encode_texts([cleaned], tokenizer, model)[0]
    scores = {}
    flags = {}

    import torch
    neutral_similarity = float(torch.dot(embedding, neutral_embedding))
    for label, label_embedding in label_embeddings.items():
        similarity = float(torch.dot(embedding, label_embedding))
        delta = similarity - neutral_similarity
        scaled = (delta - TEXT_SIM_CENTER) * TEXT_SIM_SCALE
        score = float(torch.sigmoid(torch.tensor(scaled)))
        scores[label] = score
        flags[label] = score >= TEXT_REVIEW_TH[label]

    action = "ALLOW"
    reason = ""
    for label, score in scores.items():
        if score >= TEXT_BLOCK_TH[label]:
            action = "BLOCK"
            reason = f"text {label} ({score:.2f})"
            return action, scores, flags, reason

    return action, scores, flags, "text clean"

def analyze_text_from_image(filepath: str) -> Tuple[str, str, Dict[str, object]]:
    text, avg_conf = extract_text_from_image(filepath)
    if not text:
        return "ALLOW", "no text", {"text": "", "scores": {}, "flags": {}, "ocr_conf": avg_conf}
    if avg_conf is not None and avg_conf < OCR_MIN_CONF:
        return "ALLOW", "ocr confidence low", {"text": "", "scores": {}, "flags": {}, "ocr_conf": avg_conf}

    cleaned = normalize_text(text)
    if len(cleaned) < TEXT_MIN_CHARS:
        return "ALLOW", "text too short", {"text": cleaned, "scores": {}, "flags": {}, "ocr_conf": avg_conf}

    action, scores, flags, reason = classify_text(cleaned, normalized=True)
    report = {
        "text": cleaned[:TEXT_MAX_CHARS],
        "scores": scores,
        "flags": flags,
        "ocr_conf": avg_conf,
    }
    return action, reason, report

def analyze_text_from_post(content: str) -> Tuple[str, str, Dict[str, object]]:
    if not content:
        return "ALLOW", "post text empty", {"text": "", "scores": {}, "flags": {}}
    cleaned = normalize_text(content)
    if len(cleaned) < TEXT_MIN_CHARS:
        return "ALLOW", "post text too short", {"text": cleaned, "scores": {}, "flags": {}}

    action, scores, flags, reason = classify_text(cleaned, normalized=True)
    report = {
        "text": cleaned[:TEXT_MAX_CHARS],
        "scores": scores,
        "flags": flags,
    }
    return action, reason, report

def moderate_text_entry(label: str, user_id: str, raw_text: str):
    if not raw_text:
        return False
    print(f"    [{label}] {raw_text}")
    action, reason, report = analyze_text_from_post(raw_text)
    if report.get("scores"):
        scores_dump = json.dumps(report["scores"], ensure_ascii=True)
        print(f"    [{label} SCORES] {scores_dump}")
    if report.get("text"):
        print(f"    [{label}] {report['text']}")
    if action == "BLOCK":
        try:
            from .db import ban_user
        except ImportError:
            from utils.db import ban_user
        ban_user(user_id, reason=f"Text moderation BLOCK ({label}): {reason}")
        return True
    return False

def process_text_queue():
    """Scansiona testi DB (post senza foto, commenti, bio, sondaggi) e banna su BLOCK."""
    try:
        from .db import get_conn, release_conn
    except ImportError:
        from utils.db import get_conn, release_conn

    state = load_text_state()
    processed_any = False
    conn = get_conn()
    try:
        cur = conn.cursor()

        cur.execute(
            "SELECT id, user_id, content, image_path FROM posts WHERE id > %s ORDER BY id ASC LIMIT %s",
            (state["last_post_id"], TEXT_SCAN_LIMIT),
        )
        posts = cur.fetchall()
        for post_id, user_id, content, image_path in posts:
            label = "POST_NOIMG" if not image_path or image_path == "[]" else "POSTTXT"
            moderate_text_entry(label, user_id, content)
            processed_any = True
        if posts:
            state["last_post_id"] = posts[-1][0]

        cur.execute(
            "SELECT id, user_id, content FROM comments WHERE id > %s ORDER BY id ASC LIMIT %s",
            (state["last_comment_id"], TEXT_SCAN_LIMIT),
        )
        comments = cur.fetchall()
        for comment_id, user_id, content in comments:
            moderate_text_entry("COMMENT", user_id, content)
            processed_any = True
        if comments:
            state["last_comment_id"] = comments[-1][0]

        cur.execute(
            """
            SELECT polls.id, posts.user_id, polls.question
            FROM polls
            JOIN posts ON polls.post_id = posts.id
            WHERE polls.id > %s
            ORDER BY polls.id ASC
            LIMIT %s
            """,
            (state["last_poll_id"], TEXT_SCAN_LIMIT),
        )
        polls = cur.fetchall()
        for poll_id, user_id, question in polls:
            moderate_text_entry("POLLQ", user_id, question)
            processed_any = True
        if polls:
            state["last_poll_id"] = polls[-1][0]

        cur.execute(
            """
            SELECT poll_options.id, posts.user_id, poll_options.option_text
            FROM poll_options
            JOIN polls ON poll_options.poll_id = polls.id
            JOIN posts ON polls.post_id = posts.id
            WHERE poll_options.id > %s
            ORDER BY poll_options.id ASC
            LIMIT %s
            """,
            (state["last_poll_option_id"], TEXT_SCAN_LIMIT),
        )
        options = cur.fetchall()
        for opt_id, user_id, option_text in options:
            moderate_text_entry("POLLOPT", user_id, option_text)
            processed_any = True
        if options:
            state["last_poll_option_id"] = options[-1][0]

        cur.execute(
            """
            SELECT user_id, bio, EXTRACT(EPOCH FROM updated_at) AS ts
            FROM profile
            WHERE EXTRACT(EPOCH FROM updated_at) > %s
            ORDER BY updated_at ASC
            LIMIT %s
            """,
            (state["last_profile_ts"], TEXT_SCAN_LIMIT),
        )
        profiles = cur.fetchall()
        max_profile_ts = state["last_profile_ts"]
        for user_id, bio, ts in profiles:
            if ts is not None:
                max_profile_ts = max(max_profile_ts, float(ts))
            moderate_text_entry("BIO", user_id, bio)
            processed_any = True
        if profiles:
            state["last_profile_ts"] = max_profile_ts

        cur.close()
    except Exception as e:
        print(f"    [DB ERROR] text scan: {e}")
    finally:
        release_conn(conn)

    save_text_state(state)
    return processed_any

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

def process_image(filepath, banned_hashes, post_text=None):
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

    # 6) OCR + Text moderation
    text_action, text_reason, text_report = analyze_text_from_image(filepath)
    if text_report.get("scores"):
        report_dump = json.dumps(text_report, ensure_ascii=True)
        print(f"    [TEXT] {report_dump}")
    else:
        print(f"    [TEXT] {text_reason}")

    if text_report.get("text"):
        print(f"    [IMGTEXT] {text_report['text']}")

    if text_action == "BLOCK":
        banned_hashes.add(phash)
        return "BLOCK", text_reason, banned_hashes

    # 7) Post text moderation
    post_action, post_reason, post_report = analyze_text_from_post(post_text or "")
    if post_report.get("text"):
        print(f"    [POSTXT] {post_report['text']}")
    if post_report.get("scores"):
        scores_dump = json.dumps(post_report["scores"], ensure_ascii=True)
        print(f"    [POSTXT SCORES] {scores_dump}")
    if post_action == "BLOCK":
        banned_hashes.add(phash)
        return "BLOCK", post_reason, banned_hashes

    # 8) NSFW borderline → REVIEW
    if nsfw >= NSFW_REVIEW_TH:
        return "REVIEW", f"NSFW borderline ({nsfw:.2f})", banned_hashes

    # 9) ALLOW
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

def process_video(video_path, banned_hashes, post_text=None):
    """Moderazione video: traccia MASSIMI di ogni modello, applica thresholds ai massimi."""
    frames_data = extract_video_frames(video_path, frame_step=10, max_frames=100)
    
    if frames_data is None:
        print(f"    [WARN] Impossibile estrarre frame")
        return "REVIEW", "Errore lettura video", banned_hashes
    
    frames, frame_indices = frames_data
    if not frames:
        print(f"    [WARN] Nessun frame estratto")
        return "REVIEW", "Nessun frame disponibile", banned_hashes

    post_action, post_reason, post_report = analyze_text_from_post(post_text or "")
    if post_report.get("text"):
        print(f"    [POSTXT] {post_report['text']}")
    if post_report.get("scores"):
        scores_dump = json.dumps(post_report["scores"], ensure_ascii=True)
        print(f"    [POSTXT SCORES] {scores_dump}")
    if post_action == "BLOCK":
        return "BLOCK", post_reason, banned_hashes
    
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
    try:
        if not os.path.exists(path):
            return False
        size1 = os.path.getsize(path)
        time.sleep(delay)
        if not os.path.exists(path):
            return False
        size2 = os.path.getsize(path)
        return size1 == size2
    except OSError:
        return False

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
# DATABASE: DELETE POST BY FILENAME
# ============================================================================

def extract_user_id_from_filename(filename):
    """Estrae user_id dal filename: {timestamp}_{user_id}_{random_hex}.{ext}"""
    name = os.path.splitext(filename)[0]  # remove extension
    parts = name.split("_")
    # Format: timestamp_userid_randomhex - user_id is between first and last underscore
    # But timestamp itself contains underscores? No - the format is:
    # 2026-02-13---14:30:22.123_USERID_a1b2c3
    # So parts[0] = timestamp, parts[-1] = random_hex, middle parts = user_id
    if len(parts) >= 3:
        return "_".join(parts[1:-1])
    return None

def delete_post_by_filename(filename):
    """Cerca il post che contiene il file e lo elimina dal DB (cascade completa)."""
    try:
        from .db import get_conn, release_conn
    except ImportError:
        from utils.db import get_conn, release_conn

    conn = get_conn()
    try:
        cur = conn.cursor()
        # Cerca post che contiene questo filename in image_path (JSON)
        cur.execute("SELECT id, image_path FROM posts WHERE image_path LIKE %s", (f"%{filename}%",))
        rows = cur.fetchall()

        if not rows:
            print(f"    [DB] Nessun post trovato per file: {filename}")
            cur.close()
            return

        for post_id, image_path in rows:
            print(f"    [DB] Eliminazione post id={post_id} per file bannato: {filename}")
            cur.execute("DELETE FROM poll_votes WHERE post_id=%s", (post_id,))
            cur.execute("DELETE FROM poll_options WHERE poll_id IN (SELECT id FROM polls WHERE post_id=%s)", (post_id,))
            cur.execute("DELETE FROM polls WHERE post_id=%s", (post_id,))
            cur.execute("DELETE FROM comment_likes WHERE comment_id IN (SELECT id FROM comments WHERE post_id=%s)", (post_id,))
            cur.execute("DELETE FROM comments WHERE post_id=%s", (post_id,))
            cur.execute("DELETE FROM likes WHERE post_id=%s", (post_id,))
            cur.execute("DELETE FROM post_views WHERE post_id=%s", (post_id,))
            cur.execute("DELETE FROM posts WHERE id=%s", (post_id,))

        conn.commit()
        cur.close()
        print(f"    [DB] Post eliminati: {len(rows)}")
    except Exception as e:
        conn.rollback()
        print(f"    [DB ERROR] {e}")
    finally:
        release_conn(conn)

def fetch_post_text_by_filename(filename):
    """Recupera il testo del post associato al file (se presente)."""
    try:
        from .db import get_conn, release_conn
    except ImportError:
        from utils.db import get_conn, release_conn

    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute("SELECT content FROM posts WHERE image_path LIKE %s LIMIT 1", (f"%{filename}%",))
        row = cur.fetchone()
        cur.close()
        if row:
            return row[0]
    except Exception as e:
        print(f"    [DB ERROR] fetch post text: {e}")
    finally:
        release_conn(conn)
    return None

# ============================================================================
# MAIN PIPELINE WORKER
# ============================================================================

def process_one():
    """Processa un file da uploads/moderation/raw/ - routing verso ban/review/allow."""
    Path(MOD_RAW_DIR).mkdir(parents=True, exist_ok=True)

    text_processed = process_text_queue()

    files = sorted(os.listdir(MOD_RAW_DIR))
    if not files:
        return text_processed
    
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
    post_text = fetch_post_text_by_filename(name)

    try:
        if file_type == "image":
            verdict, reason, banned_hashes = process_image(raw_path, banned_hashes, post_text)
        else:  # video
            verdict, reason, banned_hashes = process_video(raw_path, banned_hashes, post_text)
        
        save_hashes(banned_hashes)
        print(f"  → {verdict}: {reason}")
        
        # ROUTING
        if verdict == "BLOCK":
            delete_post_by_filename(name)
            # Ban the user
            user_id = extract_user_id_from_filename(name)
            if user_id:
                try:
                    from .db import ban_user
                except ImportError:
                    from utils.db import ban_user
                banned = ban_user(user_id, reason=f"Moderation BLOCK: {reason}")
                if banned:
                    print(f"[BANNED] User {user_id} bannato per: {reason}")
            Path(MOD_BAN_DIR).mkdir(parents=True, exist_ok=True)
            shutil.move(raw_path, os.path.join(MOD_BAN_DIR, name))
            print(f"[BAN] {name}\n")
        
        elif verdict == "REVIEW":
            delete_post_by_filename(name)
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
