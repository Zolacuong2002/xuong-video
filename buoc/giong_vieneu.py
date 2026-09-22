# Đọc giọng bằng VieNeu-TTS v3 Turbo (CPU, nhân bản giọng từ mẫu 3–8 giây, Apache 2.0).
# Node gọi MỘT tiến trình cho cả video: nạp model + mẫu giọng đúng một lần (~80s),
# rồi đọc lần lượt từng đoạn. Đoạn nào đã có file wav thì BỎ QUA — đứt giữa chừng
# chạy lại không mất phần đã xong (bước này dài cỡ 70 phút cho video 30 phút).
#
# Vào  : đường dẫn file JSON  { "mau": "...wav", "nhiet": 0.8, "nhanh": 1.08, "ffmpeg": "ffmpeg",
#                                "doan": [{"text": "...", "out": "...wav"}, ...] }
#        nhanh > 1 → tăng tốc bằng ffmpeg atempo (giữ cao độ) ngay sau khi đọc từng đoạn
# Ra   : mỗi dòng stdout là một JSON  {"loai": "..."}  để Node đọc tiến độ.
import json
import subprocess
import sys
import time
import os

os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")


def bao(**kw):
    print(json.dumps(kw, ensure_ascii=False), flush=True)


def main():
    with open(sys.argv[1], encoding="utf-8") as f:
        job = json.load(f)

    t0 = time.time()
    from vieneu import Vieneu
    import soundfile as sf

    tts = Vieneu()
    tts.add_voice("kenh", ref_audio=job["mau"], denoise=True)
    bao(loai="san_sang", giay_nap=round(time.time() - t0, 1))

    doan = job["doan"]
    nhiet = float(job.get("nhiet", 0.8))
    nhanh = float(job.get("nhanh", 1.0) or 1.0)
    ffmpeg = job.get("ffmpeg") or "ffmpeg"
    tong_am = 0.0
    tong_xu_ly = 0.0
    for i, d in enumerate(doan, 1):
        out = d["out"]
        if os.path.exists(out) and os.path.getsize(out) > 1000:
            bao(loai="bo_qua", i=i, tong=len(doan))
            continue
        t1 = time.time()
        try:
            wav = tts.infer(text=d["text"], voice="kenh", temperature=nhiet)
            tam = out + ".tam.wav"
            tts.save(wav, tam)
            if abs(nhanh - 1.0) > 0.005:
                tam2 = out + ".tam2.wav"
                subprocess.run([ffmpeg, "-y", "-loglevel", "error", "-i", tam, "-af", f"atempo={nhanh:.3f}", tam2], check=True)
                os.replace(tam2, tam)
            os.replace(tam, out)  # ghi xong mới đổi tên → không bao giờ để lại file wav dở
        except Exception as e:  # một đoạn hỏng không được giết cả video
            bao(loai="loi_doan", i=i, tong=len(doan), loi=f"{type(e).__name__}: {e}"[:300])
            continue
        dt = time.time() - t1
        dur = sf.info(out).duration
        tong_am += dur
        tong_xu_ly += dt
        bao(loai="xong_doan", i=i, tong=len(doan), giay=round(dur, 2),
            rtf=round(dt / dur, 2) if dur else None)

    bao(loai="het", giay_am=round(tong_am, 1), giay_xu_ly=round(tong_xu_ly, 1),
        rtf=round(tong_xu_ly / tong_am, 2) if tong_am else None)


if __name__ == "__main__":
    main()
