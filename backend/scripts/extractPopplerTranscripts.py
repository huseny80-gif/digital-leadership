"""Rebuild byte-hash-bound transcripts for born-digital Arabic lecture PDFs.

Usage: python extractPopplerTranscripts.py ORIGINAL.pdf [ORIGINAL.pdf ...] > transcripts.json
Requires poppler-utils (pdftotext) and pdfminer.six==20260107.

pdf-parse emits these Word-exported PDFs in a scrambled visual order, so
pdftotext supplies the reading order instead. Poppler reverses multi-character
glyph strings while reordering right-to-left lines, which turns every lam-alef
ligature ("لا", "لأ", "لإ", "لآ") into "ال"/"أل"/"إل"/"آل". A word is restored
only when the file's own glyph sequence (read by pdfminer, which keeps each
ligature's logical text) proves the corrected spelling. No OCR, dictionary,
model, summary or external text is used; unproven words are left unchanged.
"""
import collections
import hashlib
import itertools
import json
import re
import subprocess
import sys
import unicodedata

from pdfminer.high_level import extract_pages
from pdfminer.layout import LTChar, LTTextLine

METHOD = "poppler-ligature-verified-v1"
BIDI = re.compile("[‎‏‪-‮⁦-⁩﻿]")
MARKS = re.compile("[ً-ْٰـ]")
ARABIC_WORD = re.compile("[ء-يـً-ْٰ]+")
REVERSED = {"ال": "لا", "أل": "لأ", "إل": "لإ", "آل": "لآ", "ىل": "لى"}


def glyph_words(path):
    """Logical Arabic words as the PDF's glyphs spell them."""
    words = set()

    def tokens(line):
        token = []
        for item in line:
            text = unicodedata.normalize("NFKC", item.get_text()) if isinstance(item, LTChar) else ""
            if text and re.search("[؀-ۿ]", text):
                token.append(text)
                continue
            if token:
                yield token
            token = []
        if token:
            yield token

    def walk(item):
        if isinstance(item, LTTextLine):
            for token in tokens(item):
                # pdfminer lists glyphs left to right; each ligature's text is
                # already logical, so reverse the glyph list, not the string.
                for word in ARABIC_WORD.findall("".join(reversed(token))):
                    words.add(MARKS.sub("", word))
        elif hasattr(item, "__iter__"):
            for child in item:
                walk(child)

    for page in extract_pages(path):
        walk(page)
    return words


def certain_ligatures(word):
    """Orthographically certain cases need no glyph proof: Arabic never
    writes an alef form after a word-initial alef, never ends a word in
    alef maqsura followed by lam, and the article never stands alone."""
    word = re.sub("^(.?)ا([أإآا])ل", r"\1ال\2", word) if re.match("^[وفبكل]?ا[أإآا]ل", word) else word
    word = re.sub("ىل$", "لى", word)
    return "لا" if word == "ال" else word


def restore_ligatures(word, vocabulary):
    word = certain_ligatures(word)
    bare = MARKS.sub("", word)
    if bare in vocabulary:
        return word
    spots = [m.start() for m in re.finditer("(?=(ال|أل|إل|آل|ىل))", word)]
    if not spots or len(spots) > 6:
        return word
    proven = []
    for chosen in itertools.chain.from_iterable(itertools.combinations(spots, n) for n in range(1, len(spots) + 1)):
        if any(b - a < 2 for a, b in zip(chosen, chosen[1:])):
            continue
        letters = list(word)
        for start in chosen:
            pair = word[start:start + 2]
            letters[start:start + 2] = list(REVERSED[pair])
        candidate = "".join(letters)
        if MARKS.sub("", candidate) in vocabulary:
            proven.append(candidate)
    if len(set(proven)) == 1:
        return proven[0]
    return restore_pairs(word, vocabulary)


def restore_pairs(word, vocabulary):
    """Some fonts also map other two-letter ligatures (e.g. "تح", "لم", "ير")
    to one glyph, which poppler reverses the same way. Swap up to three
    non-overlapping adjacent letter pairs, and accept only a spelling that the
    file's own glyphs prove, when exactly one such spelling exists."""
    bare = MARKS.sub("", word)
    if bare != word or bare in vocabulary or len(bare) > 14:
        return word
    proven = set()
    for count in (1, 2, 3):
        for chosen in itertools.combinations(range(len(bare) - 1), count):
            if any(b - a < 2 for a, b in zip(chosen, chosen[1:])):
                continue
            letters = list(bare)
            for start in chosen:
                letters[start], letters[start + 1] = letters[start + 1], letters[start]
            candidate = "".join(letters)
            if candidate in vocabulary:
                proven.add(candidate)
        if proven:
            break
    return proven.pop() if len(proven) == 1 else word


def transcript(path):
    raw = subprocess.run(["pdftotext", "-enc", "UTF-8", path, "-"], capture_output=True, text=True, check=True).stdout
    vocabulary = glyph_words(path)
    pages = [[unicodedata.normalize("NFKC", BIDI.sub("", line)).strip() for line in page.split("\n")] for page in raw.split("\f")]
    # Detached vowel marks belong to no recoverable letter.
    pages = [[line for line in page if not re.fullmatch("[ً-ْٰ\\s]+", line)] for page in pages]
    # A line repeated on three or more pages (digits aside) is a running
    # header or footer, not lecture content; bare page numbers likewise.
    key = lambda line: re.sub("[0-9٠-٩]+", "#", line)
    repeated = collections.Counter(k for page in pages for k in {key(line) for line in page if line})
    blocks = []
    for page in pages:
        kept = [line for line in page if not (line and repeated[key(line)] >= 3 and len(line) < 120)
                and not re.fullmatch("[0-9٠-٩]{1,3}", line)]
        text = "\n".join(kept).strip()
        if text:
            blocks.append(text)
    text = "\n\n".join(blocks)
    text = ARABIC_WORD.sub(lambda m: restore_ligatures(m.group(0), vocabulary), text)
    # Right-to-left reordering moves sentence punctuation before the space.
    text = re.sub("(\\S) ([،؛:.؟!])(?=[؀-ۿ])", "\\1\\2 ", text)
    return re.sub("\n{3,}", "\n\n", text).strip()


if __name__ == "__main__":
    sources = []
    for path in sys.argv[1:]:
        data = open(path, "rb").read()
        text = transcript(path)
        sources.append({"sha256": hashlib.sha256(data).hexdigest(), "textSha256": hashlib.sha256(text.encode()).hexdigest(), "text": text, "method": METHOD})
    json.dump(sources, sys.stdout, ensure_ascii=False, indent=2)
