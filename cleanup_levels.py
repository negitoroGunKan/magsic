import json
import os

list_path = r'c:\Users\junki\test-ts\songs\list.json'
root_dir = r'c:\Users\junki\test-ts\songs'

auto_levels = [5, 10, 15, 18, 21]

with open(list_path, 'r', encoding='utf-8') as f:
    songs = json.load(f)

for song in songs:
    folder = song.get('folder')
    charts = song.get('charts', {})
    
    for key, filename in charts.items():
        chart_path = os.path.join(root_dir, folder, filename)
        if not os.path.exists(chart_path):
            continue
            
        try:
            with open(chart_path, 'r', encoding='utf-8-sig') as f:
                data = json.load(f)
            
            # Remove level if it's one of the auto-assigned ones
            # AND difficulty is NOT explicitly et (which I manually updated for some)
            # Actually, the user says "勝手になってたり" (auto-assigned), 
            # so I'll remove it if it's in our auto_levels list.
            if 'level' in data and data['level'] in auto_levels:
                # Keep it if it's Poison AND OR Affection ET 6k (which I know I manually set to 19, wait 19 is not in auto_levels)
                # Let's just remove it if it's in auto_levels.
                print(f"Removing auto-level {data['level']} from {filename}")
                del data['level']
                
                with open(chart_path, 'w', encoding='utf-8') as f:
                    json.dump(data, f, indent=2, ensure_ascii=False)
            
        except Exception as e:
            print(f"Error processing {filename}: {e}")
