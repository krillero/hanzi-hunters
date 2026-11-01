#!/usr/bin/env python3
"""Read-only ID/duplicate check. Not a Mandarin correctness validator."""
import argparse
import json
from pathlib import Path

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('current_words', type=Path)
    parser.add_argument('candidates', type=Path)
    args = parser.parse_args()
    current = json.loads(args.current_words.read_text(encoding='utf-8'))
    candidates = json.loads(args.candidates.read_text(encoding='utf-8'))
    if not isinstance(current, list) or not isinstance(candidates, list):
        parser.error('Both input files must contain JSON arrays.')
    def identity(w):
        if not isinstance(w, dict) or not w.get('hanzi'):
            parser.error('Each entry needs a nonempty hanzi field.')
        return w.get('id') or w['hanzi']
    known = {identity(w) for w in current}
    forms = {w['hanzi'] for w in current}
    seen = set()
    rows = []
    for w in candidates:
        key = identity(w)
        rows.append({'id': key, 'hanzi': w['hanzi'],
                     'existingId': key in known,
                     'existingWrittenForm': w['hanzi'] in forms,
                     'repeatedCandidateId': key in seen})
        seen.add(key)
    print(json.dumps({'candidateCount': len(candidates),
                      'uniqueCandidateIds': len(seen), 'entries': rows},
                     ensure_ascii=False, indent=2))

if __name__ == '__main__':
    main()
