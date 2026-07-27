import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import yaml
from skillopt.config import load_config
from skillopt.engine import ReflACTTrainer
from skillopt.envs.marketing.adapter import MarketingAdapter

# Load flat config
cfg = load_config(r"C:\Users\prarh\Downloads\BRAHMAND AI AGENT\skillopt\configs\brahmand\default.yaml")

adapter = MarketingAdapter(
    split_dir=cfg.get("split_dir", ""),
    data_path=cfg.get("data_path", ""),
    split_mode=cfg.get("split_mode", "ratio"),
    split_ratio=cfg.get("split_ratio", "2:1:7"),
    split_seed=cfg.get("split_seed", 42),
    split_output_dir=cfg.get("split_output_dir", ""),
    max_turns=cfg.get("max_turns", 1),
    exec_timeout=cfg.get("exec_timeout", 120),
    workers=cfg.get("workers", 2),
    analyst_workers=cfg.get("analyst_workers", 2),
    failure_only=cfg.get("failure_only", False),
    minibatch_size=cfg.get("minibatch_size", 2),
    edit_budget=cfg.get("edit_budget", 2),
    seed=cfg.get("seed", 42),
    limit=cfg.get("limit", 0),
    max_completion_tokens=cfg.get("max_completion_tokens", 4096),
)

trainer = ReflACTTrainer(cfg, adapter)
summary = trainer.train()

print("Training complete.")
print(f"Best step: {summary.get('best_step')}")
print(f"Best score: {summary.get('best_score')}")
