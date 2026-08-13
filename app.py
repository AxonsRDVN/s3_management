import json
import math
import mimetypes
import os
import posixpath
import tempfile
import threading
import time
import socket
import subprocess
import zipfile
from urllib.parse import quote
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

# Force Python's DNS resolver to use IPv4 and fall back to public DNS resolvers if name resolution fails
orig_getaddrinfo = socket.getaddrinfo

def dns_resolve_fallback(host):
    # Resolve using Google Public DNS (8.8.8.8) or Cloudflare DNS (1.1.1.1)
    for dns_server in ["8.8.8.8", "1.1.1.1"]:
        try:
            # Transaction ID
            packet = bytearray([0x12, 0x34])
            # Flags: standard query
            packet.extend([0x01, 0x00])
            # Questions: 1, Answer RRs: 0, Authority RRs: 0, Additional RRs: 0
            packet.extend([0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])
            
            # Name
            for part in host.split('.'):
                part_bytes = part.encode('ascii')
                packet.append(len(part_bytes))
                packet.extend(part_bytes)
            packet.append(0) # Terminate name
            
            # Type A (1), Class IN (1)
            packet.extend([0x00, 0x01, 0x00, 0x01])
            
            # Send UDP
            sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            sock.settimeout(2.0)
            sock.sendto(packet, (dns_server, 53))
            
            data, _ = sock.recvfrom(512)
            sock.close()
            
            # Parse response
            if len(data) < 12 or data[0:2] != b'\x12\x34':
                continue
            
            # Skip question section to find answer section
            idx = 12
            while idx < len(data):
                length = data[idx]
                if length == 0:
                    idx += 1
                    break
                idx += 1 + length
            
            # Skip QTYPE and QCLASS (4 bytes)
            idx += 4
            
            # Parse answers
            while idx < len(data):
                val = data[idx]
                if (val & 0xC0) == 0xC0:
                    idx += 2
                else:
                    while idx < len(data):
                        length = data[idx]
                        if length == 0:
                            idx += 1
                            break
                        idx += 1 + length
                
                if idx + 10 > len(data):
                    break
                
                rtype = int.from_bytes(data[idx:idx+2], byteorder='big')
                rclass = int.from_bytes(data[idx+2:idx+4], byteorder='big')
                rdlength = int.from_bytes(data[idx+8:idx+10], byteorder='big')
                idx += 10
                
                if idx + rdlength > len(data):
                    break
                
                rdata = data[idx:idx+rdlength]
                idx += rdlength
                
                if rtype == 1 and rclass == 1 and rdlength == 4:
                    return ".".join(str(b) for b in rdata)
        except Exception:
            pass
    return None

def getaddrinfo_ipv4(host, port, family=0, type=0, proto=0, flags=0):
    if family == socket.AF_UNSPEC or family == 0:
        family = socket.AF_INET
    try:
        return orig_getaddrinfo(host, port, family, type, proto, flags)
    except socket.gaierror as e:
        if host and any(c.isalpha() for c in host.replace('-', '').replace('.', '')):
            resolved_ip = dns_resolve_fallback(host)
            if resolved_ip:
                return orig_getaddrinfo(resolved_ip, port, family, type, proto, flags)
        raise e

socket.getaddrinfo = getaddrinfo_ipv4


import boto3
from botocore.exceptions import BotoCoreError, ClientError
from dotenv import load_dotenv
from flask import (
    Flask, Response, jsonify, render_template, request,
    send_file, stream_with_context,
)


load_dotenv()

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024 * 1024

PART_SIZE = 8 * 1024 * 1024
PROGRESS = {}
PROGRESS_LOCK = threading.Lock()
TRANSCODE_LOCK = threading.Lock()

VIDEO_EXTENSIONS = {
    ".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v", ".mpeg", ".mpg", ".3gp"
}


def set_upload_progress(progress_id, percent, stage, detail=None, done=False, error=False):
    if not progress_id:
        return

    payload = {
        "percent": max(0, min(100, int(percent))),
        "stage": stage,
        "detail": detail or "",
        "done": done,
        "error": error,
        "updated_at": time.time(),
    }
    with PROGRESS_LOCK:
        PROGRESS[progress_id] = payload


def get_upload_progress(progress_id):
    with PROGRESS_LOCK:
        return PROGRESS.get(progress_id)


def env(name, default=None):
    value = os.getenv(name)
    if value is None or value == "":
        return default
    return value


