"""Show key structural changes for top 3 skills."""
import os, json, difflib

SKILLS_DIR = r"C:\Users\prarh\Downloads\BRAHMAND AI AGENT\skills"
BATCH_DIR = r"C:\Users\prarh\Downloads\BRAHMAND AI AGENT\skillopt\batch_output"

def show_diff(name, label):
    orig_path = os.path.join(SKILLS_DIR, f"{name}.md")
    skills_sub = os.path.join(BATCH_DIR, name, "skills")
    if not os.path.exists(skills_sub): return
    
    versions = sorted([f for f in os.listdir(skills_sub) if f.endswith(".md")])
    latest_path = os.path.join(skills_sub, versions[-1])
    
    with open(orig_path, encoding="utf-8") as f: orig = f.read()
    with open(latest_path, encoding="utf-8") as f: opt = f.read()
    
    orig_lines = orig.split("\n")
    opt_lines = opt.split("\n")
    
    diff = list(difflib.unified_diff(orig_lines, opt_lines, lineterm="", n=3))
    added = sum(1 for l in diff if l.startswith("+") and not l.startswith("+++"))
    removed = sum(1 for l in diff if l.startswith("-") and not l.startswith("---"))
    
    print(f"\n{'='*60}")
    print(f"  {label}")
    print(f"  Size: {len(orig)}B -> {len(opt)}B")
    print(f"  Lines added: {added}, Lines removed: {removed}")
    print(f"{'='*60}")
    
    # Print new sections (lines starting with ## that are new)
    orig_sections = set(l.strip() for l in orig_lines if l.strip().startswith("##"))
    opt_sections = set(l.strip() for l in opt_lines if l.strip().startswith("##"))
    new_sections = opt_sections - orig_sections
    if new_sections:
        print(f"\n  NEW SECTIONS ADDED:")
        for s in new_sections:
            print(f"    + {s}")
    
    removed_sections = orig_sections - opt_sections
    if removed_sections:
        print(f"\n  REMOVED SECTIONS:")
        for s in removed_sections:
            print(f"    - {s}")
    
    # Show key additions
    key_additions = []
    for i, line in enumerate(diff):
        if line.startswith("+") and not line.startswith("+++") and len(line) > 20:
            key_additions.append(line[1:].strip())
        elif line.startswith("-") and not line.startswith("---") and len(line) > 20:
            pass  # skipping removals for brevity
    
    # Show mid-section content (structural changes only)
    print(f"\n  KEY ADDITIONS (sample):")
    for a in key_additions[:10]:
        print(f"    + {a[:120]}")

show_diff("ram", "RAM & Memory System")
show_diff("instagram", "Instagram Integration")
show_diff("language_matching_skill", "Language Matching")
show_diff("short_response_controller", "Short Response Controller")
