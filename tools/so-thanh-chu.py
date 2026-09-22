# Đổi chữ số Ả Rập trong kịch bản thành chữ tiếng Việt để giọng đọc đúng nhịp ("12 triệu" → "mười hai triệu",
# "2,8" → "hai phẩy tám", "2025" → "hai nghìn không trăm hai mươi lăm"). Giữ nguyên [nguồn N].
# Dùng: python tools/so-thanh-chu.py <file.md>   (ghi đè, in số chỗ đã đổi)
import re, sys, io
DV = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"]

def doc(n):
    if n < 10: return DV[n]
    if n < 100:
        c, d = divmod(n, 10)
        s = "mười" if c == 1 else DV[c] + " mươi"
        if d: s += " " + ("mốt" if d == 1 and c > 1 else "lăm" if d == 5 else "tư" if d == 4 and c > 1 else DV[d])
        return s
    if n < 1000:
        t, du = divmod(n, 100)
        s = DV[t] + " trăm"
        if du: s += (" lẻ " + DV[du]) if du < 10 else " " + doc(du)
        return s
    if n < 1_000_000:
        ng, du = divmod(n, 1000)
        s = doc(ng) + " nghìn"
        if du:
            if du < 10: s += " không trăm lẻ " + DV[du]
            elif du < 100: s += " không trăm " + doc(du)
            else: s += " " + doc(du)
        return s
    tr, du = divmod(n, 1_000_000)
    s = doc(tr) + " triệu"
    if du: s += " " + (("không trăm " if du < 100 else "") + doc(du) if du >= 1000 or du >= 100 else "không trăm lẻ " + DV[du] if du < 10 else "không trăm " + doc(du)) if du < 1000 else " " + doc(du)
    return s

def thay(m):
    nguyen = m.group(1).replace(".", "")
    le = m.group(2)
    s = doc(int(nguyen))
    if le:
        p = le[1:]
        s += " phẩy " + (doc(int(p)) if not p.startswith("0") or len(p) == 1 else " ".join(DV[int(c)] for c in p))
    return s

def doi(chu):
    # không đụng [nguồn 12], không đụng số dính chữ (VssID, 3G), không đụng dòng tiêu đề "# " (tên mục lên slide giữ chữ số)
    mau = re.compile(r"(?<![\w\[\]])(?<!nguồn )(\d{1,3}(?:\.\d{3})+|\d+)(,\d+)?(?![\w\]])")
    ra, tong = [], 0
    for dong in chu.split("\n"):
        if dong.startswith("#"): ra.append(dong); continue
        d, n = mau.subn(thay, dong); ra.append(d); tong += n
    return "\n".join(ra), tong

if __name__ == "__main__":
    p = sys.argv[1]
    s = open(p, encoding="utf-8").read()
    ra, n = doi(s)
    open(p, "w", encoding="utf-8").write(ra)
    sys.stdout.buffer.write(f"đã đổi {n} chỗ\n".encode("utf-8"))
