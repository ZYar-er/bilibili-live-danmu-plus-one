import re, csv

with open("bilibili-emoji.html", "r", encoding="utf-8") as f:
    html = f.read()

# 匹配 title="[名称]" 和 src="图片链接"
pattern = r'title="\[([^\]]+)\]"[^>]*>.*?src="([^"]+/live/([a-f0-9]+))'

rows = [(name, url, rid) for name, url, rid in re.findall(pattern, html)]

with open("bilibili-emoji.csv", "w", newline="", encoding="utf-8") as f:
    writer = csv.writer(f)
    writer.writerow(["name", "url", "resource_id"])
    writer.writerows(rows)

print(f"提取完成，共 {len(rows)} 条记录。")