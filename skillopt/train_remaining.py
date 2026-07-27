"""Train remaining skills one at a time."""
import sys, os, json, tempfile, shutil, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from skillopt.config import load_config
from skillopt.engine import ReflACTTrainer
from skillopt.envs.marketing.adapter import MarketingAdapter

SKILLS_DIR = r"C:\Users\prarh\Downloads\BRAHMAND AI AGENT\skills"
OUTPUT_DIR = r"C:\Users\prarh\Downloads\BRAHMAND AI AGENT\skillopt\batch_output"
CONFIG_PATH = r"C:\Users\prarh\Downloads\BRAHMAND AI AGENT\skillopt\configs\brahmand\default.yaml"
REMAINING = [
    "language_matching_skill.md",
    "instagram_search_runbook.md",
    "ram.md",
    "short_response_controller.md",
    "short_video_script_writer.md",
    "web_scrape.md",
]


def generate_qa_pairs(skill_text, skill_name):
    lines = skill_text.split("\n")
    questions = []
    seen = set()
    current_heading = "Overview"
    heading_content = {}
    for line in lines:
        if line.startswith("#"):
            current_heading = line.lstrip("#").strip()
            heading_content[current_heading] = ""
        else:
            heading_content.setdefault(current_heading, "")
            heading_content[current_heading] += line + "\n"
    for h, content in heading_content.items():
        content_stripped = content.strip()[:300]
        if content_stripped and h not in seen:
            seen.add(h)
            ans = content_stripped.split("\n")[0].strip().rstrip(":-").strip()
            if len(ans) > 10:
                questions.append({
                    "id": f"{skill_name}_{h[:20]}_{len(questions)}",
                    "question": f"What does the skill say about '{h}'?",
                    "context": f"The skill section '{h}' states: {content_stripped}",
                    "answers": [ans[:150]],
                })
    for line in lines:
        s = line.strip()
        if s.startswith("- ") or s.startswith("* "):
            b = s[2:]
            if len(b) > 15 and b not in seen:
                seen.add(b)
                questions.append({
                    "id": f"{skill_name}_bullet_{len(questions)}",
                    "question": f"What does the skill say: {b[:60]}...",
                    "context": f"The skill includes: {skill_text[:1500]}",
                    "answers": [b[:150]],
                })
    bold_items = re.findall(r"\*\*(.*?)\*\*", skill_text)
    for b in bold_items:
        if len(b) > 10 and b not in seen and len(questions) < 15:
            seen.add(b)
            questions.append({
                "id": f"{skill_name}_bold_{len(questions)}",
                "question": f"What does the skill say about '{b}'?",
                "context": f"According to the skill: {skill_text[:1500]}",
                "answers": [b[:150]],
            })
    obj_match = re.search(r"## Objective\s*(.*?)(?:\n|$)", skill_text, re.IGNORECASE)
    if obj_match:
        obj_text = obj_match.group(1).strip()
        questions.append({
            "id": f"{skill_name}_objective",
            "question": "What is the objective of this skill?",
            "context": f"The skill objective is: {obj_text}",
            "answers": [obj_text[:200]],
        })
    return questions[:12]


for fname in REMAINING:
    fpath = os.path.join(SKILLS_DIR, fname)
    skill_name = fname.replace(".md", "")
    print(f"\n{'='*60}")
    print(f"  TRAINING: {skill_name}")
    print(f"{'='*60}")

    with open(fpath, encoding="utf-8") as f:
        skill_text = f.read()
    if not skill_text.strip():
        print("  SKIP: empty skill")
        continue

    qa_pairs = generate_qa_pairs(skill_text, skill_name)
    if len(qa_pairs) < 4:
        print(f"  SKIP: only {len(qa_pairs)} QA pairs")
        continue

    train = qa_pairs[: max(4, len(qa_pairs) - 4)]
    val = qa_pairs[max(4, len(qa_pairs) - 4) : max(6, len(qa_pairs) - 2)]
    test = qa_pairs[max(6, len(qa_pairs) - 2) :]

    skill_slug = skill_name.replace(" ", "_")
    split_dir = os.path.join(tempfile.gettempdir(), f"skillopt_{skill_slug}")
    os.makedirs(os.path.join(split_dir, "train"), exist_ok=True)
    os.makedirs(os.path.join(split_dir, "val"), exist_ok=True)
    os.makedirs(os.path.join(split_dir, "test"), exist_ok=True)
    with open(os.path.join(split_dir, "train", "items.json"), "w", encoding="utf-8") as f:
        json.dump(train, f, ensure_ascii=False, indent=2)
    with open(os.path.join(split_dir, "val", "items.json"), "w", encoding="utf-8") as f:
        json.dump(val, f, ensure_ascii=False, indent=2)
    with open(os.path.join(split_dir, "test", "items.json"), "w", encoding="utf-8") as f:
        json.dump(test, f, ensure_ascii=False, indent=2)

    out_root = os.path.join(OUTPUT_DIR, skill_slug)
    cfg = load_config(CONFIG_PATH)
    cfg["split_dir"] = split_dir
    cfg["skill_init"] = fpath
    cfg["out_root"] = out_root
    cfg["train_size"] = len(train)
    cfg["num_epochs"] = 1
    cfg["batch_size"] = min(len(train), 4)
    cfg["use_gate"] = False
    cfg["minibatch_size"] = 1
    cfg["analyst_workers"] = 1
    cfg["max_analyst_rounds"] = 1

    adapter = MarketingAdapter(
        split_dir=split_dir,
        split_mode="split_dir",
        workers=1,
        analyst_workers=1,
        failure_only=False,
        minibatch_size=1,
        edit_budget=2,
        seed=42,
        limit=0,
        max_completion_tokens=1024,
    )
    os.makedirs(out_root, exist_ok=True)
    trainer = ReflACTTrainer(cfg, adapter)
    summary = trainer.train()
    print(f"  [DONE] {skill_name}: best_step={summary.get('best_step')} best_score={summary.get('best_score')}")

    best_src = os.path.join(out_root, "best_skill.md")
    if os.path.exists(best_src):
        shutil.copy2(best_src, os.path.join(OUTPUT_DIR, f"{skill_slug}_optimized.md"))
        print(f"  [SAVED] optimized")

    shutil.rmtree(split_dir, ignore_errors=True)
    print(f"  [OK] {skill_name} complete")

print(f"\n{'='*60}")
print(f"  ALL REMAINING SKILLS TRAINED")
print(f"{'='*60}")
