import os, json

batch_dir = r"C:\Users\prarh\Downloads\BRAHMAND AI AGENT\skillopt\batch_output"
skills_dir = r"C:\Users\prarh\Downloads\BRAHMAND AI AGENT\skills"

for skill_dir in sorted(os.listdir(batch_dir)):
    spath = os.path.join(batch_dir, skill_dir)
    if not os.path.isdir(spath): continue
    skills_sub = os.path.join(spath, "skills")
    if not os.path.exists(skills_sub): 
        print(f"{skill_dir}: NO SKILLS DIR")
        continue
    versions = sorted([f for f in os.listdir(skills_sub) if f.endswith(".md")])
    if len(versions) <= 1:
        print(f"{skill_dir}: only {versions}")
        continue
    v0_path = os.path.join(skills_sub, versions[0])
    vn_path = os.path.join(skills_sub, versions[-1])
    try:
        with open(v0_path, encoding="utf-8") as f: v0 = f.read()
        with open(vn_path, encoding="utf-8") as f: vn = f.read()
        changed = v0.strip() != vn.strip()
        if changed:
            print(f"{skill_dir}: CHANGED  {versions[0]} ({len(v0)}B) -> {versions[-1]} ({len(vn)}B)")
        else:
            print(f"{skill_dir}: SAME")
    except Exception as e:
        print(f"{skill_dir}: ERROR {e}")
