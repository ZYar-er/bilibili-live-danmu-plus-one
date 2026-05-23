import csv
import re
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent

with open(BASE_DIR / "bilibili-emoji.html", "r", encoding="utf-8") as f:
    html = f.read()

# 匹配 title="[名称]" 和 src="图片链接"
pattern = r'title="\[([^\]]+)\]"[^>]*>.*?src="([^"]+/live/([a-f0-9]+))'

# 先按 HTML 出现顺序构建 resource_id 序列，再写出 CSV。
# 这样后续生成的映射文件也会保持稳定的插入顺序。
rows = []
seen_resource_ids = set()
for name, url, rid in re.findall(pattern, html):
    if rid in seen_resource_ids:
        continue
    seen_resource_ids.add(rid)
    rows.append((name, url, rid))

rows.sort(key=lambda row: row[2])

with open(BASE_DIR / "bilibili-emoji.csv", "w", newline="", encoding="utf-8") as f:
    writer = csv.writer(f)
    writer.writerow(["name", "url", "resource_id"])
    writer.writerows(rows)

print(f"提取完成，共 {len(rows)} 条记录。")