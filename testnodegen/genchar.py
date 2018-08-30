import sys, json, random
def DoJob(f):
    o = {} 
    style_table = [ {'color': '#B5B7C9', 'size': '14px'},  {'color': '#8B91AD', 'size': '20px'}, {'color': '#4E516B', 'size': '24px'}, {'color': '#2E3347', 'size': '27px'}, {'color': '#925D78', 'size': '30px'}, {'color': '#F1C5B5', 'size': '34px'}];
    o['style_table'] = style_table 
    entries = []
    o['entries'] = entries
    for i in range(0x4e00, 0x9fff + 1):
        char = unichr(i)
        entry = {}
        entry['char'] = char
        entry['color'] = random.randint(0, len(style_table) - 1)
        entries.append(entry)
    f.write(json.dumps(o))
        


def main():
   DoJob(sys.stdout) 

if __name__ == '__main__':
    main()
