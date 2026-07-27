import json, os

comp_dir = r"C:\Users\prarh\Downloads\BRAHMAND AI AGENT\skillopt\comparison"
for fname in sorted(os.listdir(comp_dir)):
    if not fname.endswith(".json"): continue
    with open(os.path.join(comp_dir, fname), encoding="utf-8") as f:
        d = json.load(f)
    
    print(f"\n{'='*60}")
    print(f"  {d['skill'].upper()}: BEFORE vs AFTER")
    print(f"{'='*60}")
    print(f"  Size: {d['original_size']}B -> {d['optimized_size']}B (+{d['optimized_size']-d['original_size']}B)")
    print(f"  Prompt: {d['prompt'][:100]}...")
    print(f"\n  --- BEFORE (original skill) ---")
    print(f"  {d['original_response'][:700]}")
    print(f"\n  --- AFTER (optimized skill) ---")
    print(f"  {d['optimized_response'][:700]}")
    print()
