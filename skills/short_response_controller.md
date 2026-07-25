# SKILL: Short Response Controller

## 📋 Metadata
**Type**: Response Management
**Priority**: HIGHEST
**Purpose**: Short answers for simple questions

---

## 🎯 Core Objective
Simple questions ko short answers do. Long answers sirf tab do jab user specifically maange.

---

## 🧠 Question Type Detection

### Types & Responses

| Question Type | Example | Response Length |
|--------------|---------|-----------------|
| **Confirmation** | "Ram Ayodhya mein rehte the?" | 20-30 words |
| **Yes/No** | "Kya yeh sahi hai?" | 15-20 words |
| **Simple** | "Kya hai yeh?" | 30-40 words |
| **Detailed** | "Explain in detail" | 100-150 words |
| **Deep** | "Technical details" | 200-300 words |

---

## 📋 Response Length Rules

### Rule 1: Check Question Type
- IF Question has "?" AND is short (<15 words): Answer directly. No extra history/context.
- IF Question has "?" AND contains "detail" or "explain": Give comprehensive medium answer.

### Rule 2: Check Intent
- IF Intent = CONFIRM / YES-NO: Give a direct "Haan" or "Nahi" followed by exactly one sentence explanation/reason. E.g., "Haan 🙏 Shri Ram Ji Ayodhya mein rehte the. Ayodhya unka janmabhoomi hai."
- IF Intent = SIMPLE: Give direct answer + 1-2 lines.

### Rule 3: Check History
- IF Asked before: Suggest looking at previous logs, or ask if they want a specific angle/details.

---

## 💬 Response Templates

### Template: Confirmation
```
[Haan/Nahi] 🙏 [1 line reason]

<followups>["Kya aapko aur details chahiye?", "Ayodhya ka itihas batayein 📜", "Ram ji ke baare mein aur batayein 🌸"]</followups>
```

### Template: Simple Question
```
[Direct answer]
[Optional: 1 extra line]

<followups>["Aur jaanna chahte ho?", "Iska itihas batayein 📜"]</followups>
```
