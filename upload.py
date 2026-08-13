#!/usr/bin/env python3
import os
import sys
import socket

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

# Windows UTF-8 console output setup (to avoid UnicodeEncodeError for Vietnamese characters)
if sys.platform.startswith('win'):
    os.system('color')
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except AttributeError:
        pass # Python versions < 3.7

import urllib.request
import urllib.parse
import tempfile
import threading
import mimetypes
from pathlib import Path
import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError, EndpointConnectionError, NoCredentialsError
from dotenv import load_dotenv

# Define console color helper
class Color:
    GREEN = "\033[92m"
    YELLOW = "\033[93m"
    RED = "\033[91m"
    BLUE = "\033[94m"
    CYAN = "\033[96m"
    RESET = "\033[0m"
    BOLD = "\033[1m"

def print_info(msg):
    print(f"{Color.BLUE}[*]{Color.RESET} {msg}")

def print_success(msg):
    print(f"{Color.GREEN}[✓]{Color.RESET} {Color.BOLD}{msg}{Color.RESET}")

def print_warning(msg):
    print(f"{Color.YELLOW}[!]{Color.RESET} {msg}")

def print_error(msg):
    print(f"{Color.RED}[✗] LỖI:{Color.RESET} {msg}")

# Initialize configuration
ENV_FILE = "s3.env"
if not os.path.exists(ENV_FILE):
    print_warning(f"Không tìm thấy file cấu hình '{ENV_FILE}'. Đang kiểm tra .env mặc định...")
    ENV_FILE = ".env"

if os.path.exists(ENV_FILE):
    print_info(f"Đang tải cấu hình từ file '{ENV_FILE}'...")
    load_dotenv(dotenv_path=ENV_FILE)
else:
    print_warning("Không tìm thấy file s3.env hay .env. Sẽ sử dụng các biến môi trường hệ thống.")

AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID")
AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY")
AWS_REGION = os.getenv("AWS_REGION") or os.getenv("AWS_S3_REGION") or "ap-southeast-1"
S3_BUCKET = os.getenv("S3_BUCKET")
S3_PREFIX = os.getenv("S3_PREFIX", "Counting_Pigs/Pig_Counter/")
URL_EXPIRY = int(os.getenv("AWS_S3_URL_EXPIRY", "3600"))
CONNECT_TIMEOUT = int(os.getenv("AWS_S3_CONNECT_TIMEOUT", "10"))
READ_TIMEOUT = int(os.getenv("AWS_S3_READ_TIMEOUT", "60"))

# Validate configurations
missing_configs = []
if not AWS_ACCESS_KEY_ID: missing_configs.append("AWS_ACCESS_KEY_ID")
if not AWS_SECRET_ACCESS_KEY: missing_configs.append("AWS_SECRET_ACCESS_KEY")
if not S3_BUCKET: missing_configs.append("S3_BUCKET")

if missing_configs:
    print_error(f"Thiếu các cấu hình bắt buộc trong file .env/s3.env: {', '.join(missing_configs)}")
    print_info("Vui lòng cấu hình đầy đủ thông tin trong file s3.env trước khi chạy.")
    sys.exit(1)


def s3_endpoint_host():
    """Return the standard virtual-hosted S3 endpoint for this bucket/region."""
    if AWS_REGION == "us-east-1":
        return f"{S3_BUCKET}.s3.amazonaws.com"
    return f"{S3_BUCKET}.s3.{AWS_REGION}.amazonaws.com"


def print_network_help(host):
    print_warning("Không kết nối được tới endpoint S3.")
    print_info(f"Endpoint cần truy cập: https://{host}")
    print_info("Kiểm tra nhanh trên máy đang chạy script:")
    print("   - DNS/Internet: ping google.com hoặc nslookup amazonaws.com")
    print(f"   - DNS S3:       nslookup {host}")
    print("   - Proxy/VPN/firewall nếu mạng nội bộ đang chặn HTTPS ra ngoài")
    print("   - AWS_REGION trong s3.env phải đúng region của bucket")


