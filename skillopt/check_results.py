import os, json
batch_dir = r"C:\Users\prarh\Downloads\BRAHMAND AI AGENT\skillopt\batch_output"
for skill_dir in sorted(os.listdir(batch_dir)):
    spath = os.path.join(batch_dir, skill_dir)
    if not os.path.isdir(spath): continue
    summary_path = os.path.join(spath, "summary.json")
    if os.path.exists(summary_path):
        with open(summary_path) as f: s = json.load(f)
        best_step = s.get("best_step")
        best_score = s.get("best_score")
        n_steps = s.get("n_steps")
        n_accept = s.get("n_accept", 0)
        n_skip = s.get("n_skip", 0)
        edits = s.get("total_edits_applied", 0)
        best_skill_path = os.path.join(spath, "skills", f"skill_v{best_step:04d}.md") if best_step is not None else None
        changed = False
        if best_skill_path and os.path.exists(best_skill_path):
            orig_path = os.path.join(r"C:\Users\prarh\Downloads\BRAHMAND AI AGENT\skills", f"{skill_dir}.md")
            if os.path.exists(orig_path):
                with open(orig_path) as f1: orig = f1.read()
                with open(best_skill_path) as f2: best_skill = f2.read()
                changed = (orig.strip() != best_skill.strip())
        
        print(f"{skill_dir}: steps={n_steps} accept={n_accept} skip={n_skip} edits_applied={edits} best_score={best_score} changed={changed}")
