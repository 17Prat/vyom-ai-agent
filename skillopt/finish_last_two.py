"""Train last 2 remaining skills."""
import sys, os, json, tempfile, shutil, re, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from skillopt.config import load_config
from skillopt.engine import ReflACTTrainer
from skillopt.envs.marketing.adapter import MarketingAdapter

SKILLS_DIR = r"C:\Users\prarh\Downloads\BRAHMAND AI AGENT\skills"
OUTPUT_DIR = r"C:\Users\prarh\Downloads\BRAHMAND AI AGENT\skillopt\batch_output"
CONFIG_PATH = r"C:\Users\prarh\Downloads\BRAHMAND AI AGENT\skillopt\configs\brahmand\default.yaml"
REMAINING = ["instagram_search_runbook.md", "web_scrape.md"]

def gen_qa(skill_text, skill_name):
    qs = []; seen = set()
    ch = "Overview"; hc = {}
    for l in skill_text.split("\n"):
        if l.startswith("#"): ch = l.lstrip("#").strip(); hc[ch] = ""
        else: hc.setdefault(ch, ""); hc[ch] += l + "\n"
    for h, c in hc.items():
        cs = c.strip()[:300]
        if cs and h not in seen:
            seen.add(h); a = cs.split("\n")[0].strip().rstrip(":-").strip()
            if len(a) > 10: qs.append({"id": f'{skill_name}_{h[:20]}_{len(qs)}', "question": f"What does the skill say about '{h}'?", "context": f"The skill section '{h}' states: {cs}", "answers": [a[:150]]})
    for s in skill_text.split("\n"):
        s = s.strip()
        if (s.startswith("- ") or s.startswith("* ")) and len(s[2:]) > 15 and s[2:] not in seen:
            b = s[2:]; seen.add(b)
            qs.append({"id": f"{skill_name}_b{len(qs)}", "question": f"What does the skill say: {b[:60]}...", "context": f"The skill includes: {skill_text[:1500]}", "answers": [b[:150]]})
    for b in re.findall(r"\*\*(.*?)\*\*", skill_text):
        if len(b) > 10 and b not in seen and len(qs) < 15:
            seen.add(b)
            qs.append({"id": f"{skill_name}_bo{len(qs)}", "question": f"What does the skill say about '{b}'?", "context": f"According to the skill: {skill_text[:1500]}", "answers": [b[:150]]})
    m = re.search(r"## Objective\s*(.*?)(?:\n|$)", skill_text, re.IGNORECASE)
    if m:
        t = m.group(1).strip()
        qs.append({"id": f"{skill_name}_obj", "question": "What is the objective of this skill?", "context": f"The skill objective is: {t}", "answers": [t[:200]]})
    return qs[:12]


for fname in REMAINING:
    fpath = os.path.join(SKILLS_DIR, fname)
    sn = fname.replace(".md", "")
    print(f"\n=== TRAINING: {sn} ===")
    with open(fpath, encoding="utf-8") as f: t = f.read()
    if not t.strip(): print("SKIP empty"); continue
    qa = gen_qa(t, sn)
    if len(qa) < 4: print(f"SKIP {len(qa)} qa"); continue
    tr = qa[:max(4, len(qa)-4)]
    va = qa[max(4, len(qa)-4):max(6, len(qa)-2)]
    te = qa[max(6, len(qa)-2):]
    slug = sn.replace(" ", "_")
    sd = os.path.join(tempfile.gettempdir(), f"skillopt_{slug}")
    for d in ["train", "val", "test"]: os.makedirs(os.path.join(sd, d), exist_ok=True)
    with open(os.path.join(sd, "train", "items.json"), "w", encoding="utf-8") as f: json.dump(tr, f, ensure_ascii=False, indent=2)
    with open(os.path.join(sd, "val", "items.json"), "w", encoding="utf-8") as f: json.dump(va, f, ensure_ascii=False, indent=2)
    with open(os.path.join(sd, "test", "items.json"), "w", encoding="utf-8") as f: json.dump(te, f, ensure_ascii=False, indent=2)
    out = os.path.join(OUTPUT_DIR, slug)
    cfg = load_config(CONFIG_PATH)
    cfg["split_dir"] = sd; cfg["skill_init"] = fpath; cfg["out_root"] = out
    cfg["train_size"] = len(tr); cfg["num_epochs"] = 1; cfg["batch_size"] = min(len(tr), 4)
    cfg["use_gate"] = False; cfg["minibatch_size"] = 1; cfg["analyst_workers"] = 1; cfg["max_analyst_rounds"] = 1
    adapter = MarketingAdapter(split_dir=sd, split_mode="split_dir", workers=1, analyst_workers=1,
                               failure_only=False, minibatch_size=1, edit_budget=2, seed=42, limit=0, max_completion_tokens=1024)
    os.makedirs(out, exist_ok=True)
    trainer = ReflACTTrainer(cfg, adapter)
    summary = trainer.train()
    bs = os.path.join(out, "best_skill.md")
    if os.path.exists(bs): shutil.copy2(bs, os.path.join(OUTPUT_DIR, f"{slug}_optimized.md"))
    shutil.rmtree(sd, ignore_errors=True)
    print(f"  DONE: {sn}")
    time.sleep(10)

print("\nALL DONE!")