def verify_s3_dns():
    """Fail early with a readable message when DNS cannot resolve the S3 host."""
    host = s3_endpoint_host()
    try:
        socket.getaddrinfo(host, 443, socket.AF_INET, socket.SOCK_STREAM)
    except socket.gaierror as exc:
        print_error(f"DNS không phân giải được host S3 '{host}': {exc}")
        print_network_help(host)
        sys.exit(1)
    return host


class ProgressPercentage(object):
    """Callback class to display upload progress to S3."""
    def __init__(self, filename):
        self._filename = filename
        self._size = float(os.path.getsize(filename))
        self._seen_so_far = 0
        self._lock = threading.Lock()

    def __call__(self, bytes_amount):
        with self._lock:
            self._seen_so_far += bytes_amount
            percentage = (self._seen_so_far / self._size) * 100
            sys.stdout.write(
                f"\r{Color.CYAN}[+]{Color.RESET} Đang tải lên S3: {percentage:.2f}% "
                f"({self._seen_so_far / (1024*1024):.2f}/{self._size / (1024*1024):.2f} MB)"
            )
            sys.stdout.flush()


def download_file(url):
    """Download file from a URL to a temporary local path."""
    print_info(f"Đang phân tích link video: {url}")
    parsed_url = urllib.parse.urlparse(url)
    filename = os.path.basename(parsed_url.path)
    
    # Clean the filename or fallback to video.mp4
    if not filename or '.' not in filename:
        filename = "downloaded_video.mp4"
    else:
        filename = urllib.parse.unquote(filename)
        
    temp_dir = tempfile.gettempdir()
    local_path = os.path.join(temp_dir, filename)
    
    print_info(f"Bắt đầu tải video về thư mục tạm: {local_path}")
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
    req = urllib.request.Request(url, headers=headers)
    
    try:
        with urllib.request.urlopen(req) as response:
            total_size = int(response.headers.get('content-length', 0))
            block_size = 1024 * 1024 # 1MB chunks
            downloaded = 0
            
            with open(local_path, 'wb') as f:
                while True:
                    buffer = response.read(block_size)
                    if not buffer:
                        break
                    f.write(buffer)
                    downloaded += len(buffer)
                    if total_size > 0:
                        percent = (downloaded / total_size) * 100
                        sys.stdout.write(
                            f"\r{Color.CYAN}[+]{Color.RESET} Đang tải video: {percent:.2f}% "
                            f"({downloaded / (1024*1024):.2f}/{total_size / (1024*1024):.2f} MB)"
                        )
                    else:
                        sys.stdout.write(
                            f"\r{Color.CYAN}[+]{Color.RESET} Đang tải video: {downloaded / (1024*1024):.2f} MB"
                        )
                    sys.stdout.flush()
            print() # Print new line after complete download
            print_success("Đã tải video về máy thành công.")
            return local_path, filename
    except Exception as e:
        print()
        print_error(f"Lỗi khi tải video từ link: {e}")
        sys.exit(1)


