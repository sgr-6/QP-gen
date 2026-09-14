import json

with open('/home/sgr/.gemini/antigravity/brain/50f770b5-d7df-42f6-bdef-aa84eecedf34/.system_generated/logs/transcript_full.jsonl', 'r') as f:
    for line in f:
        data = json.loads(line)
        if data.get('type') == 'USER_INPUT' and 'MASTER PROMPT' in data.get('content', ''):
            print(data['content'])
            break
