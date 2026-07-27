"""Batch train all .md skill files through SkillOpt."""
import json, os, re, shutil, sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import yaml
from skillopt.config import load_config, flatten_config
from skillopt.engine import ReflACTTrainer
from skillopt.envs.marketing.adapter import MarketingAdapter

SKILLS_DIR = r"C:\Users\prarh\Downloads\BRAHMAND AI AGENT\skills"
OUTPUT_DIR = r"C:\Users\prarh\Downloads\BRAHMAND AI AGENT\skillopt\batch_output"
DATA_DIR = r"C:\Users\prarh\Downloads\BRAHMAND AI AGENT\skillopt\data"
CONFIG_PATH = r"C:\Users\prarh\Downloads\BRAHMAND AI AGENT\skillopt\configs\brahmand\default.yaml"

SKIP_SKILLS = {"festival_marketing_strategy.md"}  # already done


def generate_qa_pairs(skill_text: str, skill_name: str) -> list[dict]:
    lines = skill_text.split("\n")
    questions = []
    seen = set()

    # Extract headings and their content
    current_heading = "Overview"
    heading_content = {}
    for line in lines:
        if line.startswith("#"):
            current_heading = line.lstrip("#").strip()
            heading_content[current_heading] = ""
        else:
            heading_content.setdefault(current_heading, "")
            heading_content[current_heading] += line + "\n"

    # Q from headings
    for h, content in heading_content.items():
        q = f"What does the skill say about '{h}'?"
        content_stripped = content.strip()[:300]
        if content_stripped and h not in seen:
            seen.add(h)
            ans = content_stripped.split("\n")[0].strip().rstrip(":-").strip()
            if len(ans) > 10:
                questions.append({
                    "id": f"{skill_name}_{h[:20]}_{len(questions)}",
                    "question": q,
                    "context": f"The skill section '{h}' states: {content_stripped}",
                    "answers": [ans[:150]],
                })

    # Q from bullet points
    bullet_items = []
    for line in lines:
        stripped = line.strip()
        if stripped.startswith("- ") or stripped.startswith("* "):
            bullet_items.append(stripped[2:])

    for i, b in enumerate(bullet_items):
        if len(b) > 15 and b not in seen:
            seen.add(b)
            q = f"What does the skill say: {b[:60]}..."
            questions.append({
                "id": f"{skill_name}_bullet_{i}",
                "question": q,
                "context": f"The skill includes this point: {skill_text[:1500]}",
                "answers": [b[:150]],
            })

    # Q from bold items
    bold_items = re.findall(r"\*\*(.*?)\*\*", skill_text)
    for i, b in enumerate(bold_items):
        if len(b) > 10 and b not in seen and len(questions) < 15:
            seen.add(b)
            q = f"What does the skill say about '{b}'?"
            questions.append({
                "id": f"{skill_name}_bold_{i}",
                "question": q,
                "context": f"According to the skill: {skill_text[:1500]}",
                "answers": [b[:150]],
            })

    # Objective Q
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


def train_skill(skill_path: str, skill_name: str):
    print(f"\n{'='*60}")
    print(f"  TRAINING: {skill_name}")
    print(f"{'='*60}")

    with open(skill_path, encoding="utf-8") as f:
        skill_text = f.read()

    if not skill_text.strip():
        print(f"  [SKIP] Empty skill")
        return

    # Generate dataset
    qa_pairs = generate_qa_pairs(skill_text, skill_name.replace(".md", ""))
    if len(qa_pairs) < 4:
        print(f"  [SKIP] Only {len(qa_pairs)} QA pairs generated, need at least 4")
        return

    train = qa_pairs[:max(4, len(qa_pairs)-4)]
    val = qa_pairs[max(4, len(qa_pairs)-4):max(6, len(qa_pairs)-2)]
    test = qa_pairs[max(6, len(qa_pairs)-2):]

    # Create temp dataset dir
    skill_slug = skill_name.replace(".md", "").replace(" ", "_")
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
    cfg["skill_init"] = skill_path
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

    # Copy best skill
    best_src = os.path.join(out_root, "best_skill.md")
    if os.path.exists(best_src):
        dst = os.path.join(OUTPUT_DIR, f"{skill_slug}_optimized.md")
        shutil.copy2(best_src, dst)
        print(f"  [SAVED] {dst}")

    # Cleanup temp
    shutil.rmtree(split_dir, ignore_errors=True)


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    skill_files = sorted(os.listdir(SKILLS_DIR))
    
    trained = 0
    for fname in skill_files:
        if not fname.endswith(".md"):
            continue
        if fname in SKIP_SKILLS:
            print(f"  [SKIP] {fname} (already trained)")
            continue

        fpath = os.path.join(SKILLS_DIR, fname)
        try:
            train_skill(fpath, fname)
            trained += 1
        except Exception as e:
            import traceback
            traceback.print_exc()
            print(f"  [ERROR] {fname}: {e}")

    print(f"\n{'='*60}")
    print(f"  BATCH COMPLETE: {trained} skills trained")
    print(f"  Outputs: {OUTPUT_DIR}")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