def upload_to_s3(local_path, original_filename):
    """Upload local file to AWS S3 and print link details."""
    # Ensure correct content-type
    content_type, _ = mimetypes.guess_type(local_path)
    extra_args = {}
    if content_type:
        extra_args['ContentType'] = content_type
        print_info(f"Xác định loại file (Content-Type): {content_type}")
    
    # Normalize prefix
    prefix = S3_PREFIX.replace("\\", "/").strip("/")
    s3_key = f"{prefix}/{original_filename}" if prefix else original_filename
    
    print_info(f"Cấu hình upload:")
    print(f"   - Bucket:  {Color.BOLD}{S3_BUCKET}{Color.RESET}")
    print(f"   - S3 Key:  {Color.BOLD}{s3_key}{Color.RESET}")
    print(f"   - Region:  {Color.BOLD}{AWS_REGION}{Color.RESET}")

    host = verify_s3_dns()

    s3_client = boto3.client(
        "s3",
        region_name=AWS_REGION,
        aws_access_key_id=AWS_ACCESS_KEY_ID,
        aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
        config=Config(
            connect_timeout=CONNECT_TIMEOUT,
            read_timeout=READ_TIMEOUT,
            retries={"max_attempts": 5, "mode": "standard"},
        ),
    )
    
    # Configure multipart upload behavior using TransferConfig
    from boto3.s3.transfer import TransferConfig
    max_workers = int(os.getenv("S3_MAX_UPLOAD_WORKERS", "8"))
    transfer_config = TransferConfig(
        multipart_threshold=8 * 1024 * 1024,  # 8MB threshold to trigger multipart
        max_concurrency=max_workers,         # number of parallel upload threads
        multipart_chunksize=8 * 1024 * 1024,  # size of each part (8MB)
        use_threads=True
    )
    
    try:
        s3_client.upload_file(
            local_path,
            S3_BUCKET,
            s3_key,
            ExtraArgs=extra_args,
            Config=transfer_config,
            Callback=ProgressPercentage(local_path)
        )
        print() # New line after uploader finishes
        print_success("Tải file lên S3 hoàn tất!")
        
        # Generate URLs
        # 1. Presigned URL (highly recommended for private buckets)
        presigned_url = s3_client.generate_presigned_url(
            'get_object',
            Params={'Bucket': S3_BUCKET, 'Key': s3_key},
            ExpiresIn=URL_EXPIRY
        )
        
        # 2. Public URL
        public_url = f"https://{S3_BUCKET}.s3.{AWS_REGION}.amazonaws.com/{s3_key}"
        
        print("\n" + "="*60)
        print(f"{Color.GREEN}{Color.BOLD}KẾT QUẢ UPLOAD THÀNH CÔNG:{Color.RESET}")
        print(f" - Public S3 URL (Chỉ hoạt động nếu bucket public):")
        print(f"   {Color.BLUE}{public_url}{Color.RESET}")
        print(f" - Presigned URL (Sử dụng được ngay, hết hạn sau {URL_EXPIRY} giây):")
        print(f"   {Color.YELLOW}{presigned_url}{Color.RESET}")
        print("="*60 + "\n")
        
        return public_url, presigned_url
    except FileNotFoundError:
        print_error(f"Không tìm thấy file nguồn: {local_path}")
        sys.exit(1)
    except NoCredentialsError:
        print_error("Không tìm thấy AWS Credentials hợp lệ. Vui lòng kiểm tra lại access/secret keys.")
        sys.exit(1)
    except EndpointConnectionError as e:
        print_error(f"Không thể kết nối tới S3 endpoint: {e}")
        print_network_help(host)
        sys.exit(1)
    except ClientError as e:
        print_error(f"Lỗi S3 client: {e}")
        sys.exit(1)
    except BotoCoreError as e:
        print_error(f"Lỗi kết nối/cấu hình AWS SDK: {e}")
        print_network_help(host)
        sys.exit(1)


def main():
    # Windows ANSI support setup
    if sys.platform.startswith('win'):
        os.system('color')
        
    print(f"{Color.BOLD}{Color.BLUE}=== CÔNG CỤ UPLOAD VIDEO LÊN AWS S3 ==={Color.RESET}\n")
    
    # Parse parameter
    if len(sys.argv) > 1:
        video_input = sys.argv[1]
    else:
        video_input = input("Nhập đường dẫn file local hoặc link video: ").strip()
        
    if not video_input:
        print_error("Đường dẫn video không được để trống!")
        sys.exit(1)
        
    is_url = video_input.lower().startswith(('http://', 'https://'))
    temp_path = None
    
    try:
        if is_url:
            local_path, filename = download_file(video_input)
            temp_path = local_path # Mark for cleanup
        else:
            local_path = os.path.abspath(video_input)
            filename = os.path.basename(local_path)
            if not os.path.exists(local_path):
                print_error(f"File local không tồn tại ở đường dẫn: {local_path}")
                sys.exit(1)
            print_info(f"Xử lý file local: {local_path}")
            
        # Upload
        upload_to_s3(local_path, filename)
        
    except KeyboardInterrupt:
        print("\n\n[-] Đã hủy thao tác bởi người dùng.")
    finally:
        # Cleanup temp file if downloaded
        if temp_path and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
                print_info("Đã dọn dẹp file tạm thời.")
            except Exception as e:
                print_warning(f"Không thể xóa file tạm {temp_path}: {e}")

if __name__ == "__main__":
    main()