MAX_UPLOAD_WORKERS = int(env("S3_MAX_UPLOAD_WORKERS", "6"))


def get_s3_config():
    bucket = env("S3_BUCKET") or env("AWS_S3_BUCKET_NAME")
    region = env("AWS_REGION") or env("AWS_S3_REGION")

    if not bucket:
        raise RuntimeError("Missing S3_BUCKET or AWS_S3_BUCKET_NAME in .env")
    if not region:
        raise RuntimeError("Missing AWS_REGION or AWS_S3_REGION in .env")

    return {
        "bucket": bucket,
        "region": region,
        "prefix": env("S3_PREFIX", "Counting_Pigs/Pig_Counter/"),
        "url_expiry": int(env("AWS_S3_URL_EXPIRY", "3600")),
    }


def get_s3_client(region):
    return boto3.client(
        "s3",
        region_name=region,
        aws_access_key_id=env("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=env("AWS_SECRET_ACCESS_KEY"),
    )


def clean_prefix(prefix):
    normalized = (prefix or "").replace("\\", "/").strip("/")
    return f"{normalized}/" if normalized else ""


def safe_filename(filename):
    name = Path(filename or "upload.bin").name
    return name.replace("\\", "_").replace("/", "_")


def build_object_key(prefix, filename):
    safe_name = safe_filename(filename)
    return posixpath.join(clean_prefix(prefix), safe_name)


def make_presigned_url(s3_client, bucket, key, expires_in):
    return s3_client.generate_presigned_url(
        "get_object",
        Params={"Bucket": bucket, "Key": key},
        ExpiresIn=expires_in,
    )


def make_download_url(s3_client, bucket, key, expires_in):
    filename = safe_filename(posixpath.basename(key))
    ascii_filename = filename.encode("ascii", "ignore").decode("ascii") or "download"
    disposition = (
        f'attachment; filename="{ascii_filename.replace(chr(34), "_")}"; '
        f"filename*=UTF-8''{quote(filename)}"
    )
    return s3_client.generate_presigned_url(
        "get_object",
        Params={
            "Bucket": bucket,
            "Key": key,
            "ResponseContentDisposition": disposition,
        },
        ExpiresIn=expires_in,
    )


def is_video_key(key):
    return posixpath.splitext(key.lower())[1] in VIDEO_EXTENSIONS


def compatible_video_key(prefix, key):
    relative_key = key[len(prefix):] if key.startswith(prefix) else posixpath.basename(key)
    return posixpath.join(prefix, ".web-compatible", f"{relative_key}.mp4")


def find_cached_video(s3_client, config, key):
    prefix = clean_prefix(config["prefix"])
    source_head = s3_client.head_object(Bucket=config["bucket"], Key=key)
    source_etag = source_head.get("ETag", "").strip('"')
    output_key = compatible_video_key(prefix, key)
    try:
        output_head = s3_client.head_object(Bucket=config["bucket"], Key=output_key)
        if output_head.get("Metadata", {}).get("source-etag") == source_etag:
            return output_key, source_head
    except ClientError as exc:
        if exc.response.get("Error", {}).get("Code") not in ("404", "NoSuchKey", "NotFound"):
            raise
    return None, source_head


def probe_video(file_path):
    result = subprocess.run(
        [
            "ffprobe", "-v", "error", "-show_entries",
            "stream=codec_type,codec_name,pix_fmt:format=duration", "-of", "json", file_path,
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    streams = json.loads(result.stdout).get("streams", [])
    video_stream = next((item for item in streams if item.get("codec_type") == "video"), {})
    audio_stream = next((item for item in streams if item.get("codec_type") == "audio"), None)
    return {
        "video_codec": video_stream.get("codec_name"),
        "pixel_format": video_stream.get("pix_fmt"),
        "audio_codec": audio_stream.get("codec_name") if audio_stream else None,
        "duration": float(json.loads(result.stdout).get("format", {}).get("duration") or 0),
    }


def is_browser_compatible_video(probe):
    return (
        probe.get("video_codec") == "h264"
        and probe.get("pixel_format") == "yuv420p"
        and probe.get("audio_codec") in (None, "aac")
    )


def transcode_video(input_path, output_path, duration=0, progress_callback=None):
    command = [
        "ffmpeg", "-y", "-loglevel", "error", "-i", input_path,
        "-map", "0:v:0", "-map", "0:a?",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "fast",
        "-movflags", "+faststart", "-c:a", "aac", "-b:a", "128k",
    ]
    if progress_callback:
        command.extend(["-progress", "pipe:1", "-nostats"])
    command.append(output_path)

    process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if progress_callback:
        for line in process.stdout:
            key, _, value = line.strip().partition("=")
            if key in ("out_time_ms", "out_time_us") and duration > 0:
                seconds = int(value or 0) / 1_000_000
                progress_callback(min(1, seconds / duration))
    _, stderr = process.communicate()
    if process.returncode:
        raise subprocess.CalledProcessError(process.returncode, command, stderr=stderr)
    if progress_callback:
        progress_callback(1)


def transcode_s3_video(s3_client, config, key, progress_callback=None):
    prefix = clean_prefix(config["prefix"])
    cached_key, source_head = find_cached_video(s3_client, config, key)
    source_etag = source_head.get("ETag", "").strip('"')
    output_key = compatible_video_key(prefix, key)

    if cached_key:
        if progress_callback:
            progress_callback(1, "cached")
        return cached_key, "cached"

    with tempfile.TemporaryDirectory(prefix="s3-video-") as temp_dir:
        input_path = os.path.join(temp_dir, "input" + posixpath.splitext(key)[1])
        output_path = os.path.join(temp_dir, "web-compatible.mp4")
        source_size = max(1, source_head.get("ContentLength", 0))
        downloaded = [0]

        def download_progress(amount):
            downloaded[0] += amount
            if progress_callback:
                progress_callback(min(1, downloaded[0] / source_size), "download")

        s3_client.download_file(
            config["bucket"], key, input_path,
            Callback=download_progress,
        )
        media_info = probe_video(input_path)
        if is_browser_compatible_video(media_info):
            if progress_callback:
                progress_callback(1, "compatible")
            return key, "compatible"

        transcode_video(
            input_path, output_path, media_info["duration"],
            lambda value: progress_callback(value, "transcode") if progress_callback else None,
        )
        output_size = max(1, os.path.getsize(output_path))
        uploaded = [0]

        def upload_progress(amount):
            uploaded[0] += amount
            if progress_callback:
                progress_callback(min(1, uploaded[0] / output_size), "upload")

        s3_client.upload_file(
            output_path, config["bucket"], output_key,
            ExtraArgs={"ContentType": "video/mp4", "Metadata": {"source-etag": source_etag}},
            Callback=upload_progress,
        )
        return output_key, "converted"


def delete_s3_objects(s3_client, bucket, keys):
    if not keys:
        return 0

    deleted_count = 0
    for key in keys:
        s3_client.delete_object(Bucket=bucket, Key=key)
        deleted_count += 1

    return deleted_count


def safe_archive_name(prefix, key):
    relative_name = key[len(prefix):] if key.startswith(prefix) else posixpath.basename(key)
    parts = [part for part in relative_name.replace("\\", "/").split("/") if part not in ("", ".", "..")]
    return "/".join(parts) or safe_filename(posixpath.basename(key))


def upload_part_from_file(s3_client, bucket, key, upload_id, file_path, part_number, offset, size):
    with open(file_path, "rb") as source:
        source.seek(offset)
        chunk = source.read(size)

    response = s3_client.upload_part(
        Bucket=bucket,
        Key=key,
        PartNumber=part_number,
        UploadId=upload_id,
        Body=chunk,
    )
    return {"PartNumber": part_number, "ETag": response["ETag"]}


def multipart_upload_file(s3_client, bucket, key, file_path, content_type=None, progress_id=None):
    extra_args = {}
    if content_type:
        extra_args["ContentType"] = content_type

    create_kwargs = {"Bucket": bucket, "Key": key}
    create_kwargs.update(extra_args)

    set_upload_progress(progress_id, 20, "Dang tao multipart upload tren S3")
    multipart = s3_client.create_multipart_upload(**create_kwargs)
    upload_id = multipart["UploadId"]
    parts = []

    try:
        file_size = os.path.getsize(file_path)
        total_parts = max(1, math.ceil(file_size / PART_SIZE))

        if file_size == 0:
            response = s3_client.upload_part(
                Bucket=bucket,
                Key=key,
                PartNumber=1,
                UploadId=upload_id,
                Body=b"",
            )
            parts.append({"PartNumber": 1, "ETag": response["ETag"]})
            set_upload_progress(progress_id, 90, "Da upload part rong len S3", "Part 1/1")
        else:
            workers = max(1, min(MAX_UPLOAD_WORKERS, total_parts))
            completed_parts = 0
            set_upload_progress(
                progress_id,
                20,
                "Dang upload song song cac part len S3",
                f"0/{total_parts} part, {workers} luong",
            )

            with ThreadPoolExecutor(max_workers=workers) as executor:
                futures = []
                for part_number in range(1, total_parts + 1):
                    offset = (part_number - 1) * PART_SIZE
                    size = min(PART_SIZE, file_size - offset)
                    futures.append(
                        executor.submit(
                            upload_part_from_file,
                            s3_client,
                            bucket,
                            key,
                            upload_id,
                            file_path,
                            part_number,
                            offset,
                            size,
                        )
                    )

                for future in as_completed(futures):
                    parts.append(future.result())
                    completed_parts += 1
                    percent = 20 + math.floor((completed_parts / total_parts) * 70)
                    set_upload_progress(
                        progress_id,
                        percent,
                        "Dang upload song song cac part len S3",
                        f"{completed_parts}/{total_parts} part, {workers} luong",
                    )

            parts.sort(key=lambda part: part["PartNumber"])

        set_upload_progress(progress_id, 95, "Dang hoan tat multipart upload")
        s3_client.complete_multipart_upload(
            Bucket=bucket,
            Key=key,
            UploadId=upload_id,
            MultipartUpload={"Parts": parts},
        )
        return {"parts": len(parts), "total_parts": total_parts}
    except Exception:
        s3_client.abort_multipart_upload(Bucket=bucket, Key=key, UploadId=upload_id)
        raise


@app.get("/")
def index():
    return render_template("index.html")


@app.post("/upload")
def upload():
    progress_id = request.form.get("progress_id")
    uploaded_file = request.files.get("file")
    if uploaded_file is None or uploaded_file.filename == "":
        return jsonify({"ok": False, "message": "Vui lòng chọn file để upload."}), 400

    temp_path = None
    try:
        set_upload_progress(progress_id, 15, "Da nhan file, dang chuan bi upload")
        config = get_s3_config()
        s3_client = get_s3_client(config["region"])

        suffix = Path(uploaded_file.filename).suffix
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
            temp_path = temp_file.name
            uploaded_file.save(temp_file)

        content_type = uploaded_file.mimetype
        if not content_type:
            content_type = mimetypes.guess_type(uploaded_file.filename)[0]

        key = build_object_key(config["prefix"], uploaded_file.filename)
        result = multipart_upload_file(
            s3_client=s3_client,
            bucket=config["bucket"],
            key=key,
            file_path=temp_path,
            content_type=content_type,
            progress_id=progress_id,
        )

        presigned_url = make_presigned_url(s3_client, config["bucket"], key, config["url_expiry"])

        set_upload_progress(
            progress_id,
            100,
            "Upload hoan tat",
            f"{result['parts']} part",
            done=True,
        )

        return jsonify(
            {
                "ok": True,
                "bucket": config["bucket"],
                "key": key,
                "region": config["region"],
                "parts": result["parts"],
                "url": presigned_url,
            }
        )
    except (RuntimeError, BotoCoreError, ClientError) as exc:
        set_upload_progress(progress_id, 100, "Upload loi", str(exc), done=True, error=True)
        return jsonify({"ok": False, "message": str(exc)}), 500
    finally:
        if temp_path and os.path.exists(temp_path):
            os.unlink(temp_path)


@app.get("/files")
def list_files():
    try:
        config = get_s3_config()
        s3_client = get_s3_client(config["region"])
        prefix = clean_prefix(config["prefix"])
        files = []
        continuation_token = None

        while True:
            params = {
                "Bucket": config["bucket"],
                "Prefix": prefix,
                "MaxKeys": 1000,
            }
            if continuation_token:
                params["ContinuationToken"] = continuation_token

            response = s3_client.list_objects_v2(**params)
            for item in response.get("Contents", []):
                key = item["Key"]
                if key.endswith("/") or key.startswith(f"{prefix}.web-compatible/"):
                    continue

                files.append(
                    {
                        "key": key,
                        "name": key[len(prefix) :] if key.startswith(prefix) else key,
                        "size": item.get("Size", 0),
                        "last_modified": item["LastModified"].isoformat(),
                        "url": make_presigned_url(
                            s3_client,
                            config["bucket"],
                            key,
                            config["url_expiry"],
                        ),
                    }
                )

            if not response.get("IsTruncated"):
                break
            continuation_token = response.get("NextContinuationToken")

        files.sort(key=lambda item: item["last_modified"], reverse=True)
        return jsonify({"ok": True, "bucket": config["bucket"], "prefix": prefix, "files": files})
    except (RuntimeError, BotoCoreError, ClientError) as exc:
        return jsonify({"ok": False, "message": str(exc)}), 500


@app.get("/play")
def play_file():
    key = request.args.get("key", "").strip()
    try:
        config = get_s3_config()
        prefix = clean_prefix(config["prefix"])
        if not key or not key.startswith(prefix) or key.endswith("/"):
            return jsonify({"ok": False, "message": "Key khong hop le hoac nam ngoai prefix."}), 400

        s3_client = get_s3_client(config["region"])
        if not is_video_key(key):
            return app.redirect(make_presigned_url(
                s3_client, config["bucket"], key, config["url_expiry"]
            ))

        cached_key, _ = find_cached_video(s3_client, config, key)
        if cached_key:
            return app.redirect(make_presigned_url(
                s3_client, config["bucket"], cached_key, config["url_expiry"]
            ))

        with TRANSCODE_LOCK:
            output_key, _ = transcode_s3_video(s3_client, config, key)

        return app.redirect(make_presigned_url(
            s3_client, config["bucket"], output_key, config["url_expiry"]
        ))
    except subprocess.CalledProcessError as exc:
        detail = (exc.stderr or str(exc))[-1500:]
        return jsonify({"ok": False, "message": "FFmpeg khong the chuyen codec video.", "detail": detail}), 500
    except (OSError, ValueError, RuntimeError, BotoCoreError, ClientError) as exc:
        return jsonify({"ok": False, "message": str(exc)}), 500


def run_batch_transcode(progress_id, keys):
    completed = 0
    failed = []
    total = len(keys)
    try:
        config = get_s3_config()
        s3_client = get_s3_client(config["region"])
        stage_ranges = {"download": (0, 10), "transcode": (10, 85), "upload": (85, 100)}

        for index, key in enumerate(keys):
            name = posixpath.basename(key)

            def report(value, stage):
                start, end = stage_ranges.get(stage, (0, 100))
                file_percent = start + value * (end - start)
                total_percent = ((index + file_percent / 100) / total) * 100
                labels = {
                    "download": "Dang tai video tu S3",
                    "transcode": "Dang chuyen sang H.264",
                    "upload": "Dang tai ban H.264 len S3",
                    "cached": "Da co ban H.264",
                    "compatible": "Video da tuong thich trinh duyet",
                }
                set_upload_progress(
                    progress_id, total_percent, labels.get(stage, "Dang xu ly video"),
                    f"{index + 1}/{total}: {name}",
                )

            try:
                with TRANSCODE_LOCK:
                    transcode_s3_video(s3_client, config, key, report)
                completed += 1
            except Exception as exc:
                message = getattr(exc, "stderr", None) or str(exc) or repr(exc)
                failed.append({"key": key, "message": message[-1000:]})

        with PROGRESS_LOCK:
            PROGRESS[progress_id] = {
                "percent": 100, "stage": "Chuyen doi hoan tat",
                "detail": f"Thanh cong {completed}/{total}, loi {len(failed)}",
                "done": True, "error": bool(failed), "updated_at": time.time(),
                "completed": completed, "failed": failed, "total": total,
            }
    except Exception as exc:
        set_upload_progress(progress_id, 100, "Chuyen doi that bai", str(exc), done=True, error=True)


@app.post("/transcode-multiple")
def transcode_multiple_files():
    payload = request.get_json(silent=True) or {}
    progress_id = str(payload.get("progress_id", "")).strip()
    keys = list(dict.fromkeys(payload.get("keys") or []))
    try:
        config = get_s3_config()
        prefix = clean_prefix(config["prefix"])
        if not progress_id:
            return jsonify({"ok": False, "message": "Thieu ma tien trinh."}), 400
        if not keys or any(not isinstance(key, str) or not key.startswith(prefix) or not is_video_key(key) for key in keys):
            return jsonify({"ok": False, "message": "Chi duoc chon cac video hop le trong prefix."}), 400

        set_upload_progress(progress_id, 0, "Dang cho chuyen doi", f"0/{len(keys)} video")
        threading.Thread(target=run_batch_transcode, args=(progress_id, keys), daemon=True).start()
        return jsonify({"ok": True, "progress_id": progress_id, "total": len(keys)}), 202
    except RuntimeError as exc:
        return jsonify({"ok": False, "message": str(exc)}), 500


@app.get("/download")
def download_file():
    key = request.args.get("key", "").strip()

    try:
        config = get_s3_config()
        prefix = clean_prefix(config["prefix"])
        if not key or not key.startswith(prefix) or key.endswith("/"):
            return jsonify({"ok": False, "message": "Key khong hop le hoac nam ngoai prefix."}), 400

        s3_client = get_s3_client(config["region"])
        download_url = make_download_url(
            s3_client,
            config["bucket"],
            key,
            config["url_expiry"],
        )
        return app.redirect(download_url)
    except (RuntimeError, BotoCoreError, ClientError) as exc:
        return jsonify({"ok": False, "message": str(exc)}), 500


@app.post("/download-multiple")
def download_multiple_files():
    keys = [key.strip() for key in request.form.getlist("keys") if key.strip()]
    zip_path = None
    try:
        config = get_s3_config()
        prefix = clean_prefix(config["prefix"])
        if not keys:
            return jsonify({"ok": False, "message": "Vui long chon it nhat mot file."}), 400
        if any(not key.startswith(prefix) or key.endswith("/") for key in keys):
            return jsonify({"ok": False, "message": "Co key khong hop le hoac nam ngoai prefix."}), 400

        s3_client = get_s3_client(config["region"])
        with tempfile.NamedTemporaryFile(delete=False, suffix=".zip") as temp_zip:
            zip_path = temp_zip.name

        with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_STORED, allowZip64=True) as archive:
            for key in dict.fromkeys(keys):
                archive_name = safe_archive_name(prefix, key)
                with archive.open(archive_name, "w", force_zip64=True) as target:
                    s3_client.download_fileobj(config["bucket"], key, target)

        def remove_temporary_zip():
            try:
                os.unlink(zip_path)
            except OSError:
                pass

        timestamp = time.strftime("%Y%m%d-%H%M%S")
        response = send_file(
            zip_path,
            mimetype="application/zip",
            as_attachment=True,
            download_name=f"s3-files-{timestamp}.zip",
        )
        response.call_on_close(remove_temporary_zip)
        return response
    except (RuntimeError, BotoCoreError, ClientError, OSError, zipfile.BadZipFile) as exc:
        if zip_path and os.path.exists(zip_path):
            os.unlink(zip_path)
        return jsonify({"ok": False, "message": str(exc)}), 500


@app.delete("/files")
def delete_file():
    payload = request.get_json(silent=True) or {}
    key = payload.get("key", "")
    keys = payload.get("keys") or []

    if isinstance(keys, str):
        keys = [keys]

    if key and not keys:
        keys = [key]

    try:
        config = get_s3_config()
        prefix = clean_prefix(config["prefix"])
        normalized_keys = [str(item) for item in keys if isinstance(item, str) and str(item).strip()]
        if not normalized_keys:
            return jsonify({"ok": False, "message": "Khong co file nao de xoa."}), 400

        invalid_keys = [item for item in normalized_keys if not item.startswith(prefix)]
        if invalid_keys:
            return jsonify({"ok": False, "message": "Key khong hop le hoac nam ngoai prefix."}), 400

        s3_client = get_s3_client(config["region"])
        deleted_count = delete_s3_objects(s3_client, config["bucket"], normalized_keys)
        return jsonify({"ok": True, "deleted": deleted_count, "keys": normalized_keys})
    except (RuntimeError, BotoCoreError, ClientError) as exc:
        return jsonify({"ok": False, "message": str(exc)}), 500


@app.get("/progress/<progress_id>")
def progress(progress_id):
    @stream_with_context
    def events():
        last_payload = None
        while True:
            payload = get_upload_progress(progress_id) or {
                "percent": 0,
                "stage": "Dang cho file",
                "detail": "",
                "done": False,
                "error": False,
            }

            serialized = json.dumps(payload, ensure_ascii=False)
            if serialized != last_payload:
                yield f"data: {serialized}\n\n"
                last_payload = serialized

            if payload.get("done"):
                break

            time.sleep(0.4)

    return Response(events(), mimetype="text/event-stream")


@app.get("/health")
def health():
    return jsonify({"ok": True})


if __name__ == "__main__":
    debug = env("FLASK_DEBUG", "0") == "1"
    app.run(host="0.0.0.0", port=int(env("PORT", "5000")), debug=debug)
